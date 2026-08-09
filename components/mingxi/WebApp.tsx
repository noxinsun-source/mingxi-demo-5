"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { demoMaterials, STORY_LINES, primaryMaterials } from "@/data/mingxi/index";
import { createAgent } from "@/lib/mingxi/agent/index";
import { runAll } from "@/lib/mingxi/eval/runner";
import { evalTasks } from "@/data/mingxi/tasks";
import type { EvalReport, LineNode } from "@/lib/mingxi/types";
import {
  DEMO_NOTES,
  buildKnowledgeAtlas,
  collectNotes,
  findAtlasNode,
  type AtlasNode,
  type NoteUnit,
} from "@/lib/mingxi/knowledge-atlas";
import { loadRealNoteUnits } from "@/lib/mingxi/real-corpus";
import { Badge, LineTree, ANGLE_PRESETS } from "./shared";
import { RadialAtlas } from "./RadialAtlas";
import { NoteDetailSheet, NoteUnitCard } from "./NoteUnitCard";
import { rollbackEntry } from "@/lib/mingxi/engine/learning";
import "./mingxi.css";

type Drawer = null | "profile" | "eval" | "trace";
type MidMode = "atlas" | "line";

export function WebApp() {
  const materials = useMemo(() => {
    if (primaryMaterials.length > 0) return primaryMaterials;
    return demoMaterials.filter(
      (m) => m.storyLine === "learn" || m.storyLine === "decide" || m.storyLine === "create",
    );
  }, []);
  const [agent] = useState(() => createAgent(materials));
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const [utterance, setUtterance] = useState(ANGLE_PRESETS[0]);
  const [midMode, setMidMode] = useState<MidMode>("atlas");
  const [selectedLineId, setSelectedLineId] = useState<string | undefined>();
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [lastNarration, setLastNarration] = useState("");
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null);
  const [story, setStory] = useState<"learn" | "create" | "decide">("learn");
  const realNotes = useMemo(() => loadRealNoteUnits(), []);
  const atlas = useMemo(
    () => buildKnowledgeAtlas(realNotes.length ? realNotes : DEMO_NOTES),
    [realNotes],
  );
  const [atlasFocus, setAtlasFocus] = useState<AtlasNode>(atlas);
  const [openNote, setOpenNote] = useState<NoteUnit | null>(null);

  const state = agent.state;
  void tick;

  const focusNotes = useMemo(() => collectNotes(atlasFocus), [atlasFocus]);
  const selectedNode: LineNode | undefined = state.line?.nodes.find((n) => n.id === selectedLineId);
  const selectedMaterial = selectedNode
    ? materials.find((m) => selectedNode.materialIds.includes(m.id))
    : materials.find((m) => m.storyLine === story);

  function runSay() {
    const text = utterance.trim();
    if (!text) return;
    agent.setLockedNodes(lockedIds);
    const r = agent.say(text);
    setLastNarration(r.narration);
    setMidMode("line");
    refresh();
  }

  function toggleLock(id: string) {
    setLockedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function approveAll() {
    agent.approveAll();
    agent.setLockedNodes(lockedIds);
    setMidMode("line");
    refresh();
  }

  function runEval() {
    setEvalReport(runAll(evalTasks));
    setDrawer("eval");
  }

  return (
    <div className="mx mx-web">
      <header
        className="mx-web-top mx-glass"
        style={{ borderRadius: 0, border: "none", borderBottom: "1px solid var(--mx-line)" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div className="mx-web-brand">明晰</div>
          <span style={{ fontSize: 13, color: "var(--mx-muted)" }}>逻辑工作台</span>
        </div>
        <nav className="mx-web-nav">
          <Link href="/mingxi/phone">手机端</Link>
          <button
            type="button"
            className={drawer === "profile" ? "is-on" : ""}
            onClick={() => setDrawer("profile")}
          >
            我 · 习得档
          </button>
          <button type="button" onClick={runEval}>
            仿真评测
          </button>
          <button
            type="button"
            className={drawer === "trace" ? "is-on" : ""}
            onClick={() => setDrawer("trace")}
          >
            轨迹
          </button>
        </nav>
      </header>

      <p className="mx-web-hint">小屏建议切换到手机端路由 `/mingxi/phone`。</p>

      <div className={`mx-web-grid${midMode === "atlas" ? " is-atlas" : ""}`}>
        <aside className="mx-col mx-col-left">
          {midMode === "atlas" ? (
            <>
              <h2>统一笔记卡片</h2>
              <p className="mx-empty" style={{ paddingTop: 0, paddingBottom: 8 }}>
                路径：{atlasFocus.id === "root" ? "全部" : atlasFocus.id} · {focusNotes.length} 条
                {realNotes.length > 0 ? ` · 真实语料 ${realNotes.length}` : " · 仿真回退"}
              </p>
              <div className="mx-note-grid">
                {focusNotes.map((n) => (
                  <NoteUnitCard key={n.id} note={n} onOpen={setOpenNote} />
                ))}
                {!focusNotes.length && <p className="mx-empty">这个分类下还没有笔记。</p>}
              </div>
            </>
          ) : (
            <>
              <h2>素材 / 正文</h2>
              <div className="mx-chips" style={{ marginBottom: 12 }}>
                {STORY_LINES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStory(s.id)}
                    style={
                      story === s.id
                        ? { borderColor: "var(--mx-accent)", color: "var(--mx-accent)" }
                        : undefined
                    }
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              {materials
                .filter((m) => m.storyLine === story)
                .map((m) => (
                  <div
                    key={m.id}
                    className={`mx-mat-item${selectedMaterial?.id === m.id ? " is-on" : ""}`}
                    onClick={() => {
                      const node = state.line?.nodes.find((n) => n.materialIds.includes(m.id));
                      if (node) setSelectedLineId(node.id);
                    }}
                  >
                    <strong>{m.source.title}</strong>
                    <span>
                      {m.purpose.label} · {m.modality} · {m.blocks.length} 块
                    </span>
                  </div>
                ))}
              {selectedMaterial && (
                <div className="mx-sim-screen" style={{ marginTop: 16 }}>
                  <div className="mx-sim-meta">
                    <span>{selectedMaterial.source.title}</span>
                    <Badge kind="Fixture" />
                  </div>
                  {selectedMaterial.blocks.map((b) => {
                    const hit = selectedNode?.citations.some((c) => c.blockId === b.id);
                    return (
                      <div key={b.id} className={`mx-block${hit ? " is-hit" : ""}`}>
                        {b.text}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </aside>

        <section className="mx-col mx-col-mid">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0 }}>
              {midMode === "atlas" ? "知识旭日 · 客观层级" : "链路结构 · 一句话重排"}
            </h2>
            <div className="mx-switch">
              <button
                type="button"
                className={midMode === "atlas" ? "is-on" : ""}
                onClick={() => setMidMode("atlas")}
              >
                知识旭日
              </button>
              <button
                type="button"
                className={midMode === "line" ? "is-on" : ""}
                onClick={() => setMidMode("line")}
              >
                链路树
              </button>
            </div>
          </div>

          {midMode === "atlas" && (
            <RadialAtlas
              root={atlas}
              selectedId={atlasFocus.id}
              onSelectNode={(node) => {
                if (node.note) {
                  const parent = findAtlasNode(atlas, node.note.knowledgePath.join("/"));
                  setAtlasFocus(parent ?? atlas);
                } else {
                  setAtlasFocus(node);
                }
              }}
              onOpenNote={setOpenNote}
            />
          )}

          {midMode === "line" && !state.line && (
            <p className="mx-empty">
              在右侧说一句角度并接受后，这里出现可锁定的逻辑链路。知识归属请切回「知识旭日」。
            </p>
          )}
          {midMode === "line" && state.line && (
            <LineTree
              line={state.line}
              selectedId={selectedLineId}
              lockedIds={lockedIds}
              onSelect={setSelectedLineId}
              onToggleLock={toggleLock}
            />
          )}
          {midMode === "line" && lockedIds.length > 0 && (
            <div className="mx-pending">
              <h3>已锁定 {lockedIds.length} 个节点</h3>
              <p>下次重排时这些节点纹丝不动。双击节点可解锁。</p>
            </div>
          )}
        </section>

        <aside className="mx-col mx-col-right">
          <h2>指令台</h2>
          <div className="mx-angle-box">
            <textarea
              value={utterance}
              onChange={(e) => setUtterance(e.target.value)}
              placeholder="例如：把反对意见放最前面重排"
            />
            <div className="mx-chips">
              {ANGLE_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setUtterance(p)}>
                  {p.slice(0, 14)}…
                </button>
              ))}
            </div>
            <div className="mx-btn-row">
              <button type="button" className="mx-btn primary" onClick={runSay}>
                执行 <Badge kind="Live" />
              </button>
            </div>
            {lastNarration && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--mx-ink-soft)" }}>{lastNarration}</p>
            )}
          </div>

          {state.pending.map((p) => (
            <div key={p.id} className="mx-pending">
              <h3>待你确认 · {p.tool}</h3>
              <p>{p.summary}</p>
              {p.boundary && (
                <p style={{ fontSize: 12, color: "var(--mx-muted)" }}>{p.boundary}</p>
              )}
              <div className="mx-btn-row">
                <button type="button" className="mx-btn accent" onClick={approveAll}>
                  接受
                </button>
                <button
                  type="button"
                  className="mx-btn ghost"
                  onClick={() => {
                    agent.reject(p.id);
                    refresh();
                  }}
                >
                  放弃
                </button>
              </div>
            </div>
          ))}

          {state.lookups.map((card) => (
            <div key={card.id} className="mx-lookup">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>外查卡</strong>
                <Badge kind="Replay" />
              </div>
              <p style={{ fontSize: 13 }}>{card.question}</p>
              {card.findings.map((f, i) => (
                <p key={i} style={{ fontSize: 12, color: "var(--mx-ink-soft)" }}>
                  · {f.claim}（{f.sourceName} · {f.publishedAt}）
                </p>
              ))}
              {card.conflicts.map((c, i) => (
                <div key={i} className="mx-conflict">
                  冲突 · {c.note}
                </div>
              ))}
            </div>
          ))}

          {state.decisions.map((card) => (
            <div key={card.id} className="mx-decision">
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>{card.question}</h3>
                <Badge kind="Live" />
              </div>
              {card.refused ? (
                <p style={{ fontSize: 13, color: "var(--mx-warn)" }}>
                  证据不足，弃权：{card.refusedReason}
                </p>
              ) : (
                <p style={{ fontSize: 13 }}>建议：{card.recommendation ?? "（请你拍板）"}</p>
              )}
              {card.options.map((o) => (
                <div key={o.label} className="mx-opt">
                  <strong>{o.label}</strong>
                  <span style={{ color: "var(--mx-muted)" }}>
                    利 {o.pros[0] ?? "—"} · 弊 {o.cons[0] ?? "—"}
                  </span>
                </div>
              ))}
              <div className="mx-unknowns">未知项：{card.unknowns.join("；")}</div>
            </div>
          ))}

          {midMode === "atlas" && (
            <div className="mx-pending" style={{ marginTop: 16 }}>
              <h3>库内 {DEMO_NOTES.length} 张统一卡片</h3>
              <p>
                大层级按客观学科（理工科 / 人文社科），中层细分，叶子是笔记。一句话重排请切「链路树」。
              </p>
            </div>
          )}
        </aside>
      </div>

      {openNote && <NoteDetailSheet note={openNote} onClose={() => setOpenNote(null)} />}

      {drawer && (
        <div className="mx-drawer" onClick={() => setDrawer(null)}>
          <div className="mx-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <strong>
                {drawer === "profile" ? "习得档" : drawer === "eval" ? "评测报告" : "运行轨迹"}
              </strong>
              <button type="button" onClick={() => setDrawer(null)}>
                关闭
              </button>
            </div>

            {drawer === "profile" && (
              <>
                <p style={{ fontSize: 13, color: "var(--mx-muted)" }}>
                  本周自动学到{" "}
                  {state.store.entries.filter((e) => e.autoActivated && e.status === "active").length}{" "}
                  条
                </p>
                {state.store.entries.length === 0 && (
                  <p className="mx-empty">还没有习得条目。</p>
                )}
                {state.store.entries.map((e) => (
                  <div key={e.id} className="mx-mini-card" style={{ marginBottom: 8 }}>
                    <h3>{e.statement}</h3>
                    <p>
                      {e.status} · v{e.version}
                    </p>
                    {e.status === "active" && (
                      <button
                        type="button"
                        className="mx-btn ghost"
                        style={{ marginTop: 8, height: 32, fontSize: 12 }}
                        onClick={() => {
                          Object.assign(agent.state.store, rollbackEntry(agent.state.store, e.id));
                          refresh();
                        }}
                      >
                        回滚
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}

            {drawer === "trace" && (
              <div>
                {agent.trace().length === 0 && <p className="mx-empty">还没有轨迹。</p>}
                {agent.trace().map((line, i) => (
                  <div key={i} className="mx-eval-row pass">
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}

            {drawer === "eval" && evalReport && (
              <>
                <div className="mx-mini-card" style={{ marginBottom: 12 }}>
                  <h3>
                    {(evalReport.passRate * 100).toFixed(1)}% · {evalReport.passed}/{evalReport.total}
                  </h3>
                  <p>冻结任务实时跑分 · 确定性引擎</p>
                </div>
                {Object.entries(evalReport.byCapability).map(([k, v]) => (
                  <div key={k} className={`mx-eval-row${v.passed === v.total ? " pass" : " fail"}`}>
                    <span>{k}</span>
                    <span>
                      {v.passed}/{v.total}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
