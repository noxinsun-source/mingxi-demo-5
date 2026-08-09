/**
 * 进程内短时 Agent 会话（非多实例持久化）
 */
import type { MingxiAgent } from "../agent/index.ts";
import type { LibraryNote } from "./library-data.ts";
import type { Line } from "../types.ts";

export interface ThinkSession {
  id: string;
  agent: MingxiAgent;
  citations: LibraryNote[];
  proposedLine: Line | null;
  pendingId: string | null;
  utterance: string;
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, ThinkSession>();

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TTL_MS) sessions.delete(id);
  }
}

export function putThinkSession(s: ThinkSession): void {
  prune();
  sessions.set(s.id, s);
}

export function getThinkSession(id: string): ThinkSession | null {
  prune();
  const s = sessions.get(id);
  if (!s) return null;
  return s;
}

export function deleteThinkSession(id: string): void {
  sessions.delete(id);
}

export function newSessionId(): string {
  return `think_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
