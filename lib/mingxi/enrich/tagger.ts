/**
 * 用硅基流动给单条素材打「领域层级标签」
 */
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { DomainTagLayer } from "../tags.ts";
import {
  canonicalizeDomainPath,
  domainBackbonePromptBlock,
} from "../intent/canonicalize-domain.ts";
import {
  imageFileToDataUrl,
  siliconflowChat,
  siliconflowVision,
  siliconflowModels,
} from "../llm/siliconflow.ts";

export interface TagCardInput {
  id: string;
  title: string;
  summary?: string;
  modality?: string;
  fullTextPreview?: string;
  blocks?: Array<{ text: string }>;
  sourceUri?: string;
  images?: Array<{ uri?: string; path?: string }>;
  knowledgePath?: string[];
}

const SYSTEM = `你是知识库编目员。根据笔记正文的字面语义，给出层级领域标签。
必须输出 JSON，字段：
{
  "path": ["门类","一级学科或方向","主题细分","更细主题"],
  "keywords": ["关键词1","关键词2","关键词3","关键词4","关键词5"],
  "theme": "一两句主旨大意",
  "confidence": 0.0到1.0
}
规则：
- path 必须 3～4 级
- ${domainBackbonePromptBlock()}
- 按内容知识归属，不要按文件来源（不要写 Obsidian、截图、微信）
- keywords 5 个以内，短词
- 不要编造正文没有的专有名词`;

const VISION_PROMPT = `你是知识库编目员。请识读这张图片/截图：提取可见文字要点、画面主题，并给出层级领域标签。
输出 JSON：
{
  "imageCaption": "对图像内容的简洁描述（含关键文字）",
  "path": ["门类","一级学科或方向","主题细分","更细主题"],
  "keywords": ["关键词1","关键词2","关键词3"],
  "theme": "一两句主旨大意",
  "confidence": 0.0到1.0
}
规则：
- ${domainBackbonePromptBlock()}
- 按画面内容的知识归属分类；不要写「截图」「手机」作为学科。`;

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeDomain(
  raw: Record<string, unknown> | null,
  fallbackPath: string[],
  model: string,
  imageCaption?: string,
): DomainTagLayer {
  const pathRaw = Array.isArray(raw?.path) ? (raw!.path as unknown[]) : [];
  const path = pathRaw
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 4);
  const keywords = Array.isArray(raw?.keywords)
    ? (raw!.keywords as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
    : [];
  const theme = String(raw?.theme ?? "").trim().slice(0, 200);
  const confidence = Number(raw?.confidence);
  const caption =
    imageCaption ??
    (typeof raw?.imageCaption === "string" ? raw.imageCaption.trim().slice(0, 500) : undefined);

  const rawPath =
    path.length >= 2 ? path : fallbackPath.length ? fallbackPath : ["未分类", "待标注"];
  return {
    path: canonicalizeDomainPath(rawPath),
    keywords,
    theme: theme || "（未生成主旨）",
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : undefined,
    model,
    taggedAt: new Date().toISOString(),
    imageCaption: caption,
  };
}

function textSnippet(card: TagCardInput): string {
  const body =
    card.fullTextPreview ||
    card.blocks?.map((b) => b.text).join("\n") ||
    card.summary ||
    "";
  return body.replace(/\s+/g, " ").slice(0, 3500);
}

function resolveImagePath(card: TagCardInput, root: string): string | null {
  const candidates = [
    ...(card.images ?? []).map((i) => i.uri || i.path),
    card.sourceUri,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (/\.(png|jpe?g|webp|gif)$/i.test(c)) {
      const abs = c.startsWith("/") ? c : resolve(root, c);
      if (existsSync(abs)) return abs;
    }
  }
  return null;
}

export async function tagCardWithSiliconFlow(
  card: TagCardInput,
  opt: { root?: string; forceVision?: boolean } = {},
): Promise<DomainTagLayer> {
  const root = opt.root ?? process.cwd();
  const models = siliconflowModels();
  const fallback = card.knowledgePath ?? ["未分类", "待标注"];
  const modality = String(card.modality ?? "");
  const wantVision =
    opt.forceVision ||
    modality === "photo" ||
    modality === "screenshot" ||
    /截图|图片/.test(String(card.summary ?? ""));

  if (wantVision) {
    const imgPath = resolveImagePath(card, root);
    const dataUrl = imgPath ? imageFileToDataUrl(imgPath) : null;
    if (dataUrl) {
      const { content, model } = await siliconflowVision({
        prompt: VISION_PROMPT,
        imageDataUrl: dataUrl,
      });
      return normalizeDomain(extractJson(content), fallback, model);
    }
  }

  const user = `标题：${card.title}
模态：${card.modality ?? "unknown"}
正文：
${textSnippet(card)}`;

  const { content, model } = await siliconflowChat({
    model: models.textModel,
    jsonMode: true,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  return normalizeDomain(extractJson(content), fallback, model);
}
