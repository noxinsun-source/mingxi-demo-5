/**
 * 统一笔记样式 · NoteRecord → 单文件 HTML
 *
 * 设计原则：
 * - 渲染由确定性代码完成（样式统一、可批量再生成），LLM 只产理解 JSON
 * - 白底清新配色，文字 / 结构逻辑图 / 插图 都有固定区块
 * - 三层理解各占一个色块：内容本身 / 原文语境 / 我的用途
 */
import type { NoteRecord } from "./types.ts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chips(items: string[], cls: string): string {
  return items
    .filter(Boolean)
    .map((x) => `<span class="chip ${cls}">${esc(x)}</span>`)
    .join("");
}

function flowDiagram(steps: string[]): string {
  if (!steps.length) return "";
  const boxes = steps
    .map(
      (s, i) => `
      <div class="flow-step">
        <div class="flow-box">${esc(s)}</div>
        ${i < steps.length - 1 ? '<div class="flow-arrow">→</div>' : ""}
      </div>`,
    )
    .join("");
  return `
  <section class="card">
    <h2><span class="dot dot-struct"></span>原文结构逻辑</h2>
    <div class="flow">${boxes}</div>
  </section>`;
}

function polarityLabel(p: NoteRecord["tags"]["polarity"]): string {
  switch (p) {
    case "positive_exemplar":
      return "正面范例";
    case "negative_caution":
      return "反例警示";
    case "mixed":
      return "利弊混合";
    default:
      return "中性观察";
  }
}

/** 图片区：双 caption（层1 画面内容 + 层2 原文角色） */
function imagesSection(record: NoteRecord, assetHref: (uri: string) => string): string {
  if (!record.media.images.length) return "";
  const findings = new Map(
    record.understanding.content.imageFindings.map((f) => [f.imageId, f]),
  );
  const roles = new Map(
    record.understanding.contextRole.imageRoles.map((f) => [f.imageId, f]),
  );
  const figs = record.media.images
    .map((img) => {
      const f = findings.get(img.id);
      const r = roles.get(img.id);
      return `
      <figure class="img-item">
        <img src="${esc(assetHref(img.uri))}" alt="${esc(img.caption ?? img.id)}" loading="lazy" />
        <figcaption>
          <div class="img-tag">${esc(img.role)}</div>
          ${f?.whatItShows ? `<p><strong>画面内容</strong>${esc(f.whatItShows)}</p>` : ""}
          ${
            f?.visibleText
              ? `<p class="ocr"><strong>可见文字</strong>${esc(f.visibleText.slice(0, 160))}${f.visibleText.length > 160 ? "…" : ""}</p>`
              : ""
          }
          ${
            r?.role
              ? `<p class="role"><strong>原文角色</strong>${esc(r.role)}${r.supportsClaim ? ` · 支撑观点：${esc(r.supportsClaim)}` : ""}</p>`
              : ""
          }
        </figcaption>
      </figure>`;
    })
    .join("");
  return `
  <section class="card">
    <h2><span class="dot dot-img"></span>图片单元（${record.media.images.length}）</h2>
    <div class="img-grid">${figs}</div>
  </section>`;
}

export function renderNoteHtml(
  record: NoteRecord,
  opts: { assetHref?: (uri: string) => string } = {},
): string {
  const u = record.understanding;
  const assetHref = opts.assetHref ?? ((uri: string) => uri);
  const fullText = record.media.texts
    .filter((t) => t.role === "body" || t.role === "transcript")
    .map((t) => t.text)
    .join("\n\n");

  const inferredRows = u.personalUse.inferredUses
    .map(
      (x) => `
      <li>
        <span class="use-name">${esc(x.use)}</span>
        <span class="use-conf">${Math.round(x.confidence * 100)}%</span>
        <div class="use-why">${esc(x.why)}</div>
      </li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(record.title)} · 明晰笔记</title>
<style>
  :root {
    --ink: #22333b; --muted: #6d8087; --line: #e3ecef;
    --sky: #eaf5fb; --sky-ink: #1a5f7a;
    --mint: #e7f6f0; --mint-ink: #0f6b5c;
    --lilac: #f0ecfb; --lilac-ink: #5b3d9a;
    --lemon: #fdf6dd; --lemon-ink: #7a5c00;
    --peach: #fdeee2; --peach-ink: #9a4d1c;
    --rose: #fdeaee; --rose-ink: #9a3040;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #fff; color: var(--ink);
    font: 16px/1.75 "PingFang SC", "Noto Sans SC", -apple-system, sans-serif;
  }
  .page { max-width: 880px; margin: 0 auto; padding: 40px 24px 80px; }
  header h1 { font-size: 26px; line-height: 1.4; margin: 0 0 10px; }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
  .meta a { color: var(--sky-ink); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 4px; }
  .chip {
    display: inline-block; padding: 3px 12px; border-radius: 999px;
    font-size: 13px; font-weight: 600;
  }
  .chip.domain { background: var(--sky); color: var(--sky-ink); }
  .chip.purpose { background: var(--lemon); color: var(--lemon-ink); }
  .chip.func { background: var(--lilac); color: var(--lilac-ink); }
  .chip.polarity { background: var(--rose); color: var(--rose-ink); }
  .chip.kw { background: #f2f6f7; color: var(--muted); font-weight: 500; }
  .card {
    border: 1px solid var(--line); border-radius: 16px;
    padding: 20px 24px; margin-top: 20px; background: #fff;
  }
  .card h2 {
    font-size: 16px; margin: 0 0 12px; display: flex; align-items: center; gap: 8px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .dot-l1 { background: #4db89a; } .dot-l2 { background: #9b86d4; }
  .dot-l3 { background: #e0a54a; } .dot-struct { background: #6aa8c4; }
  .dot-img { background: #c97886; } .dot-src { background: #8eb0b8; }
  .layer { border-left: 4px solid; border-radius: 12px; padding: 14px 18px; margin-top: 12px; }
  .layer h3 { margin: 0 0 6px; font-size: 14px; }
  .layer p { margin: 4px 0; }
  .layer.l1 { background: var(--mint); border-color: #4db89a; }
  .layer.l1 h3 { color: var(--mint-ink); }
  .layer.l2 { background: var(--lilac); border-color: #9b86d4; }
  .layer.l2 h3 { color: var(--lilac-ink); }
  .layer.l3 { background: var(--lemon); border-color: #e0c44a; }
  .layer.l3 h3 { color: var(--lemon-ink); }
  ul.points { margin: 6px 0 2px; padding-left: 20px; }
  ul.points li { margin: 3px 0; }
  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .flow-step { display: flex; align-items: center; gap: 4px; }
  .flow-box {
    background: var(--sky); color: var(--sky-ink); border: 1px solid #bcdcea;
    border-radius: 10px; padding: 6px 14px; font-size: 14px; font-weight: 600;
  }
  .flow-arrow { color: #6aa8c4; font-weight: 700; padding: 0 2px; }
  .img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .img-item { margin: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .img-item img { width: 100%; display: block; background: #f6f9fa; }
  .img-item figcaption { padding: 10px 12px; font-size: 13px; }
  .img-item figcaption p { margin: 4px 0; }
  .img-item strong {
    display: inline-block; margin-right: 6px; font-size: 12px;
    color: var(--muted); font-weight: 600;
  }
  .img-tag {
    display: inline-block; background: var(--rose); color: var(--rose-ink);
    font-size: 12px; font-weight: 600; border-radius: 6px; padding: 1px 8px; margin-bottom: 4px;
  }
  .ocr { color: var(--muted); }
  .role { color: var(--lilac-ink); }
  ul.uses { list-style: none; margin: 6px 0 0; padding: 0; }
  ul.uses li {
    padding: 8px 12px; border: 1px dashed #e0c44a; border-radius: 10px;
    margin-top: 8px; background: #fffdf4;
  }
  .use-name { font-weight: 700; color: var(--lemon-ink); }
  .use-conf {
    float: right; font-size: 12px; color: var(--muted);
    background: #f2f6f7; border-radius: 999px; padding: 1px 8px;
  }
  .use-why { font-size: 13px; color: var(--muted); margin-top: 2px; }
  .action {
    margin-top: 10px; padding: 10px 14px; border-radius: 10px;
    background: var(--peach); color: var(--peach-ink); font-weight: 600; font-size: 14px;
  }
  details.fulltext { margin-top: 20px; }
  details.fulltext summary {
    cursor: pointer; font-weight: 600; color: var(--sky-ink);
    padding: 10px 0;
  }
  details.fulltext pre {
    white-space: pre-wrap; word-break: break-word; background: #f8fbfc;
    border: 1px solid var(--line); border-radius: 12px; padding: 16px;
    font: 14px/1.7 inherit; max-height: 480px; overflow: auto;
  }
  footer {
    margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 12px;
  }
  footer code { background: #f2f6f7; border-radius: 4px; padding: 1px 6px; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${esc(record.title)}</h1>
    <div class="meta">
      ${esc(record.source.kind)} · ${esc(record.source.channel)} · ${esc(new Date(record.capturedAt).toLocaleString("zh-CN"))}
      ${record.source.uri ? ` · <a href="${esc(record.source.uri)}" target="_blank" rel="noreferrer">原始来源</a>` : ""}
    </div>
    <div class="chips">
      ${chips(record.tags.domainPath, "domain")}
      <span class="chip purpose">${esc(record.tags.purposeLabel)}</span>
      ${chips(record.tags.functionalTypes, "func")}
      <span class="chip polarity">${esc(polarityLabel(record.tags.polarity))}</span>
    </div>
    <div class="chips">${chips(record.tags.keywords, "kw")}</div>
  </header>

  <section class="card">
    <h2><span class="dot dot-l1"></span>三层理解</h2>

    <div class="layer l1">
      <h3>层1 · 内容本身 —— 它讲了什么</h3>
      <p>${esc(u.content.summary)}</p>
      ${
        u.content.keyPoints.length
          ? `<ul class="points">${u.content.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`
          : ""
      }
      ${
        u.content.entities.length
          ? `<p style="margin-top:8px"><strong style="font-size:12px;color:var(--muted)">关键实体</strong>${esc(u.content.entities.join(" · "))}</p>`
          : ""
      }
    </div>

    <div class="layer l2">
      <h3>层2 · 原文语境 —— 它在原文中扮演什么角色</h3>
      <p><strong style="font-size:12px;color:var(--muted)">原文形态</strong>${esc(u.contextRole.sourceForm)}</p>
      ${u.contextRole.argumentRole ? `<p><strong style="font-size:12px;color:var(--muted)">论证定位</strong>${esc(u.contextRole.argumentRole)}</p>` : ""}
    </div>

    <div class="layer l3">
      <h3>层3 · 我的用途 —— 我为什么存这条笔记</h3>
      ${
        u.personalUse.declaredPurpose
          ? `<p><strong style="font-size:12px;color:var(--muted)">我声明的用途</strong>${esc(u.personalUse.declaredPurpose)}</p>`
          : `<p style="color:var(--muted);font-size:13px">未声明用途，以下为 AI 推断的候选：</p>`
      }
      ${inferredRows ? `<ul class="uses">${inferredRows}</ul>` : ""}
      ${u.personalUse.suggestedAction ? `<div class="action">下一步 · ${esc(u.personalUse.suggestedAction)}</div>` : ""}
    </div>
  </section>

  ${flowDiagram(u.contextRole.structureOutline)}

  ${imagesSection(record, assetHref)}

  ${
    fullText
      ? `<details class="fulltext"><summary>原文全文（${fullText.length} 字）</summary><pre>${esc(fullText.slice(0, 12000))}${fullText.length > 12000 ? "\n…（截断）" : ""}</pre></details>`
      : ""
  }

  <footer>
    明晰 · pi 智能笔记 Agent 归纳 · 模型 <code>${esc(record.model)}</code> ·
    管线 ${record.pipeline.map((p) => `<code>${esc(p)}</code>`).join(" → ")}
    ${record.warnings.length ? `<div style="margin-top:6px">提醒：${record.warnings.map((w) => esc(w)).join("；")}</div>` : ""}
  </footer>
</div>
</body>
</html>`;
}
