import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import type { PlatformCapture, CaptureOptions, CaptureResult, Region } from "./types.js";

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

/**
 * 用 AppleEvents 拿到匹配关键词的进程主窗口 bounds。
 *
 * 不依赖 CGWindowListCopyWindowInfo（那需要"屏幕录制"权限，而 macOS TCC 对
 * app 壳 + CLI 子进程的组合有授权路由 bug）。AppleEvents 走 kTCCServiceAppleEvents
 * /Accessibility，是另一条独立、可用的权限路径。
 *
 * 返回 {x,y,w,h} 全局坐标（可能为负，多屏时窗口在外接屏）。找不到返回 null。
 */
async function getWindowBounds(titleKeys: string[]): Promise<Region | null> {
  // AppleScript 双引号转义
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // 关键词按 | 拼进一个 whose 条件：name 包含任意一个关键词
  // System Events 的 whose 支持 "contains"，多个用 or 连接
  const conditions = titleKeys
    .map((k) => `name of it contains "${esc(k)}"`)
    .join(" or ");

  // 遍历每个候选进程的所有窗口，挑「有标题且面积最大」的那个。
  // 关键：不能用 window 1——某些 app（如微信开发者工具）window 1 是无标题的
  // 菜单栏/工具条（3024x66 那种），真正的主窗口在 window 2 且带标题。
  // 策略：遍历所有窗口，过滤掉无标题的，按面积(w*h)降序，取最大的。
  const script = `
tell application "System Events"
  set candidates to (every process whose ${conditions})
  set best to ""
  set bestArea to 0
  repeat with p in candidates
    try
      set wc to count of windows of p
      repeat with i from 1 to wc
        try
          set w to window i of p
          set t to title of w
          if t is not missing value and t is not "" then
            set pos to position of w
            set sz to size of w
            set area to ((item 1 of sz) * (item 2 of sz))
            if area > bestArea then
              set bestArea to area
              set best to ((item 1 of pos as text) & "," & (item 2 of pos as text) & "," & (item 1 of sz as text) & "," & (item 2 of sz as text))
            end if
          end if
        end try
      end repeat
    end try
  end repeat
  return best
end tell
`;

  const { stdout, code, stderr } = await run("osascript", ["-e", script]);
  if (code !== 0) {
    // AppleEvents 没授权时这里会失败。返回 null，上层会转成可读错误。
    return null;
  }

  const out = stdout.trim();
  if (!out) return null;

  const parts = out.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n))) return null;

  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

export function createDarwinCapture(): PlatformCapture {
  return {
    mode: "darwin",
    async capture(opts: CaptureOptions, outPath: string): Promise<CaptureResult> {
      let region: Region | undefined;

      if (opts.scope === "full") {
        // 全屏：不加 -R，screencapture 抓主屏。
        // 注意：如果目标在外接屏，full 模式可能抓不到——用 window 模式更准。
        const { code, stderr } = await run("screencapture", ["-x", outPath]);
        if (code !== 0) {
          return {
            ok: false,
            mode: "darwin",
            error: `screencapture exited ${code}: ${stderr.slice(0, 200)}`,
            hint: 'Check screen-recording permission in System Settings > Privacy. Or try scope="window".',
          };
        }
      } else if (opts.scope === "region") {
        if (!opts.region) {
          return {
            ok: false,
            mode: "darwin",
            error: "scope=region requires region coordinates",
            hint: 'Provide region "x,y,w,h", or use scope="window"/"full".',
          };
        }
        region = opts.region;
      } else {
        // window: 通过 AppleEvents 拿窗口 bounds，再用 -R 按坐标截
        const titleKeys = opts.titleKeywords.length > 0 ? opts.titleKeywords : ["wechatdevtools"];
        const bounds = await getWindowBounds(titleKeys);
        if (!bounds) {
          return {
            ok: false,
            mode: "darwin",
            error: `no visible window for process matching any of: ${titleKeys.join(", ")}`,
            hint: 'Open WeChat devtools and keep its window visible, or use scope="full". If AppleEvents/Accessibility permission is missing, grant it to ZCode in System Settings > Privacy & Security.',
          };
        }
        region = bounds;
      }

      // region / window 两种模式都走 -R 按坐标截（绕开屏幕录制权限 + 支持负坐标外接屏）
      if (region) {
        const { x, y, w, h } = region;
        const { code, stderr } = await run("screencapture", ["-x", "-R", `${x},${y},${w},${h}`, outPath]);
        if (code !== 0) {
          return {
            ok: false,
            mode: "darwin",
            error: `screencapture -R exited ${code}: ${stderr.slice(0, 200)}`,
            hint: 'Try scope="full" as a fallback.',
          };
        }
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
