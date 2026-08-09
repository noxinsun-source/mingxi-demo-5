/**
 * 硅基流动 SiliconFlow · OpenAI 兼容客户端
 *
 * 文本：Qwen/Qwen2.5-7B-Instruct 等
 * 多模态默认：Qwen/Qwen3-VL-32B-Instruct（本账号可用最强图文）
 * 旗舰 Qwen3-VL-235B-A22B 在平台存在，但当前 key 返回 Model disabled
 *
 * 国内直连：调用前清掉 HTTP(S)_PROXY，减轻本机 VPN 劫持国内流量。
 */
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { loadMingxiEnv } from "./env.ts";

export interface SfMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<SfContentPart>;
}

export type SfContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

function preferDirectChinaNetwork() {
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

function config() {
  loadMingxiEnv();
  preferDirectChinaNetwork();
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("缺少 SILICONFLOW_API_KEY（写在项目根 .env）");
  return {
    apiKey,
    baseUrl: (process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1").replace(
      /\/$/,
      "",
    ),
    textModel:
      process.env.SILICONFLOW_TEXT_MODEL ?? "Qwen/Qwen2.5-7B-Instruct",
    visionModel:
      process.env.SILICONFLOW_VISION_MODEL ?? "Qwen/Qwen3-VL-32B-Instruct",
  };
}

export function siliconflowModels() {
  const c = config();
  return { textModel: c.textModel, visionModel: c.visionModel, baseUrl: c.baseUrl };
}

export interface SfToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface SfFunctionToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type SfChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<SfContentPart> | null;
  tool_call_id?: string;
  tool_calls?: SfToolCall[];
};

export async function siliconflowChat(input: {
  messages: Array<SfMessage | SfChatMessage>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** OpenAI 兼容 function calling（Agent 规划用） */
  tools?: SfFunctionToolSpec[];
  toolChoice?: "auto" | "none" | "required";
}): Promise<{
  content: string;
  model: string;
  raw: unknown;
  toolCalls: SfToolCall[];
}> {
  const { apiKey, baseUrl, textModel } = config();
  const model =
    input.model ??
    process.env.SILICONFLOW_AGENT_MODEL?.trim() ??
    textModel;
  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 800,
  };
  if (input.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  if (input.tools?.length) {
    body.tools = input.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = input.toolChoice ?? "auto";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SiliconFlow ${res.status}: ${text.slice(0, 400)}`);
  }
  const raw = JSON.parse(text) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: SfToolCall[] };
    }>;
    model?: string;
  };
  const msg = raw.choices?.[0]?.message;
  return {
    content: msg?.content ?? "",
    model: raw.model ?? model,
    raw,
    toolCalls: msg?.tool_calls ?? [],
  };
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** 本地图片 → data URL（给视觉模型） */
export function imageFileToDataUrl(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "image/png";
  const buf = readFileSync(filePath);
  if (buf.length > 8_000_000) return null; // 过大跳过
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function siliconflowVision(input: {
  prompt: string;
  imageDataUrl: string;
  model?: string;
  maxTokens?: number;
}): Promise<{ content: string; model: string }> {
  const { visionModel } = config();
  return siliconflowChat({
    model: input.model ?? visionModel,
    maxTokens: input.maxTokens ?? 900,
    jsonMode: true,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: input.imageDataUrl, detail: "low" } },
          { type: "text", text: input.prompt },
        ],
      },
    ],
  });
}
