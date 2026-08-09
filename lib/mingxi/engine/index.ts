/**
 * 明晰 Agent 引擎 · 编排入口
 *
 * 确定性纯函数，无网络、无密钥，浏览器与 Node 同构。
 * 因此：评测可复现、Demo 现场不会翻车。
 * 需要接入真实模型时，替换 llm-adapter 的实现即可，接口不变。
 */
export * from "./hash.ts";
export * from "./safety.ts";
export * from "./purpose-router.ts";
export * from "./citation.ts";
export * from "./angle.ts";
export * from "./line-builder.ts";
export * from "./lookup.ts";
export * from "./decision.ts";
export * from "./learning.ts";

import type {
  CitationReport,
  Line,
  Material,
  Piece,
  ProfileStore,
} from "../types.ts";
import { verifyCitations } from "./citation.ts";
import { buildLine } from "./line-builder.ts";
import { routePiece } from "./purpose-router.ts";
import { activeEntries } from "./learning.ts";

/** 捕获后的一次完整整理：用途路由 → 成件 → 凭据校验 */
export function capture(
  material: Material,
  store?: ProfileStore,
): { piece: Piece; report: CitationReport } {
  const piece = routePiece(material, {
    profile: store ? activeEntries(store) : [],
  });
  return { piece, report: verifyCitations(piece, material) };
}

/** 一句话重排的便捷封装 */
export function reline(
  materials: Material[],
  angleText: string,
  opts: {
    prevLine?: Line;
    lockedNodeIds?: string[];
    scopeNodeId?: string;
    store?: ProfileStore;
  } = {},
): Line {
  return buildLine({
    materials,
    angleText,
    prevLine: opts.prevLine,
    lockedNodeIds: opts.lockedNodeIds,
    scopeNodeId: opts.scopeNodeId,
    profile: opts.store ? activeEntries(opts.store) : [],
  });
}
