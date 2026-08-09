/**
 * POST /api/mingxi/capture
 * 灵光捕获闭环：信封 → 网页阅读 → OCR+VLM → 打标 → 活知识库
 */
import { NextResponse } from "next/server";
import { runCapturePipeline } from "@/lib/mingxi/pipeline/capture-loop";
import type { CaptureEnvelope } from "@/lib/mingxi/multimodal/types";
import { loadMingxiEnv } from "@/lib/mingxi/llm/env";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  loadMingxiEnv();
  try {
    const body = (await request.json()) as {
      envelope?: CaptureEnvelope;
      enrichVision?: boolean;
      tag?: boolean;
      persist?: boolean;
      /** 快捷：只传 url / text / imagePath */
      url?: string;
      text?: string;
      imagePath?: string;
      title?: string;
      purposeLabel?: CaptureEnvelope["purposeLabel"] | "待定";
    };

    let envelope = body.envelope;
    if (!envelope) {
      if (body.url) {
        envelope = {
          channel: "url_fetch",
          kind: "webpage",
          primary: { uri: body.url },
          titleHint: body.title,
          seedText: body.text,
          purposeLabel: body.purposeLabel,
        };
      } else if (body.imagePath) {
        envelope = {
          channel: "phone_floatball",
          kind: "screenshot",
          primary: { uri: body.imagePath, mime: "image/png" },
          titleHint: body.title,
          seedText: body.text,
          purposeLabel: body.purposeLabel,
        };
      } else if (body.text) {
        envelope = {
          channel: "paste_text",
          kind: "plain_text",
          seedText: body.text,
          titleHint: body.title || "粘贴笔记",
          purposeLabel: body.purposeLabel,
        };
      }
    }

    if (!envelope) {
      return NextResponse.json(
        {
          ok: false,
          error: "需要 envelope，或 url / imagePath / text 之一",
        },
        { status: 400 },
      );
    }

    const result = await runCapturePipeline(envelope, {
      enrichVision: body.enrichVision !== false,
      tag: body.tag !== false,
      persist: body.persist !== false,
    });

    return NextResponse.json({
      ok: true,
      note: result.note,
      materialId: result.material.id,
      mediaId: result.media.id,
      steps: result.steps,
      warnings: result.warnings,
      texts: result.media.texts.map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text.slice(0, 800),
        source: t.source,
      })),
      images: result.media.images.map((i) => ({
        id: i.id,
        role: i.role,
        uri: i.uri,
        caption: i.caption,
        ocrTextIds: i.ocrTextIds,
      })),
      domainPath: result.note.domainPath,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/mingxi/capture",
    description: "灵光捕获闭环：规范化 → OCR+VLM → 打标 → 活知识库",
    examples: [
      { url: "https://example.com/article", title: "示例网页" },
      { imagePath: "data/mingxi/real/samples/xhs-screenshots/demo.png" },
      { text: "一段粘贴文字", purposeLabel: "资料收藏" },
      {
        envelope: {
          channel: "phone_floatball",
          kind: "screenshot",
          primary: { uri: "..." },
          floatBall: [],
        },
      },
    ],
  });
}
