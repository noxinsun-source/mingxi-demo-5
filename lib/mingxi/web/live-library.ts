/**
 * 活知识库：每次捕获闭环写回的笔记（与银标库合并展示）
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { LibraryNote } from "./library-data.ts";
import {
  loadSilverLibrary,
  hydrateNoteMedia,
  hydrateNoteTitle,
} from "./library-data.ts";

const LIVE_REL = "data/mingxi/real/live-library.json";

function livePath(cwd = process.cwd()): string {
  return resolve(cwd, LIVE_REL);
}

export interface LiveLibraryPack {
  version: string;
  updatedAt: string;
  notes: LibraryNote[];
}

export function loadLiveNotes(cwd = process.cwd()): LibraryNote[] {
  const p = livePath(cwd);
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as LiveLibraryPack;
    return Array.isArray(raw.notes)
      ? raw.notes.map((n) => hydrateNoteTitle(hydrateNoteMedia(n)))
      : [];
  } catch {
    return [];
  }
}

export function appendLiveNote(note: LibraryNote, cwd = process.cwd()): LiveLibraryPack {
  const p = livePath(cwd);
  mkdirSync(dirname(p), { recursive: true });
  const prev = loadLiveNotes(cwd);
  const rest = prev.filter((n) => n.id !== note.id && n.corpusId !== note.corpusId);
  const notes = [hydrateNoteTitle(hydrateNoteMedia(note)), ...rest];
  const pack: LiveLibraryPack = {
    version: "live-library-v1",
    updatedAt: new Date().toISOString(),
    notes,
  };
  writeFileSync(p, JSON.stringify(pack, null, 2), "utf8");
  return pack;
}

/** 银标 + 活库（活库优先覆盖同 id） */
export function loadMergedLibrary(cwd = process.cwd()): LibraryNote[] {
  const silver = loadSilverLibrary();
  const live = loadLiveNotes(cwd);
  const byId = new Map<string, LibraryNote>();
  for (const n of silver) byId.set(n.id, n);
  for (const n of live) byId.set(n.id, n);
  return Array.from(byId.values()).sort((a, b) =>
    String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")),
  );
}
