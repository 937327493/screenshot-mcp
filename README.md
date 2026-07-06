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

### 只截模拟器区域

`scope=window` 默认截整个开发者工具窗口（含目录树、调试器）。如果你只想要模拟器（手机预览）那一块画面，加参数 `simulator=true`：

```
screenshot_capture { scope: "window", simulator: true }
```

模拟器在窗口内的位置由环境变量 `SIMULATOR_RECT` 配置，格式 `"x1,x2,y1,y2"` 四个百分比整数（0-100），分别表示模拟器在窗口 bounds 内的**左、右、顶、底**边界：

```json
{
  "mcp": {
    "servers": {
      "screenshot": {
        "type": "stdio",
        "command": "node",
        "args": ["/absolute/path/to/mcp-screenshot/dist/index.js"],
        "env": {
          "SIMULATOR_RECT": "50,64,7,99"
        }
      }
    }
  }
}
```

含义：模拟器位于窗口左 50% 到右 64%、顶 7% 到底 99% 的矩形区域。运行时会按当前窗口实际尺寸换算成屏幕坐标，所以**窗口移动、换屏幕、调整 ZCode 窗口大小都不影响**，只要开发者工具内部布局（目录树/模拟器/调试器的比例）不变。

**怎么量出适合自己的百分比**：先用 `scope=window` 截一张完整窗口图，目测模拟器四条边在窗口里的百分比位置（左边占窗口宽的百分之几、右边到百分之几、顶部从百分之几开始、底部到百分之几），填进 `SIMULATOR_RECT`。配一次长期用，开发者工具布局没大改就不用动。

> 注意：`simulator=true` 仅在 `scope=window` 时有意义（需要先定位窗口，再裁子区域）。不配 `SIMULATOR_RECT` 就调用 `simulator=true` 会返回明确错误提示。

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
