/**
 * 待定 → 用途候选 → 人确认（网页端联通）
 *
 * - 候选：pi 笔记 inferredUses ∪ 用途先验 ∪ 启发式
 * - 确认：回写活知识库 +（若有）pi note.json + purpose-prior + profile signal
 */
import { normalizePurposeLabel, type PurposeLabel } from "../types.ts";
import { getNoteRecord, saveNoteRecord } from "../pi-agent/note-store.ts";
import { recordPurposeSignal, purposePriorSummary } from "../pi-agent/purpose-prior.ts";
import type { LibraryNote } from "./library-data.ts";
import { appendLiveNote, loadMergedLibrary } from "./live-library.ts";
import { appendSignals, signalFromPurposeChange } from "./profile-store.ts";

export const PURPOSE_VOCAB = [
  "学习理论",
  "资料收藏",
  "反例避坑",
  "对标拆解",
  "素材金句",
] as const;

export type PurposeCandidate = {
  purpose: string;
  why: string;
  confidence: number;
  source: "ai_inferred" | "prior" | "heuristic";
};

export function isPurposePending(label: string | undefined | null): boolean {
  const t = String(label || "").trim();
  return !t || t === "待定" || t === "未定" || t === "park";
}

export function findLibraryNote(noteId: string, cwd = process.cwd()): LibraryNote | null {
  return loadMergedLibrary(cwd).find((n) => n.id === noteId || n.corpusId === noteId) ?? null;
}

function mapInferredToVocab(use: string): string | null {
  const t = use.trim();
  if (!t) return null;
  if ((PURPOSE_VOCAB as readonly string[]).includes(t)) return t;
  if (/避坑|避雷|反例|千万别|踩坑|失败/.test(t)) return "反例避坑";
  if (/对标|拆解|结构|框架|范文/.test(t)) return "对标拆解";
  if (/金句|素材|文笔|引用|好词/.test(t)) return "素材金句";
  if (/理论|概念|机制|原理|搞懂|学习/.test(t)) return "学习理论";
  if (/收藏|备查|资料|以后|存着/.test(t)) return "资料收藏";
  return normalizePurposeLabel(t);
}

function heuristicCandidates(note: LibraryNote): PurposeCandidate[] {
  const blob = `${note.title} ${note.summary} ${note.preview} ${note.theme || ""} ${note.polarity}`.toLowerCase();
  const out: PurposeCandidate[] = [];
  if (note.polarity === "negative_caution" || /避坑|避雷|千万别|踩坑|失败/.test(blob)) {
    out.push({
      purpose: "反例避坑",
      why: "内容偏警示/失败路径，更适合当反例对照",
      confidence: 0.78,
      source: "heuristic",
    });
  }
  if (/对标|拆解|结构|框架|范文|对比/.test(blob)) {
    out.push({
      purpose: "对标拆解",
      why: "提到结构/对标/范文，适合拆解复用",
      confidence: 0.7,
      source: "heuristic",
    });
  }
  if (/金句|好词|文笔|引用|摘抄/.test(blob)) {
    out.push({
      purpose: "素材金句",
      why: "像可摘抄的表达或金句素材",
      confidence: 0.68,
      source: "heuristic",
    });
  }
  if (/理论|原理|机制|定义|概念|attention|transformer/.test(blob)) {
    out.push({
      purpose: "学习理论",
      why: "偏概念/机制讲解，适合内化理解",
      confidence: 0.72,
      source: "heuristic",
    });
  }
  if (!out.length) {
    out.push({
      purpose: "资料收藏",
      why: "先归档备查；确认后再改成具体用途",
      confidence: 0.55,
      source: "heuristic",
    });
  }
  return out;
}

export function buildPurposeCandidates(
  note: LibraryNote,
  opts: { root?: string } = {},
): PurposeCandidate[] {
  const byPurpose = new Map<string, PurposeCandidate>();
  const put = (c: PurposeCandidate) => {
    const prev = byPurpose.get(c.purpose);
    if (!prev || c.confidence > prev.confidence) byPurpose.set(c.purpose, c);
  };

  const pi = getNoteRecord(note.id, opts.root) ?? getNoteRecord(note.corpusId, opts.root);
  if (pi?.understanding?.personalUse?.inferredUses?.length) {
    for (const u of pi.understanding.personalUse.inferredUses) {
      const purpose = mapInferredToVocab(u.use);
      if (!purpose || isPurposePending(purpose)) continue;
      put({
        purpose,
        why: u.why || "来自笔记理解层的用途推断",
        confidence: Math.min(0.95, Math.max(0.4, Number(u.confidence) || 0.6)),
        source: "ai_inferred",
      });
    }
  }

  const prior = purposePriorSummary(
    { sourceKind: note.modality, domainL1: note.domainPath[0] },
    opts.root,
  );
  const priorRows = prior.matched.length ? prior.matched : prior.overall;
  for (const row of priorRows.slice(0, 3)) {
    if (isPurposePending(row.purpose)) continue;
    const share = prior.total > 0 ? row.count / Math.max(prior.matched.length ? prior.matched.reduce((s, x) => s + x.count, 0) : prior.total, 1) : 0.4;
    put({
      purpose: row.purpose,
      why: `你的历史偏好：同类内容常标「${row.purpose}」（${row.count} 次）`,
      confidence: Math.min(0.85, 0.45 + share * 0.4),
      source: "prior",
    });
  }

  for (const h of heuristicCandidates(note)) put(h);

  return [...byPurpose.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

export type ConfirmPurposeResult =
  | {
      ok: true;
      note: LibraryNote;
      purposeLabel: PurposeLabel;
      purposeStatus: "declared";
      wrotePiNote: boolean;
    }
  | { ok: false; error: string };

/**
 * 人确认用途：写回活库 + pi 笔记（若有）+ prior + profile
 */
export function confirmNotePurpose(
  noteId: string,
  purposeRaw: string,
  opts: { root?: string; cwd?: string } = {},
): ConfirmPurposeResult {
  const purpose = normalizePurposeLabel(purposeRaw);
  if (isPurposePending(purposeRaw) || purposeRaw.trim() === "待定") {
    return { ok: false, error: "请选择具体用途，不能仍为「待定」" };
  }

  const cwd = opts.cwd ?? process.cwd();
  const existing = findLibraryNote(noteId, cwd);
  if (!existing) {
    return { ok: false, error: "note not found" };
  }

  const updated: LibraryNote = {
    ...existing,
    purposeLabel: purpose,
    tags: Array.from(
      new Set([
        ...(existing.tags || []).filter((t) => t !== "待定" && t !== existing.purposeLabel),
        purpose,
        "purpose-confirmed",
      ]),
    ),
  };
  appendLiveNote(updated, cwd);

  let wrotePiNote = false;
  const pi =
    getNoteRecord(existing.id, opts.root) ??
    getNoteRecord(existing.corpusId, opts.root) ??
    getNoteRecord(noteId, opts.root);
  if (pi) {
    const next = {
      ...pi,
      purposeStatus: "declared" as const,
      tags: { ...pi.tags, purposeLabel: purpose },
      understanding: {
        ...pi.understanding,
        personalUse: {
          ...pi.understanding.personalUse,
          declaredPurpose: purpose,
          inferredUses: pi.understanding.personalUse.inferredUses,
          suggestedAction: pi.understanding.personalUse.suggestedAction,
        },
      },
    };
    saveNoteRecord(next, { root: opts.root ?? cwd });
    wrotePiNote = true;
  }

  recordPurposeSignal(
    {
      purpose,
      sourceKind: existing.modality,
      domainL1: existing.domainPath[0],
      declaredBy: "confirm_html",
      noteId: existing.id,
    },
    opts.root ?? cwd,
  );

  const sig = signalFromPurposeChange(purpose);
  if (sig) appendSignals([sig]);

  return {
    ok: true,
    note: updated,
    purposeLabel: purpose,
    purposeStatus: "declared",
    wrotePiNote,
  };
}

export function purposeCandidatesForNoteId(
  noteId: string,
  opts: { root?: string; cwd?: string } = {},
): {
  note: LibraryNote | null;
  pending: boolean;
  candidates: PurposeCandidate[];
  vocab: readonly string[];
} {
  const note = findLibraryNote(noteId, opts.cwd);
  if (!note) {
    return { note: null, pending: false, candidates: [], vocab: PURPOSE_VOCAB };
  }
  const pending = isPurposePending(note.purposeLabel);
  const pi = getNoteRecord(note.id, opts.root) ?? getNoteRecord(note.corpusId, opts.root);
  const pendingByPi = pi?.purposeStatus === "pending";
  return {
    note,
    pending: pending || pendingByPi,
    candidates: buildPurposeCandidates(note, { root: opts.root }),
    vocab: PURPOSE_VOCAB,
  };
}
