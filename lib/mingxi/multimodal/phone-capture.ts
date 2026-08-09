/**
 * 手机悬浮球捕获 → 文字/图片单元
 *
 * 远端不可访问（小红书等）时，用户本机浏览 + 悬浮球补齐，
 * 不依赖爬虫权限。
 */
import type { FloatBallCapture, ImageUnit, TextUnit } from "./types.ts";

export function mergeFloatBallCaptures(captures: FloatBallCapture[]): {
  texts: TextUnit[];
  images: ImageUnit[];
  warnings: string[];
  accessUpgrade: "phone_captured" | "unavailable" | null;
} {
  const texts: TextUnit[] = [];
  const images: ImageUnit[] = [];
  const warnings: string[] = [];
  let gotContent = false;

  captures.forEach((c, i) => {
    const base = `fb_${i + 1}`;
    if (c.payload.type === "text") {
      gotContent = true;
      texts.push({
        id: `${base}_text`,
        role: "body",
        text: c.payload.text,
        source: "human",
      });
    } else if (c.payload.type === "image") {
      gotContent = true;
      const imgId = `${base}_img`;
      images.push({
        id: imgId,
        role: c.action === "screenshot" ? "screenshot" : "photo",
        uri: c.payload.localPath,
        mime: c.payload.mime,
        caption:
          c.action === "screenshot"
            ? `悬浮球截屏 · ${c.pageTitle ?? c.appHint ?? "本机"}`
            : `悬浮球存图 · ${c.pageTitle ?? ""}`,
      });
      // OCR 占位：真实 OCR 由多模态核心异步回填；此处不假装识别出文字
      warnings.push(`${imgId}：待 OCR（多模态核心）`);
    } else if (c.payload.type === "link") {
      texts.push({
        id: `${base}_link`,
        role: "meta",
        text: `链接索引：${c.payload.title ?? ""} ${c.payload.url}`.trim(),
        source: "human",
      });
      if (!gotContent) {
        warnings.push("仅保存了链接索引，正文需截图/存文补齐");
      }
    }

    if (c.pageUrl && i === 0) {
      texts.push({
        id: `${base}_src`,
        role: "meta",
        text: `来源页：${c.pageTitle ?? ""} ${c.pageUrl}`.trim(),
        source: "human",
      });
    }
  });

  return {
    texts,
    images,
    warnings,
    accessUpgrade: gotContent ? "phone_captured" : captures.length ? "unavailable" : null,
  };
}
