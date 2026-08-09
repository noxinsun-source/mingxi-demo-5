import { NextResponse } from "next/server";
import { getThinkSession, putThinkSession } from "@/lib/mingxi/web/agent-sessions";
import { lineToLogicGraph } from "@/lib/mingxi/web/think-pipeline";
import { appendSignals, signalFromAngle } from "@/lib/mingxi/web/profile-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      pendingId?: string;
    };
    const sessionId = String(body.sessionId || "");
    const pendingId = String(body.pendingId || "");
    const session = getThinkSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "session expired" }, { status: 404 });
    }
    const pid = pendingId || session.pendingId;
    if (!pid) {
      return NextResponse.json({ error: "no pending approval" }, { status: 400 });
    }

    session.agent.approve(pid);
    const line = session.agent.state.line ?? session.proposedLine;
    if (!line) {
      return NextResponse.json({ error: "no line after approve" }, { status: 500 });
    }

    appendSignals([signalFromAngle(line.angle.order)]);

    session.proposedLine = line;
    session.pendingId = null;
    putThinkSession(session);

    const graph = lineToLogicGraph(line, session.citations, session.utterance);
    return NextResponse.json({
      ok: true,
      status: "active",
      angle: line.angle,
      diff: line.diff ?? null,
      logicLine: { nodes: graph.nodes, edges: graph.edges },
      lineVersion: line.version,
      pending: null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
