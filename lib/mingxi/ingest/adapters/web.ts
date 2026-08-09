/**
 * 网页 → 快照文档（Jina Reader）
 * VPN 开着实测可通；国内也可直连 r.jina.ai
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chunkText } from "../chunk.ts";
import type { IngestArtifact, IngestSource } from "../types.ts";

function shortId(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `web_${Math.abs(h).toString(36)}`;
}

export async function ingestWeb(
  source: IngestSource,
  opt: { snapshotDir?: string } = {},
): Promise<IngestArtifact> {
  const url = source.uri;
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`网页摄入需要 http(s) URL：${url}`);
  }

  const endpoint = `https://r.jina.ai/${url}`;
  const res = await fetch(endpoint, {
    headers: { Accept: "text/markdown", "User-Agent": "mingxi-ingest/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Jina Reader HTTP ${res.status}：${url}`);
  }
  const md = await res.text();
  const titleMatch = md.match(/^Title:\s*(.+)$/m);
  const title = source.titleHint ?? titleMatch?.[1]?.trim() ?? url;
  const body = md.replace(/^[\s\S]*?Markdown Content:\s*/i, "").trim() || md;
  const id = shortId(url);
  const capturedAt = new Date().toISOString();

  const dir = resolve(opt.snapshotDir ?? "data/mingxi/snapshots");
  mkdirSync(dir, { recursive: true });
  const snapshotPath = resolve(dir, `${id}.md`);
  writeFileSync(
    snapshotPath,
    `# ${title}\n\n> source: ${url}\n> captured: ${capturedAt}\n> provider: jina-reader\n\n${body}\n`,
    "utf8",
  );

  return {
    id,
    kind: "web",
    title,
    sourceUri: url,
    provider: "jina-reader",
    capturedAt,
    fullText: body,
    snapshotPath,
    blocks: chunkText(body.slice(0, 12_000), { kind: "正文" }),
    meta: { reader: "r.jina.ai" },
    warnings: body.length < 40 ? ["网页正文过短，可能被登录墙或反爬拦截"] : [],
  };
}
