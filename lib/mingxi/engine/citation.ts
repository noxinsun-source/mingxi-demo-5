/**
 * A2 · 凭据对齐
 *
 * 硬规则：任何**事实性**成件块必须 ≥1 条凭据；
 * 无法定位的必须标 flag:"no-source" 且 citations 为空 —— 不允许伪造 locator。
 */
import type { CitationReport, Material, Piece } from "../types.ts";
import { NON_FACT_ROLES } from "./purpose-router.ts";

export function verifyCitations(piece: Piece, material: Material): CitationReport {
  const validIds = new Set(material.blocks.map((b) => b.id));
  const badRefs: string[] = [];
  const orphanBlocks: string[] = [];

  let factCount = 0;
  let citedFactCount = 0;

  piece.blocks.forEach((pb, i) => {
    const isFact = !NON_FACT_ROLES.has(pb.role);

    for (const c of pb.citations) {
      if (c.materialId !== material.id || !validIds.has(c.blockId)) {
        badRefs.push(`${pb.role}#${i} → ${c.materialId}/${c.blockId}`);
      }
    }

    if (!isFact) return;
    factCount += 1;
    if (pb.citations.length > 0) {
      citedFactCount += 1;
    } else if (pb.flag !== "no-source") {
      orphanBlocks.push(`${pb.role}#${i}`);
    }
  });

  const coverage = factCount === 0 ? 1 : citedFactCount / factCount;

  return {
    ok: badRefs.length === 0 && orphanBlocks.length === 0,
    badRefs,
    orphanBlocks,
    coverage,
  };
}

/** 点凭据回原料：返回被高亮的块 */
export function resolveCitation(
  material: Material,
  blockId: string,
) {
  return material.blocks.find((b) => b.id === blockId) ?? null;
}
