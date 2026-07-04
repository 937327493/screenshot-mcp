import type { PlatformCapture } from "./types.js";

export function createDarwinCapture(): PlatformCapture {
  return {
    mode: "darwin",
    async capture() {
      return {
        ok: false,
        mode: "darwin",
        error: "not implemented yet",
        hint: "darwin capture will be implemented in Task 6",
      };
    },
  };
}
