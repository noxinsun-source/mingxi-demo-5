/**
 * LLM 编排器：模型选工具 → 本地注册表执行 → 边界与轨迹不变
 *
 * 默认用硅基流动（与 Vision/旁白同一套）；DeepSeek 仅作可选备用。
 * 规划可以换模型；执行层仍走 tool-registry + policy，不能绕过人审。
 */
import type { AgentContext } from "./tool-registry.ts";
import { ToolRegistry } from "./tool-registry.ts";
import { createRegistry } from "./tools/index.ts";
import { createTrace } from "./trace.ts";
import { deepseekChat } from "../llm/deepseek.ts";
import type { ChatMessage } from "../llm/deepseek.ts";
import { siliconflowChat } from "../llm/siliconflow.ts";
import type { SfChatMessage } from "../llm/siliconflow.ts";
import { mingxiLlmMode } from "../llm/env.ts";
import {
  executeAsync,
  plan as rulePlan,
  type Plan,
  type PlanStep,
  type TurnResult,
} from "./orchestrator.ts";

const SYSTEM = `你是「明晰」笔记 Agent 的规划器。
产品原则：捕获要宽、用途归人、逻辑可切。
你只能通过提供的 function tools 行动，禁止编造原料 ID、禁止声称已改写原料、禁止无人批准就写回外查。
可用意图对应工具：
- 一句话梳逻辑链 → 必须先 library_retrieve，再 preview_angle，再 reline（reline 需人确认）
- 灵光捕获入库闭环 → capture_ingest（OCR+VLM+写知识库）
- 多模态规范化 → normalize_multimodal
- 阅读公开网页 → web_read；实时搜索 → web_search
- 整理成件 → organize_piece
- 凭据回点 → resolve_citation
- 外查 → 先 web_search 再 lookup（lookup 人批准才写回）
- 决断 → make_decision_card
- 学习/回滚 → learn_from_signals / control_memory
若用户话含糊，可先 preview_angle 或只回复一句澄清，不要乱调工具。
调工具时参数必须是合法 JSON。`;

function materialCatalog(ctx: AgentContext): string {
  return ctx.materials
    .slice(0, 24)
    .map(
      (m) =>
        `- ${m.id} | ${m.purpose.track}/${m.purpose.label} | ${m.modality} | ${m.source.title}`,
    )
    .join("\n");
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return typeof v === "object" && v && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stepsFromToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  provider: string,
): PlanStep[] {
  return toolCalls.map((tc) => ({
    tool: tc.function.name,
    input: parseArgs(tc.function.arguments),
    why: `${provider} tool_call ${tc.id}`,
  }));
}

async function plannerRound(input: {
  messages: ChatMessage[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  content: string | null;
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  model: string;
  provider: "siliconflow" | "deepseek";
}> {
  const mode = mingxiLlmMode();
  if (mode === "deepseek") {
    const r = await deepseekChat({
      messages: input.messages,
      tools: input.tools,
      toolChoice: input.toolChoice,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });
    return {
      content: r.content,
      toolCalls: r.toolCalls,
      model: r.model,
      provider: "deepseek",
    };
  }

  // 默认：硅基流动（文本/Agent 模型；看图仍走 vision 管线工具）
  const sfMessages: SfChatMessage[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
    tool_call_id: m.tool_call_id,
    tool_calls: m.tool_calls,
  }));
  const r = await siliconflowChat({
    messages: sfMessages,
    tools: input.tools,
    toolChoice: input.toolChoice,
    temperature: input.temperature ?? 0.2,
    maxTokens: input.maxTokens ?? 1200,
  });
  return {
    content: r.content || null,
    toolCalls: r.toolCalls,
    model: r.model,
    provider: "siliconflow",
  };
}

export async function runTurnWithLlm(
  utterance: string,
  ctx: AgentContext,
  registry: ToolRegistry = createRegistry(),
): Promise<
  TurnResult & {
    planner: "siliconflow" | "deepseek" | "local-fallback";
    model?: string;
  }
> {
  const base: AgentContext = {
    ...ctx,
    trace: ctx.trace ?? createTrace(`llm_${Date.now()}`, ctx.now),
  };

  const tools = registry.toFunctionSpecs();
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `当前原料目录：\n${materialCatalog(ctx)}\n\n当前是否已有链路：${ctx.line ? `有，角度=${ctx.line.angle.order}，节点=${ctx.line.nodes.length}` : "无"}\n\n用户说：${utterance}`,
    },
  ];

  try {
    const first = await plannerRound({
      messages,
      tools,
      toolChoice: "auto",
      temperature: 0.2,
    });

    let steps = stepsFromToolCalls(first.toolCalls, first.provider);
    let narration =
      (first.content ?? "").trim() ||
      (steps.length
        ? "我已按你的话选好工具，执行后需要确认的步骤会停下来等你。"
        : "我还不确定你的意图，请再说具体一点。");

    // 梳链保底：召回 → 预览 → 重排（仍需人确认才生效）
    // 注意：模型常只调 library_retrieve 就停在「clarify」——必须把整条链补齐，
    // 否则 pipe.line 为空，网页端逻辑画布永远空白。
    const names = new Set(steps.map((s) => s.tool));
    const wantsLine =
      names.has("preview_angle") ||
      names.has("reline") ||
      /重排|梳理|逻辑|避雷|正例|梳成|逻辑线|学习线/.test(utterance);
    if (wantsLine) {
      if (!names.has("library_retrieve") && ctx.materials.length === 0) {
        steps = [
          {
            tool: "library_retrieve",
            input: { query: utterance, limit: 14 },
            why: "补全：梳链前必须先召回知识库",
          },
          ...steps,
        ];
        names.add("library_retrieve");
      }
      if (!names.has("preview_angle")) {
        // 插在 retrieve 之后、其它步骤之前
        const head = steps.filter((s) => s.tool === "library_retrieve");
        const rest = steps.filter((s) => s.tool !== "library_retrieve");
        steps = [
          ...head,
          {
            tool: "preview_angle",
            input: { angleText: utterance },
            why: "补全：梳链必须先解析角度",
          },
          ...rest.filter((s) => s.tool !== "reline"),
        ];
        names.add("preview_angle");
      }
      if (!names.has("reline")) {
        const angleText =
          (steps.find((s) => s.tool === "preview_angle")?.input.angleText as string) ||
          utterance;
        steps = [
          ...steps.filter((s) => s.tool !== "reline"),
          {
            tool: "reline",
            input: {
              angleText,
              lockedNodeIds: ctx.line?.lockedNodeIds ?? [],
              ...(ctx.scopeNodeId ? { scopeNodeId: ctx.scopeNodeId } : {}),
            },
            why: "补全：预览后必须给出可确认的重排方案",
          },
        ];
        names.add("reline");
      }
      // 去重保序：retrieve → preview → reline → 其它
      const order = ["library_retrieve", "preview_angle", "reline"] as const;
      const byName = new Map(steps.map((s) => [s.tool, s]));
      const ordered = order.map((t) => byName.get(t)).filter(Boolean) as typeof steps;
      const extras = steps.filter((s) => !order.includes(s.tool as (typeof order)[number]));
      steps = [...ordered, ...extras];
    }

    if (!steps.length) {
      const fallback = rulePlan(utterance, ctx);
      if (fallback.steps.length) {
        steps = fallback.steps;
        narration = `${narration}\n（模型未调工具，已用本地规则补计划：${fallback.intent}）`;
      } else {
        return {
          plan: { intent: "clarify", steps: [], narration },
          ctx: base,
          trace: base.trace,
          results: [],
          awaitingApproval: false,
          planner: first.provider,
          model: first.model,
        };
      }
    }

    steps = steps.map((s) => {
      if (s.tool !== "reline") return s;
      const next = { ...s, input: { ...s.input } };
      if (!next.input.lockedNodeIds && ctx.line?.lockedNodeIds?.length) {
        next.input.lockedNodeIds = ctx.line.lockedNodeIds;
      }
      if (!next.input.scopeNodeId && ctx.scopeNodeId) {
        next.input.scopeNodeId = ctx.scopeNodeId;
      }
      return next;
    });

    const intentGuess = steps.some((s) => s.tool === "lookup")
      ? "lookup"
      : steps.some((s) => s.tool === "make_decision_card")
        ? "decide"
        : steps.some((s) => s.tool === "reline" || s.tool === "preview_angle")
          ? "reline"
          : steps.some((s) => s.tool === "organize_piece")
            ? "organize"
            : "clarify";

    const planned: Plan = {
      intent: intentGuess,
      steps,
      narration,
    };

    const { ctx: nextCtx, results } = await executeAsync(steps, base, registry);

    try {
      const toolMsgs: ChatMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: first.content,
          tool_calls: first.toolCalls,
        },
        ...first.toolCalls.map((tc, i) => ({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: results[i]?.result.summary ?? "（无结果）",
        })),
      ];
      const second = await plannerRound({
        messages: [
          ...toolMsgs,
          {
            role: "user",
            content: "用一两句中文向用户汇报你做了什么、哪些步骤在等他确认。不要再调工具。",
          },
        ],
        tools: [],
        toolChoice: "none",
        maxTokens: 200,
      });
      if (second.content?.trim()) planned.narration = second.content.trim();
    } catch {
      /* 叙事失败不影响主流程 */
    }

    return {
      plan: planned,
      ctx: nextCtx,
      trace: nextCtx.trace,
      results,
      awaitingApproval: results.some((r) => r.result.needsApproval === true),
      planner: first.provider,
      model: first.model,
    };
  } catch (err) {
    const local = rulePlan(utterance, ctx);
    const { ctx: nextCtx, results } = await executeAsync(local.steps, base, registry);
    return {
      plan: {
        ...local,
        narration: `${local.narration}\n（LLM 规划不可用，已回退本地规则：${(err as Error).message.slice(0, 120)}）`,
      },
      ctx: nextCtx,
      trace: nextCtx.trace,
      results,
      awaitingApproval: results.some((r) => r.result.needsApproval === true),
      planner: "local-fallback",
    };
  }
}
