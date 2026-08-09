/**
 * 真实多模态语料加载器
 *
 * 读 data/mingxi/real/latest-cards.json → Material[] / NoteUnit[]
 * 仿真集仅作归档；默认测试与 Demo 走这里。
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Material, Modality, PurposeLabel } from "./types.ts";
import { PURPOSE_TRACK } from "./types.ts";
import type { NoteUnit } from "./knowledge-atlas.ts";
import { atlasPathOf, type NoteTagLayers } from "./tags.ts";

export interface RealCardFile
  extends Omit<Partial<NoteUnit>, "modality" | "bodyKind" | "purposeLabel"> {
  id: string;
  title: string;
  summary?: string;
  modality?: Modality | string;
  modalityLabel?: string;
  bodyKind?: NoteUnit["bodyKind"] | string;
  bodyKindLabel?: string;
  purposeLabel?: PurposeLabel | string;
  knowledgePath?: string[];
  tags?: string[];
  /** 两层标签：domain(AI 领域层级) + user(用户功能标签) */
  tagLayers?: NoteTagLayers;
  /** AI 主旨（与 domain.theme 同步） */
  aiTheme?: string;
  sourceLabel?: string;
  capturedAt?: string;
  blocks?: Array<{ id: string; kind: string; text: string }>;
  fullTextPreview?: string;
  accent?: string;
  license?: string;
  sourceUri?: string;
  access?: string;
  corpusId?: string;
  materialId?: string;
  images?: Array<{ id: string; uri?: string; path?: string; role?: string; caption?: string }>;
}

function defaultPurpose(label?: string): PurposeLabel {
  const allowed: PurposeLabel[] = [
    "学习理论",
    "概念学习",
    "资料收藏",
    "反例避坑",
    "对标拆解",
    "素材金句",
    "待办行动",
  ];
  if (label && (allowed as string[]).includes(label)) {
    return label === "概念学习" ? "学习理论" : (label as PurposeLabel);
  }
  return "资料收藏";
}

function asModality(m?: string): Modality {
  const map: Record<string, Modality> = {
    webpage: "webpage",
    pdf: "pdf",
    docx: "pdf",
    pptx: "pdf",
    voice_transcript: "voice",
    voice: "voice",
    video: "video",
    social_post: "social_post",
    "social_link+floatball": "social_post",
    screenshot: "screenshot",
    photo: "photo",
    table: "table",
    chat: "chat",
    obsidian_md: "webpage",
  };
  return map[m ?? ""] ?? "webpage";
}

/** 稳定、唯一的原料 ID（中文标题剥 ASCII 后易撞号，故一律附 hash） */
function stableMaterialId(card: RealCardFile, index: number): string {
  const source = card.id || card.corpusId || card.materialId || `REAL_${index}`;
  const h = createHash("sha1").update(source).digest("hex").slice(0, 12).toUpperCase();
  const ascii = source
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return ascii ? `${ascii}_${h}` : `REAL_${h}`;
}

/** NoteUnit / real card JSON → Material */
export function realCardToMaterial(card: RealCardFile, index = 0): Material {
  const purposeLabel = defaultPurpose(card.purposeLabel);
  const fullText =
    card.fullTextPreview ??
    card.blocks?.map((b) => b.text).join("\n\n") ??
    card.summary ??
    "";
  const id = stableMaterialId(card, index);

  const access = card.access;
  const fullTextStatus =
    access === "unavailable"
      ? "unavailable"
      : access === "pending"
        ? "pending"
        : fullText
          ? "ok"
          : "unavailable";

  return {
    id,
    set: "demo",
    storyLine: undefined,
    capturedAt: card.capturedAt ?? new Date().toISOString(),
    modality: asModality(String(card.modality ?? "")),
    source: {
      kind: card.sourceUri?.startsWith("http")
        ? "link"
        : card.modality === "voice" || card.modality === "voice_transcript"
          ? "voice"
          : "file",
      title: card.title,
      url: card.sourceUri?.startsWith("http") ? card.sourceUri : undefined,
      appHint: card.sourceLabel ?? "real-corpus",
    },
    layers: {
      visibleText: fullText.slice(0, 2000),
      fullText: fullText || undefined,
      fullTextStatus,
      snapshot: card.images?.[0]?.uri ?? card.images?.[0]?.path,
      images: card.images?.map((img) => ({
        id: img.id,
        path: img.uri ?? img.path ?? "",
        role: img.role ?? "attachment",
        caption: img.caption,
      })),
    },
    blocks: (card.blocks?.length
      ? card.blocks
      : [{ id: `${id}-b1`, kind: "正文", text: fullText || card.title }]
    ).map((b, i) => ({
      id: b.id || `${id}-b${i + 1}`,
      text: b.text,
      kind: (["标题", "正文", "要点", "数据", "引用", "评论", "字幕", "口述", "表格", "图注"].includes(
        b.kind,
      )
        ? b.kind
        : "正文") as Material["blocks"][0]["kind"],
      locator: { type: "span" as const, start: 0, end: b.text.length },
      topics: card.knowledgePath?.slice(-1),
    })),
    purpose: {
      track: PURPOSE_TRACK[purposeLabel],
      label: purposeLabel,
      declaredBy: "human",
      declaredAt: card.capturedAt,
      note: card.knowledgePath?.join(" / "),
    },
    tags: [...(card.tags ?? []), "real-corpus", ...(card.knowledgePath ?? [])],
    license:
      card.license?.includes("owned") || card.license?.includes("sample")
        ? "owned"
        : card.license?.includes("link")
          ? "link-only"
          : "public-cc",
    flags: fullTextStatus === "unavailable" ? ["captureFailed"] : undefined,
    immutable: true,
  };
}

export function loadRealCards(root = process.cwd()): RealCardFile[] {
  const path = resolve(root, "data/mingxi/real/latest-cards.json");
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(raw) ? raw : [];
}

export function loadRealMaterials(root = process.cwd()): Material[] {
  return loadRealCards(root).map((c, i) => realCardToMaterial(c, i));
}

export function loadRealNoteUnits(root = process.cwd()): NoteUnit[] {
  return loadRealCards(root).map((c, i) => {
    const m = realCardToMaterial(c, i);
    const path = atlasPathOf(c);
    const theme = c.tagLayers?.domain?.theme || c.aiTheme;
    return {
      id: c.id.startsWith("real_") || c.id.startsWith("note_") ? c.id : `real_${c.id}`,
      materialId: m.id,
      title: c.title,
      summary: theme || c.summary || m.layers.visibleText.slice(0, 72),
      modality: m.modality,
      modalityLabel: c.modalityLabel ?? m.modality,
      bodyKind: (c.bodyKind as NoteUnit["bodyKind"]) ?? "web_snapshot",
      bodyKindLabel: c.bodyKindLabel ?? "全文",
      track: m.purpose.track,
      purposeLabel: m.purpose.label,
      knowledgePath: path,
      categoryId: path.join("/"),
      tags: m.tags,
      tagLayers: c.tagLayers,
      sourceLabel: c.sourceLabel ?? "real",
      capturedAt: m.capturedAt,
      blocks: m.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
      fullTextPreview: m.layers.fullText ?? m.layers.visibleText,
      accent: c.accent ?? "#1f7a63",
    };
  });
}

export function loadRealCatalog(root = process.cwd()): Record<string, unknown> | null {
  const path = resolve(root, "data/mingxi/real/catalog.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
