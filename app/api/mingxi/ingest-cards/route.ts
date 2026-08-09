import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 统一卡片来源（优先真实公开语料，其次本地 ingest 临时产物）
 *   1. data/mingxi/real/latest-cards.json
 *   2. data/mingxi/snapshots/latest-cards.json
 */
export async function GET() {
  const candidates = [
    resolve(process.cwd(), "data/mingxi/real/latest-cards.json"),
    resolve(process.cwd(), "data/mingxi/snapshots/latest-cards.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const cards = JSON.parse(readFileSync(path, "utf8"));
      return NextResponse.json({
        cards: Array.isArray(cards) ? cards : [],
        source: path.includes("/real/") ? "real-corpus" : "local-snapshots",
        path: path.replace(`${process.cwd()}/`, ""),
      });
    } catch (err) {
      return NextResponse.json(
        { cards: [], error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({ cards: [], source: null });
}
