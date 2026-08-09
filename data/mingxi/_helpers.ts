/**
 * 明晰 · 数据集构建辅助
 *
 * 规范数据以 TypeScript 模块为准（可类型检查、浏览器与 Node 同构可运行）。
 * `scripts/mingxi/export-dataset.mts` 可导出等价 JSON。
 */
import type {
  BlockKind,
  Locator,
  Material,
  Purpose,
  PurposeLabel,
  SourceBlock,
} from "../../lib/mingxi/types.ts";
import { PURPOSE_TRACK } from "../../lib/mingxi/types.ts";

/* 定位器 ---------------------------------------------------------- */

export const span = (start: number, end: number): Locator => ({
  type: "span",
  start,
  end,
});

export const page = (p: number): Locator => ({ type: "page", page: p });

export const bbox = (
  x: number,
  y: number,
  w: number,
  h: number,
): Locator => ({ type: "bbox", bbox: [x, y, w, h] });

export const tc = (from: number, to: number): Locator => ({
  type: "timecode",
  seconds: [from, to],
});

/* 块 -------------------------------------------------------------- */

export function b(
  id: string,
  kind: BlockKind,
  text: string,
  opt: Partial<Omit<SourceBlock, "id" | "kind" | "text">> = {},
): SourceBlock {
  return {
    id,
    kind,
    text,
    locator: opt.locator ?? span(0, text.length),
    ...opt,
  };
}

/* 用途 ------------------------------------------------------------ */

export function purpose(
  label: PurposeLabel,
  opt: Partial<Omit<Purpose, "label" | "track">> = {},
): Purpose {
  return {
    track: PURPOSE_TRACK[label],
    label,
    declaredBy: opt.declaredBy ?? "human",
    ...opt,
  };
}

/* 原料 ------------------------------------------------------------ */

export type MaterialInput = Omit<Material, "immutable" | "layers"> & {
  layers?: Partial<Material["layers"]>;
};

export function mat(input: MaterialInput): Material {
  const visibleText =
    input.layers?.visibleText ?? input.blocks.map((x) => x.text).join("\n");
  return {
    ...input,
    layers: {
      visibleText,
      fullText: input.layers?.fullText,
      fullTextStatus: input.layers?.fullTextStatus ?? "ok",
      snapshot: input.layers?.snapshot,
    },
    immutable: true,
  };
}
