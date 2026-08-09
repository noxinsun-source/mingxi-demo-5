/**
 * 多模态核心 · 规范化
 *
 * CaptureEnvelope → CanonicalMedia（只含 texts + images）
 * CanonicalMedia → Material（进 Agent / 卡片）
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Material, PurposeLabel } from "../types.ts";
import { PURPOSE_TRACK } from "../types.ts";
import { mergeFloatBallCaptures } from "./phone-capture.ts";
import { splitVideoScenes } from "./video-frames.ts";
import type {
  AccessStatus,
  CaptureEnvelope,
  CanonicalMedia,
  ImageUnit,
  PipelineStepSpec,
  RawInputKind,
  TextUnit,
} from "./types.ts";

export const PIPELINE_SPEC: PipelineStepSpec[] = [
  {
    id: "classify",
    title: "识别入口类型与通道",
    when: "*",
    produces: [],
    notes: "判定 RawInputKind / CaptureChannel / AccessStatus",
  },
  {
    id: "fetch_or_index",
    title: "拉取或仅索引链接",
    when: ["webpage", "social_link"],
    produces: ["text"],
    notes: "可抓则快照；登录墙 → unavailable，等悬浮球补齐",
  },
  {
    id: "extract_document",
    title: "文档抽文 / 页图",
    when: ["pdf", "docx", "pptx", "table"],
    produces: ["text", "image"],
    notes: "文字进 texts；可选页渲染进 images",
  },
  {
    id: "asr_transcribe",
    title: "语音/视频转写",
    when: ["audio", "video"],
    produces: ["text"],
    notes: "全部进 transcript 文字单元",
  },
  {
    id: "video_scene_split",
    title: "视频分镜关键帧",
    when: ["video"],
    produces: ["image"],
    notes: "场景切换 → 一张张 video_keyframe",
  },
  {
    id: "ocr_images",
    title: "图片/截图 OCR",
    when: ["image", "screenshot", "mixed_bundle"],
    produces: ["text"],
    notes: "OCR 文字挂回 texts，图仍保留",
  },
  {
    id: "phone_merge",
    title: "合并悬浮球本机捕获",
    when: "*",
    produces: ["text", "image"],
    notes: "无权限贴文的主路径",
  },
  {
    id: "pack_card",
    title: "打包统一卡片",
    when: "*",
    produces: ["text", "image"],
    notes: "CanonicalMedia → NoteUnit / Material",
  },
];

const SOCIAL_HOST_HINT =
  /xiaohongshu\.com|xhslink\.com|instagram\.com|x\.com|twitter\.com|weixin\.qq\.com/i;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function inferKind(env: CaptureEnvelope): RawInputKind {
  if (env.kind) return env.kind;
  const uri = env.primary?.uri ?? "";
  if (/^https?:/i.test(uri)) {
    return SOCIAL_HOST_HINT.test(uri) ? "social_link" : "webpage";
  }
  const lower = uri.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (/\.(mp3|m4a|wav|aac|ogg)$/i.test(lower)) return "audio";
  if (/\.(mp4|mov|mkv|webm)$/i.test(lower)) return "video";
  if (/\.(png|jpe?g|webp|gif|heic)$/i.test(lower)) return "image";
  return "plain_text";
}

function inferAccess(env: CaptureEnvelope, kind: RawInputKind): AccessStatus {
  if (env.accessHint) return env.accessHint;
  if (env.floatBall?.length) return "phone_captured";
  if (kind === "social_link") return "unavailable";
  if (kind === "webpage" && env.primary?.uri && SOCIAL_HOST_HINT.test(env.primary.uri)) {
    return "unavailable";
  }
  return "ok";
}

function persistCanonical(
  media: CanonicalMedia,
  snapshotDir: string,
): string {
  mkdirSync(snapshotDir, { recursive: true });
  const path = resolve(snapshotDir, `${media.id}.canonical.json`);
  writeFileSync(path, JSON.stringify(media, null, 2), "utf8");
  return path;
}

/**
 * 规范化入口。
 * 已有 seedText / floatBall / 预抽文时完全本地可跑；
 * 需要 ASR/OCR/网页抓取时，由调用方先填好 envelope 或接 ingest 适配器。
 */
export function normalizeCapture(
  env: CaptureEnvelope,
  opt: { snapshotDir?: string; runVideoSplit?: boolean } = {},
): CanonicalMedia {
  const kind = inferKind(env);
  const channel = env.channel;
  let access = inferAccess(env, kind);
  const pipeline: string[] = ["classify"];
  const warnings: string[] = [];
  const texts: TextUnit[] = [];
  const images: ImageUnit[] = [];
  const id = env.id ?? uid("can");
  const capturedAt = new Date().toISOString();
  const title =
    env.titleHint ??
    env.floatBall?.[0]?.pageTitle ??
    (env.primary ? basename(env.primary.uri) : "未命名笔记");

  // —— 种子文字（粘贴 / 预转写 / 已抽文）——
  if (env.seedText?.trim()) {
    texts.push({
      id: `${id}_seed`,
      role: kind === "audio" || kind === "video" ? "transcript" : "body",
      text: env.seedText.trim(),
      source: kind === "audio" || kind === "video" ? "asr" : "extract",
    });
    pipeline.push(
      kind === "audio" || kind === "video" ? "asr_transcribe" : "extract_document",
    );
  }

  // —— 链接：可抓 vs 仅索引 ——
  if (kind === "webpage" || kind === "social_link") {
    pipeline.push("fetch_or_index");
    const url = env.primary?.uri;
    if (access === "unavailable" || access === "pending") {
      texts.push({
        id: `${id}_link_index`,
        role: "meta",
        text: `链接索引（正文不可用）：${title} ${url ?? ""}`.trim(),
        source: "extract",
      });
      warnings.push("远端正文不可访问；请用手机悬浮球截图/存文/存图补齐");
    } else if (url && !env.seedText) {
      warnings.push("网页正文未预填：请先走 ingest 网页适配器或悬浮球");
      access = access === "ok" ? "partial" : access;
    }
  }

  // —— 纯图 / 截图入口 ——
  if ((kind === "image" || kind === "screenshot") && env.primary?.uri) {
    images.push({
      id: `${id}_img0`,
      role: kind === "screenshot" ? "screenshot" : "photo",
      uri: env.primary.uri,
      mime: env.primary.mime,
    });
    pipeline.push("ocr_images");
    // 双轨文字由 enrichCanonicalWithVision / capture_ingest 异步回填
    warnings.push("图片已入库，等待 OCR+VLM 双轨回填（capture_ingest / enrichVision）");
  }

  // —— 附件图 ——
  for (const [i, att] of (env.attachments ?? []).entries()) {
    if (/\.(png|jpe?g|webp|gif|heic)$/i.test(att.uri) || att.mime?.startsWith("image/")) {
      images.push({
        id: `${id}_att_${i + 1}`,
        role: "attachment",
        uri: att.uri,
        mime: att.mime,
      });
    }
  }

  // —— 视频分镜 ——
  if (kind === "video" && env.primary?.uri && opt.runVideoSplit !== false) {
    pipeline.push("video_scene_split");
    if (!env.seedText) {
      pipeline.push("asr_transcribe");
      warnings.push("视频转写未预填：配置 ASR 后写入 seedText 或接 asr 适配器");
    }
    const local = env.primary.uri.replace(/^file:\/\//, "");
    if (existsSync(local)) {
      const outDir = resolve(
        opt.snapshotDir ?? resolve(process.cwd(), "data/mingxi/snapshots/frames"),
        id,
      );
      const split = splitVideoScenes(local, outDir);
      images.push(...split.images);
      warnings.push(...split.warnings);
      pipeline.push(split.pipelineNote);
    } else if (/^https?:/i.test(env.primary.uri)) {
      warnings.push("视频为远端 URL：请先下载到本地再分镜，或由手机侧抽帧上传");
    }
  }

  if (kind === "audio" && !env.seedText) {
    pipeline.push("asr_transcribe");
    warnings.push("语音转写未预填：需 ASR 后写入 seedText");
  }

  // —— 悬浮球合并 ——
  if (env.floatBall?.length) {
    pipeline.push("phone_merge");
    const merged = mergeFloatBallCaptures(env.floatBall);
    texts.push(...merged.texts);
    images.push(...merged.images);
    warnings.push(...merged.warnings);
    if (merged.accessUpgrade) access = merged.accessUpgrade;
  }

  // —— 文档类无正文时提示 ——
  if (["pdf", "docx", "pptx", "table"].includes(kind) && !env.seedText) {
    pipeline.push("extract_document");
    warnings.push("文档正文未预填：请先走 ingest 文档适配器");
  }

  if (!texts.length && !images.length) {
    warnings.push("规范化后既无文字也无图片 —— 捕获失败或仅索引");
  }

  pipeline.push("pack_card");

  const media: CanonicalMedia = {
    id,
    title,
    rawKind: kind,
    channel,
    access,
    sourceUri: env.primary?.uri ?? env.floatBall?.[0]?.pageUrl,
    appHint: env.floatBall?.[0]?.appHint,
    capturedAt,
    texts,
    images,
    purposeLabel: env.purposeLabel,
    knowledgePath: env.knowledgePath,
    warnings,
    pipeline,
  };

  if (opt.snapshotDir) {
    persistCanonical(media, opt.snapshotDir);
  }
  return media;
}

/** 规范介质 → Material（进 Agent） */
export function canonicalToMaterial(media: CanonicalMedia): Material {
  // Material 需要封闭 PurposeLabel；「待定」先落资料收藏配方，人确认后再改活库
  const raw = media.purposeLabel;
  const label: PurposeLabel =
    !raw || raw === "待定" ? "资料收藏" : (raw as PurposeLabel);
  const fullText = media.texts.map((t) => t.text).join("\n\n");
  const modalityMap: Record<string, Material["modality"]> = {
    pdf: "pdf",
    docx: "pdf",
    pptx: "pdf",
    webpage: "webpage",
    social_link: "social_post",
    audio: "voice",
    video: "video",
    image: "photo",
    screenshot: "screenshot",
    plain_text: "webpage",
    chat_export: "chat",
    table: "table",
    mixed_bundle: "screenshot",
  };

  const fullTextStatus =
    media.access === "unavailable"
      ? "unavailable"
      : media.access === "pending"
        ? "pending"
        : fullText
          ? "ok"
          : "unavailable";

  return {
    id: media.id.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 28) || `CAN_${Date.now()}`,
    set: "demo",
    capturedAt: media.capturedAt,
    modality: modalityMap[media.rawKind] ?? "webpage",
    source: {
      kind:
        media.channel === "phone_floatball"
          ? "screen"
          : media.channel === "url_fetch"
            ? "link"
            : media.rawKind === "audio"
              ? "voice"
              : media.rawKind === "image" || media.rawKind === "screenshot"
                ? "photo"
                : "file",
      title: media.title,
      url: media.sourceUri?.startsWith("http") ? media.sourceUri : undefined,
      appHint: media.appHint ?? media.channel,
    },
    layers: {
      visibleText: fullText.slice(0, 2000),
      fullText: fullText || undefined,
      fullTextStatus,
      snapshot: media.images[0]?.uri,
      images: media.images.map((img) => ({
        id: img.id,
        path: img.uri,
        role: img.role,
        caption: img.caption,
        atSeconds: img.atSeconds,
        sceneIndex: img.sceneIndex,
      })),
    },
    blocks: media.texts.map((t, i) => ({
      id: `${media.id}-t${i + 1}`,
      text: t.text,
      kind:
        t.role === "transcript" || t.role === "subtitle"
          ? ("口述" as const)
          : t.role === "title"
            ? ("标题" as const)
            : ("正文" as const),
      locator: t.locator ?? { type: "span" as const, start: 0, end: t.text.length },
      ocrConfidence: t.confidence,
      topics: media.knowledgePath?.slice(-1),
    })),
    purpose: {
      track: PURPOSE_TRACK[label],
      label,
      declaredBy: "human",
      declaredAt: media.capturedAt,
      note: media.knowledgePath?.join(" / "),
    },
    tags: [
      media.rawKind,
      media.channel,
      media.access,
      ...media.images.map((i) => i.role),
      ...(media.knowledgePath ?? []),
    ],
    license: media.channel === "phone_floatball" ? "owned" : media.access === "unavailable" ? "link-only" : "owned",
    flags: media.access === "unavailable" ? ["captureFailed"] : undefined,
    immutable: true,
  };
}

/** 一步：信封 → Material */
export function normalizeToMaterial(
  env: CaptureEnvelope,
  opt?: { snapshotDir?: string; runVideoSplit?: boolean },
): { media: CanonicalMedia; material: Material } {
  const media = normalizeCapture(env, opt);
  return { media, material: canonicalToMaterial(media) };
}

export type {
  AccessStatus,
  CaptureAssetRef,
  CaptureChannel,
  CaptureEnvelope,
  CanonicalMedia,
  FloatBallAction,
  FloatBallCapture,
  ImageRole,
  ImageUnit,
  PipelineStepId,
  PipelineStepSpec,
  RawInputKind,
  TextRole,
  TextUnit,
} from "./types.ts";

export { mergeFloatBallCaptures } from "./phone-capture.ts";
export { splitVideoScenes } from "./video-frames.ts";
