/**
 * 方案三 · 卡片意图信封（L1/L2 多轴）
 * 路径：lib/mingxi/intent/
 */
import type { PurposeLabel } from "../types.ts";

export type PolarityId =
  | "positive_exemplar"
  | "negative_caution"
  | "mixed"
  | "neutral_observe"
  | "unknown";

export type FunctionalTypeId =
  | "concept"
  | "fact"
  | "procedure"
  | "experience"
  | "opinion"
  | "evidence"
  | "resource"
  | "question"
  | "template"
  | "meeting"
  | "clip";

export type UserGoalId =
  | "learn"
  | "avoid"
  | "review"
  | "reference"
  | "share"
  | "delegate_ai"
  | "park"
  | "decide";

export type StanceId =
  | "imitate"
  | "do_not_imitate_failure_path"
  | "quote_only"
  | "transform_ok";

export type ActionId =
  | "ask_clarify"
  | "summarize"
  | "extract_lesson"
  | "extract_playbook"
  | "tag_warning"
  | "create_checklist"
  | "link_related"
  | "split_card"
  | "create_flashcards"
  | "extract_entities"
  | "noop";

export interface CardIntentEnvelope {
  schemaVersion: "3.0";
  knowledgeDomain: Array<{ id: string; label: string; path: string[]; confidence: number }>;
  functionalTypes: Array<{ id: FunctionalTypeId; confidence: number }>;
  polarity: { id: PolarityId; confidence: number; signals: string[] };
  userGoals: Array<{ id: UserGoalId; confidence: number }>;
  actionIntents: Array<{ id: ActionId; priority: number; autoEligible: boolean }>;
  stance: StanceId;
  purposeSuggestion: PurposeLabel;
  overallConfidence: number;
  needsReview: boolean;
  clarifyQuestion?: string | null;
  modelTrace: Record<string, unknown>;
}

export interface NoteUtilityV3 {
  purposeLabel: PurposeLabel;
  casePolarity: "positive" | "negative" | "mixed" | "neutral";
  functionalForm: string;
  stance: StanceId;
  userGoalText: string;
  declaredBy: "ai_suggested" | "human" | "human_confirmed_ai";
}

export const POLARITY_TO_CASE: Record<PolarityId, NoteUtilityV3["casePolarity"]> = {
  positive_exemplar: "positive",
  negative_caution: "negative",
  mixed: "mixed",
  neutral_observe: "neutral",
  unknown: "neutral",
};

export const FUNCTIONAL_UI: Record<string, string> = {
  concept: "概念讲解",
  fact: "事实",
  procedure: "教程步骤",
  experience: "经验帖",
  opinion: "观点",
  evidence: "论文资料",
  resource: "资料入口",
  question: "问题",
  template: "模板",
  meeting: "会议",
  clip: "剪藏",
};
