/**
 * A8 · 安全闸门
 *
 * 四条硬规则：
 *  1. 原料只读，任何改写尝试抛 SafetyViolation
 *  2. 删除 / 覆盖已确认结论 / 覆盖锁定节点，必须带 confirmToken
 *  3. 含第三方个人信息的块不得原样进入成件，必须打码
 *  4. 引擎不发起任何网络请求、不执行任何外部动作
 */
import type { Material } from "../types.ts";
import { SafetyViolation } from "../types.ts";

export type SafetyAction =
  | "read_material"
  | "mutate_material"
  | "delete_piece"
  | "overwrite_locked_node"
  | "overwrite_confirmed_decision"
  | "write_back_lookup"
  | "external_action";

export interface SafetyRequest {
  action: SafetyAction;
  confirmToken?: string;
  approvedByHuman?: boolean;
}

export interface SafetyDecision {
  allowed: boolean;
  rule: string;
  reason?: string;
}

const NEEDS_CONFIRM: SafetyAction[] = [
  "delete_piece",
  "overwrite_locked_node",
  "overwrite_confirmed_decision",
];

export function checkSafety(req: SafetyRequest): SafetyDecision {
  if (req.action === "mutate_material") {
    return {
      allowed: false,
      rule: "material_immutable",
      reason: "原料不可变：Agent 不得改写用户捕获的原始素材。",
    };
  }
  if (req.action === "external_action") {
    return {
      allowed: false,
      rule: "no_external_action",
      reason: "引擎不执行任何外部动作（发送、支付、发布、跨 App 操作）。",
    };
  }
  if (req.action === "write_back_lookup" && !req.approvedByHuman) {
    return {
      allowed: false,
      rule: "human_review_required",
      reason: "外查结果必须经人批准才能写回链路。",
    };
  }
  if (NEEDS_CONFIRM.includes(req.action) && !req.confirmToken) {
    return {
      allowed: false,
      rule: "confirm_required",
      reason: "删除 / 覆盖类动作必须由你确认（这是你定的护栏）。",
    };
  }
  return { allowed: true, rule: "ok" };
}

export function assertSafe(req: SafetyRequest): void {
  const d = checkSafety(req);
  if (!d.allowed) throw new SafetyViolation(d.reason ?? "被安全闸门拒绝", d.rule);
}

/** 原料只读校验：任何试图修改原料的路径都应先过这里 */
export function assertImmutable(material: Material): void {
  if (material.immutable !== true) {
    throw new SafetyViolation("原料缺少不可变标记", "material_immutable");
  }
}

/* ---------------- 个人信息打码 ---------------- */

const PII_PATTERNS: Array<{ re: RegExp; mask: string }> = [
  { re: /1[3-9]\d[\d*]{8}/g, mask: "［手机号已打码］" },
  { re: /\d{6}(19|20)\d{2}[\d Xx*]{6,8}/g, mask: "［身份证号已打码］" },
  { re: /身份证[号]?[尾]?[号]?\s*[:：]?\s*[\dXx*]{4,18}/g, mask: "［身份证号已打码］" },
  { re: /[\w.-]+@[\w-]+\.[a-zA-Z]{2,}/g, mask: "［邮箱已打码］" },
  { re: /\b\d{16,19}\b/g, mask: "［卡号已打码］" },
];

export function containsPII(text: string): boolean {
  return PII_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function maskPII(text: string): string {
  let out = text;
  for (const { re, mask } of PII_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, mask);
  }
  return out;
}
