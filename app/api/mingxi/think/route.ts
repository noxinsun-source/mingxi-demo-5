import { NextResponse } from "next/server";
import { siliconflowChat } from "@/lib/mingxi/llm/siliconflow";
import {
  lineToLogicGraph,
  templateAnswer,
} from "@/lib/mingxi/web/think-pipeline";
import { runProductTurn, type ProductIntent } from "@/lib/mingxi/web/product-turn";
import {
  getThinkSession,
  newSessionId,
  putThinkSession,
} from "@/lib/mingxi/web/agent-sessions";
import { loadProfileStore } from "@/lib/mingxi/web/profile-store";
import { upsertWorkspaceMemory } from "@/lib/mingxi/web/think-memory";
import { runCapturePipeline } from "@/lib/mingxi/pipeline/capture-loop";
import type { CaptureEnvelope } from "@/lib/mingxi/multimodal/types";
import { loadMingxiEnv } from "@/lib/mingxi/llm/env";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 演示案例默认意图（网页端预填） */
export const DEMO_AGENT_INTENT =
  "把库里关于 Agent 评测与 Skill 落地的避雷和正例，梳成一条可执行的学习逻辑线";

function limitForThinkLevel(level?: string): number {
  if (level === "deep") return 20;
  if (level === "balanced") return 14;
  if (level === "demo") return 12;
  return 10;
}

type AttachmentIn = {
  name?: string;
  size?: number;
  type?: string;
  text?: string;
  dataUrl?: string;
};

async function ingestAttachments(atts: AttachmentIn[]): Promise<{
  warnings: string[];
  noteIds: string[];
  steps: Array<{ tool: string; summary: string; status: string }>;
}> {
  const warnings: string[] = [];
  const noteIds: string[] = [];
  const steps: Array<{ tool: string; summary: string; status: string }> = [];
  if (!atts.length) return { warnings, noteIds, steps };

  const tmpDir = path.join(process.cwd(), "tmp", "mingxi-uploads");
  await mkdir(tmpDir, { recursive: true });

  for (const att of atts.slice(0, 4)) {
    try {
      let envelope: CaptureEnvelope | null = null;
      const mime = att.type || "";
      if (att.text && (!mime || mime.startsWith("text") || /\.(md|txt|json)$/i.test(att.name || ""))) {
        envelope = {
          channel: "paste_text",
          kind: "plain_text",
          seedText: att.text,
          titleHint: att.name || "附件文本",
        };
      } else if (att.dataUrl?.startsWith("data:")) {
        const m = /^data:([^;]+);base64,(.+)$/.exec(att.dataUrl);
        if (!m) {
          warnings.push(`${att.name || "附件"}：无法解析 dataUrl`);
          continue;
        }
        const ext = (m[1].includes("png") && "png") || (m[1].includes("jpeg") || m[1].includes("jpg") ? "jpg" : "bin");
        const filePath = path.join(tmpDir, `${Date.now()}_${(att.name || "img").replace(/[^\w.-]+/g, "_")}.${ext}`);
        await writeFile(filePath, Buffer.from(m[2], "base64"));
        envelope = {
          channel: "phone_floatball",
          kind: "screenshot",
          primary: { uri: filePath, mime: m[1] },
          titleHint: att.name || "上传图片",
          seedText: att.text,
        };
      } else if (att.text) {
        envelope = {
          channel: "paste_text",
          kind: "plain_text",
          seedText: att.text,
          titleHint: att.name || "附件",
        };
      } else {
        warnings.push(`${att.name || "附件"}：缺少 text/dataUrl，已跳过`);
        continue;
      }

      const result = await runCapturePipeline(envelope, {
        enrichVision: Boolean(att.dataUrl),
        tag: true,
        persist: true,
      });
      noteIds.push(result.note.id);
      steps.push({
        tool: "capture_ingest",
        summary: `已入库「${result.note.title}」→ ${result.note.domainPath.join("/")}`,
        status: "ok",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`${att.name || "附件"}：${msg}`);
      steps.push({ tool: "capture_ingest", summary: msg, status: "error" });
    }
  }
  return { warnings, noteIds, steps };
}

export async function POST(request: Request) {
  loadMingxiEnv();
  try {
    const body = (await request.json()) as {
      message?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      demo?: boolean;
      mode?: "agent" | "llm_graph";
      agentMode?: "agent" | "ask" | "plan";
      thinkLevel?: string;
      filter?: "all" | "negative" | "positive";
      sessionId?: string;
      webSearch?: boolean;
      workspaceId?: string;
      workspaceTitle?: string;
      workspaceSubtitle?: string;
      lockedNodeIds?: string[];
      scopeNodeId?: string;
      intentHint?: ProductIntent;
      attachments?: AttachmentIn[];
    };
    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "empty message" }, { status: 400 });
    }

    const agentMode =
      body.agentMode === "ask" || body.agentMode === "plan"
        ? body.agentMode
        : body.mode === "llm_graph"
          ? "ask"
          : "agent";
    const webSearch = Boolean(body.webSearch);
    const lockedNodeIds = Array.isArray(body.lockedNodeIds)
      ? body.lockedNodeIds.map(String)
      : [];
    const scopeNodeId = body.scopeNodeId ? String(body.scopeNodeId) : undefined;

    const store = loadProfileStore();
    const existing = body.sessionId ? getThinkSession(body.sessionId) : null;

    const ingest = await ingestAttachments(body.attachments || []);

    const isDemo =
      Boolean(body.demo) ||
      message === DEMO_AGENT_INTENT ||
      body.thinkLevel === "demo" ||
      Boolean(body.workspaceId?.startsWith("ws-sample"));

    const pipe = await runProductTurn({
      utterance: message,
      store,
      agentMode,
      retrieveLimit: limitForThinkLevel(body.thinkLevel),
      existingAgent: webSearch ? undefined : existing?.agent,
      materials: webSearch ? [] : existing ? existing.agent.state.materials : [],
      webSearch,
      lockedNodeIds,
      scopeNodeId,
      intentHint: body.intentHint,
      // 样例 / Demo：强制本地规则完整梳链，避免 LLM 只召回就停、画布空白
      forceLocalPlan: isDemo && agentMode === "agent" && !webSearch,
    });

    const hits = pipe.citations;
    const sessionId = existing?.id ?? newSessionId();
    const harnessSteps = [...ingest.steps, ...pipe.harnessSteps];

    // Ask / Plan：无逻辑链，仍可返回旁白
    if (agentMode !== "agent") {
      let answer =
        pipe.narration +
        (hits.length
          ? `\n\n### 相关笔记\n${hits
              .slice(0, 8)
              .map((n) => `- **${n.title}** [cite:${n.id}] — ${n.summary.slice(0, 100)}`)
              .join("\n")}`
          : "");
      try {
        const { content, model: used } = await siliconflowChat({
          model:
            process.env.SILICONFLOW_AGENT_MODEL ||
            process.env.SILICONFLOW_TEXT_MODEL ||
            "Qwen/Qwen2.5-7B-Instruct",
          maxTokens: 900,
          temperature: 0.35,
          messages: [
            {
              role: "system",
              content:
                agentMode === "plan"
                  ? "你是明晰 Plan 助手。根据召回笔记与角度草案，用中文列出拟建链步骤，不要假装已改结构。"
                  : "你是明晰 Ask 助手。根据召回笔记回答用户，用 [cite:id] 引用，不要改逻辑图。",
            },
            {
              role: "user",
              content: `用户：${message}\n角度：${pipe.angle.order}\n笔记：\n${hits
                .map((n) => `- ${n.id} ${n.title} ${n.summary.slice(0, 120)}`)
                .join("\n")}`,
            },
          ],
        });
        if (content?.trim()) answer = content.trim();
        putThinkSession({
          id: sessionId,
          agent: pipe.agent,
          citations: hits,
          proposedLine: null,
          pendingId: null,
          utterance: message,
          createdAt: Date.now(),
        });
        return NextResponse.json({
          ok: true,
          fallback: !content?.trim(),
          live: Boolean(content?.trim()),
          answer,
          citations: hits,
          logicLine: { nodes: [], edges: [] },
          angle: pipe.angle,
          pending: null,
          sessionId,
          clarifyingQuestion: pipe.clarifyingQuestion ?? null,
          model: used || pipe.planner,
          pipeline: "agent_harness",
          productIntent: pipe.productIntent,
          lookupCard: pipe.lookupCard,
          decisionCard: pipe.decisionCard,
          ingest: { noteIds: ingest.noteIds, warnings: ingest.warnings },
          harness: {
            intent: pipe.intent,
            planner: pipe.planner,
            narration: pipe.narration,
            steps: harnessSteps,
            trace: pipe.traceLines,
            tools: harnessSteps.map((s) => s.tool),
            webSearchUsed: pipe.webSearchUsed,
          },
          capabilities: {
            webSearch: true,
            librarySearch: true,
            vision: Boolean(process.env.SILICONFLOW_VISION_MODEL),
            tools: [
              "library_retrieve",
              "preview_angle",
              "reline",
              "web_search",
              "web_read",
              "lookup",
              "make_decision_card",
              "capture_ingest",
            ],
            confirmGate: true,
            harness: true,
            lock: true,
            scopeRegen: true,
          },
        });
      } catch {
        putThinkSession({
          id: sessionId,
          agent: pipe.agent,
          citations: hits,
          proposedLine: null,
          pendingId: null,
          utterance: message,
          createdAt: Date.now(),
        });
        return NextResponse.json({
          ok: true,
          fallback: true,
          answer,
          citations: hits,
          logicLine: { nodes: [], edges: [] },
          angle: pipe.angle,
          sessionId,
          productIntent: pipe.productIntent,
          lookupCard: pipe.lookupCard,
          decisionCard: pipe.decisionCard,
          clarifyingQuestion: pipe.clarifyingQuestion ?? null,
          pipeline: "agent_harness",
          harness: {
            intent: pipe.intent,
            planner: pipe.planner,
            narration: pipe.narration,
            steps: harnessSteps,
            trace: pipe.traceLines,
          },
        });
      }
    }

    // lookup / decide：有卡片即可，不一定有线
    if (pipe.productIntent === "lookup" || pipe.productIntent === "decide") {
      putThinkSession({
        id: sessionId,
        agent: pipe.agent,
        citations: hits,
        proposedLine: pipe.line,
        pendingId: pipe.pendingId,
        utterance: message,
        createdAt: existing?.createdAt ?? Date.now(),
      });
      const answer =
        pipe.productIntent === "lookup"
          ? `## 外查卡（${pipe.lookupCard?.mode || "?"}）\n\n${pipe.narration}\n\n${
              pipe.lookupCard?.findings
                ?.map(
                  (f, i) =>
                    `${i + 1}. **${f.claim.slice(0, 120)}**\n   来源：${f.sourceName} · ${f.sourceUrl}`,
                )
                .join("\n") || pipe.lookupCard?.fallbackAdvice?.join("\n") || ""
            }`
          : `## 决断卡\n\n${pipe.narration}\n\n${
              pipe.decisionCard?.refused
                ? `弃权：${pipe.decisionCard.refusedReason}`
                : pipe.decisionCard?.options
                    ?.map(
                      (o, i) =>
                        `${i + 1}. **${o.label}**\n   利：${o.pros.join("；")}\n   弊：${o.cons.join("；")}`,
                    )
                    .join("\n") || ""
            }\n\n未知：${(pipe.decisionCard?.unknowns || []).join("；")}`;

      return NextResponse.json({
        ok: true,
        answer,
        citations: hits,
        logicLine: pipe.line
          ? lineToLogicGraph(pipe.line, hits, message)
          : { nodes: [], edges: [] },
        angle: pipe.angle,
        pending: pipe.awaitingApproval
          ? { sessionId, pendingId: pipe.pendingId, summary: pipe.narration }
          : null,
        sessionId,
        productIntent: pipe.productIntent,
        lookupCard: pipe.lookupCard,
        decisionCard: pipe.decisionCard,
        ingest: { noteIds: ingest.noteIds, warnings: ingest.warnings },
        pipeline: "agent_harness",
        harness: {
          intent: pipe.intent,
          planner: pipe.planner,
          narration: pipe.narration,
          steps: harnessSteps,
          tools: harnessSteps.map((s) => s.tool),
          webSearchUsed: pipe.webSearchUsed,
        },
        webSearchUsed: pipe.webSearchUsed,
      });
    }

    if (!pipe.line) {
      return NextResponse.json(
        {
          ok: false,
          error: pipe.clarifyingQuestion || pipe.narration || "未能生成逻辑链",
          clarifyingQuestion: pipe.clarifyingQuestion,
          narration: pipe.narration,
          angle: pipe.angle,
          productIntent: pipe.productIntent,
          ingest: { noteIds: ingest.noteIds, warnings: ingest.warnings },
          harness: {
            intent: pipe.intent,
            planner: pipe.planner,
            steps: harnessSteps,
            trace: pipe.traceLines,
          },
        },
        { status: 422 },
      );
    }

    // 演示样例：自动接受 reline 提案，画布直接 active（免再点一次确认）
    if (isDemo && pipe.awaitingApproval && pipe.pendingId) {
      try {
        pipe.agent.approve(pipe.pendingId);
        pipe.awaitingApproval = false;
        pipe.pendingId = null;
        if (pipe.agent.state.line) pipe.line = pipe.agent.state.line;
      } catch {
        /* 保留 pending */
      }
    }

    const graph = lineToLogicGraph(pipe.line, hits, message);
    putThinkSession({
      id: sessionId,
      agent: pipe.agent,
      citations: hits,
      proposedLine: pipe.line,
      pendingId: pipe.pendingId,
      utterance: message,
      createdAt: existing?.createdAt ?? Date.now(),
    });

    let answer = templateAnswer(message, pipe.angle, hits, pipe.line);
    if (ingest.noteIds.length) {
      answer = `已将 ${ingest.noteIds.length} 个附件写入活知识库。\n\n` + answer;
    }
    let model = pipe.model || pipe.planner || "agent_harness";
    let live = false;
    let fallback = true;

    try {
      const { content, model: used } = await siliconflowChat({
        model:
          process.env.SILICONFLOW_SILVER_MODEL ||
          process.env.SILICONFLOW_TEXT_MODEL ||
          "Qwen/Qwen2.5-7B-Instruct",
        maxTokens: 1400,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: `你是「明晰」笔记产品里的逻辑梳理助手。根据用户意图、已解析角度与给定笔记，写一份可执行的中文逻辑报告（markdown）。
结构：主逻辑链说明 → 避雷分支 → 可学/对标 → 下一步。
规则：文中用 [cite:笔记id] 引用；明确区分「仓库笔记」与「网络来源」；避雷不要写成可照做步骤；不要输出 JSON。
角度已定为：${pipe.angle.order}（置信 ${pipe.angle.confidence.toFixed(2)}）。
节点图已由 Agent Harness 生成${webSearch ? "（含真实联网搜索）" : ""}，你只写旁白，不要另造节点。
锁定节点 ${lockedNodeIds.length} 个${scopeNodeId ? `；局部重生成 scope=${scopeNodeId}` : ""}。`,
          },
          {
            role: "user",
            content: `意图：${message}\n联网：${webSearch ? "开" : "关"}\n\n来源：\n${hits
              .map(
                (n) =>
                  `- id=${n.id} | ${n.sourceKind === "web" ? "网络" : "仓库"} | ${n.purposeLabel} | ${n.title}\n  ${n.summary.slice(0, 140)}${n.sourceUri ? `\n  url=${n.sourceUri}` : ""}`,
              )
              .join("\n")}\n\nHarness：${harnessSteps.map((s) => s.tool).join(" → ")}`,
          },
        ],
      });
      if (content?.trim()) {
        answer = content.trim();
        model = used;
        live = true;
        fallback = false;
      }
    } catch {
      /* keep template */
    }

    const pending = pipe.awaitingApproval
      ? {
          sessionId,
          pendingId: pipe.pendingId,
          summary: pipe.narration,
        }
      : null;
    const lineStatus = pipe.awaitingApproval ? "pending" : "active";
    const angleHint = `${pipe.angle.order} · ${pipe.angle.groupBy} · 置信 ${Number(pipe.angle.confidence || 0).toFixed(2)}`;
    const diffHint = pipe.diff
      ? `新增 ${pipe.diff.added?.length ?? 0} · 移动 ${pipe.diff.moved?.length ?? 0} · 锁定保持 ${pipe.diff.lockedKept?.length ?? 0}`
      : "";

    if (body.workspaceId) {
      try {
        upsertWorkspaceMemory(
          {
            id: body.workspaceId,
            title: body.workspaceTitle || body.workspaceId,
            subtitle: body.workspaceSubtitle || `${graph.nodes.length} 节点 · 已记忆`,
            updatedAt: new Date().toISOString(),
            isSample: String(body.workspaceId).startsWith("ws-sample"),
            data: {
              chat: [
                { role: "user", content: message },
                { role: "assistant", content: answer },
              ],
              thinkInput: "",
              nodes: graph.nodes,
              edges: graph.edges,
              citations: hits,
              lineStatus,
              pending,
              angleHint,
              diffHint,
              harnessHint: `${pipe.planner} · ${pipe.intent}${pipe.webSearchUsed ? " · 联网开" : ""}`,
              harnessSteps,
              thinkSessionId: sessionId,
              webSearchOn: webSearch,
              lastUtterance: message,
              rememberedAt: new Date().toISOString(),
            },
          },
          {
            activeWsId: body.workspaceId,
            interaction: {
              id: `ix_${Date.now().toString(36)}`,
              at: new Date().toISOString(),
              kind: webSearch ? "web_search" : "think_run",
              workspaceId: body.workspaceId,
              utterance: message,
              detail: `梳链记忆：${pipe.angle.order} · ${graph.nodes.length} 节点 · ${hits.length} 引用 · 锁 ${lockedNodeIds.length}`,
            },
          },
        );
      } catch {
        /* 记忆失败不影响本次响应 */
      }
    }

    return NextResponse.json({
      ok: true,
      fallback,
      live,
      demo: Boolean(body.demo) || message === DEMO_AGENT_INTENT,
      answer,
      citations: hits,
      logicLine: { nodes: graph.nodes, edges: graph.edges },
      angle: pipe.angle,
      diff: pipe.diff ?? null,
      pending,
      sessionId,
      clarifyingQuestion: pipe.clarifyingQuestion ?? null,
      model,
      pipeline: "agent_harness",
      lineStatus,
      remembered: Boolean(body.workspaceId),
      productIntent: pipe.productIntent,
      lookupCard: pipe.lookupCard,
      decisionCard: pipe.decisionCard,
      lockedNodeIds,
      scopeNodeId: scopeNodeId || null,
      ingest: { noteIds: ingest.noteIds, warnings: ingest.warnings },
      harness: {
        intent: pipe.intent,
        planner: pipe.planner,
        model: pipe.model,
        narration: pipe.narration,
        steps: harnessSteps,
        trace: pipe.traceLines,
        tools: harnessSteps.map((s) => s.tool),
        webSearchUsed: pipe.webSearchUsed,
      },
      webSearchUsed: pipe.webSearchUsed,
      capabilities: {
        webSearch: true,
        librarySearch: true,
        vision: Boolean(process.env.SILICONFLOW_VISION_MODEL),
        tools: [
          "library_retrieve",
          "preview_angle",
          "reline",
          "web_search",
          "web_read",
          "lookup",
          "make_decision_card",
          "write_back_lookup",
          "capture_ingest",
        ],
        confirmGate: true,
        harness: true,
        memory: true,
        lock: true,
        scopeRegen: true,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
