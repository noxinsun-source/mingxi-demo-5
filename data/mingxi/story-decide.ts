/**
 * Demo 集 · 交汇线（storyLine: "decide"）
 * 主题：「这周先发图文还是先做视频」
 *
 * 把学习线与创作线的素材汇进同一张决断卡。
 * MX-D03 故意是一条**过期规则**，用来触发外查（A5）的冲突检出与习得修订（A7）。
 */
import type { Material } from "../../lib/mingxi/types.ts";
import { b, bbox, mat, purpose, tc } from "./_helpers.ts";

export const storyDecide: Material[] = [
  mat({
    id: "MX-D01",
    set: "demo",
    storyLine: "decide",
    capturedAt: "2026-07-30T21:10:00+08:00",
    modality: "table",
    source: { kind: "screen", appHint: "创作者中心", title: "我的账号近 30 天数据" },
    blocks: [
      b(
        "MX-D01-b1",
        "数据",
        "我的图文近 30 天：完播/读完率 58%，涨粉 214。",
        {
          locator: bbox(20, 110, 520, 36),
          strength: "强",
          polarity: "支持",
          at: "2026-07",
          topics: ["数据", "图文"],
        },
      ),
      b(
        "MX-D01-b2",
        "数据",
        "我的视频近 30 天：完播率 21%，涨粉 96，但单条最高播放是图文的 5 倍。",
        {
          locator: bbox(20, 154, 520, 40),
          strength: "强",
          polarity: "中立",
          at: "2026-07",
          topics: ["数据", "视频"],
        },
      ),
      b(
        "MX-D01-b3",
        "数据",
        "图文的收藏率是视频的 3.2 倍，说明我的内容偏「留着看」而不是「刷过就走」。",
        {
          locator: bbox(20, 198, 520, 40),
          strength: "强",
          polarity: "支持",
          at: "2026-07",
          topics: ["数据", "图文"],
          causal: "果",
        },
      ),
    ],
    purpose: purpose("资料收藏", { note: "决策依据" }),
    tags: ["自有数据", "决策"],
    license: "owned",
    painPoint: "D",
  }),

  mat({
    id: "MX-D02",
    set: "demo",
    storyLine: "decide",
    capturedAt: "2026-07-31T07:55:00+08:00",
    modality: "voice",
    source: { kind: "voice", title: "口述 · 本周时间预算" },
    blocks: [
      b(
        "MX-D02-b1",
        "口述",
        "这周能用来做内容的时间大概只有六个小时，周三周四基本没空。",
        {
          locator: tc(0, 10),
          strength: "中",
          polarity: "中立",
          at: "2026-07",
          topics: ["约束", "时间"],
          causal: "因",
        },
      ),
      b(
        "MX-D02-b2",
        "口述",
        "我不想为了赶进度做一个自己都不满意的视频。",
        {
          locator: tc(11, 20),
          strength: "弱",
          polarity: "反对",
          at: "2026-07",
          topics: ["约束", "视频"],
        },
      ),
    ],
    purpose: purpose("待办行动", { note: "约束条件" }),
    tags: ["约束", "时间"],
    license: "owned",
    painPoint: "A",
  }),

  mat({
    id: "MX-D03",
    set: "demo",
    storyLine: "decide",
    capturedAt: "2026-07-31T08:20:00+08:00",
    modality: "webpage",
    source: {
      kind: "screen",
      appHint: "创作者中心",
      title: "流量扶持公告（我半年前存的）",
      url: "https://example.invalid/notice/2025-12",
    },
    blocks: [
      b(
        "MX-D03-b1",
        "要点",
        "本季度对视频类目给予额外流量扶持，图文类目不参与。",
        {
          locator: bbox(24, 100, 620, 44),
          strength: "中",
          polarity: "支持",
          at: "2025-12",
          topics: ["平台规则", "视频"],
        },
      ),
      b(
        "MX-D03-b2",
        "正文",
        "扶持周期自公告之日起三个月内有效。",
        {
          locator: bbox(24, 156, 620, 36),
          strength: "中",
          polarity: "中立",
          at: "2025-12",
          topics: ["平台规则"],
        },
      ),
    ],
    purpose: purpose("资料收藏", { note: "当时看到就存了" }),
    tags: ["平台规则", "可能过期"],
    license: "synthetic",
    flags: ["outdated", "contradiction"],
    painPoint: "D",
  }),

  mat({
    id: "MX-D04",
    set: "demo",
    storyLine: "decide",
    capturedAt: "2026-07-31T08:35:00+08:00",
    modality: "social_post",
    source: {
      kind: "screen",
      appHint: "灵感街",
      title: "同行经验：先图文测试选题，跑通再做视频",
      author: "@做号笔记（仿真）",
    },
    blocks: [
      b(
        "MX-D04-b1",
        "正文",
        "我的做法是先用图文低成本测选题，数据过线再投入做视频。",
        {
          locator: bbox(16, 300, 343, 48),
          strength: "弱",
          polarity: "支持",
          at: "2026-06",
          topics: ["策略", "图文"],
          causal: "因",
        },
      ),
      b(
        "MX-D04-b2",
        "评论",
        "有人反驳：这样会错过视频的冷启动窗口，选题热度过了就没了。",
        {
          locator: bbox(16, 360, 343, 48),
          strength: "弱",
          polarity: "反对",
          at: "2026-06",
          topics: ["策略", "视频", "风险"],
        },
      ),
    ],
    purpose: purpose("资料收藏"),
    tags: ["同行经验", "策略"],
    license: "synthetic",
    painPoint: "D",
  }),
];
