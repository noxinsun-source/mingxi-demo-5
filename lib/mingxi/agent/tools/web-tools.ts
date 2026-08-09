/**
 * 网络阅读 / 搜索工具（真实 HTTP）
 * - web_read: Jina Reader r.jina.ai
 * - web_search: AnySearch（若有 key）否则 DuckDuckGo HTML
 */
import type { ToolResult, ToolSpec } from "../tool-registry.ts";
import { loadMingxiEnv } from "../../llm/env.ts";

export interface WebReadResult {
  url: string;
  title: string;
  markdown: string;
  provider: string;
  truncated: boolean;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export async function webReadUrl(url: string): Promise<WebReadResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`需要 http(s) URL：${url}`);
  if (/mp\.weixin\.qq\.com/i.test(url)) {
    throw new Error("微信公众号通常有登录墙，服务端阅读器读不到；请用手机悬浮球截图/存文");
  }
  const endpoint = `https://r.jina.ai/${url}`;
  const res = await fetch(endpoint, {
    headers: { Accept: "text/markdown", "User-Agent": "mingxi-agent/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Jina Reader HTTP ${res.status}`);
  const md = await res.text();
  const titleMatch = md.match(/^Title:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() || url;
  const body = md.replace(/^[\s\S]*?Markdown Content:\s*/i, "").trim() || md;
  const truncated = body.length > 12_000;
  return {
    url,
    title,
    markdown: body.slice(0, 12_000),
    provider: "jina-reader",
    truncated,
  };
}

/** AnySearch MCP JSON-RPC（与 .skills/anysearch CLI 同源） */
async function anysearchToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  loadMingxiEnv();
  const apikey = process.env.ANYSEARCH_API_KEY?.trim();
  const res = await fetch("https://api.anysearch.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Anysearch-Client": "mingxi-agent/1.0",
      ...(apikey ? { Authorization: `Bearer ${apikey}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = (await res.json()) as {
    error?: { message?: string };
    result?: { content?: Array<{ type?: string; text?: string }> };
  };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `AnySearch HTTP ${res.status}`);
  }
  const text = data.result?.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("AnySearch 无文本结果");
  return text;
}

function parseSearchHits(raw: string, maxResults: number): WebSearchHit[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { results?: unknown[] })?.results)
        ? (parsed as { results: unknown[] }).results
        : Array.isArray((parsed as { data?: unknown[] })?.data)
          ? (parsed as { data: unknown[] }).data
          : null;
    if (list) {
      return list
        .map((item) => {
          const r = item as Record<string, unknown>;
          return {
            title: String(r.title || r.name || ""),
            url: String(r.url || r.link || r.href || ""),
            snippet: String(r.snippet || r.content || r.description || "").slice(0, 240),
          };
        })
        .filter((h) => h.url)
        .slice(0, maxResults);
    }
  } catch {
    /* fall through: treat as markdown-ish lines */
  }
  const hits: WebSearchHit[] = [];
  const urlRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(raw)) && hits.length < maxResults) {
    hits.push({ title: m[1], url: m[2], snippet: "" });
  }
  if (!hits.length) {
    const plain = /https?:\/\/\S+/g;
    while ((m = plain.exec(raw)) && hits.length < maxResults) {
      hits.push({ title: m[0], url: m[0], snippet: "" });
    }
  }
  return hits;
}

/** 轻量搜索：AnySearch MCP 优先，否则 DuckDuckGo HTML */
export async function webSearchQuery(
  query: string,
  maxResults = 5,
): Promise<WebSearchHit[]> {
  loadMingxiEnv();
  const q = query.trim();
  if (!q) return [];

  try {
    const text = await anysearchToolCall("search", {
      query: q,
      max_results: maxResults,
    });
    const hits = parseSearchHits(text, maxResults);
    if (hits.length) return hits;
  } catch {
    /* fall through to DDG */
  }

  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      {
        headers: { "User-Agent": "mingxi-agent/1.0" },
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!res.ok) return [];
    const html = await res.text();
    const hits: WebSearchHit[] = [];
    const re =
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < maxResults) {
      let finalUrl = m[1].replace(/&amp;/g, "&");
      try {
        if (finalUrl.includes("uddg=")) {
          finalUrl = decodeURIComponent(finalUrl.split("uddg=")[1].split("&")[0]);
        }
      } catch {
        /* keep */
      }
      hits.push({
        title: m[2].replace(/<[^>]+>/g, "").trim(),
        url: finalUrl,
        snippet: "",
      });
    }
    return hits;
  } catch {
    return [];
  }
}

export const webReadTool: ToolSpec<{ url: string }, { page: WebReadResult }> = {
  name: "web_read",
  title: "阅读公开网页",
  description:
    "用 Jina Reader 拉取公开 URL 的 markdown 正文快照。微信等登录墙会失败并提示悬浮球补齐。",
  humanBoundary: "只读公开页；不绕过登录墙；不自动写入用户笔记除非后续显式入库。",
  requiresApproval: false,
  degradation: "失败时返回错误说明，不编造正文。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string", description: "http(s) URL" } },
    required: ["url"],
  },
  async run(input) {
    try {
      const page = await webReadUrl(String(input.url));
      return {
        ok: true,
        data: { page },
        summary: `已阅读「${page.title}」· ${page.markdown.length} 字 · ${page.provider}`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `阅读失败：${err instanceof Error ? err.message : String(err)}`,
        error: "web_read_failed",
      };
    }
  },
};

export const webSearchTool: ToolSpec<
  { query: string; maxResults?: number },
  { hits: WebSearchHit[] }
> = {
  name: "web_search",
  title: "实时网络搜索",
  description:
    "搜索公开网页（配置 ANYSEARCH_API_KEY 则用 AnySearch，否则 DuckDuckGo）。返回标题/链接/摘要。",
  humanBoundary: "仅检索公开信息；写回知识库需人确认或走 capture 入库。",
  requiresApproval: false,
  degradation: "无结果时明确说明，不编造链接。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索词" },
      maxResults: { type: "number", description: "最多条数，默认 5" },
    },
    required: ["query"],
  },
  async run(input) {
    try {
      const hits = await webSearchQuery(
        String(input.query),
        Number(input.maxResults) || 5,
      );
      return {
        ok: true,
        data: { hits },
        summary: hits.length
          ? `搜到 ${hits.length} 条：${hits[0].title}`
          : "没有搜到可用结果",
      };
    } catch (err) {
      return {
        ok: false,
        summary: `搜索失败：${err instanceof Error ? err.message : String(err)}`,
        error: "web_search_failed",
      };
    }
  },
};

/** 捕获入库工具：跑完整闭环并写回活知识库 */
export const captureIngestTool: ToolSpec<
  { envelope: Record<string, unknown>; enrichVision?: boolean },
  { noteId: string; steps: string[]; title: string }
> = {
  name: "capture_ingest",
  title: "灵光捕获入库闭环",
  description:
    "把捕获信封跑完：网页阅读→规范化→图片 OCR+VLM 双轨文字→领域打标→写入活知识库。",
  humanBoundary: "用途未声明时默认资料收藏；不静默覆盖银标冻结集。",
  requiresApproval: false,
  degradation: "Vision/打标失败时仍保存已有正文与图片，并写 warnings。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      envelope: { type: "object", description: "CaptureEnvelope" },
      enrichVision: { type: "boolean", description: "是否跑 OCR+VLM，默认 true" },
    },
    required: ["envelope"],
  },
  async run(input, ctx) {
    const { runCapturePipeline } = await import("../../pipeline/capture-loop.ts");
    try {
      const r = await runCapturePipeline(input.envelope as never, {
        enrichVision: input.enrichVision !== false,
        persist: true,
      });
      return {
        ok: true,
        data: { noteId: r.note.id, steps: r.steps, title: r.note.title },
        summary: `已入库「${r.note.title}」· ${r.steps.join(" → ")}`,
        patch: { materials: [...ctx.materials, r.material] },
      };
    } catch (err) {
      return {
        ok: false,
        summary: `入库失败：${err instanceof Error ? err.message : String(err)}`,
        error: "capture_failed",
      };
    }
  },
};
