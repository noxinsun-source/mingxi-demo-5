/**
 * 知识库召回（供 Agent 工具 library_retrieve 与 think 管线共用）
 * 不依赖 agent 层，避免循环引用。
 */
import type {
  Material,
  Modality,
  Polarity,
  PurposeLabel,
} from "../types.ts";
import { PURPOSE_TRACK, normalizePurposeLabel } from "../types.ts";
import type { LibraryNote } from "./library-data.ts";
import { loadMergedLibrary } from "./live-library.ts";

export type RetrieveFilter = "all" | "negative" | "positive";

export function materialIdFromNoteId(noteId: string): string {
  return noteId
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64);
}

function blockPolarity(p: string): Polarity {
  if (p === "negative_caution" || p === "mixed") return "反对";
  if (p === "positive_exemplar") return "支持";
  return "中立";
}

function asModality(m: string): Modality {
  const allowed: Modality[] = [
    "pdf",
    "webpage",
    "social_post",
    "chat",
    "video",
    "voice",
    "photo",
    "table",
    "screenshot",
  ];
  return (allowed.includes(m as Modality) ? m : "webpage") as Modality;
}

function purposeFromNote(label: string): PurposeLabel {
  if (label === "待定") return "资料收藏";
  return normalizePurposeLabel(label);
}

/** C1/C2/C4 加权召回 */
export function retrieveLibraryNotes(
  utterance: string,
  notes: LibraryNote[],
  limit = 14,
  filter: RetrieveFilter = "all",
  profileHints: string[] = [],
): LibraryNote[] {
  const u = utterance.toLowerCase();
  const toks = u
    .replace(/[^\u4e00-\u9fff\w]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const hintBlob = profileHints.join(" ").toLowerCase();

  let pool = notes;
  if (filter === "negative") {
    pool = notes.filter(
      (n) => n.polarity === "negative_caution" || n.purposeLabel === "反例避坑",
    );
  } else if (filter === "positive") {
    pool = notes.filter(
      (n) =>
        n.polarity === "positive_exemplar" ||
        n.purposeLabel === "对标拆解" ||
        n.purposeLabel === "素材金句",
    );
  }

  const scored = pool.map((n) => {
    const blob =
      `${n.title} ${n.summary} ${n.preview} ${n.domainPath.join(" ")} ${n.purposeLabel} ${n.polarity} ${n.theme || ""}`.toLowerCase();
    let s = 0;
    for (const tok of toks) if (blob.includes(tok)) s += 2;
    if (/agent|skill|评测|提示词|harness|路由/i.test(blob) && /agent|skill|评测|提示词/i.test(u))
      s += 5;
    if (
      /避雷|反对|反例|踩坑|失败/.test(u) &&
      (n.polarity === "negative_caution" || n.purposeLabel === "反例避坑")
    )
      s += 4;
    if (/正例|可学|成功|推荐/.test(u) && n.polarity === "positive_exemplar") s += 3;
    if (/金句|素材|引用/.test(u) && n.purposeLabel === "素材金句") s += 3;
    if (/对标|拆解|结构/.test(u) && n.purposeLabel === "对标拆解") s += 3;
    if (/理论|原理|概念|学习/.test(u) && n.purposeLabel === "学习理论") s += 2;
    if (/收藏|资料|备查/.test(u) && n.purposeLabel === "资料收藏") s += 2;
    if (/待定|先存|以后/.test(u) && n.purposeLabel === "待定") s += 2;
    for (const d of n.domainPath) {
      if (d.length >= 2 && u.includes(d.toLowerCase())) s += 2;
    }
    if (n.stance === "do_not_imitate_failure_path" && /避雷|勿|别|不要/.test(u)) s += 1;
    // 习得档加权：用户偏好结构优先 / 边界优先等
    if (hintBlob) {
      if (/boundary|边界|避雷|反对/.test(hintBlob) && n.purposeLabel === "反例避坑") s += 2;
      if (/structure|结构|对标/.test(hintBlob) && n.purposeLabel === "对标拆解") s += 2;
      if (/evidence|证据|强度/.test(hintBlob) && /证据|强|数据/.test(blob)) s += 1;
      for (const h of profileHints) {
        const t = h.toLowerCase();
        if (t.length >= 2 && blob.includes(t.slice(0, 12))) s += 1;
      }
    }
    return { n, s };
  });

  let hits = scored
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.n);

  if (hits.length < Math.min(4, notes.length)) {
    const rest = notes
      .filter((n) => !hits.some((h) => h.id === n.id))
      .slice(0, Math.min(4, notes.length) - hits.length);
    hits = [...hits, ...rest];
  }
  return hits;
}

export function libraryNotesToMaterials(notes: LibraryNote[]): Material[] {
  return notes.map((n, index) => {
    const purposeLabel = purposeFromNote(n.purposeLabel);
    const text = n.preview || n.summary || n.title;
    const pol = blockPolarity(n.polarity);
    return {
      id: materialIdFromNoteId(n.id),
      set: "eval" as const,
      capturedAt: n.capturedAt || new Date().toISOString(),
      modality: asModality(n.modality),
      source: {
        kind: "file" as const,
        title: n.title,
        appHint: "knowledge-library",
        url: n.sourceUri,
      },
      layers: {
        visibleText: text.slice(0, 2000),
        fullText: text,
        fullTextStatus: "ok" as const,
      },
      blocks: [
        {
          id: "b1",
          kind: "正文" as const,
          text,
          locator: { type: "span" as const, start: 0, end: text.length },
          polarity: pol,
          strength: n.polarity === "positive_exemplar" ? ("强" as const) : ("中" as const),
          topics: n.domainPath.slice(0, 3),
          at: n.capturedAt,
        },
        {
          id: "b0",
          kind: "标题" as const,
          text: n.title,
          locator: { type: "span" as const, start: 0, end: n.title.length },
          polarity: pol,
          topics: n.domainPath.slice(0, 2),
        },
      ],
      purpose: {
        track: PURPOSE_TRACK[purposeLabel],
        label: purposeLabel,
        declaredBy: "human_confirmed_ai" as const,
        note: n.purposeLabel === "待定" ? "原标待定→归档配方" : undefined,
      },
      tags: n.tags,
      license: "owned" as const,
      immutable: true as const,
      storyLine: index % 2 === 0 ? ("learn" as const) : ("create" as const),
    };
  });
}

export function noteIdByMaterialId(notes: LibraryNote[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of notes) m.set(materialIdFromNoteId(n.id), n.id);
  return m;
}

/** 工具入口：合并银标+活库后召回 */
export function retrieveMergedNotes(
  query: string,
  opt: { limit?: number; filter?: RetrieveFilter; profileHints?: string[] } = {},
): LibraryNote[] {
  return retrieveLibraryNotes(
    query,
    loadMergedLibrary(),
    opt.limit ?? 14,
    opt.filter ?? "all",
    opt.profileHints ?? [],
  );
}
