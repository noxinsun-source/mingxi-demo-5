/**
 * GET  /api/mingxi/annotate — 人校批次 + 词表
 * POST /api/mingxi/annotate — 保存人校结果到仓库（Agent 可直接读取）
 */
import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const ROOT = process.cwd();
const BATCH = path.join(ROOT, "data/mingxi/eval/human-calibrate/batch-25.json");
const LATEST = path.join(ROOT, "data/mingxi/eval/human-calibrate/latest.json");
const POLARITY = path.join(ROOT, "data/mingxi/eval/vocab/polarity.json");
const STANCE = path.join(ROOT, "data/mingxi/eval/vocab/stance.json");
const DOMAIN = path.join(ROOT, "data/mingxi/eval/vocab/domain-backbone.json");

async function readJson(p: string) {
  return JSON.parse(await readFile(p, "utf8"));
}

export async function GET() {
  try {
    const [batch, polarity, stance, domain] = await Promise.all([
      readJson(BATCH),
      readJson(POLARITY),
      readJson(STANCE),
      readJson(DOMAIN),
    ]);
    let saved: unknown = null;
    try {
      saved = await readJson(LATEST);
    } catch {
      /* none yet */
    }
    return NextResponse.json({
      ok: true,
      batch,
      vocab: { polarity, stance, domain },
      saved,
      savePath: "data/mingxi/eval/human-calibrate/latest.json",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      annotator?: string;
      notes?: string;
      labels?: Array<{
        cardId: string;
        domainPath: string[];
        polarity: string;
        stance: string;
        unsure?: boolean;
        comment?: string;
      }>;
    };
    const labels = Array.isArray(body.labels) ? body.labels : [];
    if (!labels.length) {
      return NextResponse.json({ error: "labels empty" }, { status: 400 });
    }

    const done = labels.filter(
      (l) =>
        l.cardId &&
        Array.isArray(l.domainPath) &&
        l.domainPath.length >= 2 &&
        l.polarity &&
        l.stance,
    );

    const payload = {
      id: `human-calibrate-${new Date().toISOString().slice(0, 10)}`,
      savedAt: new Date().toISOString(),
      annotator: body.annotator || "user",
      notes: body.notes || "",
      schemaVersion: "1.0",
      fields: ["domainPath", "polarity", "stance"],
      totalInBatch: 25,
      labeled: done.length,
      complete: done.length >= 20,
      labels: done,
      rawCount: labels.length,
    };

    await mkdir(path.dirname(LATEST), { recursive: true });
    await writeFile(LATEST, JSON.stringify(payload, null, 2), "utf8");

    // 同时落一份带时间戳的备份
    const stamp = path.join(
      path.dirname(LATEST),
      `saved-${payload.savedAt.replace(/[:.]/g, "-")}.json`,
    );
    await writeFile(stamp, JSON.stringify(payload, null, 2), "utf8");

    return NextResponse.json({
      ok: true,
      savedAt: payload.savedAt,
      labeled: payload.labeled,
      complete: payload.complete,
      path: "data/mingxi/eval/human-calibrate/latest.json",
      message:
        payload.labeled >= 20
          ? "已写入仓库。回到对话跟我说「人校已保存」，我就能读 latest.json。"
          : `已保存 ${payload.labeled} 条；建议至少标满 20 条。`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
