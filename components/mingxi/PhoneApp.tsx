"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { demoMaterials, primaryMaterials } from "@/data/mingxi/index";
import { routePiece } from "@/lib/mingxi/engine/purpose-router";
import { resolveCitation } from "@/lib/mingxi/engine/citation";
import {
  emptyStore,
  ingestSignals,
  rollbackEntry,
  activeEntries,
} from "@/lib/mingxi/engine/learning";
import type { Material, Piece, PurposeLabel, ProfileStore } from "@/lib/mingxi/types";
import { PURPOSE_TRACK } from "@/lib/mingxi/types";
import { Badge, LineTree } from "./shared";
import { buildLine } from "@/lib/mingxi/engine/line-builder";
import "./mingxi.css";

type Room = "收" | "理" | "我";
type Sheet =
  | null
  | { kind: "purpose"; material: Material }
  | { kind: "piece"; piece: Piece; material: Material }
  | { kind: "film"; material: Material; hitBlockId?: string };

const PURPOSE_OPTIONS: PurposeLabel[] = [
  "学习理论",
  "资料收藏",
  "反例避坑",
  "对标拆解",
  "素材金句",
];

export function PhoneApp() {
  const pool = useMemo(() => {
    if (primaryMaterials.length > 0) return primaryMaterials;
    return demoMaterials.filter((m) => m.storyLine === "create" || m.storyLine === "learn");
  }, []);
  const [room, setRoom] = useState<Room>("收");
  const [inbox, setInbox] = useState<Material[]>(pool.slice(0, 4));
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [store, setStore] = useState<ProfileStore>(emptyStore());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [capturing, setCapturing] = useState<Material | null>(null);
  const [pickLabel, setPickLabel] = useState<PurposeLabel | null>(null);
  const [captureLog, setCaptureLog] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/mingxi/profile");
        const data = await res.json();
        if (!res.ok) return;
        // 服务端只回摘要：把 active 条目映射进本地 store 展示
        const active = (data.active || []) as Array<{ id: string; statement: string }>;
        if (!active.length) return;
        setStore((prev) => ({
          ...prev,
          entries: active.map((a) => ({
            id: a.id,
            statement: a.statement,
            category: "organization" as const,
            scope: "global",
            version: 1,
            status: "active" as const,
            evidenceEvents: [],
            weight: 1,
            confirmedByHuman: false,
            autoActivated: true,
            createdAt: "2026-08-04",
          })),
        }));
      } catch {
        /* 本地空档即可 */
      }
    })();
  }, []);

  const learnLine = useMemo(() => {
    const mats = demoMaterials.filter((m) => m.storyLine === "learn");
    return buildLine({
      materials: mats,
      angleText: "按证据强度重排，强证据在前，个人观点靠后",
    });
  }, []);

  function startCapture() {
    const next =
      pool.find((m) => !inbox.some((i) => i.id === m.id) && !pieces.some((p) => p.materialId === m.id)) ??
      pool[0];
    setCapturing(next);
    setPickLabel(next.purpose.label);
    setSheet({ kind: "purpose", material: next });
  }

  async function confirmPurpose() {
    if (!capturing || !pickLabel) return;
    const material: Material = {
      ...capturing,
      purpose: {
        track: PURPOSE_TRACK[pickLabel],
        label: pickLabel,
        declaredBy: "human",
        declaredAt: new Date().toISOString(),
      },
    };
    const piece = routePiece(material, { profile: activeEntries(store) });
    setInbox((prev) => [material, ...prev.filter((m) => m.id !== material.id)]);
    setPieces((prev) => [piece, ...prev.filter((p) => p.materialId !== material.id)]);
    setStore((s) =>
      ingestSignals(s, [
        {
          kind: "tag_choice",
          key: pickLabel === "对标拆解" ? "prefer_structure_first" : "prefer_boundary_first",
          detail: `选了「${pickLabel}」`,
          at: "2026-08-04",
          weight: 1,
        },
      ]),
    );
    // 同步服务端习得档 + 尝试真实捕获入库（文本种子）
    try {
      await fetch("/api/mingxi/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tag_choice",
          purpose: pickLabel,
        }),
      });
    } catch {
      /* ignore */
    }
    try {
      const seed =
        material.layers?.visibleText ||
        material.blocks?.[0]?.text ||
        material.source?.title ||
        "";
      if (seed) {
        const res = await fetch("/api/mingxi/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: seed,
            title: material.source?.title || material.id,
            purposeLabel: pickLabel,
            enrichVision: false,
            tag: true,
            persist: true,
          }),
        });
        const data = await res.json();
        setCaptureLog(
          res.ok
            ? `已写入活库：${data.note?.title || data.materialId}`
            : `活库写入失败：${data.error || res.status}`,
        );
      }
    } catch (e) {
      setCaptureLog(`活库写入失败：${e instanceof Error ? e.message : String(e)}`);
    }
    setSheet({ kind: "piece", piece, material });
    setCapturing(null);
  }

  function citeBack(piece: Piece, material: Material, blockId: string) {
    const block = resolveCitation(material, blockId);
    setSheet({
      kind: "film",
      material,
      hitBlockId: block?.id,
    });
  }

  const autoLearned = store.entries.filter((e) => e.autoActivated && e.status === "active");

  return (
    <div className="mx mx-phone-page">
      <div className="mx-phone">
        <header className="mx-phone-top">
          <div className="mx-phone-brand">明晰</div>
          <Link href="/mingxi/web" style={{ fontSize: 12, color: "var(--mx-muted)" }}>
            网页端 →
          </Link>
        </header>

        <div className="mx-phone-body">
          {room === "收" && (
            <>
              <p className="mx-empty" style={{ paddingTop: 0 }}>
                点右下角悬浮球，从仿真屏抓住一条内容，立刻声明用途；确认后会写入活知识库并同步习得档。
              </p>
              {captureLog ? (
                <p className="mx-empty" style={{ paddingTop: 0, color: "var(--mx-green, #0f6b4c)" }}>
                  {captureLog}
                </p>
              ) : null}
              <div className="mx-card-list">
                {pieces.map((p) => {
                  const m = inbox.find((x) => x.id === p.materialId) ?? pool.find((x) => x.id === p.materialId);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="mx-mini-card"
                      style={{ textAlign: "left", width: "100%" }}
                      onClick={() => m && setSheet({ kind: "piece", piece: p, material: m })}
                    >
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <Badge kind="Live" />
                        <Badge kind="Fixture" />
                      </div>
                      <h3>{m?.source.title ?? p.materialId}</h3>
                      <p>
                        {p.purpose.label} · {p.blocks.length} 块成件
                        {p.degraded ? " · 已降级" : ""}
                      </p>
                    </button>
                  );
                })}
                {!pieces.length &&
                  inbox.map((m) => (
                    <div key={m.id} className="mx-mini-card">
                      <h3>{m.source.title}</h3>
                      <p>
                        {m.purpose.label} · 待整理或已在池中
                      </p>
                    </div>
                  ))}
              </div>
            </>
          )}

          {room === "理" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <Badge kind="Live" />
                <span style={{ fontSize: 12, color: "var(--mx-muted)" }}>只读链路 · 完整重排在网页端</span>
              </div>
              {learnLine.pending ? (
                <p className="mx-empty">{learnLine.pending.question}</p>
              ) : (
                <LineTree
                  line={learnLine}
                  lockedIds={[]}
                  onSelect={() => {}}
                  onToggleLock={() => {}}
                />
              )}
            </>
          )}

          {room === "我" && (
            <>
              <div className="mx-mini-card" style={{ marginBottom: 12 }}>
                <h3>本周自动学到 {autoLearned.length} 条</h3>
                <p>高置信信号自动生效；删除类永远要你确认。</p>
              </div>
              {store.entries.length === 0 && (
                <p className="mx-empty">多选几次用途标签，或去网页端用几次角度，这里会出现习得条目。</p>
              )}
              {store.entries.map((e) => (
                <div key={e.id} className="mx-mini-card" style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <h3>{e.statement}</h3>
                    <span style={{ fontSize: 11, color: "var(--mx-muted)" }}>{e.status}</span>
                  </div>
                  <p>
                    v{e.version}
                    {e.autoActivated ? " · 自动生效" : ""}
                  </p>
                  {e.status === "active" && (
                    <button
                      type="button"
                      className="mx-btn ghost"
                      style={{ marginTop: 8, height: 32, fontSize: 12 }}
                      onClick={() => setStore((s) => rollbackEntry(s, e.id))}
                    >
                      一键回滚
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <button type="button" className="mx-fab" onClick={startCapture} aria-label="捕获">
          <span className="mx-badge sim" style={{ fontSize: 10 }}>
            模拟
          </span>
          捕获
        </button>

        <nav className="mx-phone-tabs" aria-label="房间">
          {(["收", "理", "我"] as Room[]).map((r) => (
            <button
              key={r}
              type="button"
              className={room === r ? "is-active" : ""}
              onClick={() => setRoom(r)}
            >
              {r}
            </button>
          ))}
        </nav>

        {sheet && (
          <div className="mx-sheet" onClick={() => setSheet(null)}>
            <div className="mx-sheet-panel" onClick={(e) => e.stopPropagation()}>
              {sheet.kind === "purpose" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <strong>用途条 · 必选</strong>
                    <Badge kind="模拟" />
                  </div>
                  <div className="mx-sim-screen">
                    <div className="mx-sim-meta">
                      <span>{sheet.material.source.appHint ?? "仿真屏"}</span>
                      <span>{sheet.material.modality}</span>
                    </div>
                    <strong style={{ fontSize: 14 }}>{sheet.material.source.title}</strong>
                    <p style={{ fontSize: 12, color: "var(--mx-muted)", margin: "6px 0 0" }}>
                      {sheet.material.layers.visibleText.slice(0, 120)}…
                    </p>
                  </div>
                  <div className="mx-purpose-grid">
                    {PURPOSE_OPTIONS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className={pickLabel === label ? "is-pick" : ""}
                        onClick={() => setPickLabel(label)}
                      >
                        <strong>{label}</strong>
                        <span>{PURPOSE_TRACK[label]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mx-btn-row" style={{ marginTop: 16 }}>
                    <button type="button" className="mx-btn ghost" onClick={() => setSheet(null)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="mx-btn accent"
                      disabled={!pickLabel}
                      onClick={confirmPurpose}
                    >
                      生成成件 <Badge kind="Live" />
                    </button>
                  </div>
                </>
              )}

              {sheet.kind === "piece" && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                    <strong>成件卡</strong>
                    <Badge kind="Live" />
                    <Badge kind="Fixture" />
                  </div>
                  <p style={{ fontSize: 13, color: "var(--mx-muted)", marginTop: 0 }}>
                    {sheet.material.source.title} · {sheet.piece.purpose.label} · {sheet.piece.recipe}
                  </p>
                  <div className="mx-piece">
                    {sheet.piece.blocks.map((b, i) => (
                      <div key={`${b.role}-${i}`} className="mx-piece-row">
                        <div style={{ flex: 1 }}>
                          <div className="mx-piece-role">{b.role}</div>
                          <p>{b.text}</p>
                        </div>
                        {b.citations[0] && (
                          <button
                            type="button"
                            className="mx-cite-btn"
                            onClick={() =>
                              citeBack(sheet.piece, sheet.material, b.citations[0].blockId)
                            }
                          >
                            凭据
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" className="mx-btn primary" onClick={() => setSheet(null)}>
                    完成
                  </button>
                </>
              )}

              {sheet.kind === "film" && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                    <strong>底片回点</strong>
                    <Badge kind="Live" />
                    <Badge kind="Fixture" />
                  </div>
                  <div className="mx-sim-screen">
                    <div className="mx-sim-meta">
                      <span>{sheet.material.source.appHint ?? "仿真屏"}</span>
                      <span>点回原文位置</span>
                    </div>
                    <strong style={{ fontSize: 14 }}>{sheet.material.source.title}</strong>
                    {sheet.material.blocks.map((b) => (
                      <div
                        key={b.id}
                        className={`mx-block${sheet.hitBlockId === b.id ? " is-hit" : ""}`}
                      >
                        <span style={{ fontSize: 10, color: "var(--mx-muted)" }}>{b.kind}</span>
                        <div>{b.text}</div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="mx-btn ghost" onClick={() => setSheet(null)}>
                    关闭
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
