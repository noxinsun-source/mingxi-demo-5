/**
 * 明晰 · 数据集入口
 *
 * 【默认】真实多模态语料 = 测试 / Demo / Agent 主数据
 * 【归档】仿真 70 + 冻结任务 50 —— 仅 `test:mingxi:synthetic` 使用
 */
import type { Material } from "../../lib/mingxi/types.ts";
import { storyLearn } from "./story-learn.ts";
import { storyCreate } from "./story-create.ts";
import { storyDecide } from "./story-decide.ts";
import { evalMaterials } from "./eval-materials.ts";
import { canaryMaterials, canaryExpectations } from "./canary.ts";
import { evalTasks } from "./tasks.ts";
import { lookupReplays } from "./replay-lookup.ts";
import { loadRealMaterials, loadRealCards, loadRealCatalog } from "../../lib/mingxi/real-corpus.ts";

export {
  storyLearn,
  storyCreate,
  storyDecide,
  evalMaterials,
  canaryMaterials,
  canaryExpectations,
  evalTasks,
  lookupReplays,
  loadRealMaterials,
  loadRealCards,
  loadRealCatalog,
};

/** 仿真 Demo（22）—— 归档，默认不再用于测试 */
export const demoMaterials: Material[] = [...storyLearn, ...storyCreate, ...storyDecide];

/** 仿真全量（70）—— 归档 */
export const syntheticMaterials: Material[] = [
  ...demoMaterials,
  ...evalMaterials,
  ...canaryMaterials,
];

/** @deprecated 使用 syntheticMaterials；保留别名以免旧脚本瞬时炸掉 */
export const allMaterials: Material[] = syntheticMaterials;

/** 真实多模态语料（磁盘 latest-cards.json）—— 唯一默认测试集 */
export const realMaterials: Material[] = loadRealMaterials();

/** 主数据：有真实语料就用真实，否则回退仿真（本地未跑 corpus 时） */
export const primaryMaterials: Material[] =
  realMaterials.length > 0 ? realMaterials : demoMaterials;

const INDEX = new Map(
  [...syntheticMaterials, ...realMaterials].map((m) => [m.id, m]),
);

export function getMaterial(id: string): Material | undefined {
  return INDEX.get(id);
}

export function getMaterials(ids: string[]): Material[] {
  return ids.map((id) => INDEX.get(id)).filter((m): m is Material => Boolean(m));
}

export const STORY_LINES = [
  {
    id: "learn" as const,
    name: "学习线（输入）",
    topic: "间隔重复到底有没有用",
    summary: "（仿真归档）有争议、有反例、有强弱证据、有时间演进。",
    materialIds: storyLearn.map((m) => m.id),
  },
  {
    id: "create" as const,
    name: "创作线（输出）",
    topic: "做一期讲间隔重复的科普内容",
    summary: "（仿真归档）对标拆解、爆款结构、封面版式、评论区反馈、平台规则。",
    materialIds: storyCreate.map((m) => m.id),
  },
  {
    id: "decide" as const,
    name: "交汇：一个要做的决定",
    topic: "这周先发图文还是先做视频",
    summary: "（仿真归档）两条线汇进决断卡。",
    materialIds: storyDecide.map((m) => m.id),
  },
];

const realCatalog = loadRealCatalog();

export const DATASET_STATS = {
  /** 默认测试用真实语料 */
  real: realMaterials.length,
  realCards: loadRealCards().length,
  realCatalogOk: (realCatalog as { counts?: { ok?: number } } | null)?.counts?.ok ?? 0,
  demo: demoMaterials.length,
  eval: evalMaterials.length,
  canary: canaryMaterials.length,
  syntheticTotal: syntheticMaterials.length,
  /** @deprecated 旧字段：仿真合计 */
  total: syntheticMaterials.length,
  tasks: evalTasks.length,
  blocks: realMaterials.reduce((a, m) => a + m.blocks.length, 0),
  modalities: Array.from(new Set(realMaterials.map((m) => m.modality))),
  adversarial: evalMaterials.filter((m) => (m.flags?.length ?? 0) > 0).length,
  primary: "real" as const,
};
