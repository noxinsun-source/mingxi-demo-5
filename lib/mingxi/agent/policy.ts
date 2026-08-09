/**
 * 策略闸门（人机边界的唯一执行点）
 *
 * 产品原则落成代码：
 *   1. 用途由人声明 —— Agent 只能建议
 *   2. 重排前要人确认 —— 解析不出角度就反问
 *   3. 外查要人批准才写回
 *   4. 决断只给建议，不执行
 *   5. 删除 / 覆盖类动作永远要人确认（用户定的护栏）
 *   6. 原料不可变，不发起外部动作
 */
import type { SafetyAction, SafetyDecision } from "../engine/safety.ts";
import { checkSafety } from "../engine/safety.ts";

export type BoundaryId =
  | "purpose_declared_by_human"
  | "angle_confirmed_by_human"
  | "lookup_reviewed_by_human"
  | "decision_made_by_human"
  | "destructive_needs_confirm"
  | "material_immutable"
  | "no_external_action";

export interface Boundary {
  id: BoundaryId;
  who: "人" | "AI" | "系统";
  statement: string;
}

export const BOUNDARIES: Record<BoundaryId, Boundary> = {
  purpose_declared_by_human: {
    id: "purpose_declared_by_human",
    who: "人",
    statement: "用途由你声明，AI 只能预填一个建议，不能静默写入。",
  },
  angle_confirmed_by_human: {
    id: "angle_confirmed_by_human",
    who: "人",
    statement: "重排方案先给你看 diff，你接受了才生效；角度看不懂就反问，不擅自动手。",
  },
  lookup_reviewed_by_human: {
    id: "lookup_reviewed_by_human",
    who: "人",
    statement: "外查结果必须你批准才写回链路。",
  },
  decision_made_by_human: {
    id: "decision_made_by_human",
    who: "人",
    statement: "决断卡只给选项、依据和未知项，最终你拍板；AI 不执行任何决定。",
  },
  destructive_needs_confirm: {
    id: "destructive_needs_confirm",
    who: "人",
    statement: "删除、覆盖已确认结论、覆盖锁定节点，一律需要你确认。",
  },
  material_immutable: {
    id: "material_immutable",
    who: "系统",
    statement: "原料不可变：AI 永远不能改写你捕获的原始素材。",
  },
  no_external_action: {
    id: "no_external_action",
    who: "系统",
    statement: "引擎不联网、不发送、不支付、不跨 App 操作。",
  },
};

export interface PolicyVerdict {
  allowed: boolean;
  needsApproval: boolean;
  boundary?: Boundary;
  reason?: string;
}

export interface PolicyRequest {
  action: SafetyAction;
  confirmToken?: string;
  approvedByHuman?: boolean;
}

const ACTION_TO_BOUNDARY: Partial<Record<SafetyAction, BoundaryId>> = {
  mutate_material: "material_immutable",
  external_action: "no_external_action",
  write_back_lookup: "lookup_reviewed_by_human",
  delete_piece: "destructive_needs_confirm",
  overwrite_locked_node: "destructive_needs_confirm",
  overwrite_confirmed_decision: "destructive_needs_confirm",
};

export function evaluate(req: PolicyRequest): PolicyVerdict {
  const decision: SafetyDecision = checkSafety(req);
  const boundaryId = ACTION_TO_BOUNDARY[req.action];
  const boundary = boundaryId ? BOUNDARIES[boundaryId] : undefined;

  if (decision.allowed) return { allowed: true, needsApproval: false, boundary };

  const recoverable =
    decision.rule === "confirm_required" || decision.rule === "human_review_required";

  return {
    allowed: false,
    needsApproval: recoverable,
    boundary,
    reason: decision.reason,
  };
}
