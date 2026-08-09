/**
 * A4 · 一句话链路重排（核心）
 *
 * 同一批笔记，换一句话就换一种结构。
 * 三条可测的硬约束：
 *   1. 锁定的节点 —— ID / 文本 / 父节点 / 子树 / 序号 全部保持
 *   2. 指定范围局部重生成 —— 范围外节点字节级不变
 *   3. 解析不出角度 —— 反问，不擅自重排
 */
import type {
  AngleSpec,
  Line,
  LineDiff,
  LineNode,
  Material,
  NodeKind,
  Polarity,
  ProfileEntry,
  SourceBlock,
  Strength,
} from "../types.ts";
import { parseAngle } from "./angle.ts";
import { blockNodeId, shortHash, themeNodeId } from "./hash.ts";

/* ---------------- 候选块分类 ---------------- */

interface Cand {
  block: SourceBlock;
  material: Material;
  kind: NodeKind;
  claimLike: boolean;
}

const QUESTION_MARKS = ["？", "?", "要不要", "是否", "到底", "该不该", "会不会"];

function classifyKind(block: SourceBlock, material: Material): NodeKind {
  if (QUESTION_MARKS.some((q) => block.text.includes(q))) return "疑问";
  if (
    block.topics?.includes("行动") ||
    material.purpose.label === "待办行动"
  ) {
    return "行动";
  }
  if (block.polarity === "反对") return "反对";
  if (block.strength === "强" || block.strength === "中") return "主张";
  return "凭据";
}

const CLAIM_KINDS: NodeKind[] = ["主张", "反对", "行动", "疑问"];

function buildCandidates(materials: Material[], angle: AngleSpec): Cand[] {
  const filtered = materials.filter((m) => {
    if (angle.filter?.track && m.purpose.track !== angle.filter.track) return false;
    if (
      angle.filter?.purposeLabels &&
      !angle.filter.purposeLabels.includes(m.purpose.label)
    ) {
      return false;
    }
    return true;
  });

  const cands: Cand[] = [];
  for (const m of filtered) {
    const local: Cand[] = m.blocks.map((block) => {
      const kind = classifyKind(block, m);
      return { block, material: m, kind, claimLike: CLAIM_KINDS.includes(kind) };
    });
    if (local.length > 0 && !local.some((c) => c.claimLike)) {
      // 保证每份原料至少有一个可作为二级的主张，否则该原料会整份沉到第三层
      const promoted = [...local].sort(
        (a, b) => strengthRank(b.block.strength) - strengthRank(a.block.strength),
      )[0];
      promoted.kind = "主张";
      promoted.claimLike = true;
    }
    cands.push(...local);
  }
  return cands;
}

/* ---------------- 排序权重 ---------------- */

function strengthRank(s?: Strength): number {
  return s === "强" ? 3 : s === "中" ? 2 : s === "弱" ? 1 : 0;
}

function polarityRank(p: Polarity | undefined, order: AngleSpec["order"]): number {
  if (order === "objection_first") {
    return p === "反对" ? 0 : p === "中立" ? 1 : 2;
  }
  if (order === "contrast") {
    return p === "支持" ? 0 : p === "反对" ? 1 : 2;
  }
  return p === "支持" ? 0 : p === "中立" ? 1 : 2;
}

function kindRank(k: NodeKind, order: AngleSpec["order"]): number {
  if (order === "question_driven") {
    return k === "疑问" ? 0 : k === "反对" ? 1 : 2;
  }
  if (order === "action_first") {
    return k === "行动" ? 0 : 1;
  }
  if (order === "objection_first") {
    return k === "反对" ? 0 : k === "疑问" ? 1 : 2;
  }
  return 0;
}

function timeKey(at?: string): string {
  return at ?? "9999-99";
}

function emphasisRank(text: string, emphasis: string[]): number {
  if (emphasis.length === 0) return 1;
  return emphasis.some((e) => text.includes(e)) ? 0 : 1;
}

function compareCands(a: Cand, b: Cand, angle: AngleSpec): number {
  const em =
    emphasisRank(a.block.text, angle.emphasis) -
    emphasisRank(b.block.text, angle.emphasis);
  if (em !== 0) return em;

  const kr = kindRank(a.kind, angle.order) - kindRank(b.kind, angle.order);
  if (kr !== 0) return kr;

  switch (angle.order) {
    case "timeline":
      return (
        timeKey(a.block.at).localeCompare(timeKey(b.block.at)) ||
        a.block.id.localeCompare(b.block.id)
      );
    case "evidence_strength":
      return (
        strengthRank(b.block.strength) - strengthRank(a.block.strength) ||
        a.block.id.localeCompare(b.block.id)
      );
    case "objection_first":
    case "contrast":
      return (
        polarityRank(a.block.polarity, angle.order) -
          polarityRank(b.block.polarity, angle.order) ||
        strengthRank(b.block.strength) - strengthRank(a.block.strength) ||
        a.block.id.localeCompare(b.block.id)
      );
    case "causal":
      return (
        causalRank(a.block.causal) - causalRank(b.block.causal) ||
        a.block.id.localeCompare(b.block.id)
      );
    default:
      return (
        strengthRank(b.block.strength) - strengthRank(a.block.strength) ||
        a.block.id.localeCompare(b.block.id)
      );
  }
}

function causalRank(c?: "因" | "果"): number {
  return c === "因" ? 0 : c === "果" ? 1 : 2;
}

/* ---------------- 主题归组 ---------------- */

function themeName(c: Cand, angle: AngleSpec): string {
  if (angle.order === "question_driven" && (c.kind === "疑问" || c.kind === "反对")) {
    return "待验证";
  }
  if (angle.order === "action_first" && c.kind === "行动") {
    return "下一步";
  }
  if (angle.order === "contrast") {
    if (c.block.polarity === "支持") return "支持方";
    if (c.block.polarity === "反对") return "反对方";
    return "前提与中立";
  }
  switch (angle.groupBy) {
    case "time": {
      const at = c.block.at ?? "";
      return at ? `${at.slice(0, 4)} 年` : "时间未标注";
    }
    case "source":
      return c.material.source.title;
    case "purpose":
      return `${c.material.purpose.track} · ${c.material.purpose.label}`;
    case "theme":
    case "claim":
    default:
      return c.block.topics?.[0] ?? c.material.tags[0] ?? "其他";
  }
}

const PINNED_THEMES = ["待验证", "下一步"];

function compareThemes(
  a: { name: string; cands: Cand[] },
  b: { name: string; cands: Cand[] },
  angle: AngleSpec,
): number {
  const pin =
    (PINNED_THEMES.includes(a.name) ? 0 : 1) -
    (PINNED_THEMES.includes(b.name) ? 0 : 1);
  if (pin !== 0) return pin;

  const em = emphasisRank(a.name, angle.emphasis) - emphasisRank(b.name, angle.emphasis);
  if (em !== 0) return em;

  switch (angle.order) {
    case "timeline":
      return (
        Math.min(...a.cands.map((c) => Number(timeKey(c.block.at).slice(0, 4)))) -
        Math.min(...b.cands.map((c) => Number(timeKey(c.block.at).slice(0, 4))))
      );
    case "objection_first": {
      const cnt = (x: Cand[]) => x.filter((c) => c.block.polarity === "反对").length;
      return cnt(b.cands) - cnt(a.cands) || a.name.localeCompare(b.name);
    }
    case "evidence_strength": {
      const cnt = (x: Cand[]) => x.filter((c) => c.block.strength === "强").length;
      return cnt(b.cands) - cnt(a.cands) || a.name.localeCompare(b.name);
    }
    case "contrast": {
      const rank = (n: string) =>
        n === "支持方" ? 0 : n === "反对方" ? 1 : 2;
      return rank(a.name) - rank(b.name);
    }
    default:
      return b.cands.length - a.cands.length || a.name.localeCompare(b.name);
  }
}

/* ---------------- 节点构造 ---------------- */

function toNode(
  c: Cand,
  level: 1 | 2 | 3 | 4,
  parentId: string | null,
  order: number,
): LineNode {
  return {
    id: blockNodeId(c.block.id),
    level,
    kind: c.kind,
    text: c.block.text,
    parentId,
    order,
    citations: [
      {
        materialId: c.material.id,
        blockId: c.block.id,
        quote: c.block.text,
        locator: c.block.locator,
      },
    ],
    materialIds: [c.material.id],
    polarity: c.block.polarity,
    strength: c.block.strength,
    at: c.block.at,
    topics: c.block.topics,
    causal: c.block.causal,
  };
}

function topicOverlap(a?: string[], b?: string[]): number {
  if (!a || !b) return 0;
  return a.filter((x) => b.includes(x)).length;
}

/** 从候选块生成完整节点树（不含锁定处理） */
function generateNodes(cands: Cand[], angle: AngleSpec): LineNode[] {
  const groups = new Map<string, Cand[]>();
  for (const c of cands) {
    const name = themeName(c, angle);
    const list = groups.get(name);
    if (list) list.push(c);
    else groups.set(name, [c]);
  }

  const themeList = Array.from(groups.entries()).map(([name, list]) => ({
    name,
    cands: list,
  }));
  themeList.sort((a, b) => compareThemes(a, b, angle));

  const nodes: LineNode[] = [];

  themeList.forEach((theme, tIndex) => {
    const themeId = themeNodeId(theme.name);
    nodes.push({
      id: themeId,
      level: 1,
      kind: "主题",
      text: theme.name,
      parentId: null,
      order: tIndex,
      citations: [],
      materialIds: Array.from(new Set(theme.cands.map((c) => c.material.id))),
    });

    let claims = theme.cands.filter((c) => c.claimLike);
    let evidence = theme.cands.filter((c) => !c.claimLike);

    if (angle.order === "causal") {
      const causes = theme.cands.filter((c) => c.block.causal === "因");
      if (causes.length > 0) {
        claims = causes;
        evidence = theme.cands.filter((c) => c.block.causal !== "因");
      }
    }

    if (claims.length === 0 && evidence.length > 0) {
      claims = [evidence[0]];
      evidence = evidence.slice(1);
      claims[0].kind = "主张";
    }

    claims.sort((a, b) => compareCands(a, b, angle));

    const claimNodes = claims.map((c, i) => toNode(c, 2, themeId, i));
    nodes.push(...claimNodes);

    // 三层：把非主张块挂到主题内最相关的主张下
    const buckets = new Map<string, Cand[]>();
    for (const e of evidence) {
      let bestId = claimNodes[0]?.id ?? themeId;
      let bestScore = -1;
      for (let i = 0; i < claims.length; i++) {
        const claim = claims[i];
        let score = topicOverlap(e.block.topics, claim.block.topics);
        if (e.material.id === claim.material.id) score += 2;
        if (angle.order === "causal" && e.block.causal === "果") score += 1;
        if (score > bestScore) {
          bestScore = score;
          bestId = claimNodes[i].id;
        }
      }
      const list = buckets.get(bestId);
      if (list) list.push(e);
      else buckets.set(bestId, [e]);
    }

    const maxLevel = Math.min(4, Math.max(3, angle.depth));
    for (const [parentId, list] of buckets) {
      list.sort((a, b) => compareCands(a, b, angle));
      list.forEach((e, i) => {
        const lvl = (maxLevel >= 3 ? 3 : 2) as 1 | 2 | 3 | 4;
        nodes.push(toNode(e, lvl, parentId, i));
      });
    }
  });

  return nodes;
}

/* ---------------- 树操作 ---------------- */

export function childrenOf(nodes: LineNode[], id: string | null): LineNode[] {
  return nodes
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function descendantsOf(nodes: LineNode[], id: string): LineNode[] {
  const out: LineNode[] = [];
  const walk = (parent: string) => {
    for (const n of nodes) {
      if (n.parentId === parent) {
        out.push(n);
        walk(n.id);
      }
    }
  };
  walk(id);
  return out;
}

export function maxDepth(nodes: LineNode[]): number {
  return nodes.reduce((acc, n) => Math.max(acc, n.level), 0);
}

/* ---------------- 锁定 ---------------- */

function applyLocks(
  fresh: LineNode[],
  prev: Line | undefined,
  lockedIds: string[],
): LineNode[] {
  if (!prev || lockedIds.length === 0) return fresh;

  const byId = new Map(fresh.map((n) => [n.id, n]));
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));

  for (const lockedId of lockedIds) {
    const prevNode = prevById.get(lockedId);
    if (!prevNode) continue;

    // 保证祖先链存在（锁定节点的上下文不能凭空消失）
    let cursor: string | null = prevNode.parentId;
    while (cursor && !byId.has(cursor)) {
      const ancestor = prevById.get(cursor);
      if (!ancestor) break;
      byId.set(ancestor.id, { ...ancestor, locked: false });
      cursor = ancestor.parentId;
    }

    // 锁定节点本身：整份沿用旧版本
    byId.set(lockedId, { ...prevNode, locked: true });

    // 子树一并沿用
    for (const child of descendantsOf(prev.nodes, lockedId)) {
      byId.set(child.id, { ...child });
    }
  }

  return Array.from(byId.values());
}

/* ---------------- diff ---------------- */

export function diffLines(prev: LineNode[], next: LineNode[]): LineDiff {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextById = new Map(next.map((n) => [n.id, n]));

  const added: string[] = [];
  const removed: string[] = [];
  const moved: LineDiff["moved"] = [];
  const kept: string[] = [];
  const lockedKept: string[] = [];

  for (const n of next) {
    const before = prevById.get(n.id);
    if (!before) {
      added.push(n.id);
      continue;
    }
    if (before.parentId !== n.parentId || before.order !== n.order) {
      moved.push({ id: n.id, from: before.parentId, to: n.parentId });
    } else {
      kept.push(n.id);
    }
    if (n.locked) lockedKept.push(n.id);
  }
  for (const n of prev) if (!nextById.has(n.id)) removed.push(n.id);

  return { added, removed, moved, kept, lockedKept };
}

/* ---------------- 主入口 ---------------- */

export interface BuildLineInput {
  materials: Material[];
  angleText: string;
  lockedNodeIds?: string[];
  prevLine?: Line;
  /** 局部重生成：只重生成该节点的子树，兄弟分支字节级不变 */
  scopeNodeId?: string;
  profile?: ProfileEntry[];
  lineId?: string;
  now?: string;
}

export function buildLine(input: BuildLineInput): Line {
  const {
    materials,
    angleText,
    lockedNodeIds = [],
    prevLine,
    scopeNodeId,
    profile = [],
    now = "2026-08-03T00:00:00+08:00",
  } = input;

  const angle = parseAngle(angleText, profile);
  const lineId = input.lineId ?? prevLine?.id ?? `ln_${shortHash(angleText || "seed")}`;
  const provenance: string[] = [];

  for (const p of profile) {
    if (p.status !== "active") continue;
    if (p.id === "pf_angle_default_objection" && angle.order === "objection_first") {
      provenance.push(`因为你之前多次要求反对优先 —— 「${p.statement}」`);
    }
  }

  // 解析不出角度 → 反问，不重排
  if (angle.confidence < 0.5) {
    return {
      id: lineId,
      version: prevLine ? prevLine.version : 1,
      angleText,
      angle,
      scopeMaterialIds: (prevLine?.scopeMaterialIds ?? materials.map((m) => m.id)),
      nodes: prevLine ? prevLine.nodes : [],
      lockedNodeIds,
      createdAt: now,
      provenance,
      pending: {
        question: angle.clarifyingQuestion ?? "你想按哪条线索重排？",
        options: [
          "反对意见优先",
          "按时间线",
          "按证据强度",
          "因果链",
          "先看待验证",
        ],
      },
      diff: prevLine
        ? { added: [], removed: [], moved: [], kept: prevLine.nodes.map((n) => n.id), lockedKept: [] }
        : undefined,
    };
  }

  let nodes: LineNode[];

  if (scopeNodeId && prevLine) {
    /* ---- 局部重生成 ---- */
    const scopeNode = prevLine.nodes.find((n) => n.id === scopeNodeId);
    const subtree = descendantsOf(prevLine.nodes, scopeNodeId);
    const subtreeIds = new Set(subtree.map((n) => n.id));
    const subMaterialIds = new Set(subtree.flatMap((n) => n.materialIds));
    const subMaterials = materials.filter((m) => subMaterialIds.has(m.id));

    const fresh = generateNodes(buildCandidates(subMaterials, angle), angle);
    const baseLevel = scopeNode ? scopeNode.level : 1;

    const shifted = fresh.map((n) => {
      const lvl = Math.min(4, n.level + baseLevel) as 1 | 2 | 3 | 4;
      return {
        ...n,
        level: lvl,
        parentId: n.parentId === null ? scopeNodeId : n.parentId,
      };
    });

    const untouched = prevLine.nodes.filter((n) => !subtreeIds.has(n.id));
    const merged = new Map<string, LineNode>();
    for (const n of untouched) merged.set(n.id, n);
    for (const n of shifted) if (!merged.has(n.id)) merged.set(n.id, n);
    nodes = Array.from(merged.values());
    nodes = applyLocks(nodes, prevLine, lockedNodeIds);
  } else {
    /* ---- 全量重排 ---- */
    nodes = generateNodes(buildCandidates(materials, angle), angle);
    nodes = applyLocks(nodes, prevLine, lockedNodeIds);
  }

  nodes = nodes.map((n) => ({ ...n, locked: lockedNodeIds.includes(n.id) }));

  return {
    id: lineId,
    version: prevLine ? prevLine.version + 1 : 1,
    angleText,
    angle,
    scopeMaterialIds: materials.map((m) => m.id),
    nodes,
    lockedNodeIds,
    createdAt: now,
    provenance,
    diff: prevLine ? diffLines(prevLine.nodes, nodes) : undefined,
  };
}

/** 把外查结果写回链路（必须已人审） */
export function writeBackLookup(
  line: Line,
  parentNodeId: string,
  text: string,
  citationNote: string,
): Line {
  const id = `s_${shortHash(text)}`;
  if (line.nodes.some((n) => n.id === id)) return line;
  const parent = line.nodes.find((n) => n.id === parentNodeId);
  const level = Math.min(4, (parent?.level ?? 1) + 1) as 1 | 2 | 3 | 4;
  const siblings = childrenOf(line.nodes, parentNodeId);
  const node: LineNode = {
    id,
    level,
    kind: "外查",
    text,
    parentId: parentNodeId,
    order: siblings.length,
    citations: [],
    materialIds: [],
    topics: ["外查"],
  };
  return {
    ...line,
    version: line.version + 1,
    nodes: [...line.nodes, node],
    provenance: [...line.provenance, `外查写回（已人审）：${citationNote}`],
  };
}
