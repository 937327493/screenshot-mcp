import { describe, test, expect } from "bun:test";
import { selectPlatform } from "./index.js";
import type { PlatformCapture } from "./types.js";

const fake = (mode: "windows" | "darwin"): PlatformCapture => ({
  mode,
  async capture() {
    return { ok: false, mode, error: "stub", hint: "" };
  },
});

describe("selectPlatform", () => {
  test("returns windows impl for win32", () => {
    const impl = selectPlatform("win32", { win32: fake("windows"), darwin: fake("darwin") });
    expect(impl.mode).toBe("windows");
  });

  test("returns darwin impl for darwin", () => {
    const impl = selectPlatform("darwin", { win32: fake("windows"), darwin: fake("darwin") });
    expect(impl.mode).toBe("darwin");
  });

  test("throws on unsupported platform with clear message", () => {
    expect(() =>
      selectPlatform("linux", { win32: fake("windows"), darwin: fake("darwin") })
    ).toThrow(/unsupported platform: linux/i);
  });
});
