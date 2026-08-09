/**
 * 多源归纳管线（Agent 工具与 CLI 共用的真实实现）
 *
 * ①  接入：URL / 本地文件（pdf/docx/pptx/音视频/图片/文本）/ 纯文本
 *     → 复用 ingest 适配器 + normalizeCapture → CanonicalMedia（只有文字+图片）
 * ②  视觉补齐：有图片 → OCR + caption 双轨回填
 * ③  理解：三层理解 + 标签（understand.ts，一次 LLM 调用）
 * ④  归纳：统一 HTML + 入库（note-store）
 */
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { ingest } from "../ingest/index.ts";
import type { IngestKind } from "../ingest/types.ts";
import { normalizeCapture } from "../multimodal/index.ts";
import { enrichCanonicalWithVision } from "../multimodal/vision-enrich.ts";
import type { CanonicalMedia, CaptureEnvelope } from "../multimodal/types.ts";
import { hasSiliconFlowKey } from "./provider.ts";
import { understandCanonical } from "./understand.ts";
import { saveNoteRecord, type SaveNoteResult } from "./note-store.ts";
import type { NoteRecord, NoteTagSet, NoteUnderstanding } from "./types.ts";

export type SourceKind =
  | "url"
  | "pdf"
  | "docx"
  | "pptx"
  | "audio"
  | "video"
  | "image"
  | "textfile"
  | "rawtext";

export interface IngestInput {
  /** URL / 本地路径 / 一段纯文本 */
  source: string;
  titleHint?: string;
  declaredPurpose?: string;
  contextHint?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg)$/i;
const VIDEO_EXT = /\.(mp4|mov|mkv|webm)$/i;

export function detectSourceKind(source: string, root = process.cwd()): SourceKind {
  const s = source.trim();
  if (/^https?:\/\//i.test(s)) return "url";
  const path = s.replace(/^file:\/\//, "");
  const abs = path.startsWith("/") ? path : resolve(root, path);
  // 含换行或不存在于磁盘 → 视为纯文本
  if (/\n/.test(s) || !existsSync(abs)) return "rawtext";
  const ext = extname(abs).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  if (IMAGE_EXT.test(ext)) return "image";
  if (AUDIO_EXT.test(ext)) return "audio";
  if (VIDEO_EXT.test(ext)) return "video";
  return "textfile";
}

export interface IngestOutcome {
  media: CanonicalMedia;
  sourceKind: SourceKind;
  visionEnriched: boolean;
}

/** 步骤①+②：任意来源 → CanonicalMedia */
export async function ingestSourceToCanonical(
  input: IngestInput,
  opts: { root?: string; snapshotDir?: string; runStandaloneVision?: boolean } = {},
): Promise<IngestOutcome> {
  const root = opts.root ?? process.cwd();
  const snapshotDir =
    opts.snapshotDir ?? resolve(root, "data/mingxi/snapshots/pi-agent");
  const kind = detectSourceKind(input.source, root);

  let envelope: CaptureEnvelope;

  if (kind === "rawtext") {
    envelope = {
      channel: "paste_text",
      kind: "plain_text",
      seedText: input.source,
      titleHint:
        input.titleHint ??
        input.source.trim().split("\n")[0]?.slice(0, 40) ??
        "粘贴文本",
    };
  } else if (kind === "image") {
    const path = input.source.replace(/^file:\/\//, "");
    const abs = path.startsWith("/") ? path : resolve(root, path);
    envelope = {
      channel: "file_import",
      kind: "image",
      primary: { uri: abs },
      titleHint: input.titleHint,
    };
  } else if (kind === "url" || kind === "pdf" || kind === "docx" || kind === "pptx" || kind === "audio" || kind === "video" || kind === "textfile") {
    // 走 ingest 适配器抽正文（web/pdf/office/asr/text）
    const ingestKind: IngestKind =
      kind === "url" ? "web" : kind === "textfile" ? "text" : kind;
    const artifact = await ingest({
      uri: input.source,
      kind: ingestKind,
      titleHint: input.titleHint,
    });
    const path = input.source.replace(/^file:\/\//, "");
    const abs =
      kind === "url" ? input.source : path.startsWith("/") ? path : resolve(root, path);
    envelope = {
      channel: kind === "url" ? "url_fetch" : "file_import",
      kind:
        kind === "url"
          ? "webpage"
          : kind === "textfile"
            ? "plain_text"
            : kind,
      primary: { uri: abs },
      seedText: artifact.fullText || undefined,
      titleHint: input.titleHint ?? artifact.title,
    };
  } else {
    throw new Error(`未支持的来源类型：${kind}`);
  }

  let media = normalizeCapture(envelope, { snapshotDir });

  // 默认不在这里单独跑 OCR/caption：三层理解（understand）一次 VLM 调用会
  // 同时产出 imageFindings（可见文字+画面内容）并回写双轨，避免重复调用与限流。
  let visionEnriched = false;
  if (opts.runStandaloneVision && media.images.length && hasSiliconFlowKey()) {
    try {
      media = await enrichCanonicalWithVision(media, { root });
      visionEnriched = true;
    } catch (err) {
      media = {
        ...media,
        warnings: [
          ...media.warnings,
          `vision_enrich_failed: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }
  }

  return { media, sourceKind: kind, visionEnriched };
}

export interface PipelineResult {
  media: CanonicalMedia;
  understanding: NoteUnderstanding;
  tags: NoteTagSet;
  record: NoteRecord;
  saved: SaveNoteResult;
  model: string;
}

function noteIdFrom(media: CanonicalMedia): string {
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, "");
  const base = media.id.replace(/[^\w-]+/g, "_").slice(0, 24);
  return `${stamp}_${base}`;
}

/** 把三层理解中的图片发现回写为双轨文本单元（OCR + caption），保持规范约定 */
function backfillImageDualTrack(
  media: CanonicalMedia,
  understanding: NoteUnderstanding,
): CanonicalMedia {
  if (!understanding.content.imageFindings.length) return media;
  const texts = [...media.texts];
  const images = media.images.map((img) => {
    const finding = understanding.content.imageFindings.find(
      (f) => f.imageId === img.id,
    );
    const role = understanding.contextRole.imageRoles.find(
      (f) => f.imageId === img.id,
    );
    if (!finding) return img;
    const ocrId = `${img.id}_ocr`;
    if (finding.visibleText && !texts.some((t) => t.id === ocrId)) {
      texts.push({
        id: ocrId,
        role: "ocr",
        text: finding.visibleText,
        source: "ocr",
        confidence: 0.8,
        locator: { type: "bbox", bbox: [0, 0, 1, 1], imageId: img.id },
      });
    }
    const capId = `${img.id}_caption`;
    const caption = [finding.whatItShows, role?.role].filter(Boolean).join("；");
    if (caption && !texts.some((t) => t.id === capId)) {
      texts.push({
        id: capId,
        role: "caption",
        text: caption,
        source: "llm_caption",
        confidence: 0.8,
      });
    }
    return {
      ...img,
      caption: caption || img.caption,
      ocrTextIds: finding.visibleText ? [ocrId, ...(img.ocrTextIds ?? [])] : img.ocrTextIds,
    };
  });
  return {
    ...media,
    texts,
    images,
    pipeline: [...media.pipeline, "vision_dual_track"],
  };
}

/** 步骤③+④：CanonicalMedia → 三层理解 → NoteRecord → HTML 入库 */
export async function understandAndSave(
  media: CanonicalMedia,
  opts: {
    root?: string;
    declaredPurpose?: string;
    contextHint?: string;
  } = {},
): Promise<PipelineResult> {
  const root = opts.root ?? process.cwd();
  const { understanding, tags, model, suggestedTitle } = await understandCanonical(
    media,
    {
      declaredPurpose: opts.declaredPurpose,
      contextHint: opts.contextHint,
      root,
    },
  );
  media = backfillImageDualTrack(media, understanding);
  // AI 标题优先（除非用户手动给了 titleHint 且不是文件名派生）
  const title = suggestedTitle?.trim() || media.title;

  const record: NoteRecord = {
    id: noteIdFrom(media),
    title,
    capturedAt: media.capturedAt,
    purposeStatus:
      opts.declaredPurpose?.trim() && !["待定", "未定"].includes(opts.declaredPurpose.trim())
        ? "declared"
        : "pending",
    source: {
      kind: media.rawKind,
      uri: media.sourceUri,
      channel: media.channel,
      access: media.access,
    },
    media,
    understanding,
    tags,
    htmlPath: "",
    model,
    pipeline: [...media.pipeline, "three_layer_understand", "render_html", "save_note"],
    warnings: media.warnings,
  };

  const saved = saveNoteRecord(record, { root });
  return { media, understanding, tags, record: { ...record, htmlPath: saved.indexEntry.htmlPath }, saved, model };
}

/** 一步到位：来源 → 入库（确定性管线，产品主路径） */
export async function runNotesPipeline(
  input: IngestInput,
  opts: { root?: string; runStandaloneVision?: boolean } = {},
): Promise<PipelineResult & { sourceKind: SourceKind }> {
  const outcome = await ingestSourceToCanonical(input, opts);
  const result = await understandAndSave(outcome.media, {
    root: opts.root,
    declaredPurpose: input.declaredPurpose,
    contextHint: input.contextHint,
  });
  return { ...result, sourceKind: outcome.sourceKind };
}
