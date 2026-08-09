import { NextResponse } from "next/server";
import { getLibraryNote } from "@/lib/mingxi/web/library-data";
import { libraryNotesToMaterials } from "@/lib/mingxi/web/think-pipeline";
import {
  confirmPurpose,
  organizeWithConfirm,
  NeedsConfirmError,
  redlineStanceOk,
  type IntentAgentCard,
} from "@/lib/mingxi/intent/agent-core";
import type { PurposeLabel } from "@/lib/mingxi/types";
import { normalizePurposeLabel } from "@/lib/mingxi/types";
import { appendSignals, signalFromPurposeChange } from "@/lib/mingxi/web/profile-store";

export const runtime = "nodejs";

function noteToCard(noteId: string, purpose?: string): IntentAgentCard | null {
  const n = getLibraryNote(noteId);
  if (!n) return null;
  const label =
    purpose === "待定"
      ? ("资料收藏" as PurposeLabel)
      : normalizePurposeLabel(purpose || n.purposeLabel);
  return {
    id: n.id,
    title: n.title,
    summary: n.summary,
    modality: n.modality,
    fullTextPreview: n.preview,
    blocks: [{ text: n.preview || n.summary }],
    knowledgePath: n.domainPath,
    purposeLabel: label,
    purposeDeclaredBy: "ai_suggested",
    utility: {
      purposeLabel: label,
      casePolarity:
        n.polarity === "negative_caution"
          ? "negative"
          : n.polarity === "positive_exemplar"
            ? "positive"
            : "neutral",
      functionalForm: n.functionalTypes[0] || "clip",
      stance: (n.stance as "imitate" | "do_not_imitate_failure_path" | "quote_only" | "transform_ok") ||
        "transform_ok",
      userGoalText: n.userGoals.join(","),
      declaredBy: "ai_suggested",
    },
    intentEnvelope: {
      schemaVersion: "3.0",
      knowledgeDomain: [
        {
          id: n.domainPath.join("."),
          label: n.domainPath[n.domainPath.length - 1] || "未分类",
          path: n.domainPath.length ? n.domainPath : ["未分类"],
          confidence: 0.8,
        },
      ],
      functionalTypes: n.functionalTypes.map((id) => ({
        id: id as "clip",
        confidence: 0.7,
      })),
      polarity: {
        id: (n.polarity as "neutral_observe") || "neutral_observe",
        confidence: 0.8,
        signals: [],
      },
      userGoals: [],
      actionIntents: [],
      stance:
        (n.stance as "transform_ok") || "transform_ok",
      purposeSuggestion: label,
      overallConfidence: 0.8,
      needsReview: false,
      clarifyQuestion: null,
      modelTrace: { source: "organize_api", noteId },
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      noteId?: string;
      purpose?: string;
      confirmOnly?: boolean;
    };
    const noteId = String(body.noteId || "");
    if (!noteId) {
      return NextResponse.json({ error: "noteId required" }, { status: 400 });
    }

    let card = noteToCard(noteId, body.purpose);
    if (!card) {
      return NextResponse.json({ error: "note not found" }, { status: 404 });
    }

    const purpose = (body.purpose
      ? body.purpose === "待定"
        ? "资料收藏"
        : normalizePurposeLabel(body.purpose)
      : (card.purposeLabel as PurposeLabel)) as PurposeLabel;

    card = confirmPurpose(card, purpose);
    const sig = signalFromPurposeChange(purpose);
    if (sig) appendSignals([sig]);

    if (body.confirmOnly) {
      return NextResponse.json({
        ok: true,
        confirmed: true,
        purposeLabel: purpose,
        purposeDeclaredBy: card.purposeDeclaredBy,
      });
    }

    try {
      const { piece, cite } = organizeWithConfirm(card);
      const enrichment = piece.blocks.map((b) => b.text).join("\n");
      const stanceOk = redlineStanceOk(card, enrichment);
      return NextResponse.json({
        ok: true,
        confirmed: true,
        purposeLabel: purpose,
        stanceOk,
        piece: {
          id: piece.id,
          recipe: piece.recipe,
          degraded: piece.degraded,
          blocks: piece.blocks.map((b) => ({
            role: b.role,
            text: b.text,
            citations: b.citations,
            flag: b.flag,
          })),
        },
        citation: cite,
        materialsPreview: libraryNotesToMaterials([getLibraryNote(noteId)!]).map((m) => m.id),
      });
    } catch (err) {
      if (err instanceof NeedsConfirmError) {
        return NextResponse.json({ error: err.message, code: "NeedsConfirm" }, { status: 409 });
      }
      throw err;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
