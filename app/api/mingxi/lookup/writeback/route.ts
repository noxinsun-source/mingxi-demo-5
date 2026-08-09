/**
 * POST /api/mingxi/lookup/writeback
 * 人批准后把外查卡写回当前逻辑链
 */
import { NextResponse } from "next/server";
import { getThinkSession, putThinkSession } from "@/lib/mingxi/web/agent-sessions";
import { reviewLookup, canWriteBack } from "@/lib/mingxi/engine/lookup";
import type { LookupCard } from "@/lib/mingxi/types";
import { lineToLogicGraph } from "@/lib/mingxi/web/think-pipeline";
import { createRegistry, execute } from "@/lib/mingxi/agent";
import { createTrace } from "@/lib/mingxi/agent/trace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      card?: LookupCard;
      parentNodeId?: string;
      approved?: boolean;
    };
    const sessionId = String(body.sessionId || "");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const session = getThinkSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "session expired" }, { status: 404 });
    }

    let card = body.card;
    if (!card) {
      card = session.agent.state.lookups[session.agent.state.lookups.length - 1];
    }
    if (!card) {
      return NextResponse.json({ error: "no lookup card" }, { status: 400 });
    }

    const approved = body.approved !== false;
    const reviewed = reviewLookup(card, approved ? "approve" : "reject");
    if (!approved) {
      putThinkSession({
        ...session,
        agent: session.agent,
      });
      return NextResponse.json({
        ok: true,
        rejected: true,
        card: reviewed,
      });
    }

    if (!canWriteBack(reviewed)) {
      return NextResponse.json(
        { error: "未批准，拒绝写回", card: reviewed },
        { status: 403 },
      );
    }

    const parentNodeId =
      body.parentNodeId ||
      session.agent.state.line?.nodes.find((n) => n.level === 1)?.id ||
      session.proposedLine?.nodes.find((n) => n.level === 1)?.id;

    if (!parentNodeId || !session.agent.state.line) {
      return NextResponse.json(
        { error: "当前无逻辑链可写回；请先梳一条逻辑线再批准外查" },
        { status: 422 },
      );
    }

    const registry = createRegistry();
    const { ctx, results } = execute(
      [
        {
          tool: "write_back_lookup",
          input: {
            card: reviewed,
            parentNodeId,
            approved: true,
          },
          why: "人批准写回",
        },
      ],
      {
        materials: session.agent.state.materials,
        store: session.agent.state.store,
        line: session.agent.state.line,
        now: session.agent.state.now,
        trace: createTrace(`wb_${Date.now()}`, session.agent.state.now),
      },
      registry,
    );

    if (ctx.line) session.agent.state.line = ctx.line;
    session.agent.state.lookups = session.agent.state.lookups.map((c) =>
      c.id === reviewed.id ? { ...reviewed, status: "approved" as const } : c,
    );
    session.proposedLine = ctx.line ?? session.proposedLine;
    putThinkSession(session);

    const line = ctx.line || session.proposedLine;
    const graph = line
      ? lineToLogicGraph(line, session.citations, session.utterance)
      : { nodes: [], edges: [] };

    return NextResponse.json({
      ok: true,
      card: { ...reviewed, status: "approved" },
      logicLine: graph,
      summary: results[0]?.result.summary,
      harness: {
        tools: ["write_back_lookup"],
        steps: results.map((r) => ({
          tool: r.tool,
          summary: r.result.summary,
          status: "ok",
        })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
