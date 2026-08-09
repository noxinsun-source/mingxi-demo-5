/**
 * 提问风格先验（Questioning Style Prior）
 *
 * 目标：让智能笔记 Agent 学到用户「怎么挖问题」，而不只是存了什么。
 *
 * ## 学什么（四维）
 * 1. perspective  视角：产品 / 机制 / 评测 / 失败对照 / 时间线 / 工程落地 / 路由选型
 * 2. entryPoint   切入点：定义先行 / 对比先行 / 失败先行 / 短三分法再生长 / 问题驱动 / 证据先行
 * 3. deepenLogic  深挖逻辑：先广后深 / 层层递进 / 反例→正例 / 因果链 / 决策树
 * 4. digDirection 深挖方向：逼近决策 / 工程实现 / 理论机制 / 证据强度 / 差异对照
 *
 * ## 怎么学
 * - 规则抽取（离线可测、不依赖 LLM）：从用户追问语句打标签
 * - 每次对话用户发言 → record → 累计分布
 * - ≥ ACTIVATE_MIN 条信号后注入系统提示，回答时默认对齐用户习惯
 *
 * ## 怎么量化
 * - 抽取准确率：金标语句 → predicted ∩ gold / predicted、recall
 * - 学习收敛：合成多轮对话后 top-k 是否命中期望风格
 * - 注入覆盖：prompt block 是否包含已激活维度
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { notesRoot } from "./note-store.ts";

export const QUESTION_STYLE_ACTIVATE_MIN = 3;

export type PerspectiveId =
  | "product"
  | "mechanism"
  | "evaluation"
  | "failure_contrast"
  | "timeline"
  | "implementation"
  | "routing";

export type EntryPointId =
  | "definition_first"
  | "contrast_first"
  | "failure_first"
  | "short_taxonomy_then_grow"
  | "question_driven"
  | "evidence_first";

export type DeepenLogicId =
  | "breadth_then_depth"
  | "layer_by_layer"
  | "counter_then_positive"
  | "causal_chain"
  | "decision_tree";

export type DigDirectionId =
  | "toward_decision"
  | "toward_engineering"
  | "toward_theory"
  | "toward_evidence"
  | "toward_contrast";

export type QuestionStyleSource =
  | "chat"
  | "think"
  | "synthetic"
  | "explicit"
  | "tool";

export interface QuestionStyleLabels {
  perspectives: PerspectiveId[];
  entryPoints: EntryPointId[];
  deepenLogics: DeepenLogicId[];
  digDirections: DigDirectionId[];
}

export interface QuestionStyleSignal extends QuestionStyleLabels {
  at: string;
  utterance: string;
  source: QuestionStyleSource;
  sessionId?: string;
}

interface QuestionStyleFile {
  version: 1;
  signals: QuestionStyleSignal[];
}

export const PERSPECTIVE_LABEL: Record<PerspectiveId, string> = {
  product: "产品视角",
  mechanism: "机制/原理视角",
  evaluation: "评测/指标视角",
  failure_contrast: "失败对照视角",
  timeline: "时间演进视角",
  implementation: "工程落地视角",
  routing: "路由/选型视角",
};

export const ENTRY_LABEL: Record<EntryPointId, string> = {
  definition_first: "定义/边界先行",
  contrast_first: "对比拆开先行",
  failure_first: "反例/翻车先行",
  short_taxonomy_then_grow: "短三分法再生长",
  question_driven: "问题驱动切入",
  evidence_first: "证据强度先行",
};

export const DEEPEN_LABEL: Record<DeepenLogicId, string> = {
  breadth_then_depth: "先广后深",
  layer_by_layer: "层层递进（层→层）",
  counter_then_positive: "反例→正例",
  causal_chain: "因果链条",
  decision_tree: "决策树/场景分流",
};

export const DIG_LABEL: Record<DigDirectionId, string> = {
  toward_decision: "逼近可执行决策",
  toward_engineering: "逼近工程实现",
  toward_theory: "逼近理论机制",
  toward_evidence: "逼近证据强度",
  toward_contrast: "逼近差异边界",
};

type Rule<T extends string> = { id: T; patterns: RegExp[]; weight?: number };

const PERSPECTIVE_RULES: Rule<PerspectiveId>[] = [
  {
    id: "product",
    patterns: [/产品视角/, /产品侧/, /对产品/, /产品上/, /用户价值/, /体验上/, /怎么卖/, /怎么用到产品/],
  },
  {
    id: "mechanism",
    patterns: [/机制/, /原理/, /为什么能/, /底层/, /内部怎么/, /工作原理/, /怎么实现的(?!决策)/],
  },
  {
    id: "evaluation",
    patterns: [/评测/, /指标/, /怎么衡量/, /benchmark/i, /准确率/, /召回/, /怎么评估/, /验收/],
  },
  {
    id: "failure_contrast",
    patterns: [/失败对照/, /翻车/, /反例/, /避坑/, /翻车反证/, /泄露/, /踩坑/, /对照失败/],
  },
  {
    id: "timeline",
    patterns: [/时间线/, /演进/, /先后顺序/, /发展史/, /按时间/, /编年/, /从早期到/, /从.+演进到/],
  },
  {
    id: "implementation",
    patterns: [/落地/, /工程上/, /怎么实现(?!的决策)/, /代码里/, /工程接入/, /怎么接入/, /部署/, /可运行/, /脚手架/],
  },
  {
    id: "routing",
    patterns: [/路由/, /选型/, /该用哪个/, /什么时候用/, /场景分流/, /走.+还是/, /选用/],
  },
];

const ENTRY_RULES: Rule<EntryPointId>[] = [
  {
    id: "short_taxonomy_then_grow",
    patterns: [/三分法/, /先给极短/, /先短后长/, /不要一次铺满/, /先分类再/, /先拆成.?类/, /短版先/],
  },
  {
    id: "contrast_first",
    patterns: [/先对比/, /区别是/, /差异在哪/, /不是一回事/, /同域近义/, /怎么拆开/, /对比着讲/, /有何不同/],
  },
  {
    id: "failure_first",
    patterns: [/先讲坑/, /先看翻车/, /先反例/, /从失败/, /先避雷/, /反证/],
  },
  {
    id: "definition_first",
    patterns: [/先定义/, /边界是/, /前提是/, /到底是什么/, /先讲清楚概念/, /内涵外延/],
  },
  {
    id: "evidence_first",
    patterns: [/先看证据/, /有没有数据/, /依据是/, /谁证明/, /证据强度/],
  },
  {
    id: "question_driven",
    patterns: [/先问/, /开放问题/, /待验证/, /还不知道/, /存疑/, /关键问题是/],
  },
];

const DEEPEN_RULES: Rule<DeepenLogicId>[] = [
  {
    id: "layer_by_layer",
    patterns: [/层层/, /下一层/, /再往下/, /更深一层/, /按层/, /作用层/, /一层层/, /递进/],
  },
  {
    id: "counter_then_positive",
    patterns: [
      /反例.+正例/,
      /正例.+反例/,
      /先避雷再/,
      /对照正反/,
      /失败.+成功/,
      /泄露.+可安装/,
      /失败对照/,
      /活在上下文/,
      /活成制品/,
    ],
  },
  {
    id: "breadth_then_depth",
    patterns: [/先全貌/, /先地图/, /再深入/, /先广后深/, /总览再/, /先铺开/],
  },
  {
    id: "causal_chain",
    patterns: [/因为所以/, /因果链/, /导致/, /根因/, /链条/, /为什么会这样/],
  },
  {
    id: "decision_tree",
    patterns: [/如果.+就/, /场景.+走/, /决策树/, /怎么选/, /分流/, /什么情况用/],
  },
];

const DIG_RULES: Rule<DigDirectionId>[] = [
  {
    id: "toward_decision",
    patterns: [/所以该怎么选/, /给我结论/, /可执行/, /下一步做什么/, /决策建议/, /怎么拍板/],
  },
  {
    id: "toward_engineering",
    patterns: [/代码怎么写/, /接口/, /管线/, /落盘/, /怎么接入系统/, /工程细节/],
  },
  {
    id: "toward_theory",
    patterns: [/理论依据/, /论文怎么说/, /形式化/, /抽象模型/, /学术上/],
  },
  {
    id: "toward_evidence",
    patterns: [/有没有出处/, /引用哪条/, /证据呢/, /仓库里哪篇/, /cite/i, /笔记依据/],
  },
  {
    id: "toward_contrast",
    patterns: [/再拉开/, /边界在哪/, /别混在一起/, /差异边/, /对照着挖/, /作用层差异/, /拉开差异/, /差异在/],
  },
];

function matchRules<T extends string>(text: string, rules: Rule<T>[]): T[] {
  const hit: T[] = [];
  for (const r of rules) {
    if (r.patterns.some((p) => p.test(text))) hit.push(r.id);
  }
  return hit;
}

/** 从一句用户追问里抽取风格标签（确定性，可单测） */
export function extractQuestionStyle(utterance: string): QuestionStyleLabels {
  const text = String(utterance || "").trim();
  if (!text) {
    return { perspectives: [], entryPoints: [], deepenLogics: [], digDirections: [] };
  }
  return {
    perspectives: matchRules(text, PERSPECTIVE_RULES),
    entryPoints: matchRules(text, ENTRY_RULES),
    deepenLogics: matchRules(text, DEEPEN_RULES),
    digDirections: matchRules(text, DIG_RULES),
  };
}

function priorPath(root?: string): string {
  return resolve(notesRoot(root), "question-style-prior.json");
}

function loadFile(root?: string): QuestionStyleFile {
  const p = priorPath(root);
  if (!existsSync(p)) return { version: 1, signals: [] };
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as QuestionStyleFile;
    return { version: 1, signals: Array.isArray(raw.signals) ? raw.signals : [] };
  } catch {
    return { version: 1, signals: [] };
  }
}

function saveFile(file: QuestionStyleFile, root?: string) {
  const p = priorPath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(file, null, 2), "utf8");
}

export function clearQuestionStylePrior(root?: string) {
  saveFile({ version: 1, signals: [] }, root);
}

export function recordQuestionStyleSignal(
  input: {
    utterance: string;
    source?: QuestionStyleSource;
    sessionId?: string;
    labels?: Partial<QuestionStyleLabels>;
  },
  root?: string,
): QuestionStyleSignal | null {
  const extracted = extractQuestionStyle(input.utterance);
  const labels: QuestionStyleLabels = {
    perspectives: input.labels?.perspectives ?? extracted.perspectives,
    entryPoints: input.labels?.entryPoints ?? extracted.entryPoints,
    deepenLogics: input.labels?.deepenLogics ?? extracted.deepenLogics,
    digDirections: input.labels?.digDirections ?? extracted.digDirections,
  };
  const empty =
    !labels.perspectives.length &&
    !labels.entryPoints.length &&
    !labels.deepenLogics.length &&
    !labels.digDirections.length;
  if (empty) return null;

  const entry: QuestionStyleSignal = {
    at: new Date().toISOString(),
    utterance: input.utterance.slice(0, 240),
    source: input.source ?? "chat",
    sessionId: input.sessionId,
    ...labels,
  };
  const file = loadFile(root);
  file.signals.push(entry);
  // 防止无限增长：保留最近 200 条
  if (file.signals.length > 200) file.signals = file.signals.slice(-200);
  saveFile(file, root);
  return entry;
}

/** 学一句：抽取 + 落盘；无标签则返回 null */
export function learnFromUtterance(
  utterance: string,
  opts: { root?: string; source?: QuestionStyleSource; sessionId?: string } = {},
): QuestionStyleSignal | null {
  return recordQuestionStyleSignal(
    {
      utterance,
      source: opts.source ?? "chat",
      sessionId: opts.sessionId,
    },
    opts.root,
  );
}

function tally<T extends string>(
  signals: QuestionStyleSignal[],
  pick: (s: QuestionStyleSignal) => T[],
): Array<{ id: T; count: number; label: string; labels: Record<T, string> }> {
  const m = new Map<T, number>();
  for (const s of signals) {
    for (const id of pick(s)) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([id, count]) => ({ id, count, label: String(id), labels: {} as Record<T, string> }))
    .sort((a, b) => b.count - a.count);
}

export interface QuestionStyleDimSummary<T extends string> {
  id: T;
  count: number;
  label: string;
  /** count / totalSignals */
  share: number;
}

export interface QuestionStyleSummary {
  total: number;
  perspectives: QuestionStyleDimSummary<PerspectiveId>[];
  entryPoints: QuestionStyleDimSummary<EntryPointId>[];
  deepenLogics: QuestionStyleDimSummary<DeepenLogicId>[];
  digDirections: QuestionStyleDimSummary<DigDirectionId>[];
  /** 是否达到注入阈值 */
  active: boolean;
}

function toDim<T extends string>(
  rows: Array<{ id: T; count: number }>,
  total: number,
  labelMap: Record<T, string>,
): QuestionStyleDimSummary<T>[] {
  return rows.map((r) => ({
    id: r.id,
    count: r.count,
    label: labelMap[r.id] ?? r.id,
    share: total ? r.count / total : 0,
  }));
}

export function questionStyleSummary(root?: string): QuestionStyleSummary {
  const { signals } = loadFile(root);
  const total = signals.length;
  const perspectives = toDim(
    tally(signals, (s) => s.perspectives).map((x) => ({ id: x.id, count: x.count })),
    total,
    PERSPECTIVE_LABEL,
  );
  const entryPoints = toDim(
    tally(signals, (s) => s.entryPoints).map((x) => ({ id: x.id, count: x.count })),
    total,
    ENTRY_LABEL,
  );
  const deepenLogics = toDim(
    tally(signals, (s) => s.deepenLogics).map((x) => ({ id: x.id, count: x.count })),
    total,
    DEEPEN_LABEL,
  );
  const digDirections = toDim(
    tally(signals, (s) => s.digDirections).map((x) => ({ id: x.id, count: x.count })),
    total,
    DIG_LABEL,
  );
  return {
    total,
    perspectives,
    entryPoints,
    deepenLogics,
    digDirections,
    active: total >= QUESTION_STYLE_ACTIVATE_MIN,
  };
}

function fmtDim<T extends string>(rows: QuestionStyleDimSummary<T>[], n = 3): string {
  return rows
    .slice(0, n)
    .map((r) => `${r.label}×${r.count}(${Math.round(r.share * 100)}%)`)
    .join("、");
}

/**
 * 注入系统提示的风格块。样本 < ACTIVATE_MIN 返回空。
 */
export function questionStylePromptBlock(root?: string): string {
  const s = questionStyleSummary(root);
  if (!s.active) return "";
  const lines = [
    "## 已习得的用户提问风格（回答追问/梳逻辑时优先对齐）",
    `- 样本 ${s.total} 条追问信号；以下为高频习惯，不是强制命令。`,
  ];
  if (s.perspectives.length) lines.push(`- 偏好视角：${fmtDim(s.perspectives)}`);
  if (s.entryPoints.length) lines.push(`- 偏好切入：${fmtDim(s.entryPoints)}`);
  if (s.deepenLogics.length) lines.push(`- 深挖逻辑：${fmtDim(s.deepenLogics)}`);
  if (s.digDirections.length) lines.push(`- 深挖方向：${fmtDim(s.digDirections)}`);
  lines.push(
    "- 若用户本轮话术已明确指定视角/切入，以本轮为准；否则默认按上述习惯组织回答（先短后长、层间递进）。",
  );
  return lines.join("\n");
}

/** 拼进用户消息前的短提示（每轮动态，不依赖重建 harness） */
export function questionStyleTurnHint(root?: string): string {
  const s = questionStyleSummary(root);
  if (!s.active) return "";
  const bits = [
    s.perspectives[0] ? `视角=${s.perspectives[0].label}` : "",
    s.entryPoints[0] ? `切入=${s.entryPoints[0].label}` : "",
    s.deepenLogics[0] ? `深挖=${s.deepenLogics[0].label}` : "",
    s.digDirections[0] ? `方向=${s.digDirections[0].label}` : "",
  ].filter(Boolean);
  if (!bits.length) return "";
  return `【风格先验】${bits.join(" · ")}`;
}

/** 量化：抽取结果相对金标的 precision / recall / f1（微平均跨四维） */
export function scoreExtraction(
  predicted: QuestionStyleLabels,
  gold: QuestionStyleLabels,
): { precision: number; recall: number; f1: number; hit: number; pred: number; truth: number } {
  const dims: Array<keyof QuestionStyleLabels> = [
    "perspectives",
    "entryPoints",
    "deepenLogics",
    "digDirections",
  ];
  let hit = 0;
  let pred = 0;
  let truth = 0;
  for (const d of dims) {
    const p = new Set(predicted[d] as string[]);
    const g = new Set(gold[d] as string[]);
    pred += p.size;
    truth += g.size;
    for (const x of p) if (g.has(x)) hit += 1;
  }
  const precision = pred ? hit / pred : 1;
  const recall = truth ? hit / truth : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall || 1) : 1;
  return { precision, recall, f1, hit, pred, truth };
}

/**
 * 量化：学完后 top1 是否命中期望集合。
 * 返回 0~1，四维等权平均。
 */
export function styleMatchScore(
  summary: QuestionStyleSummary,
  expected: Partial<QuestionStyleLabels>,
): number {
  const checks: Array<{ top?: string; want?: string[] }> = [
    { top: summary.perspectives[0]?.id, want: expected.perspectives },
    { top: summary.entryPoints[0]?.id, want: expected.entryPoints },
    { top: summary.deepenLogics[0]?.id, want: expected.deepenLogics },
    { top: summary.digDirections[0]?.id, want: expected.digDirections },
  ];
  let ok = 0;
  let n = 0;
  for (const c of checks) {
    if (!c.want?.length) continue;
    n += 1;
    if (c.top && c.want.includes(c.top as never)) ok += 1;
  }
  return n ? ok / n : 1;
}

/** 可读报告（CLI / 工具输出） */
export function formatQuestionStyleReport(root?: string): string {
  const s = questionStyleSummary(root);
  if (!s.total) return "尚未学到提问风格（还没有带标签的追问信号）。";
  const lines = [
    `提问风格先验 · ${s.total} 条信号 · ${s.active ? "已激活注入" : `未激活（需 ≥${QUESTION_STYLE_ACTIVATE_MIN}）`}`,
    s.perspectives.length ? `视角：${fmtDim(s.perspectives, 5)}` : "视角：—",
    s.entryPoints.length ? `切入：${fmtDim(s.entryPoints, 5)}` : "切入：—",
    s.deepenLogics.length ? `深挖：${fmtDim(s.deepenLogics, 5)}` : "深挖：—",
    s.digDirections.length ? `方向：${fmtDim(s.digDirections, 5)}` : "方向：—",
  ];
  return lines.join("\n");
}
