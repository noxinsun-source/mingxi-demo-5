/**
 * Live canary（set: "canary"）· 8 条
 *
 * 只保存 URL、抓取状态与降级路径，**不保存正文**。
 * 用途：验证「链接 ≠ 内容」这条产品判断，以及各类失败态的诚实降级。
 * 不计入 Agent 智力分数，只做人工回归。
 */
import type { Material } from "../../lib/mingxi/types.ts";
import { mat, purpose } from "./_helpers.ts";

export interface CanaryExpectation {
  materialId: string;
  scenario: string;
  expectedStatus: "ok" | "pending" | "unavailable";
  /** 界面必须给出的诚实说明 */
  expectedMessage: string;
}

export const canaryMaterials: Material[] = [
  mat({
    id: "CN-01",
    set: "canary",
    capturedAt: "2026-08-01T09:00:00+08:00",
    modality: "webpage",
    source: { kind: "link", title: "W3C 无障碍指南 WCAG 2.1", url: "https://www.w3.org/TR/WCAG21/" },
    layers: { visibleText: "", fullTextStatus: "pending" },
    blocks: [],
    purpose: purpose("资料收藏"),
    tags: ["canary", "稳定官方页"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-02",
    set: "canary",
    capturedAt: "2026-08-01T09:05:00+08:00",
    modality: "pdf",
    source: { kind: "link", title: "公开论文摘要页", url: "https://arxiv.org/abs/1706.03762" },
    layers: { visibleText: "", fullTextStatus: "pending" },
    blocks: [],
    purpose: purpose("资料收藏"),
    tags: ["canary", "公开 PDF"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-03",
    set: "canary",
    capturedAt: "2026-08-01T09:10:00+08:00",
    modality: "webpage",
    source: {
      kind: "link",
      title: "MDN · 屏幕捕获 API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API",
    },
    layers: { visibleText: "", fullTextStatus: "pending" },
    blocks: [],
    purpose: purpose("资料收藏"),
    tags: ["canary", "官方文档"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-04",
    set: "canary",
    capturedAt: "2026-08-01T09:15:00+08:00",
    modality: "webpage",
    source: { kind: "link", title: "会重定向的规范页", url: "https://peps.python.org/pep-0008/" },
    layers: { visibleText: "", fullTextStatus: "pending" },
    blocks: [],
    purpose: purpose("资料收藏"),
    tags: ["canary", "重定向"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-05",
    set: "canary",
    capturedAt: "2026-08-01T09:20:00+08:00",
    modality: "social_post",
    source: { kind: "link", title: "社交平台帖子（登录墙）", url: "https://www.xiaohongshu.com/explore" },
    layers: { visibleText: "", fullTextStatus: "unavailable" },
    blocks: [],
    purpose: purpose("对标拆解"),
    tags: ["canary", "登录墙"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-06",
    set: "canary",
    capturedAt: "2026-08-01T09:25:00+08:00",
    modality: "social_post",
    source: { kind: "link", title: "社交平台时间线（登录墙）", url: "https://x.com/home" },
    layers: { visibleText: "", fullTextStatus: "unavailable" },
    blocks: [],
    purpose: purpose("对标拆解"),
    tags: ["canary", "登录墙"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-07",
    set: "canary",
    capturedAt: "2026-08-01T09:30:00+08:00",
    modality: "video",
    source: { kind: "link", title: "视频页（只取公开元数据）", url: "https://www.bilibili.com/video/BV1xx411c7mD" },
    layers: { visibleText: "", fullTextStatus: "unavailable" },
    blocks: [],
    purpose: purpose("对标拆解"),
    tags: ["canary", "视频元数据"], license: "link-only", painPoint: "F",
  }),
  mat({
    id: "CN-08",
    set: "canary",
    capturedAt: "2026-08-01T09:35:00+08:00",
    modality: "webpage",
    source: { kind: "link", title: "已失效链接", url: "https://example.invalid/this-page-is-gone" },
    layers: { visibleText: "", fullTextStatus: "unavailable" },
    blocks: [],
    purpose: purpose("资料收藏"),
    tags: ["canary", "死链"], license: "link-only", painPoint: "F",
  }),
];

export const canaryExpectations: CanaryExpectation[] = [
  { materialId: "CN-01", scenario: "稳定官方规范页", expectedStatus: "pending", expectedMessage: "可解析全文正在后台补全，不影响你现在使用" },
  { materialId: "CN-02", scenario: "公开论文摘要页", expectedStatus: "pending", expectedMessage: "可解析全文正在后台补全，不影响你现在使用" },
  { materialId: "CN-03", scenario: "官方文档", expectedStatus: "pending", expectedMessage: "可解析全文正在后台补全，不影响你现在使用" },
  { materialId: "CN-04", scenario: "URL 发生重定向", expectedStatus: "pending", expectedMessage: "链接已跳转到新地址，已记录新地址" },
  { materialId: "CN-05", scenario: "社交平台登录墙", expectedStatus: "unavailable", expectedMessage: "这个链接的正文绑在你的登录态里，明晰不会去爬。要存正文请在 App 里打开后用悬浮球捕获" },
  { materialId: "CN-06", scenario: "社交平台登录墙", expectedStatus: "unavailable", expectedMessage: "这个链接的正文绑在你的登录态里，明晰不会去爬。要存正文请在 App 里打开后用悬浮球捕获" },
  { materialId: "CN-07", scenario: "视频页", expectedStatus: "unavailable", expectedMessage: "只保存了公开元数据；字幕需要你在播放页捕获" },
  { materialId: "CN-08", scenario: "死链", expectedStatus: "unavailable", expectedMessage: "链接已失效，只保留了地址与捕获时间" },
];
