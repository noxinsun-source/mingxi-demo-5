/**
 * GET/POST /api/mingxi/purpose
 * 待定笔记 → 用途候选；人确认后回写活库 / pi note / purpose-prior
 */
import { NextResponse } from "next/server";
import {
  PURPOSE_VOCAB,
  confirmNotePurpose,
  isPurposePending,
  purposeCandidatesForNoteId,
} from "@/lib/mingxi/web/purpose-confirm";
import { loadMingxiEnv } from "@/lib/mingxi/llm/env";

export const runtime = "nodejs";

function isPurposeInVocab(value: unknown): value is (typeof PURPOSE_VOCAB)[number] {
  return (
    typeof value === "string" &&
    (PURPOSE_VOCAB as readonly string[]).includes(value.trim())
  );
}

function isReadOnlyStorageError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  if (code === "EPERM" || code === "EACCES" || code === "EROFS") return true;
  const message = error instanceof Error ? error.message : String(error || "");
  return /operation not permitted|permission denied|read-?only|not permitted|\bEROFS\b|\bEACCES\b|\bEPERM\b/i.test(
    message,
  );
}

function candidatesUnavailable() {
  return NextResponse.json(
    {
      ok: false,
      code: "PURPOSE_CANDIDATES_UNAVAILABLE",
      error: "暂时无法生成用途建议",
      retryable: true,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  loadMingxiEnv();
  try {
    const { searchParams } = new URL(request.url);
    const noteId = String(searchParams.get("noteId") || "").trim();
    if (!noteId) {
      return NextResponse.json(
        { ok: false, code: "NOTE_ID_REQUIRED", error: "缺少笔记标识" },
        { status: 400 },
      );
    }

    const pack = purposeCandidatesForNoteId(noteId);
    if (!pack.note) {
      return NextResponse.json(
        { ok: false, code: "NOTE_NOT_FOUND", error: "没有找到这条笔记" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      noteId: pack.note.id,
      title: pack.note.title,
      purposeLabel: pack.note.purposeLabel,
      pending: pack.pending,
      candidates: pack.candidates,
      vocab: pack.vocab,
    });
  } catch {
    return candidatesUnavailable();
  }
}

export async function POST(request: Request) {
  loadMingxiEnv();
  try {
    const body = (await request.json()) as {
      noteId?: string;
      purpose?: string;
      action?: "confirm" | "candidates";
    };
    const noteId = String(body.noteId || "").trim();
    if (!noteId) {
      return NextResponse.json(
        { ok: false, code: "NOTE_ID_REQUIRED", error: "缺少笔记标识" },
        { status: 400 },
      );
    }

    if (body.action === "candidates") {
      const pack = purposeCandidatesForNoteId(noteId);
      if (!pack.note) {
        return NextResponse.json(
          { ok: false, code: "NOTE_NOT_FOUND", error: "没有找到这条笔记" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        noteId: pack.note.id,
        purposeLabel: pack.note.purposeLabel,
        pending: pack.pending,
        candidates: pack.candidates,
        vocab: pack.vocab,
      });
    }

    const purpose = String(body.purpose || "").trim();
    if (isPurposePending(purpose) || !isPurposeInVocab(purpose)) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_PURPOSE",
          error: "请从用途词表中选择一个具体用途",
        },
        { status: 400 },
      );
    }

    const result = confirmNotePurpose(noteId, purpose);
    if (!result.ok) {
      const noteMissing = result.error === "note not found";
      return NextResponse.json(
        {
          ok: false,
          code: noteMissing ? "NOTE_NOT_FOUND" : "PURPOSE_CONFIRM_REJECTED",
          error: noteMissing ? "没有找到这条笔记" : "暂时无法确认这个用途",
        },
        { status: noteMissing ? 404 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      confirmed: true,
      purposeLabel: result.purposeLabel,
      purposeStatus: result.purposeStatus,
      wrotePiNote: result.wrotePiNote,
      note: {
        id: result.note.id,
        title: result.note.title,
        purposeLabel: result.note.purposeLabel,
        domainPath: result.note.domainPath,
        summary: result.note.summary,
      },
      vocab: PURPOSE_VOCAB,
    });
  } catch (e) {
    if (isReadOnlyStorageError(e)) {
      return NextResponse.json(
        {
          ok: false,
          code: "STORAGE_READ_ONLY",
          error: "当前环境无法写入服务端存储",
          softFail: true,
          retryable: false,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "PURPOSE_CONFIRM_FAILED",
        error: "暂时无法保存用途",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
