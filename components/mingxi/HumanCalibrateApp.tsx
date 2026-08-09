"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./human-calibrate.css";

type Silver = {
  domainPath: string[];
  polarity: string;
  stance: string;
  purposeLabel?: string;
};

type BatchItem = {
  seq: number;
  cardId: string;
  title: string;
  modality: string;
  summary: string;
  preview: string;
  imageUrl?: string | null;
  silver: Silver;
};

type Label = {
  cardId: string;
  domainPath: string[];
  polarity: string;
  stance: string;
  unsure?: boolean;
  comment?: string;
};

const POLARITY_UI: Record<string, string> = {
  positive_exemplar: "可学正例",
  negative_caution: "避雷负例",
  mixed: "正反混合",
  neutral_observe: "中性观察",
  unknown: "不足以判断",
};

const STANCE_UI: Record<string, string> = {
  imitate: "可模仿",
  do_not_imitate_failure_path: "勿模仿失败路径",
  quote_only: "只引用",
  transform_ok: "可归纳改写",
};

function defaultLabel(item: BatchItem): Label {
  return {
    cardId: item.cardId,
    domainPath: [...(item.silver.domainPath || [])].slice(0, 4),
    polarity: item.silver.polarity || "neutral_observe",
    stance: item.silver.stance || "transform_ok",
    unsure: false,
    comment: "",
  };
}

export function HumanCalibrateApp() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [domainRoots, setDomainRoots] = useState<
    Array<{ name: string; children: string[] }>
  >([]);
  const [idx, setIdx] = useState(0);
  const [labels, setLabels] = useState<Record<string, Label>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [annotator, setAnnotator] = useState("mizi");
  const [l3, setL3] = useState("");
  const [l4, setL4] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/mingxi/annotate");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载失败");
        const batchItems = (data.batch?.items || []) as BatchItem[];
        setItems(batchItems);
        setDomainRoots(data.vocab?.domain?.roots || []);
        const map: Record<string, Label> = {};
        for (const it of batchItems) map[it.cardId] = defaultLabel(it);
        // 恢复已保存
        if (Array.isArray(data.saved?.labels)) {
          for (const l of data.saved.labels as Label[]) {
            if (l?.cardId) map[l.cardId] = { ...map[l.cardId], ...l };
          }
          setMsg(`已载入上次保存 ${data.saved.labeled || 0} 条`);
        }
        setLabels(map);
        const first = batchItems[0];
        if (first) {
          setL3(first.silver.domainPath?.[2] || "");
          setL4(first.silver.domainPath?.[3] || "");
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const item = items[idx];
  const label = item ? labels[item.cardId] : null;

  const doneCount = useMemo(
    () =>
      Object.values(labels).filter(
        (l) => l.domainPath?.length >= 2 && l.polarity && l.stance,
      ).length,
    [labels],
  );

  const patch = useCallback(
    (cardId: string, partial: Partial<Label>) => {
      setLabels((prev) => ({
        ...prev,
        [cardId]: { ...prev[cardId], cardId, ...partial },
      }));
    },
    [],
  );

  useEffect(() => {
    if (!item) return;
    const path = labels[item.cardId]?.domainPath || [];
    const timer = window.setTimeout(() => {
      setL3(path[2] || "");
      setL4(path[3] || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [idx, item?.cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPathLevel(level: 0 | 1, value: string) {
    if (!item || !label) return;
    const next = [...label.domainPath];
    next[level] = value;
    if (level === 0) {
      next.length = 1;
      // keep children empty until L2 picked
    } else {
      next.length = 2;
      if (l3.trim()) next[2] = l3.trim();
      if (l4.trim()) next[3] = l4.trim();
    }
    patch(item.cardId, { domainPath: next.filter(Boolean) });
  }

  function applyL34() {
    if (!item || !label) return;
    const next = [...label.domainPath].slice(0, 2);
    if (l3.trim()) next[2] = l3.trim();
    if (l4.trim()) next[3] = l4.trim();
    patch(item.cardId, { domainPath: next });
  }

  function adoptSilver() {
    if (!item) return;
    patch(item.cardId, defaultLabel(item));
    setL3(item.silver.domainPath?.[2] || "");
    setL4(item.silver.domainPath?.[3] || "");
  }

  async function saveAll() {
    setSaving(true);
    setMsg("");
    try {
      let labelsToSave = labels;
      // flush L3/L4
      if (item && label) {
        const next = [...label.domainPath].slice(0, 2);
        if (l3.trim()) next[2] = l3.trim();
        if (l4.trim()) next[3] = l4.trim();
        labelsToSave = {
          ...labels,
          [item.cardId]: { ...label, domainPath: next },
        };
        setLabels(labelsToSave);
      }
      const res = await fetch("/api/mingxi/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotator,
          labels: Object.values(labelsToSave),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setMsg(data.message || `已保存 ${data.labeled} 条 → ${data.path}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function copyJson() {
    const payload = {
      annotator,
      savedAt: new Date().toISOString(),
      labels: Object.values(labels),
    };
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setMsg("已复制 JSON 到剪贴板，也可粘贴回对话。");
  }

  const l1 = label?.domainPath?.[0] || "";
  const l2 = label?.domainPath?.[1] || "";
  const l2Options = domainRoots.find((r) => r.name === l1)?.children || [];

  if (loading) {
    return <div className="hcal-page">加载人校批次…</div>;
  }

  if (!item || !label) {
    return <div className="hcal-page">批次为空</div>;
  }

  return (
    <div className="hcal-page">
      <header className="hcal-top">
        <div>
          <Link href="/mingxi" className="hcal-back">
            ← 明晰
          </Link>
          <h1>人校工作台 · C1 / 极性 / stance</h1>
          <p>
            共 {items.length} 条 · 已标 {doneCount} · 建议 ≥20。银标仅供参考，以你的点击为准。
            点「写入仓库」后回对话说「人校已保存」。
          </p>
        </div>
        <div className="hcal-top-actions">
          <label>
            标注者
            <input value={annotator} onChange={(e) => setAnnotator(e.target.value)} />
          </label>
          <button type="button" onClick={copyJson}>
            复制 JSON
          </button>
          <button type="button" className="primary" disabled={saving} onClick={() => void saveAll()}>
            {saving ? "保存中…" : "写入仓库回传"}
          </button>
        </div>
      </header>

      {msg ? <div className="hcal-msg">{msg}</div> : null}

      <div className="hcal-body">
        <aside className="hcal-rail">
          {items.map((it, i) => {
            const lab = labels[it.cardId];
            const ok = lab?.domainPath?.length >= 2 && lab.polarity && lab.stance;
            return (
              <button
                key={it.cardId}
                type="button"
                className={`${i === idx ? "is-on" : ""}${ok ? " is-done" : ""}`}
                onClick={() => setIdx(i)}
              >
                <em>{it.seq}</em>
                <span>{it.title}</span>
              </button>
            );
          })}
        </aside>

        <section className="hcal-main">
          <div className="hcal-card">
            <div className="hcal-card-meta">
              <span>{item.modality || "note"}</span>
              <span>{item.cardId}</span>
              <span>
                {idx + 1} / {items.length}
              </span>
            </div>
            <h2>{item.title}</h2>
            <p className="hcal-sum">{item.summary}</p>
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="hcal-img" src={item.imageUrl} alt="" />
            ) : null}
            <pre className="hcal-preview">{item.preview || "（无正文预览）"}</pre>
          </div>

          <div className="hcal-silver">
            <strong>银标参考（可改）</strong>
            <span>
              {item.silver.domainPath?.join(" / ") || "—"} ·{" "}
              {POLARITY_UI[item.silver.polarity] || item.silver.polarity} ·{" "}
              {STANCE_UI[item.silver.stance] || item.silver.stance}
            </span>
            <button type="button" onClick={adoptSilver}>
              采用银标为起点
            </button>
          </div>

          <div className="hcal-block">
            <h3>1. 极性 polarity</h3>
            <div className="hcal-chips">
              {Object.entries(POLARITY_UI).map(([id, ui]) => (
                <button
                  key={id}
                  type="button"
                  className={label.polarity === id ? "is-on" : ""}
                  onClick={() => {
                    const stanceGuess =
                      id === "negative_caution" || id === "mixed"
                        ? "do_not_imitate_failure_path"
                        : id === "positive_exemplar"
                          ? "imitate"
                          : id === "neutral_observe"
                            ? "transform_ok"
                            : label.stance;
                    patch(item.cardId, { polarity: id, stance: stanceGuess });
                  }}
                >
                  {ui}
                </button>
              ))}
            </div>
          </div>

          <div className="hcal-block">
            <h3>2. stance</h3>
            <div className="hcal-chips">
              {Object.entries(STANCE_UI).map(([id, ui]) => (
                <button
                  key={id}
                  type="button"
                  className={label.stance === id ? "is-on" : ""}
                  onClick={() => patch(item.cardId, { stance: id })}
                >
                  {ui}
                </button>
              ))}
            </div>
          </div>

          <div className="hcal-block">
            <h3>3. 领域 C1（至少两级）</h3>
            <div className="hcal-path-now">
              当前：<code>{(label.domainPath.length ? label.domainPath : ["未选"]).join(" / ")}</code>
            </div>
            <em>一级</em>
            <div className="hcal-chips">
              {domainRoots.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  className={l1 === r.name ? "is-on" : ""}
                  onClick={() => setPathLevel(0, r.name)}
                >
                  {r.name}
                </button>
              ))}
            </div>
            <em>二级</em>
            <div className="hcal-chips">
              {l2Options.length ? (
                l2Options.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={l2 === c ? "is-on" : ""}
                    onClick={() => setPathLevel(1, c)}
                  >
                    {c}
                  </button>
                ))
              ) : (
                <span className="hcal-hint">先选一级</span>
              )}
            </div>
            <em>三级 / 四级（可改文字，失焦写入）</em>
            <div className="hcal-l34">
              <input
                value={l3}
                placeholder="三级主题，如：Agent评测"
                onChange={(e) => setL3(e.target.value)}
                onBlur={applyL34}
              />
              <input
                value={l4}
                placeholder="四级主题（可选）"
                onChange={(e) => setL4(e.target.value)}
                onBlur={applyL34}
              />
            </div>
          </div>

          <div className="hcal-block row">
            <label className="hcal-unsure">
              <input
                type="checkbox"
                checked={Boolean(label.unsure)}
                onChange={(e) => patch(item.cardId, { unsure: e.target.checked })}
              />
              拿不准（仍保存，供抽检）
            </label>
            <input
              className="hcal-comment"
              value={label.comment || ""}
              placeholder="可选备注"
              onChange={(e) => patch(item.cardId, { comment: e.target.value })}
            />
          </div>

          <div className="hcal-nav">
            <button type="button" disabled={idx === 0} onClick={() => setIdx((v) => v - 1)}>
              上一条
            </button>
            <button
              type="button"
              className="primary"
              disabled={idx >= items.length - 1}
              onClick={() => {
                applyL34();
                setIdx((v) => Math.min(items.length - 1, v + 1));
              }}
            >
              下一条
            </button>
            <button type="button" className="primary" disabled={saving} onClick={() => void saveAll()}>
              写入仓库回传
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
