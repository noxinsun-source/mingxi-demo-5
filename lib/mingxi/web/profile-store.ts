/**
 * Profile / LearnSignal 落盘（能力③）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { LearnSignal, ProfileStore, PurposeLabel } from "../types.ts";
import {
  emptyStore,
  ingestSignals,
  rollbackEntry,
  autoLearnedCount,
  activeEntries,
  pendingEntries,
} from "../engine/learning.ts";

function rootDir() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "data/mingxi/eval"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function storePath() {
  return resolve(rootDir(), "data/mingxi/eval/profile-signals.json");
}

export function loadProfileStore(): ProfileStore {
  const p = storePath();
  if (!existsSync(p)) return emptyStore();
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as ProfileStore;
    return {
      entries: raw.entries || [],
      negativeConstraints: raw.negativeConstraints || [],
      signals: raw.signals || [],
    };
  } catch {
    return emptyStore();
  }
}

export function saveProfileStore(store: ProfileStore): void {
  const p = storePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify(
      {
        ...store,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}

function signal(
  kind: LearnSignal["kind"],
  key: string,
  detail: string,
  weight = 1,
): LearnSignal {
  return { kind, key, detail, at: new Date().toISOString(), weight };
}

/** 改 C2 用途 → tag_choice */
export function signalFromPurposeChange(purpose: string): LearnSignal | null {
  const map: Record<string, string> = {
    学习理论: "prefer_boundary_first",
    对标拆解: "prefer_structure_first",
    反例避坑: "angle_default_objection",
  };
  const key = map[purpose];
  if (!key) return null;
  return signal("tag_choice", key, `用户将用途标为「${purpose}」`, 1);
}

/** 确认角度 → angle_used */
export function signalFromAngle(order: string): LearnSignal {
  const key =
    order === "objection_first" ? "angle_default_objection" : "prefer_structure_first";
  return signal("angle_used", key, `确认角度 ${order}`, 2);
}

/** 拒绝重排 → reject */
export function signalFromReject(detail: string): LearnSignal {
  return signal("reject", "compact_cards", detail, 1);
}

export function appendSignals(incoming: LearnSignal[]): ProfileStore {
  const next = ingestSignals(loadProfileStore(), incoming);
  saveProfileStore(next);
  return next;
}

export function profileSummary() {
  const store = loadProfileStore();
  return {
    store,
    active: activeEntries(store),
    pending: pendingEntries(store),
    autoLearnedWeek: autoLearnedCount(store),
    signalCount: store.signals.length,
  };
}

export function rollbackProfileEntry(entryId: string): ProfileStore {
  const next = rollbackEntry(loadProfileStore(), entryId);
  saveProfileStore(next);
  return next;
}

export type { PurposeLabel };
