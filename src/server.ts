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
    async ({ scope, title, region }) => {
      try {
        // 准备输出路径
        ensureGitignore(projectRoot);
        const dir = ensureScreenshotDir(projectRoot);
        const outPath = `${dir}/${generateFilename()}`;

        const opts: CaptureOptions = {
          scope: scope as CaptureScope,
          titleKeywords: title ? [title] : DEFAULT_TITLE_KEYWORDS,
        };

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
