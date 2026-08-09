/**
 * 两层标签模型
 *
 * 1) domain — AI 按知识内容理解打的层级领域标签（门类→一级学科→二级→主题）
 * 2) user   — 用户自定义功能性/个性化标签（参考素材、文笔、待办…）
 *
 * 旭日图 / 目录树默认按 domain.path 展开。
 */
export type DomainLevel = 1 | 2 | 3 | 4;

export interface DomainTagLayer {
  /** 层级路径，如 ["工学","计算机科学与技术","人工智能","检索增强生成"] */
  path: string[];
  /** 关键词（内容字面义） */
  keywords: string[];
  /** 主旨大意（1–2 句） */
  theme: string;
  /** 置信度 0–1 */
  confidence?: number;
  /** 打标模型 */
  model?: string;
  taggedAt?: string;
  /** 多模态：图像内容描述（截图/照片） */
  imageCaption?: string;
}

export interface UserTag {
  id: string;
  /** 展示名，如「参考运动素材」「文笔参考」 */
  label: string;
  note?: string;
  createdAt?: string;
}

export interface NoteTagLayers {
  domain: DomainTagLayer;
  user: UserTag[];
}

export function emptyDomain(path: string[] = ["未分类", "待标注"]): DomainTagLayer {
  return {
    path,
    keywords: [],
    theme: "",
  };
}

export function emptyTagLayers(path?: string[]): NoteTagLayers {
  return { domain: emptyDomain(path), user: [] };
}

/** 旭日图用路径：优先 AI 领域层 */
export function atlasPathOf(card: {
  tagLayers?: NoteTagLayers | null;
  knowledgePath?: string[];
}): string[] {
  const p = card.tagLayers?.domain?.path;
  if (p && p.length >= 2) return p;
  if (card.knowledgePath?.length) return card.knowledgePath;
  return ["未分类", "其他"];
}
