/**
 * A4 前半 · 角度解析
 *
 * 把用户的一句话变成可预览的 AngleSpec。
 * 解析不出来时**不擅自重排**，而是返回一个追问（confidence < 0.5）。
 */
import type { AngleOrder, AngleSpec, GroupBy, ProfileEntry, PurposeLabel } from "../types.ts";

interface OrderRule {
  order: AngleOrder;
  keywords: string[];
}

export const ORDER_RULES: OrderRule[] = [
  {
    order: "objection_first",
    keywords: ["反对", "质疑", "批评", "风险", "反驳", "争议", "反例", "坑", "不同意", "挑刺"],
  },
  {
    order: "timeline",
    keywords: ["时间线", "时间", "先后", "演进", "发展", "历程", "按年份", "编年"],
  },
  {
    order: "evidence_strength",
    keywords: ["证据", "依据", "可信", "强弱", "靠谱", "实验", "数据支持", "证据强度"],
  },
  {
    order: "causal",
    keywords: ["因果", "为什么", "原因", "导致", "机制", "链条", "怎么造成"],
  },
  {
    order: "question_driven",
    keywords: ["问题", "疑问", "待验证", "不确定", "开放问题", "还不知道", "存疑"],
  },
  {
    order: "contrast",
    keywords: ["对比", "差异", "区别", "相比", "优劣", "两派", "正反"],
  },
  {
    order: "action_first",
    keywords: ["行动", "下一步", "怎么做", "落地", "待办", "执行", "先做"],
  },
];

const GROUP_RULES: Array<{ groupBy: GroupBy; keywords: string[] }> = [
  { groupBy: "source", keywords: ["按来源", "按出处", "按平台", "按作者"] },
  { groupBy: "time", keywords: ["按时间", "按年份", "按阶段"] },
  { groupBy: "purpose", keywords: ["按用途", "按类型", "按标签"] },
  { groupBy: "theme", keywords: ["按主题", "按话题", "按方面"] },
];

const DEFAULT_GROUP_BY: Record<AngleOrder, GroupBy> = {
  objection_first: "theme",
  timeline: "time",
  evidence_strength: "theme",
  causal: "theme",
  question_driven: "theme",
  contrast: "theme",
  action_first: "theme",
  default: "theme",
};

const TOPIC_DICT = [
  "记忆机制", "提取练习", "间隔安排", "理解型学科", "工具与执行", "动机与坚持",
  "钩子", "结构", "排版", "封面", "CTA", "节奏", "标题手法", "风险", "数据",
  "平台规则", "图文", "视频", "策略", "约束", "行动", "金句",
];

const TRACK_FILTER: Array<{ track: "学习型" | "创作型"; keywords: string[] }> = [
  { track: "学习型", keywords: ["只看学习", "只要学习", "学习型"] },
  { track: "创作型", keywords: ["只看创作", "只要创作", "创作型"] },
];

const PURPOSE_FILTER: Array<{ label: PurposeLabel; keywords: string[] }> = [
  { label: "反例避坑", keywords: ["只要反例", "只看反例"] },
  { label: "对标拆解", keywords: ["只看对标", "只要对标"] },
  { label: "待办行动", keywords: ["只看待办", "只要行动"] },
];

function extractEmphasis(text: string): string[] {
  const out: string[] = [];
  const quoted = text.match(/[「"'“](.+?)[」"'”]/g);
  if (quoted) {
    for (const q of quoted) out.push(q.replace(/[「」"'“”]/g, "").trim());
  }
  for (const t of TOPIC_DICT) if (text.includes(t)) out.push(t);
  return Array.from(new Set(out.filter((x) => x.length > 0)));
}

function extractDepth(text: string): number {
  if (/两层|2\s*层/.test(text)) return 2;
  if (/四层|4\s*层/.test(text)) return 4;
  return 3;
}

export function parseAngle(text: string, profile: ProfileEntry[] = []): AngleSpec {
  const raw = (text ?? "").trim();

  let best: OrderRule | null = null;
  let bestHits = 0;
  for (const rule of ORDER_RULES) {
    const hits = rule.keywords.filter((k) => raw.includes(k)).length;
    if (hits > bestHits) {
      best = rule;
      bestHits = hits;
    }
  }

  const emphasis = extractEmphasis(raw);
  const depth = extractDepth(raw);

  const groupHit = GROUP_RULES.find((g) => g.keywords.some((k) => raw.includes(k)));

  const filter: AngleSpec["filter"] = {};
  const trackHit = TRACK_FILTER.find((t) => t.keywords.some((k) => raw.includes(k)));
  if (trackHit) filter.track = trackHit.track;
  const purposeHits = PURPOSE_FILTER.filter((p) =>
    p.keywords.some((k) => raw.includes(k)),
  ).map((p) => p.label);
  if (purposeHits.length > 0) filter.purposeLabels = purposeHits;

  // 习得档：只在用户没给出明确线索时提供默认角度
  const defaultFromProfile = profile.find(
    (p) => p.status === "active" && p.id === "pf_angle_default_objection",
  );

  if (!best) {
    if (groupHit) {
      return {
        order: "default",
        groupBy: groupHit.groupBy,
        emphasis,
        depth,
        filter,
        confidence: 0.7,
      };
    }
    if (defaultFromProfile) {
      return {
        order: "objection_first",
        groupBy: "theme",
        emphasis,
        depth,
        filter,
        confidence: 0.6,
      };
    }
    return {
      order: "default",
      groupBy: "theme",
      emphasis,
      depth,
      filter,
      confidence: 0.3,
      clarifyingQuestion:
        "你想按哪条线索重排？我不猜，你选一个或者再说一句。",
    };
  }

  const confidence = Math.min(0.95, 0.6 + bestHits * 0.15 + emphasis.length * 0.05);

  return {
    order: best.order,
    groupBy: groupHit ? groupHit.groupBy : DEFAULT_GROUP_BY[best.order],
    emphasis,
    depth,
    filter,
    confidence,
  };
}

export const ANGLE_PRESETS: Array<{ label: string; text: string }> = [
  { label: "反对意见优先", text: "把反对意见和风险放最前面重排" },
  { label: "按时间线", text: "按时间线重排，看这件事怎么演进的" },
  { label: "按证据强度", text: "按证据强度重排，强证据在前，个人观点靠后" },
  { label: "因果链", text: "按因果重排，先讲原因再讲导致的结果" },
  { label: "先看待验证", text: "把我还不确定的问题和存疑的点提到最前面" },
  { label: "正反对照", text: "按正反两派对比重排" },
  { label: "行动优先", text: "把下一步行动放最前面，证据收到下面" },
];
