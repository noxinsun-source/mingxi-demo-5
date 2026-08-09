/**
 * 评测 Runner
 *
 * 把 50 条冻结任务跑成可回归的报告。
 * 引擎是确定性的，所以同一份数据集 → 同一份报告。
 */
import { getMaterials } from "../../../data/mingxi/index.ts";
import { evalTasks } from "../../../data/mingxi/tasks.ts";
import type {
  EvalReport,
  EvalResult,
  EvalTask,
  Line,
  LineNode,
  Material,
} from "../types.ts";
import { verifyCitations } from "../engine/citation.ts";
import { decide } from "../engine/decision.ts";
import {
  buildLine,
  childrenOf,
  descendantsOf,
  maxDepth,
} from "../engine/line-builder.ts";
import { runLookup, canWriteBack } from "../engine/lookup.ts";
import { routePiece } from "../engine/purpose-router.ts";
import { checkSafety } from "../engine/safety.ts";
import {
  confirmEntry,
  emptyStore,
  ingestSignals,
  rollbackEntry,
} from "../engine/learning.ts";

/* ---------------- 工具 ---------------- */

function firstThemeNode(line: Line): LineNode | undefined {
  return childrenOf(line.nodes, null)[0];
}

function firstClaimNode(line: Line): LineNode | undefined {
  const theme = firstThemeNode(line);
  if (!theme) return undefined;
  return childrenOf(line.nodes, theme.id)[0];
}

function levelTwoNodes(line: Line): LineNode[] {
  return childrenOf(line.nodes, null).flatMap((t) => childrenOf(line.nodes, t.id));
}

function nodeEq(a: LineNode | undefined, b: LineNode | undefined): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---------------- 各能力的执行器 ---------------- */

function runPurposeRouting(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];
  const m = materials[0];
  if (!m) return ["找不到素材"];
  const piece = routePiece(m);
  const roles = new Set(piece.blocks.map((b) => b.role));

  for (const r of task.expect.requiredRoles ?? []) {
    if (!roles.has(r)) fails.push(`缺少角色「${r}」（实际：${[...roles].join("/") || "无"}）`);
  }
  for (const r of task.expect.forbiddenRoles ?? []) {
    if (roles.has(r)) fails.push(`不该出现的角色「${r}」`);
  }
  if (task.expect.degraded === true && piece.degraded !== true) {
    fails.push("应当降级为原文/失败态，但没有");
  }
  return fails;
}

function runCitationGrounding(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];
  const m = materials[0];
  if (!m) return ["找不到素材"];
  const piece = routePiece(m);
  const report = verifyCitations(piece, m);

  if (task.expect.everyFactBlockCited && report.orphanBlocks.length > 0) {
    fails.push(`存在无凭据的事实块：${report.orphanBlocks.join(", ")}`);
  }
  if (task.expect.citationsWithinMaterial && report.badRefs.length > 0) {
    fails.push(`错锚：${report.badRefs.join(", ")}`);
  }
  if (
    task.expect.minCoverage !== undefined &&
    report.coverage < task.expect.minCoverage
  ) {
    fails.push(`凭据覆盖率 ${report.coverage.toFixed(2)} < ${task.expect.minCoverage}`);
  }
  if (task.expect.degraded === true && piece.degraded !== true) {
    fails.push("应当降级但没有");
  }
  return fails;
}

function runLineRebuild(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];
  const line = buildLine({ materials, angleText: task.input.angleText ?? "" });

  if (task.expect.mustClarify) {
    if (!line.pending) fails.push("角度模糊时应当反问，但直接重排了");
    if (line.nodes.length > 0) fails.push("反问时不应产出新结构");
    return fails;
  }
  if (line.pending) {
    fails.push(`不该反问却反问了：${line.pending.question}`);
    return fails;
  }

  if (task.expect.order && line.angle.order !== task.expect.order) {
    fails.push(`角度解析为 ${line.angle.order}，期望 ${task.expect.order}`);
  }
  if (task.expect.firstThemeIncludes) {
    const t = firstThemeNode(line);
    if (!t || !t.text.includes(task.expect.firstThemeIncludes)) {
      fails.push(`首个主题是「${t?.text ?? "无"}」，期望包含「${task.expect.firstThemeIncludes}」`);
    }
  }
  if (task.expect.firstClaimKind) {
    const c = firstClaimNode(line);
    if (!c || c.kind !== task.expect.firstClaimKind) {
      fails.push(`首个二级节点类型是 ${c?.kind ?? "无"}，期望 ${task.expect.firstClaimKind}`);
    }
  }
  if (task.expect.firstClaimStrength) {
    const c = firstClaimNode(line);
    if (!c || c.strength !== task.expect.firstClaimStrength) {
      fails.push(`首个二级节点强度是 ${c?.strength ?? "无"}，期望 ${task.expect.firstClaimStrength}`);
    }
  }
  if (task.expect.firstClaimCausal) {
    const c = firstClaimNode(line);
    if (!c || c.causal !== task.expect.firstClaimCausal) {
      fails.push(`首个二级节点因果角色是 ${c?.causal ?? "无"}，期望 ${task.expect.firstClaimCausal}`);
    }
  }
  if (task.expect.minDepth && maxDepth(line.nodes) < task.expect.minDepth) {
    fails.push(`层级深度 ${maxDepth(line.nodes)} < ${task.expect.minDepth}`);
  }
  if (task.expect.minNodes && line.nodes.length < task.expect.minNodes) {
    fails.push(`节点数 ${line.nodes.length} < ${task.expect.minNodes}`);
  }
  if (task.expect.allMaterialsTrack) {
    const ids = new Set(line.nodes.flatMap((n) => n.materialIds));
    const bad = materials.filter(
      (m) => ids.has(m.id) && m.purpose.track !== task.expect.allMaterialsTrack,
    );
    if (bad.length > 0) {
      fails.push(`过滤没生效，混进了：${bad.map((m) => m.id).join(", ")}`);
    }
  }
  return fails;
}

function runLockIntegrity(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];
  const v1 = buildLine({ materials, angleText: task.input.baseAngleText ?? "按主题重排" });
  const claims = levelTwoNodes(v1);
  const target = claims[task.input.lockedNodeIndex ?? 0];
  if (!target) return ["v1 没有可锁定的二级节点"];

  const v2 = buildLine({
    materials,
    angleText: task.input.angleText ?? "",
    prevLine: v1,
    lockedNodeIds: [target.id],
  });

  const after = v2.nodes.find((n) => n.id === target.id);
  if (!after) {
    fails.push("锁定的节点在重排后消失了");
    return fails;
  }
  if (!nodeEq({ ...target, locked: true }, after)) {
    fails.push(
      `锁定节点被改动：父 ${target.parentId}→${after.parentId}，序 ${target.order}→${after.order}`,
    );
  }
  if (!v2.diff?.lockedKept.includes(target.id)) {
    fails.push("diff 里没有把它记为 lockedKept");
  }
  return fails;
}

function runPartialRegen(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];
  const v1 = buildLine({ materials, angleText: task.input.baseAngleText ?? "按主题重排" });
  const themes = childrenOf(v1.nodes, null);
  const scope = themes[task.input.scopeNodeIndex ?? 0];
  if (!scope) return ["v1 没有可用的一级主题"];

  const subtreeIds = new Set(descendantsOf(v1.nodes, scope.id).map((n) => n.id));

  const v2 = buildLine({
    materials,
    angleText: task.input.angleText ?? "",
    prevLine: v1,
    scopeNodeId: scope.id,
  });

  for (const before of v1.nodes) {
    if (subtreeIds.has(before.id)) continue;
    const after = v2.nodes.find((n) => n.id === before.id);
    if (!after) {
      fails.push(`范围外节点被删了：${before.id}`);
      continue;
    }
    if (!nodeEq(before, after)) fails.push(`范围外节点被改了：${before.id}`);
  }
  if (v2.nodes.length === v1.nodes.length && v2.nodes.every((n, i) => nodeEq(n, v1.nodes[i]))) {
    fails.push("局部重生成没有产生任何变化");
  }
  return fails;
}

function runLookupReplay(task: EvalTask): string[] {
  const fails: string[] = [];
  const card = runLookup(task.input.question ?? "");

  if (task.expect.mustFlagConflictWith) {
    const hit = card.conflicts.some(
      (c) => c.materialId === task.expect.mustFlagConflictWith,
    );
    if (!hit) fails.push(`没有标出与 ${task.expect.mustFlagConflictWith} 的冲突`);
  }
  if (task.expect.mustNotWriteBackBeforeApproval && canWriteBack(card)) {
    fails.push("未经人批准就允许写回");
  }
  if (card.status === "no_result" && (card.fallbackAdvice?.length ?? 0) === 0) {
    fails.push("没查到时必须给出自查建议，不能空手而归");
  }
  return fails;
}

function runDecision(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];
  const card = decide({ question: task.input.question ?? "", materials });

  if (task.expect.mustListUnknowns && card.unknowns.length === 0) {
    fails.push("未知项为空（硬规则：不得为空）");
  }
  if (task.expect.mustRefuse && !card.refused) {
    fails.push(`证据不足时应当弃权，却给了建议：${card.recommendation}`);
  }
  if (task.expect.mustRecommend && card.refused) {
    fails.push(`证据充分时应当给建议，却弃权了：${card.refusedReason}`);
  }
  if (task.expect.mustNotAutoApprove && card.approvedByHuman) {
    fails.push("决断卡不得自动标记为已批准");
  }
  return fails;
}

function runMemory(task: EvalTask): string[] {
  const fails: string[] = [];
  let store = ingestSignals(emptyStore(), task.input.signals ?? []);

  if (task.input.confirmEntryId) {
    store = confirmEntry(store, task.input.confirmEntryId);
  }
  if (task.input.rollbackEntryId) {
    store = rollbackEntry(store, task.input.rollbackEntryId);
  }
  if (task.input.replaySignalsAgain) {
    store = ingestSignals(store, task.input.signals ?? []);
  }

  const entry = store.entries.find((e) => e.id === task.expect.profileEntryId);

  if (task.expect.profileStatus) {
    if (!entry) fails.push(`没有产生习得条目 ${task.expect.profileEntryId}`);
    else if (entry.status !== task.expect.profileStatus) {
      fails.push(`条目状态是 ${entry.status}，期望 ${task.expect.profileStatus}`);
    }
  }
  if (task.expect.profileAutoActivated && entry && entry.autoActivated !== true) {
    fails.push("应当是自动生效，但没有标记 autoActivated");
  }
  if (task.expect.requiresConfirmation && entry) {
    if (entry.status === "active" && !entry.confirmedByHuman) {
      fails.push("删除/覆盖类条目未经人确认就生效了");
    }
  }
  if (task.expect.mustNotRelearn) {
    if (entry && entry.status === "active") fails.push("回滚后又被同样的信号学回来了");
    if (store.negativeConstraints.length === 0) {
      fails.push("回滚后没有写入否定约束");
    }
  }
  if (task.expect.profileStatementIncludes && entry) {
    if (!entry.statement.includes(task.expect.profileStatementIncludes)) {
      fails.push(`条目文案不含「${task.expect.profileStatementIncludes}」`);
    }
  }
  return fails;
}

function runSafety(task: EvalTask, materials: Material[]): string[] {
  const fails: string[] = [];

  if (task.input.attempt === "mutate_material") {
    const d = checkSafety({ action: "mutate_material" });
    if (d.allowed) fails.push("允许了改写原料");
  }
  if (task.input.attempt === "delete_without_token") {
    const d = checkSafety({ action: "delete_piece" });
    if (d.allowed) fails.push("允许了无确认令牌的删除");
  }
  if (task.input.attempt === "overwrite_locked_without_token") {
    const d = checkSafety({ action: "overwrite_locked_node" });
    if (d.allowed) fails.push("允许了无确认令牌的覆盖");
  }
  if (task.input.attempt === "external_action") {
    const d = checkSafety({ action: "external_action" });
    if (d.allowed) fails.push("允许了外部动作");
  }
  if (task.input.attempt === "write_back_without_approval") {
    const d = checkSafety({ action: "write_back_lookup", approvedByHuman: false });
    if (d.allowed) fails.push("允许了未经人审的写回");
  }

  if (task.expect.mustMask) {
    const m = materials[0];
    if (!m) return ["找不到素材"];
    const piece = routePiece(m);
    const masked = piece.blocks.some((b) => b.flag === "masked");
    const leaked = piece.blocks.some((b) => /1[3-9]\d{9}|身份证尾号\s*\d{4}/.test(b.text));
    if (!masked) fails.push("含第三方个人信息的块没有被打码");
    if (leaked) fails.push("成件里泄漏了个人信息原文");
  }
  return fails;
}

/* ---------------- 主入口 ---------------- */

export function runTask(task: EvalTask): EvalResult {
  const materials = getMaterials(task.input.materialIds ?? []);
  let reasons: string[] = [];

  try {
    switch (task.capability) {
      case "purpose_routing":
        reasons = runPurposeRouting(task, materials);
        break;
      case "citation_grounding":
        reasons = runCitationGrounding(task, materials);
        break;
      case "line_rebuild":
        reasons = runLineRebuild(task, materials);
        break;
      case "lock_integrity":
        reasons = runLockIntegrity(task, materials);
        break;
      case "partial_regen":
        reasons = runPartialRegen(task, materials);
        break;
      case "lookup_replay":
        reasons = runLookupReplay(task);
        break;
      case "decision":
        reasons = runDecision(task, materials);
        break;
      case "memory_learning":
      case "memory_rollback":
        reasons = runMemory(task);
        break;
      case "safety":
        reasons = runSafety(task, materials);
        break;
      default:
        reasons = ["未知能力"];
    }
  } catch (err) {
    reasons = [`抛异常：${(err as Error).message}`];
  }

  return {
    taskId: task.id,
    capability: task.capability,
    title: task.title,
    pass: reasons.length === 0,
    reasons,
  };
}

export function runAll(tasks: EvalTask[] = evalTasks): EvalReport {
  const results = tasks.map(runTask);
  const byCapability: EvalReport["byCapability"] = {};
  for (const r of results) {
    const b = byCapability[r.capability] ?? { total: 0, passed: 0 };
    b.total += 1;
    if (r.pass) b.passed += 1;
    byCapability[r.capability] = b;
  }
  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length === 0 ? 1 : passed / results.length,
    byCapability,
    results,
  };
}
