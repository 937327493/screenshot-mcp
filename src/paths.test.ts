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

  test("two calls with same timestamp are distinct (counter fallback)", () => {
    const fixed = new Date(2026, 6, 4, 12, 0, 0, 500); // 2026-07-04 12:00:00.500 local
    const a = generateFilename(fixed);
    const b = generateFilename(fixed);
    expect(a).not.toBe(b);
    expect(a).toBe("shot-20260704-120000-500.png");
    expect(b).toBe("shot-20260704-120000-500-1.png");
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

  test("inserts separator newline when existing file has no trailing newline", () => {
    writeFileSync(join(TMP, ".gitignore"), "node_modules/"); // no trailing newline
    ensureGitignore(TMP);
    const content = readFileSync(join(TMP, ".gitignore"), "utf8");
    expect(content).toContain("\n.screenshots/");
    expect(content).toBe("node_modules/\n.screenshots/\n");
  });
});
