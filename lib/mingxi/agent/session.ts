/**
 * 会话：跨回合的状态容器
 *
 * 纯 reducer，没有副作用 —— 同一串动作必然得到同一个状态。
 * 前端（手机端 / 网页端）共用这一个状态机，两端因此天然连贯。
 */
import type { DecisionCard, Line, LookupCard, Material, Piece } from "../types.ts";
import { emptyStore } from "../engine/learning.ts";
import type { ProfileStore } from "../types.ts";
import type { AgentContext, ToolResult } from "./tool-registry.ts";
import { ToolRegistry } from "./tool-registry.ts";
import { createRegistry } from "./tools/index.ts";
import { createTrace } from "./trace.ts";
import type { Trace } from "./trace.ts";
import { applyPatch, runTurn, runTurnAsync } from "./orchestrator.ts";
import type { TurnResult } from "./orchestrator.ts";
import { runTurnWithLlm } from "./llm-orchestrator.ts";
import { mingxiUsesLlmPlanner } from "../llm/env.ts";

export interface PendingApproval {
  id: string;
  tool: string;
  summary: string;
  boundary?: string;
  result: ToolResult;
}

export interface SessionState {
  materials: Material[];
  pieces: Piece[];
  line?: Line;
  store: ProfileStore;
  lookups: LookupCard[];
  decisions: DecisionCard[];
  pending: PendingApproval[];
  trace: Trace;
  now: string;
  history: Array<{ utterance: string; narration: string; at: string }>;
  /** 局部重生成作用域（产品 UI） */
  scopeNodeId?: string;
}

export function createSession(
  materials: Material[],
  now = "2026-08-03T09:00:00+08:00",
): SessionState {
  return {
    materials,
    pieces: [],
    store: emptyStore(),
    lookups: [],
    decisions: [],
    pending: [],
    trace: createTrace(`run_${materials.length}`, now),
    now,
    history: [],
  };
}

export function toContext(s: SessionState): AgentContext {
  return {
    materials: s.materials,
    store: s.store,
    line: s.line,
    now: s.now,
    trace: s.trace,
    scopeNodeId: s.scopeNodeId,
  };
}

function applyTurn(
  state: SessionState,
  utterance: string,
  turn: TurnResult,
): { state: SessionState; turn: TurnResult } {
  const pending: PendingApproval[] = [];
  const pieces = [...state.pieces];
  const lookups = [...state.lookups];
  const decisions = [...state.decisions];

  turn.results.forEach((r, i) => {
    const data = r.result.data as Record<string, unknown> | undefined;
    if (data?.piece) pieces.push(data.piece as Piece);
    if (data?.card && r.tool === "lookup") lookups.push(data.card as LookupCard);
    if (data?.card && r.tool === "make_decision_card") decisions.push(data.card as DecisionCard);

    if (r.result.needsApproval && r.result.ok) {
      pending.push({
        id: `${turn.trace.runId}_${i}`,
        tool: r.tool,
        summary: r.result.summary,
        boundary: r.result.boundary,
        result: r.result,
      });
    }
  });

  return {
    state: {
      ...state,
      materials: turn.ctx.materials,
      store: turn.ctx.store,
      line: turn.ctx.line ?? state.line,
      trace: turn.trace,
      pieces,
      lookups,
      decisions,
      pending: [...state.pending, ...pending],
      history: [
        ...state.history,
        { utterance, narration: turn.plan.narration, at: state.now },
      ],
    },
    turn,
  };
}

/** 说一句话 → 跑一个回合（本地规则规划） */
export function say(
  state: SessionState,
  utterance: string,
  registry: ToolRegistry = createRegistry(),
): { state: SessionState; turn: TurnResult } {
  const turn = runTurn(utterance, toContext(state), registry);
  return applyTurn(state, utterance, turn);
}

/**
 * 异步回合：
 * - MINGXI_LLM_MODE=siliconflow（推荐）或 deepseek → 模型选工具
 * - local → 规则规划
 * 执行一律走本地注册表；LLM 失败自动回退规则规划。
 */
export async function sayAsync(
  state: SessionState,
  utterance: string,
  registry: ToolRegistry = createRegistry(),
): Promise<{ state: SessionState; turn: TurnResult; planner: string; model?: string }> {
  if (!mingxiUsesLlmPlanner()) {
    const turn = await runTurnAsync(utterance, toContext(state), registry);
    const applied = applyTurn(state, utterance, turn);
    return { ...applied, planner: "local-async" };
  }
  const turn = await runTurnWithLlm(utterance, toContext(state), registry);
  const applied = applyTurn(state, utterance, turn);
  return {
    ...applied,
    planner: turn.planner,
    model: turn.model,
  };
}

/** 用户点「接受」 */
export function approve(state: SessionState, pendingId: string): SessionState {
  const item = state.pending.find((p) => p.id === pendingId);
  if (!item) return state;
  const ctx = applyPatch(toContext(state), item.result);
  return {
    ...state,
    materials: ctx.materials,
    line: ctx.line,
    store: ctx.store,
    pending: state.pending.filter((p) => p.id !== pendingId),
  };
}

/** 用户点「放弃」 */
export function reject(state: SessionState, pendingId: string): SessionState {
  return { ...state, pending: state.pending.filter((p) => p.id !== pendingId) };
}
