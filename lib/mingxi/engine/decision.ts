/**
 * A6 · 决断卡
 *
 * 硬规则：
 *   - unknowns 不得为空
 *   - 证据不足时 refused=true，**不给建议**，只列缺什么
 *   - AI 不执行任何决定，只产出卡片
 */
import type {
  Citation,
  DecisionCard,
  DecisionOption,
  Material,
  ProfileEntry,
  SourceBlock,
  Strength,
} from "../types.ts";
import { shortHash } from "./hash.ts";

const SPLIT_RE = /还是|或者|或(?![^一-龥])|\bvs\b|\bVS\b/;

function strengthValue(s?: Strength): number {
  return s === "强" ? 3 : s === "中" ? 2 : s === "弱" ? 1 : 0;
}

interface Scoped {
  block: SourceBlock;
  material: Material;
}

function allBlocks(materials: Material[]): Scoped[] {
  return materials.flatMap((m) => m.blocks.map((block) => ({ block, material: m })));
}

function toCitation(s: Scoped): Citation {
  return {
    materialId: s.material.id,
    blockId: s.block.id,
    quote: s.block.text,
    locator: s.block.locator,
  };
}

/** 从问题里切出选项；切不出来就退化为「做 / 不做」的正反两侧 */
function deriveOptions(
  question: string,
  scoped: Scoped[],
): Array<{ label: string; match: (s: Scoped) => boolean }> {
  const topicVocab = Array.from(
    new Set(scoped.flatMap((s) => s.block.topics ?? [])),
  );

  const segments = question
    .replace(/[？?。！!]/g, "")
    .split(SPLIT_RE)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  if (segments.length >= 2) {
    const opts = segments.map((seg) => {
      const keys = topicVocab.filter((t) => seg.includes(t));
      const fallback = seg.slice(-2);
      const matchKeys = keys.length > 0 ? keys : [fallback];
      return {
        label: seg,
        match: (s: Scoped) =>
          matchKeys.some(
            (k) => s.block.text.includes(k) || (s.block.topics ?? []).includes(k),
          ),
      };
    });
    // 至少有一侧能挂上证据才认为切分有效
    if (opts.some((o) => scoped.some(o.match))) return opts;
  }

  return [
    { label: "支持这么做", match: (s: Scoped) => s.block.polarity === "支持" },
    { label: "先不这么做", match: (s: Scoped) => s.block.polarity === "反对" },
  ];
}

export interface DecideInput {
  question: string;
  materials: Material[];
  profile?: ProfileEntry[];
  now?: string;
}

export function decide(input: DecideInput): DecisionCard {
  const { question, materials, profile = [] } = input;
  const scoped = allBlocks(materials);
  const derived = deriveOptions(question, scoped);

  const options: DecisionOption[] = derived.map((d) => {
    const hits = scoped.filter(d.match);
    const pros = hits.filter((s) => s.block.polarity === "支持");
    const cons = hits.filter((s) => s.block.polarity === "反对");
    return {
      label: d.label,
      pros: pros.map((s) => s.block.text),
      cons: cons.map((s) => s.block.text),
      evidence: hits.map(toCitation),
      strongEvidenceCount: hits.filter((s) => s.block.strength === "强").length,
    };
  });

  const scores = options.map((o, i) => {
    const hits = scoped.filter(derived[i].match);
    const pro = hits
      .filter((s) => s.block.polarity === "支持")
      .reduce((a, s) => a + strengthValue(s.block.strength), 0);
    const con = hits
      .filter((s) => s.block.polarity === "反对")
      .reduce((a, s) => a + strengthValue(s.block.strength), 0);
    return pro - con + o.strongEvidenceCount * 0.5;
  });

  /* ---- 未知项：不得为空 ---- */
  const unknowns: string[] = [];
  for (const m of materials) {
    if (m.flags?.includes("outdated")) {
      unknowns.push(
        `《${m.source.title}》是较早的信息，可能已经变了 —— 用它做依据前建议先外查确认。`,
      );
    }
    if (m.flags?.includes("unverified")) {
      unknowns.push(`《${m.source.title}》没有给出信息来源，不作为依据。`);
    }
  }
  options.forEach((o) => {
    if (o.strongEvidenceCount === 0) {
      unknowns.push(`「${o.label}」这一侧目前没有强证据，只有个人经验或单条数据。`);
    }
  });
  if (unknowns.length === 0) {
    unknowns.push(`还没验证：外部条件（时间、平台规则、你的状态）变化会怎样影响这个判断。`);
  }

  /* ---- 弃权条件 ---- */
  const totalStrong = options.reduce((a, o) => a + o.strongEvidenceCount, 0);
  const sorted = [...scores].sort((a, b) => b - a);
  const gap = sorted.length >= 2 ? sorted[0] - sorted[1] : 0;
  const refused = totalStrong < 2 || (gap < 1 && totalStrong < 4);

  const provenance: string[] = [];
  for (const p of profile) {
    if (p.status === "active" && p.category === "source_trust") {
      provenance.push(`因为你之前更信任官方来源 —— 「${p.statement}」`);
    }
  }

  if (refused) {
    return {
      id: `dc_${shortHash(question)}`,
      question,
      options,
      unknowns: Array.from(new Set(unknowns)),
      refused: true,
      refusedReason:
        totalStrong < 2
          ? "证据不足：现有素材里没有足够的强证据，我不给建议。先补上面这些未知项。"
          : "两个选项的证据强度接近，我不替你拍板。先补上面这些未知项，或者把偏好告诉我。",
      approvedByHuman: false,
      provenance,
    };
  }

  const bestIndex = scores.indexOf(Math.max(...scores));
  const best = options[bestIndex];

  return {
    id: `dc_${shortHash(question)}`,
    question,
    options,
    recommendation: best.label,
    reason: `「${best.label}」有 ${best.strongEvidenceCount} 条强证据支撑，且反对证据更少。这是建议，不是结论 —— 你拍板。`,
    unknowns: Array.from(new Set(unknowns)),
    approvedByHuman: false,
    provenance,
  };
}

/** 人批准：AI 不执行，只标记 */
export function approveDecision(card: DecisionCard): DecisionCard {
  return { ...card, approvedByHuman: true };
}
