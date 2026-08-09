/**
 * 用途先验档案（自进化 · 第一块地基）
 *
 * 每一次「用途声明」都是一条行为信号：
 *   - 手机端捕获时选了具体标签（capture）
 *   - CLI --purpose（capture）
 *   - 对话里确认「待定」笔记（confirm_chat）
 *   - 笔记 HTML 页里点确认（confirm_html)
 *
 * 聚合成先验分布，注入理解 prompt：AI 推断候选用途时带上
 * 「这个用户存这类内容通常是为了什么」。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { normalizePurposeLabel, type PurposeLabel } from "../types.ts";
import { notesRoot } from "./note-store.ts";

export type PurposeDeclaredBy = "capture" | "confirm_chat" | "confirm_html";

export interface PurposeSignal {
  at: string;
  purpose: PurposeLabel;
  /** 来源形态：pdf / webpage / image / plain_text… */
  sourceKind?: string;
  /** 学科一级（domainPath[0]） */
  domainL1?: string;
  declaredBy: PurposeDeclaredBy;
  noteId?: string;
}

interface PurposePriorFile {
  version: 1;
  signals: PurposeSignal[];
}

function priorPath(root?: string): string {
  return resolve(notesRoot(root), "purpose-prior.json");
}

function loadFile(root?: string): PurposePriorFile {
  const p = priorPath(root);
  if (!existsSync(p)) return { version: 1, signals: [] };
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as PurposePriorFile;
    return { version: 1, signals: Array.isArray(raw.signals) ? raw.signals : [] };
  } catch {
    return { version: 1, signals: [] };
  }
}

export function recordPurposeSignal(
  signal: Omit<PurposeSignal, "at" | "purpose"> & { purpose: string },
  root?: string,
): PurposeSignal {
  const file = loadFile(root);
  const entry: PurposeSignal = {
    at: new Date().toISOString(),
    purpose: normalizePurposeLabel(signal.purpose),
    sourceKind: signal.sourceKind,
    domainL1: signal.domainL1,
    declaredBy: signal.declaredBy,
    noteId: signal.noteId,
  };
  file.signals.push(entry);
  const p = priorPath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(file, null, 2), "utf8");
  return entry;
}

export interface PurposePriorSummary {
  total: number;
  /** 总体分布（次数降序） */
  overall: Array<{ purpose: PurposeLabel; count: number }>;
  /** 指定条件下的分布（次数降序） */
  matched: Array<{ purpose: PurposeLabel; count: number }>;
}

function tally(signals: PurposeSignal[]): Array<{ purpose: PurposeLabel; count: number }> {
  const m = new Map<PurposeLabel, number>();
  for (const s of signals) m.set(s.purpose, (m.get(s.purpose) ?? 0) + 1);
  return [...m.entries()]
    .map(([purpose, count]) => ({ purpose, count }))
    .sort((a, b) => b.count - a.count);
}

export function purposePriorSummary(
  ctx: { sourceKind?: string; domainL1?: string } = {},
  root?: string,
): PurposePriorSummary {
  const { signals } = loadFile(root);
  const matched = signals.filter(
    (s) =>
      (!ctx.sourceKind || s.sourceKind === ctx.sourceKind) &&
      (!ctx.domainL1 || s.domainL1 === ctx.domainL1),
  );
  return { total: signals.length, overall: tally(signals), matched: tally(matched) };
}

/**
 * 生成注入理解 prompt 的先验块；样本太少（<3）返回空串不打扰。
 */
export function purposePriorPromptBlock(
  ctx: { sourceKind?: string; domainL1?: string } = {},
  root?: string,
): string {
  const s = purposePriorSummary(ctx, root);
  if (s.total < 3) return "";
  const fmt = (rows: Array<{ purpose: PurposeLabel; count: number }>) =>
    rows
      .slice(0, 4)
      .map((r) => `${r.purpose}×${r.count}`)
      .join("、");
  const lines = [`用户历史用途偏好（共 ${s.total} 次声明，供 personalUse 推断参考，不可当作已声明）：`];
  if (s.matched.length && s.matched.length !== s.overall.length) {
    lines.push(`- 同类内容（${ctx.sourceKind ?? ""}${ctx.domainL1 ? ` · ${ctx.domainL1}` : ""}）：${fmt(s.matched)}`);
  } else if (s.matched.length) {
    lines.push(`- 同类内容：${fmt(s.matched)}`);
  }
  lines.push(`- 总体：${fmt(s.overall)}`);
  return lines.join("\n");
}
