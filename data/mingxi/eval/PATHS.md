# 明晰 Agent 评测 · 路径速查（Eval v2）

> 完整说明见 [`README.md`](./README.md) · 方案权威 [`docs/mingxi/20-agent-eval-scheme-v2.md`](../../docs/mingxi/20-agent-eval-scheme-v2.md)

## 一键

```bash
npm run test:mingxi:eval-v2
```

## 代码

| 内容 | 路径 |
|---|---|
| Agent 本体 | `lib/mingxi/intent/` |
| 编排 / 引擎 | `lib/mingxi/agent/` · `lib/mingxi/engine/` |
| P1 runner | `scripts/mingxi/run-intent-eval.mjs` |
| P3 runner | `scripts/mingxi/run-agent-scripts.mjs` |
| Eval v2 总控 | `scripts/mingxi/run-eval-v2.mjs` |

## 数据

| 内容 | 路径 |
|---|---|
| 银标 gold | `data/mingxi/eval/gold/` |
| 剧本 scenarios | `data/mingxi/eval/scenarios/` |
| 词表 | `data/mingxi/eval/vocab/` |
| manifest | `data/mingxi/eval/silver-manifest.json` |
| 真实语料 | `data/mingxi/real/latest-cards.json` |

## 报告

| 内容 | 路径 |
|---|---|
| **总报告 HTML** | `data/mingxi/eval/reports/agent-eval-v2-report.html` |
| 总报告 JSON | `data/mingxi/eval/reports/agent-eval-v2-report.json` |
| P1 | `data/mingxi/eval/reports/intent-agent-report.html` |
| P3 | `data/mingxi/eval/reports/agent-scripts-report.html` |
