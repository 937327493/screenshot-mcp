# mcp-screenshot

跨平台 MCP server，让 AI agent 自己截取微信开发者工具模拟器画面，形成「改代码 → 截图 → 看效果」闭环。

## 它解决什么问题

以前 agent 改完小程序看不到效果，要人工截图 → 传 OSS → 给链接。本 MCP 把这一环自动化：agent 调一个工具截当前画面，拿到本地路径后自己 `Read` 读取，**不依赖 OSS、不依赖网络**。

核心思路：agent 本身能读本地图片，所以 MCP 的职责只是「截图 → 存本地 → 返回绝对路径」，剩下的闭环 agent 自己完成。

## 工具

### screenshot_capture

| 参数 | 类型 | 说明 |
|---|---|---|
| scope | `"window"` \| `"region"` \| `"full"` | 默认 window。window 按标题找；region 按坐标；full 全屏兜底 |
| title | string | 窗口标题关键词，默认匹配微信开发者工具相关窗口 |
| region | string `"x,y,w,h"` | 仅 scope=region 时生效，四个整数像素坐标 |

成功返回本地 PNG 绝对路径，agent 用 Read 工具读取该路径即可看到画面。失败返回结构化错误 + 可读的 hint（例如建议改用 `scope=full` 兜底）。

## 接入 ZCode

在项目工作区 `.zcode/config.json`（配置文件不展开 `${...}` 模板变量，必须用绝对路径）：

```json
{
  "mcp": {
    "servers": {
      "screenshot": {
        "type": "stdio",
        "command": "node",
        "args": ["/absolute/path/to/mcp-screenshot/dist/index.js"]
      }
    }
  }
}
```

重启会话，输入 `/mcp` 查看连接状态（应显示 connected）。截图保存在项目 `.screenshots/`（已自动加入 gitignore）。

> 备注：`projectRoot` 默认用 server 进程的 `process.cwd()`；如果 ZCode 启动 server 时的 cwd 不是你期望的项目根，可设置环境变量 `MCP_SCREENSHOT_PROJECT_ROOT` 指向目标项目目录，截图就会存到那里的 `.screenshots/`。

## 开发

```bash
cd mcp-screenshot
bun install
bun run build      # 编译到 dist/（tsc，零错误）
bun test           # 跑测试（bun test）
bun run start      # 等价于 node dist/index.js
```

源码结构：

```
src/
├── index.ts              # stdio 入口
├── server.ts             # MCP 工具定义（screenshot_capture）
├── paths.ts              # 截图路径/gitignore 维护（纯函数，已测）
└── platform/
    ├── types.ts          # 平台捕获接口
    ├── index.ts          # 按 process.platform 分发
    ├── win32.ts          # Windows: PowerShell + System.Drawing
    └── darwin.ts         # macOS: screencapture + osascript
```

## 平台支持

| 平台 | 实现 | 状态 |
|---|---|---|
| Windows | PowerShell + System.Drawing.CopyFromScreen，按窗口标题定位 | 已实测 |
| macOS | `screencapture -l<wid>` / `-R x,y,w,h`，osascript 查窗口 | 代码就绪，待 Mac 实测（需授予「屏幕录制」权限） |

## 设计原则

- **capture() 永远 resolve，绝不 reject**——失败也通过结构化的 `CaptureFailure` 表达。stdio MCP server 一旦 crash，整个会话的工具都没了，所以稳定性是第一约束。
- **窗口找不到是正常情况**——返回清晰错误 + hint，让 agent 自己判断（例如改用 `scope=full` 兜底）。
- **YAGNI**——MVP 只截当前画面，不做点击/导航/OCR/对比。

## 后续规划

- v2: `screenshot.list_windows` 列出所有窗口，让 agent 精确指定截哪个
- v3: 接 miniprogram-automator，加 navigate/tap，真正"控制+截图"闭环
- v4: CDP 直连模拟器 Chromium，截纯渲染画面
