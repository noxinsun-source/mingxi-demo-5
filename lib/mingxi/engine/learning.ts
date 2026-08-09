/**
 * A7 · 习得与回滚（「它学到的我」）
 *
 * 三类学习信号（用户已定）：你标的用途标签 / 你给的逻辑线 / 你的对话。
 * 生效规则（用户已定）：累计权重 ≥ 3 且信号一致 → 自动生效。
 * 护栏（用户已定）：delete_or_overwrite 类**永远需要人确认**。
 * 回滚时写入否定约束，同一信号不再学回来。
 */
import type {
  LearnSignal,
  ProfileCategory,
  ProfileEntry,
  ProfileStore,
} from "../types.ts";

export const ACTIVATE_THRESHOLD = 3;
export const PROPOSE_THRESHOLD = 2;

interface CatalogItem {
  entryId: string;
  statement: string;
  category: ProfileCategory;
  scope: string;
}

/** 已知信号键 → 可读的习得条目 */
export const SIGNAL_CATALOG: Record<string, CatalogItem> = {
  prefer_structure_first: {
    entryId: "pf_structure_first",
    statement: "对标类笔记先给我结构，不要先给内容摘要",
    category: "organization",
    scope: "purpose=对标拆解",
  },
  prefer_boundary_first: {
    entryId: "pf_boundary_first",
    statement: "概念类笔记先给我边界与前提，再给定义",
    category: "organization",
    scope: "purpose=学习理论",
  },
  angle_default_objection: {
    entryId: "pf_angle_default_objection",
    statement: "没说清楚时，默认按反对意见优先重排",
    category: "organization",
    scope: "global",
  },
  trust_official_over_blog: {
    entryId: "pf_trust_official",
    statement: "官方公告的可信度高于个人博客",
    category: "source_trust",
    scope: "global",
  },
  compact_cards: {
    entryId: "pf_compact_cards",
    statement: "卡片给短一点，每块不超过两行",
    category: "presentation",
    scope: "global",
  },
  auto_delete_low_ocr: {
    entryId: "pf_delete_low_ocr",
    statement: "自动删除识别质量低于 0.5 的原料",
    category: "delete_or_overwrite",
    scope: "global",
  },
  auto_overwrite_confirmed: {
    entryId: "pf_overwrite_confirmed",
    statement: "用新版本自动覆盖我已确认的结论",
    category: "delete_or_overwrite",
    scope: "global",
  },
};

export function emptyStore(): ProfileStore {
  return { entries: [], negativeConstraints: [], signals: [] };
}

function weightOf(store: ProfileStore, key: string): number {
  return store.signals
    .filter((s) => s.key === key)
    .reduce((a, s) => a + s.weight, 0);
}

/**
 * 吃进一批信号，返回新的 store。
 * 纯函数：不修改入参。
 */
export function ingestSignals(
  store: ProfileStore,
  incoming: LearnSignal[],
  now = "2026-08-03T00:00:00+08:00",
): ProfileStore {
  const next: ProfileStore = {
    entries: store.entries.map((e) => ({ ...e })),
    negativeConstraints: [...store.negativeConstraints],
    signals: [...store.signals],
  };

  for (const sig of incoming) {
    // 否定约束：回滚过的东西不再学回来
    if (next.negativeConstraints.includes(sig.key)) continue;
    next.signals.push(sig);
  }

  const touchedKeys = Array.from(
    new Set(incoming.filter((s) => !next.negativeConstraints.includes(s.key)).map((s) => s.key)),
  );

  for (const key of touchedKeys) {
    const item = SIGNAL_CATALOG[key];
    if (!item) continue;

    const w = weightOf(next, key);
    if (w < PROPOSE_THRESHOLD) continue;

    const isGuarded = item.category === "delete_or_overwrite";
    const shouldActivate = w >= ACTIVATE_THRESHOLD && !isGuarded;

    const evidence = next.signals
      .filter((s) => s.key === key)
      .map((s) => `${s.at} · ${s.kind}：${s.detail}`);

    const existing = next.entries.find((e) => e.id === item.entryId);
    if (existing) {
      if (existing.status === "rolled_back" || existing.status === "deleted") continue;
      existing.weight = w;
      existing.evidenceEvents = evidence;
      if (shouldActivate && existing.status !== "active") {
        existing.status = "active";
        existing.autoActivated = true;
        existing.version += 1;
      }
      continue;
    }

    next.entries.push({
      id: item.entryId,
      statement: item.statement,
      category: item.category,
      scope: item.scope,
      version: 1,
      status: shouldActivate ? "active" : "proposed",
      evidenceEvents: evidence,
      weight: w,
      confirmedByHuman: false,
      autoActivated: shouldActivate,
      createdAt: now,
    });
  }

  return next;
}

/** 人确认一条待确认条目（delete_or_overwrite 类唯一的生效路径） */
export function confirmEntry(store: ProfileStore, entryId: string): ProfileStore {
  return {
    ...store,
    entries: store.entries.map((e) =>
      e.id === entryId
        ? { ...e, status: "active", confirmedByHuman: true, autoActivated: false, version: e.version + 1 }
        : e,
    ),
  };
}

/** 回滚：状态改写 + 写入否定约束，防止同一信号再次学回来 */
export function rollbackEntry(store: ProfileStore, entryId: string): ProfileStore {
  const key = Object.keys(SIGNAL_CATALOG).find(
    (k) => SIGNAL_CATALOG[k].entryId === entryId,
  );
  return {
    entries: store.entries.map((e) =>
      e.id === entryId ? { ...e, status: "rolled_back", version: e.version + 1 } : e,
    ),
    negativeConstraints: key
      ? Array.from(new Set([...store.negativeConstraints, key]))
      : [...store.negativeConstraints],
    signals: store.signals,
  };
}

export function activeEntries(store: ProfileStore): ProfileEntry[] {
  return store.entries.filter((e) => e.status === "active");
}

export function pendingEntries(store: ProfileStore): ProfileEntry[] {
  return store.entries.filter((e) => e.status === "proposed");
}

/** 「本周自动学到 N 条」 */
export function autoLearnedCount(store: ProfileStore): number {
  return store.entries.filter((e) => e.status === "active" && e.autoActivated).length;
}

/** 一条 active 条目是否需要在使用处标注来源 */
export function provenanceOf(entry: ProfileEntry): string {
  return `因为你之前：${entry.evidenceEvents[0] ?? "多次做了同样的选择"} —— 「${entry.statement}」`;
}
