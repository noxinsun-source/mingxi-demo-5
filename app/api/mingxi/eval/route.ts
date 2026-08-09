/**
 * GET /api/mingxi/eval — 跑冻结 50 题引擎评测（可复现）
 * POST 同 GET（便于前端按钮）
 */
import { NextResponse } from "next/server";
import { runAll } from "@/lib/mingxi/eval/runner";
import { evalTasks } from "@/data/mingxi/tasks";

export const runtime = "nodejs";
export const maxDuration = 60;

function run() {
  const report = runAll(evalTasks);
  const byCapability = Object.entries(report.byCapability).map(([id, v]) => ({
    id,
    total: v.total,
    passed: v.passed,
    passRate: v.total ? v.passed / v.total : 0,
  }));
  return {
    ok: true,
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    passRate: report.passRate,
    byCapability,
    failedTasks: report.results
      .filter((r) => !r.pass)
      .map((r) => ({
        id: r.taskId,
        capability: r.capability,
        reason: (r.reasons || []).join("；"),
      })),
    ranAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    return NextResponse.json(run());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}
