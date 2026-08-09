"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./knowledge-completion-demo.css";

type GapId = "write-trigger" | "conflict-expiry" | "mastery-loop";
type NodeKind = "root" | "known" | "gap" | "boundary";

type MapNode = {
  id: string;
  label: string;
  caption: string;
  kind: NodeKind;
  x: number;
  y: number;
  level: number;
  gapId?: GapId;
};

type SourceCandidate = {
  id: string;
  source: string;
  title: string;
  year: string;
  evidence: string;
  confidence: number;
  role: string;
};

const GAPS: Record<
  GapId,
  {
    title: string;
    question: string;
    reason: string;
    consequence: string;
    relation: string;
    draft: string;
  }
> = {
  "write-trigger": {
    title: "写入触发机制",
    question: "什么信息值得从短期上下文沉淀到长期记忆？",
    reason: "现有笔记解释了窗口、摘要和检索，但没有给出“何时写入”的判断规则。",
    consequence: "缺少触发机制会让长期记忆被噪声污染，或错过真正需要跨会话保留的约束。",
    relation: "先于 · 长期记忆写入",
    draft:
      "长期记忆不应按轮次机械写入。更可靠的触发器由显式用户确认、任务结果反馈、重复出现的稳定偏好和高影响决策共同组成；推测性信息保持在候选区，待后续证据确认。",
  },
  "conflict-expiry": {
    title: "冲突与过期策略",
    question: "当新旧记忆冲突时，系统如何保留溯源并决定替换？",
    reason: "本库已有分层记忆与检索笔记，但缺少版本、冲突和时间衰减的完整说明。",
    consequence: "不处理冲突会让旧偏好持续误导 Agent；直接覆盖又会丢失审计线索。",
    relation: "约束 · 记忆检索排序",
    draft:
      "记忆更新采用“并存—标冲突—再确认”而非直接覆盖。检索排序同时考虑语义相关度、时间衰减、来源可信度与用户确认级别；被替代内容进入可恢复历史。",
  },
  "mastery-loop": {
    title: "掌握验证闭环",
    question: "收藏、看过、理解和真正会用，如何在产品里被区分？",
    reason: "现有笔记能形成知识图，但缺少从阅读到复述、测验和项目应用的证据链。",
    consequence: "把“保存过”当成“已掌握”会虚高完成度，也无法安排复验。",
    relation: "验证 · 用户掌握状态",
    draft:
      "掌握度由原始行为证据累积：保存仅代表 seen，正确复述与测验支持 understood，真实项目产物支持 applied。所有状态随时间衰减，并保留下一次复验日期。",
  },
};

const SOURCES: Record<GapId, SourceCandidate[]> = {
  "write-trigger": [
    {
      id: "reflexion",
      source: "论文",
      title: "Reflexion：语言反馈如何沉淀为经验",
      year: "2023",
      evidence: "任务反馈经 evaluator 与 reflection 转成可供后续试验读取的文字经验。",
      confidence: 94,
      role: "支持“结果反馈触发写入”",
    },
    {
      id: "generative-agents",
      source: "论文",
      title: "Generative Agents：重要性、时效与相关性",
      year: "2023",
      evidence: "记忆检索与反思同时考虑时效、重要性和相关性，形成更高层抽象。",
      confidence: 92,
      role: "支持“重要性门槛”",
    },
    {
      id: "harness-note",
      source: "本库笔记",
      title: "Agentic Harness：事实槽需要人工可改",
      year: "本库",
      evidence: "facts 写错会长期污染；宁可少写，也不要把模型猜测直接写入稳定事实。",
      confidence: 88,
      role: "提供产品防线",
    },
  ],
  "conflict-expiry": [
    {
      id: "retrieval-stm",
      source: "本库笔记",
      title: "检索式短期记忆：相似度 + 时间重排",
      year: "本库",
      evidence: "只用相似度会召回语义近但时间错位的片段，需要时间衰减。",
      confidence: 91,
      role: "支持时间策略",
    },
    {
      id: "memgpt",
      source: "论文/系统",
      title: "分层记忆：core、recall 与 archival",
      year: "2023",
      evidence: "通过显式层级和换入换出，让稳定约束与冷数据拥有不同生命周期。",
      confidence: 89,
      role: "支持版本分层",
    },
    {
      id: "event-sourcing",
      source: "工程资料",
      title: "可恢复更新：保留事件而不是覆盖状态",
      year: "工程",
      evidence: "以追加事件记录变更来源，可重建任意时刻状态并保留冲突审计。",
      confidence: 81,
      role: "提供审计实现",
    },
  ],
  "mastery-loop": [
    {
      id: "retrieval-practice",
      source: "研究综述",
      title: "提取练习：主动回忆优于重复阅读",
      year: "综述",
      evidence: "通过无提示回忆与延迟测试，能更可靠地区分熟悉感和可提取知识。",
      confidence: 93,
      role: "支持复述与测验",
    },
    {
      id: "spaced-review",
      source: "学习科学",
      title: "间隔复习：让证据随时间接受复验",
      year: "综述",
      evidence: "掌握状态不是永久标签，应根据延迟表现与时间间隔更新。",
      confidence: 90,
      role: "支持状态衰减",
    },
    {
      id: "project-evidence",
      source: "产品规则",
      title: "项目证据：从理解到真实应用",
      year: "本产品",
      evidence: "将真实产物、解释与测验分别记录，避免用一次点击替代能力判断。",
      confidence: 84,
      role: "支持 applied 状态",
    },
  ],
};

const MAP_NODES: MapNode[] = [
  { id: "root", label: "Agent 记忆系统", caption: "本次补全目标", kind: "root", x: 405, y: 200, level: 1 },
  { id: "window", label: "滑动窗口", caption: "本库 3 条证据", kind: "known", x: 78, y: 64, level: 2 },
  { id: "summary", label: "递归摘要", caption: "本库 4 条证据", kind: "known", x: 318, y: 42, level: 3 },
  { id: "scratchpad", label: "工作记忆", caption: "本库 2 条证据", kind: "known", x: 635, y: 68, level: 3 },
  { id: "retrieval", label: "轨迹检索", caption: "本库 5 条证据", kind: "known", x: 704, y: 270, level: 3 },
  { id: "hierarchy", label: "分层记忆", caption: "本库 3 条证据", kind: "known", x: 118, y: 312, level: 2 },
  { id: "write-trigger", label: "写入触发", caption: "缺口 · 高优先级", kind: "gap", x: 258, y: 378, level: 4, gapId: "write-trigger" },
  { id: "conflict-expiry", label: "冲突与过期", caption: "缺口 · 高优先级", kind: "gap", x: 486, y: 378, level: 4, gapId: "conflict-expiry" },
  { id: "mastery-loop", label: "掌握验证", caption: "缺口 · 中优先级", kind: "gap", x: 696, y: 404, level: 4, gapId: "mastery-loop" },
  { id: "privacy", label: "跨会话隐私边界", caption: "边界候选 · 未验证", kind: "boundary", x: 28, y: 455, level: 4 },
  { id: "trigger-score", label: "触发评分阈值", caption: "实现细节 · 待验证", kind: "boundary", x: 260, y: 492, level: 5 },
  { id: "review-schedule", label: "7 / 21 / 60 天复验", caption: "实现细节 · 待验证", kind: "boundary", x: 560, y: 492, level: 5 },
];

const EDGES = [
  ["root", "window"],
  ["root", "summary"],
  ["root", "scratchpad"],
  ["root", "retrieval"],
  ["root", "hierarchy"],
  ["hierarchy", "write-trigger"],
  ["retrieval", "conflict-expiry"],
  ["summary", "mastery-loop"],
  ["hierarchy", "privacy"],
  ["write-trigger", "trigger-score"],
  ["mastery-loop", "review-schedule"],
] as const;

const NODE_BY_ID = new Map(MAP_NODES.map((node) => [node.id, node]));

function nodeCenter(node: MapNode) {
  return { x: node.x + 79, y: node.y + 31 };
}

export function KnowledgeCompletionDemo() {
  const [goal, setGoal] = useState("补全 Agent 记忆系统从短期上下文到长期经验的关键机制");
  const [granularity, setGranularity] = useState(4);
  const [hops, setHops] = useState(2);
  const [activeGap, setActiveGap] = useState<GapId>("write-trigger");
  const [completed, setCompleted] = useState<GapId[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [showDraft, setShowDraft] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [activity, setActivity] = useState([
    "已读取 24 张明晰笔记卡",
    "已按学习目标生成粒度 4 的局部知识图",
    "发现 3 个证据缺口，外部候选保持灰态",
  ]);
  const timers = useRef<number[]>([]);

  const gap = GAPS[activeGap];
  const candidates = SOURCES[activeGap];
  const coverage = Math.min(92, 68 + completed.length * 7);
  const activeComplete = completed.includes(activeGap);
  const flowStep = showDraft ? 3 : showCandidates ? 2 : 1;

  const selectedCandidates = useMemo(
    () => candidates.filter((source) => selectedSources.includes(source.id)),
    [candidates, selectedSources],
  );
  const visibleNodes = useMemo(
    () => MAP_NODES.filter((node) => node.level <= granularity),
    [granularity],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );

  useEffect(() => {
    return () => timers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function chooseGap(id: GapId) {
    setActiveGap(id);
    setSearching(false);
    setShowCandidates(false);
    setSelectedSources([]);
    setShowDraft(false);
    setLessonOpen(false);
    setQuizAnswer(null);
  }

  function startSearch() {
    if (searching) return;
    setSearching(true);
    setShowDraft(false);
    setActivity((items) => [`正在为“${gap.title}”检索候选证据…`, ...items].slice(0, 5));
    const timer = window.setTimeout(() => {
      setSearching(false);
      setShowCandidates(true);
      setSelectedSources(candidates.slice(0, 2).map((source) => source.id));
      setActivity((items) => [`已找到 ${candidates.length} 条候选，等待人工核验`, ...items].slice(0, 5));
    }, 760);
    timers.current.push(timer);
  }

  function toggleSource(id: string) {
    setSelectedSources((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  function createDraft() {
    if (!selectedSources.length) return;
    setShowDraft(true);
    setActivity((items) => [
      `已用 ${selectedSources.length} 条核验来源生成补全草稿`,
      ...items,
    ].slice(0, 5));
  }

  function applyDraft() {
    setCompleted((items) => (items.includes(activeGap) ? items : [...items, activeGap]));
    setShowDraft(false);
    setLessonOpen(true);
    setActivity((items) => [
      `“${gap.title}”已写回为待复验知识卡，原始来源完整保留`,
      ...items,
    ].slice(0, 5));
  }

  function resetDemo() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setActiveGap("write-trigger");
    setCompleted([]);
    setSearching(false);
    setShowCandidates(false);
    setSelectedSources([]);
    setShowDraft(false);
    setLessonOpen(false);
    setQuizAnswer(null);
    setAutoPlaying(false);
    setActivity([
      "已读取 24 张明晰笔记卡",
      "已按学习目标生成粒度 4 的局部知识图",
      "发现 3 个证据缺口，外部候选保持灰态",
    ]);
  }

  function playDemo() {
    resetDemo();
    setAutoPlaying(true);
    setSearching(true);
    const schedule = (delay: number, fn: () => void) => {
      const timer = window.setTimeout(fn, delay);
      timers.current.push(timer);
    };
    schedule(700, () => {
      setSearching(false);
      setShowCandidates(true);
      setActivity((items) => ["已完成多来源检索与去重", ...items].slice(0, 5));
    });
    schedule(1350, () => {
      setSelectedSources(["reflexion", "generative-agents"]);
      setActivity((items) => ["已勾选 2 条高可信候选", ...items].slice(0, 5));
    });
    schedule(2050, () => {
      setShowDraft(true);
      setActivity((items) => ["已生成可溯源补全草稿", ...items].slice(0, 5));
    });
    schedule(2850, () => {
      setCompleted(["write-trigger"]);
      setShowDraft(false);
      setLessonOpen(true);
      setActivity((items) => ["已写回知识卡，并生成微课与检查题", ...items].slice(0, 5));
    });
    schedule(3450, () => setAutoPlaying(false));
  }

  return (
    <section className="kcd" aria-label="知识补全前端交互演示" data-tour="completion-area">
      <header className="kcd-head" data-tour="completion-header">
        <div>
          <span className="kcd-kicker">扩展 · Knowledge completion</span>
          <h1>从“我有笔记”走到“我真的补会了”</h1>
          <p>只扩展当前目标相关的边界；本库证据、外部候选与掌握证据始终分开。</p>
        </div>
        <div className="kcd-head-actions">
          <span className="kcd-demo-state"><i />本地交互演示 · 不调用后端</span>
          <button type="button" className="kcd-btn ghost" onClick={resetDemo}>重置</button>
          <button
            type="button"
            className="kcd-btn primary"
            data-tour="completion-play"
            onClick={playDemo}
            disabled={autoPlaying}
          >
            {autoPlaying ? "演示进行中…" : "一键演示完整闭环"}
          </button>
        </div>
      </header>

      <div className="kcd-layout">
        <aside className="kcd-rail" data-tour="completion-goal">
          <div className="kcd-rail-title">
            <strong>补全任务</strong>
            <button type="button" aria-label="新建补全任务">＋</button>
          </div>
          <button type="button" className="kcd-task is-on">
            <span>进行中</span>
            <strong>Agent 记忆系统</strong>
            <small>24 张笔记 · 3 个缺口</small>
          </button>
          <button type="button" className="kcd-task">
            <span>已完成</span>
            <strong>RAG 评测方法</strong>
            <small>覆盖 91% · 2 天前</small>
          </button>

          <div className="kcd-rail-section">目标与边界</div>
          <label className="kcd-goal-field">
            <span>学习目标</span>
            <textarea value={goal} rows={4} onChange={(event) => setGoal(event.target.value)} />
          </label>
          <div className="kcd-control-row">
            <label>
              <span>粒度</span>
              <select value={granularity} onChange={(event) => setGranularity(Number(event.target.value))}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>跳数</span>
              <select value={hops} onChange={(event) => setHops(Number(event.target.value))}>
                {[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="kcd-boundary-note">
            <strong>本轮边界</strong>
            <p>聚焦写入、冲突与掌握；隐私治理保留为候选，不自动补全。</p>
          </div>

          <div className="kcd-rail-section">运行记录</div>
          <div className="kcd-activity">
            {activity.map((item, index) => (
              <p key={`${item}-${index}`}><i className={index === 0 ? "is-live" : ""} />{item}</p>
            ))}
          </div>
        </aside>

        <main className="kcd-main">
          <div className="kcd-metrics" data-tour="completion-metrics">
            <article>
              <span>目标相关覆盖</span>
              <strong>{coverage}<em>%</em></strong>
              <small>{completed.length ? `本轮 +${completed.length * 7}%` : "基于 24 张笔记"}</small>
            </article>
            <article>
              <span>证据缺口</span>
              <strong>{3 - completed.length}<em> / 3</em></strong>
              <small>只统计目标内缺口</small>
            </article>
            <article>
              <span>边界候选</span>
              <strong>1</strong>
              <small>未验证 · 不计入覆盖</small>
            </article>
            <article>
              <span>掌握状态</span>
              <strong>{quizAnswer === "b" ? "1" : "0"}<em> understood</em></strong>
              <small>项目证据后才是 applied</small>
            </article>
          </div>

          <section className="kcd-map-card" data-tour="completion-map">
            <header>
              <div>
                <span>Goal-relative map</span>
                <strong>Agent 记忆系统 · 粒度 {granularity} · {hops} 跳</strong>
              </div>
              <div className="kcd-legend">
                <span><i className="known" />本库有证据</span>
                <span><i className="gap" />待补缺口</span>
                <span><i className="boundary" />边界候选</span>
              </div>
            </header>
            <div className="kcd-map-stage">
              <svg viewBox="0 0 900 560" aria-hidden>
                {EDGES.map(([fromId, toId]) => {
                  if (!visibleNodeIds.has(fromId) || !visibleNodeIds.has(toId)) return null;
                  const from = NODE_BY_ID.get(fromId);
                  const to = NODE_BY_ID.get(toId);
                  if (!from || !to) return null;
                  const a = nodeCenter(from);
                  const b = nodeCenter(to);
                  const targetComplete = to.gapId ? completed.includes(to.gapId) : false;
                  return (
                    <path
                      key={`${fromId}-${toId}`}
                      d={`M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`}
                      className={to.kind === "gap" && !targetComplete ? "is-gap" : to.kind === "boundary" ? "is-boundary" : ""}
                    />
                  );
                })}
              </svg>
              {visibleNodes.map((node) => {
                const isGap = Boolean(node.gapId);
                const isComplete = node.gapId ? completed.includes(node.gapId) : false;
                const selected = node.gapId === activeGap;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`kcd-node is-${node.kind}${selected ? " is-selected" : ""}${isComplete ? " is-complete" : ""}`}
                    style={{ left: `${(node.x / 900) * 100}%`, top: `${(node.y / 560) * 100}%` }}
                    onClick={() => node.gapId && chooseGap(node.gapId)}
                    disabled={!isGap || searching || autoPlaying}
                  >
                    <span>{isComplete ? "已补全" : node.kind === "gap" ? "知识缺口" : node.kind === "boundary" ? "边界" : node.kind === "root" ? "目标" : "本库"}</span>
                    <strong>{node.label}</strong>
                    <small>{isComplete ? "已写回 · 待复验" : node.caption}</small>
                  </button>
                );
              })}
              {searching ? <div className="kcd-scan"><i /><span>正在跨来源查证“{gap.title}”</span></div> : null}
            </div>
            <footer>
              <span>灰色节点不会被算作“已知” · 显示 {visibleNodes.length}/{MAP_NODES.length} 节点</span>
              <span>切换粒度会折叠/展开视图，不重新生成知识</span>
            </footer>
          </section>
        </main>

        <aside className="kcd-inspector" data-tour="completion-inspector">
          <div className="kcd-flow" aria-label="补全进度">
            {["定位缺口", "检索候选", "核验证据", "确认写回"].map((label, index) => (
              <span
                key={label}
                className={activeComplete ? "is-done" : index + 1 < flowStep ? "is-done" : index + 1 === flowStep ? "is-on" : ""}
              >
                <i>{activeComplete || index + 1 < flowStep ? "✓" : index + 1}</i>{label}
              </span>
            ))}
          </div>

          <div className="kcd-inspector-head">
            <span className={activeComplete ? "is-complete" : ""}>{activeComplete ? "已补全 · 待复验" : "知识缺口 · 待核验"}</span>
            <h2>{gap.title}</h2>
            <p>{gap.question}</p>
          </div>

          <div className="kcd-gap-why">
            <span>为什么是缺口</span>
            <p>{gap.reason}</p>
            <small>{gap.consequence}</small>
          </div>

          {!showCandidates && !activeComplete ? (
            <button type="button" className="kcd-search-btn" onClick={startSearch} disabled={searching}>
              <span>{searching ? "正在检索并去重…" : "搜索候选资料"}</span>
              <small>演示：论文 / 本库 / 工程资料</small>
            </button>
          ) : null}

          {showCandidates && !showDraft && !activeComplete ? (
            <div className="kcd-sources">
              <div className="kcd-section-head">
                <div><strong>候选证据</strong><span>{selectedSources.length} 已选</span></div>
                <small>选择不会自动写回</small>
              </div>
              {candidates.map((source) => {
                const on = selectedSources.includes(source.id);
                return (
                  <button key={source.id} type="button" className={on ? "is-on" : ""} onClick={() => toggleSource(source.id)}>
                    <i>{on ? "✓" : ""}</i>
                    <span className="kcd-source-type">{source.source}</span>
                    <strong>{source.title}</strong>
                    <p>{source.evidence}</p>
                    <small>{source.role} · 可信 {source.confidence}% · {source.year}</small>
                  </button>
                );
              })}
              <button type="button" className="kcd-btn primary full" disabled={!selectedSources.length} onClick={createDraft}>
                用已选来源生成补全草稿
              </button>
            </div>
          ) : null}

          {showDraft && !activeComplete ? (
            <div className="kcd-draft">
              <div className="kcd-section-head">
                <div><strong>写回预览</strong><span>不会覆盖原笔记</span></div>
                <small>{selectedCandidates.length} 条来源可回链</small>
              </div>
              <article>
                <span>AI 补全草稿</span>
                <h3>{gap.title}</h3>
                <p>{gap.draft}</p>
                <div><b>关系</b>{gap.relation}</div>
                <div><b>证据</b>{selectedCandidates.map((source) => source.title).join("；")}</div>
              </article>
              <div className="kcd-draft-actions">
                <button type="button" className="kcd-btn ghost" onClick={() => setShowDraft(false)}>返回核验</button>
                <button type="button" className="kcd-btn primary" onClick={applyDraft}>确认写回知识库</button>
              </div>
            </div>
          ) : null}

          {activeComplete || lessonOpen ? (
            <div className="kcd-lesson">
              <div className="kcd-writeback-ok"><i>✓</i><div><strong>知识卡已写回</strong><span>来源、关系与本轮变更均可追溯</span></div></div>
              <div className="kcd-section-head">
                <div><strong>2 分钟微课</strong><span>复验理解</span></div>
                <small>完成后才增加掌握证据</small>
              </div>
              <article>
                <span>一句话抓重点</span>
                <p>{gap.draft}</p>
              </article>
              <fieldset>
                <legend>哪一种信息最适合直接进入稳定长期记忆？</legend>
                {[
                  ["a", "模型对用户偏好的单次猜测"],
                  ["b", "用户确认过、并在任务结果中重复成立的约束"],
                  ["c", "所有出现过两次的聊天句子"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${quizAnswer === value ? "is-picked" : ""}${quizAnswer && value === "b" ? " is-correct" : ""}`}
                    onClick={() => setQuizAnswer(value)}
                  >
                    <i>{value.toUpperCase()}</i>{label}
                  </button>
                ))}
              </fieldset>
              {quizAnswer ? (
                <div className={`kcd-quiz-result ${quizAnswer === "b" ? "is-right" : ""}`}>
                  <strong>{quizAnswer === "b" ? "回答正确 · 新增 understood 证据" : "再想一步：猜测不能直接升级为稳定事实"}</strong>
                  <span>{quizAnswer === "b" ? "建议 7 天后复验；真实项目应用后再升级为 applied。" : "需要显式确认、结果反馈或重复稳定证据。"}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
