/** 把长文本切成可凭据回点的块 */
import type { IngestBlock } from "./types.ts";

export function chunkText(
  text: string,
  opt: { maxLen?: number; kind?: IngestBlock["kind"]; page?: number } = {},
): IngestBlock[] {
  const maxLen = opt.maxLen ?? 280;
  const kind = opt.kind ?? "正文";
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return [];

  const paras = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+\n/g, "\n").trim())
    .filter(Boolean);

  const blocks: IngestBlock[] = [];
  let cursor = 0;
  const page = opt.page ?? 1;

  for (const para of paras) {
    if (para.length <= maxLen) {
      blocks.push({
        text: para,
        kind: blocks.length === 0 && para.length < 80 ? "标题" : kind,
        locator: opt.page !== undefined
          ? { type: "page", page }
          : { type: "span", start: cursor, end: cursor + para.length },
      });
      cursor += para.length + 2;
      continue;
    }
    let i = 0;
    while (i < para.length) {
      const slice = para.slice(i, i + maxLen);
      blocks.push({
        text: slice,
        kind,
        locator: opt.page !== undefined
          ? { type: "page", page }
          : { type: "span", start: cursor + i, end: cursor + i + slice.length },
      });
      i += maxLen;
    }
    cursor += para.length + 2;
  }
  return blocks;
}

export function guessKind(uri: string): import("./types.ts").IngestKind {
  const u = uri.toLowerCase();
  if (/^https?:\/\//.test(u)) {
    if (/\.(pdf)(\?|$)/.test(u)) return "pdf";
    if (/\.(docx?)(\?|$)/.test(u)) return "docx";
    if (/\.(pptx?)(\?|$)/.test(u)) return "pptx";
    if (/\.(mp3|wav|m4a|aac|flac)(\?|$)/.test(u)) return "audio";
    if (/\.(mp4|mov|webm|mkv)(\?|$)/.test(u) || /bilibili\.com|youtube\.com|youtu\.be/.test(u)) {
      return "video";
    }
    return "web";
  }
  if (u.endsWith(".pdf")) return "pdf";
  if (u.endsWith(".docx") || u.endsWith(".doc")) return "docx";
  if (u.endsWith(".pptx") || u.endsWith(".ppt")) return "pptx";
  if (/\.(mp3|wav|m4a|aac|flac)$/.test(u)) return "audio";
  if (/\.(mp4|mov|webm|mkv)$/.test(u)) return "video";
  if (/\.(txt|md)$/.test(u)) return "text";
  return "text";
}
