import type { PlatformCapture } from "./types.js";
import { createWin32Capture } from "./win32.js";
import { createDarwinCapture } from "./darwin.js";

export interface PlatformImpls {
  win32: PlatformCapture;
  darwin: PlatformCapture;
}

/** 按平台名选择实现（纯函数，便于测试） */
export function selectPlatform(
  platform: NodeJS.Platform | string,
  impls: PlatformImpls
): PlatformCapture {
  switch (platform) {
    case "win32":
      return impls.win32;
    case "darwin":
      return impls.darwin;
    default:
      throw new Error(
        `unsupported platform: ${platform}. mcp-screenshot supports win32 and darwin only.`
      );
  }
}

/** 生产环境用：根据当前 process.platform 选实现 */
export function getPlatform(): PlatformCapture {
  return selectPlatform(process.platform, {
    win32: createWin32Capture(),
    darwin: createDarwinCapture(),
  });
}
