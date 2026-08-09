/**
 * 工具集合（Agent 能做的全部动作，一个不多）
 */
import type { AgentContext, ToolResult, ToolSpec } from "../tool-registry.ts";
import { ToolRegistry } from "../tool-registry.ts";
import { BOUNDARIES, evaluate } from "../policy.ts";

import type {
  DecisionCard,
  Line,
  LookupCard,
  Material,
  Piece,
  ProfileEntry,
} from "../../types.ts";
import type { CaptureEnvelope, CanonicalMedia } from "../../multimodal/types.ts";
import { normalizeCapture, canonicalToMaterial } from "../../multimodal/index.ts";
import { enrichCanonicalWithVision } from "../../multimodal/vision-enrich.ts";
import { webReadTool, webSearchTool, captureIngestTool } from "./web-tools.ts";
import { libraryRetrieveTool } from "./library-retrieve.ts";
import { routePiece } from "../../engine/purpose-router.ts";
import { verifyCitations, resolveCitation } from "../../engine/citation.ts";
import { buildLine, writeBackLookup } from "../../engine/line-builder.ts";
import { parseAngle } from "../../engine/angle.ts";
import { runLookup, reviewLookup, canWriteBack } from "../../engine/lookup.ts";
import { decide } from "../../engine/decision.ts";
import {
  activeEntries,
  confirmEntry,
  ingestSignals,
  provenanceOf,
  rollbackEntry,
} from "../../engine/learning.ts";

/* ---------------- 0. 多模态规范化入库 ---------------- */

export const normalizeMultimodalTool: ToolSpec<
  {
    envelope: CaptureEnvelope;
    runVideoSplit?: boolean;
    enrichVision?: boolean;
  },
  { media: CanonicalMedia; material: Material }
> = {
  name: "normalize_multimodal",
  title: "多模态规范化入库",
  description:
    "把任意捕获信封规范成「文字单元 + 图片单元」。图片默认跑 OCR 可见字 + VLM 功能理解双轨文字（需 SILICONFLOW_API_KEY）。",
  humanBoundary: "用途标签若未声明，默认「资料收藏」；不静默改用户原图/原文。",
  requiresApproval: false,
  degradation:
    "远端不可访问时只存链接索引并提示悬浮球补齐；Vision 失败时保留图片路径并写 warnings，不编造正文。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      envelope: {
        type: "object",
        description: "CaptureEnvelope：channel/kind/primary/seedText/floatBall…",
      },
      runVideoSplit: {
        type: "boolean",
        description: "视频是否抽分镜关键帧（默认 true，需本机 ffmpeg）",
      },
      enrichVision: {
        type: "boolean",
        description: "是否对图片跑 OCR+VLM 双轨（默认 true）",
      },
    },
    required: ["envelope"],
  },
  async run(input, ctx) {
    const envelope = input.envelope as CaptureEnvelope | undefined;
    if (!envelope || typeof envelope !== "object") {
      return { ok: false, summary: "缺少 envelope", error: "bad_input" };
    }
    let media = normalizeCapture(envelope, {
      runVideoSplit: input.runVideoSplit !== false,
    });
    if (input.enrichVision !== false && media.images.length > 0) {
      media = await enrichCanonicalWithVision(media, { maxImages: 4 });
    }
    const material = canonicalToMaterial(media);
    const materials = [...ctx.materials, material];
    const ocrN = media.texts.filter((t) => t.role === "ocr").length;
    const capN = media.texts.filter((t) => t.role === "caption").length;
    return {
      ok: true,
      data: { media, material },
      summary: `已规范「${media.title}」→ 文字 ${media.texts.length}（OCR ${ocrN}·图意 ${capN}）· 图片 ${media.images.length} · 访问态 ${media.access}${
        media.warnings.length ? ` · 警告 ${media.warnings.length}` : ""
      }`,
      patch: { materials },
    };
  },
};

/* ---------------- 1. 整理成件 ---------------- */

export const organizeTool: ToolSpec<{ materialId: string }, { piece: Piece }> = {
  name: "organize_piece",
  title: "按用途整理成件",
  description:
    "读取一份原料，按用户已声明的用途走对应配方，产出分角色的可用卡，每块挂凭据。",
  humanBoundary: BOUNDARIES.purpose_declared_by_human.statement,
  requiresApproval: false,
  degradation: "抽不出角色就缺省，不编造；整份失败则退回原文块并标 degraded。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      materialId: { type: "string", description: "原料 ID，例如 MX-C01" },
    },
    required: ["materialId"],
  },
  run({ materialId }, ctx): ToolResult<{ piece: Piece }> {
    const material = ctx.materials.find((m) => m.id === materialId);
    if (!material) {
      return { ok: false, summary: `找不到原料 ${materialId}`, error: "not_found" };
    }
    const profile = activeEntries(ctx.store);
    const piece = routePiece(material, { profile });
    const report = verifyCitations(piece, material);

    return {
      ok: report.ok,
      data: { piece },
      summary: piece.degraded
        ? `${materialId}：抽取失败，已退回原文并标注（诚实降级）`
        : `${materialId} → ${piece.blocks.length} 块成件，凭据覆盖 ${(report.coverage * 100).toFixed(0)}%`,
      memoryUsed: piece.provenance ?? [],
    };
  },
};

/* ---------------- 2. 凭据回点 ---------------- */

export const citeTool: ToolSpec<
  { materialId: string; blockId: string },
  { quote: string; locator: unknown }
> = {
  name: "resolve_citation",
  title: "凭据回点",
  description: "把成件里的一句话定位回原料的精确位置（页码 / 图上框 / 时间码 / 字符区间）。",
  humanBoundary: "只读，不改任何东西。",
  requiresApproval: false,
  degradation: "定位不到就明说定位不到，绝不伪造 locator。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      materialId: { type: "string", description: "原料 ID" },
      blockId: { type: "string", description: "原料块 ID" },
    },
    required: ["materialId", "blockId"],
  },
  run({ materialId, blockId }, ctx) {
    const material = ctx.materials.find((m) => m.id === materialId);
    if (!material) return { ok: false, summary: "找不到原料", error: "not_found" };
    const block = resolveCitation(material, blockId);
    if (!block) {
      return { ok: false, summary: `${blockId} 定位失败，标记为「来自推断，无出处」`, error: "no_locator" };
    }
    return {
      ok: true,
      data: { quote: block.text, locator: block.locator },
      summary: `定位到 ${materialId}/${blockId}（${block.locator.type}）`,
    };
  },
};

/* ---------------- 3. 一句话重排 ---------------- */

export const relineTool: ToolSpec<
  {
    angleText: string;
    materialIds?: string[];
    lockedNodeIds?: string[];
    scopeNodeId?: string;
  },
  { line: Line }
> = {
  name: "reline",
  title: "一句话重排逻辑链路",
  description:
    "把一句自然语言变成角度规格，重新组织同一批笔记的层级结构。支持锁定节点与局部重生成。",
  humanBoundary: BOUNDARIES.angle_confirmed_by_human.statement,
  requiresApproval: true,
  degradation: "角度解析置信度不足时返回追问，不产出新结构。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      angleText: { type: "string", description: "用户的一句话，例如「按反对意见优先重排」" },
      materialIds: { type: "array", description: "参与重排的原料 ID", items: { type: "string" } },
      lockedNodeIds: { type: "array", description: "锁定不动的节点 ID", items: { type: "string" } },
      scopeNodeId: { type: "string", description: "只重生成该节点的子树" },
    },
    required: ["angleText"],
  },
  run(input, ctx): ToolResult<{ line: Line }> {
    const scope = input.materialIds?.length
      ? ctx.materials.filter((m) => input.materialIds!.includes(m.id))
      : ctx.materials;

    const profile = activeEntries(ctx.store);
    const line = buildLine({
      materials: scope,
      angleText: input.angleText,
      lockedNodeIds: input.lockedNodeIds ?? [],
      prevLine: ctx.line,
      scopeNodeId: input.scopeNodeId,
      profile,
      now: ctx.now,
    });

    if (line.pending) {
      return {
        ok: true,
        data: { line },
        summary: `没听懂角度，反问：${line.pending.question}`,
        needsApproval: true,
        boundary: BOUNDARIES.angle_confirmed_by_human.statement,
      };
    }

    const d = line.diff;
    return {
      ok: true,
      data: { line },
      summary: d
        ? `按「${line.angle.order}」重排：新增 ${d.added.length}、移动 ${d.moved.length}、锁定保持 ${d.lockedKept.length}`
        : `按「${line.angle.order}」生成 ${line.nodes.length} 个节点`,
      needsApproval: true,
      boundary: BOUNDARIES.angle_confirmed_by_human.statement,
      memoryUsed: line.provenance,
      patch: { line },
    };
  },
};

/* ---------------- 4. 角度预览（不改结构） ---------------- */

export const previewAngleTool: ToolSpec<{ angleText: string }, { order: string; confidence: number }> = {
  name: "preview_angle",
  title: "预览角度解析",
  description: "只解析自然语言角度，返回可预览的角度规格，不动任何结构。",
  humanBoundary: "只读预览，用于让用户先看懂 AI 打算怎么排。",
  requiresApproval: false,
  degradation: "置信度低于 0.5 时给出追问文案。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: { angleText: { type: "string", description: "用户的一句话" } },
    required: ["angleText"],
  },
  run({ angleText }, ctx) {
    const spec = parseAngle(angleText, activeEntries(ctx.store));
    return {
      ok: true,
      data: { order: spec.order, confidence: spec.confidence },
      summary:
        spec.confidence < 0.5
          ? `角度不明确（${spec.confidence.toFixed(2)}），建议反问`
          : `解析为 ${spec.order}，分组 ${spec.groupBy}，置信 ${spec.confidence.toFixed(2)}`,
    };
  },
};

/* ---------------- 5. 外查 ---------------- */

export const lookupTool: ToolSpec<{ question: string }, { card: LookupCard }> = {
  name: "lookup",
  title: "外查公开信息",
  description:
    "针对存疑的点自动收集公开信息，产出带来源与时间的外查卡，并与已有素材做冲突检出。",
  humanBoundary: BOUNDARIES.lookup_reviewed_by_human.statement,
  requiresApproval: true,
  degradation: "没查到就明说没查到，并给出两条自查建议；涉及个人身份的定向检索直接拒绝。",
  provenance: "Replay",
  inputSchema: {
    type: "object",
    properties: { question: { type: "string", description: "要查什么" } },
    required: ["question"],
  },
  run({ question }) {
    const card = runLookup(question);
    return {
      ok: true,
      data: { card },
      summary:
        card.status === "no_result"
          ? `没查到：${card.fallbackAdvice?.[0] ?? ""}`
          : `找到 ${card.findings.length} 条来源，检出 ${card.conflicts.length} 处与你已有笔记的冲突（等你批准）`,
      needsApproval: true,
      boundary: BOUNDARIES.lookup_reviewed_by_human.statement,
    };
  },
};

/* ---------------- 6. 外查写回（需人批准） ---------------- */

export const writeBackTool: ToolSpec<
  { card: LookupCard; parentNodeId: string; approved: boolean },
  { line: Line }
> = {
  name: "write_back_lookup",
  title: "把外查结果写回链路",
  description: "人批准后，把外查结论作为一个「外查」节点挂进链路。",
  humanBoundary: BOUNDARIES.lookup_reviewed_by_human.statement,
  requiresApproval: true,
  degradation: "未批准一律拒绝写回。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      parentNodeId: { type: "string", description: "挂到哪个节点下" },
      approved: { type: "boolean", description: "人是否已批准" },
    },
    required: ["parentNodeId", "approved"],
  },
  run({ card, parentNodeId, approved }, ctx): ToolResult<{ line: Line }> {
    const reviewed = reviewLookup(card, approved ? "approve" : "reject");
    const verdict = evaluate({
      action: "write_back_lookup",
      approvedByHuman: reviewed.status === "approved",
    });
    if (!verdict.allowed || !canWriteBack(reviewed)) {
      return {
        ok: false,
        summary: "未经你批准，拒绝写回",
        error: "human_review_required",
        needsApproval: true,
        boundary: verdict.boundary?.statement,
      };
    }
    if (!ctx.line) return { ok: false, summary: "当前没有链路可写入", error: "no_line" };

    const text = reviewed.findings[0]?.claim ?? reviewed.question;
    const note = reviewed.conflicts[0]?.note ?? reviewed.findings[0]?.sourceName ?? "";
    const line = writeBackLookup(ctx.line, parentNodeId, text, note);

    return {
      ok: true,
      data: { line },
      summary: `已写回：${text.slice(0, 24)}…`,
      patch: { line },
    };
  },
};

/* ---------------- 7. 决断卡 ---------------- */

export const decideTool: ToolSpec<
  { question: string; materialIds?: string[] },
  { card: DecisionCard }
> = {
  name: "make_decision_card",
  title: "生成决断卡",
  description: "在一个具体决定上给出选项、依据、风险与未知项；证据不足时弃权。",
  humanBoundary: BOUNDARIES.decision_made_by_human.statement,
  requiresApproval: true,
  degradation: "证据不足时 refused=true，只列缺什么，不硬给建议。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "要做的决定" },
      materialIds: { type: "array", description: "参与判断的原料", items: { type: "string" } },
    },
    required: ["question"],
  },
  run({ question, materialIds }, ctx): ToolResult<{ card: DecisionCard }> {
    const scope = materialIds?.length
      ? ctx.materials.filter((m) => materialIds.includes(m.id))
      : ctx.materials;
    const card = decide({ question, materials: scope, profile: activeEntries(ctx.store) });
    return {
      ok: true,
      data: { card },
      summary: card.refused
        ? `弃权：${card.refusedReason}`
        : `建议「${card.recommendation}」，另列 ${card.unknowns.length} 条未知项等你判断`,
      needsApproval: true,
      boundary: BOUNDARIES.decision_made_by_human.statement,
      memoryUsed: card.provenance ?? [],
    };
  },
};

/* ---------------- 8. 记忆：学习 ---------------- */

export const learnTool: ToolSpec<
  { signals: Parameters<typeof ingestSignals>[1] },
  { activated: ProfileEntry[]; proposed: ProfileEntry[] }
> = {
  name: "learn_from_signals",
  title: "从你的行为里学习",
  description:
    "吃进三类信号（你标的用途标签 / 你给的逻辑线 / 你的对话），累计到阈值就形成一条可读的习得条目。",
  humanBoundary:
    "高置信自动生效并随时可回滚；删除/覆盖类条目永远需要你确认（你定的护栏）。",
  requiresApproval: false,
  degradation: "命中否定约束的信号直接丢弃，不再学回来。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      signals: { type: "array", description: "学习信号列表", items: { type: "object" } },
    },
    required: ["signals"],
  },
  run({ signals }, ctx) {
    const before = new Set(
      ctx.store.entries.filter((e) => e.status === "active").map((e) => e.id),
    );
    const store = ingestSignals(ctx.store, signals, ctx.now);
    const activated = store.entries.filter((e) => e.status === "active" && !before.has(e.id));
    const proposed = store.entries.filter((e) => e.status === "proposed");

    return {
      ok: true,
      data: { activated, proposed },
      summary:
        activated.length > 0
          ? `自动学到 ${activated.length} 条：${activated.map((e) => e.statement).join("；")}`
          : proposed.length > 0
            ? `有 ${proposed.length} 条待你确认`
            : "这批信号还不够形成结论",
      memoryUsed: activated.map(provenanceOf),
      patch: { store },
    };
  },
};

/* ---------------- 9. 记忆：确认 / 回滚 ---------------- */

export const memoryControlTool: ToolSpec<
  { entryId: string; op: "confirm" | "rollback" },
  { entry?: ProfileEntry }
> = {
  name: "control_memory",
  title: "确认或回滚一条习得",
  description: "让用户对「它学到的我」有最终控制权。回滚会写入否定约束，防止同一信号再学回来。",
  humanBoundary: BOUNDARIES.destructive_needs_confirm.statement,
  requiresApproval: false,
  degradation: "找不到条目就报错，不静默忽略。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      entryId: { type: "string", description: "习得条目 ID，例如 pf_structure_first" },
      op: { type: "string", description: "confirm 或 rollback", enum: ["confirm", "rollback"] },
    },
    required: ["entryId", "op"],
  },
  run({ entryId, op }, ctx) {
    if (!ctx.store.entries.some((e) => e.id === entryId)) {
      return { ok: false, summary: `找不到习得条目 ${entryId}`, error: "not_found" };
    }
    const store = op === "confirm" ? confirmEntry(ctx.store, entryId) : rollbackEntry(ctx.store, entryId);
    const entry = store.entries.find((e) => e.id === entryId);
    return {
      ok: true,
      data: { entry },
      summary:
        op === "confirm"
          ? `已确认生效：${entry?.statement}`
          : `已回滚并写入否定约束：${entry?.statement}`,
      patch: { store },
    };
  },
};

/* ---------------- 注册 ---------------- */

export function createRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(normalizeMultimodalTool)
    .register(captureIngestTool)
    .register(libraryRetrieveTool)
    .register(webReadTool)
    .register(webSearchTool)
    .register(organizeTool)
    .register(citeTool)
    .register(previewAngleTool)
    .register(relineTool)
    .register(lookupTool)
    .register(writeBackTool)
    .register(decideTool)
    .register(learnTool)
    .register(memoryControlTool);
}

export type { AgentContext, Material };
