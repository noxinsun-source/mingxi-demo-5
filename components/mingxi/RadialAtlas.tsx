"use client";

import { useMemo, useState } from "react";
import type { AtlasNode, NoteUnit } from "@/lib/mingxi/knowledge-atlas";
import { collectNotes } from "@/lib/mingxi/knowledge-atlas";

/** 截图同款：中心红 → 橙 → 绿 → 蓝 → 紫 */
const DEPTH_COLOR = ["#c62828", "#ef6c00", "#43a047", "#1e88e5", "#5e35b1", "#8e24aa"];
const WEDGE_FILL = [
  "rgba(198,40,40,0.06)",
  "rgba(239,108,0,0.07)",
  "rgba(67,160,71,0.07)",
  "rgba(30,136,229,0.06)",
  "rgba(94,53,177,0.05)",
];

type Laid = {
  node: AtlasNode;
  x: number;
  y: number;
  angle: number;
  r: number;
  a0: number;
  a1: number;
  parent?: Laid;
};

const SIZE = 720;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_STEP = 78;
const R0 = 28;

function polar(r: number, a: number) {
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function layoutRadial(root: AtlasNode): Laid[] {
  const out: Laid[] = [];

  function walk(
    node: AtlasNode,
    a0: number,
    a1: number,
    depth: number,
    parent?: Laid,
  ) {
    const mid = (a0 + a1) / 2;
    const r = depth === 0 ? 0 : R0 + depth * R_STEP;
    const p = polar(r, mid);
    const laid: Laid = { node, x: p.x, y: p.y, angle: mid, r, a0, a1, parent };
    out.push(laid);

    const kids = node.children ?? [];
    if (!kids.length) return;

    const total = kids.reduce((s, c) => s + Math.max(c.count, 1), 0);
    let cursor = a0;
    for (const child of kids) {
      const span = ((a1 - a0) * Math.max(child.count, 1)) / total;
      walk(child, cursor, cursor + span, depth + 1, laid);
      cursor += span;
    }
  }

  walk(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0);
  return out;
}

function wedgePath(a0: number, a1: number, rInner: number, rOuter: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p0 = polar(rOuter, a0);
  const p1 = polar(rOuter, a1);
  const p2 = polar(rInner, a1);
  const p3 = polar(rInner, a0);
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y}`,
    "Z",
  ].join(" ");
}

export function RadialAtlas({
  root,
  selectedId,
  onSelectNode,
  onOpenNote,
}: {
  root: AtlasNode;
  selectedId?: string;
  onSelectNode: (node: AtlasNode) => void;
  onOpenNote: (note: NoteUnit) => void;
}) {
  const [hoverId, setHoverId] = useState<string | undefined>();
  const laid = useMemo(() => layoutRadial(root), [root]);

  const wedges = laid.filter((l) => l.node.depth === 1);

  return (
    <div className="mx-atlas-wrap">
      <svg
        className="mx-atlas-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="客观知识层级径向树"
      >
        {/* 扇区底色（对齐截图的浅色 wedge） */}
        {wedges.map((w) => (
          <path
            key={`w-${w.node.id}`}
            d={wedgePath(w.a0, w.a1, R0 + 20, R0 + 4.2 * R_STEP)}
            fill={WEDGE_FILL[Math.abs(w.node.name.charCodeAt(0)) % WEDGE_FILL.length]}
            stroke="none"
          />
        ))}

        {/* 边 */}
        {laid.map((l) => {
          if (!l.parent) return null;
          return (
            <line
              key={`e-${l.node.id}`}
              x1={l.parent.x}
              y1={l.parent.y}
              x2={l.x}
              y2={l.y}
              stroke={DEPTH_COLOR[Math.min(l.node.depth, DEPTH_COLOR.length - 1)]}
              strokeOpacity={0.45}
              strokeWidth={l.node.note ? 0.8 : 1.4}
            />
          );
        })}

        {/* 节点 */}
        {laid.map((l) => {
          const depth = Math.min(l.node.depth, DEPTH_COLOR.length - 1);
          const color = DEPTH_COLOR[depth];
          const isLeaf = Boolean(l.node.note);
          const active = selectedId === l.node.id || hoverId === l.node.id;
          const r = isLeaf ? 3.2 : depth === 0 ? 7 : 5.5;
          return (
            <g
              key={l.node.id}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverId(l.node.id)}
              onMouseLeave={() => setHoverId(undefined)}
              onClick={() => {
                onSelectNode(l.node);
                if (l.node.note) onOpenNote(l.node.note);
              }}
            >
              <circle
                cx={l.x}
                cy={l.y}
                r={active ? r + 1.6 : r}
                fill={color}
                stroke={active ? "#14201c" : "#fff"}
                strokeWidth={active ? 1.5 : 0.8}
              />
              {/* 分类标签：L1–L3；叶子：径向外标 */}
              {!isLeaf && l.node.depth >= 1 && l.node.depth <= 3 && (
                <text
                  x={l.x + Math.cos(l.angle) * (10 + (3 - l.node.depth) * 2)}
                  y={l.y + Math.sin(l.angle) * (10 + (3 - l.node.depth) * 2)}
                  textAnchor={Math.cos(l.angle) > 0.15 ? "start" : Math.cos(l.angle) < -0.15 ? "end" : "middle"}
                  dominantBaseline="middle"
                  fontSize={l.node.depth === 1 ? 12 : l.node.depth === 2 ? 10.5 : 9}
                  fontWeight={l.node.depth <= 2 ? 700 : 600}
                  fill="#2a342f"
                >
                  {l.node.name}
                </text>
              )}
              {l.node.depth === 0 && (
                <text x={l.x} y={l.y - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="#2a342f">
                  {l.node.name}
                </text>
              )}
              {isLeaf && (
                <text
                  x={l.x + Math.cos(l.angle) * 14}
                  y={l.y + Math.sin(l.angle) * 14}
                  textAnchor={Math.cos(l.angle) >= 0 ? "start" : "end"}
                  dominantBaseline="middle"
                  fontSize={7.5}
                  fill="#5a675f"
                  transform={
                    Math.abs(Math.cos(l.angle)) > 0.35
                      ? `rotate(${((l.angle * 180) / Math.PI) + (Math.cos(l.angle) >= 0 ? 0 : 180)}, ${l.x + Math.cos(l.angle) * 14}, ${l.y + Math.sin(l.angle) * 14})`
                      : undefined
                  }
                >
                  {l.node.name.length > 12 ? `${l.node.name.slice(0, 12)}…` : l.node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mx-atlas-legend">
        <span><i style={{ background: DEPTH_COLOR[0] }} />根</span>
        <span><i style={{ background: DEPTH_COLOR[1] }} />大类</span>
        <span><i style={{ background: DEPTH_COLOR[2] }} />细分</span>
        <span><i style={{ background: DEPTH_COLOR[3] }} />主题</span>
        <span><i style={{ background: DEPTH_COLOR[4] }} />笔记</span>
        <em>点击叶子打开统一卡片全文</em>
      </div>

      {selectedId && selectedId !== "root" && (
        <p className="mx-atlas-focus">
          当前焦点：{findPathLabel(root, selectedId)} · {collectNotes(findNode(root, selectedId) ?? root).length} 条笔记
        </p>
      )}
    </div>
  );
}

function findNode(root: AtlasNode, id: string): AtlasNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const h = findNode(c, id);
    if (h) return h;
  }
  return undefined;
}

function findPathLabel(root: AtlasNode, id: string): string {
  const path: string[] = [];
  function dfs(n: AtlasNode, trail: string[]): boolean {
    const next = [...trail, n.name];
    if (n.id === id) {
      path.push(...next);
      return true;
    }
    for (const c of n.children ?? []) {
      if (dfs(c, next)) return true;
    }
    return false;
  }
  dfs(root, []);
  return path.join(" / ");
}
