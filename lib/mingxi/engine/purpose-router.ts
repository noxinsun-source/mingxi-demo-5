/**
 * A1 · 用途路由整理
 *
 * 同一份原料，用途不同 → 配方不同 → 抽取管线不同 → 成件结构不同。
 * 这是「用途归人」这条第一原则在引擎里的落点：
 * 用途由人声明，AI 只在用途之下抽取，不得跨用途改写。
 */
import type {
  Material,
  Piece,
  PieceBlock,
  Purpose,
  PurposeLabel,
  SourceBlock,
  ProfileEntry,
} from "../types.ts";
import { containsPII, maskPII } from "./safety.ts";
import { shortHash } from "./hash.ts";

/* ---------------- 配方定义 ---------------- */

interface RoleSpec {
  role: string;
  /** 命中这些词加分 */
  keywords?: string[];
  /** 命中这些主题加分 */
  topics?: string[];
  /** 偏好的块类型 */
  kinds?: string[];
  /** 偏好极性 */
  polarity?: "支持" | "反对" | "中立";
  /** 最多取几块 */
  take: number;
  /** 该角色是否承载事实主张（决定是否强制要凭据，也决定是否独占块） */
  fact: boolean;
  /** 合成前缀，用于非事实角色 */
  lead?: string;
  /**
   * 选块优先级（小的先选）。
   * 约束最窄的角色先挑，避免「风险」块被「可复用手法」抢走。
   * 展示顺序仍按 roles 数组顺序。
   */
  priority?: number;
}

interface Recipe {
  id: string;
  roles: RoleSpec[];
}

export const RECIPES: Record<PurposeLabel, Recipe> = {
  学习理论: {
    id: "learn.theory",
    roles: [
      {
        role: "定义",
        keywords: ["是", "称为", "指的是", "描述的是", "定义", "理论", "曲线"],
        kinds: ["标题", "要点", "正文"],
        take: 1,
        fact: true,
      },
      {
        role: "关键机制",
        keywords: ["机制", "因为", "原因", "导致", "根因", "本质", "由于"],
        take: 2,
        fact: true,
      },
      {
        role: "边界与前提",
        keywords: ["但", "前提", "谨慎", "外推", "仅", "只在", "局限", "样本"],
        polarity: "反对",
        take: 2,
        fact: true,
        priority: 1,
      },
      {
        role: "可检验问题",
        keywords: ["？", "?", "到底", "是否", "会不会", "多少", "要不要"],
        take: 1,
        fact: false,
        lead: "还需要验证：",
        priority: 9,
      },
    ],
  },
  // 旧名兼容：与「学习理论」同一配方
  概念学习: {
    id: "learn.concept",
    roles: [
      {
        role: "定义",
        keywords: ["是", "称为", "指的是", "描述的是", "定义", "理论", "曲线"],
        kinds: ["标题", "要点", "正文"],
        take: 1,
        fact: true,
      },
      {
        role: "关键机制",
        keywords: ["机制", "因为", "原因", "导致", "根因", "本质", "由于"],
        take: 2,
        fact: true,
      },
      {
        role: "边界与前提",
        keywords: ["但", "前提", "谨慎", "外推", "仅", "只在", "局限", "样本"],
        polarity: "反对",
        take: 2,
        fact: true,
        priority: 1,
      },
      {
        role: "可检验问题",
        keywords: ["？", "?", "到底", "是否", "会不会", "多少", "要不要"],
        take: 1,
        fact: false,
        lead: "还需要验证：",
        priority: 9,
      },
    ],
  },
  资料收藏: {
    id: "learn.resource",
    roles: [
      { role: "这是什么", kinds: ["标题", "要点"], take: 1, fact: true, priority: 3 },
      {
        role: "何时用",
        keywords: ["用于", "适合", "建议", "场景", "选", "需", "须", "必须", "不得"],
        take: 2,
        fact: true,
        priority: 2,
      },
      {
        role: "关键参数",
        kinds: ["表格", "数据"],
        keywords: ["%", "次", "小时", "天", "分钟", "元", "上限"],
        take: 2,
        fact: true,
        priority: 1,
      },
      { role: "出处", take: 0, fact: false, lead: "来源：" },
    ],
  },
  反例避坑: {
    id: "learn.counter",
    roles: [
      {
        role: "错在哪",
        keywords: ["错在", "坑", "不要", "别", "问题是", "问题在", "误"],
        polarity: "反对",
        take: 2,
        fact: true,
        priority: 1,
      },
      {
        role: "为什么错",
        keywords: ["根因", "原因", "因为", "导致", "没有", "无任何", "缺"],
        take: 2,
        fact: true,
        priority: 2,
      },
      {
        role: "正确做法",
        keywords: ["正确做法", "应该", "建议", "以后", "规则", "改成"],
        polarity: "支持",
        take: 2,
        fact: true,
        priority: 3,
      },
    ],
  },
  对标拆解: {
    id: "create.teardown",
    roles: [
      {
        role: "钩子",
        topics: ["钩子", "标题手法"],
        keywords: ["开场", "开头", "第一句", "标题", "秒"],
        take: 2,
        fact: true,
        priority: 2,
      },
      {
        role: "结构",
        topics: ["结构", "节奏", "排版"],
        keywords: ["中段", "结尾", "小标题", "段", "节奏", "切换", "构图"],
        take: 3,
        fact: true,
        priority: 3,
      },
      {
        role: "可复用手法",
        topics: ["CTA", "排版", "封面"],
        keywords: ["锚定", "绑", "诱饵", "对比", "重复", "置顶", "字重"],
        polarity: "支持",
        take: 2,
        fact: true,
        priority: 4,
      },
      {
        role: "风险",
        topics: ["风险"],
        keywords: ["反噬", "夸张", "焦虑", "限流", "低完读", "争议", "软广"],
        polarity: "反对",
        take: 2,
        fact: true,
        priority: 1,
      },
    ],
  },
  素材金句: {
    id: "create.quote",
    roles: [
      { role: "金句", kinds: ["引用"], keywords: ["「", "”", "\""], take: 3, fact: true, priority: 1 },
      {
        role: "可改写方向",
        kinds: ["引用"],
        take: 1,
        fact: false,
        lead: "可改写方向：把它压成 8 字以内的主标，或反过来说一遍 —— ",
        priority: 9,
      },
      { role: "出处与版权提示", take: 0, fact: false, lead: "出处：" },
    ],
  },
  待办行动: {
    id: "create.action",
    roles: [
      {
        role: "下一步",
        keywords: ["下一步", "先", "去", "要", "明天", "这周", "提交", "把"],
        take: 2,
        fact: true,
        priority: 3,
      },
      {
        role: "依赖",
        keywords: ["需要", "带", "前置", "依赖", "等", "才能", "顺序", "反了"],
        take: 2,
        fact: true,
        priority: 2,
      },
      {
        role: "完成判据",
        keywords: ["判据", "验收", "完成", "标准", "能不能", "算完成", "不断行"],
        take: 2,
        fact: true,
        priority: 1,
      },
    ],
  },
};

/* ---------------- 习得档对配方的影响 ---------------- */

interface ProfileEffect {
  roleOrder?: string[];
  hideRoles?: string[];
  appliesTo?: PurposeLabel;
  note: string;
}

export const PROFILE_EFFECTS: Record<string, ProfileEffect> = {
  pf_structure_first: {
    appliesTo: "对标拆解",
    roleOrder: ["结构", "钩子", "可复用手法", "风险"],
    note: "因为你之前连续把「结构」拖到最前面",
  },
  pf_boundary_first: {
    appliesTo: "学习理论",
    roleOrder: ["边界与前提", "定义", "关键机制", "可检验问题"],
    note: "因为你之前总是先看反方与前提",
  },
};

function applyProfile(
  recipe: Recipe,
  label: PurposeLabel,
  profile: ProfileEntry[],
): { roles: RoleSpec[]; provenance: string[] } {
  let roles = recipe.roles;
  const provenance: string[] = [];
  for (const entry of profile) {
    if (entry.status !== "active") continue;
    const effect = PROFILE_EFFECTS[entry.id];
    if (!effect) continue;
    if (effect.appliesTo && effect.appliesTo !== label) continue;
    if (effect.hideRoles) {
      roles = roles.filter((r) => !effect.hideRoles!.includes(r.role));
    }
    if (effect.roleOrder) {
      const idx = (r: RoleSpec) => {
        const i = effect.roleOrder!.indexOf(r.role);
        return i === -1 ? 99 : i;
      };
      roles = [...roles].sort((a, bb) => idx(a) - idx(bb));
    }
    provenance.push(`${effect.note} —— 「${entry.statement}」`);
  }
  return { roles, provenance };
}

/* ---------------- 打分与挑选 ---------------- */

function scoreBlock(block: SourceBlock, spec: RoleSpec): number {
  let s = 0;
  if (spec.kinds?.includes(block.kind)) s += 3;
  if (spec.polarity && block.polarity === spec.polarity) s += 3;
  for (const kw of spec.keywords ?? []) if (block.text.includes(kw)) s += 2;
  for (const tp of spec.topics ?? []) if (block.topics?.includes(tp)) s += 2;
  if (block.strength === "强") s += 1.5;
  else if (block.strength === "中") s += 0.75;
  if (block.causal === "因" && spec.role.includes("机制")) s += 2;
  if (block.causal === "因" && spec.role.includes("为什么")) s += 2;
  if (block.causal === "果" && spec.role.includes("错在")) s += 1;
  return s;
}

const MIN_SCORE = 2;

/* ---------------- 主函数 ---------------- */

export interface RoutePieceOptions {
  profile?: ProfileEntry[];
}

export function routePiece(
  material: Material,
  options: RoutePieceOptions = {},
): Piece {
  const purpose: Purpose = material.purpose;
  const recipe = RECIPES[purpose.label];
  const { roles, provenance } = applyProfile(
    recipe,
    purpose.label,
    options.profile ?? [],
  );

  const maskNeeded = material.flags?.includes("thirdPartyPII") === true;
  const usable = material.blocks.filter(
    (b) => !(maskNeeded && containsPII(b.text) && b.text.length < 10),
  );

  const used = new Set<string>();
  const picked = new Map<string, PieceBlock[]>();

  // 选块按 priority（约束最窄的先挑）；展示仍按 roles 顺序
  const selectionOrder = [...roles].sort(
    (a, b) => (a.priority ?? 5) - (b.priority ?? 5),
  );

  for (const spec of selectionOrder) {
    if (spec.take === 0) {
      // 元信息角色：不消耗块，也不承载事实主张
      if (spec.role === "出处" || spec.role === "出处与版权提示") {
        const src = material.source;
        const extra =
          purpose.label === "素材金句"
            ? "（引用他人文字，二创前请标注来源）"
            : "";
        picked.set(spec.role, [
          {
            role: spec.role,
            text: `${spec.lead ?? ""}${src.title}${src.author ? " · " + src.author : ""}${extra}`,
            citations: [],
            confidence: 1,
          },
        ]);
      }
      continue;
    }

    // 事实角色独占块；非事实角色（点评类）可以引用已被引用过的块
    const pool = spec.fact ? usable.filter((b) => !used.has(b.id)) : usable;

    const ranked = pool
      .map((b) => ({ b, s: scoreBlock(b, spec) }))
      .filter((x) => x.s >= MIN_SCORE)
      .sort((a, bb) => bb.s - a.s || a.b.id.localeCompare(bb.b.id))
      .slice(0, spec.take);

    const blocks: PieceBlock[] = [];
    for (const { b } of ranked) {
      if (spec.fact) used.add(b.id);
      const masked = maskNeeded && containsPII(b.text);
      const text = masked ? maskPII(b.text) : b.text;
      blocks.push({
        role: spec.role,
        text: spec.fact ? text : `${spec.lead ?? ""}${text}`,
        citations: [
          {
            materialId: material.id,
            blockId: b.id,
            quote: text,
            locator: b.locator,
          },
        ],
        flag: masked ? "masked" : undefined,
        confidence: b.ocrConfidence ?? 0.9,
      });
    }
    if (blocks.length > 0) picked.set(spec.role, blocks);
  }

  // 按展示顺序还原
  const out: PieceBlock[] = roles.flatMap((r) => picked.get(r.role) ?? []);

  const factProduced = out.some(
    (x) => x.citations.length > 0 && !NON_FACT_ROLES.has(x.role),
  );
  if (!factProduced) {
    // 降级：抽取失败不编造，退回原文块
    return {
      id: `pc_${shortHash(material.id + purpose.label)}`,
      materialId: material.id,
      purpose,
      recipe: recipe.id,
      degraded: true,
      provenance,
      blocks:
        material.blocks.length === 0
          ? [
              {
                role: "捕获失败",
                text:
                  material.flags?.includes("captureFailed") === true
                    ? "该页禁止截屏，无法入库。可以试试用 App 自带的分享或导出。"
                    : "这份原料没有可用文本，只保留了链接与捕获时间。",
                citations: [],
                flag: "no-source",
              },
            ]
          : material.blocks.map((b) => ({
              role: "原文",
              text: maskNeeded && containsPII(b.text) ? maskPII(b.text) : b.text,
              citations: [
                {
                  materialId: material.id,
                  blockId: b.id,
                  quote: b.text,
                  locator: b.locator,
                },
              ],
            })),
    };
  }

  return {
    id: `pc_${shortHash(material.id + purpose.label)}`,
    materialId: material.id,
    purpose,
    recipe: recipe.id,
    blocks: out,
    provenance,
    createdAt: material.capturedAt,
  };
}

/** 非事实角色：不强制要求凭据（A2 据此判定） */
export const NON_FACT_ROLES = new Set<string>([
  "出处",
  "出处与版权提示",
  "可改写方向",
  "可检验问题",
  "捕获失败",
]);
