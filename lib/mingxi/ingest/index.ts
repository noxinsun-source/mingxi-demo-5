/**
 * 摄入产物 → Material / NoteUnit（统一卡片）
 */
import type { Material, PurposeLabel } from "../types.ts";
import { PURPOSE_TRACK } from "../types.ts";
import type { NoteUnit } from "../knowledge-atlas.ts";
import type { IngestArtifact, IngestKind, IngestSource } from "./types.ts";
import { guessKind } from "./chunk.ts";
import { ingestWeb } from "./adapters/web.ts";
import { ingestPdf } from "./adapters/pdf.ts";
import { ingestDocx, ingestPptx } from "./adapters/office.ts";
import { ingestMedia } from "./adapters/asr.ts";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { chunkText } from "./chunk.ts";

const MODALITY_MAP: Record<IngestKind, Material["modality"]> = {
  web: "webpage",
  pdf: "pdf",
  docx: "pdf", // 文档类先归文件模态；卡片层用 bodyKind 区分
  pptx: "pdf",
  audio: "voice",
  video: "video",
  text: "webpage",
};

function bodyKindOf(kind: IngestKind): NoteUnit["bodyKind"] {
  switch (kind) {
    case "web":
      return "web_snapshot";
    case "pdf":
      return "pdf_pages";
    case "docx":
    case "pptx":
      return "pdf_pages";
    case "video":
      return "video_transcript";
    case "audio":
      return "voice_transcript";
    default:
      return "web_snapshot";
  }
}

function bodyKindLabel(kind: IngestKind): string {
  switch (kind) {
    case "web":
      return "网页快照";
    case "pdf":
      return "PDF 页文";
    case "docx":
      return "Word 全文";
    case "pptx":
      return "PPT 抽文";
    case "video":
      return "视频转写";
    case "audio":
      return "语音转写";
    default:
      return "文本";
  }
}

export async function ingest(source: IngestSource): Promise<IngestArtifact> {
  const kind = source.kind ?? guessKind(source.uri);
  const src = { ...source, kind };
  switch (kind) {
    case "web":
      return ingestWeb(src);
    case "pdf":
      return ingestPdf(src);
    case "docx":
      return ingestDocx(src);
    case "pptx":
      return ingestPptx(src);
    case "audio":
    case "video":
      return ingestMedia(src);
    case "text": {
      const path = src.uri.replace(/^file:\/\//, "");
      if (!existsSync(path)) throw new Error(`文本不存在：${path}`);
      const fullText = readFileSync(path, "utf8");
      return {
        id: `txt_${basename(path).replace(/\W+/g, "_")}`,
        kind: "text",
        title: src.titleHint ?? basename(path),
        sourceUri: path,
        provider: "fs",
        capturedAt: new Date().toISOString(),
        fullText,
        blocks: chunkText(fullText),
        warnings: [],
      };
    }
    default:
      throw new Error(`不支持的摄入类型：${kind}`);
  }
}

export function artifactToMaterial(
  art: IngestArtifact,
  opt: {
    purposeLabel?: PurposeLabel;
    knowledgePath?: string[];
    set?: Material["set"];
  } = {},
): Material {
  const label = opt.purposeLabel ?? "资料收藏";
  return {
    id: art.id.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 24) || `ING_${Date.now()}`,
    set: opt.set ?? "demo",
    capturedAt: art.capturedAt,
    modality: MODALITY_MAP[art.kind],
    source: {
      kind: art.kind === "web" ? "link" : art.kind === "audio" || art.kind === "video" ? "voice" : "file",
      title: art.title,
      url: /^https?:/i.test(art.sourceUri) ? art.sourceUri : undefined,
      appHint: art.provider,
    },
    layers: {
      visibleText: art.fullText.slice(0, 2000),
      fullText: art.fullText,
      fullTextStatus: art.fullText ? "ok" : "unavailable",
      snapshot: art.snapshotPath,
    },
    blocks: art.blocks.map((b, i) => ({
      id: `${art.id}-b${i + 1}`,
      text: b.text,
      kind: b.kind,
      locator: b.locator,
      topics: opt.knowledgePath?.slice(-1),
    })),
    purpose: {
      track: PURPOSE_TRACK[label],
      label,
      declaredBy: "human",
      declaredAt: art.capturedAt,
      note: opt.knowledgePath?.join(" / "),
    },
    tags: [art.kind, art.provider, ...(opt.knowledgePath ?? [])],
    license: art.kind === "web" ? "link-only" : "owned",
    immutable: true,
  };
}

export function artifactToNoteUnit(
  art: IngestArtifact,
  opt: { knowledgePath?: string[]; purposeLabel?: PurposeLabel } = {},
): NoteUnit {
  const path = opt.knowledgePath ?? ["未分类", art.kind === "web" ? "网络资料" : "本地文档", "新摄入"];
  const label = opt.purposeLabel ?? "资料收藏";
  const summary =
    art.blocks.find((b) => b.kind !== "标题")?.text.slice(0, 72) ??
    art.fullText.slice(0, 72) ??
    art.warnings[0] ??
    "（暂无正文）";

  return {
    id: `note_${art.id}`,
    materialId: art.id,
    title: art.title,
    summary: summary.length >= 72 ? `${summary.slice(0, 72)}…` : summary,
    modality: MODALITY_MAP[art.kind],
    modalityLabel:
      art.kind === "web"
        ? "网页"
        : art.kind === "pdf"
          ? "PDF"
          : art.kind === "docx"
            ? "Word"
            : art.kind === "pptx"
              ? "PPT"
              : art.kind === "video"
                ? "视频"
                : art.kind === "audio"
                  ? "语音"
                  : "文本",
    bodyKind: bodyKindOf(art.kind),
    bodyKindLabel: bodyKindLabel(art.kind),
    track: PURPOSE_TRACK[label],
    purposeLabel: label,
    knowledgePath: path,
    categoryId: path.join("/"),
    tags: [art.kind, art.provider],
    sourceLabel: art.provider,
    capturedAt: art.capturedAt,
    blocks: art.blocks.map((b, i) => ({
      id: `${art.id}-b${i + 1}`,
      kind: b.kind,
      text: b.text,
    })),
    fullTextPreview: art.fullText.slice(0, 8000),
    accent: "#1f7a63",
  };
}

export async function ingestToCard(source: IngestSource) {
  const artifact = await ingest(source);
  const material = artifactToMaterial(artifact, {
    purposeLabel: source.purposeLabel,
    knowledgePath: source.knowledgePath,
  });
  const note = artifactToNoteUnit(artifact, {
    purposeLabel: source.purposeLabel,
    knowledgePath: source.knowledgePath,
  });
  return { artifact, material, note };
}
