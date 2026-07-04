import type { PlatformCapture } from "./types.js";

export function createWin32Capture(): PlatformCapture {
  return {
    mode: "windows",
    async capture() {
      return {
        ok: false,
        mode: "windows",
        error: "not implemented yet",
        hint: "win32 capture will be implemented in Task 5",
      };
    },
  };
}
