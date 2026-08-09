/**
 * 外查（A5）录制回放数据
 *
 * P0 决策：外查走 Replay —— 引擎不发起网络请求，
 * 用这份录制数据回放「检索 → 证据 → 冲突检出」，界面标注 `Replay`。
 * 每条录制都带 matchKeywords，问题命中关键词即可回放。
 */
import type { LookupCard } from "../../lib/mingxi/types.ts";

export interface ReplayEntry {
  matchKeywords: string[];
  card: Omit<LookupCard, "id">;
}

export const lookupReplays: ReplayEntry[] = [
  {
    matchKeywords: ["流量扶持", "扶持", "视频类目", "还有没有"],
    card: {
      question: "视频类目现在还有流量扶持吗？",
      queries: ["创作者中心 流量扶持 公告 2026", "视频类目 扶持 是否结束"],
      findings: [
        {
          claim: "2025 年 12 月的视频类目扶持计划已于 2026 年 3 月结束，未续期。",
          sourceUrl: "https://example.invalid/notice/2026-03",
          sourceName: "创作者中心公告（仿真）",
          publishedAt: "2026-03-01",
          reliability: "官方",
        },
        {
          claim: "2026 年 Q3 起改为「优质图文与视频同权」，不再单独倾斜。",
          sourceUrl: "https://example.invalid/notice/2026-07",
          sourceName: "创作者中心公告（仿真）",
          publishedAt: "2026-07-02",
          reliability: "官方",
        },
      ],
      conflicts: [
        {
          materialId: "MX-D03",
          blockId: "MX-D03-b1",
          note: "你存的这条是 2025-12 的公告，扶持期已在 2026-03 结束，不能作为本周决策依据。",
        },
      ],
      status: "awaiting_review",
      mode: "Replay",
    },
  },
  {
    matchKeywords: ["首图", "文字占比", "封面", "限制"],
    card: {
      question: "首图文字占比的限制现在是多少？",
      queries: ["内容规范 首图 文字占比 2026"],
      findings: [
        {
          claim: "2026 版规范把首图文字覆盖上限从 40% 收紧到 30%。",
          sourceUrl: "https://example.invalid/rules/2026",
          sourceName: "内容规范（仿真）",
          publishedAt: "2026-02-10",
          reliability: "官方",
        },
      ],
      conflicts: [
        {
          materialId: "MX-C05",
          blockId: "MX-C05-b2",
          note: "你存的是 2025 版（40%），现行为 30%。",
        },
      ],
      status: "awaiting_review",
      mode: "Replay",
    },
  },
  {
    matchKeywords: ["间隔重复", "理解型", "新证据", "最新研究"],
    card: {
      question: "间隔重复对理解型学科有没有更新的证据？",
      queries: ["spaced repetition conceptual learning 2026", "间隔重复 理解 迁移 研究"],
      findings: [
        {
          claim: "2026 年一项 312 人研究显示：把卡片改为「解释型问题卡」后，迁移测验成绩提升 19%。",
          sourceUrl: "https://example.invalid/study/2026-explain-cards",
          sourceName: "学习科学季刊（仿真）",
          publishedAt: "2026-04-18",
          reliability: "媒体",
        },
        {
          claim: "同一研究指出：制作解释型卡片的平均耗时是普通卡片的 4.1 倍。",
          sourceUrl: "https://example.invalid/study/2026-explain-cards",
          sourceName: "学习科学季刊（仿真）",
          publishedAt: "2026-04-18",
          reliability: "媒体",
        },
      ],
      conflicts: [
        {
          materialId: "MX-L03",
          blockId: "MX-L03-b2",
          note: "反方结论「卡片必然把知识切成孤立片段」有了新的反证，建议在链路里并列而不是替换。",
        },
      ],
      status: "awaiting_review",
      mode: "Replay",
    },
  },
  {
    matchKeywords: ["速率限制", "接口", "额度", "429"],
    card: {
      question: "这个接口的速率限制现在是多少？",
      queries: ["接口 速率限制 最新"],
      findings: [
        {
          claim: "现行免费额度为每分钟 20 次、每日 5000 次。",
          sourceUrl: "https://example.invalid/api/limits",
          sourceName: "接口文档（仿真）",
          publishedAt: "2026-01-05",
          reliability: "官方",
        },
      ],
      conflicts: [
        {
          materialId: "EV-36",
          blockId: "EV-36-b1",
          note: "你存的 2023 版写的是每分钟 60 次，已过期。",
        },
      ],
      status: "awaiting_review",
      mode: "Replay",
    },
  },
  {
    matchKeywords: ["这条笔记的作者", "在哪家公司", "本人现在"],
    card: {
      question: "这条帖子的作者本人现在在哪家公司？",
      queries: ["（已拦截：涉及个人身份信息的定向检索）"],
      findings: [],
      conflicts: [],
      status: "no_result",
      fallbackAdvice: [
        "这类问题涉及具体个人的身份信息，明晰不做定向人肉检索。",
        "如果你只是想核对内容可信度，可以改问「这个说法有没有公开来源支持」。",
      ],
      mode: "Replay",
    },
  },
];
