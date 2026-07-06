import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlatformCapture, CaptureOptions, CaptureResult } from "./types.js";

/**
 * PowerShell 截图脚本。通过 -File 执行，避免命令行转义问题。
 * 参数：$Mode (window|region|full), $Title, $OutPath, $X, $Y, $W, $H
 * 输出：一行 JSON 到 stdout：{ ok, width?, height?, error?, found? }
 */
const PS_SCRIPT = `
param([string]$Mode, [string]$Title, [string]$OutPath, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$SimX1, [int]$SimX2, [int]$SimY1, [int]$SimY2)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing,System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

function Out-Json($obj) { Write-Output ($obj | ConvertTo-Json -Compress) }

try {
  $rect = $null
  if ($Mode -eq 'full') {
    $sb = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $rect = New-Object System.Drawing.Rectangle($sb.X, $sb.Y, $sb.Width, $sb.Height)
  } elseif ($Mode -eq 'region') {
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
  } else {
    # $Title may contain multiple keywords separated by |; match any (case-insensitive via regex)
    $escaped = ($Title.Split('|') | Where-Object { $_ } | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $proc = Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -match $escaped } |
      Select-Object -First 1
    if (-not $proc -or $proc.MainWindowHandle -eq [IntPtr]::Zero) {
      Out-Json @{ ok=$false; error='WINDOW_NOT_FOUND' }
      exit 0
    }
    $r = New-Object WinApi+RECT
    [void][WinApi]::GetWindowRect($proc.MainWindowHandle, [ref]$r)
    $rect = New-Object System.Drawing.Rectangle($r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top))
    # simulator 模式：按百分比把窗口 rect 收窄成模拟器子区域
    if ($SimX2 -gt $SimX1 -and $SimY2 -gt $SimY1) {
      $nx = $rect.X + [int]($rect.Width * $SimX1 / 100)
      $ny = $rect.Y + [int]($rect.Height * $SimY1 / 100)
      $nw = [int]($rect.Width * ($SimX2 - $SimX1) / 100)
      $nh = [int]($rect.Height * ($SimY2 - $SimY1) / 100)
      $rect = New-Object System.Drawing.Rectangle($nx, $ny, $nw, $nh)
    }
  }

  if ($rect.Width -le 0 -or $rect.Height -le 0) {
    Out-Json @{ ok=$false; error='INVALID_RECT'; width=$rect.Width; height=$rect.Height }
    exit 0
  }

  $bmp = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($rect.X, $rect.Y, 0, 0, $bmp.Size)
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()

  $warning = $null
  if ($rect.Width -lt 50 -or $rect.Height -lt 50) { $warning = 'captured area is very small; window may be minimized or occluded' }
  Out-Json @{ ok=$true; width=$rect.Width; height=$rect.Height; warning=$warning }
} catch {
  Out-Json @{ ok=$false; error=$_.Exception.Message }
}
`;

function runPowerShell(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    child.on("error", () =>
      resolve({ stdout, stderr: "failed to spawn powershell.exe", code: -1 })
    );
  });
}

export function createWin32Capture(): PlatformCapture {
  return {
    mode: "windows",
    async capture(opts: CaptureOptions, outPath: string): Promise<CaptureResult> {
      const scriptPath = join(tmpdir(), `mcp-screenshot-${Date.now()}.ps1`);
      // 写 UTF-8 BOM，确保 PowerShell（默认按系统 ANSI 解码）正确识别 UTF-8
      writeFileSync(scriptPath, "\uFEFF" + PS_SCRIPT, "utf8");

      const title = opts.titleKeywords.length > 0 ? opts.titleKeywords.join("|") : "微信开发者工具";
      const args = ["-File", scriptPath, "-Mode", opts.scope, "-Title", title, "-OutPath", outPath];
      if (opts.region) {
        args.push(
          "-X", String(opts.region.x),
          "-Y", String(opts.region.y),
          "-W", String(opts.region.w),
          "-H", String(opts.region.h)
        );
      }
      // simulator 模式：传 4 个百分比给 PS，由 PS 在拿到窗口 rect 后收窄
      if (opts.simulatorRect) {
        args.push(
          "-SimX1", String(opts.simulatorRect.x1),
          "-SimX2", String(opts.simulatorRect.x2),
          "-SimY1", String(opts.simulatorRect.y1),
          "-SimY2", String(opts.simulatorRect.y2)
        );
      }

      const { stdout, code } = await runPowerShell(args);

      try {
        if (existsSync(scriptPath)) unlinkSync(scriptPath);
      } catch {
        /* ignore */
      }

      let parsed: { ok?: boolean; width?: number; height?: number; error?: string; warning?: string } = {};
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        parsed = JSON.parse(lines[lines.length - 1]);
      } catch {
        return {
          ok: false,
          mode: "windows",
          error: `failed to parse powershell output (code=${code}): ${stdout.slice(0, 200)}`,
          hint: "Try scope=full as a fallback, or check that powershell.exe is available.",
        };
      }

      if (!parsed.ok) {
        if (parsed.error === "WINDOW_NOT_FOUND") {
          return {
            ok: false,
            mode: "windows",
            error: `no window with title matching any of: ${title.split("|").join(", ")}`,
            hint: 'Open WeChat devtools and keep its window visible, or use scope="full".',
          };
        }
        return {
          ok: false,
          mode: "windows",
          error: parsed.error ?? `unknown error (code=${code})`,
          hint: 'Try scope="full" as a fallback.',
        };
      }

      return {
        ok: true,
        mode: "windows",
        path: outPath,
        width: parsed.width ?? 0,
        height: parsed.height ?? 0,
        warning: parsed.warning ?? undefined,
      };
    },
  };
}
