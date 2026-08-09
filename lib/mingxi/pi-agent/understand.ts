/**
 * 笔记理解 · 三层理解 + 标签（一次 LLM 调用）
 *
 * 层1 内容本身：图里有什么字、文本讲了什么
 * 层2 客观语境角色：这段/这图在原文中的位置、佐证什么观点
 * 层3 主观用途：记笔记的人存它干什么（声明 + 推断）
 *
 * 有图 → 走视觉模型并附图；无图 → 纯文本模型。
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import { canonicalizeDomainPath, domainBackbonePromptBlock } from "../intent/canonicalize-domain.ts";
import { normalizePurposeLabel } from "../types.ts";
import { imageFileToDataUrl } from "../llm/siliconflow.ts";
import type { CanonicalMedia } from "../multimodal/types.ts";
import { createSiliconFlowSetup } from "./provider.ts";
import type { NotePolarity, NoteTagSet, NoteUnderstanding } from "./types.ts";

const MAX_TEXT_CHARS = 6000;
const MAX_IMAGES = 3;

function mediaDigest(media: CanonicalMedia): string {
  const parts: string[] = [];
  parts.push(`标题：${media.title}`);
  parts.push(`入口形态：${media.rawKind} · 通道：${media.channel} · 访问态：${media.access}`);
  if (media.sourceUri) parts.push(`来源：${media.sourceUri}`);

  const textBudgetPer = Math.max(
    600,
    Math.floor(MAX_TEXT_CHARS / Math.max(media.texts.length, 1)),
  );
  for (const t of media.texts) {
    const clipped =
      t.text.length > textBudgetPer ? `${t.text.slice(0, textBudgetPer)}…（截断）` : t.text;
    parts.push(`【文字单元 ${t.id} · ${t.role}】\n${clipped}`);
  }
  if (media.images.length) {
    parts.push(
      `图片单元列表：${media.images
        .map((i) => `${i.id}（${i.role}${i.caption ? `，已有说明：${i.caption}` : ""}）`)
        .join("；")}`,
    );
  }
  return parts.join("\n\n");
}

function understandingPrompt(input: {
  digest: string;
  declaredPurpose?: string;
  contextHint?: string;
  imageIds: string[];
}): string {
  return `你是「明晰」智能笔记的入库理解引擎。请针对下面这份笔记材料，输出严格 JSON（不要 markdown 代码块），完成「三层理解 + 标签」。

${input.digest}

${input.contextHint ? `补充上下文提示：${input.contextHint}\n` : ""}${
    input.declaredPurpose
      ? `用户捕获时声明的用途：${input.declaredPurpose}\n`
      : "用户未声明用途。\n"
  }
${input.imageIds.length ? `随消息附上了 ${input.imageIds.length} 张图，按顺序对应图片单元：${input.imageIds.join("、")}。\n` : ""}
输出 JSON 结构（所有字段必填，数组可为空）：
{
  "noteTitle": "给这条笔记起一个准确的短标题（≤24字，不要用版权声明/文件名）",
  "content": {
    "summary": "2-3 句概括这份材料讲了什么",
    "keyPoints": ["要点1", "要点2", "…（3-6条）"],
    "entities": ["关键实体/术语…"],
    "imageFindings": [
      { "imageId": "图片单元id", "visibleText": "图里可读出的文字（忠于画面，无字则空串）", "whatItShows": "画面在展示什么（纯内容，不谈用途）" }
    ]
  },
  "contextRole": {
    "sourceForm": "原文形态：论文/教程/社交帖/PPT/实验记录/新闻…",
    "structureOutline": ["原文结构骨架，按顺序 3-8 段，如：引言→方法→实验→结论"],
    "argumentRole": "整份材料在知识生产中的定位：提出观点/提供证据/综述/操作指南/踩坑记录…",
    "imageRoles": [
      { "imageId": "图片单元id", "positionInSource": "图在原文的位置（如：方法章节配图）", "role": "客观作用：举例示意/流程总览/数据证据/界面截图…", "supportsClaim": "它支撑原文的哪个观点或步骤" }
    ]
  },
  "personalUse": {
    "inferredUses": [
      { "use": "候选用途（如：学文笔/参考论文框架/避坑对照/素材金句）", "why": "为什么这么推断", "confidence": 0.0 }
    ],
    "suggestedAction": "给记笔记者的一句话下一步建议"
  },
  "tags": {
    "domainPath": ["学科门类", "一级", "二级"],
    "purposeLabel": "学习理论|资料收藏|反例避坑|对标拆解|素材金句|待定 之一",
    "functionalTypes": ["教程/综述/实验记录/观点评论/工具清单…（1-3个）"],
    "polarity": "positive_exemplar|negative_caution|mixed|neutral_observe 之一",
    "keywords": ["检索关键词 3-8 个"]
  }
}

${domainBackbonePromptBlock()}

规则：
1. imageFindings 的 visibleText 必须忠于画面可见文字，禁止编造；没图则两个 image 数组都为空。
2. contextRole 必须"结合上下文"回答：图/段落在原文中处于什么位置、服务于什么论证。
3. 用户声明了用途时，personalUse.inferredUses 第一条应与声明一致并给出佐证；未声明时按材料特征推断 2-3 个候选。
4. 只输出 JSON。`;
}

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

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function strArr(v: unknown, max = 12): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, max) : [];
}

const POLARITIES: NotePolarity[] = [
  "positive_exemplar",
  "negative_caution",
  "mixed",
  "neutral_observe",
];

/** 收集本地可读的图片（转 base64 给视觉模型） */
function collectImages(
  media: CanonicalMedia,
  root: string,
): Array<{ imageId: string; content: ImageContent }> {
  const out: Array<{ imageId: string; content: ImageContent }> = [];
  for (const img of media.images) {
    if (out.length >= MAX_IMAGES) break;
    const cleaned = img.uri.replace(/^file:\/\//, "");
    const abs = cleaned.startsWith("/") ? cleaned : resolve(root, cleaned);
    if (!existsSync(abs)) continue;
    const dataUrl = imageFileToDataUrl(abs);
    if (!dataUrl) continue;
    const [head, data] = dataUrl.split(",", 2);
    const mimeType = head.replace(/^data:/, "").replace(/;base64$/, "");
    out.push({ imageId: img.id, content: { type: "image", data, mimeType } });
  }
  return out;
}

export interface UnderstandResult {
  understanding: NoteUnderstanding;
  tags: NoteTagSet;
  model: string;
  /** AI 起的短标题（优先于原始文件名/首行） */
  suggestedTitle?: string;
}

/**
 * 对一份 CanonicalMedia 做三层理解 + 标签。
 */
export async function understandCanonical(
  media: CanonicalMedia,
  opts: { declaredPurpose?: string; contextHint?: string; root?: string } = {},
): Promise<UnderstandResult> {
  const root = opts.root ?? process.cwd();
  const setup = createSiliconFlowSetup();
  const images = collectImages(media, root);
  // 理解质量优先：默认统一用视觉大模型（纯文本它同样最强）；
  // 需要省钱时可用 SILICONFLOW_UNDERSTAND_TEXT_MODEL=small 切回文本小模型
  const preferSmall =
    process.env.SILICONFLOW_UNDERSTAND_TEXT_MODEL === "small" && !images.length;
  const model = preferSmall ? setup.textModel : setup.visionModel;

  const prompt = understandingPrompt({
    digest: mediaDigest(media),
    declaredPurpose: opts.declaredPurpose,
    contextHint: opts.contextHint,
    imageIds: images.map((i) => i.imageId),
  });

  const content: Array<{ type: "text"; text: string } | ImageContent> = [
    { type: "text", text: prompt },
    ...images.map((i) => i.content),
  ];

  const response = await setup.models.completeSimple(
    model,
    { messages: [{ role: "user", content, timestamp: Date.now() }] },
    { temperature: 0.2, maxTokens: 3000 },
  );

  const rawText = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const raw = extractJson(rawText);
  if (!raw) {
    throw new Error(`理解输出无法解析为 JSON：${rawText.slice(0, 200)}`);
  }

  const c = (raw.content ?? {}) as Record<string, unknown>;
  const ctx = (raw.contextRole ?? {}) as Record<string, unknown>;
  const p = (raw.personalUse ?? {}) as Record<string, unknown>;
  const t = (raw.tags ?? {}) as Record<string, unknown>;

  const knownImageIds = new Set(media.images.map((i) => i.id));
  const imageFindings = (Array.isArray(c.imageFindings) ? c.imageFindings : [])
    .map((f) => {
      const o = f as Record<string, unknown>;
      return {
        imageId: str(o.imageId),
        visibleText: str(o.visibleText),
        whatItShows: str(o.whatItShows),
      };
    })
    .filter((f) => knownImageIds.has(f.imageId));

  const imageRoles = (Array.isArray(ctx.imageRoles) ? ctx.imageRoles : [])
    .map((f) => {
      const o = f as Record<string, unknown>;
      return {
        imageId: str(o.imageId),
        positionInSource: str(o.positionInSource),
        role: str(o.role),
        supportsClaim: str(o.supportsClaim),
      };
    })
    .filter((f) => knownImageIds.has(f.imageId));

  const inferredUses = (Array.isArray(p.inferredUses) ? p.inferredUses : [])
    .map((f) => {
      const o = f as Record<string, unknown>;
      const conf = Number(o.confidence);
      return {
        use: str(o.use),
        why: str(o.why),
        confidence: Number.isFinite(conf) ? Math.min(Math.max(conf, 0), 1) : 0.5,
      };
    })
    .filter((f) => f.use)
    .slice(0, 4);

  const polarity = POLARITIES.includes(str(t.polarity) as NotePolarity)
    ? (str(t.polarity) as NotePolarity)
    : "neutral_observe";

  const understanding: NoteUnderstanding = {
    content: {
      summary: str(c.summary, "（模型未给出概括）"),
      keyPoints: strArr(c.keyPoints, 8),
      entities: strArr(c.entities, 12),
      imageFindings,
    },
    contextRole: {
      sourceForm: str(ctx.sourceForm, media.rawKind),
      structureOutline: strArr(ctx.structureOutline, 8),
      argumentRole: str(ctx.argumentRole),
      imageRoles,
    },
    personalUse: {
      declaredPurpose: opts.declaredPurpose,
      inferredUses,
      suggestedAction: str(p.suggestedAction),
    },
  };

  const tags: NoteTagSet = {
    domainPath: canonicalizeDomainPath(strArr(t.domainPath, 4)),
    purposeLabel: normalizePurposeLabel(
      opts.declaredPurpose ?? str(t.purposeLabel, "待定"),
    ),
    functionalTypes: strArr(t.functionalTypes, 3),
    polarity,
    keywords: strArr(t.keywords, 8),
  };

  return {
    understanding,
    tags,
    model: model.id,
    suggestedTitle: str(raw.noteTitle).slice(0, 48) || undefined,
  };
}
