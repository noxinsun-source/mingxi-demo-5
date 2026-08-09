/**
 * 编排器：意图识别 → 计划 → 执行 → 留痕
 *
 * 设计取舍：P0 用**确定性规划器**（规则 + 工具注册表），
 * 不用模型自由发挥。理由：
 *   - 评测可复现，现场不会翻车
 *   - Agent 的每一步都能被审查
 *   - 接真实模型时只替换 planner，执行层与边界不变（见 llm-adapter.ts）
 */
import type { AgentContext, ToolResult } from "./tool-registry.ts";
import { ToolRegistry } from "./tool-registry.ts";
import { createRegistry } from "./tools/index.ts";
import { createTrace, pushStep } from "./trace.ts";
import type { Trace } from "./trace.ts";

export type Intent =
  | "organize"
  | "reline"
  | "lookup"
  | "decide"
  | "memory"
  | "ingest"
  | "clarify";

export interface PlanStep {
  tool: string;
  input: Record<string, unknown>;
  why: string;
}

export interface Plan {
  intent: Intent;
  steps: PlanStep[];
  /** 给用户看的一句话：我打算干什么 */
  narration: string;
}

const INTENT_RULES: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: "lookup", keywords: ["查一下", "帮我查", "核实", "是不是真的", "最新", "还有效吗", "过期了吗"] },
  { intent: "decide", keywords: ["该不该", "要不要", "还是", "选哪个", "怎么选", "帮我决定"] },
  {
    intent: "reline",
    keywords: [
      "重排",
      "重新整理",
      "换个角度",
      "理一下",
      "按",
      "优先",
      "时间线",
      "因果",
      "对比",
      "梳",
      "逻辑线",
      "逻辑链",
      "梳理",
      "避雷",
      "正例",
    ],
  },
  { intent: "memory", keywords: ["记住", "别记", "忘掉", "回滚", "撤销这条", "你学到的"] },
  {
    intent: "ingest",
    keywords: ["入库", "规范化", "多模态", "悬浮球", "截屏入库", "转写入库", "分镜", "保存这条捕获"],
  },
  { intent: "organize", keywords: ["整理这条", "成件", "这条存", "捕获", "刚存的"] },
];

export function detectIntent(utterance: string): Intent {
  const u = (utterance ?? "").trim();
  let best: Intent = "clarify";
  let bestHits = 0;
  for (const rule of INTENT_RULES) {
    const hits = rule.keywords.filter((k) => u.includes(k)).length;
    if (hits > bestHits) {
      best = rule.intent;
      bestHits = hits;
    }
  }
  return bestHits === 0 ? "clarify" : best;
}

export function plan(utterance: string, ctx: AgentContext): Plan {
  const intent = detectIntent(utterance);

  switch (intent) {
    case "organize":
      return {
        intent,
        narration: "我先按你声明的用途，把这份原料整理成能用的卡。",
        steps: ctx.materials.slice(0, 1).map((m) => ({
          tool: "organize_piece",
          input: { materialId: m.id },
          why: "用途路由整理",
        })),
      };

    case "reline": {
      const needRetrieve = ctx.materials.length === 0;
      return {
        intent,
        narration: needRetrieve
          ? "我先从知识库召回相关笔记，解析角度，再梳出逻辑链给你确认。"
          : "我先把这句话解析成角度给你看，你点头我再重排。",
        steps: [
          ...(needRetrieve
            ? [
                {
                  tool: "library_retrieve",
                  input: { query: utterance, limit: 14 },
                  why: "从银标+活库召回原料，供建链",
                },
              ]
            : []),
          { tool: "preview_angle", input: { angleText: utterance }, why: "先让用户看懂 AI 打算怎么排" },
          {
            tool: "reline",
            input: {
              angleText: utterance,
              lockedNodeIds: ctx.line?.lockedNodeIds ?? [],
              ...(ctx.scopeNodeId ? { scopeNodeId: ctx.scopeNodeId } : {}),
            },
            why: "生成新结构与 diff，等确认；锁定节点不动",
          },
        ],
      };
    }

    case "lookup":
      return {
        intent,
        narration: "我先实时搜索公开网页，再用外查卡整理证据与冲突，你批准我才写回。",
        steps: [
          { tool: "web_search", input: { query: utterance, maxResults: 5 }, why: "实时网络搜索" },
          { tool: "lookup", input: { question: utterance }, why: "结构化外查卡 + 与已有笔记冲突检出（等人批准写回）" },
        ],
      };

    case "decide":
      return {
        intent,
        narration: "我把选项、依据和还不知道的部分列出来，你拍板。",
        steps: [{ tool: "make_decision_card", input: { question: utterance }, why: "决策建议" }],
      };

    case "ingest":
      return {
        intent,
        narration:
          "捕获闭环：规范化 → 图片 OCR+VLM 双轨 → 打标 → 写入活知识库。请把捕获信封交给 capture_ingest（或 normalize_multimodal）。",
        steps: [],
      };

    case "memory":
      return {
        intent,
        narration: "这属于你对「它学到的我」的控制，我不自己动手。",
        steps: [],
      };

    default: {
      // 没命中关键词时，仍把原话丢给角度解析器：
      // 置信度够就预览，不够就由引擎反问 —— 比空手返回更有用。
      const hasSubstance = utterance.trim().length >= 2;
      return {
        intent: "clarify",
        narration: hasSubstance
          ? "我先试着理解这句话；看不懂我会反问，绝不擅自重排。"
          : "我没听懂你想按什么线索来 —— 我不猜，你说一句或者选一个。",
        steps: hasSubstance
          ? [
              ...(ctx.materials.length === 0
                ? [
                    {
                      tool: "library_retrieve",
                      input: { query: utterance, limit: 14 },
                      why: "先召回笔记，再试解析角度",
                    },
                  ]
                : []),
              { tool: "preview_angle", input: { angleText: utterance }, why: "先看能不能解析出角度" },
              {
                tool: "reline",
                input: {
                  angleText: utterance,
                  lockedNodeIds: ctx.line?.lockedNodeIds ?? [],
                  ...(ctx.scopeNodeId ? { scopeNodeId: ctx.scopeNodeId } : {}),
                },
                why: "置信不足时反问，够了再等人确认",
              },
            ]
          : [],
      };
    }
  }
}

export interface TurnResult {
  plan: Plan;
  ctx: AgentContext;
  trace: Trace;
  results: Array<{ tool: string; result: ToolResult }>;
  /** 有任何一步在等人确认 */
  awaitingApproval: boolean;
}

export interface ExecuteResult {
  ctx: AgentContext;
  results: Array<{ tool: string; result: ToolResult }>;
}

function isPromiseLike<T>(v: unknown): v is Promise<T> {
  return Boolean(v) && typeof (v as { then?: unknown }).then === "function";
}

function applyToolResult(
  current: AgentContext,
  tool: {
    name: string;
    title: string;
    provenance: import("./trace.ts").Provenance;
    humanBoundary: string;
  },
  step: PlanStep,
  result: ToolResult,
  started: number,
): { ctx: AgentContext; result: ToolResult } {
  const durationMs = Date.now() - started;
  const apply = result.ok && result.patch && !result.needsApproval;
  const nextCtx: AgentContext = apply ? { ...current, ...result.patch } : current;
  const trace = pushStep(nextCtx.trace, {
    at: nextCtx.now,
    tool: tool.name,
    title: tool.title,
    provenance: tool.provenance,
    status: result.needsApproval
      ? "awaiting_approval"
      : result.ok
        ? "ok"
        : result.error === "human_review_required"
          ? "refused"
          : "error",
    summary: result.summary,
    memoryUsed: result.memoryUsed ?? [],
    boundary: result.boundary ?? tool.humanBoundary,
    durationMs,
    inputDigest: JSON.stringify(step.input).slice(0, 120),
  });
  return { ctx: { ...nextCtx, trace }, result };
}

/**
 * 同步执行。若工具返回 Promise（如 web_search / normalize 开 Vision），会抛错提示改用 executeAsync。
 */
export function execute(
  steps: PlanStep[],
  ctx: AgentContext,
  registry: ToolRegistry,
): ExecuteResult {
  let current = ctx;
  const results: Array<{ tool: string; result: ToolResult }> = [];

  for (const step of steps) {
    const tool = registry.get(step.tool);
    if (!tool) {
      results.push({
        tool: step.tool,
        result: { ok: false, summary: `未注册的工具：${step.tool}`, error: "unknown_tool" },
      });
      continue;
    }

    const started = Date.now();
    let result: ToolResult;
    try {
      const raw = tool.run(step.input as never, current);
      if (isPromiseLike<ToolResult>(raw)) {
        throw new Error(
          `工具 ${tool.name} 返回 Promise，请用 executeAsync / runTurnAsync / sayAsync`,
        );
      }
      result = raw;
    } catch (err) {
      result = {
        ok: false,
        summary: `工具抛异常：${(err as Error).message}`,
        error: (err as Error).name,
      };
    }
    const applied = applyToolResult(current, tool, step, result, started);
    current = applied.ctx;
    results.push({ tool: tool.name, result: applied.result });
  }

  return { ctx: current, results };
}

/** 异步执行：支持网络工具与 Vision 双轨 */
export async function executeAsync(
  steps: PlanStep[],
  ctx: AgentContext,
  registry: ToolRegistry,
): Promise<ExecuteResult> {
  let current = ctx;
  const results: Array<{ tool: string; result: ToolResult }> = [];

  for (const step of steps) {
    const tool = registry.get(step.tool);
    if (!tool) {
      results.push({
        tool: step.tool,
        result: { ok: false, summary: `未注册的工具：${step.tool}`, error: "unknown_tool" },
      });
      continue;
    }

    const started = Date.now();
    let result: ToolResult;
    try {
      const raw = tool.run(step.input as never, current);
      result = isPromiseLike<ToolResult>(raw) ? await raw : raw;
    } catch (err) {
      result = {
        ok: false,
        summary: `工具抛异常：${(err as Error).message}`,
        error: (err as Error).name,
      };
    }
    const applied = applyToolResult(current, tool, step, result, started);
    current = applied.ctx;
    results.push({ tool: tool.name, result: applied.result });
  }

  return { ctx: current, results };
}

/**
 * 跑一个回合。
 * 注意：需要人确认的产出**不会**自动写进上下文 —— 由界面拿到 patch 后
 * 在用户点「接受」时调用 applyPatch。
 */
export function runTurn(
  utterance: string,
  ctx: AgentContext,
  registry: ToolRegistry = createRegistry(),
): TurnResult {
  const p = plan(utterance, ctx);
  const base: AgentContext = {
    ...ctx,
    trace: ctx.trace ?? createTrace(`run_${Date.now()}`, ctx.now),
  };
  // 含网络/异步工具的计划必须走 runTurnAsync；同步路径跳过 Promise 工具
  const syncSafe = p.steps.filter(
    (s) => !["web_search", "web_read", "capture_ingest", "normalize_multimodal"].includes(s.tool),
  );
  const { ctx: nextCtx, results } = execute(syncSafe, base, registry);

  return {
    plan: p,
    ctx: nextCtx,
    trace: nextCtx.trace,
    results,
    awaitingApproval: results.some((r) => r.result.needsApproval === true),
  };
}

/** 异步回合：完整执行含 web_search / Vision 的计划 */
export async function runTurnAsync(
  utterance: string,
  ctx: AgentContext,
  registry: ToolRegistry = createRegistry(),
): Promise<TurnResult> {
  const p = plan(utterance, ctx);
  const base: AgentContext = {
    ...ctx,
    trace: ctx.trace ?? createTrace(`run_${Date.now()}`, ctx.now),
  };
  const { ctx: nextCtx, results } = await executeAsync(p.steps, base, registry);
  return {
    plan: p,
    ctx: nextCtx,
    trace: nextCtx.trace,
    results,
    awaitingApproval: results.some((r) => r.result.needsApproval === true),
  };
}

/** 用户点「接受」时，把某一步的 patch 应用到上下文 */
export function applyPatch(ctx: AgentContext, result: ToolResult): AgentContext {
  if (!result.patch) return ctx;
  return { ...ctx, ...result.patch };
}
