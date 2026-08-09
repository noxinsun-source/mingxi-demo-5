"use client";

import type { NoteUnit } from "@/lib/mingxi/knowledge-atlas";
import { Badge } from "./shared";

/**
 * 统一笔记卡片 —— 每条原料不论来自 PDF / 视频 / 网页 / 语音，
 * 都压成同一套信息架构，再点进「全文」看快照或转写。
 *
 * 卡片文字结构（固定 6 槽）：
 *  1. 模态 + 正文形态角标（视频转写 / 网页快照…）
 *  2. 标题
 *  3. 一句话摘要
 *  4. 客观知识路径
 *  5. 用途（学习型/创作型 · 细分标签）
 *  6. 操作：打开全文
 */
export function NoteUnitCard({
  note,
  onOpen,
  compact,
}: {
  note: NoteUnit;
  onOpen: (note: NoteUnit) => void;
  compact?: boolean;
}) {
  return (
    <article
      className={`mx-note-card${compact ? " is-compact" : ""}`}
      style={{ ["--note-accent" as string]: note.accent }}
    >
      <button type="button" className="mx-note-card-body" onClick={() => onOpen(note)}>
        <div className="mx-note-card-top">
          <span className="mx-note-mod">{note.modalityLabel}</span>
          <span className="mx-note-bodykind">{note.bodyKindLabel}</span>
          <Badge kind="Fixture" />
        </div>
        <h3>{note.title}</h3>
        <p className="mx-note-summary">{note.summary}</p>
        <div className="mx-note-path">{note.knowledgePath.join(" / ")}</div>
        {note.tagLayers?.domain?.keywords?.length ? (
          <div className="mx-note-keywords">
            {note.tagLayers.domain.keywords.slice(0, 5).map((k) => (
              <span key={k} className="mx-note-kw">
                {k}
              </span>
            ))}
          </div>
        ) : null}
        {note.tagLayers?.user?.length ? (
          <div className="mx-note-user-tags">
            {note.tagLayers.user.slice(0, 4).map((t) => (
              <span key={t.id} className="mx-note-user-tag">
                {t.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mx-note-meta">
          <span>
            {note.track} · {note.purposeLabel}
          </span>
          <span>{note.sourceLabel}</span>
        </div>
      </button>
      <div className="mx-note-card-actions">
        <button type="button" onClick={() => onOpen(note)}>
          打开全文
        </button>
      </div>
    </article>
  );
}

/** 全文抽屉：按模态展示网页快照 / 视频转写 / PDF 页文等 */
export function NoteDetailSheet({
  note,
  onClose,
}: {
  note: NoteUnit;
  onClose: () => void;
}) {
  return (
    <div className="mx-drawer" onClick={onClose}>
      <div className="mx-drawer-panel mx-note-detail" onClick={(e) => e.stopPropagation()}>
        <div className="mx-note-detail-head">
          <div>
            <div className="mx-note-card-top" style={{ marginBottom: 8 }}>
              <span className="mx-note-mod">{note.modalityLabel}</span>
              <span className="mx-note-bodykind">{note.bodyKindLabel}</span>
              <Badge kind="Fixture" />
            </div>
            <h2>{note.title}</h2>
            <p className="mx-note-path">{note.knowledgePath.join(" / ")}</p>
            {note.tagLayers?.domain?.theme ? (
              <p className="mx-note-summary" style={{ marginTop: 8 }}>
                {note.tagLayers.domain.theme}
              </p>
            ) : null}
            {note.tagLayers?.domain?.imageCaption ? (
              <p className="mx-note-summary" style={{ marginTop: 6, opacity: 0.85 }}>
                图述：{note.tagLayers.domain.imageCaption}
              </p>
            ) : null}
          </div>
          <button type="button" className="mx-btn ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="mx-note-detail-banner">
          {note.bodyKind === "video_transcript" && "以下为视频音轨转写（仿真）—— 按时间码切块，可回点。"}
          {note.bodyKind === "web_snapshot" && "以下为捕获时的网页可见文本快照 —— 链接只做索引，正文来自本机所见。"}
          {note.bodyKind === "pdf_pages" && "以下为 PDF 抽取页文 —— 每块带页码定位。"}
          {note.bodyKind === "voice_transcript" && "以下为语音口述转写。"}
          {note.bodyKind === "social_thread" && "以下为社交帖仿真正文（虚构品牌，非真实平台抓取）。"}
          {note.bodyKind === "chat_log" && "以下为聊天实录片段。"}
          {note.bodyKind === "table_sheet" && "以下为表格结构化条目。"}
          {note.bodyKind === "photo_board" && "以下为图片对照说明文字。"}
          {note.bodyKind === "screenshot" && "以下为屏幕快照 OCR 块。"}
        </div>

        <div className="mx-note-detail-meta">
          <span>
            {note.track} · {note.purposeLabel}
          </span>
          <span>{note.author ?? note.sourceLabel}</span>
          <span>{note.capturedAt.slice(0, 10)}</span>
        </div>

        <div className="mx-sim-screen" style={{ marginTop: 12 }}>
          {note.blocks.map((b) => (
            <div key={b.id} className="mx-block">
              <span style={{ fontSize: 10, color: "var(--mx-muted)" }}>{b.kind}</span>
              <div>{b.text}</div>
            </div>
          ))}
        </div>

        {note.fullTextPreview && note.fullTextPreview !== note.summary && (
          <details className="mx-note-fulltext">
            <summary>展开连续全文预览</summary>
            <pre>{note.fullTextPreview}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
