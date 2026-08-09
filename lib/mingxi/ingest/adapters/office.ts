/**
 * DOCX / PPTX → 文本（unzip 抽 XML，无额外 npm 依赖）
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chunkText } from "../chunk.ts";
import type { IngestArtifact, IngestSource } from "../types.ts";

function unzipList(path: string): string {
  return execFileSync("unzip", ["-l", path], { encoding: "utf8" });
}

function unzipCat(path: string, entry: string): string {
  return execFileSync("unzip", ["-p", path, entry], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<a:t[^>]*>/g, "")
    .replace(/<\/a:t>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:t[^>]*>/g, "")
    .replace(/<\/w:t>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function ingestDocx(
  source: IngestSource,
  opt: { snapshotDir?: string } = {},
): Promise<IngestArtifact> {
  const path = source.uri.replace(/^file:\/\//, "");
  if (!existsSync(path)) throw new Error(`DOCX 不存在：${path}`);
  const xml = unzipCat(path, "word/document.xml");
  const text = xmlToText(xml);
  const id = `docx_${basename(path).replace(/\W+/g, "_").slice(0, 40)}`;
  const title = source.titleHint ?? basename(path);
  const capturedAt = new Date().toISOString();
  const dir = resolve(opt.snapshotDir ?? "data/mingxi/snapshots");
  mkdirSync(dir, { recursive: true });
  const snapshotPath = resolve(dir, `${id}.txt`);
  writeFileSync(snapshotPath, text, "utf8");

  return {
    id,
    kind: "docx",
    title,
    sourceUri: path,
    provider: "unzip-xml",
    capturedAt,
    fullText: text,
    snapshotPath,
    blocks: chunkText(text, { maxLen: 300 }),
    warnings: text.length < 20 ? ["DOCX 抽取出的文本很少"] : [],
  };
}

export async function ingestPptx(
  source: IngestSource,
  opt: { snapshotDir?: string } = {},
): Promise<IngestArtifact> {
  const path = source.uri.replace(/^file:\/\//, "");
  if (!existsSync(path)) throw new Error(`PPTX 不存在：${path}`);
  const listing = unzipList(path);
  const slides = [...listing.matchAll(/ppt\/slides\/slide(\d+)\.xml/g)]
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);

  const parts: string[] = [];
  const blocks = [];
  for (const n of slides.slice(0, 30)) {
    const xml = unzipCat(path, `ppt/slides/slide${n}.xml`);
    const text = xmlToText(xml);
    if (!text) continue;
    parts.push(`## 幻灯片 ${n}\n${text}`);
    blocks.push(...chunkText(text, { page: n, maxLen: 240, kind: "要点" }));
  }

  const fullText = parts.join("\n\n");
  const id = `pptx_${basename(path).replace(/\W+/g, "_").slice(0, 40)}`;
  const title = source.titleHint ?? basename(path);
  const capturedAt = new Date().toISOString();
  const dir = resolve(opt.snapshotDir ?? "data/mingxi/snapshots");
  mkdirSync(dir, { recursive: true });
  const snapshotPath = resolve(dir, `${id}.txt`);
  writeFileSync(snapshotPath, fullText, "utf8");

  return {
    id,
    kind: "pptx",
    title,
    sourceUri: path,
    provider: "unzip-xml",
    capturedAt,
    fullText,
    snapshotPath,
    blocks,
    meta: { slides: slides.length },
    warnings: slides.length === 0 ? ["未找到幻灯片 XML"] : [],
  };
}
