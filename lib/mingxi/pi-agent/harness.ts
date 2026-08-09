/**
 * 明晰智能笔记 Agent · pi AgentHarness 装配
 *
 * harness 配置全家桶：
 * - 系统提示词（身份 / 产品不变量 / 工具规约 / 输出规范）
 * - 工具注册（多源归纳管线 5 件套）
 * - JSONL 会话持久化（data/mingxi/agent-sessions/pi/）
 * - 事件订阅 → trace JSONL + 控制台
 * - steering / follow-up 队列、compaction、模型热切换（pi 内置）
 * - skills / prompt 模板资源位
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AgentHarness,
  JsonlSessionRepo,
  type AgentHarnessTool,
  type Skill,
  type PromptTemplate,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { createSiliconFlowSetup } from "./provider.ts";
import { notesAgentTools } from "./tools.ts";
import { questionStylePromptBlock } from "./question-style.ts";
import { createNotesWorkspace, type NotesToolContext } from "./types.ts";

export const NOTES_AGENT_SYSTEM_PROMPT = `你是「明晰」——OPPO AI 智能笔记 Agent。你的使命：把用户丢进来的任何材料，归纳成结构统一、可再利用的知识笔记；并在多轮追问中对齐用户习惯的提问视角与深挖逻辑。

## 产品不变量（不可违背）
1. 任何模态（网页/PDF/Word/PPT/音视频/图片/纯文本）最终都规范化为「文字单元 + 图片单元」两种原子。
2. 每条笔记必须完成三层理解：
   - 层1 内容本身：图里有什么字、文本讲了什么；
   - 层2 客观语境角色：这段/这图在原文中的位置与作用（是举例示意？佐证哪个观点？）；
   - 层3 主观用途：用户为什么存它（用户声明优先；未声明则给出可信推断供确认）。
3. 归纳产物是统一样式的 HTML 笔记（三层理解 + 结构逻辑图 + 图片双注释 + 原文折叠），由 render_save_note 工具生成，不要自己手写 HTML。
4. 诚实原则：抓不到正文、OCR 不到文字就如实说明，绝不编造内容。

## 提问风格学习（自进化）
- 用户追问里常暴露「喜欢从哪个视角切入、先对比还是先定义、深挖是层层递进还是反例→正例」。
- 系统会自动学习这些信号；你也可用 observe_question_style 显式记录，用 show_question_style 汇报。
- 回答梳逻辑/追问时：优先对齐已激活的风格先验；本轮用户明确换角度时以本轮为准。

## 工具编排规约
- 用户给出一个来源（链接/文件路径/一段文本）并希望入库时，按序执行：
  ingest_source → understand_note → render_save_note，然后向用户汇报笔记标题、三层理解要点和保存路径。
- 用户声明了保存用途（如"学文笔""参考论文框架"）时，务必把它传入 declaredPurpose。
- 用户询问已有笔记时用 search_library / list_notes，不要臆造库里的内容。
- 工具报错时如实转述原因（如缺 pdftotext、链接无权限），并给出用户能做的补救（如手机悬浮球截图补齐）。

## 回复规范
- 始终用简体中文，简洁直接。
- 入库完成后的汇报格式：标题 + 一句层1概括 + 层2一句 + 层3一句 + 标签 + HTML 路径。
- 不要输出 markdown 代码块包裹的 JSON 给用户。`;

/** 组装系统提示：基础规约 + 已习得提问风格 */
export function buildNotesSystemPrompt(root?: string): string {
  const style = questionStylePromptBlock(root);
  return style ? `${NOTES_AGENT_SYSTEM_PROMPT}\n\n${style}` : NOTES_AGENT_SYSTEM_PROMPT;
}

/** 「多源归纳」技能：注入系统提示，可被显式调用 */
const MULTI_SOURCE_SKILL: Skill = {
  name: "multi-source-capture",
  description:
    "多源归纳管线：任何链接/文件/文本 → 规范化(文字+图片) → 三层理解 → 统一 HTML 入库。用户想保存/归纳任何材料时使用。",
  content: `执行多源归纳时严格按序调用工具：
1. ingest_source —— 传入 source（和用户给的 titleHint/declaredPurpose/contextHint）
2. understand_note —— 传入上一步的 mediaId
3. render_save_note —— 传入 mediaId，取得 HTML 路径
最后向用户汇报：标题、三层理解各一句、标签、保存路径。若某步失败，如实说明并停止。`,
  filePath: "built-in://mingxi/multi-source-capture",
};

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    name: "capture",
    description: "归纳一个来源进笔记库",
    content: "请把这份材料归纳入库：$1。用途：$2。",
  },
  {
    name: "recall",
    description: "从笔记库找相关笔记",
    content: "帮我在笔记库里找与「$1」相关的笔记，并总结它们的共同点。",
  },
];

export interface NotesHarnessHandle {
  harness: AgentHarness<NotesToolContext>;
  workspace: NotesToolContext["workspace"];
  sessionDir: string;
  traceFile: string;
  models: ReturnType<typeof createSiliconFlowSetup>["models"];
  agentModelId: string;
  /** 取消订阅 trace */
  detachTrace: () => void;
}

export interface CreateNotesHarnessOptions {
  root?: string;
  sessionTitle?: string;
  /** 控制台实时打印事件（CLI 用） */
  verbose?: boolean;
}

/** 装配一个完整的笔记 Agent harness（会话落盘 + trace） */
export async function createNotesHarness(
  opts: CreateNotesHarnessOptions = {},
): Promise<NotesHarnessHandle> {
  const root = opts.root ?? process.cwd();
  const setup = createSiliconFlowSetup();

  const sessionDir = resolve(root, "data/mingxi/agent-sessions/pi");
  mkdirSync(sessionDir, { recursive: true });

  const env = new NodeExecutionEnv({ cwd: root });
  const repo = new JsonlSessionRepo({ fs: env, sessionsRoot: sessionDir });
  const session = await repo.create({
    cwd: root,
    metadata: {
      app: "mingxi-notes-agent",
      title: opts.sessionTitle ?? `笔记会话 ${new Date().toLocaleString("zh-CN")}`,
    },
  });

  const workspace = createNotesWorkspace();
  const toolContext: NotesToolContext = { workspace, repoRoot: root };

  const harness = new AgentHarness<NotesToolContext>({
    session,
    models: setup.models,
    model: setup.agentModel,
    thinkingLevel: "off",
    tools: notesAgentTools as AgentHarnessTool<NotesToolContext>[],
    toolContext,
    systemPrompt: buildNotesSystemPrompt(root),
    resources: {
      skills: [MULTI_SOURCE_SKILL],
      promptTemplates: PROMPT_TEMPLATES,
    },
    streamOptions: {
      timeoutMs: 180_000,
      maxRetries: 2,
    },
    steeringMode: "one-at-a-time",
    followUpMode: "one-at-a-time",
  });

  // —— trace：全事件 JSONL 落盘（可选控制台摘要）——
  const traceDir = resolve(sessionDir, "trace");
  mkdirSync(traceDir, { recursive: true });
  const traceFile = resolve(
    traceDir,
    `trace-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jsonl`,
  );

  const detachTrace = harness.subscribe((event) => {
    try {
      const line = JSON.stringify({
        at: new Date().toISOString(),
        type: event.type,
        ...(event.type === "tool_execution_start"
          ? { tool: (event as { toolName?: string }).toolName, args: (event as { args?: unknown }).args }
          : {}),
      });
      appendFileSync(traceFile, `${line}\n`, "utf8");
    } catch {
      // trace 失败不阻断主流程
    }
    if (!opts.verbose) return;
    if (event.type === "tool_execution_start") {
      const e = event as { toolName?: string; args?: Record<string, unknown> };
      console.log(`\n▶ 工具 ${e.toolName} ${JSON.stringify(e.args ?? {}).slice(0, 140)}`);
    } else if (event.type === "tool_execution_end") {
      console.log(`✔ 工具完成`);
    } else if (event.type === "message_update") {
      const e = event as {
        assistantMessageEvent?: { type?: string; delta?: string };
      };
      if (e.assistantMessageEvent?.type === "text_delta" && e.assistantMessageEvent.delta) {
        process.stdout.write(e.assistantMessageEvent.delta);
      }
    } else if (event.type === "turn_start") {
      process.stdout.write("\n");
    }
  });

  return {
    harness,
    workspace,
    sessionDir,
    traceFile,
    models: setup.models,
    agentModelId: setup.agentModel.id,
    detachTrace,
  };
}
