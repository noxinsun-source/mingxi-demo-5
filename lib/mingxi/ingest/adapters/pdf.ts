/**
 * PDF → 文本块（系统 pdftotext / Poppler）
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chunkText } from "../chunk.ts";
import type { IngestArtifact, IngestSource } from "../types.ts";

function which(bin: string): string | null {
  try {
    return execFileSync("which", [bin], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

export async function ingestPdf(
  source: IngestSource,
  opt: { snapshotDir?: string; maxPages?: number } = {},
): Promise<IngestArtifact> {
  const path = source.uri.replace(/^file:\/\//, "");
  if (!existsSync(path)) throw new Error(`PDF 不存在：${path}`);
  const bin = which("pdftotext");
  if (!bin) {
    throw new Error("未找到 pdftotext（brew install poppler）");
  }

  const maxPages = opt.maxPages ?? 15;
  const raw = execFileSync(
    bin,
    ["-f", "1", "-l", String(maxPages), "-layout", path, "-"],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const title =
    source.titleHint ??
    raw.split("\n").map((l) => l.trim()).find((l) => l.length > 5 && l.length < 120) ??
    basename(path);
  const id = `pdf_${basename(path).replace(/\W+/g, "_").slice(0, 40)}`;
  const capturedAt = new Date().toISOString();

  const dir = resolve(opt.snapshotDir ?? "data/mingxi/snapshots");
  mkdirSync(dir, { recursive: true });
  const snapshotPath = resolve(dir, `${id}.txt`);
  writeFileSync(snapshotPath, raw, "utf8");

  // 粗按换页符切页；没有则整份一块块切
  const pages = raw.includes("\f") ? raw.split("\f") : [raw];
  const blocks = pages.flatMap((pageText, i) =>
    chunkText(pageText, { page: i + 1, maxLen: 320 }),
  );

  return {
    id,
    kind: "pdf",
    title,
    sourceUri: path,
    provider: "pdftotext",
    capturedAt,
    fullText: raw,
    snapshotPath,
    blocks: blocks.slice(0, 80),
    meta: { pagesExtracted: Math.min(pages.length, maxPages), maxPages },
    warnings:
      pages.length > maxPages
        ? [`仅抽取前 ${maxPages} 页，完整 PDF 仍保留在 inbox`]
        : [],
  };
}
