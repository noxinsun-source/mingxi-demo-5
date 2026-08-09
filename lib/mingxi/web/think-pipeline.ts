/**
 * 网页工作台 · 对话梳链管线（Agent Harness 主路径）
 *
 * library_retrieve → (可选 web_search + web_read) → preview_angle → reline → 人确认
 */
import type {
  AngleSpec,
  Line,
  LineDiff,
  LineNode,
  Material,
  ProfileStore,
} from "../types.ts";
import { parseAngle } from "../engine/angle.ts";
import { emptyStore } from "../engine/learning.ts";
import { createAgent, type MingxiAgent } from "../agent/index.ts";
import { describeTrace } from "../agent/trace.ts";
import type { LibraryNote } from "./library-data.ts";
import {
  libraryNotesToMaterials,
  materialIdFromNoteId,
  noteIdByMaterialId,
  retrieveLibraryNotes,
  type RetrieveFilter,
} from "./retrieve.ts";
import {
  markLibraryNotes,
  webHitsToNotes,
  webNotesToMaterials,
} from "./web-citations.ts";
import type { WebReadResult, WebSearchHit } from "../agent/tools/web-tools.ts";

export type { RetrieveFilter };
export {
  libraryNotesToMaterials,
  materialIdFromNoteId,
  noteIdByMaterialId,
  retrieveLibraryNotes,
};

export interface LogicNode {
  id: string;
  label: string;
  kind: "intent" | "spine" | "branch" | "note" | "action" | "concept";
  noteId?: string;
  purposeLabel?: string;
  done?: boolean;
  parentId?: string;
  /** library=仓库 · web=联网 */
  sourceKind?: "library" | "web";
}

export interface LogicEdge {
  from: string;
  to: string;
  label?: string;
}

export interface HarnessStepView {
  tool: string;
  title?: string;
  summary: string;
  status: string;
  provenance?: string;
}

function kindOfNode(node: LineNode): LogicNode["kind"] {
  if (node.level === 1) return "spine";
  if (node.kind === "行动") return "action";
  if (node.kind === "反对" || node.kind === "疑问") return "branch";
  if (node.materialIds?.length) return "note";
  if (node.level === 2) return "branch";
  return "concept";
}

function sourceKindOfNote(note?: LibraryNote): "library" | "web" | undefined {
  if (!note) return undefined;
  if (note.sourceKind === "web" || note.tags?.includes("source:web")) return "web";
  return "library";
}

/** 引擎 Line → 工作台 LogicMindMap（带仓库/网络来源色） */
export function lineToLogicGraph(
  line: Line,
  notes: LibraryNote[],
  utterance: string,
): { nodes: LogicNode[]; edges: LogicEdge[] } {
  const idMap = noteIdByMaterialId(notes);
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const nodes: LogicNode[] = [
    {
      id: "intent",
      label: (utterance || line.angleText || "用户意图").slice(0, 22),
      kind: "intent",
      done: true,
    },
  ];
  const edges: LogicEdge[] = [];

  const sorted = [...line.nodes].sort((a, b) => a.level - b.level || a.order - b.order);
  const rootIds = sorted.filter((n) => n.level === 1).map((n) => n.id);

  for (const root of rootIds) {
    edges.push({ from: "intent", to: root, label: line.angle.order });
  }

  // 若有网络笔记，加一条「网络补证」分支，便于色区分
  const webNotes = notes.filter((n) => sourceKindOfNote(n) === "web");
  let webBranchId: string | null = null;
  if (webNotes.length) {
    webBranchId = "branch_web";
    nodes.push({
      id: webBranchId,
      label: "网络补证",
      kind: "branch",
      parentId: rootIds[0] || "intent",
      sourceKind: "web",
      done: true,
    });
    edges.push({ from: rootIds[0] || "intent", to: webBranchId, label: "联网" });
  }

  for (const n of sorted) {
    const mid = n.materialIds?.[0];
    const noteId = mid ? idMap.get(mid) : undefined;
    const note = noteId ? noteById.get(noteId) : undefined;
    const sk = sourceKindOfNote(note);
    const isWebNote = sk === "web";
    nodes.push({
      id: n.id,
      label: (note?.title || n.text).slice(0, 14),
      kind: kindOfNode(n),
      noteId,
      purposeLabel: isWebNote ? "网络" : note?.purposeLabel,
      parentId:
        isWebNote && webBranchId
          ? webBranchId
          : n.parentId ?? (n.level === 1 ? "intent" : undefined),
      done: true,
      sourceKind: sk,
    });
    if (isWebNote && webBranchId) {
      edges.push({ from: webBranchId, to: n.id, label: "web" });
    } else if (n.parentId) {
      edges.push({ from: n.parentId, to: n.id });
    }
  }

  // 挂上尚未进入 Line 的网络页（保证颜色可见）
  const usedNoteIds = new Set(nodes.map((x) => x.noteId).filter(Boolean));
  webNotes.forEach((wn, i) => {
    if (usedNoteIds.has(wn.id)) return;
    const id = `web_leaf_${i}`;
    nodes.push({
      id,
      label: wn.title.slice(0, 14),
      kind: "note",
      noteId: wn.id,
      purposeLabel: "网络",
      parentId: webBranchId || rootIds[0] || "intent",
      done: true,
      sourceKind: "web",
    });
    edges.push({ from: webBranchId || rootIds[0] || "intent", to: id, label: "web" });
  });

  if (!nodes.some((x) => x.kind === "action")) {
    nodes.push({ id: "out", label: "可执行清单", kind: "action", done: false });
    const lastSpine = rootIds[rootIds.length - 1] || "intent";
    edges.push({ from: lastSpine, to: "out" });
  }

  return { nodes, edges };
}

export function templateAnswer(
  utterance: string,
  angle: AngleSpec,
  hits: LibraryNote[],
  line: Line,
): string {
  const lib = hits.filter((n) => sourceKindOfNote(n) !== "web");
  const web = hits.filter((n) => sourceKindOfNote(n) === "web");
  const neg = lib.filter(
    (n) => n.polarity === "negative_caution" || n.purposeLabel === "反例避坑",
  );
  const pos = lib.filter(
    (n) => n.polarity === "positive_exemplar" || n.purposeLabel === "学习理论",
  );
  const lines = [
    `## 按你的意图梳出的逻辑报告`,
    ``,
    `意图：${utterance}`,
    `角度：\`${angle.order}\` · 分组 \`${angle.groupBy}\` · 置信 ${angle.confidence.toFixed(2)}`,
    web.length ? `联网：已补充 ${web.length} 条公开网页` : `联网：未开启`,
    ``,
    `### 主逻辑链（Agent Harness · ${line.nodes.length} 节点）`,
    ...line.nodes
      .filter((n) => n.level <= 2)
      .slice(0, 8)
      .map((n, i) => `${i + 1}. **${n.text.slice(0, 48)}** (${n.kind})`),
    ``,
    `### 仓库笔记`,
    ...lib.slice(0, 8).map(
      (n, i) =>
        `${i + 1}. **${n.title}** [cite:${n.id}] — ${n.purposeLabel} · ${n.summary.slice(0, 80)}`,
    ),
    ``,
    web.length
      ? `### 网络来源（与仓库区分）\n${web
          .slice(0, 6)
          .map(
            (n, i) =>
              `${i + 1}. **${n.title}** [cite:${n.id}] — ${n.sourceUri || ""}\n   ${n.summary.slice(0, 100)}`,
          )
          .join("\n")}`
      : "",
    ``,
    neg.length
      ? `### 避雷（勿照做）\n${neg
          .slice(0, 4)
          .map((n) => `- **${n.title}** [cite:${n.id}]`)
          .join("\n")}`
      : "",
    pos.length
      ? `### 可学参考\n${pos
          .slice(0, 4)
          .map((n) => `- **${n.title}** [cite:${n.id}]`)
          .join("\n")}`
      : "",
    ``,
    `右侧画布：墨绿=仓库笔记，青绿=网络页。点「确认生效」后写入会话链路。`,
  ];
  return lines.filter(Boolean).join("\n");
}

export interface RelinePipelineResult {
  agent: MingxiAgent;
  angle: AngleSpec;
  line: Line | null;
  diff?: LineDiff;
  pendingId: string | null;
  clarifyingQuestion?: string;
  narration: string;
  intent: string;
  awaitingApproval: boolean;
  planner: string;
  model?: string;
  citations: LibraryNote[];
  harnessSteps: HarnessStepView[];
  traceLines: string[];
  webSearchUsed?: boolean;
}

function extractCitationsFromResults(
  results: Array<{ tool: string; result: { data?: unknown } }>,
): LibraryNote[] {
  for (const r of results) {
    if (r.tool !== "library_retrieve") continue;
    const data = r.result.data as { notes?: LibraryNote[] } | undefined;
    if (data?.notes?.length) return markLibraryNotes(data.notes);
  }
  return [];
}

function stepView(
  results: Array<{ tool: string; result: { summary: string; ok?: boolean; needsApproval?: boolean } }>,
): HarnessStepView[] {
  return results.map((x) => ({
    tool: x.tool,
    summary: x.result.summary,
    status: x.result.needsApproval ? "awaiting_approval" : x.result.ok === false ? "error" : "ok",
  }));
}

/** 同步兼容入口（评测用） */
export function runRelinePipeline(input: {
  utterance: string;
  materials?: Material[];
  store?: ProfileStore;
  lockedNodeIds?: string[];
}): RelinePipelineResult {
  const angle = parseAngle(input.utterance);
  const agent = createAgent(input.materials ?? [], {
    now: new Date().toISOString(),
    store: input.store,
  });
  const r = agent.say(input.utterance);
  const pendingReline = r.pending.find((p) => p.tool === "reline") || r.pending[0];
  const data = pendingReline?.result.data as { line?: Line } | undefined;
  const line = data?.line ?? agent.state.line ?? null;
  const citations = extractCitationsFromResults(r.results);

  return {
    agent,
    angle: line?.angle ?? angle,
    line,
    diff: line?.diff,
    pendingId: pendingReline?.id ?? null,
    clarifyingQuestion: line?.pending?.question,
    narration: r.narration,
    intent: r.intent,
    awaitingApproval: Boolean(r.awaitingApproval && pendingReline),
    planner: "local",
    citations,
    harnessSteps: stepView(r.results),
    traceLines: describeTrace(agent.state.trace),
    webSearchUsed: false,
  };
}

async function runWebAugment(input: {
  utterance: string;
  materials: Material[];
  store: ProfileStore;
  now: string;
  retrieveLimit: number;
  maxWebReads?: number;
}): Promise<{
  materials: Material[];
  citations: LibraryNote[];
  harnessSteps: HarnessStepView[];
  webHits: number;
}> {
  const { executeAsync } = await import("../agent/orchestrator.ts");
  const { createRegistry } = await import("../agent/tools/index.ts");
  const { createTrace } = await import("../agent/trace.ts");
  const registry = createRegistry();
  const maxReads = input.maxWebReads ?? 3;

  let ctx = {
    materials: input.materials,
    store: input.store,
    now: input.now,
    trace: createTrace(`web_${Date.now()}`, input.now),
  };

  const retrieveSteps = [
    {
      tool: "library_retrieve",
      input: { query: input.utterance, limit: input.retrieveLimit },
      why: "仓库召回",
    },
    {
      tool: "web_search",
      input: { query: input.utterance, maxResults: 5 },
      why: "真实联网搜索",
    },
  ];
  const { ctx: afterSearch, results: searchResults } = await executeAsync(
    retrieveSteps,
    ctx,
    registry,
  );
  ctx = afterSearch;

  const libNotes = extractCitationsFromResults(searchResults);
  const searchData = searchResults.find((r) => r.tool === "web_search")?.result
    .data as { hits?: WebSearchHit[] } | undefined;
  const hits = (searchData?.hits || []).filter((h) => h.url);

  const pages: WebReadResult[] = [];
  const readResults: typeof searchResults = [];
  for (const hit of hits.slice(0, maxReads)) {
    const { ctx: next, results } = await executeAsync(
      [{ tool: "web_read", input: { url: hit.url }, why: `阅读 ${hit.title || hit.url}` }],
      ctx,
      registry,
    );
    ctx = next;
    readResults.push(...results);
    const page = results[0]?.result.data as { page?: WebReadResult } | undefined;
    if (page?.page) pages.push(page.page);
  }

  const webNotes = webHitsToNotes(hits, pages);
  const webMats = webNotesToMaterials(webNotes);
  const materials = [...ctx.materials, ...webMats];
  const citations = [...libNotes, ...webNotes];

  return {
    materials,
    citations,
    harnessSteps: stepView([...searchResults, ...readResults]),
    webHits: webNotes.length,
  };
}

/**
 * 产品主路径：走 Agent Harness（sayAsync）
 * webSearch=true 时：真实 web_search + web_read，再与仓库笔记一并建链
 */
/** 从 Agent 会话材料反推引用笔记（lookup/decide 路径用） */
export function markLibraryNotesFromAgent(agent: MingxiAgent): LibraryNote[] {
  const mats = agent.state.materials || [];
  return markLibraryNotes(
    mats.slice(0, 16).map((m) => {
      const noteId = m.id.replace(/^mat_/, "");
      const text = m.blocks?.[0]?.text || "";
      return {
        id: noteId,
        corpusId: m.id,
        title: m.source?.title || noteId,
        summary: text.slice(0, 160),
        preview: text.slice(0, 400),
        modality: String(m.modality || "webpage"),
        purposeLabel: m.purpose?.label || "资料收藏",
        polarity: "neutral_observe",
        stance: "transform_ok",
        domainPath: (m.tags || []).slice(0, 3).length
          ? (m.tags || []).slice(0, 3)
          : ["未分类"],
        functionalTypes: [] as string[],
        userGoals: [] as string[],
        tags: m.tags || [],
        sourceKind: "library" as const,
      };
    }),
  );
}

export async function runRelinePipelineAsync(input: {
  utterance: string;
  materials?: Material[];
  store?: ProfileStore;
  agentMode?: "agent" | "ask" | "plan";
  retrieveLimit?: number;
  existingAgent?: MingxiAgent;
  /** 开启真实联网搜索 */
  webSearch?: boolean;
  lockedNodeIds?: string[];
  scopeNodeId?: string;
  /**
   * 演示/样例：强制走本地规则规划（library_retrieve→preview_angle→reline），
   * 避免 LLM 只召回就 clarify，导致逻辑画布空白。
   */
  forceLocalPlan?: boolean;
}): Promise<RelinePipelineResult> {
  const angle = parseAngle(input.utterance);
  const now = new Date().toISOString();
  const store = input.store ?? emptyStore();
  const mode = input.agentMode ?? "agent";
  const webSearch = Boolean(input.webSearch);
  const retrieveLimit = input.retrieveLimit ?? 14;
  const lockedNodeIds = input.lockedNodeIds ?? [];
  const scopeNodeId = input.scopeNodeId;

  function sealLocks(agent: MingxiAgent) {
    if (!agent.state.line) return;
    if (lockedNodeIds.length) {
      agent.state.line.lockedNodeIds = [...lockedNodeIds];
      for (const n of agent.state.line.nodes) n.locked = lockedNodeIds.includes(n.id);
    }
  }

  // —— 联网增强：先召回仓库 + 真实搜索/阅读 ——
  if (webSearch) {
    const aug = await runWebAugment({
      utterance: input.utterance,
      materials: input.materials ?? [],
      store,
      now,
      retrieveLimit,
      maxWebReads: 3,
    });

    if (mode === "ask" || mode === "plan") {
      const agent = createAgent(aug.materials, { now, store });
      const previewSteps =
        mode === "plan"
          ? [
              {
                tool: "preview_angle",
                input: { angleText: input.utterance },
                why: "预览角度",
              },
            ]
          : [];
      let extraSteps: HarnessStepView[] = [];
      if (previewSteps.length) {
        const { executeAsync } = await import("../agent/orchestrator.ts");
        const { createRegistry } = await import("../agent/tools/index.ts");
        const { createTrace } = await import("../agent/trace.ts");
        const { results } = await executeAsync(
          previewSteps,
          {
            materials: aug.materials,
            store,
            now,
            trace: createTrace(`plan_web_${Date.now()}`, now),
          },
          createRegistry(),
        );
        extraSteps = stepView(results);
      }
      return {
        agent,
        angle,
        line: null,
        pendingId: null,
        clarifyingQuestion:
          mode === "plan"
            ? `已联网补充 ${aug.webHits} 条网页；切换 Agent 模式可建链。`
            : undefined,
        narration: `已仓库召回 ${aug.citations.filter((c) => c.sourceKind !== "web").length} 条，联网 ${aug.webHits} 条。`,
        intent: mode === "plan" ? "reline" : "clarify",
        awaitingApproval: false,
        planner: "local-async",
        citations: aug.citations,
        harnessSteps: [...aug.harnessSteps, ...extraSteps],
        traceLines: [...aug.harnessSteps, ...extraSteps].map((s) => `${s.tool}: ${s.summary}`),
        webSearchUsed: true,
      };
    }

    // Agent：材料已含仓库+网络 → sayAsync 走 preview→reline（跳过二次 retrieve）
    const agent = createAgent(aug.materials, { now, store });
    sealLocks(agent);
    if (scopeNodeId) agent.state.scopeNodeId = scopeNodeId;
    const r = await agent.sayAsync(input.utterance);
    const pendingReline = r.pending.find((p) => p.tool === "reline") || r.pending[0];
    const data = pendingReline?.result.data as { line?: Line } | undefined;
    const line = data?.line ?? agent.state.line ?? null;

    return {
      agent,
      angle: line?.angle ?? angle,
      line,
      diff: line?.diff,
      pendingId: pendingReline?.id ?? null,
      clarifyingQuestion: line?.pending?.question,
      narration: `${r.narration}（已联网补充 ${aug.webHits} 条网页）`,
      intent: r.intent,
      awaitingApproval: Boolean(r.awaitingApproval && pendingReline),
      planner: r.planner,
      model: r.model,
      citations: aug.citations,
      harnessSteps: [
        ...aug.harnessSteps,
        ...stepView(r.results),
      ],
      traceLines: [
        ...aug.harnessSteps.map((s) => `${s.tool}: ${s.summary}`),
        ...describeTrace(agent.state.trace),
      ],
      webSearchUsed: true,
    };
  }

  // —— 未联网：原 Harness 路径 ——
  const agent =
    input.existingAgent ??
    createAgent(input.materials ?? [], {
      now,
      store: input.store,
    });

  if (mode === "plan" || mode === "ask") {
    const { executeAsync } = await import("../agent/orchestrator.ts");
    const { createRegistry } = await import("../agent/tools/index.ts");
    const { createTrace } = await import("../agent/trace.ts");
    const registry = createRegistry();
    const steps =
      mode === "plan"
        ? [
            {
              tool: "library_retrieve",
              input: { query: input.utterance, limit: retrieveLimit },
              why: "召回",
            },
            { tool: "preview_angle", input: { angleText: input.utterance }, why: "预览角度" },
          ]
        : [
            {
              tool: "library_retrieve",
              input: { query: input.utterance, limit: retrieveLimit },
              why: "召回供问答",
            },
          ];
    const { results } = await executeAsync(
      steps,
      {
        materials: agent.state.materials,
        store: agent.state.store,
        line: agent.state.line,
        now: agent.state.now,
        trace: createTrace(`plan_${Date.now()}`, agent.state.now),
      },
      registry,
    );
    const citations = extractCitationsFromResults(results);
    const preview = results.find((r) => r.tool === "preview_angle");
    const previewData = preview?.result.data as { order?: string; confidence?: number } | undefined;
    return {
      agent,
      angle: {
        ...angle,
        order: (previewData?.order as AngleSpec["order"]) || angle.order,
        confidence: previewData?.confidence ?? angle.confidence,
      },
      line: null,
      pendingId: null,
      clarifyingQuestion:
        mode === "plan"
          ? `角度草案：${previewData?.order || angle.order}。切换 Agent 模式并再说一遍即可建链。`
          : undefined,
      narration:
        mode === "plan"
          ? "已召回笔记并解析角度草案；尚未建链（Plan 模式）。"
          : "已召回相关笔记，供问答旁白（Ask 模式不改逻辑图）。",
      intent: mode === "plan" ? "reline" : "clarify",
      awaitingApproval: false,
      planner: "local-async",
      citations,
      harnessSteps: stepView(results),
      traceLines: results.map((x) => `${x.tool}: ${x.result.summary}`),
      webSearchUsed: false,
    };
  }

  sealLocks(agent);
  if (scopeNodeId) agent.state.scopeNodeId = scopeNodeId;
  // 演示样例：本地规则必出链；日常对话仍走 sayAsync（LLM 选工具 + 保底补链）
  const r = input.forceLocalPlan
    ? (() => {
        const local = agent.say(input.utterance);
        return { ...local, model: undefined as string | undefined };
      })()
    : await agent.sayAsync(input.utterance);
  const pendingReline = r.pending.find((p) => p.tool === "reline") || r.pending[0];
  const data = pendingReline?.result.data as { line?: Line } | undefined;
  const line = data?.line ?? agent.state.line ?? null;
  const citations = markLibraryNotes(extractCitationsFromResults(r.results));

  return {
    agent,
    angle: line?.angle ?? angle,
    line,
    diff: line?.diff,
    pendingId: pendingReline?.id ?? null,
    clarifyingQuestion: line?.pending?.question,
    narration: input.forceLocalPlan
      ? `${r.narration}（演示模式：本地规则规划，保证出图）`
      : r.narration,
    intent: r.intent,
    awaitingApproval: Boolean(r.awaitingApproval && pendingReline),
    planner: input.forceLocalPlan ? "local" : r.planner,
    model: r.model,
    citations,
    harnessSteps: stepView(r.results),
    traceLines: describeTrace(agent.state.trace),
    webSearchUsed: false,
  };
}
