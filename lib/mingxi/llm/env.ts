/**
 * 从仓库根目录加载 .env（不依赖 dotenv 包）
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

function applyEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined && val) process.env[key] = val;
  }
}

export function loadMingxiEnv(cwd = process.cwd()): void {
  if (loaded) return;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    applyEnvFile(resolve(cwd, name));
  }
  // AnySearch skill 本地密钥（不强制进根 .env）
  applyEnvFile(resolve(cwd, ".skills/anysearch/.env"));
}

/**
 * Agent 规划器用哪家模型选工具：
 * - local：规则规划（可复现，默认）
 * - siliconflow：硅基流动（推荐；与 Vision/旁白同一套 key）
 * - deepseek：可选备用纯文本规划
 *
 * 兼容旧值：MINGXI_LLM_MODE=llm → siliconflow
 */
export type MingxiLlmMode = "local" | "siliconflow" | "deepseek";

export function mingxiLlmMode(): MingxiLlmMode {
  loadMingxiEnv();
  const m = (process.env.MINGXI_LLM_MODE ?? "local").toLowerCase().trim();
  if (m === "siliconflow" || m === "sf" || m === "llm" || m === "qwen") {
    return "siliconflow";
  }
  if (m === "deepseek") return "deepseek";
  return "local";
}

export function mingxiUsesLlmPlanner(): boolean {
  return mingxiLlmMode() !== "local";
}
