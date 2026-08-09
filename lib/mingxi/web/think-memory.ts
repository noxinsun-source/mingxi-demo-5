/**
 * 梳链工作区记忆：对话 + 逻辑图 + 交互痕迹落盘
 * 刷新 demo 后直接回放，不重复实时推理
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export type ThinkLineStatus = "idle" | "pending" | "active" | "rejected";

export interface ThinkMemoryCitation {
  id: string;
  corpusId?: string;
  title: string;
  summary: string;
  preview?: string;
  modality?: string;
  purposeLabel?: string;
  polarity?: string;
  stance?: string;
  domainPath?: string[];
  tags?: string[];
  sourceUri?: string;
  sourceKind?: "library" | "web";
  imageUrl?: string | null;
  theme?: string;
  media?: unknown;
}

export interface ThinkMemoryNode {
  id: string;
  label: string;
  kind: string;
  noteId?: string;
  purposeLabel?: string;
  done?: boolean;
  parentId?: string;
  sourceKind?: "library" | "web";
}

export interface ThinkMemoryEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ThinkWorkspaceSnapshot {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  isSample?: boolean;
  data: {
    chat: Array<{ role: "user" | "assistant"; content: string }>;
    thinkInput: string;
    nodes: ThinkMemoryNode[];
    edges: ThinkMemoryEdge[];
    citations: ThinkMemoryCitation[];
    lineStatus: ThinkLineStatus;
    pending: {
      sessionId: string;
      pendingId: string | null;
      summary?: string;
    } | null;
    angleHint: string;
    diffHint: string;
    harnessHint?: string;
    harnessSteps?: Array<{ tool: string; summary: string; status: string }>;
    thinkSessionId?: string | null;
    webSearchOn?: boolean;
    /** 上次完整推理结果指纹，用于判断是否需重跑 */
    lastUtterance?: string;
    rememberedAt?: string;
  };
}

export interface ThinkMemoryPack {
  version: string;
  updatedAt: string;
  activeWsId?: string;
  workspaces: ThinkWorkspaceSnapshot[];
  /** 交互记忆摘要（独立于笔记库） */
  interactions: Array<{
    id: string;
    at: string;
    kind: "think_run" | "approve" | "reject" | "switch_ws" | "web_search";
    workspaceId: string;
    utterance?: string;
    detail: string;
  }>;
}

const REL = "data/mingxi/real/think-memory.json";

function rootDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "data/mingxi"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function memoryPath(cwd = rootDir()): string {
  return resolve(cwd, REL);
}

export function emptyThinkMemory(): ThinkMemoryPack {
  return {
    version: "think-memory-v1",
    updatedAt: new Date().toISOString(),
    workspaces: [],
    interactions: [],
  };
}

export function loadThinkMemory(cwd = rootDir()): ThinkMemoryPack {
  const p = memoryPath(cwd);
  if (!existsSync(p)) return emptyThinkMemory();
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as ThinkMemoryPack;
    return {
      version: raw.version || "think-memory-v1",
      updatedAt: raw.updatedAt || new Date().toISOString(),
      activeWsId: raw.activeWsId,
      workspaces: Array.isArray(raw.workspaces) ? raw.workspaces : [],
      interactions: Array.isArray(raw.interactions) ? raw.interactions : [],
    };
  } catch {
    return emptyThinkMemory();
  }
}

export function saveThinkMemory(pack: ThinkMemoryPack, cwd = rootDir()): ThinkMemoryPack {
  const p = memoryPath(cwd);
  mkdirSync(dirname(p), { recursive: true });
  const next: ThinkMemoryPack = {
    ...pack,
    version: "think-memory-v1",
    updatedAt: new Date().toISOString(),
    interactions: (pack.interactions || []).slice(0, 200),
  };
  writeFileSync(p, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function upsertWorkspaceMemory(
  workspace: ThinkWorkspaceSnapshot,
  opt: {
    activeWsId?: string;
    interaction?: ThinkMemoryPack["interactions"][number];
  } = {},
  cwd = rootDir(),
): ThinkMemoryPack {
  const pack = loadThinkMemory(cwd);
  const remembered: ThinkWorkspaceSnapshot = {
    ...workspace,
    updatedAt: new Date().toISOString(),
    data: {
      ...workspace.data,
      rememberedAt: new Date().toISOString(),
    },
  };
  const rest = pack.workspaces.filter((w) => w.id !== remembered.id);
  const interactions = opt.interaction
    ? [opt.interaction, ...pack.interactions].slice(0, 200)
    : pack.interactions;
  return saveThinkMemory(
    {
      ...pack,
      activeWsId: opt.activeWsId ?? pack.activeWsId,
      workspaces: [remembered, ...rest],
      interactions,
    },
    cwd,
  );
}

export function getWorkspaceMemory(
  id: string,
  cwd = rootDir(),
): ThinkWorkspaceSnapshot | null {
  return loadThinkMemory(cwd).workspaces.find((w) => w.id === id) || null;
}

/** 有完整推理结果则可回放，无需重跑 */
export function workspaceHasRememberedRun(ws: ThinkWorkspaceSnapshot): boolean {
  const d = ws.data;
  if (!d) return false;
  if ((d.nodes?.length || 0) > 0 && (d.chat?.length || 0) > 0) return true;
  if (d.lineStatus === "active" || d.lineStatus === "pending") return true;
  return false;
}
