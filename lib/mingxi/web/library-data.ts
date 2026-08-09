/**
 * 网页端：银标笔记库加载（gold ∩ real cards）
 *
 * vinext 运行 cwd=/bundle，无法读仓库 data/；因此以打包进模块的
 * silver-library.json 为主，本地 Node 脚本仍可走 fs 回退/重建。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, basename, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import silverPack from "../../../data/mingxi/eval/silver-library.json" with { type: "json" };
import {
  mediaKindFromPath,
  isPlaceholderPreview,
  type MediaKind,
  type NoteMedia,
} from "./note-media.ts";
import { canonicalizeDomainPath } from "../intent/canonicalize-domain.ts";

export type { MediaKind, NoteMedia };
export { mediaKindFromPath, isPlaceholderPreview };

export interface LibraryNote {
  id: string;
  corpusId: string;
  /** 面向用户的标题：优先 AI 主旨整理，而非原文件名 */
  title: string;
  summary: string;
  preview: string;
  modality: string;
  capturedAt?: string;
  purposeLabel: string;
  polarity: string;
  stance: string;
  domainPath: string[];
  functionalTypes: string[];
  userGoals: string[];
  theme?: string;
  /** 捕获时的原始标题（文件名 / 网页 title），仅作溯源 */
  sourceTitle?: string;
  /** @deprecated 兼容旧字段；优先用 media */
  imageUrl?: string | null;
  sourceUri?: string;
  /** library=仓库笔记 · web=联网检索页 */
  sourceKind?: "library" | "web";
  tags: string[];
  media?: NoteMedia | null;
}

/** 原文件名 / 粘贴图 / 过短占位等，不应作为卡片主标题 */
export function isRawSourceTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/^Obsidian\s*图片/i.test(t)) return true;
  if (/^Pasted image/i.test(t)) return true;
  if (/\bIMG_\d+/i.test(t)) return true;
  if (/\.(png|jpe?g|webp|gif|heic|pdf|pptx?|docx?|html?)$/i.test(t)) return true;
  if (/^(截图|图片|未命名|模板|创新点|微信|收藏)/i.test(t) && t.length <= 8) return true;
  if (/^[a-f0-9-]{8,}$/i.test(t)) return true;
  return false;
}

/** 从 AI theme/summary 生成可读标题 */
export function resolveAiNoteTitle(input: {
  theme?: string | null;
  summary?: string | null;
  sourceTitle?: string | null;
  domainPath?: string[];
}): string {
  const theme = String(input.theme || "").trim();
  const summary = String(input.summary || "").trim();
  const source = String(input.sourceTitle || "").trim();
  // 有 AI 主旨时一律用主旨作标题（避免 IMG_xxx / Obsidian 图片 等原文件名）
  const ai = theme || (summary && !isRawSourceTitle(summary) ? summary : "");
  if (ai) return ai.length > 72 ? `${ai.slice(0, 70)}…` : ai;
  if (source && !isRawSourceTitle(source)) return source;
  const leaf = input.domainPath?.filter(Boolean).slice(-1)[0];
  if (leaf) return leaf;
  return source || "未命名笔记";
}

function resolveCardSummary(input: {
  title: string;
  theme?: string;
  preview: string;
  purposeLabel: string;
  domainPath: string[];
}): string {
  // 从预览里挑一句不像文件名的正文
  const lines = input.preview
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const line of lines) {
    if (sameMeaning(line, input.title)) continue;
    if (isRawSourceTitle(line)) continue;
    if (/^Obsidian\s*图片/i.test(line)) continue;
    if (line.length < 8) continue;
    return line.slice(0, 120);
  }
  if (input.domainPath.length) {
    return `${input.domainPath.join(" / ")} · ${input.purposeLabel}`;
  }
  return input.purposeLabel;
}

function sameMeaning(a: string, b: string): boolean {
  const x = a.replace(/…$/, "").trim();
  const y = b.replace(/…$/, "").trim();
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** 运行时：AI 标题 + C1 领域路径收敛 */
export function hydrateNoteTitle(note: LibraryNote): LibraryNote {
  const sourceTitle = note.sourceTitle || note.title;
  const domainPath = canonicalizeDomainPath(note.domainPath || []);
  const title = resolveAiNoteTitle({
    theme: note.theme,
    summary: note.summary,
    sourceTitle,
    domainPath,
  });
  const keepSummary =
    note.summary &&
    !isRawSourceTitle(note.summary) &&
    !sameMeaning(note.summary, title) &&
    !sameMeaning(note.summary, note.theme || "");
  const summary = keepSummary
    ? note.summary
    : resolveCardSummary({
        title,
        theme: note.theme,
        preview: note.preview || "",
        purposeLabel: note.purposeLabel,
        domainPath,
      });
  const pathSame =
    (note.domainPath || []).join("/") === domainPath.join("/");
  if (
    title === note.title &&
    sourceTitle === note.sourceTitle &&
    summary === note.summary &&
    pathSame
  ) {
    return note;
  }
  return { ...note, title, sourceTitle, summary, domainPath };
}

function rootDir() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "data/mingxi/eval/gold"))) return dir;
    if (existsSync(resolve(dir, "package.json")) && existsSync(resolve(dir, "data/mingxi"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  try {
    const fromModule = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
    if (existsSync(resolve(fromModule, "data/mingxi/eval/gold"))) return fromModule;
  } catch {
    /* ignore */
  }
  return process.cwd();
}

function loadCards(): Array<Record<string, unknown>> {
  const p = resolve(rootDir(), "data/mingxi/real/latest-cards.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return Array.isArray(raw) ? raw : [];
}

function loadGoldFiles(): Array<{ file: string; data: Record<string, unknown> }> {
  const dir = resolve(rootDir(), "data/mingxi/eval/gold");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Record<string, unknown>,
    }));
}

/** 仓库相对路径 → /api/mingxi/media?path=… */
function toMediaApiUrl(rel: string): string {
  return `/api/mingxi/media?path=${encodeURIComponent(rel)}`;
}

/** 尝试把任意 uri 解析成仓库内相对路径 */
function resolveLocalRel(uri: string): string | null {
  if (!uri || uri.startsWith("http") || uri.startsWith("data:")) return null;
  const cleaned = uri.replace(/^\.\//, "").replace(/^\/+/, "");
  if (cleaned.startsWith("data/mingxi/") || cleaned.startsWith("public/")) {
    return existsSync(resolve(rootDir(), cleaned)) ? cleaned : null;
  }
  if (cleaned.includes("obsidian-images") || cleaned.includes("xhs-screenshots")) {
    if (existsSync(resolve(rootDir(), cleaned))) return cleaned;
    const folder = cleaned.includes("xhs") ? "xhs-screenshots" : "obsidian-images";
    const under = `data/mingxi/real/samples/${folder}/${basename(cleaned)}`;
    if (existsSync(resolve(rootDir(), under))) return under;
  }
  // 仅文件名：在 samples 里找
  const name = basename(cleaned);
  const candidates = [
    `data/mingxi/real/samples/obsidian-images/${name}`,
    `data/mingxi/real/samples/xhs-screenshots/${name}`,
    `data/mingxi/real/samples/${name}`,
    `data/mingxi/real/snapshots/${name}`,
  ];
  for (const c of candidates) {
    if (existsSync(resolve(rootDir(), c))) return c;
  }
  if (existsSync(resolve(rootDir(), cleaned))) return cleaned;
  return null;
}

function publicUrlForRel(rel: string): string {
  // 打包后优先走 public 静态（vinext /bundle 无 fs）
  const base = basename(rel);
  const pub = `public/data/mingxi-media/${base}`;
  if (existsSync(resolve(rootDir(), pub))) {
    return `/data/mingxi-media/${base}`;
  }
  const snapPub = `public/data/mingxi-media/snapshots/${base}`;
  if (existsSync(resolve(rootDir(), snapPub))) {
    return `/data/mingxi-media/snapshots/${base}`;
  }
  return toMediaApiUrl(rel);
}

function pickCaption(card: Record<string, unknown>): string | undefined {
  const layers = card.tagLayers as
    | { domain?: { imageCaption?: string; theme?: string } }
    | undefined;
  const cap = layers?.domain?.imageCaption?.trim();
  if (cap) return cap;
  const images = card.images as Array<{ caption?: string }> | undefined;
  return images?.[0]?.caption || undefined;
}

export function resolveNoteMedia(card: Record<string, unknown>): NoteMedia | null {
  const images = card.images as Array<{ uri?: string; path?: string; caption?: string }> | undefined;
  const imageUri = images?.[0]?.uri || images?.[0]?.path;
  const sourceUri = card.sourceUri ? String(card.sourceUri) : "";
  const snapshotRel = card.snapshotRel ? String(card.snapshotRel) : "";
  const caption = pickCaption(card);

  let primaryRel: string | null = null;
  let primaryHttp: string | null = null;

  if (imageUri) {
    if (imageUri.startsWith("http") || imageUri.startsWith("data:")) primaryHttp = imageUri;
    else primaryRel = resolveLocalRel(imageUri);
  }

  if (!primaryRel && !primaryHttp && sourceUri) {
    if (sourceUri.startsWith("http")) primaryHttp = sourceUri;
    else primaryRel = resolveLocalRel(sourceUri);
  }

  let snapshotLocal: string | null = null;
  if (snapshotRel) {
    snapshotLocal = resolveLocalRel(snapshotRel);
  }
  // 常见约定：corpus 对应 snapshots/{corpusId}.md|.txt
  if (!snapshotLocal && card.corpusId) {
    const cid = String(card.corpusId);
    for (const ext of [".md", ".txt", ".html"]) {
      const guess = `data/mingxi/real/snapshots/${cid}${ext}`;
      if (existsSync(resolve(rootDir(), guess))) {
        snapshotLocal = guess;
        break;
      }
    }
  }

  // 只有快照、没有原件时：按源扩展名保留语义（PPT/PDF），内容用快照展开
  if (!primaryRel && !primaryHttp && snapshotLocal) {
    const sourceKind = sourceUri ? mediaKindFromPath(sourceUri) : "unknown";
    const snapKind = mediaKindFromPath(snapshotLocal);
    const kind =
      sourceKind === "pptx" ||
      sourceKind === "pdf" ||
      sourceKind === "docx" ||
      sourceKind === "html"
        ? sourceKind
        : snapKind === "unknown"
          ? "text"
          : snapKind;
    return {
      kind,
      url: null,
      downloadUrl: sourceUri.startsWith("http") ? sourceUri : null,
      snapshotUrl: publicUrlForRel(snapshotLocal),
      label: basename(sourceUri || snapshotLocal),
      caption,
    };
  }

  const probe = primaryRel || primaryHttp || snapshotLocal || sourceUri || "";
  let kind = mediaKindFromPath(probe);
  if (kind === "unknown" && (card.modality === "photo" || card.modality === "screenshot")) {
    kind = "image";
  }
  if (kind === "unknown" && snapshotLocal) {
    kind = mediaKindFromPath(snapshotLocal);
  }
  if (kind === "unknown" && primaryHttp) kind = "link";

  if (!primaryRel && !primaryHttp && !snapshotLocal) return null;

  const url = primaryRel
    ? publicUrlForRel(primaryRel)
    : primaryHttp && (kind === "image" || kind === "pdf" || kind === "html" || kind === "link")
      ? primaryHttp
      : null;

  const downloadUrl = primaryRel
    ? publicUrlForRel(primaryRel)
    : primaryHttp || (sourceUri.startsWith("http") ? sourceUri : null);

  const snapshotUrl = snapshotLocal ? publicUrlForRel(snapshotLocal) : null;

  return {
    kind,
    url,
    downloadUrl,
    snapshotUrl,
    label: basename(primaryRel || primaryHttp || snapshotLocal || "媒体"),
    caption,
  };
}

/** 兼容旧 imageUrl：仅图片可放进 img */
function legacyImageUrl(media: NoteMedia | null): string | null {
  if (!media) return null;
  if (media.kind === "image" && media.url) return media.url;
  return null;
}

/** 从 gold+cards 重建（本地脚本用） */
export function buildSilverLibraryFromDisk(): LibraryNote[] {
  const cards = loadCards();
  const byId = new Map(cards.map((c) => [String(c.id), c]));
  const golds = loadGoldFiles();
  const notes: LibraryNote[] = [];

  for (const { data } of golds) {
    const cardId = String(data.cardId || "");
    const gold = (data.gold || {}) as Record<string, unknown>;
    const envelope = (data.envelope || {}) as Record<string, unknown>;
    const card = byId.get(cardId);
    if (!card) continue;

    const domainPath = canonicalizeDomainPath(
      Array.isArray(gold.domainPath) ? (gold.domainPath as string[]) : [],
    );
    const purposeLabel = String(gold.purposeLabel || card.purposeLabel || "待定");
    const theme =
      String(
        (envelope.modelTrace as { theme?: string } | undefined)?.theme ||
          card.aiTheme ||
          "",
      ) || undefined;
    const preview = String(
      card.fullTextPreview ||
        (card.blocks as Array<{ text: string }> | undefined)?.map((b) => b.text).join("\n") ||
        card.summary ||
        "",
    );

    const media = resolveNoteMedia(card);
    const sourceTitle = String(card.title || "未命名笔记");
    const title = resolveAiNoteTitle({
      theme,
      summary: theme || String(card.summary || "").slice(0, 120),
      sourceTitle,
      domainPath,
    });
    const summary = resolveCardSummary({
      title,
      theme,
      preview,
      purposeLabel,
      domainPath,
    });

    notes.push({
      id: cardId,
      corpusId: String(data.corpusId || card.corpusId || cardId.replace(/^real_/, "")),
      title,
      sourceTitle,
      summary,
      preview: preview.slice(0, 2400),
      modality: String(card.modality || "webpage"),
      capturedAt: card.capturedAt ? String(card.capturedAt) : undefined,
      purposeLabel,
      polarity: String(gold.polarity || "neutral_observe"),
      stance: String(gold.stance || "transform_ok"),
      domainPath,
      functionalTypes: Array.isArray(gold.functionalTypes)
        ? (gold.functionalTypes as string[])
        : [],
      userGoals: Array.isArray(gold.userGoals) ? (gold.userGoals as string[]) : [],
      theme,
      imageUrl: legacyImageUrl(media),
      sourceUri: card.sourceUri ? String(card.sourceUri) : undefined,
      media,
      tags: [
        purposeLabel,
        ...domainPath.slice(0, 3),
        String(gold.polarity || ""),
        ...(Array.isArray(gold.functionalTypes) ? (gold.functionalTypes as string[]) : []),
      ].filter(Boolean),
    });
  }

  notes.sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
  return notes;
}

/** 运行时兜底：给旧 pack 补 media */
export function hydrateNoteMedia(note: LibraryNote): LibraryNote {
  if (note.media?.kind) return note;
  const url = note.imageUrl || note.sourceUri || "";
  if (!url) return note;
  const kind = mediaKindFromPath(url);
  const media: NoteMedia = {
    kind: kind === "unknown" && note.modality === "photo" ? "image" : kind,
    url: note.imageUrl || (kind === "link" || kind === "pdf" || kind === "html" ? note.sourceUri : null),
    downloadUrl: note.sourceUri?.startsWith("http") ? note.sourceUri : note.imageUrl,
    label: basename((note.imageUrl || note.sourceUri || "").split("?")[0]),
  };
  return {
    ...note,
    media,
    imageUrl: legacyImageUrl(media) ?? note.imageUrl,
  };
}

export function loadSilverLibrary(): LibraryNote[] {
  const packed = (silverPack as { notes?: LibraryNote[] })?.notes;
  if (Array.isArray(packed) && packed.length > 0) {
    return packed.map((n) => hydrateNoteTitle(hydrateNoteMedia(n)));
  }
  try {
    return buildSilverLibraryFromDisk().map(hydrateNoteTitle);
  } catch {
    return [];
  }
}

export function getLibraryNote(id: string): LibraryNote | null {
  return loadSilverLibrary().find((n) => n.id === id) || null;
}

/** 防路径穿越：只允许 data/mingxi 与 public 下媒体 */
export function resolveSafeMediaPath(rel: string): string | null {
  const cleaned = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  if (cleaned.includes("..")) return null;
  if (!cleaned.startsWith("data/mingxi/") && !cleaned.startsWith("public/")) {
    return null;
  }
  const abs = resolve(rootDir(), cleaned);
  const allowed1 = resolve(rootDir(), "data/mingxi");
  const allowed2 = resolve(rootDir(), "public");
  if (!abs.startsWith(allowed1) && !abs.startsWith(allowed2)) return null;
  if (!existsSync(abs)) return null;
  return abs;
}
