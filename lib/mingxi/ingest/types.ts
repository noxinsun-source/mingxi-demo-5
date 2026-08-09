/**
 * 多模态摄入 · 类型
 *
 * 目标：PDF / PPT / Word / 网页链接 / 音视频 → 统一 IngestArtifact → Material / NoteUnit
 */
export type IngestKind =
  | "web"
  | "pdf"
  | "docx"
  | "pptx"
  | "audio"
  | "video"
  | "text";

export interface IngestSource {
  /** 本地路径或 http(s) URL */
  uri: string;
  kind?: IngestKind;
  titleHint?: string;
  purposeLabel?:
    | "学习理论"
    | "概念学习"
    | "资料收藏"
    | "反例避坑"
    | "对标拆解"
    | "素材金句"
    | "待办行动";
  knowledgePath?: string[];
}

export interface IngestBlock {
  text: string;
  kind: "标题" | "正文" | "要点" | "字幕" | "口述" | "表格" | "引用";
  /** 页码 / 时间码等 */
  locator:
    | { type: "page"; page: number }
    | { type: "timecode"; seconds: [number, number] }
    | { type: "span"; start: number; end: number };
}

export interface IngestArtifact {
  id: string;
  kind: IngestKind;
  title: string;
  sourceUri: string;
  provider: string;
  capturedAt: string;
  /** 连续全文 / 快照正文 */
  fullText: string;
  /** 落盘快照路径（markdown / txt） */
  snapshotPath?: string;
  blocks: IngestBlock[];
  meta?: Record<string, string | number | boolean>;
  warnings: string[];
}
