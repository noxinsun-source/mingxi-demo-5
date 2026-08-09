/**
 * A5 · Live 外查：用真实 web_search / web_read 结果拼 LookupCard
 * 与 Replay 引擎并存；产品路径优先 Live，无命中再降级 Replay。
 */
import type { LookupCard, LookupFinding } from "../types.ts";
import { shortHash } from "./hash.ts";
import type { WebReadResult, WebSearchHit } from "../agent/tools/web-tools.ts";

function hostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

export function buildLiveLookupCard(input: {
  question: string;
  hits: WebSearchHit[];
  pages?: WebReadResult[];
}): LookupCard {
  const q = (input.question ?? "").trim();
  const pageByUrl = new Map((input.pages || []).map((p) => [p.url, p]));
  const findings: LookupFinding[] = [];

  for (const hit of input.hits.slice(0, 6)) {
    if (!hit.url) continue;
    const page = pageByUrl.get(hit.url);
    const excerpt =
      (page?.markdown || "").replace(/\s+/g, " ").trim().slice(0, 220) ||
      (hit.snippet || "").replace(/\s+/g, " ").trim().slice(0, 220);
    const claim = excerpt
      ? `${hit.title || hostName(hit.url)}：${excerpt}`
      : hit.title || hit.url;
    findings.push({
      claim,
      sourceUrl: hit.url,
      sourceName: hostName(hit.url),
      publishedAt: new Date().toISOString().slice(0, 10),
      reliability: /gov|edu|官方|公告/i.test(hit.url + hit.title) ? "官方" : "媒体",
    });
  }

  if (!findings.length) {
    return {
      id: `lk_live_${shortHash(q)}`,
      question: q,
      queries: [q],
      findings: [],
      conflicts: [],
      status: "no_result",
      fallbackAdvice: [
        "实时搜索没有读到可靠公开页。",
        "可换关键词、换官方域名，或先用手机端捕获后再梳。",
      ],
      mode: "Live",
    };
  }

  return {
    id: `lk_live_${shortHash(q + findings[0].sourceUrl)}`,
    question: q,
    queries: [q],
    findings,
    conflicts: [],
    status: "awaiting_review",
    mode: "Live",
  };
}

/** 合并 Live 证据与 Replay 卡（冲突/结构以 Replay 为辅，证据以 Live 为主） */
export function mergeLookupCards(live: LookupCard, replay: LookupCard): LookupCard {
  if (live.findings.length === 0) {
    return { ...replay, mode: replay.mode || "Replay" };
  }
  const seen = new Set(live.findings.map((f) => f.sourceUrl || f.claim));
  const extra = replay.findings.filter((f) => !seen.has(f.sourceUrl || f.claim));
  return {
    ...live,
    findings: [...live.findings, ...extra].slice(0, 8),
    conflicts: [...live.conflicts, ...replay.conflicts],
    queries: Array.from(new Set([...live.queries, ...replay.queries])),
    status: "awaiting_review",
    mode: "Live",
  };
}
