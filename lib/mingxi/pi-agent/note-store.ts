/**
 * 笔记库存储 · data/mingxi/notes/
 *
 * notes/
 *   index.json                 —— 轻量索引（检索用）
 *   <noteId>/note.json         —— 完整 NoteRecord
 *   <noteId>/note.html         —— 统一样式 HTML
 *   <noteId>/assets/…          —— 复制进来的本地图片（保证笔记自包含）
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, resolve } from "node:path";
import { renderNoteHtml } from "./html-note.ts";
import type { NoteIndexEntry, NoteRecord } from "./types.ts";

export function notesRoot(root = process.cwd()): string {
  // 允许外人把已有笔记目录直接挂进来（Docker / 多库切换）
  if (process.env.MINGXI_NOTES_DIR) {
    return resolve(process.env.MINGXI_NOTES_DIR);
  }
  return resolve(root, "data/mingxi/notes");
}

function indexPath(root?: string): string {
  return resolve(notesRoot(root), "index.json");
}

export function loadNoteIndex(root?: string): NoteIndexEntry[] {
  const p = indexPath(root);
  if (!existsSync(p)) return [];
  try {
    const arr = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(arr) ? (arr as NoteIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function saveNoteIndex(entries: NoteIndexEntry[], root?: string): void {
  mkdirSync(notesRoot(root), { recursive: true });
  writeFileSync(indexPath(root), JSON.stringify(entries, null, 2), "utf8");
}

/** 把本地图片复制进笔记 assets/，返回 uri → 相对 href 的映射 */
function copyAssets(
  record: NoteRecord,
  noteDir: string,
  root: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const assetsDir = resolve(noteDir, "assets");
  let n = 0;
  for (const img of record.media.images) {
    const cleaned = img.uri.replace(/^file:\/\//, "");
    if (/^https?:/i.test(img.uri) || img.uri.startsWith("data:")) {
      map.set(img.uri, img.uri);
      continue;
    }
    const abs = cleaned.startsWith("/") ? cleaned : resolve(root, cleaned);
    if (!existsSync(abs)) {
      map.set(img.uri, img.uri);
      continue;
    }
    mkdirSync(assetsDir, { recursive: true });
    n += 1;
    const ext = extname(abs) || ".png";
    const name = `${String(n).padStart(2, "0")}_${basename(abs, extname(abs)).replace(/[^\w\u4e00-\u9fa5-]+/g, "_").slice(0, 40)}${ext}`;
    const dest = resolve(assetsDir, name);
    try {
      copyFileSync(abs, dest);
      map.set(img.uri, `assets/${name}`);
    } catch {
      map.set(img.uri, img.uri);
    }
  }
  return map;
}

export interface SaveNoteResult {
  noteDir: string;
  jsonPath: string;
  htmlPath: string;
  indexEntry: NoteIndexEntry;
}

/** 保存 NoteRecord：渲染 HTML、复制资产、写 json、更新索引 */
export function saveNoteRecord(
  record: NoteRecord,
  opts: { root?: string } = {},
): SaveNoteResult {
  const root = opts.root ?? process.cwd();
  const dir = resolve(notesRoot(root), record.id);
  mkdirSync(dir, { recursive: true });

  const assetMap = copyAssets(record, dir, root);
  const html = renderNoteHtml(record, {
    assetHref: (uri) => assetMap.get(uri) ?? uri,
  });

  const htmlAbs = resolve(dir, "note.html");
  const jsonAbs = resolve(dir, "note.json");
  const htmlRel = `data/mingxi/notes/${record.id}/note.html`;
  const finalRecord: NoteRecord = { ...record, htmlPath: htmlRel };

  writeFileSync(htmlAbs, html, "utf8");
  writeFileSync(jsonAbs, JSON.stringify(finalRecord, null, 2), "utf8");

  const entry: NoteIndexEntry = {
    id: record.id,
    title: record.title,
    capturedAt: record.capturedAt,
    summary: record.understanding.content.summary,
    domainPath: record.tags.domainPath,
    purposeLabel: record.tags.purposeLabel,
    polarity: record.tags.polarity,
    keywords: record.tags.keywords,
    functionalTypes: record.tags.functionalTypes,
    htmlPath: htmlRel,
    jsonPath: `data/mingxi/notes/${record.id}/note.json`,
    sourceUri: record.source.uri,
    imageCount: record.media.images.length,
    textCount: record.media.texts.length,
  };

  const index = loadNoteIndex(root).filter((e) => e.id !== record.id);
  index.unshift(entry);
  saveNoteIndex(index, root);

  return { noteDir: dir, jsonPath: jsonAbs, htmlPath: htmlAbs, indexEntry: entry };
}

export function getNoteRecord(id: string, root?: string): NoteRecord | null {
  const p = resolve(notesRoot(root), id, "note.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as NoteRecord;
  } catch {
    return null;
  }
}

/** 关键词检索（标题/概括/标签/学科路径/关键词） */
export function searchNotes(
  query: string,
  opts: { root?: string; limit?: number } = {},
): NoteIndexEntry[] {
  const q = query.trim().toLowerCase();
  const limit = opts.limit ?? 10;
  const index = loadNoteIndex(opts.root);
  if (!q) return index.slice(0, limit);
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = index
    .map((e) => {
      const hay = [
        e.title,
        e.summary,
        e.purposeLabel,
        ...e.domainPath,
        ...e.keywords,
        ...e.functionalTypes,
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (e.title.toLowerCase().includes(t)) score += 3;
        else if (hay.includes(t)) score += 1;
      }
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}
