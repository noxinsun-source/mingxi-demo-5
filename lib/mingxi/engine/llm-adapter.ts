/**
 * 模型接入口
 *
 * - local-deterministic：评测 / Demo 默认，可复现
 * - remote-model：DeepSeek 等，只负责规划与语义理解；执行仍走 agent 工具层
 *
 * 边界（写死）：
 *   - 不得改写原料
 *   - 不得跳过人审直接写回
 *   - 输出必须能映射回原料块，否则一律标 no-source
 */
import type { AngleSpec, Material, Piece } from "../types.ts";
import { mingxiLlmMode } from "../llm/env.ts";

export interface LlmAdapter {
  name: string;
  mode: "local-deterministic" | "remote-model";
  routePiece?(material: Material): Promise<Piece>;
  parseAngle?(text: string): Promise<AngleSpec>;
}

export const localAdapter: LlmAdapter = {
  name: "mingxi-local",
  mode: "local-deterministic",
};

export const deepseekAdapter: LlmAdapter = {
  name: "deepseek",
  mode: "remote-model",
};

let current: LlmAdapter = localAdapter;

export function setAdapter(adapter: LlmAdapter): void {
  current = adapter;
}

export function getAdapter(): LlmAdapter {
  return current;
}

/** 按 .env 的 MINGXI_LLM_MODE 选择默认适配器 */
export function resolveDefaultAdapter(): LlmAdapter {
  return mingxiLlmMode() === "deepseek" ? deepseekAdapter : localAdapter;
}
