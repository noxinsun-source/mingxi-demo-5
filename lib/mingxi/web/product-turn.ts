/**
 * 产品 Demo 统一 Agent 回合
 * 按意图分流：reline / lookup / decide / memory / organize(clarify→reline)
 * 保证网页端能拿到结构化卡片，而不只是梳链图。
 */
import type {
  AngleSpec,
  DecisionCard,
  Line,
  LookupCard,
  Material,
  ProfileStore,
} from "../types.ts";
import { createAgent, type MingxiAgent, detectIntent } from "../agent/index.ts";
import { emptyStore } from "../engine/learning.ts";
import { runLookup } from "../engine/lookup.ts";
import { buildLiveLookupCard, mergeLookupCards } from "../engine/lookup-live.ts";
import {
  type HarnessStepView,
  type RelinePipelineResult,
  runRelinePipelineAsync,
  markLibraryNotesFromAgent,
} from "./think-pipeline.ts";

export type ProductIntent =
  | "reline"
  | "lookup"
  | "decide"
  | "memory"
  | "organize"
  | "ingest"
  | "clarify";

export interface ProductTurnInput {
  utterance: string;
  store?: ProfileStore;
  materials?: Material[];
  existingAgent?: MingxiAgent;
  agentMode?: "agent" | "ask" | "plan";
  retrieveLimit?: number;
  webSearch?: boolean;
  lockedNodeIds?: string[];
  scopeNodeId?: string;
  /** 强制意图（UI 快捷按钮） */
  intentHint?: ProductIntent;
  /** 演示样例：强制本地规则梳链，保证逻辑画布有图 */
  forceLocalPlan?: boolean;
}

export interface ProductTurnResult extends RelinePipelineResult {
  productIntent: ProductIntent;
  lookupCard: LookupCard | null;
  decisionCard: DecisionCard | null;
  organizePieces: Array<{
    materialId: string;
    recipe: string;
    blocks: Array<{ role: string; text: string }>;
  }>;
}

const EMPTY_ANGLE: AngleSpec = {
  order: "default",
  groupBy: "theme",
  emphasis: [],
  depth: 2,
  confidence: 0,
};

function asIntent(raw: string): ProductIntent {
  if (
    raw === "reline" ||
    raw === "lookup" ||
    raw === "decide" ||
    raw === "memory" ||
    raw === "organize" ||
    raw === "ingest" ||
    raw === "clarify"
  ) {
    return raw;
  }
  return "clarify";
}

function applyLocks(agent: MingxiAgent, lockedNodeIds?: string[], scopeNodeId?: string) {
  const line = agent.state.line;
  if (line && lockedNodeIds?.length) {
    line.lockedNodeIds = [...lockedNodeIds];
    for (const n of line.nodes) n.locked = lockedNodeIds.includes(n.id);
  }
  if (scopeNodeId) agent.state.scopeNodeId = scopeNodeId;
}

async function runLookupProduct(input: ProductTurnInput): Promise<ProductTurnResult> {
  const now = new Date().toISOString();
  const store = input.store ?? emptyStore();
  const agent =
    input.existingAgent ?? createAgent(input.materials ?? [], { now, store });
  applyLocks(agent, input.lockedNodeIds, input.scopeNodeId);

  const harnessSteps: HarnessStepView[] = [];
  let liveCard: LookupCard | null = null;

  if (input.webSearch !== false) {
    try {
      const { executeAsync } = await import("../agent/orchestrator.ts");
      const { createRegistry } = await import("../agent/tools/index.ts");
      const { createTrace } = await import("../agent/trace.ts");
      const registry = createRegistry();
      const { results } = await executeAsync(
        [
          {
            tool: "web_search",
            input: { query: input.utterance, maxResults: 5 },
            why: "实时外查搜索",
          },
        ],
        {
          materials: agent.state.materials,
          store: agent.state.store,
          line: agent.state.line,
          now: agent.state.now,
          trace: createTrace(`lookup_${Date.now()}`, agent.state.now),
        },
        registry,
      );
      for (const r of results) {
        harnessSteps.push({
          tool: r.tool,
          summary: r.result.summary,
          status: r.result.ok === false ? "error" : "ok",
        });
      }
      const hits =
        (
          results.find((r) => r.tool === "web_search")?.result.data as {
            hits?: Array<{ title?: string; url?: string; snippet?: string }>;
          }
        )?.hits || [];
      liveCard = buildLiveLookupCard({
        question: input.utterance,
        hits: hits.map((h) => ({
          title: h.title || "",
          url: h.url || "",
          snippet: h.snippet || "",
        })),
      });
    } catch (err) {
      harnessSteps.push({
        tool: "web_search",
        summary: `联网失败：${err instanceof Error ? err.message : String(err)}`,
        status: "error",
      });
    }
  }

  const replay = runLookup(input.utterance);
  const lookupCard =
    liveCard && liveCard.findings.length
      ? mergeLookupCards(liveCard, replay)
      : replay;

  harnessSteps.push({
    tool: "lookup",
    summary:
      lookupCard.mode === "Live"
        ? `Live 外查 ${lookupCard.findings.length} 条证据 · 待人审`
        : replay.status === "no_result"
          ? "无可靠结果（Replay/Live 皆空）"
          : `Replay 外查卡 · ${replay.findings.length} 条`,
    status: lookupCard.status === "awaiting_review" ? "awaiting_approval" : "ok",
  });

  const idx = agent.state.lookups.findIndex((c) => c.question === lookupCard.question);
  if (idx >= 0) agent.state.lookups[idx] = lookupCard;
  else agent.state.lookups.push(lookupCard);

  // 挂一条 pending，供写回 API / 会话复用
  const pendingId = `lookup_${Date.now().toString(36)}`;
  agent.state.pending.push({
    id: pendingId,
    tool: "lookup",
    summary: harnessSteps[harnessSteps.length - 1]?.summary || "外查待审",
    result: {
      ok: true,
      summary: harnessSteps[harnessSteps.length - 1]?.summary || "外查待审",
      needsApproval: true,
      data: { card: lookupCard },
    },
  });

  return {
    agent,
    angle: agent.state.line?.angle ?? EMPTY_ANGLE,
    line: agent.state.line ?? null,
    pendingId,
    narration:
      lookupCard.mode === "Live"
        ? `已实时搜索并整理外查卡（${lookupCard.findings.length} 条证据），批准后才能写回链路。`
        : lookupCard.status === "no_result"
          ? lookupCard.fallbackAdvice?.[0] || "没有可靠结果"
          : `外查卡（Replay）已就绪：${lookupCard.findings.length} 条证据，待你批准写回。`,
    intent: "lookup",
    productIntent: "lookup",
    awaitingApproval: lookupCard.status === "awaiting_review",
    planner: "local-async",
    citations: markLibraryNotesFromAgent(agent),
    harnessSteps,
    traceLines: harnessSteps.map((s) => `${s.tool}: ${s.summary}`),
    webSearchUsed: Boolean(liveCard?.findings.length),
    lookupCard,
    decisionCard: null,
    organizePieces: [],
  };
}

async function runDecideProduct(input: ProductTurnInput): Promise<ProductTurnResult> {
  const now = new Date().toISOString();
  const store = input.store ?? emptyStore();
  const agent =
    input.existingAgent ?? createAgent(input.materials ?? [], { now, store });
  applyLocks(agent, input.lockedNodeIds, input.scopeNodeId);

  const { executeAsync } = await import("../agent/orchestrator.ts");
  const { createRegistry } = await import("../agent/tools/index.ts");
  const { createTrace } = await import("../agent/trace.ts");
  const registry = createRegistry();
  const steps = [
    ...(agent.state.materials.length === 0
      ? [
          {
            tool: "library_retrieve",
            input: { query: input.utterance, limit: input.retrieveLimit ?? 12 },
            why: "决断前召回证据",
          },
        ]
      : []),
    {
      tool: "make_decision_card",
      input: { question: input.utterance },
      why: "结构化决断卡",
    },
  ];
  const { ctx, results } = await executeAsync(
    steps,
    {
      materials: agent.state.materials,
      store: agent.state.store,
      line: agent.state.line,
      now: agent.state.now,
      trace: createTrace(`decide_${Date.now()}`, agent.state.now),
    },
    registry,
  );
  agent.state.materials = ctx.materials;
  if (ctx.line) agent.state.line = ctx.line;

  const fromTool = results.find((x) => x.tool === "make_decision_card")?.result
    .data as { card?: DecisionCard } | undefined;
  const decision = fromTool?.card || null;
  if (decision) {
    const exists = agent.state.decisions.some((d) => d.id === decision.id);
    if (!exists) agent.state.decisions.push(decision);
  }

  return {
    agent,
    angle: agent.state.line?.angle ?? EMPTY_ANGLE,
    line: agent.state.line ?? null,
    pendingId: null,
    narration: decision
      ? decision.refused
        ? `证据不足，我弃权：${decision.refusedReason || "未知项过多"}`
        : `已列出 ${decision.options.length} 个选项与未知项，请你拍板。`
      : "未能生成决断卡",
    intent: "decide",
    productIntent: "decide",
    awaitingApproval: false,
    planner: "local-async",
    citations: markLibraryNotesFromAgent(agent),
    harnessSteps: results.map((x) => ({
      tool: x.tool,
      summary: x.result.summary,
      status: x.result.needsApproval
        ? "awaiting_approval"
        : x.result.ok === false
          ? "error"
          : "ok",
    })),
    traceLines: results.map((x) => `${x.tool}: ${x.result.summary}`),
    webSearchUsed: false,
    lookupCard: null,
    decisionCard: decision,
    organizePieces: [],
  };
}

export async function runProductTurn(input: ProductTurnInput): Promise<ProductTurnResult> {
  const hinted = input.intentHint;
  const detected = asIntent(detectIntent(input.utterance));
  const intent: ProductIntent = hinted || detected;

  if (intent === "lookup") return runLookupProduct(input);
  if (intent === "decide") return runDecideProduct(input);

  const pipe = await runRelinePipelineAsync({
    utterance: input.utterance,
    store: input.store,
    materials: input.materials,
    existingAgent: input.existingAgent,
    agentMode: input.agentMode,
    retrieveLimit: input.retrieveLimit,
    webSearch: input.webSearch,
    lockedNodeIds: input.lockedNodeIds,
    scopeNodeId: input.scopeNodeId,
    forceLocalPlan: input.forceLocalPlan,
  });

  return {
    ...pipe,
    productIntent:
      intent === "organize" || intent === "ingest" || intent === "memory"
        ? intent
        : "reline",
    lookupCard: null,
    decisionCard: null,
    organizePieces: [],
  };
}

export function lineHasLocks(line: Line | null | undefined, lockedNodeIds: string[]): Line | null {
  if (!line) return null;
  return {
    ...line,
    lockedNodeIds: [...lockedNodeIds],
    nodes: line.nodes.map((n) => ({ ...n, locked: lockedNodeIds.includes(n.id) })),
  };
}
