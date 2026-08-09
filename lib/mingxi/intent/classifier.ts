/**
 * 银标 / Agent 分类器：硅基流动结构化 JSON
 */
import {
  siliconflowChat,
  siliconflowVision,
  siliconflowModels,
  imageFileToDataUrl,
} from "../llm/siliconflow.ts";
import type { PurposeLabel } from "../types.ts";
import type {
  ActionId,
  CardIntentEnvelope,
  FunctionalTypeId,
  PolarityId,
  UserGoalId,
} from "./types.ts";
import {
  defaultActions,
  heuristicSignals,
  mapToPurpose,
  stanceFor,
} from "./map-purpose.ts";
import { FUNCTIONAL_UI, POLARITY_TO_CASE, type NoteUtilityV3 } from "./types.ts";
import { canonicalizeDomainPath, domainBackbonePromptBlock } from "./canonicalize-domain.ts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface ClassifiableCard {
  id: string;
  title: string;
  summary?: string;
  modality?: string;
  fullTextPreview?: string;
  blocks?: Array<{ text: string }>;
  knowledgePath?: string[];
  sourceUri?: string;
  images?: Array<{ uri?: string; path?: string }>;
  tagLayers?: { domain?: { path?: string[]; theme?: string; imageCaption?: string } };
}

const ENUM_POL = [
  "positive_exemplar",
  "negative_caution",
  "mixed",
  "neutral_observe",
  "unknown",
] as const;
const ENUM_FUN = [
  "concept",
  "fact",
  "procedure",
  "experience",
  "opinion",
  "evidence",
  "resource",
  "question",
  "template",
  "meeting",
  "clip",
] as const;
const ENUM_GOAL = [
  "learn",
  "avoid",
  "review",
  "reference",
  "share",
  "delegate_ai",
  "park",
  "decide",
] as const;

const SYSTEM = `你是笔记 Intent Envelope 分类器。只输出 JSON，不要 markdown。
字段：
{
  "polarity": "positive_exemplar|negative_caution|mixed|neutral_observe|unknown",
  "polarityConfidence": 0-1,
  "signals": ["原文信号词"],
  "functionalTypes": ["experience","procedure",...],
  "userGoals": ["avoid","learn",...],
  "domainPath": ["门类","一级","二级","主题"],
  "theme": "一句话主旨",
  "overallConfidence": 0-1,
  "needsReview": false,
  "clarifyQuestion": null
}
规则：
1. polarity 独立于学科：同领域可有正/负经验。
2. 失败/避雷/千万别 → negative_caution 或 mixed。
3. 成功可复用 → positive_exemplar。
4. 避雷主目标含 avoid；学习含 learn。
5. functionalTypes 从给定枚举多选 1-3 个。
6. ${domainBackbonePromptBlock()}
7. 不要用来源 App / Obsidian 旧标签 / 文件名当学科；按正文知识内容归类。
8. 拿不准 polarity=unknown 且 needsReview=true。`;

function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.trim()) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(v ?? "");
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function snippet(card: ClassifiableCard): string {
  const body =
    card.fullTextPreview ||
    card.blocks?.map((b) => b.text).join("\n") ||
    card.summary ||
    "";
  return `${card.title}\n${body}`.replace(/\s+/g, " ").slice(0, 3500);
}

function resolveImage(card: ClassifiableCard, root: string): string | null {
  const cands = [
    ...(card.images ?? []).map((i) => i.uri || i.path),
    card.sourceUri,
  ].filter(Boolean) as string[];
  for (const c of cands) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(c)) continue;
    const abs = c.startsWith("/") ? c : resolve(root, c);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function buildEnvelope(
  card: ClassifiableCard,
  raw: Record<string, unknown> | null,
  model: string,
  heuristic: ReturnType<typeof heuristicSignals>,
  role: "silver" | "agent",
): CardIntentEnvelope {
  const polarity = asEnum(
    raw?.polarity ?? heuristic.polarity_prior,
    ENUM_POL,
    heuristic.polarity_prior,
  );
  const funRaw = Array.isArray(raw?.functionalTypes)
    ? (raw!.functionalTypes as unknown[])
    : heuristic.functional;
  const functionalTypes = funRaw
    .map((x) => asEnum(x, ENUM_FUN, "clip"))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3)
    .map((id) => ({ id, confidence: 0.75 }));

  const goalsRaw = Array.isArray(raw?.userGoals)
    ? (raw!.userGoals as unknown[])
    : polarity === "negative_caution"
      ? ["avoid"]
      : ["park"];
  const userGoals = goalsRaw
    .map((x) => asEnum(x, ENUM_GOAL, "park"))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3)
    .map((id) => ({ id, confidence: 0.7 }));

  const pathRaw = Array.isArray(raw?.domainPath)
    ? (raw!.domainPath as unknown[]).map(String)
    : card.knowledgePath ?? card.tagLayers?.domain?.path ?? ["未分类", "待标注"];
  const path = canonicalizeDomainPath(pathRaw);
  const polConf = Number(raw?.polarityConfidence ?? (heuristic.score || 0.55));
  const overall = Number(raw?.overallConfidence ?? Math.max(0.5, polConf));

  const purposeSuggestion = mapToPurpose({
    polarity,
    userGoals: userGoals.map((g) => g.id),
    functionalTypes: functionalTypes.map((f) => f.id),
    text: snippet(card),
  });

  const needsReview = Boolean(raw?.needsReview) || polarity === "unknown" || overall < 0.55;

  return {
    schemaVersion: "3.0",
    knowledgeDomain: [
      {
        id: path.join("."),
        label: path[path.length - 1] ?? "未分类",
        path: path.length ? path : ["未分类", "待标注"],
        confidence: overall,
      },
    ],
    functionalTypes,
    polarity: {
      id: polarity,
      confidence: Math.min(1, Math.max(0, polConf)),
      signals: Array.isArray(raw?.signals)
        ? (raw!.signals as unknown[]).map(String).slice(0, 8)
        : heuristic.signals.slice(0, 8),
    },
    userGoals,
    actionIntents: defaultActions(
      polarity,
      userGoals.map((g) => g.id),
    ),
    stance: stanceFor(polarity),
    purposeSuggestion,
    overallConfidence: Math.min(1, Math.max(0, overall)),
    needsReview,
    clarifyQuestion:
      typeof raw?.clarifyQuestion === "string"
        ? raw.clarifyQuestion
        : needsReview
          ? "这是避雷负例还是可学正例？"
          : null,
    modelTrace: {
      role,
      model,
      theme: String(raw?.theme ?? card.tagLayers?.domain?.theme ?? ""),
      heuristic: heuristic.polarity_prior,
    },
  };
}

/** 银标：强模型（默认 vision/text 来自 env，可覆盖） */
export async function silverLabelCard(
  card: ClassifiableCard,
  opt: { root?: string; model?: string; visionModel?: string } = {},
): Promise<{ envelope: CardIntentEnvelope; utility: NoteUtilityV3 }> {
  const root = opt.root ?? process.cwd();
  const models = siliconflowModels();
  const text = snippet(card);
  const heuristic = heuristicSignals(text);
  const modality = String(card.modality ?? "");
  const wantVision = modality === "photo" || modality === "screenshot";

  let raw: Record<string, unknown> | null = null;
  let modelUsed = opt.model ?? models.textModel;

  try {
    if (wantVision) {
      const img = resolveImage(card, root);
      const dataUrl = img ? imageFileToDataUrl(img) : null;
      if (dataUrl) {
        modelUsed = opt.visionModel ?? models.visionModel;
        const { content, model } = await siliconflowVision({
          prompt: `${SYSTEM}\n\n请结合图像与标题「${card.title}」输出 JSON。`,
          imageDataUrl: dataUrl,
          model: modelUsed,
          maxTokens: 900,
        });
        raw = extractJson(content);
        modelUsed = model;
      }
    }
    if (!raw) {
      modelUsed = opt.model ?? models.textModel;
      // 银标优先用更强文本：若 env 设了 SILICONFLOW_SILVER_MODEL 则用之
      const silverModel =
        opt.model ||
        process.env.SILICONFLOW_SILVER_MODEL ||
        process.env.SILICONFLOW_VISION_MODEL ||
        modelUsed;
      const { content, model } = await siliconflowChat({
        model: silverModel,
        jsonMode: true,
        maxTokens: 800,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `启发式先验 polarity=${heuristic.polarity_prior} signals=${heuristic.signals.join(",")}\n\n正文：\n${text}`,
          },
        ],
      });
      raw = extractJson(content);
      modelUsed = model;
    }
  } catch (err) {
    raw = {
      polarity: heuristic.polarity_prior,
      polarityConfidence: Math.max(0.4, heuristic.score),
      functionalTypes: heuristic.functional,
      userGoals:
        heuristic.polarity_prior === "negative_caution" ? ["avoid"] : ["park"],
      domainPath: card.knowledgePath,
      overallConfidence: 0.45,
      needsReview: true,
      theme: String(err),
    };
    modelUsed = `fallback_heuristic`;
  }

  const envelope = buildEnvelope(card, raw, modelUsed, heuristic, "silver");
  const topFun = envelope.functionalTypes[0]?.id ?? "clip";
  const utility: NoteUtilityV3 = {
    purposeLabel: envelope.purposeSuggestion,
    casePolarity: POLARITY_TO_CASE[envelope.polarity.id],
    functionalForm: FUNCTIONAL_UI[topFun] ?? topFun,
    stance: envelope.stance,
    userGoalText: envelope.userGoals.map((g) => g.id).join(","),
    declaredBy: "ai_suggested",
  };
  return { envelope, utility };
}

/** Agent 被测分类：默认用较小文本模型，与银标分离 */
export async function agentClassifyCard(
  card: ClassifiableCard,
  opt: { root?: string; model?: string } = {},
): Promise<CardIntentEnvelope> {
  const models = siliconflowModels();
  const agentModel =
    opt.model || process.env.SILICONFLOW_AGENT_MODEL || models.textModel;
  const text = snippet(card);
  const heuristic = heuristicSignals(text);
  let raw: Record<string, unknown> | null = null;
  let modelUsed = agentModel;
  try {
    const { content, model } = await siliconflowChat({
      model: agentModel,
      jsonMode: true,
      maxTokens: 700,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `正文：\n${text}` },
      ],
    });
    raw = extractJson(content);
    modelUsed = model;
  } catch {
    raw = {
      polarity: heuristic.polarity_prior,
      polarityConfidence: heuristic.score,
      functionalTypes: heuristic.functional,
      userGoals: ["park"],
      domainPath: card.knowledgePath,
      overallConfidence: 0.4,
      needsReview: true,
    };
    modelUsed = "agent_fallback_heuristic";
  }
  return buildEnvelope(card, raw, modelUsed, heuristic, "agent");
}

export function envelopeToUtility(envelope: CardIntentEnvelope): NoteUtilityV3 {
  const topFun = envelope.functionalTypes[0]?.id ?? "clip";
  return {
    purposeLabel: envelope.purposeSuggestion as PurposeLabel,
    casePolarity: POLARITY_TO_CASE[envelope.polarity.id],
    functionalForm: FUNCTIONAL_UI[topFun] ?? topFun,
    stance: envelope.stance,
    userGoalText: envelope.userGoals.map((g) => g.id).join(","),
    declaredBy: "ai_suggested",
  };
}
