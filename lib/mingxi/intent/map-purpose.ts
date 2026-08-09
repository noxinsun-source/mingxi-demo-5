/**
 * 弱信号 + 用途映射（确定性，可单测）
 */
import type { PurposeLabel } from "../types.ts";
import type {
  ActionId,
  CardIntentEnvelope,
  FunctionalTypeId,
  PolarityId,
  StanceId,
  UserGoalId,
} from "./types.ts";

const NEG = [
  /千万别/,
  /不要/,
  /切忌/,
  /避雷/,
  /踩坑/,
  /翻车/,
  /血泪/,
  /后悔/,
  /失败/,
  /教训/,
  /别再/,
  /坑爹/,
  /别学/,
];
const POS = [/亲测/, /推荐/, /最佳实践/, /成功/, /可复用/, /一次过/, /提分/, /有效/];
const PROC = [/步骤/, /首先/, /然后/, /第一/, /第二/, /TODO/, /待办/];
const EXP = [/我当时/, /上周/, /经验/, /踩坑/, /血泪/, /亲测/];

export function heuristicSignals(text: string): {
  polarity_prior: PolarityId;
  score: number;
  signals: string[];
  functional: FunctionalTypeId[];
} {
  const signals: string[] = [];
  let neg = 0;
  let pos = 0;
  for (const r of NEG) if (r.test(text)) {
    neg++;
    signals.push(r.source);
  }
  for (const r of POS) if (r.test(text)) {
    pos++;
    signals.push(r.source);
  }
  const functional: FunctionalTypeId[] = [];
  if (PROC.some((r) => r.test(text))) functional.push("procedure");
  if (EXP.some((r) => r.test(text))) functional.push("experience");
  if (/定义|是指|原理/.test(text)) functional.push("concept");
  if (/arxiv|论文|DOI/i.test(text)) functional.push("evidence");
  if (!functional.length) functional.push("clip");

  let polarity_prior: PolarityId = "neutral_observe";
  if (neg > 0 && pos > 0) polarity_prior = "mixed";
  else if (neg > 0) polarity_prior = "negative_caution";
  else if (pos > 0) polarity_prior = "positive_exemplar";

  return { polarity_prior, score: Math.min(1, (neg + pos) * 0.2), signals, functional };
}

export function mapToPurpose(input: {
  polarity: PolarityId;
  userGoals: UserGoalId[];
  functionalTypes: FunctionalTypeId[];
  text?: string;
}): PurposeLabel {
  const goals = new Set(input.userGoals);
  const fun = new Set(input.functionalTypes);
  const t = input.text ?? "";

  if (input.polarity === "negative_caution" || goals.has("avoid")) return "反例避坑";
  // decide/原 todo 形态：不再映射用途「待办」，先归档
  if (goals.has("decide")) return "资料收藏";
  if (/对标|爆款|拆解|钩子|封面/.test(t) || (goals.has("reference") && /结构|文案/.test(t)))
    return "对标拆解";
  if (goals.has("reference") && (fun.has("template") || /金句|句式/.test(t))) return "素材金句";
  if (goals.has("learn") || fun.has("concept") || fun.has("evidence")) return "学习理论";
  return "资料收藏";
}

export function stanceFor(polarity: PolarityId): StanceId {
  if (polarity === "negative_caution" || polarity === "mixed")
    return "do_not_imitate_failure_path";
  if (polarity === "positive_exemplar") return "imitate";
  return "transform_ok";
}

export function defaultActions(polarity: PolarityId, goals: UserGoalId[]): Array<{
  id: ActionId;
  priority: number;
  autoEligible: boolean;
}> {
  if (polarity === "unknown")
    return [{ id: "ask_clarify", priority: 1, autoEligible: false }];
  if (polarity === "negative_caution" || polarity === "mixed")
    return [
      { id: "extract_lesson", priority: 1, autoEligible: true },
      { id: "tag_warning", priority: 2, autoEligible: true },
      { id: "create_checklist", priority: 3, autoEligible: true },
    ];
  if (polarity === "positive_exemplar")
    return [
      { id: "extract_playbook", priority: 1, autoEligible: true },
      { id: "summarize", priority: 2, autoEligible: true },
    ];
  if (goals.includes("review") || goals.includes("learn"))
    return [
      { id: "summarize", priority: 1, autoEligible: true },
      { id: "create_flashcards", priority: 2, autoEligible: true },
    ];
  return [{ id: "summarize", priority: 1, autoEligible: true }];
}

export function confidenceGate(e: CardIntentEnvelope): "auto" | "clarify" | "review" {
  if (e.polarity.id === "unknown" || e.overallConfidence < 0.45) return "clarify";
  if (e.overallConfidence < 0.6 || e.needsReview) return "review";
  if (e.polarity.id === "mixed" && e.polarity.confidence < 0.7) return "clarify";
  return "auto";
}
