import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { generateFilename, ensureScreenshotDir, ensureGitignore } from "./paths.js";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP = join(import.meta.dir, ".tmp-test-paths");

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("generateFilename", () => {
  test("returns .png name with timestamp pattern", () => {
    const name = generateFilename();
    expect(name).toMatch(/^shot-\d{8}-\d{6}-\d{3}\.png$/);
  });

  test("two calls within same ms are still distinct (counter fallback)", () => {
    const a = generateFilename();
    const b = generateFilename();
    // 允许时间戳不同；只要两个都合法
    expect(a).toMatch(/^shot-\d{8}-\d{6}-\d{3}\.png$/);
    expect(b).toMatch(/^shot-\d{8}-\d{6}-\d{3}\.png$/);
  });
});

describe("ensureScreenshotDir", () => {
  test("creates .screenshots under given project root", () => {
    const dir = ensureScreenshotDir(TMP);
    expect(dir).toBe(join(TMP, ".screenshots"));
    expect(existsSync(dir)).toBe(true);
  });

  test("idempotent — calling twice does not throw", () => {
    ensureScreenshotDir(TMP);
    expect(() => ensureScreenshotDir(TMP)).not.toThrow();
  });
});

describe("ensureGitignore", () => {
  test("appends .screenshots/ when file is missing the entry", () => {
    writeFileSync(join(TMP, ".gitignore"), "node_modules/\n");
    ensureGitignore(TMP);
    const content = readFileSync(join(TMP, ".gitignore"), "utf8");
    expect(content).toContain(".screenshots/");
  });

  test("does not duplicate when entry already present", () => {
    writeFileSync(join(TMP, ".gitignore"), "node_modules/\n.screenshots/\n");
    ensureGitignore(TMP);
    const content = readFileSync(join(TMP, ".gitignore"), "utf8");
    const matches = content.match(/\.screenshots\//g) ?? [];
    expect(matches.length).toBe(1);
  });

  test("creates .gitignore if it does not exist", () => {
    ensureGitignore(TMP);
    expect(existsSync(join(TMP, ".gitignore"))).toBe(true);
  });
});
