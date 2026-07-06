export type CaptureScope = "window" | "region" | "full";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaptureOptions {
  scope: CaptureScope;
  /** 窗口标题关键词（小写匹配，子串包含） */
  titleKeywords: string[];
  /** 仅 scope=region 时使用 */
  region?: Region;
  /**
   * 仅 simulator 模式：模拟器在目标窗口 bounds 内的相对百分比。
   * x1/x2 是左右边界百分比，y1/y2 是上下边界百分比（0-100）。
   * 由环境变量 SIMULATOR_RECT 解析而来，仅在 scope=window 时应用。
   */
  simulatorRect?: { x1: number; x2: number; y1: number; y2: number };
}

export interface CaptureSuccess {
  ok: true;
  /** 截图绝对路径 */
  path: string;
  width: number;
  height: number;
  mode: "windows" | "darwin";
  warning?: string;
}

export interface CaptureFailure {
  ok: false;
  mode: "windows" | "darwin";
  error: string;
  /** 给 agent 的可读建议 */
  hint: string;
}

export type CaptureResult = CaptureSuccess | CaptureFailure;

/**
 * 平台模块统一接口。capture 把截图写到 outPath，返回结果。
 * 永远 resolve，绝不 reject——失败也通过 CaptureFailure 表达。
 */
export interface PlatformCapture {
  mode: "windows" | "darwin";
  capture(opts: CaptureOptions, outPath: string): Promise<CaptureResult>;
}
