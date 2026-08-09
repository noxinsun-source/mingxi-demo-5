/**
 * 运行轨迹（可审计）
 *
 * Agent 的每一步都要留痕：调了什么工具、用了哪条记忆、
 * 数据是真跑还是回放、有没有停下来等人确认。
 * 这是「可审查的 Agent」而不是「黑箱」的关键。
 */
export type Provenance = "Live" | "Replay" | "Fixture" | "Simulated";

export interface TraceStep {
  seq: number;
  at: string;
  tool: string;
  title: string;
  provenance: Provenance;
  status: "ok" | "error" | "awaiting_approval" | "refused";
  /** 一句话说明这步干了什么 */
  summary: string;
  /** 用到的习得档条目（对应界面上的「因为你之前…」） */
  memoryUsed: string[];
  /** 命中的人机边界 */
  boundary?: string;
  durationMs: number;
  inputDigest?: string;
}

export interface Trace {
  runId: string;
  startedAt: string;
  steps: TraceStep[];
}

export function createTrace(runId: string, at: string): Trace {
  return { runId, startedAt: at, steps: [] };
}

export function pushStep(
  trace: Trace,
  step: Omit<TraceStep, "seq">,
): Trace {
  return {
    ...trace,
    steps: [...trace.steps, { ...step, seq: trace.steps.length + 1 }],
  };
}

/** 给界面用的可读摘要 */
export function describeTrace(trace: Trace): string[] {
  return trace.steps.map((s) => {
    const flag =
      s.status === "awaiting_approval"
        ? "⏸ 等你确认"
        : s.status === "refused"
          ? "⛔ 已拒绝"
          : s.status === "error"
            ? "⚠ 失败"
            : "✓";
    return `${flag} [${s.provenance}] ${s.title} —— ${s.summary}`;
  });
}
