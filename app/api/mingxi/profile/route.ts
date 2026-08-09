import { NextResponse } from "next/server";
import {
  profileSummary,
  rollbackProfileEntry,
  appendSignals,
  signalFromPurposeChange,
} from "@/lib/mingxi/web/profile-store";

export const runtime = "nodejs";

export async function GET() {
  const s = profileSummary();
  return NextResponse.json({
    ok: true,
    autoLearnedWeek: s.autoLearnedWeek,
    signalCount: s.signalCount,
    active: s.active,
    pending: s.pending,
    negativeConstraints: s.store.negativeConstraints,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "rollback" | "tag_choice";
      entryId?: string;
      purpose?: string;
    };
    if (body.action === "rollback" && body.entryId) {
      const store = rollbackProfileEntry(body.entryId);
      return NextResponse.json({ ok: true, store });
    }
    if (body.action === "tag_choice" && body.purpose) {
      const sig = signalFromPurposeChange(body.purpose);
      if (sig) appendSignals([sig]);
      return NextResponse.json({ ok: true, ...profileSummary() });
    }
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
