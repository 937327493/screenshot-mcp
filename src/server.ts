import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PlatformCapture, CaptureOptions, CaptureScope } from "./platform/types.js";
import { ensureScreenshotDir, ensureGitignore, generateFilename } from "./paths.js";

const DEFAULT_TITLE_KEYWORDS = [
  "微信开发者工具",
  "wechatdevtools",
  "miniprogram",
  "wechat devtools",
];

/**
 * 解析环境变量 SIMULATOR_RECT，格式 "x1,x2,y1,y2" 四个 0-100 整数百分比。
 * 表示模拟器在目标窗口 bounds 内的相对位置（左,右,顶,底）。
 * 解析失败（缺失/格式错/越界）返回 null，并 stderr 提示。
 */
function parseSimulatorRect(): { x1: number; x2: number; y1: number; y2: number } | null {
  const raw = process.env.SIMULATOR_RECT;
  if (!raw) return null;

  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n))) {
    console.error(`[screenshot-mcp] SIMULATOR_RECT 格式错误："${raw}"，应为 "x1,x2,y1,y2" 四个整数（百分比）。已忽略。`);
    return null;
  }
  const [x1, x2, y1, y2] = parts;
  if (parts.some((n) => n < 0 || n > 100)) {
    console.error(`[screenshot-mcp] SIMULATOR_RECT 百分比越界："${raw}"，每个值应在 0-100。已忽略。`);
    return null;
  }
  if (x2 <= x1 || y2 <= y1) {
    console.error(`[screenshot-mcp] SIMULATOR_RECT 区域为空或反向："${raw}"（需 x2>x1 且 y2>y1）。已忽略。`);
    return null;
  }
  return { x1, x2, y1, y2 };
}

const CaptureInputSchema = {
  scope: z
    .enum(["window", "region", "full"])
    .default("window")
    .describe("截图范围：window 按标题找窗口；region 按坐标裁剪；full 全屏兜底"),
  title: z
    .string()
    .optional()
    .describe("窗口标题关键词（子串匹配，大小写不敏感）。默认匹配微信开发者工具相关窗口"),
  region: z
    .string()
    .optional()
    .describe('裁剪区域，格式 "x,y,w,h"，仅 scope=region 时生效'),
  simulator: z
    .boolean()
    .default(false)
    .describe("true=只截窗口内的模拟器区域（用环境变量 SIMULATOR_RECT 配置的百分比）；仅 scope=window 时有意义"),
};

export function createServer(
  platform: PlatformCapture,
  projectRoot: string
): McpServer {
  const server = new McpServer({
    name: "mcp-screenshot",
    version: "0.1.0",
  });

  server.tool(
    "screenshot_capture",
    "截取微信开发者工具模拟器的当前画面，保存为本地 PNG，返回绝对路径。调用后用 Read 读取返回的 path 即可看到画面。默认截窗口；找不到窗口时改用 scope=full。",
    CaptureInputSchema,
    async ({ scope, title, region, simulator }) => {
      try {
        // simulator 模式的前置校验
        if (simulator) {
          if (scope !== "window") {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `simulator=true 仅在 scope=window 时有意义（先定位窗口，再裁出模拟器子区域），当前 scope=${scope}。`,
                },
              ],
            };
          }
          if (!process.env.SIMULATOR_RECT) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: 'simulator=true 需要环境变量 SIMULATOR_RECT 指定模拟器在窗口内的相对百分比，格式 "x1,x2,y1,y2"（如 "50,64,7,99"）。在 server 配置的 env 里设置后重启会话。',
                },
              ],
            };
          }
        }

        // 准备输出路径
        ensureGitignore(projectRoot);
        const dir = ensureScreenshotDir(projectRoot);
        const outPath = `${dir}/${generateFilename()}`;

        const opts: CaptureOptions = {
          scope: scope as CaptureScope,
          titleKeywords: title ? [title] : DEFAULT_TITLE_KEYWORDS,
        };

        // simulator 模式：把百分比配置塞进 opts，交给 platform 在窗口内裁
        if (simulator) {
          const rect = parseSimulatorRect();
          if (rect) opts.simulatorRect = rect;
        }

        if (scope === "region") {
          if (!region) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: 'scope=region 需要提供 region 参数，格式 "x,y,w,h"（像素坐标）。',
                },
              ],
            };
          }
          const parts = region.split(",").map((s) => parseInt(s.trim(), 10));
          if (parts.length !== 4 || parts.some((n) => isNaN(n))) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `region 格式错误："${region}"，应为 "x,y,w,h" 四个整数。`,
                },
              ],
            };
          }
          opts.region = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
        }

        const result = await platform.capture(opts, outPath);

        if (!result.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `截图失败（${result.mode}）：${result.error}\n建议：${result.hint}`,
              },
            ],
          };
        }

        const warn = result.warning ? `\n注意：${result.warning}` : "";
        return {
          content: [
            {
              type: "text",
              text: `截图成功，保存到：${result.path}\n尺寸：${result.width}x${result.height}（mode: ${result.mode}）${warn}\n\n用 Read 工具读取上面的路径即可查看画面。`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text", text: `内部错误：${msg}` }],
        };
      }
    }
  );

  return server;
}
