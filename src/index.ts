import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { getPlatform } from "./platform/index.js";

async function main() {
  const projectRoot =
    process.env.MCP_SCREENSHOT_PROJECT_ROOT || process.cwd();

  let platform;
  try {
    platform = getPlatform();
  } catch (e) {
    // 不支持的平台：stderr 输出错误，退出
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const server = createServer(platform, projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
