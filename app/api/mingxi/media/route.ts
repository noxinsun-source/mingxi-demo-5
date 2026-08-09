import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { NextResponse } from "next/server";
import { resolveSafeMediaPath } from "@/lib/mingxi/web/library-data";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rel = searchParams.get("path");
  if (!rel) {
    return NextResponse.json({ error: "missing path" }, { status: 400 });
  }
  const abs = resolveSafeMediaPath(rel);
  if (!abs) {
    return NextResponse.json({ error: "forbidden or missing" }, { status: 404 });
  }
  const buf = readFileSync(abs);
  const ext = extname(abs).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const inline = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".html", ".htm", ".txt", ".md", ".markdown"].includes(
    ext,
  );
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(
        abs.split("/").pop() || "file",
      )}"`,
    },
  });
}
