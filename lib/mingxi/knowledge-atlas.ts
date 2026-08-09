/**
 * 知识图谱分类 + 统一笔记卡片
 *
 * 旭日/径向树的层级是「知识客观归属」，不是链路角度：
 *   L1 理工科 / 人文社科
 *   L2 学科细分（学习科学、内容工程、媒介传播、决策与行动…）
 *   L3 主题簇
 *   L4 叶子 = 单条笔记（统一卡片）
 */
import type { Material, Modality, PurposeLabel, Track } from "./types.ts";
import { demoMaterials } from "../../data/mingxi/index.ts";
import type { NoteTagLayers } from "./tags.ts";

export type BodyKind =
  | "pdf_pages"
  | "web_snapshot"
  | "video_transcript"
  | "social_thread"
  | "chat_log"
  | "voice_transcript"
  | "photo_board"
  | "table_sheet"
  | "screenshot";

export interface NoteUnit {
  id: string;
  materialId: string;
  title: string;
  /** 卡片上的一句话，统一口径 */
  summary: string;
  modality: Modality;
  modalityLabel: string;
  bodyKind: BodyKind;
  bodyKindLabel: string;
  track: Track;
  purposeLabel: PurposeLabel;
  /**
   * 客观知识路径（旭日图）：优先 AI 领域层级标签 domain.path
   * 如 ["工学","计算机科学与技术","人工智能","RAG"]
   */
  knowledgePath: string[];
  categoryId: string;
  tags: string[];
  /** 两层标签：domain(AI) + user(用户自定义功能标签) */
  tagLayers?: NoteTagLayers;
  sourceLabel: string;
  author?: string;
  capturedAt: string;
  /** 打开全文时展示的块 */
  blocks: Array<{ id: string; kind: string; text: string }>;
  fullTextPreview: string;
  accent: string;
}

export interface AtlasNode {
  id: string;
  name: string;
  depth: number;
  /** 叶子笔记数（含子树） */
  count: number;
  children?: AtlasNode[];
  /** 仅叶子：挂一张统一卡片 */
  note?: NoteUnit;
}

const MODALITY_LABEL: Record<Modality, string> = {
  pdf: "PDF",
  webpage: "网页",
  social_post: "社交帖",
  chat: "聊天",
  video: "视频",
  voice: "语音",
  photo: "图片",
  table: "表格",
  screenshot: "截图",
};

function bodyOf(m: Material): { kind: BodyKind; label: string } {
  switch (m.modality) {
    case "pdf":
      return { kind: "pdf_pages", label: "PDF 页文" };
    case "webpage":
      return { kind: "web_snapshot", label: "网页快照" };
    case "video":
      return { kind: "video_transcript", label: "视频转写" };
    case "social_post":
      return { kind: "social_thread", label: "社交帖正文" };
    case "chat":
      return { kind: "chat_log", label: "聊天实录" };
    case "voice":
      return { kind: "voice_transcript", label: "语音转写" };
    case "photo":
      return { kind: "photo_board", label: "图片对照" };
    case "table":
      return { kind: "table_sheet", label: "表格全文" };
    case "screenshot":
      return { kind: "screenshot", label: "屏幕快照" };
  }
}

const ACCENTS = ["#1f7a63", "#2f5f8a", "#b35a1f", "#5a5470", "#3a6b5a", "#8a5a3a"];

/** materialId → 客观知识路径（不含根） */
const PATH_BY_ID: Record<string, string[]> = {
  // 理工科 · 学习科学
  "MX-L01": ["理工科", "学习科学", "记忆机制"],
  "MX-L02": ["理工科", "学习科学", "记忆机制"],
  "MX-L03": ["理工科", "学习科学", "理解型学科"],
  "MX-L04": ["理工科", "学习科学", "执行与习惯"],
  "MX-L05": ["理工科", "学习科学", "理解型学科"],
  "MX-L06": ["理工科", "学习科学", "提取练习"],
  "MX-L07": ["理工科", "学习科学", "提取练习"],
  "MX-L08": ["理工科", "学习科学", "执行与习惯"],
  "MX-L09": ["理工科", "学习科学", "记忆机制"],
  // 理工科 · 内容工程
  "MX-C05": ["理工科", "内容工程", "平台规则"],
  "MX-C09": ["理工科", "内容工程", "数据指标"],
  "MX-D01": ["理工科", "内容工程", "数据指标"],
  "MX-D03": ["理工科", "内容工程", "平台规则"],
  // 人文社科 · 媒介传播
  "MX-C01": ["人文社科", "媒介传播", "对标拆解"],
  "MX-C02": ["人文社科", "媒介传播", "对标拆解"],
  "MX-C03": ["人文社科", "媒介传播", "视觉版式"],
  "MX-C04": ["人文社科", "媒介传播", "受众反馈"],
  "MX-C06": ["人文社科", "媒介传播", "文案金句"],
  "MX-C08": ["人文社科", "媒介传播", "对标拆解"],
  // 人文社科 · 决策与行动
  "MX-C07": ["人文社科", "决策与行动", "叙事大纲"],
  "MX-D02": ["人文社科", "决策与行动", "时间约束"],
  "MX-D04": ["人文社科", "决策与行动", "选题策略"],
};

function summaryOf(m: Material): string {
  const tip = m.blocks.find((b) => b.kind === "要点" || b.kind === "正文" || b.kind === "口述");
  const raw = tip?.text ?? m.layers.visibleText;
  return raw.length > 72 ? `${raw.slice(0, 72)}…` : raw;
}

export function materialToNoteUnit(m: Material, index = 0): NoteUnit {
  const path = PATH_BY_ID[m.id] ?? ["未分类", "其他", m.purpose.label];
  const body = bodyOf(m);
  return {
    id: `note_${m.id}`,
    materialId: m.id,
    title: m.source.title,
    summary: summaryOf(m),
    modality: m.modality,
    modalityLabel: MODALITY_LABEL[m.modality],
    bodyKind: body.kind,
    bodyKindLabel: body.label,
    track: m.purpose.track,
    purposeLabel: m.purpose.label,
    knowledgePath: path,
    categoryId: path.join("/"),
    tags: m.tags,
    sourceLabel: m.source.appHint ?? m.source.author ?? m.source.kind,
    author: m.source.author,
    capturedAt: m.capturedAt,
    blocks: m.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
    fullTextPreview: m.layers.fullText ?? m.layers.visibleText,
    accent: ACCENTS[index % ACCENTS.length],
  };
}

export function buildNoteUnits(materials: Material[] = demoMaterials): NoteUnit[] {
  return materials
    .filter((m) => PATH_BY_ID[m.id])
    .map((m, i) => materialToNoteUnit(m, i));
}

function ensureChild(parent: AtlasNode, id: string, name: string, depth: number): AtlasNode {
  if (!parent.children) parent.children = [];
  let child = parent.children.find((c) => c.id === id);
  if (!child) {
    child = { id, name, depth, count: 0, children: [] };
    parent.children.push(child);
  }
  return child;
}

/** 从统一卡片建客观知识树 */
export function buildKnowledgeAtlas(notes: NoteUnit[]): AtlasNode {
  const root: AtlasNode = { id: "root", name: "知识库", depth: 0, count: 0, children: [] };

  for (const note of notes) {
    let cursor = root;
    note.knowledgePath.forEach((seg, i) => {
      const id = note.knowledgePath.slice(0, i + 1).join("/");
      cursor = ensureChild(cursor, id, seg, i + 1);
    });
    const leafId = `leaf:${note.materialId}`;
    if (!cursor.children) cursor.children = [];
    cursor.children.push({
      id: leafId,
      name: note.title.length > 18 ? `${note.title.slice(0, 18)}…` : note.title,
      depth: note.knowledgePath.length + 1,
      count: 1,
      note,
    });
  }

  function rollup(n: AtlasNode): number {
    if (n.note) {
      n.count = 1;
      return 1;
    }
    n.count = (n.children ?? []).reduce((s, c) => s + rollup(c), 0);
    return n.count;
  }
  rollup(root);
  return root;
}

export function findAtlasNode(root: AtlasNode, id: string): AtlasNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findAtlasNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

export function collectNotes(node: AtlasNode): NoteUnit[] {
  if (node.note) return [node.note];
  return (node.children ?? []).flatMap(collectNotes);
}

export const DEMO_NOTES = buildNoteUnits();
export const DEMO_ATLAS = buildKnowledgeAtlas(DEMO_NOTES);
