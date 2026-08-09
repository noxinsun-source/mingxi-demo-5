/**
 * 捕获闭环管线（真实实现）
 *
 * 灵光捕获信封 →（可选）网页阅读 → 规范化文字+图片
 * → 图片 OCR + VLM 功能理解双轨 → 领域打标 → 写入活知识库
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaptureEnvelope, CanonicalMedia } from "../multimodal/types.ts";
import {
  normalizeCapture,
  canonicalToMaterial,
} from "../multimodal/index.ts";
import { enrichCanonicalWithVision } from "../multimodal/vision-enrich.ts";
import { webReadUrl } from "../agent/tools/web-tools.ts";
import { tagCardWithSiliconFlow } from "../enrich/tagger.ts";
import type { Material } from "../types.ts";
import type { LibraryNote } from "../web/library-data.ts";
import { appendLiveNote } from "../web/live-library.ts";
import { canonicalizeDomainPath } from "../intent/canonicalize-domain.ts";
import { loadMingxiEnv } from "../llm/env.ts";

export interface CapturePipelineResult {
  media: CanonicalMedia;
  material: Material;
  note: LibraryNote;
  steps: string[];
  warnings: string[];
}

function rootDir(): string {
  return process.cwd();
}

async function maybeFetchWebBody(env: CaptureEnvelope): Promise<{
  envelope: CaptureEnvelope;
  steps: string[];
  warnings: string[];
}> {
  const steps: string[] = [];
  const warnings: string[] = [];
  const url = env.primary?.uri;
  if (!url || !/^https?:\/\//i.test(url)) return { envelope: env, steps, warnings };
  if (env.seedText?.trim()) {
    steps.push("seed_text_present");
    return { envelope: env, steps, warnings };
  }
  if (/mp\.weixin\.qq\.com/i.test(url)) {
    warnings.push("微信链接跳过服务端阅读：请用悬浮球截图/存文");
    steps.push("skip_weixin_wall");
    return { envelope: env, steps, warnings };
  }
  try {
    const page = await webReadUrl(url);
    steps.push("web_read");
    return {
      envelope: {
        ...env,
        titleHint: env.titleHint || page.title,
        seedText: page.markdown,
        accessHint: page.markdown.length > 40 ? "ok" : "partial",
      },
      steps,
      warnings: page.truncated
        ? [...warnings, "网页正文已截断至约 12k 字"]
        : warnings,
    };
  } catch (err) {
    warnings.push(`web_read_fail:${err instanceof Error ? err.message : String(err)}`);
    steps.push("web_read_failed");
    return {
      envelope: { ...env, accessHint: env.accessHint ?? "unavailable" },
      steps,
      warnings,
    };
  }
}

function mediaToLibraryNote(
  media: CanonicalMedia,
  material: Material,
  tag: { path: string[]; theme: string; keywords: string[]; imageCaption?: string },
): LibraryNote {
  const ocr = media.texts.filter((t) => t.role === "ocr").map((t) => t.text).join("\n");
  const captions = media.texts.filter((t) => t.role === "caption").map((t) => t.text);
  const body = media.texts
    .filter((t) => t.role === "body" || t.role === "transcript" || t.role === "title")
    .map((t) => t.text)
    .join("\n");
  const previewParts = [
    tag.theme,
    captions[0] ? `【图意】${captions[0]}` : "",
    ocr ? `【OCR】${ocr.slice(0, 400)}` : "",
    body.slice(0, 400),
  ].filter(Boolean);

  const img0 = media.images[0];
  const imageUrl = img0?.uri?.startsWith("http") || img0?.uri?.startsWith("data:")
    ? img0.uri
    : img0?.uri
      ? `/api/mingxi/media?path=${encodeURIComponent(img0.uri.replace(/^\.\//, ""))}`
      : null;

  const sourceTitle = media.title;
  const domainPath = canonicalizeDomainPath(
    tag.path.length ? tag.path : media.knowledgePath ?? ["未分类", "待标注"],
  );
  const theme = tag.theme || captions[0] || "";
  const title =
    theme ||
    body.slice(0, 40).replace(/\s+/g, " ").trim() ||
    (sourceTitle && !/\.(png|jpe?g|webp|gif|pdf)$/i.test(sourceTitle) ? sourceTitle : "") ||
    domainPath.slice(-1)[0] ||
    "未命名笔记";

  return {
    id: material.id,
    corpusId: media.id,
    title,
    sourceTitle,
    summary: theme || body.slice(0, 120) || sourceTitle,
    preview: previewParts.join("\n\n").slice(0, 1200),
    modality: material.modality,
    capturedAt: media.capturedAt,
    // 未声明用途 → 待定，留给网页端「用途候选确认」
    purposeLabel: media.purposeLabel ?? "待定",
    polarity: "中性",
    stance: "观察",
    domainPath,
    functionalTypes: captions.length ? ["界面/图意理解"] : ["资料"],
    userGoals: [],
    theme: tag.theme,
    imageUrl,
    sourceUri: media.sourceUri,
    tags: [
      ...material.tags,
      ...tag.keywords,
      "live-capture",
      ...media.pipeline.filter((p) => p.includes("vision") || p.includes("web")),
    ],
    media: img0
      ? {
          kind: "image",
          url: imageUrl,
          downloadUrl: media.sourceUri?.startsWith("http") ? media.sourceUri : imageUrl,
          label: img0.id,
        }
      : media.sourceUri?.startsWith("http")
        ? {
            kind: "link",
            url: media.sourceUri,
            downloadUrl: media.sourceUri,
            label: media.title,
          }
        : null,
  };
}

/**
 * 跑通一轮捕获 → 知识库更新
 */
export async function runCapturePipeline(
  envelope: CaptureEnvelope,
  opt: {
    enrichVision?: boolean;
    tag?: boolean;
    persist?: boolean;
    maxImages?: number;
    snapshotDir?: string;
  } = {},
): Promise<CapturePipelineResult> {
  loadMingxiEnv();
  const steps: string[] = ["capture_envelope"];
  const warnings: string[] = [];

  const fetched = await maybeFetchWebBody(envelope);
  steps.push(...fetched.steps);
  warnings.push(...fetched.warnings);

  const snapshotDir =
    opt.snapshotDir ?? resolve(rootDir(), "data/mingxi/snapshots/canonical");
  let media = normalizeCapture(fetched.envelope, {
    snapshotDir: opt.persist !== false ? snapshotDir : undefined,
    runVideoSplit: true,
  });
  steps.push("normalize");
  warnings.push(...media.warnings);

  if (opt.enrichVision !== false && media.images.length > 0) {
    media = await enrichCanonicalWithVision(media, {
      root: rootDir(),
      maxImages: opt.maxImages ?? 4,
    });
    steps.push("vision_dual_track");
    warnings.push(...media.warnings.filter((w) => /vision_/.test(w)));
  }

  const material = canonicalToMaterial(media);

  let tag = {
    path: media.knowledgePath ?? ["未分类", "待标注"],
    theme: media.texts.find((t) => t.role === "caption")?.text ?? media.title,
    keywords: [] as string[],
    imageCaption: media.texts.find((t) => t.role === "caption")?.text,
  };

  if (opt.tag !== false) {
    try {
      const domain = await tagCardWithSiliconFlow({
        id: media.id,
        title: media.title,
        summary: tag.theme,
        modality: material.modality,
        fullTextPreview: media.texts.map((t) => `[${t.role}] ${t.text}`).join("\n"),
        blocks: material.blocks,
        sourceUri: media.sourceUri,
        images: media.images.map((i) => ({ uri: i.uri })),
        knowledgePath: media.knowledgePath,
      });
      tag = {
        path: domain.path,
        theme: domain.theme,
        keywords: domain.keywords,
        imageCaption: domain.imageCaption,
      };
      media = { ...media, knowledgePath: domain.path };
      steps.push("domain_tag");
    } catch (err) {
      warnings.push(`tag_fail:${err instanceof Error ? err.message : String(err)}`);
      steps.push("domain_tag_skipped");
    }
  }

  const note = mediaToLibraryNote(media, material, tag);

  if (opt.persist !== false) {
    appendLiveNote(note);
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(
      resolve(snapshotDir, `${media.id}.canonical.json`),
      JSON.stringify(media, null, 2),
      "utf8",
    );
    steps.push("kb_write");
  }

  return {
    media: { ...media, warnings: [...new Set([...media.warnings, ...warnings])] },
    material,
    note,
    steps,
    warnings,
  };
}
