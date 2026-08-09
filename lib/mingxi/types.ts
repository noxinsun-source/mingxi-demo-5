/**
 * 明晰 · 全局类型
 *
 * 命名规范（与 docs/mingxi/01-product.md §5 一致）：
 * 原料 Material → 用途 Purpose → 成件 Piece → 凭据 Citation
 * → 链路 Line（节点 LineNode）→ 外查卡 LookupCard → 决断卡 DecisionCard
 * → 回执 Outcome → 习得档 ProfileEntry
 */

/* ------------------------------------------------------------------ */
/* 用途                                                                 */
/* ------------------------------------------------------------------ */

/** 两大档：输入（学习）/ 输出（创作） */
export type Track = "学习型" | "创作型";

export type PurposeLabel =
  // 学习型（输入）
  | "学习理论"
  | "资料收藏"
  | "反例避坑"
  // 创作型（输出）
  | "对标拆解"
  | "素材金句"
  /** @deprecated 移出 C2 主扇；遗留数据兼容，见 docs/mingxi/16 */
  | "待办行动"
  /** @deprecated 已更名为「学习理论」 */
  | "概念学习";

export const PURPOSE_TRACK: Record<PurposeLabel, Track> = {
  学习理论: "学习型",
  资料收藏: "学习型",
  反例避坑: "学习型",
  对标拆解: "创作型",
  素材金句: "创作型",
  待办行动: "创作型",
  概念学习: "学习型",
};

/** 把旧文案归一到净化后的主名 */
export function normalizePurposeLabel(label: string): PurposeLabel {
  if (label === "概念学习") return "学习理论";
  if (
    label === "学习理论" ||
    label === "资料收藏" ||
    label === "反例避坑" ||
    label === "对标拆解" ||
    label === "素材金句" ||
    label === "待办行动"
  ) {
    return label;
  }
  return "资料收藏";
}

export interface Purpose {
  track: Track;
  label: PurposeLabel;
  /** 用户补的一句话 */
  note?: string;
  /** 只允许人声明或人确认 AI 建议；不存在 AI 静默写入 */
  declaredBy: "human" | "human_confirmed_ai";
  aiSuggestion?: {
    label: PurposeLabel;
    confidence: number;
    accepted: boolean;
  };
  declaredAt?: string;
}

/* ------------------------------------------------------------------ */
/* 原料                                                                 */
/* ------------------------------------------------------------------ */

export type Modality =
  | "pdf"
  | "webpage"
  | "social_post"
  | "chat"
  | "video"
  | "voice"
  | "photo"
  | "table"
  | "screenshot";

export type BlockKind =
  | "标题"
  | "正文"
  | "要点"
  | "数据"
  | "引用"
  | "评论"
  | "字幕"
  | "口述"
  | "表格"
  | "图注";

export type Polarity = "支持" | "反对" | "中立";
export type Strength = "强" | "中" | "弱";

/** 回到原料的精确位置 */
export type Locator =
  | { type: "bbox"; bbox: [number, number, number, number] }
  | { type: "page"; page: number }
  | { type: "span"; start: number; end: number }
  | { type: "timecode"; seconds: [number, number] };

export interface SourceBlock {
  id: string;
  text: string;
  kind: BlockKind;
  locator: Locator;
  ocrConfidence?: number;
  /** 支撑「反对意见优先」角度 */
  polarity?: Polarity;
  /** 支撑「按证据强度」角度 */
  strength?: Strength;
  /** 内容的时间归属（非捕获时间），支撑「时间线」角度 */
  at?: string;
  /** 主题词，支撑分组与因果链 */
  topics?: string[];
  /** 因果标注：该块是某主题的「因」还是「果」 */
  causal?: "因" | "果";
}

export type MaterialFlag =
  | "captureFailed"
  | "thirdPartyPII"
  | "outdated"
  | "contradiction"
  | "lowOcr"
  | "adTone"
  | "unverified";

export type License = "synthetic" | "owned" | "public-cc" | "link-only";

export type DatasetSet = "demo" | "eval" | "canary";
export type StoryLine = "learn" | "create" | "decide";

export interface Material {
  id: string;
  set: DatasetSet;
  storyLine?: StoryLine;
  capturedAt: string;
  modality: Modality;
  source: {
    kind: "screen" | "file" | "link" | "voice" | "photo";
    /** 仿真品牌名，非真实平台 */
    appHint?: string;
    title: string;
    url?: string;
    author?: string;
  };
  layers: {
    /** 底片：仿真屏由 blocks 渲染，无需图片资源 */
    snapshot?: string;
    visibleText: string;
    fullText?: string;
    fullTextStatus: "ok" | "pending" | "unavailable";
    /**
     * 多模态规范存储的图片侧（与文字 blocks 并列）。
     * 一切入口最终都落成「文字 + 图片」——见 lib/mingxi/multimodal/
     */
    images?: Array<{
      id: string;
      path: string;
      role: string;
      caption?: string;
      atSeconds?: number;
      sceneIndex?: number;
    }>;
  };
  blocks: SourceBlock[];
  purpose: Purpose;
  tags: string[];
  license: License;
  flags?: MaterialFlag[];
  /** 对应痛点编号 A–F */
  painPoint?: string;
  immutable: true;
}

/* ------------------------------------------------------------------ */
/* 成件与凭据                                                            */
/* ------------------------------------------------------------------ */

export interface Citation {
  materialId: string;
  blockId: string;
  quote: string;
  locator: Locator;
}

export interface PieceBlock {
  role: string;
  text: string;
  citations: Citation[];
  /** 无出处的推断句必须标记 */
  flag?: "no-source" | "masked";
  confidence?: number;
}

export interface Piece {
  id: string;
  materialId: string;
  purpose: Purpose;
  recipe: string;
  blocks: PieceBlock[];
  /** 抽取失败时退回原文 */
  degraded?: boolean;
  /** 因为你之前…（习得档影响） */
  provenance?: string[];
  createdAt?: string;
}

export interface CitationReport {
  ok: boolean;
  /** 引用了不存在 / 不属于该原料的块 */
  badRefs: string[];
  /** 事实性块却没有凭据 */
  orphanBlocks: string[];
  /** 有凭据的事实块占比 */
  coverage: number;
}

/* ------------------------------------------------------------------ */
/* 链路                                                                 */
/* ------------------------------------------------------------------ */

export type AngleOrder =
  | "objection_first"
  | "timeline"
  | "evidence_strength"
  | "causal"
  | "question_driven"
  | "contrast"
  | "action_first"
  | "default";

export type GroupBy = "theme" | "source" | "time" | "purpose" | "claim";

export interface AngleSpec {
  order: AngleOrder;
  groupBy: GroupBy;
  emphasis: string[];
  depth: number;
  filter?: {
    track?: Track;
    purposeLabels?: PurposeLabel[];
    flags?: MaterialFlag[];
  };
  /** 解析置信；过低时 Agent 应反问而非擅自重排 */
  confidence: number;
  /** 无法解析时的追问 */
  clarifyingQuestion?: string;
}

export type NodeKind =
  | "主题"
  | "主张"
  | "反对"
  | "凭据"
  | "行动"
  | "疑问"
  | "外查";

export interface LineNode {
  /** 内容派生的稳定 ID —— 锁定与 diff 的前提 */
  id: string;
  level: 1 | 2 | 3 | 4;
  kind: NodeKind;
  text: string;
  parentId: string | null;
  order: number;
  citations: Citation[];
  materialIds: string[];
  polarity?: Polarity;
  strength?: Strength;
  at?: string;
  topics?: string[];
  causal?: "因" | "果";
  locked?: boolean;
}

export interface LineDiff {
  added: string[];
  removed: string[];
  moved: Array<{ id: string; from: string | null; to: string | null }>;
  kept: string[];
  lockedKept: string[];
}

export interface Line {
  id: string;
  version: number;
  angleText: string;
  angle: AngleSpec;
  scopeMaterialIds: string[];
  nodes: LineNode[];
  lockedNodeIds: string[];
  createdAt: string;
  /** 因为你之前…（习得档影响） */
  provenance: string[];
  diff?: LineDiff;
  /** 需要追问时，不产出新结构 */
  pending?: { question: string; options: string[] };
}

/* ------------------------------------------------------------------ */
/* 外查 / 决断 / 回执                                                    */
/* ------------------------------------------------------------------ */

export interface LookupFinding {
  claim: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  reliability: "官方" | "媒体" | "个人";
}

export interface LookupCard {
  id: string;
  question: string;
  queries: string[];
  findings: LookupFinding[];
  /** 与已有素材的冲突 */
  conflicts: Array<{ materialId: string; blockId: string; note: string }>;
  status: "awaiting_review" | "approved" | "rejected" | "no_result";
  /** 无结果时给出的自查建议 */
  fallbackAdvice?: string[];
  mode: "Replay" | "Live";
  writtenBackNodeId?: string;
}

export interface DecisionOption {
  label: string;
  pros: string[];
  cons: string[];
  evidence: Citation[];
  strongEvidenceCount: number;
}

export interface DecisionCard {
  id: string;
  question: string;
  options: DecisionOption[];
  recommendation?: string;
  reason?: string;
  /** 不得为空 */
  unknowns: string[];
  /** 证据不足时弃权 */
  refused?: boolean;
  refusedReason?: string;
  approvedByHuman: boolean;
  provenance?: string[];
}

export interface Outcome {
  id: string;
  decisionId: string;
  result: "success" | "fail" | "partial" | "not_executed";
  userNote: string;
  reportedAt: string;
  triggeredProfileIds: string[];
}

/* ------------------------------------------------------------------ */
/* 习得档                                                               */
/* ------------------------------------------------------------------ */

export type LearnSignalKind =
  | "tag_choice"
  | "angle_used"
  | "dialog_pref"
  | "reject"
  | "edit"
  | "outcome";

export interface LearnSignal {
  kind: LearnSignalKind;
  /** 归一化后的语义键，一致的键才会累加 */
  key: string;
  detail: string;
  at: string;
  weight: number;
}

export type ProfileCategory =
  | "presentation"
  | "organization"
  | "source_trust"
  | "decision_bias"
  | "delete_or_overwrite";

export interface ProfileEntry {
  id: string;
  /** 可读句子，不是隐藏向量 */
  statement: string;
  category: ProfileCategory;
  scope: string;
  version: number;
  status: "proposed" | "active" | "rolled_back" | "deleted";
  evidenceEvents: string[];
  weight: number;
  confirmedByHuman: boolean;
  autoActivated?: boolean;
  createdAt: string;
  supersededBy?: string;
}

export interface ProfileStore {
  entries: ProfileEntry[];
  /** 回滚后写入的否定约束，防止同一信号再次学回来 */
  negativeConstraints: string[];
  signals: LearnSignal[];
}

/* ------------------------------------------------------------------ */
/* 评测                                                                 */
/* ------------------------------------------------------------------ */

export type Capability =
  | "purpose_routing"
  | "citation_grounding"
  | "line_rebuild"
  | "lock_integrity"
  | "partial_regen"
  | "lookup_replay"
  | "decision"
  | "memory_learning"
  | "memory_rollback"
  | "safety";

export interface EvalExpect {
  requiredRoles?: string[];
  forbiddenRoles?: string[];
  everyFactBlockCited?: boolean;
  citationsWithinMaterial?: boolean;
  minCoverage?: number;
  order?: AngleOrder;
  /** 第一个一级主题节点的文本必须包含 */
  firstThemeIncludes?: string;
  /** 第一个二级节点的类型 */
  firstClaimKind?: NodeKind;
  /** 第一个二级节点的证据强度 */
  firstClaimStrength?: Strength;
  /** 第一个二级节点的因果角色 */
  firstClaimCausal?: "因" | "果";
  minDepth?: number;
  minNodes?: number;
  /** 过滤是否真的生效：所有入选节点的原料必须属于该档 */
  allMaterialsTrack?: Track;
  lockedUnchanged?: boolean;
  outsideScopeUnchanged?: boolean;
  mustClarify?: boolean;
  mustFlagConflictWith?: string;
  mustNotWriteBackBeforeApproval?: boolean;
  mustListUnknowns?: boolean;
  mustRefuse?: boolean;
  mustRecommend?: boolean;
  mustNotAutoApprove?: boolean;
  profileEntryId?: string;
  profileStatus?: "proposed" | "active" | "rolled_back";
  profileStatementIncludes?: string;
  profileAutoActivated?: boolean;
  requiresConfirmation?: boolean;
  mustNotRelearn?: boolean;
  mustReject?: boolean;
  mustMask?: boolean;
  degraded?: boolean;
}

export interface EvalTask {
  id: string;
  capability: Capability;
  title: string;
  painPoint?: string;
  input: {
    materialIds?: string[];
    /** 先用它建 v1，再用 angleText 重排 */
    baseAngleText?: string;
    angleText?: string;
    /** 锁定 v1 里第 n 个二级节点 */
    lockedNodeIndex?: number;
    /** 局部重生成 v1 里第 n 个一级主题 */
    scopeNodeIndex?: number;
    question?: string;
    signals?: LearnSignal[];
    rollbackEntryId?: string;
    replaySignalsAgain?: boolean;
    confirmEntryId?: string;
    approve?: boolean;
    attempt?:
      | "mutate_material"
      | "delete_without_token"
      | "overwrite_locked_without_token"
      | "external_action"
      | "write_back_without_approval";
  };
  expect: EvalExpect;
  frozen: true;
}

export interface EvalResult {
  taskId: string;
  capability: Capability;
  title: string;
  pass: boolean;
  reasons: string[];
}

export interface EvalReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  byCapability: Record<string, { total: number; passed: number }>;
  results: EvalResult[];
}

/* ------------------------------------------------------------------ */
/* 安全                                                                 */
/* ------------------------------------------------------------------ */

/** 注意：不使用参数属性等不可擦除语法，保证 node --experimental-strip-types 可直接运行 */
export class SafetyViolation extends Error {
  rule: string;

  constructor(message: string, rule: string) {
    super(message);
    this.name = "SafetyViolation";
    this.rule = rule;
  }
}
