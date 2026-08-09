/**
 * 把真实网络搜索/阅读结果转成可进逻辑链的笔记与原料
 * sourceKind = "web"，与仓库笔记区分
 */
import type { Material } from "../types.ts";
import { PURPOSE_TRACK } from "../types.ts";
import type { LibraryNote } from "./library-data.ts";
import { materialIdFromNoteId } from "./retrieve.ts";
import type { WebReadResult, WebSearchHit } from "../agent/tools/web-tools.ts";

export type CitationSourceKind = "library" | "web";

export function markLibraryNotes(notes: LibraryNote[]): LibraryNote[] {
  return notes.map((n) => ({
    ...n,
    sourceKind: (n.sourceKind || "library") as CitationSourceKind,
    tags: n.tags?.includes("source:library")
      ? n.tags
      : [...(n.tags || []), "source:library"],
  }));
}

function webNoteId(url: string, index: number): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `web_${Math.abs(h).toString(36)}_${index}`;
}

export function webHitsToNotes(
  hits: WebSearchHit[],
  pages: WebReadResult[] = [],
): LibraryNote[] {
  const pageByUrl = new Map(pages.map((p) => [p.url, p]));
  return hits.map((hit, index) => {
    const page = pageByUrl.get(hit.url);
    const body = page?.markdown || hit.snippet || "";
    const id = webNoteId(hit.url, index);
    return {
      id,
      corpusId: id,
      title: page?.title || hit.title || hit.url,
      summary: (hit.snippet || body).replace(/\s+/g, " ").slice(0, 180),
      preview: body.slice(0, 1200) || hit.snippet || hit.url,
      modality: "webpage",
      capturedAt: new Date().toISOString(),
      purposeLabel: "资料收藏",
      polarity: "neutral_observe",
      stance: "observe",
      domainPath: ["网络检索", "公开网页"],
      functionalTypes: ["web_search"],
      userGoals: [],
      theme: page?.title || hit.title,
      imageUrl: null,
      sourceUri: hit.url,
      sourceKind: "web" as const,
      tags: ["source:web", "web-search", page ? "web-read" : "web-hit"],
      media: {
        kind: "link",
        url: hit.url,
        downloadUrl: hit.url,
        label: hit.title || hit.url,
        caption: hit.snippet?.slice(0, 120),
      },
    };
  });
}

export function webNotesToMaterials(notes: LibraryNote[]): Material[] {
  return notes
    .filter((n) => n.sourceKind === "web" || n.tags?.includes("source:web"))
    .map((n) => {
      const text = n.preview || n.summary || n.title;
      return {
        id: materialIdFromNoteId(n.id),
        set: "eval" as const,
        capturedAt: n.capturedAt || new Date().toISOString(),
        modality: "webpage" as const,
        source: {
          kind: "link" as const,
          title: n.title,
          url: n.sourceUri,
          appHint: "web-search",
        },
        layers: {
          visibleText: text.slice(0, 2000),
          fullText: text,
          fullTextStatus: "ok" as const,
        },
        blocks: [
          {
            id: "b1",
            kind: "正文" as const,
            text,
            locator: { type: "span" as const, start: 0, end: text.length },
            polarity: "中立" as const,
            strength: "中" as const,
            topics: ["网络", ...(n.domainPath || [])].slice(0, 4),
          },
          {
            id: "b0",
            kind: "标题" as const,
            text: n.title,
            locator: { type: "span" as const, start: 0, end: n.title.length },
            polarity: "中立" as const,
          },
        ],
        purpose: {
          track: PURPOSE_TRACK["资料收藏"],
          label: "资料收藏" as const,
          declaredBy: "human_confirmed_ai" as const,
          note: "来自联网搜索",
        },
        tags: ["web-search", "source:web", ...(n.tags || [])],
        license: "link-only" as const,
        immutable: true as const,
        storyLine: "learn" as const,
        flags: ["unverified" as const],
      };
    });
}
