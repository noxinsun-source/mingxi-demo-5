/**
 * 多模态核心 · 输入类型与规范存储
 *
 * 产品不变量（见 docs/mingxi/07-multimodal-core.md）：
 *   任意来源 → 最终只持久化「文字单元 + 图片单元」
 *   语音 → 转写文字；视频 → 转写文字 + 分镜关键帧图
 *   无权限链接（如小红书）→ 手机悬浮球本机捕获（截图/存图/存文）
 */

import type { PurposeLabel } from "../types.ts";

/* ------------------------------------------------------------------ */
/* 1. 捕获通道：笔记是怎么进来的                                         */
/* ------------------------------------------------------------------ */

/** 用户侧入口通道（与具体文件格式正交） */
export type CaptureChannel =
  | "file_import" // 本地文件导入（PDF/Word/PPT/音视频/图片）
  | "url_fetch" // 可公开拉取的链接（网页 / 可抓 API）
  | "phone_floatball" // 手机悬浮球：本机浏览时捕获
  | "system_share" // 系统分享面板丢进来
  | "paste_text"; // 纯粘贴文字

/* ------------------------------------------------------------------ */
/* 2. 原始输入模态：用户感知的「这是什么」                                 */
/* ------------------------------------------------------------------ */

/**
 * 原始输入类型 —— Agent / UI 分类用。
 * 注意：这是「入口形态」，不是最终存储形态。
 */
export type RawInputKind =
  | "pdf"
  | "docx"
  | "pptx"
  | "webpage"
  | "social_link" // 含小红书/X 等可能无正文权限的链接
  | "audio"
  | "video"
  | "image"
  | "screenshot"
  | "plain_text"
  | "chat_export"
  | "table"
  | "mixed_bundle"; // 悬浮球一次会话里混入文+图

/* ------------------------------------------------------------------ */
/* 3. 访问态：能不能拿到远端正文                                         */
/* ------------------------------------------------------------------ */

export type AccessStatus =
  | "ok" // 完整拿到正文/媒体
  | "partial" // 拿到一部分（如 PDF 前 N 页、ASR 片段）
  | "unavailable" // 无权限 / 登录墙 / 反爬 —— 只能索引链接
  | "phone_captured" // 远端不可用，但用户本机已补齐截图/文字
  | "pending"; // 异步处理中（ASR / 分镜）

/* ------------------------------------------------------------------ */
/* 4. 手机悬浮球：无权限场景的本机补齐                                    */
/* ------------------------------------------------------------------ */

/** 悬浮球一次点击对应的动作 */
export type FloatBallAction =
  | "screenshot" // 截当前屏 → 图片（后续 OCR → 文字）
  | "save_image" // 长按/点选保存帖内配图
  | "save_text" // 用户框选/复制可见文字
  | "save_link_index" // 仅存 URL + 标题，正文 unavailable
  | "save_page_visible"; // 保存当前可见 DOM 文本（WebView 内）

export interface FloatBallCapture {
  action: FloatBallAction;
  /** 捕获瞬间的页面 URL（即便 AI 打不开） */
  pageUrl?: string;
  pageTitle?: string;
  appHint?: string; // 如「小红书」（用户侧标注，非爬取）
  /** 动作载荷 */
  payload:
    | { type: "image"; localPath: string; mime?: string }
    | { type: "text"; text: string }
    | { type: "link"; url: string; title?: string };
  capturedAt: string;
}

/* ------------------------------------------------------------------ */
/* 5. 原始捕获信封：进入多模态核心前的统一入参                             */
/* ------------------------------------------------------------------ */

export interface CaptureAssetRef {
  /** 本地路径、data URI、或远端 URL */
  uri: string;
  mime?: string;
  /** 可选字节哈希，去重用 */
  sha256?: string;
}

/**
 * 一次「笔记捕获」的完整输入。
 * Agent 工具 `normalize_multimodal` 的主入参。
 */
export interface CaptureEnvelope {
  id?: string;
  channel: CaptureChannel;
  kind: RawInputKind;
  titleHint?: string;
  /** 可为人声明的 C2，或「待定」等事后确认 */
  purposeLabel?: PurposeLabel | "待定";
  knowledgePath?: string[];
  /** 主资源（文件 / 链接） */
  primary?: CaptureAssetRef;
  /** 附加资源（多图、附件） */
  attachments?: CaptureAssetRef[];
  /** 已有明文（粘贴 / 悬浮球存文 / 预转写） */
  seedText?: string;
  /** 手机悬浮球产生的本机片段 */
  floatBall?: FloatBallCapture[];
  /** 显式访问态；不填则由 normalize 推断 */
  accessHint?: AccessStatus;
  meta?: Record<string, string | number | boolean>;
}

/* ------------------------------------------------------------------ */
/* 6. 规范存储：一切最终只落这两种原子                                    */
/* ------------------------------------------------------------------ */

export type TextRole =
  | "title"
  | "body"
  | "transcript" // 语音/视频转写
  | "ocr" // 图片/截图 OCR
  | "caption" // 图注
  | "subtitle" // 视频字幕轨
  | "comment"
  | "meta";

export type ImageRole =
  | "page_render" // PDF/PPT 页渲染
  | "screenshot" // 悬浮球截屏 / 禁复制页
  | "photo"
  | "video_keyframe" // 视频分镜关键帧
  | "cover"
  | "diagram"
  | "attachment";

export interface TextUnit {
  id: string;
  role: TextRole;
  text: string;
  /** 页码 / 时间码 / 字符区间 / 图上框 */
  locator?:
    | { type: "page"; page: number }
    | { type: "timecode"; seconds: [number, number] }
    | { type: "span"; start: number; end: number }
    | { type: "bbox"; bbox: [number, number, number, number]; imageId?: string };
  confidence?: number;
  source: "extract" | "asr" | "ocr" | "human" | "llm_caption";
}

export interface ImageUnit {
  id: string;
  role: ImageRole;
  /** 落盘路径或 data URI */
  uri: string;
  mime?: string;
  width?: number;
  height?: number;
  /** 关键帧对应时间（秒） */
  atSeconds?: number;
  /** 场景切换序号 */
  sceneIndex?: number;
  caption?: string;
  /** OCR 结果回填到 texts，这里只留指针 */
  ocrTextIds?: string[];
}

/**
 * 规范笔记介质 —— 多模态核心的唯一持久化形态。
 * UI 卡片、Material、Agent 上下文都从此派生。
 */
export interface CanonicalMedia {
  id: string;
  title: string;
  /** 入口形态（审计/展示用，不决定存储） */
  rawKind: RawInputKind;
  channel: CaptureChannel;
  access: AccessStatus;
  sourceUri?: string;
  appHint?: string;
  capturedAt: string;
  texts: TextUnit[];
  images: ImageUnit[];
  /** 可为人声明的 C2，或「待定」等事后确认 */
  purposeLabel?: PurposeLabel | "待定";
  knowledgePath?: string[];
  warnings: string[];
  /** 处理管线步骤记录 */
  pipeline: string[];
}

/* ------------------------------------------------------------------ */
/* 7. 处理步骤：多模态核心怎么把入口变成规范存储                           */
/* ------------------------------------------------------------------ */

export type PipelineStepId =
  | "classify"
  | "fetch_or_index"
  | "extract_document"
  | "asr_transcribe"
  | "video_scene_split"
  | "ocr_images"
  | "phone_merge"
  | "pack_card";

export interface PipelineStepSpec {
  id: PipelineStepId;
  title: string;
  /** 哪些入口会触发 */
  when: RawInputKind[] | "*";
  produces: Array<"text" | "image">;
  notes: string;
}
