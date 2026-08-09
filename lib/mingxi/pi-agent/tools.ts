/**
 * pi Agent 工具集 · 智能笔记
 *
 * 工具与确定性管线共享同一套实现（pipeline.ts）；
 * Agent 通过工具自主编排：ingest_source → understand_note → render_save_note，
 * 也可以 search_library / list_notes 做检索回答。
 */
import { Type, type TSchema } from "typebox";
import type { AgentHarnessTool } from "@earendil-works/pi-agent-core";
import {
  ingestSourceToCanonical,
  understandAndSave,
} from "./pipeline.ts";
import { loadNoteIndex, searchNotes } from "./note-store.ts";
import { understandCanonical } from "./understand.ts";
import {
  formatQuestionStyleReport,
  learnFromUtterance,
  questionStyleSummary,
} from "./question-style.ts";
import type { NotesToolContext } from "./types.ts";

type Tool = AgentHarnessTool<NotesToolContext>;

/** 保留 schema 泛型以推断 execute 的 params 类型 */
function defineTool<S extends TSchema>(
  tool: AgentHarnessTool<NotesToolContext, S>,
): Tool {
  return tool as unknown as Tool;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export const ingestSourceTool: Tool = defineTool({
  name: "ingest_source",
  label: "接入并规范化来源",
  description:
    "把任意来源（http(s) 链接 / 本地文件路径：pdf·docx·pptx·音频·视频·图片·文本 / 直接粘贴的纯文本）规范化为「文字单元+图片单元」。有图片时自动做 OCR+画面理解双轨回填。返回 mediaId 供后续工具使用。",
  parameters: Type.Object({
    source: Type.String({
      description: "URL、本地文件路径，或一段要直接入库的纯文本",
    }),
    titleHint: Type.Optional(Type.String({ description: "标题提示（可选）" })),
    declaredPurpose: Type.Optional(
      Type.String({
        description: "用户声明的保存用途，如：学文笔 / 参考论文框架 / 避坑（可选）",
      }),
    ),
    contextHint: Type.Optional(
      Type.String({ description: "补充上下文，如这份材料来自哪门课、哪个项目（可选）" }),
    ),
  }),
  executionMode: "sequential",
  async execute(_id, params, _signal, onUpdate, context) {
    onUpdate?.({
      content: [{ type: "text", text: `正在接入：${params.source.slice(0, 80)}` }],
      details: {},
    });
    const { media, sourceKind, visionEnriched } = await ingestSourceToCanonical(
      {
        source: params.source,
        titleHint: params.titleHint,
        declaredPurpose: params.declaredPurpose,
        contextHint: params.contextHint,
      },
      { root: context.repoRoot },
    );
    context.workspace.entries.set(media.id, {
      media,
      declaredPurpose: params.declaredPurpose,
      contextHint: params.contextHint,
    });
    const digest = [
      `mediaId: ${media.id}`,
      `标题: ${media.title}`,
      `来源类型: ${sourceKind} · 入口形态: ${media.rawKind} · 通道: ${media.channel} · 访问态: ${media.access}`,
      `文字单元: ${media.texts.length} 个（共 ${media.texts.reduce((n, t) => n + t.text.length, 0)} 字）`,
      `图片单元: ${media.images.length} 个${visionEnriched ? "（已 OCR+caption 双轨回填）" : media.images.length ? "（OCR+画面理解将在 understand_note 一并完成）" : ""}`,
      media.warnings.length ? `警告: ${media.warnings.join("；")}` : "",
      `正文预览: ${media.texts.map((t) => t.text).join(" ").slice(0, 300)}`,
    ]
      .filter(Boolean)
      .join("\n");
    return { ...text(digest), details: { mediaId: media.id, sourceKind } };
  },
});

export const understandNoteTool: Tool = defineTool({
  name: "understand_note",
  label: "三层理解 + 打标签",
  description:
    "对已接入的材料（mediaId）做三层理解：层1 内容本身（图里有什么字/文本讲什么）、层2 客观语境角色（图/段落在原文中的位置与作用）、层3 主观用途（用户为什么存它），并打上学科路径/用途/功能类型/极性/关键词标签。",
  parameters: Type.Object({
    mediaId: Type.String({ description: "ingest_source 返回的 mediaId" }),
    declaredPurpose: Type.Optional(
      Type.String({ description: "用户声明的用途（若 ingest 时未提供可在此补充）" }),
    ),
  }),
  executionMode: "sequential",
  async execute(_id, params, _signal, onUpdate, context) {
    const entry = context.workspace.entries.get(params.mediaId);
    if (!entry) {
      throw new Error(
        `找不到 mediaId=${params.mediaId}，请先调用 ingest_source。当前可用：${[...context.workspace.entries.keys()].join(", ") || "（空）"}`,
      );
    }
    onUpdate?.({
      content: [{ type: "text", text: `正在做三层理解：${entry.media.title}` }],
      details: {},
    });
    const declaredPurpose = params.declaredPurpose ?? entry.declaredPurpose;
    const { understanding, tags, model } = await understandCanonical(entry.media, {
      declaredPurpose,
      contextHint: entry.contextHint,
      root: context.repoRoot,
    });
    entry.understanding = understanding;
    entry.tags = tags;
    entry.declaredPurpose = declaredPurpose;

    const summary = [
      `【层1 内容】${understanding.content.summary}`,
      understanding.content.keyPoints.length
        ? `要点: ${understanding.content.keyPoints.join("；")}`
        : "",
      `【层2 语境】${understanding.contextRole.sourceForm} · ${understanding.contextRole.argumentRole}`,
      understanding.contextRole.imageRoles.length
        ? `图片角色: ${understanding.contextRole.imageRoles.map((r) => `${r.imageId}=${r.role}`).join("；")}`
        : "",
      `【层3 用途】${
        declaredPurpose
          ? `用户声明: ${declaredPurpose}`
          : `推断: ${understanding.personalUse.inferredUses.map((u) => `${u.use}(${Math.round(u.confidence * 100)}%)`).join("、")}`
      }`,
      `【标签】${tags.domainPath.join("/")} · ${tags.purposeLabel} · ${tags.functionalTypes.join("、")} · ${tags.polarity} · 关键词: ${tags.keywords.join("、")}`,
      `（理解模型: ${model}）`,
    ]
      .filter(Boolean)
      .join("\n");
    return { ...text(summary), details: { mediaId: params.mediaId, tags } };
  },
});

export const renderSaveNoteTool: Tool = defineTool({
  name: "render_save_note",
  label: "渲染统一 HTML 并入库",
  description:
    "把已完成理解的材料（mediaId）渲染成统一样式的 HTML 笔记（含三层理解、结构逻辑图、图片双注释、原文折叠），保存进笔记库并更新索引。返回保存路径。",
  parameters: Type.Object({
    mediaId: Type.String({ description: "已经 understand_note 过的 mediaId" }),
  }),
  executionMode: "sequential",
  async execute(_id, params, _signal, onUpdate, context) {
    const entry = context.workspace.entries.get(params.mediaId);
    if (!entry) {
      throw new Error(`找不到 mediaId=${params.mediaId}，请先调用 ingest_source。`);
    }
    onUpdate?.({
      content: [{ type: "text", text: `正在渲染入库：${entry.media.title}` }],
      details: {},
    });
    // 若 agent 跳过了 understand_note，这里兜底补一次理解
    const result = await understandAndSave(entry.media, {
      root: context.repoRoot,
      declaredPurpose: entry.declaredPurpose,
      contextHint: entry.contextHint,
    });
    entry.understanding = result.understanding;
    entry.tags = result.tags;
    entry.savedNoteId = result.record.id;
    const msg = [
      `已入库：${result.record.title}`,
      `noteId: ${result.record.id}`,
      `HTML: ${result.saved.htmlPath}`,
      `JSON: ${result.saved.jsonPath}`,
      `标签: ${result.tags.domainPath.join("/")} · ${result.tags.purposeLabel}`,
    ].join("\n");
    return {
      ...text(msg),
      details: { noteId: result.record.id, htmlPath: result.saved.htmlPath },
    };
  },
});

export const searchLibraryTool: Tool = defineTool({
  name: "search_library",
  label: "检索笔记库",
  description: "按关键词检索已入库的笔记（标题/概括/学科路径/关键词），返回匹配的笔记条目。",
  parameters: Type.Object({
    query: Type.String({ description: "检索关键词（空格分隔多个词）" }),
    limit: Type.Optional(Type.Number({ description: "返回条数，默认 8" })),
  }),
  async execute(_id, params, _signal, _onUpdate, context) {
    const hits = searchNotes(params.query, {
      root: context.repoRoot,
      limit: params.limit ?? 8,
    });
    if (!hits.length) return { ...text(`没有找到与「${params.query}」匹配的笔记。`), details: { hits: [] } };
    const lines = hits.map(
      (h, i) =>
        `${i + 1}. [${h.id}] ${h.title} —— ${h.summary.slice(0, 60)}（${h.domainPath.join("/")} · ${h.purposeLabel}）`,
    );
    return { ...text(lines.join("\n")), details: { hits } };
  },
});

export const listNotesTool: Tool = defineTool({
  name: "list_notes",
  label: "列出笔记库",
  description: "列出笔记库中最近的笔记条目（含标签），用于总览或让用户挑选。",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "返回条数，默认 10" })),
  }),
  async execute(_id, params, _signal, _onUpdate, context) {
    const index = loadNoteIndex(context.repoRoot).slice(0, params.limit ?? 10);
    if (!index.length) return { ...text("笔记库还是空的。"), details: { count: 0 } };
    const lines = index.map(
      (e, i) =>
        `${i + 1}. [${e.id}] ${e.title}（${e.domainPath.join("/")} · ${e.purposeLabel} · 图${e.imageCount}/文${e.textCount}）`,
    );
    return { ...text(lines.join("\n")), details: { count: index.length } };
  },
});

export const observeQuestionStyleTool: Tool = defineTool({
  name: "observe_question_style",
  label: "观察并学习提问风格",
  description:
    "从用户的一句追问里学习其提问视角/切入点/深挖逻辑/深挖方向，写入提问风格先验。用户在追问、纠偏、要求换角度时调用。",
  parameters: Type.Object({
    utterance: Type.String({ description: "用户原话" }),
  }),
  async execute(_id, params, _signal, _onUpdate, context) {
    const sig = learnFromUtterance(params.utterance, {
      root: context.repoRoot,
      source: "tool",
    });
    if (!sig) {
      return {
        ...text("这句话没有识别出稳定的提问风格标签（可能是寒暄或入库指令）。"),
        details: { learned: false },
      };
    }
    const summary = questionStyleSummary(context.repoRoot);
    return {
      ...text(
        [
          "已学习本轮追问风格：",
          sig.perspectives.length ? `视角=${sig.perspectives.join(",")}` : "",
          sig.entryPoints.length ? `切入=${sig.entryPoints.join(",")}` : "",
          sig.deepenLogics.length ? `深挖=${sig.deepenLogics.join(",")}` : "",
          sig.digDirections.length ? `方向=${sig.digDirections.join(",")}` : "",
          `累计信号 ${summary.total} 条${summary.active ? "（已激活先验注入）" : ""}`,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      details: { learned: true, signal: sig, summary },
    };
  },
});

export const showQuestionStyleTool: Tool = defineTool({
  name: "show_question_style",
  label: "展示已学提问风格",
  description: "汇报当前已习得的用户提问视角/切入点/深挖逻辑/方向分布。",
  parameters: Type.Object({}),
  async execute(_id, _params, _signal, _onUpdate, context) {
    const report = formatQuestionStyleReport(context.repoRoot);
    return { ...text(report), details: { summary: questionStyleSummary(context.repoRoot) } };
  },
});

export const notesAgentTools: Tool[] = [
  ingestSourceTool,
  understandNoteTool,
  renderSaveNoteTool,
  searchLibraryTool,
  listNotesTool,
  observeQuestionStyleTool,
  showQuestionStyleTool,
];
