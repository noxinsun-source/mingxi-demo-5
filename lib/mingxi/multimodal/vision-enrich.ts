/**
 * 图片双轨文字：OCR 可见字 + VLM 功能理解 caption
 * 依赖硅基流动 Vision（SILICONFLOW_API_KEY）
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  imageFileToDataUrl,
  siliconflowVision,
  siliconflowModels,
} from "../llm/siliconflow.ts";
import type { CanonicalMedia, ImageUnit, TextUnit } from "./types.ts";

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

function absImage(uri: string, root: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("data:")) return uri;
  const cleaned = uri.replace(/^file:\/\//, "");
  const abs = cleaned.startsWith("/") ? cleaned : resolve(root, cleaned);
  return existsSync(abs) ? abs : null;
}

const DUAL_PROMPT = `你是多模态笔记入库助手。请同时完成两件事并只输出 JSON：
{
  "ocrText": "图中所有可读文字，按阅读顺序，保留关键标点；若几乎无字则空字符串",
  "caption": "用一两句话说明这张图在讲什么、界面/场景功能是什么（功能性理解，不是简单重复 OCR）",
  "theme": "一句话知识主旨",
  "path": ["门类","一级","二级","主题"]
}
规则：ocrText 忠于画面；caption 解释用途与语境；path 3-4 级中文学科，不要写截图/手机。`;

export interface VisionEnrichResult {
  ocrText: string;
  caption: string;
  theme?: string;
  path?: string[];
  model: string;
}

/** 单图：OCR + VLM 功能理解 */
export async function enrichImageDualTrack(
  imagePathOrDataUrl: string,
  opt: { title?: string } = {},
): Promise<VisionEnrichResult> {
  let dataUrl = imagePathOrDataUrl;
  if (!dataUrl.startsWith("data:")) {
    const encoded = imageFileToDataUrl(imagePathOrDataUrl);
    if (!encoded) throw new Error(`无法读取图片：${imagePathOrDataUrl}`);
    dataUrl = encoded;
  }
  const { content, model } = await siliconflowVision({
    prompt: `${DUAL_PROMPT}\n\n笔记标题提示：${opt.title || "（无）"}`,
    imageDataUrl: dataUrl,
    model: siliconflowModels().visionModel,
    maxTokens: 1200,
  });
  const raw = extractJson(content);
  return {
    ocrText: String(raw?.ocrText ?? "").trim(),
    caption: String(raw?.caption ?? "").trim() || String(content).slice(0, 300),
    theme: String(raw?.theme ?? "").trim() || undefined,
    path: Array.isArray(raw?.path)
      ? (raw!.path as unknown[]).map(String).filter(Boolean).slice(0, 4)
      : undefined,
    model,
  };
}

/**
 * 给 CanonicalMedia 的每张图补 OCR + caption，写回 texts / images
 */
export async function enrichCanonicalWithVision(
  media: CanonicalMedia,
  opt: { root?: string; maxImages?: number } = {},
): Promise<CanonicalMedia> {
  const root = opt.root ?? process.cwd();
  const maxImages = opt.maxImages ?? 4;
  const texts: TextUnit[] = [...media.texts];
  const images: ImageUnit[] = [];
  const warnings = [...media.warnings];
  const pipeline = [...media.pipeline, "vision_dual_track"];

  let did = 0;
  for (const img of media.images) {
    if (did >= maxImages) {
      images.push(img);
      continue;
    }
    const abs = absImage(img.uri, root);
    if (!abs) {
      images.push(img);
      warnings.push(`vision_skip: 找不到图片 ${img.uri}`);
      continue;
    }
    try {
      const dual = await enrichImageDualTrack(abs, { title: media.title });
      const ocrId = `${img.id}_ocr`;
      const capId = `${img.id}_caption`;
      if (dual.ocrText) {
        texts.push({
          id: ocrId,
          role: "ocr",
          text: dual.ocrText,
          source: "ocr",
          confidence: 0.75,
          locator: { type: "bbox", bbox: [0, 0, 1, 1], imageId: img.id },
        });
      }
      if (dual.caption) {
        texts.push({
          id: capId,
          role: "caption",
          text: dual.caption,
          source: "llm_caption",
          confidence: 0.8,
        });
      }
      images.push({
        ...img,
        caption: dual.caption || img.caption,
        ocrTextIds: dual.ocrText ? [ocrId, ...(img.ocrTextIds ?? [])] : img.ocrTextIds,
      });
      if (dual.path?.length && !media.knowledgePath?.length) {
        media = { ...media, knowledgePath: dual.path };
      }
      did++;
    } catch (err) {
      images.push(img);
      warnings.push(
        `vision_fail:${img.id}:${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 去掉「等待 OCR+VLM 回填」类警告
  const cleanedWarnings = warnings.filter(
    (w) => !/OCR 文字待|等待 OCR\+VLM|OCR\+VLM 双轨回填/.test(w),
  );
  if (did > 0) cleanedWarnings.push(`vision_dual_track:enriched_${did}_images`);

  return {
    ...media,
    texts,
    images,
    warnings: cleanedWarnings,
    pipeline,
  };
}
