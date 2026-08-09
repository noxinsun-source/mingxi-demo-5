import { NextResponse } from "next/server";
import { getThinkSession, putThinkSession, deleteThinkSession } from "@/lib/mingxi/web/agent-sessions";
import { appendSignals, signalFromReject } from "@/lib/mingxi/web/profile-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      pendingId?: string;
    };
    const sessionId = String(body.sessionId || "");
    const session = getThinkSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "session expired" }, { status: 404 });
    }
    const pid = String(body.pendingId || session.pendingId || "");
    if (pid) session.agent.reject(pid);
    appendSignals([signalFromReject(`用户放弃重排：${session.utterance.slice(0, 40)}`)]);
    session.pendingId = null;
    putThinkSession(session);
    deleteThinkSession(sessionId);
    return NextResponse.json({ ok: true, status: "rejected", pending: null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
