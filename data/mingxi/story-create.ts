/**
 * Demo 集 · 创作线（storyLine: "create"）
 * 主题：「做一期讲间隔重复的科普内容」
 *
 * 与学习线共享主题宇宙：学到的东西要产出，交汇线才自然。
 * 用途以创作型为主（对标拆解 / 素材金句 / 待办行动），
 * 用来演示「同一份社交帖，用途＝对标拆解时主资产是结构而不是知识」。
 *
 * 所有素材为仿真生成，品牌名与作者虚构，不含真实用户数据。
 */
import type { Material } from "../../lib/mingxi/types.ts";
import { b, bbox, mat, purpose, tc } from "./_helpers.ts";

export const storyCreate: Material[] = [
  mat({
    id: "MX-C01",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-27T10:05:00+08:00",
    modality: "social_post",
    source: {
      kind: "screen",
      appHint: "灵感街",
      title: "21 天，我把 5000 个词塞进脑子（附我的表）",
      author: "@阿柚学习中（仿真）",
    },
    blocks: [
      b(
        "MX-C01-b1",
        "标题",
        "21 天，我把 5000 个词塞进脑子（附我的表）",
        {
          locator: bbox(16, 268, 343, 44),
          strength: "中",
          polarity: "中立",
          at: "2026-06",
          topics: ["钩子", "标题手法"],
        },
      ),
      b(
        "MX-C01-b2",
        "正文",
        "开头第一句就抛结果：「第 21 天我做了一次测试，正确率 91%」，先给证据再讲方法。",
        {
          locator: bbox(16, 324, 343, 60),
          strength: "中",
          polarity: "支持",
          at: "2026-06",
          topics: ["结构", "钩子"],
          causal: "因",
        },
      ),
      b(
        "MX-C01-b3",
        "正文",
        "中段用三个小标题拆步骤，每段不超过 4 行，手机上一屏能看完一段。",
        {
          locator: bbox(16, 396, 343, 60),
          strength: "中",
          polarity: "支持",
          at: "2026-06",
          topics: ["结构", "排版"],
        },
      ),
      b(
        "MX-C01-b4",
        "正文",
        "结尾 CTA 是「评论区扣 1 我发表格」，把互动指标和资料诱饵绑在一起。",
        {
          locator: bbox(16, 468, 343, 52),
          strength: "中",
          polarity: "中立",
          at: "2026-06",
          topics: ["CTA", "结构"],
        },
      ),
      b(
        "MX-C01-b5",
        "评论",
        "热评第一：「21 天 5000 个是不是有点夸张了」——被作者置顶并回复，反而拉高了停留时长。",
        {
          locator: bbox(16, 540, 343, 60),
          strength: "弱",
          polarity: "反对",
          at: "2026-06",
          topics: ["风险", "CTA"],
        },
      ),
    ],
    purpose: purpose("对标拆解", { note: "只看它的结构，不学它的观点" }),
    tags: ["对标", "爆款结构"],
    license: "synthetic",
    painPoint: "B",
  }),

  mat({
    id: "MX-C02",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-27T10:22:00+08:00",
    modality: "video",
    source: {
      kind: "screen",
      appHint: "知播",
      title: "三分钟讲清楚：为什么你背了就忘",
      author: "@认知小铺（仿真）",
      url: "https://example.invalid/v/3a71",
    },
    blocks: [
      b(
        "MX-C02-b1",
        "字幕",
        "开场 0–3 秒：「你昨天背的单词，现在还记得几个？」——用提问制造自检。",
        {
          locator: tc(0, 3),
          strength: "中",
          polarity: "支持",
          at: "2026-05",
          topics: ["钩子"],
          causal: "因",
        },
      ),
      b(
        "MX-C02-b2",
        "字幕",
        "4–20 秒抛出反直觉结论：「越努力每天复习，可能忘得越快」。",
        {
          locator: tc(4, 20),
          strength: "中",
          polarity: "中立",
          at: "2026-05",
          topics: ["钩子", "结构"],
        },
      ),
      b(
        "MX-C02-b3",
        "字幕",
        "中段每 15 秒给一次画面切换，讲一个机制配一个生活比喻。",
        {
          locator: tc(21, 120),
          strength: "中",
          polarity: "支持",
          at: "2026-05",
          topics: ["结构", "节奏"],
        },
      ),
      b(
        "MX-C02-b4",
        "字幕",
        "最后 10 秒不放 CTA，只放一句总结，评论区自然争论。",
        {
          locator: tc(170, 180),
          strength: "弱",
          polarity: "中立",
          at: "2026-05",
          topics: ["CTA", "结构"],
        },
      ),
    ],
    purpose: purpose("对标拆解", { note: "视频节奏参考" }),
    tags: ["对标", "视频节奏"],
    license: "synthetic",
    painPoint: "B",
  }),

  mat({
    id: "MX-C03",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-27T10:40:00+08:00",
    modality: "photo",
    source: {
      kind: "photo",
      title: "封面版式对比（我自己拼的对比图）",
    },
    blocks: [
      b(
        "MX-C03-b1",
        "图注",
        "左：大字号纯色底 + 3 个字主标；右：实拍图 + 白色描边字。左图在信息流里的辨识度明显更高。",
        {
          locator: bbox(0, 320, 375, 60),
          strength: "弱",
          polarity: "中立",
          at: "2026-07",
          topics: ["排版", "封面"],
        },
      ),
      b(
        "MX-C03-b2",
        "图注",
        "主标控制在 8 字以内，副标压到主标高度的 40%，视觉层级才立得住。",
        {
          locator: bbox(0, 392, 375, 48),
          strength: "弱",
          polarity: "支持",
          at: "2026-07",
          topics: ["排版", "封面"],
        },
      ),
    ],
    purpose: purpose("对标拆解", { note: "版式参考，主资产是图不是文字" }),
    tags: ["封面", "版式"],
    license: "owned",
    painPoint: "B",
  }),

  mat({
    id: "MX-C04",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-28T09:14:00+08:00",
    modality: "screenshot",
    source: {
      kind: "screen",
      appHint: "灵感街",
      title: "我上一期内容的评论区",
    },
    blocks: [
      b(
        "MX-C04-b1",
        "评论",
        "「讲得太快了，第二个例子没跟上」——出现 7 次，是最集中的负反馈。",
        {
          locator: bbox(16, 140, 343, 48),
          strength: "中",
          polarity: "反对",
          at: "2026-07",
          topics: ["节奏", "风险"],
          causal: "因",
        },
      ),
      b(
        "MX-C04-b2",
        "评论",
        "「求那张表」——出现 23 次，说明资料诱饵有效。",
        {
          locator: bbox(16, 200, 343, 44),
          strength: "中",
          polarity: "支持",
          at: "2026-07",
          topics: ["CTA"],
        },
      ),
      b(
        "MX-C04-b3",
        "评论",
        "「是不是又在贩卖焦虑」——出现 3 次，说明结论式标题有反噬风险。",
        {
            locator: bbox(16, 252, 343, 44),
          strength: "弱",
          polarity: "反对",
          at: "2026-07",
          topics: ["风险", "标题手法"],
        },
      ),
    ],
    purpose: purpose("对标拆解", { note: "自己的复盘素材" }),
    tags: ["评论区", "反馈"],
    license: "owned",
    painPoint: "B",
  }),

  mat({
    id: "MX-C05",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-28T11:00:00+08:00",
    modality: "webpage",
    source: {
      kind: "screen",
      appHint: "创作者中心",
      title: "内容规范：科普与健康类目标注要求（2025 版）",
      url: "https://example.invalid/rules/2025",
    },
    blocks: [
      b(
        "MX-C05-b1",
        "要点",
        "涉及学习方法、记忆效果等表述，若引用研究数据须标注出处，否则限流。",
        {
          locator: bbox(24, 96, 620, 48),
          strength: "强",
          polarity: "中立",
          at: "2025-01",
          topics: ["平台规则", "风险"],
        },
      ),
      b(
        "MX-C05-b2",
        "要点",
        "图文内容首图不得含大面积文字覆盖（超过画面 40%），否则降低推荐权重。",
        {
          locator: bbox(24, 156, 620, 48),
          strength: "强",
          polarity: "中立",
          at: "2025-01",
          topics: ["平台规则", "封面"],
        },
      ),
      b(
        "MX-C05-b3",
        "正文",
        "视频类目暂不参与「资料诱饵」互动激励计划。",
        {
          locator: bbox(24, 216, 620, 40),
          strength: "中",
          polarity: "中立",
          at: "2025-01",
          topics: ["平台规则", "CTA"],
        },
      ),
    ],
    purpose: purpose("资料收藏", { note: "发布前对照" }),
    tags: ["平台规则"],
    license: "synthetic",
    flags: ["outdated"],
    painPoint: "D",
  }),

  mat({
    id: "MX-C06",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-28T15:20:00+08:00",
    modality: "social_post",
    source: {
      kind: "screen",
      appHint: "拾光集",
      title: "一句话文案收集",
      author: "@字句铺（仿真）",
    },
    blocks: [
      b(
        "MX-C06-b1",
        "引用",
        "「你不是记性差，你只是在错误的时间复习。」",
        {
          locator: bbox(16, 300, 343, 44),
          strength: "弱",
          polarity: "中立",
          at: "2026-07",
          topics: ["金句", "标题手法"],
        },
      ),
      b(
        "MX-C06-b2",
        "引用",
        "「重读让你觉得会了，回忆才让你真的会。」",
        {
          locator: bbox(16, 352, 343, 44),
          strength: "弱",
          polarity: "中立",
          at: "2026-07",
          topics: ["金句", "提取练习"],
        },
      ),
    ],
    purpose: purpose("素材金句", { note: "可能能改写成开头" }),
    tags: ["金句", "文案"],
    license: "synthetic",
    painPoint: "B",
  }),

  mat({
    id: "MX-C07",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-29T08:30:00+08:00",
    modality: "voice",
    source: { kind: "voice", title: "口述 · 这期我想怎么讲" },
    blocks: [
      b(
        "MX-C07-b1",
        "口述",
        "这期我想先讲反对意见，就是「卡片对理解型没用」，然后再讲什么情况下有用。",
        {
          locator: tc(0, 12),
          strength: "弱",
          polarity: "中立",
          at: "2026-07",
          topics: ["结构", "钩子"],
        },
      ),
      b(
        "MX-C07-b2",
        "口述",
        "下一步：先把学习线那批笔记按反对优先重排一遍，看看能不能直接当大纲。",
        {
          locator: tc(13, 26),
          strength: "中",
          polarity: "中立",
          at: "2026-07",
          topics: ["行动"],
        },
      ),
      b(
        "MX-C07-b3",
        "口述",
        "完成判据是：能写出三段小标题，每段有一条能点回原文的证据。",
        {
          locator: tc(27, 40),
          strength: "中",
          polarity: "中立",
          at: "2026-07",
          topics: ["行动", "结构"],
        },
      ),
    ],
    purpose: purpose("待办行动", { note: "这周要做的" }),
    tags: ["行动", "大纲"],
    license: "owned",
    painPoint: "B",
  }),

  mat({
    id: "MX-C08",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-29T09:05:00+08:00",
    modality: "social_post",
    source: {
      kind: "screen",
      appHint: "灵感街",
      title: "3 天记住 2000 词，我用的是这个 App（附券）",
      author: "@效率狂人（仿真）",
    },
    blocks: [
      b(
        "MX-C08-b1",
        "标题",
        "3 天记住 2000 词，我用的是这个 App（附券）",
        {
          locator: bbox(16, 280, 343, 44),
          strength: "弱",
          polarity: "支持",
          at: "2026-07",
          topics: ["标题手法", "风险"],
        },
      ),
      b(
        "MX-C08-b2",
        "正文",
        "全文没有任何数据来源，结尾是优惠码，属于典型软广结构。",
        {
          locator: bbox(16, 336, 343, 48),
          strength: "中",
          polarity: "反对",
          at: "2026-07",
          topics: ["风险", "CTA"],
        },
      ),
    ],
    purpose: purpose("反例避坑", { note: "这种结构别学" }),
    tags: ["反例", "软广"],
    license: "synthetic",
    flags: ["adTone", "unverified"],
    painPoint: "D",
  }),

  mat({
    id: "MX-C09",
    set: "demo",
    storyLine: "create",
    capturedAt: "2026-07-29T09:40:00+08:00",
    modality: "table",
    source: { kind: "screen", appHint: "创作者中心", title: "同类内容近 30 天表现（我整理）" },
    blocks: [
      b(
        "MX-C09-b1",
        "表格",
        "图文类：平均曝光 1.2 万，互动率 4.1%，制作耗时约 2 小时。",
        {
          locator: bbox(20, 120, 520, 36),
          strength: "中",
          polarity: "支持",
          at: "2026-07",
          topics: ["数据", "图文"],
        },
      ),
      b(
        "MX-C09-b2",
        "表格",
        "视频类：平均曝光 3.8 万，互动率 2.6%，制作耗时约 7 小时。",
        {
          locator: bbox(20, 164, 520, 36),
          strength: "中",
          polarity: "支持",
          at: "2026-07",
          topics: ["数据", "视频"],
        },
      ),
      b(
        "MX-C09-b3",
        "数据",
        "同一主题双发时，图文导流到视频的转化约 8%。",
        {
          locator: bbox(20, 208, 520, 36),
          strength: "弱",
          polarity: "中立",
          at: "2026-07",
          topics: ["数据"],
        },
      ),
    ],
    purpose: purpose("资料收藏", { note: "发布决策要用" }),
    tags: ["数据", "对比"],
    license: "owned",
    painPoint: "D",
  }),
];
