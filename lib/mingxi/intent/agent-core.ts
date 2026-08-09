/**
 * 明晰 Intent Agent 本体（方案三）
 *
 * 路径：lib/mingxi/intent/
 *   types.ts / map-purpose.ts / classifier.ts / agent-core.ts / index.ts
 *
 * 能力：
 *   L1+L2 分类信封 → 确认门 → 低风险动作建议
 *   L3 对话意图 → 计划（复用 orchestrator.detectIntent/plan）
 *   成件（需确认用途）→ routePiece
 */
import type { Material, PurposeLabel } from "../types.ts";
import { PURPOSE_TRACK } from "../types.ts";
import { routePiece } from "../engine/purpose-router.ts";
import { verifyCitations } from "../engine/citation.ts";
import { detectIntent, plan } from "../agent/orchestrator.ts";
import type { Intent, Plan } from "../agent/orchestrator.ts";
import type { AgentContext } from "../agent/tool-registry.ts";
import { createTrace } from "../agent/trace.ts";
import {
  agentClassifyCard,
  silverLabelCard,
  type ClassifiableCard,
} from "./classifier.ts";
import { confidenceGate } from "./map-purpose.ts";
import type { CardIntentEnvelope, NoteUtilityV3 } from "./types.ts";
import { envelopeToUtility } from "./classifier.ts";

export type { CardIntentEnvelope, NoteUtilityV3, ClassifiableCard };
export { silverLabelCard, agentClassifyCard, confidenceGate, detectIntent };

export class NeedsConfirmError extends Error {
  code = "NeedsConfirm";
  constructor(message = "用途尚未确认，不能整理成件") {
    super(message);
    this.name = "NeedsConfirmError";
  }
}

export interface IntentAgentCard extends ClassifiableCard {
  intentEnvelope?: CardIntentEnvelope;
  utility?: NoteUtilityV3;
  purposeDeclaredBy?: "ai_suggested" | "human" | "human_confirmed_ai";
  purposeLabel?: string;
}

/** 确认用途（评测可模拟人点确认） */
export function confirmPurpose(
  card: IntentAgentCard,
  purpose?: PurposeLabel,
): IntentAgentCard {
  const label =
    purpose ||
    card.intentEnvelope?.purposeSuggestion ||
    (card.utility?.purposeLabel as PurposeLabel) ||
    "资料收藏";
  const baseUtility =
    card.utility ??
    (card.intentEnvelope
      ? envelopeToUtility(card.intentEnvelope)
      : {
          purposeLabel: label,
          casePolarity: "neutral" as const,
          functionalForm: "clip",
          stance: "transform_ok" as const,
          userGoalText: "",
          declaredBy: "ai_suggested" as const,
        });
  return {
    ...card,
    purposeLabel: label,
    purposeDeclaredBy: "human_confirmed_ai",
    utility: {
      ...baseUtility,
      purposeLabel: label,
      declaredBy: "human_confirmed_ai",
    },
  };
}

export function materialFromCard(card: IntentAgentCard, index = 0): Material {
  const purposeLabel = (card.purposeLabel ||
    card.utility?.purposeLabel ||
    "资料收藏") as PurposeLabel;
  const text =
    card.fullTextPreview ||
    card.blocks?.map((b) => b.text).join("\n\n") ||
    card.title;
  const declaredBy =
    card.purposeDeclaredBy === "human" || card.purposeDeclaredBy === "human_confirmed_ai"
      ? card.purposeDeclaredBy
      : "human_confirmed_ai"; // 评测成件前应先 confirm
  return {
    id: (card.id || `CARD_${index}`).toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64),
    set: "demo",
    capturedAt: new Date().toISOString(),
    modality: "webpage",
    source: { kind: "file", title: card.title, appHint: "intent-agent" },
    layers: {
      visibleText: text.slice(0, 2000),
      fullText: text,
      fullTextStatus: "ok",
    },
    blocks: (card.blocks?.length
      ? card.blocks
      : [{ id: "b1", kind: "正文", text }]
    ).map((b, i) => ({
      id: (b as { id?: string }).id || `b${i + 1}`,
      text: b.text,
      kind: "正文" as const,
      locator: { type: "span" as const, start: 0, end: b.text.length },
    })),
    purpose: {
      track: PURPOSE_TRACK[purposeLabel],
      label: purposeLabel,
      declaredBy,
    },
    tags: ["intent-agent"],
    license: "owned",
    immutable: true,
  };
}

export function organizeWithConfirm(card: IntentAgentCard) {
  if (
    card.purposeDeclaredBy !== "human" &&
    card.purposeDeclaredBy !== "human_confirmed_ai"
  ) {
    throw new NeedsConfirmError();
  }
  const material = materialFromCard(card);
  const piece = routePiece(material);
  const cite = verifyCitations(piece, material);
  return { material, piece, cite };
}

/** L3：对话 → 计划 */
export function planDialog(utterance: string, materials: Material[]): Plan {
  const now = new Date().toISOString();
  const ctx: AgentContext = {
    materials,
    store: { entries: [], negativeConstraints: [], signals: [] },
    now,
    trace: createTrace(`intent_${Date.now()}`, now),
  };
  return plan(utterance, ctx);
}

/** 按领域/用途/极性召回（L3 梳逻辑链的前置；评测剧本可断言集合） */
export function retrieveForUtterance(
  utterance: string,
  cards: IntentAgentCard[],
  limit = 8,
): IntentAgentCard[] {
  const u = utterance.toLowerCase();
  const scored = cards.map((c) => {
    const path = (c.knowledgePath || c.intentEnvelope?.knowledgeDomain?.[0]?.path || []).join(
      " ",
    );
    const theme = String(c.intentEnvelope?.modelTrace?.theme || c.summary || "");
    const preview = (c.fullTextPreview || "").slice(0, 400);
    const blob = `${c.title} ${path} ${theme} ${c.purposeLabel || ""} ${preview}`.toLowerCase();
    let s = 0;
    for (const tok of u.replace(/[^\u4e00-\u9fff\w]+/g, " ").split(/\s+/)) {
      if (tok.length >= 2 && blob.includes(tok)) s += 2;
    }
    const pol =
      c.utility?.casePolarity ||
      (c.intentEnvelope?.polarity?.id === "negative_caution"
        ? "negative"
        : c.intentEnvelope?.polarity?.id === "positive_exemplar"
          ? "positive"
          : c.intentEnvelope?.polarity?.id === "mixed"
            ? "mixed"
            : "neutral");
    const purpose = c.purposeLabel || c.utility?.purposeLabel || "";
    if (/避雷|反对|反例|踩坑|对照|正反/.test(u) && (pol === "negative" || purpose === "反例避坑"))
      s += 4;
    if (/正例|可学|成功|对照|正反|最佳实践/.test(u) && (pol === "positive" || pol === "mixed"))
      s += 3;
    if (/时间线|按时间|先后|演进/.test(u) && /时间|版本|演进|历程|202\d/.test(blob)) s += 2;
    if (/落地|产品|对标|拆解/.test(u) && (purpose === "对标拆解" || /产品|落地|实践/.test(blob)))
      s += 3;
    if (/间隔重复|记忆|闪卡|提取练习/.test(u) && /间隔|重复|记忆|闪卡|提取/.test(blob)) s += 5;
    if (/agent|技能|skill|harness|评测/.test(u) && /agent|技能|skill|harness|评测/.test(blob))
      s += 3;
    return { c, s };
  });
  return scored
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c);
}

export async function runAgentClassify(
  card: IntentAgentCard,
  opt?: { model?: string },
): Promise<IntentAgentCard> {
  const envelope = await agentClassifyCard(card, opt);
  const utility = envelopeToUtility(envelope);
  const path = envelope.knowledgeDomain[0]?.path;
  return {
    ...card,
    intentEnvelope: envelope,
    utility,
    purposeLabel: envelope.purposeSuggestion,
    purposeDeclaredBy: "ai_suggested",
    knowledgePath: path ?? card.knowledgePath,
  };
}

export function gateOf(card: IntentAgentCard) {
  if (!card.intentEnvelope) return "review" as const;
  return confidenceGate(card.intentEnvelope);
}

export function redlineStanceOk(card: IntentAgentCard, enrichmentText = ""): boolean {
  const st = card.intentEnvelope?.stance || card.utility?.stance;
  if (st !== "do_not_imitate_failure_path") return true;
  // 禁止把失败步骤写成「推荐/应当这样做」类 playbook
  if (/推荐按照失败|建议重复该错误|应当先不备份/.test(enrichmentText)) return false;
  return true;
}

export type DialogIntent = Intent;
