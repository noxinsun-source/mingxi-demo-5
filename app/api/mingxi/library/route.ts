import { NextResponse } from "next/server";
import { loadMergedLibrary, loadLiveNotes } from "@/lib/mingxi/web/live-library";
import { loadSilverLibrary } from "@/lib/mingxi/web/library-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const purpose = searchParams.get("purpose");
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const id = searchParams.get("id");
  const source = searchParams.get("source"); // silver | live | merged

  let notes =
    source === "silver"
      ? loadSilverLibrary()
      : source === "live"
        ? loadLiveNotes()
        : loadMergedLibrary();
  const debug = searchParams.get("debug") === "1";
  if (id) {
    const one = notes.find((n) => n.id === id);
    return NextResponse.json({ note: one ?? null, count: one ? 1 : 0 });
  }
  if (purpose && purpose !== "全部") {
    notes = notes.filter((n) => n.purposeLabel === purpose);
  }
  if (q) {
    notes = notes.filter((n) => {
      const blob = `${n.title} ${n.summary} ${n.preview} ${n.domainPath.join(" ")} ${n.tags.join(" ")}`.toLowerCase();
      return blob.includes(q);
    });
  }

  const purposes = Array.from(
    notes.reduce((m, n) => {
      m.set(n.purposeLabel, (m.get(n.purposeLabel) || 0) + 1);
      return m;
    }, new Map<string, number>()),
  );

  const liveCount = loadLiveNotes().length;
  return NextResponse.json({
    version: source === "silver" ? "silver-library" : "merged-library",
    count: notes.length,
    liveCount,
    silverCount: loadSilverLibrary().length,
    purposes: Object.fromEntries(purposes),
    notes,
    ...(debug ? { cwd: process.cwd() } : {}),
  });
}
