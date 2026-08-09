/**
 * DeepSeek OpenAI 兼容客户端
 *
 * VPN 开着时实测 api.deepseek.com 可通（~1.5s）。
 * 国内网络通常直连即可；若 VPN 把国内流量也劫持导致失败，再考虑分流。
 */
import { loadMingxiEnv } from "./env.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface FunctionToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface DeepseekChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  model: string;
  raw: unknown;
}

function config() {
  loadMingxiEnv();
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("缺少 DEEPSEEK_API_KEY（写在项目根 .env）");
  return {
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
  };
}

export async function deepseekChat(input: {
  messages: ChatMessage[];
  tools?: FunctionToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
}): Promise<DeepseekChatResult> {
  const { apiKey, baseUrl, model } = config();
  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 1200,
  };
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
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  return {
    content: msg?.content ?? null,
    toolCalls: msg?.tool_calls ?? [],
    model: json.model ?? model,
    raw: json,
  };
}

export async function pingDeepseek(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await deepseekChat({
      messages: [{ role: "user", content: "只回复：联通OK" }],
      maxTokens: 16,
      toolChoice: "none",
    });
    return { ok: true, detail: `${r.model} → ${r.content}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
