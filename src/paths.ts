import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR_NAME = ".screenshots";

/** 生成 shot-YYYYMMDD-HHmmss-fff.png 形式的文件名 */
export function generateFilename(date: Date = new Date()): string {
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  const stamp =
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1, 2)}${p(date.getDate(), 2)}` +
    `-${p(date.getHours(), 2)}${p(date.getMinutes(), 2)}${p(date.getSeconds(), 2)}` +
    `-${p(date.getMilliseconds(), 3)}`;
  return `shot-${stamp}.png`;
}

/** 确保 projectRoot/.screenshots 存在，返回其绝对路径 */
export function ensureScreenshotDir(projectRoot: string): string {
  const dir = join(projectRoot, DIR_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 确保 projectRoot/.gitignore 里有 .screenshots/ 这一行 */
export function ensureGitignore(projectRoot: string): void {
  const giPath = join(projectRoot, ".gitignore");
  const entry = `${DIR_NAME}/`;

  if (!existsSync(giPath)) {
    writeFileSync(giPath, `${entry}\n`, "utf8");
    return;
  }

  const content = readFileSync(giPath, "utf8");
  const lines = content.split(/\r?\n/);
  if (lines.some((l) => l.trim() === entry)) return;
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  appendFileSync(giPath, `${prefix}${entry}\n`, "utf8");
}
