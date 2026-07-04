import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import type { PlatformCapture, CaptureOptions, CaptureResult } from "./types.js";

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    child.on("error", () => resolve({ stdout, stderr: `failed to spawn ${cmd}`, code: -1 }));
  });
}

/** 用 AppleScript 找包含 titleKey 的窗口 id（CGWindowID）。找不到返回 0。 */
async function findWindowId(titleKey: string): Promise<number> {
  // 枚举所有窗口，按标题/owner 子串匹配（大小写不敏感）
  const escaped = titleKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
use framework "AppKit"
set results to {}
set winList to current application's CGWindowListCopyWindowInfo(current application's kCGWindowListOptionOnScreenOnly, 0) as list
repeat with w in winList
  try
    set t to (w's objectForKey:"kCGWindowName") as text
    set o to (w's objectForKey:"kCGWindowOwnerName") as text
    if t contains "${escaped}" or o contains "${escaped}" then
      set end of results to (w's objectForKey:"kCGWindowNumber") as integer
    end if
  end try
end repeat
set AppleScript's text item delimiters to ","
return results as text
`;
  const { stdout, code } = await run("osascript", ["-e", script]);
  if (code !== 0) return 0;
  const ids = stdout.trim().split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  return ids[0] ?? 0;
}

export function createDarwinCapture(): PlatformCapture {
  return {
    mode: "darwin",
    async capture(opts: CaptureOptions, outPath: string): Promise<CaptureResult> {
      let args: string[];

      if (opts.scope === "full") {
        args = ["-x", outPath]; // -x 静音（不发声）
      } else if (opts.scope === "region" && opts.region) {
        const { x, y, w, h } = opts.region;
        args = ["-x", "-R", `${x},${y},${w},${h}`, outPath];
      } else {
        // window
        const titleKey = opts.titleKeywords[0] ?? "wechat";
        const wid = await findWindowId(titleKey);
        if (wid === 0) {
          return {
            ok: false,
            mode: "darwin",
            error: `no window with title/owner containing "${titleKey}"`,
            hint: 'Open WeChat devtools, or use scope="full".',
          };
        }
        args = ["-x", "-l", String(wid), outPath];
      }

      const { code, stderr } = await run("screencapture", args);

      if (code !== 0) {
        return {
          ok: false,
          mode: "darwin",
          error: `screencapture exited ${code}: ${stderr.slice(0, 200)}`,
          hint: 'Check screen-recording permission in System Settings > Privacy. Or try scope="full".',
        };
      }

      // 验证文件存在且非空
      try {
        const st = statSync(outPath);
        return {
          ok: true,
          mode: "darwin",
          path: outPath,
          width: 0, // screencapture 不直接返回尺寸，留 0；agent 看图即可
          height: 0,
          warning: st.size < 2000 ? "file is suspiciously small; window may be minimized" : undefined,
        };
      } catch {
        return {
          ok: false,
          mode: "darwin",
          error: "screencapture reported success but output file missing",
          hint: 'Try scope="full".',
        };
      }
    },
  };
}
