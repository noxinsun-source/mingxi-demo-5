/**
 * 离线评测集（set: "eval"）· 40 份
 *
 * 与 Demo 集物理隔离：Demo 集只负责演示，本集是**金标准**，冻结不改。
 * 主题刻意与 Demo 故事线无关，用来测泛化能力。
 * EV-33 ~ EV-40 为 8 份反例 / 脏数据。
 */
import type { Material } from "../../lib/mingxi/types.ts";
import { b, bbox, mat, page, purpose, tc } from "./_helpers.ts";

export const evalMaterials: Material[] = [
  /* ---------- 学习型 · 概念学习 ---------- */
  mat({
    id: "EV-01",
    set: "eval",
    capturedAt: "2026-03-02T10:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "咖啡因半衰期与睡眠质量（综述）" },
    blocks: [
      b("EV-01-b1", "要点", "咖啡因平均半衰期约 5 小时，个体差异可达 2–8 小时。", {
        locator: page(2), strength: "强", polarity: "中立", at: "2022-04", topics: ["咖啡因", "睡眠"], causal: "因",
      }),
      b("EV-01-b2", "数据", "下午 4 点后摄入 200mg，入睡潜伏期平均延长 23 分钟。", {
        locator: page(5), strength: "强", polarity: "反对", at: "2022-04", topics: ["咖啡因", "睡眠"], causal: "果",
      }),
      b("EV-01-b3", "正文", "慢代谢基因型人群受影响显著更大。", {
        locator: page(7), strength: "中", polarity: "中立", at: "2022-04", topics: ["咖啡因"],
      }),
    ],
    purpose: purpose("概念学习"),
    tags: ["健康"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-02",
    set: "eval",
    capturedAt: "2026-03-02T10:20:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "远程办公对协作效率的影响：两派证据" },
    blocks: [
      b("EV-02-b1", "正文", "支持方：通勤时间归还员工，深度工作时长平均增加 1.2 小时/天。", {
        locator: bbox(20, 80, 600, 44), strength: "中", polarity: "支持", at: "2023-06", topics: ["远程办公"],
      }),
      b("EV-02-b2", "正文", "反对方：跨团队弱连接减少 21%，新想法的产生率下降。", {
        locator: bbox(20, 136, 600, 44), strength: "强", polarity: "反对", at: "2024-02", topics: ["远程办公", "协作"], causal: "果",
      }),
      b("EV-02-b3", "正文", "关键变量是团队是否有明确的异步沟通规范。", {
        locator: bbox(20, 192, 600, 40), strength: "中", polarity: "中立", at: "2024-02", topics: ["远程办公"], causal: "因",
      }),
    ],
    purpose: purpose("概念学习"),
    tags: ["职场"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-03",
    set: "eval",
    capturedAt: "2026-03-03T09:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "力量训练频率与肌肥大：剂量反应关系" },
    blocks: [
      b("EV-03-b1", "要点", "每周每肌群 10–20 组是多数研究的收益区间。", {
        locator: page(4), strength: "强", polarity: "支持", at: "2021-08", topics: ["训练"], causal: "因",
      }),
      b("EV-03-b2", "数据", "超过 24 组后收益曲线转平，恢复成本显著上升。", {
        locator: page(6), strength: "强", polarity: "反对", at: "2021-08", topics: ["训练", "恢复"], causal: "果",
      }),
      b("EV-03-b3", "正文", "训练年限越长，边际收益越低。", {
        locator: page(8), strength: "中", polarity: "中立", at: "2021-08", topics: ["训练"],
      }),
    ],
    purpose: purpose("概念学习"), tags: ["健身"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-04",
    set: "eval",
    capturedAt: "2026-03-03T14:00:00+08:00",
    modality: "video",
    source: { kind: "screen", appHint: "知播", title: "指数基金定投到底赚不赚钱" },
    blocks: [
      b("EV-04-b1", "字幕", "长期定投的核心不是择时，是降低单点买入的方差。", {
        locator: tc(30, 44), strength: "中", polarity: "支持", at: "2025-03", topics: ["投资"], causal: "因",
      }),
      b("EV-04-b2", "字幕", "但在长期单边下跌市场里，定投同样是持续亏损。", {
        locator: tc(90, 104), strength: "中", polarity: "反对", at: "2025-03", topics: ["投资", "风险"], causal: "果",
      }),
      b("EV-04-b3", "字幕", "历史回测不能外推，这是所有回测的共同前提。", {
        locator: tc(150, 162), strength: "强", polarity: "中立", at: "2025-03", topics: ["投资"],
      }),
    ],
    purpose: purpose("概念学习"), tags: ["投资"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-05",
    set: "eval",
    capturedAt: "2026-03-04T11:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "编程学习：从教程到项目的迁移障碍" },
    blocks: [
      b("EV-05-b1", "正文", "看完教程能跟着敲，独立写却卡住，本质是缺少「问题分解」的练习。", {
        locator: page(2), strength: "中", polarity: "中立", at: "2024-09", topics: ["编程学习"], causal: "因",
      }),
      b("EV-05-b2", "要点", "刻意练习分解步骤后，独立完成率从 31% 提升到 68%。", {
        locator: page(5), strength: "中", polarity: "支持", at: "2024-09", topics: ["编程学习"], causal: "果",
      }),
      b("EV-05-b3", "正文", "该研究样本仅 42 人且为单一课程，外推需谨慎。", {
        locator: page(9), strength: "中", polarity: "反对", at: "2024-09", topics: ["编程学习"],
      }),
    ],
    purpose: purpose("概念学习"), tags: ["学习"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-06",
    set: "eval",
    capturedAt: "2026-03-05T09:30:00+08:00",
    modality: "chat",
    source: { kind: "screen", appHint: "群聊", title: "关于早起的讨论" },
    blocks: [
      b("EV-06-b1", "引用", "老陈：早起本身没价值，有价值的是你早起后干了什么。", {
        locator: bbox(12, 80, 340, 40), strength: "弱", polarity: "反对", at: "2026-02", topics: ["作息"],
      }),
      b("EV-06-b2", "引用", "小林：但固定起床时间确实能稳住昼夜节律。", {
        locator: bbox(12, 130, 340, 40), strength: "中", polarity: "支持", at: "2026-02", topics: ["作息", "睡眠"], causal: "因",
      }),
      b("EV-06-b3", "引用", "老陈：那也是「固定」在起作用，不是「早」。", {
        locator: bbox(12, 180, 340, 40), strength: "弱", polarity: "中立", at: "2026-02", topics: ["作息"], causal: "果",
      }),
    ],
    purpose: purpose("概念学习"), tags: ["作息"], license: "synthetic", painPoint: "A",
  }),
  mat({
    id: "EV-07",
    set: "eval",
    capturedAt: "2026-03-05T16:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "番茄工作法的适用边界" },
    blocks: [
      b("EV-07-b1", "正文", "对易分心的重复性任务效果最好。", {
        locator: bbox(20, 70, 600, 40), strength: "中", polarity: "支持", at: "2023-03", topics: ["时间管理"],
      }),
      b("EV-07-b2", "正文", "对需要长时间进入心流的创造性工作，强制中断反而有害。", {
        locator: bbox(20, 120, 600, 44), strength: "中", polarity: "反对", at: "2023-03", topics: ["时间管理", "心流"], causal: "果",
      }),
      b("EV-07-b3", "正文", "根因在于任务切换成本随任务深度非线性上升。", {
        locator: bbox(20, 174, 600, 40), strength: "中", polarity: "中立", at: "2023-03", topics: ["时间管理"], causal: "因",
      }),
    ],
    purpose: purpose("概念学习"), tags: ["效率"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-08",
    set: "eval",
    capturedAt: "2026-03-06T10:00:00+08:00",
    modality: "voice",
    source: { kind: "voice", title: "口述 · 关于换工作的纠结" },
    blocks: [
      b("EV-08-b1", "口述", "呃我在想，要不要为了涨薪 20% 去一个我不太认可的方向。", {
        locator: tc(0, 9), strength: "弱", polarity: "中立", at: "2026-03", topics: ["职业"],
      }),
      b("EV-08-b2", "口述", "但是……我上次换方向之后花了一年才补上，这个成本我记得。", {
        locator: tc(10, 20), strength: "中", polarity: "反对", at: "2026-03", topics: ["职业", "风险"], causal: "因",
      }),
    ],
    purpose: purpose("概念学习"), tags: ["职业"], license: "owned", painPoint: "A",
  }),

  /* ---------- 学习型 · 资料收藏 ---------- */
  mat({
    id: "EV-09",
    set: "eval",
    capturedAt: "2026-03-07T09:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "文档站", title: "图片压缩工具对比表" },
    blocks: [
      b("EV-09-b1", "表格", "工具 A：无损压缩，平均体积下降 22%，支持批量。", {
        locator: bbox(20, 90, 600, 36), strength: "中", polarity: "中立", at: "2026-01", topics: ["工具"],
      }),
      b("EV-09-b2", "表格", "工具 B：有损压缩，体积下降 61%，画质损失肉眼可见。", {
        locator: bbox(20, 130, 600, 36), strength: "中", polarity: "中立", at: "2026-01", topics: ["工具"],
      }),
      b("EV-09-b3", "正文", "用于正文配图选 A，用于列表缩略图选 B。", {
        locator: bbox(20, 174, 600, 36), strength: "弱", polarity: "中立", at: "2026-01", topics: ["工具"],
      }),
    ],
    purpose: purpose("资料收藏"), tags: ["工具"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-10",
    set: "eval",
    capturedAt: "2026-03-07T15:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "无障碍设计核对清单（节选）" },
    blocks: [
      b("EV-10-b1", "要点", "正文对比度不低于 4.5:1，大号文字不低于 3:1。", {
        locator: page(3), strength: "强", polarity: "中立", at: "2024-06", topics: ["设计规范"],
      }),
      b("EV-10-b2", "要点", "所有交互元素必须可键盘到达且有可见焦点态。", {
        locator: page(4), strength: "强", polarity: "中立", at: "2024-06", topics: ["设计规范"],
      }),
      b("EV-10-b3", "正文", "动效需尊重系统的「减弱动态效果」设置。", {
        locator: page(6), strength: "强", polarity: "中立", at: "2024-06", topics: ["设计规范", "动效"],
      }),
    ],
    purpose: purpose("资料收藏"), tags: ["设计"], license: "public-cc", painPoint: "B",
  }),
  mat({
    id: "EV-11",
    set: "eval",
    capturedAt: "2026-03-08T10:00:00+08:00",
    modality: "screenshot",
    source: { kind: "screen", appHint: "文档站", title: "常用快捷键速查" },
    blocks: [
      b("EV-11-b1", "表格", "跳转文件：Cmd+P；全局搜索：Cmd+Shift+F。", {
        locator: bbox(20, 60, 400, 32), strength: "中", polarity: "中立", at: "2025-11", topics: ["工具"],
      }),
      b("EV-11-b2", "表格", "多光标：Option+点击；列选择：Option+拖拽。", {
        locator: bbox(20, 100, 400, 32), strength: "中", polarity: "中立", at: "2025-11", topics: ["工具"],
      }),
    ],
    purpose: purpose("资料收藏"), tags: ["效率"], license: "synthetic", painPoint: "A",
  }),
  mat({
    id: "EV-12",
    set: "eval",
    capturedAt: "2026-03-08T14:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "常见食材冷冻保存期限" },
    blocks: [
      b("EV-12-b1", "表格", "生肉类 -18℃ 冷冻建议 3–6 个月内食用。", {
        locator: bbox(20, 70, 560, 32), strength: "中", polarity: "中立", at: "2024-01", topics: ["生活"],
      }),
      b("EV-12-b2", "表格", "熟食冷冻建议 1–2 个月，反复解冻会显著劣化口感。", {
        locator: bbox(20, 110, 560, 36), strength: "中", polarity: "中立", at: "2024-01", topics: ["生活"],
      }),
    ],
    purpose: purpose("资料收藏"), tags: ["生活"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-13",
    set: "eval",
    capturedAt: "2026-03-09T09:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "会议纪要模板与决议记录规范" },
    blocks: [
      b("EV-13-b1", "要点", "每条决议必须写明：负责人、完成时间、验收标准。", {
        locator: page(1), strength: "强", polarity: "中立", at: "2025-05", topics: ["协作"],
      }),
      b("EV-13-b2", "正文", "未达成一致的分歧要单独记录，不要用「原则上同意」掩盖。", {
        locator: page(2), strength: "中", polarity: "中立", at: "2025-05", topics: ["协作"],
      }),
    ],
    purpose: purpose("资料收藏"), tags: ["协作"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-14",
    set: "eval",
    capturedAt: "2026-03-09T16:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "旅行签证材料清单", url: "https://example.invalid/visa" },
    blocks: [
      b("EV-14-b1", "要点", "护照有效期需覆盖行程结束后 6 个月。", {
        locator: bbox(20, 60, 560, 32), strength: "强", polarity: "中立", at: "2026-01", topics: ["旅行"],
      }),
      b("EV-14-b2", "要点", "银行流水需最近 6 个月且余额覆盖行程预算。", {
        locator: bbox(20, 100, 560, 32), strength: "中", polarity: "中立", at: "2026-01", topics: ["旅行"],
      }),
    ],
    purpose: purpose("资料收藏"), tags: ["旅行"], license: "synthetic", painPoint: "F",
  }),

  /* ---------- 创作型 · 对标拆解 ---------- */
  mat({
    id: "EV-15",
    set: "eval",
    capturedAt: "2026-03-10T10:00:00+08:00",
    modality: "social_post",
    source: { kind: "screen", appHint: "灵感街", title: "我把厨房改造了三次，第三次才对", author: "@住得舒服（仿真）" },
    blocks: [
      b("EV-15-b1", "标题", "我把厨房改造了三次，第三次才对", {
        locator: bbox(16, 260, 343, 40), strength: "中", polarity: "中立", at: "2026-02", topics: ["钩子", "标题手法"],
      }),
      b("EV-15-b2", "正文", "用「失败两次」建立可信度，再给方案，这是典型的信任前置结构。", {
        locator: bbox(16, 312, 343, 48), strength: "中", polarity: "支持", at: "2026-02", topics: ["结构"], causal: "因",
      }),
      b("EV-15-b3", "正文", "每段配一张前后对比图，滑动成本低。", {
        locator: bbox(16, 372, 343, 40), strength: "弱", polarity: "支持", at: "2026-02", topics: ["排版"],
      }),
    ],
    purpose: purpose("对标拆解"), tags: ["对标"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-16",
    set: "eval",
    capturedAt: "2026-03-10T11:00:00+08:00",
    modality: "video",
    source: { kind: "screen", appHint: "知播", title: "一分钟看懂利率" },
    blocks: [
      b("EV-16-b1", "字幕", "0–2 秒用一个反问开场，不做自我介绍。", {
        locator: tc(0, 2), strength: "中", polarity: "支持", at: "2026-01", topics: ["钩子"],
      }),
      b("EV-16-b2", "字幕", "全程只讲一个概念，不铺陈背景。", {
        locator: tc(3, 55), strength: "中", polarity: "支持", at: "2026-01", topics: ["结构"],
      }),
      b("EV-16-b3", "字幕", "结尾把结论重复一遍，方便二次传播截取。", {
        locator: tc(56, 60), strength: "弱", polarity: "中立", at: "2026-01", topics: ["CTA"],
      }),
    ],
    purpose: purpose("对标拆解"), tags: ["对标", "视频"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-17",
    set: "eval",
    capturedAt: "2026-03-11T09:00:00+08:00",
    modality: "photo",
    source: { kind: "photo", title: "海报排版参考" },
    blocks: [
      b("EV-17-b1", "图注", "三分法构图，主视觉压在右下交点。", {
        locator: bbox(0, 300, 375, 40), strength: "弱", polarity: "中立", at: "2026-03", topics: ["排版"],
      }),
      b("EV-17-b2", "图注", "只用两种字号，靠字重拉层级。", {
        locator: bbox(0, 348, 375, 40), strength: "弱", polarity: "支持", at: "2026-03", topics: ["排版"],
      }),
    ],
    purpose: purpose("对标拆解"), tags: ["设计"], license: "owned", painPoint: "B",
  }),
  mat({
    id: "EV-18",
    set: "eval",
    capturedAt: "2026-03-11T15:00:00+08:00",
    modality: "social_post",
    source: { kind: "screen", appHint: "拾光集", title: "月薪五千怎么存下第一个十万", author: "@攒钱小组（仿真）" },
    blocks: [
      b("EV-18-b1", "标题", "月薪五千怎么存下第一个十万", {
        locator: bbox(16, 260, 343, 40), strength: "中", polarity: "中立", at: "2026-02", topics: ["标题手法"],
      }),
      b("EV-18-b2", "正文", "标题用具体数字锚定人群，正文却泛泛而谈，是典型的高点击低完读结构。", {
        locator: bbox(16, 312, 343, 52), strength: "中", polarity: "反对", at: "2026-02", topics: ["风险", "结构"], causal: "果",
      }),
    ],
    purpose: purpose("对标拆解"), tags: ["对标"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-19",
    set: "eval",
    capturedAt: "2026-03-12T10:00:00+08:00",
    modality: "screenshot",
    source: { kind: "screen", appHint: "灵感街", title: "同一选题的三个标题 A/B 结果" },
    blocks: [
      b("EV-19-b1", "数据", "疑问式标题点击率 6.2%，陈述式 4.1%，数字式 7.8%。", {
        locator: bbox(20, 80, 500, 36), strength: "中", polarity: "中立", at: "2026-03", topics: ["标题手法", "数据"],
      }),
      b("EV-19-b2", "数据", "但数字式的完读率最低，只有 28%。", {
        locator: bbox(20, 122, 500, 36), strength: "中", polarity: "反对", at: "2026-03", topics: ["标题手法", "风险"], causal: "果",
      }),
    ],
    purpose: purpose("对标拆解"), tags: ["数据"], license: "owned", painPoint: "D",
  }),

  /* ---------- 创作型 · 素材金句 ---------- */
  mat({
    id: "EV-20",
    set: "eval",
    capturedAt: "2026-03-12T14:00:00+08:00",
    modality: "social_post",
    source: { kind: "screen", appHint: "拾光集", title: "文案摘录", author: "@字句铺（仿真）" },
    blocks: [
      b("EV-20-b1", "引用", "「便宜的东西不便宜，只是把成本挪到了以后。」", {
        locator: bbox(16, 290, 343, 40), strength: "弱", polarity: "中立", at: "2026-03", topics: ["金句"],
      }),
      b("EV-20-b2", "引用", "「计划赶不上变化，所以计划要短。」", {
        locator: bbox(16, 340, 343, 40), strength: "弱", polarity: "中立", at: "2026-03", topics: ["金句"],
      }),
    ],
    purpose: purpose("素材金句"), tags: ["文案"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-21",
    set: "eval",
    capturedAt: "2026-03-13T09:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "散文集节选" },
    blocks: [
      b("EV-21-b1", "引用", "「所谓成熟，是终于愿意为自己的选择付全款。」", {
        locator: page(88), strength: "弱", polarity: "中立", at: "2019-01", topics: ["金句"],
      }),
      b("EV-21-b2", "正文", "该句出自第 88 页，引用需标注书名与页码。", {
        locator: page(88), strength: "中", polarity: "中立", at: "2019-01", topics: ["版权"],
      }),
    ],
    purpose: purpose("素材金句"), tags: ["文学"], license: "public-cc", painPoint: "D",
  }),
  mat({
    id: "EV-22",
    set: "eval",
    capturedAt: "2026-03-13T16:00:00+08:00",
    modality: "voice",
    source: { kind: "voice", title: "口述 · 突然想到的一句" },
    blocks: [
      b("EV-22-b1", "口述", "记下来：真正的效率不是做得更快，是敢于不做。", {
        locator: tc(0, 8), strength: "弱", polarity: "中立", at: "2026-03", topics: ["金句"],
      }),
    ],
    purpose: purpose("素材金句"), tags: ["灵感"], license: "owned", painPoint: "A",
  }),

  /* ---------- 创作型 · 待办行动 ---------- */
  mat({
    id: "EV-23",
    set: "eval",
    capturedAt: "2026-03-14T09:00:00+08:00",
    modality: "chat",
    source: { kind: "screen", appHint: "群聊", title: "项目对齐片段" },
    blocks: [
      b("EV-23-b1", "引用", "产品：这版先只做导出 PDF，导出 Word 下个迭代。", {
        locator: bbox(12, 80, 340, 40), strength: "中", polarity: "中立", at: "2026-03", topics: ["行动"],
      }),
      b("EV-23-b2", "引用", "研发：那我需要设计在周三前给我导出样式。", {
        locator: bbox(12, 130, 340, 40), strength: "中", polarity: "中立", at: "2026-03", topics: ["行动", "依赖"], causal: "因",
      }),
      b("EV-23-b3", "引用", "设计：周三给，验收看能不能在 A4 上不断行。", {
        locator: bbox(12, 180, 340, 40), strength: "中", polarity: "中立", at: "2026-03", topics: ["行动", "判据"], causal: "果",
      }),
    ],
    purpose: purpose("待办行动"), tags: ["项目"], license: "synthetic", painPoint: "B",
  }),
  mat({
    id: "EV-24",
    set: "eval",
    capturedAt: "2026-03-14T14:00:00+08:00",
    modality: "voice",
    source: { kind: "voice", title: "口述 · 明天要办的事" },
    blocks: [
      b("EV-24-b1", "口述", "明天上午去把体检报告取了，顺便问一下那个指标要不要复查。", {
        locator: tc(0, 9), strength: "中", polarity: "中立", at: "2026-03", topics: ["行动"],
      }),
      b("EV-24-b2", "口述", "取报告要带身份证，别又白跑一趟。", {
        locator: tc(10, 16), strength: "中", polarity: "中立", at: "2026-03", topics: ["行动", "依赖"],
      }),
    ],
    purpose: purpose("待办行动"), tags: ["生活"], license: "owned", painPoint: "A",
  }),
  mat({
    id: "EV-25",
    set: "eval",
    capturedAt: "2026-03-15T10:00:00+08:00",
    modality: "screenshot",
    source: { kind: "screen", appHint: "邮件", title: "报销流程通知" },
    blocks: [
      b("EV-25-b1", "要点", "本月 25 日前提交发票，逾期顺延至下月。", {
        locator: bbox(20, 70, 520, 36), strength: "强", polarity: "中立", at: "2026-03", topics: ["行动", "截止"],
      }),
      b("EV-25-b2", "正文", "需先在系统里创建单据再上传附件，顺序反了会被打回。", {
        locator: bbox(20, 112, 520, 40), strength: "中", polarity: "中立", at: "2026-03", topics: ["行动", "依赖"], causal: "因",
      }),
    ],
    purpose: purpose("待办行动"), tags: ["行政"], license: "synthetic", painPoint: "B",
  }),

  /* ---------- 学习型 · 反例避坑 ---------- */
  mat({
    id: "EV-26",
    set: "eval",
    capturedAt: "2026-03-16T09:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "我把生产库直接改了字段类型" },
    blocks: [
      b("EV-26-b1", "正文", "错在直接在高峰期对千万级表做 ALTER，导致锁表 40 分钟。", {
        locator: bbox(20, 70, 600, 44), strength: "中", polarity: "反对", at: "2025-07", topics: ["事故"], causal: "果",
      }),
      b("EV-26-b2", "正文", "根因是没走灰度与影子表，也没有回滚脚本。", {
        locator: bbox(20, 124, 600, 40), strength: "中", polarity: "中立", at: "2025-07", topics: ["事故"], causal: "因",
      }),
      b("EV-26-b3", "要点", "正确做法：新增列 → 双写 → 回填 → 切读 → 删旧列。", {
        locator: bbox(20, 174, 600, 40), strength: "强", polarity: "支持", at: "2025-07", topics: ["事故", "方案"],
      }),
    ],
    purpose: purpose("反例避坑"), tags: ["工程"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-27",
    set: "eval",
    capturedAt: "2026-03-16T15:00:00+08:00",
    modality: "social_post",
    source: { kind: "screen", appHint: "灵感街", title: "空腹吃它排毒", author: "@养生日常（仿真）" },
    blocks: [
      b("EV-27-b1", "标题", "空腹吃它排毒，坚持一周瘦五斤", {
        locator: bbox(16, 260, 343, 40), strength: "弱", polarity: "支持", at: "2026-03", topics: ["健康", "风险"],
      }),
      b("EV-27-b2", "正文", "错在把「排毒」当作有明确定义的医学概念，全文无任何来源。", {
        locator: bbox(16, 312, 343, 44), strength: "中", polarity: "反对", at: "2026-03", topics: ["健康", "风险"], causal: "因",
      }),
    ],
    purpose: purpose("反例避坑"), tags: ["反例"], license: "synthetic", flags: ["unverified"], painPoint: "D",
  }),
  mat({
    id: "EV-28",
    set: "eval",
    capturedAt: "2026-03-17T09:00:00+08:00",
    modality: "chat",
    source: { kind: "screen", appHint: "群聊", title: "上线复盘" },
    blocks: [
      b("EV-28-b1", "引用", "错在改完没跑回归，只本地点了一遍。", {
        locator: bbox(12, 80, 340, 40), strength: "中", polarity: "反对", at: "2026-02", topics: ["事故"], causal: "因",
      }),
      b("EV-28-b2", "引用", "结果是三个下游接口全挂，回滚花了 20 分钟。", {
        locator: bbox(12, 130, 340, 40), strength: "中", polarity: "中立", at: "2026-02", topics: ["事故"], causal: "果",
      }),
      b("EV-28-b3", "引用", "以后规则：涉及公共字段的改动必须挂回归标签。", {
        locator: bbox(12, 180, 340, 40), strength: "中", polarity: "支持", at: "2026-02", topics: ["事故", "方案"],
      }),
    ],
    purpose: purpose("反例避坑"), tags: ["工程"], license: "synthetic", painPoint: "D",
  }),

  /* ---------- 混合 / 时间线密集 ---------- */
  mat({
    id: "EV-29",
    set: "eval",
    capturedAt: "2026-03-18T09:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "某开源项目版本演进史" },
    blocks: [
      b("EV-29-b1", "要点", "v1 时期只做单机，社区抱怨无法横向扩展。", {
        locator: page(2), strength: "中", polarity: "反对", at: "2019-05", topics: ["演进"], causal: "因",
      }),
      b("EV-29-b2", "要点", "v2 引入分片，性能提升但运维复杂度显著上升。", {
        locator: page(4), strength: "中", polarity: "中立", at: "2021-09", topics: ["演进"], causal: "果",
      }),
      b("EV-29-b3", "要点", "v3 把分片托管化，重新赢回中小团队。", {
        locator: page(7), strength: "中", polarity: "支持", at: "2024-03", topics: ["演进"], causal: "果",
      }),
    ],
    purpose: purpose("概念学习"), tags: ["技术史"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-30",
    set: "eval",
    capturedAt: "2026-03-18T14:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "城市自行车道政策的十年" },
    blocks: [
      b("EV-30-b1", "正文", "2015 年首批试点，反对声集中在挤占车道。", {
        locator: bbox(20, 70, 600, 40), strength: "中", polarity: "反对", at: "2015-06", topics: ["政策"],
      }),
      b("EV-30-b2", "正文", "2019 年通勤占比提升至 11%，反对声明显下降。", {
        locator: bbox(20, 120, 600, 40), strength: "中", polarity: "支持", at: "2019-08", topics: ["政策"], causal: "果",
      }),
      b("EV-30-b3", "正文", "2024 年争议转向共享单车停放管理。", {
        locator: bbox(20, 170, 600, 40), strength: "中", polarity: "中立", at: "2024-04", topics: ["政策"],
      }),
    ],
    purpose: purpose("概念学习"), tags: ["公共政策"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-31",
    set: "eval",
    capturedAt: "2026-03-19T09:00:00+08:00",
    modality: "video",
    source: { kind: "screen", appHint: "知播", title: "为什么很多人减脂会反弹" },
    blocks: [
      b("EV-31-b1", "字幕", "极低热量导致静息代谢下调，这是反弹的生理基础。", {
        locator: tc(40, 56), strength: "强", polarity: "中立", at: "2025-08", topics: ["减脂"], causal: "因",
      }),
      b("EV-31-b2", "字幕", "恢复正常饮食后，同样热量更容易堆积。", {
        locator: tc(60, 74), strength: "中", polarity: "中立", at: "2025-08", topics: ["减脂"], causal: "果",
      }),
      b("EV-31-b3", "字幕", "但也有研究认为行为因素权重更大，代谢适应被夸大了。", {
        locator: tc(110, 126), strength: "中", polarity: "反对", at: "2025-08", topics: ["减脂"],
      }),
    ],
    purpose: purpose("概念学习"), tags: ["健康"], license: "synthetic", painPoint: "D",
  }),
  mat({
    id: "EV-32",
    set: "eval",
    capturedAt: "2026-03-19T15:00:00+08:00",
    modality: "pdf",
    source: { kind: "file", title: "阅读速度与理解深度的权衡" },
    blocks: [
      b("EV-32-b1", "要点", "速读训练能提升字词识别速度，但不提升推理性理解。", {
        locator: page(3), strength: "强", polarity: "反对", at: "2020-11", topics: ["阅读"], causal: "果",
      }),
      b("EV-32-b2", "正文", "原因是理解受限于工作记忆容量，而非眼动速度。", {
        locator: page(5), strength: "强", polarity: "中立", at: "2020-11", topics: ["阅读"], causal: "因",
      }),
      b("EV-32-b3", "正文", "对熟悉领域的材料，速读的损失显著更小。", {
        locator: page(8), strength: "中", polarity: "支持", at: "2020-11", topics: ["阅读"],
      }),
    ],
    purpose: purpose("概念学习"), tags: ["阅读"], license: "synthetic", painPoint: "D",
  }),

  /* ---------- 8 份反例 / 脏数据 EV-33 ~ EV-40 ---------- */
  mat({
    id: "EV-33",
    set: "eval",
    capturedAt: "2026-03-20T09:00:00+08:00",
    modality: "screenshot",
    source: { kind: "screen", appHint: "银行", title: "（该页禁止截屏）" },
    layers: { visibleText: "", fullTextStatus: "unavailable" },
    blocks: [],
    purpose: purpose("资料收藏"),
    tags: ["失败态"], license: "synthetic", flags: ["captureFailed"], painPoint: "A",
  }),
  mat({
    id: "EV-34",
    set: "eval",
    capturedAt: "2026-03-20T10:00:00+08:00",
    modality: "chat",
    source: { kind: "screen", appHint: "群聊", title: "同事发来的信息（含个人信息）" },
    blocks: [
      b("EV-34-b1", "引用", "麻烦帮忙订张明天的票：王工的手机号是 138****0000，身份证尾号 1234。", {
        locator: bbox(12, 80, 340, 44), strength: "弱", polarity: "中立", at: "2026-03", topics: ["隐私"],
      }),
      b("EV-34-b2", "引用", "订完把行程发群里就行。", {
        locator: bbox(12, 130, 340, 36), strength: "弱", polarity: "中立", at: "2026-03", topics: ["行动"],
      }),
    ],
    purpose: purpose("待办行动"),
    tags: ["隐私"], license: "synthetic", flags: ["thirdPartyPII"], painPoint: "D",
  }),
  mat({
    id: "EV-35",
    set: "eval",
    capturedAt: "2026-03-20T11:00:00+08:00",
    modality: "screenshot",
    source: { kind: "screen", appHint: "浏览器", title: "识别质量很差的截图" },
    blocks: [
      b("EV-35-b1", "正文", "每 周 复 习 三 次 效 果 最 女子（识别可能有误）", {
        locator: bbox(20, 60, 400, 36), ocrConfidence: 0.42, strength: "弱", polarity: "中立", at: "2026-03", topics: ["学习"],
      }),
      b("EV-35-b2", "正文", "囗囗囗数据来源不可辨认囗囗", {
        locator: bbox(20, 100, 400, 36), ocrConfidence: 0.31, strength: "弱", polarity: "中立", at: "2026-03", topics: ["学习"],
      }),
    ],
    purpose: purpose("概念学习"),
    tags: ["脏数据"], license: "synthetic", flags: ["lowOcr"], painPoint: "A",
  }),
  mat({
    id: "EV-36",
    set: "eval",
    capturedAt: "2026-03-20T12:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "关于某接口速率限制的说明（旧版）" },
    blocks: [
      b("EV-36-b1", "要点", "免费额度为每分钟 60 次请求。", {
        locator: bbox(20, 60, 560, 36), strength: "中", polarity: "中立", at: "2023-02", topics: ["接口规则"],
      }),
      b("EV-36-b2", "正文", "超出后返回 429，需等待 60 秒。", {
        locator: bbox(20, 100, 560, 36), strength: "中", polarity: "中立", at: "2023-02", topics: ["接口规则"],
      }),
    ],
    purpose: purpose("资料收藏"),
    tags: ["过期"], license: "synthetic", flags: ["outdated", "contradiction"], painPoint: "D",
  }),
  mat({
    id: "EV-37",
    set: "eval",
    capturedAt: "2026-03-20T13:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "关于某接口速率限制的说明（新版）" },
    blocks: [
      b("EV-37-b1", "要点", "免费额度已调整为每分钟 20 次请求。", {
        locator: bbox(20, 60, 560, 36), strength: "强", polarity: "反对", at: "2026-01", topics: ["接口规则"],
      }),
      b("EV-37-b2", "正文", "并新增每日 5000 次上限。", {
        locator: bbox(20, 100, 560, 36), strength: "强", polarity: "中立", at: "2026-01", topics: ["接口规则"],
      }),
    ],
    purpose: purpose("资料收藏"),
    tags: ["冲突对照"], license: "synthetic", flags: ["contradiction"], painPoint: "D",
  }),
  mat({
    id: "EV-38",
    set: "eval",
    capturedAt: "2026-03-20T14:00:00+08:00",
    modality: "social_post",
    source: { kind: "screen", appHint: "灵感街", title: "学会这招，月入十万不是梦", author: "@财富自由课（仿真）" },
    blocks: [
      b("EV-38-b1", "标题", "学会这招，月入十万不是梦（限时开放）", {
        locator: bbox(16, 260, 343, 40), strength: "弱", polarity: "支持", at: "2026-03", topics: ["风险"],
      }),
      b("EV-38-b2", "正文", "通篇无案例无数据，结尾引导私信购课。", {
        locator: bbox(16, 312, 343, 40), strength: "中", polarity: "反对", at: "2026-03", topics: ["风险"],
      }),
    ],
    purpose: purpose("反例避坑"),
    tags: ["软广"], license: "synthetic", flags: ["adTone", "unverified"], painPoint: "D",
  }),
  mat({
    id: "EV-39",
    set: "eval",
    capturedAt: "2026-03-20T15:00:00+08:00",
    modality: "voice",
    source: { kind: "voice", title: "口述 · 说了一半改口" },
    blocks: [
      b("EV-39-b1", "口述", "我觉得应该先做 A……啊不对，先做 B，A 得等设计。", {
        locator: tc(0, 9), strength: "弱", polarity: "中立", at: "2026-03", topics: ["行动"],
      }),
      b("EV-39-b2", "口述", "嗯……算了这个待会儿再说。", {
        locator: tc(10, 14), strength: "弱", polarity: "中立", at: "2026-03", topics: ["行动"],
      }),
    ],
    purpose: purpose("待办行动"),
    tags: ["口语噪声"], license: "owned", painPoint: "A",
  }),
  mat({
    id: "EV-40",
    set: "eval",
    capturedAt: "2026-03-20T16:00:00+08:00",
    modality: "webpage",
    source: { kind: "screen", appHint: "浏览器", title: "一篇自相矛盾的科普" },
    blocks: [
      b("EV-40-b1", "正文", "研究表明午睡超过 30 分钟会损害夜间睡眠。", {
        locator: bbox(20, 60, 560, 40), strength: "中", polarity: "反对", at: "2026-01", topics: ["睡眠"],
      }),
      b("EV-40-b2", "正文", "所以建议每天午睡 60–90 分钟以补足睡眠债。", {
        locator: bbox(20, 110, 560, 40), strength: "弱", polarity: "支持", at: "2026-01", topics: ["睡眠"],
      }),
      b("EV-40-b3", "正文", "（全文未给出任何参考文献）", {
        locator: bbox(20, 160, 560, 32), strength: "弱", polarity: "中立", at: "2026-01", topics: ["睡眠"],
      }),
    ],
    purpose: purpose("概念学习"),
    tags: ["自相矛盾"], license: "synthetic", flags: ["contradiction", "unverified"], painPoint: "D",
  }),
];
