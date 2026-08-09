/**
 * 明晰 · pi 智能笔记 Agent 核心类型
 *
 * 三层理解（产品核心）：
 *   层1 content     —— 纯内容本身：图里有什么字、文本讲了什么
 *   层2 contextRole —— 客观语境角色：这段/这图在原文中的位置与作用
 *   层3 personalUse —— 主观用途：记笔记的人为什么存它
 */
import type { PurposeLabel } from "../types.ts";
import type { CanonicalMedia } from "../multimodal/types.ts";

/** 层1 · 内容本身 */
export interface ContentUnderstanding {
  /** 2-3 句的内容概括 */
  summary: string;
  /** 关键要点（3-6 条） */
  keyPoints: string[];
  /** 关键实体 / 术语 */
  entities: string[];
  /** 逐图：可见文字 + 画面内容（纯内容层，不谈用途） */
  imageFindings: Array<{
    imageId: string;
    visibleText: string;
    whatItShows: string;
  }>;
}

/** 层2 · 客观语境角色（结合原文上下文） */
export interface ContextRoleUnderstanding {
  /** 原文是什么形态：论文 / 教程 / 社交帖 / PPT / 实验记录… */
  sourceForm: string;
  /** 原文的结构骨架（章节 / 论证步骤，3-8 段） */
  structureOutline: string[];
  /** 整份材料在知识生产中的定位：提出观点 / 提供证据 / 综述 / 操作指南… */
  argumentRole: string;
  /** 逐图：在原文中的位置与客观作用（举例示意？佐证哪个观点？） */
  imageRoles: Array<{
    imageId: string;
    positionInSource: string;
    role: string;
    supportsClaim: string;
  }>;
}

/** 层3 · 主观用途（对记笔记的人） */
export interface PersonalUseUnderstanding {
  /** 用户捕获时声明的用途（C2，可缺省） */
  declaredPurpose?: string;
  /** AI 推断的候选用途（如：学文笔 / 参考论文框架 / 避坑对照） */
  inferredUses: Array<{
    use: string;
    why: string;
    confidence: number;
  }>;
  /** 建议的下一步动作（一句话） */
  suggestedAction: string;
}

export interface NoteUnderstanding {
  content: ContentUnderstanding;
  contextRole: ContextRoleUnderstanding;
  personalUse: PersonalUseUnderstanding;
}

export type NotePolarity =
  | "positive_exemplar"
  | "negative_caution"
  | "mixed"
  | "neutral_observe";

/** 标签集（用于后续整理归纳） */
export interface NoteTagSet {
  /** 学科路径（会过 canonicalize-domain 对齐骨架词表） */
  domainPath: string[];
  purposeLabel: PurposeLabel;
  /** 功能类型：教程 / 综述 / 实验记录 / 观点评论 / 踩坑… */
  functionalTypes: string[];
  polarity: NotePolarity;
  keywords: string[];
}

/**
 * 用途状态：
 * - declared：用户在捕获时选了具体用途标签（手机扇形菜单 / CLI --purpose），或事后已确认
 * - pending：用户选了「待定」或未声明 —— AI 推断候选，等用户一键确认（确认闭环）
 */
export type PurposeStatus = "declared" | "pending";

/** 一条已归纳入库的笔记 */
export interface NoteRecord {
  id: string;
  title: string;
  capturedAt: string;
  purposeStatus: PurposeStatus;
  source: {
    kind: string;
    uri?: string;
    channel: string;
    access: string;
  };
  media: CanonicalMedia;
  understanding: NoteUnderstanding;
  tags: NoteTagSet;
  /** 生成 HTML 的相对路径（相对仓库根） */
  htmlPath: string;
  /** 理解所用模型 */
  model: string;
  pipeline: string[];
  warnings: string[];
}

/** index.json 里的轻量条目 */
export interface NoteIndexEntry {
  id: string;
  title: string;
  capturedAt: string;
  summary: string;
  domainPath: string[];
  purposeLabel: string;
  polarity: NotePolarity;
  keywords: string[];
  functionalTypes: string[];
  htmlPath: string;
  jsonPath: string;
  sourceUri?: string;
  imageCount: number;
  textCount: number;
}

/** Agent 工具间共享的会话工作台 */
export interface NotesWorkspaceEntry {
  media: CanonicalMedia;
  understanding?: NoteUnderstanding;
  tags?: NoteTagSet;
  declaredPurpose?: string;
  contextHint?: string;
  savedNoteId?: string;
}

export interface NotesWorkspace {
  entries: Map<string, NotesWorkspaceEntry>;
}

export function createNotesWorkspace(): NotesWorkspace {
  return { entries: new Map() };
}

/** 工具上下文（AgentHarness toolContext） */
export interface NotesToolContext {
  workspace: NotesWorkspace;
  repoRoot: string;
}
