"use client";

import type { Line, LineNode } from "@/lib/mingxi/types";
import { childrenOf } from "@/lib/mingxi/engine/line-builder";

export function Badge({
  kind,
}: {
  kind: "Live" | "Replay" | "Fixture" | "模拟";
}) {
  const cls =
    kind === "Live"
      ? "live"
      : kind === "Replay"
        ? "replay"
        : kind === "模拟"
          ? "sim"
          : "fixture";
  return <span className={`mx-badge ${cls}`}>{kind}</span>;
}

export function LineTree({
  line,
  selectedId,
  lockedIds,
  onSelect,
  onToggleLock,
}: {
  line: Line;
  selectedId?: string;
  lockedIds: string[];
  onSelect: (id: string) => void;
  onToggleLock: (id: string) => void;
}) {
  function render(nodes: LineNode[], parentId: string | null) {
    const kids = childrenOf(nodes, parentId);
    if (!kids.length) return null;
    return (
      <ul className={parentId ? undefined : "mx-tree"}>
        {kids.map((n) => {
          const locked = lockedIds.includes(n.id);
          return (
            <li key={n.id}>
              <div
                className={`mx-node${selectedId === n.id ? " is-sel" : ""}${locked ? " is-locked" : ""}`}
                onClick={() => onSelect(n.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  onToggleLock(n.id);
                }}
                title="单击选中 · 双击锁定/解锁"
              >
                <span className="mx-kind">{n.kind}</span>
                <span>{n.text}</span>
              </div>
              {render(nodes, n.id)}
            </li>
          );
        })}
      </ul>
    );
  }
  return render(line.nodes, null);
}

export const ANGLE_PRESETS = [
  "把反对意见和风险放最前面重排",
  "按时间线重排，看这件事怎么演进的",
  "按证据强度重排，强证据在前，个人观点靠后",
  "按因果重排，先讲原因再讲导致的结果",
  "这周先发图文还是先做视频？",
  "帮我查一下视频类目现在还有流量扶持吗？",
];
