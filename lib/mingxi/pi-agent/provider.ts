/**
 * SiliconFlow（硅基流动）→ pi-ai 自定义 Provider
 *
 * 统一走 openai-completions 协议；文本 + 视觉两个模型都注册进同一个
 * Models 集合，Agent 主循环用 agent 模型，理解工具按需取 vision 模型。
 */
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { loadMingxiEnv } from "../llm/env.ts";

const SF_PROVIDER_ID = "siliconflow";

/** 国内直连：清代理，避免本机 VPN 劫持 api.siliconflow.cn */
function preferDirectChinaNetwork(): void {
  for (const k of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    if (process.env[k]) delete process.env[k];
  }
  const bypass = "api.siliconflow.cn,siliconflow.cn,localhost,127.0.0.1";
  process.env.NO_PROXY = process.env.NO_PROXY
    ? `${process.env.NO_PROXY},${bypass}`
    : bypass;
  process.env.no_proxy = process.env.NO_PROXY;
}

export interface SiliconFlowSetup {
  models: ReturnType<typeof createModels>;
  /** Agent 主循环模型（需支持 function calling） */
  agentModel: Model<"openai-completions">;
  /** 纯文本理解模型 */
  textModel: Model<"openai-completions">;
  /** 图文理解模型 */
  visionModel: Model<"openai-completions">;
  baseUrl: string;
}

function sfModel(input: {
  id: string;
  name: string;
  baseUrl: string;
  vision?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}): Model<"openai-completions"> {
  return {
    id: input.id,
    name: input.name,
    api: "openai-completions",
    provider: SF_PROVIDER_ID,
    baseUrl: input.baseUrl,
    reasoning: false,
    input: input.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: input.contextWindow ?? 32768,
    maxTokens: input.maxTokens ?? 4096,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  };
}

let cached: SiliconFlowSetup | null = null;

/**
 * 创建（或复用）SiliconFlow Models 集合。
 * 环境变量：SILICONFLOW_API_KEY（必需）、SILICONFLOW_BASE_URL、
 * SILICONFLOW_AGENT_MODEL、SILICONFLOW_TEXT_MODEL、SILICONFLOW_VISION_MODEL
 */
export function createSiliconFlowSetup(): SiliconFlowSetup {
  if (cached) return cached;
  loadMingxiEnv();
  preferDirectChinaNetwork();

  const baseUrl = (
    process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1"
  ).replace(/\/$/, "");

  // Agent 主循环需要可靠 function calling；实测 7B 会退化，V3 稳定
  const agentModelId =
    process.env.SILICONFLOW_AGENT_MODEL?.trim() || "deepseek-ai/DeepSeek-V3";
  const textModelId =
    process.env.SILICONFLOW_TEXT_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct";
  const visionModelId =
    process.env.SILICONFLOW_VISION_MODEL?.trim() || "Qwen/Qwen3-VL-32B-Instruct";

  const agentModel = sfModel({
    id: agentModelId,
    name: `${agentModelId}（Agent 规划）`,
    baseUrl,
  });
  const textModel =
    textModelId === agentModelId
      ? agentModel
      : sfModel({ id: textModelId, name: `${textModelId}（文本理解）`, baseUrl });
  const visionModel = sfModel({
    id: visionModelId,
    name: `${visionModelId}（图文理解）`,
    baseUrl,
    vision: true,
    contextWindow: 65536,
    maxTokens: 4096,
  });

  const uniqueModels: Model<"openai-completions">[] = [];
  for (const m of [agentModel, textModel, visionModel]) {
    if (!uniqueModels.some((x) => x.id === m.id)) uniqueModels.push(m);
  }

  const provider = createProvider({
    id: SF_PROVIDER_ID,
    name: "SiliconFlow",
    baseUrl,
    auth: { apiKey: envApiKeyAuth("SiliconFlow", ["SILICONFLOW_API_KEY"]) },
    models: uniqueModels,
    api: openAICompletionsApi(),
  });

  const models = createModels();
  models.setProvider(provider);

  cached = { models, agentModel, textModel, visionModel, baseUrl };
  return cached;
}

export function hasSiliconFlowKey(): boolean {
  loadMingxiEnv();
  return Boolean(process.env.SILICONFLOW_API_KEY?.trim());
}
