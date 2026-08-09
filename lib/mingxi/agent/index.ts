/**
 * 明晰 Agent · 对外门面
 *
 * 分层：
 *   agent/   编排 · 工具注册表 · 策略闸门 · 运行轨迹 · 会话
 *   llm/     DeepSeek 等远程模型客户端
 *   engine/  能力内核（纯函数）
 *   data/    数据集
 *   eval/    评测 runner
 *
 * 运行模式（.env）：
 *   MINGXI_LLM_MODE=local        → 规则规划（默认可复现）
 *   MINGXI_LLM_MODE=siliconflow  → 硅基流动选工具 + 本地执行（推荐，与 Vision 同 key）
 *   MINGXI_LLM_MODE=deepseek     → DeepSeek 纯文本规划（可选备用）
 */
export * from "./trace.ts";
export * from "./policy.ts";
export * from "./tool-registry.ts";
export * from "./orchestrator.ts";
export * from "./session.ts";
export { createRegistry } from "./tools/index.ts";

import type { Material, ProfileStore } from "../types.ts";
import { createRegistry } from "./tools/index.ts";
import { createSession, say, sayAsync, approve, reject } from "./session.ts";
import type { SessionState } from "./session.ts";
import { describeTrace } from "./trace.ts";
import { mingxiLlmMode } from "../llm/env.ts";

export type CreateAgentOpts = {
  now?: string;
  store?: ProfileStore;
};

export function createAgent(materials: Material[], nowOrOpts?: string | CreateAgentOpts) {
  const registry = createRegistry();
  const opts: CreateAgentOpts =
    typeof nowOrOpts === "string" ? { now: nowOrOpts } : nowOrOpts ?? {};
  let state: SessionState = createSession(materials, opts.now);
  if (opts.store) state = { ...state, store: opts.store };

  return {
    get state() {
      return state;
    },
    get tools() {
      return registry.list();
    },
    get mode() {
      return mingxiLlmMode();
    },
    functionSpecs: () => registry.toFunctionSpecs(),

    /** 本地规则规划（同步、可复现） */
    say(utterance: string) {
      const r = say(state, utterance, registry);
      state = r.state;
      return {
        intent: r.turn.plan.intent,
        narration: r.turn.plan.narration,
        awaitingApproval: r.turn.awaitingApproval,
        summaries: r.turn.results.map((x) => x.result.summary),
        results: r.turn.results,
        pending: state.pending,
        planner: "local" as const,
      };
    },

    /**
     * 真实 LLM 回合：模型选工具 → 本地执行。
     * 推荐 .env：MINGXI_LLM_MODE=siliconflow + SILICONFLOW_API_KEY
     * （DeepSeek 仅备用：MINGXI_LLM_MODE=deepseek）
     */
    async sayAsync(utterance: string) {
      const r = await sayAsync(state, utterance, registry);
      state = r.state;
      return {
        intent: r.turn.plan.intent,
        narration: r.turn.plan.narration,
        awaitingApproval: r.turn.awaitingApproval,
        summaries: r.turn.results.map((x) => x.result.summary),
        results: r.turn.results,
        pending: state.pending,
        planner: r.planner,
        model: r.model,
      };
    },

    approve(pendingId: string) {
      state = approve(state, pendingId);
      return state;
    },
    approveAll() {
      for (const p of [...state.pending]) state = approve(state, p.id);
      return state;
    },
    reject(pendingId: string) {
      state = reject(state, pendingId);
      return state;
    },

    setLockedNodes(nodeIds: string[]) {
      if (!state.line) return state;
      const lockedNodeIds = Array.from(new Set(nodeIds));
      state = {
        ...state,
        line: {
          ...state.line,
          lockedNodeIds,
          nodes: state.line.nodes.map((node) => ({
            ...node,
            locked: lockedNodeIds.includes(node.id),
          })),
        },
      };
      return state;
    },

    trace: () => describeTrace(state.trace),
  };
}

export type MingxiAgent = ReturnType<typeof createAgent>;
