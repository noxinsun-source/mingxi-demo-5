# 明晰 Agent 评测（Eval v2 · 已冻结）

> **权威方案**：[`docs/mingxi/20-agent-eval-scheme-v2.md`](../../docs/mingxi/20-agent-eval-scheme-v2.md)  
> **冻结名**：`best_product_eval_v2`（2026-08-04）  
> **原则**：先 Oracle 再任务；C2 用途不进门禁；Agent 主战场是种卡剧本。

---

## 一键命令

```bash
# 全套：P1（需 SILICONFLOW_API_KEY）+ P0/P3 剧本 → 总报告
npm run test:mingxi:eval-v2

# 无 API：只跑护栏 + 剧本（仍出总报告）
npm run test:mingxi:eval-v2 -- --skip-p1

# 复用已有 P1 报告 + 重跑剧本
npm run test:mingxi:eval-v2 -- --reuse-p1

# 分层单跑
npm run test:mingxi:intent-eval      # P1
npm run test:mingxi:agent-scripts    # P0 + P3
```

---

## 路径地图（上传 / 查阅用）

### 方案与说明

| 内容 | 路径 |
|---|---|
| **评测方案权威（冻结）** | `docs/mingxi/20-agent-eval-scheme-v2.md` |
| 能力与状态流转 | `docs/mingxi/19-agent-capability-workflow.md` |
| 评测总纲（历史） | `docs/mingxi/11-eval-and-dataset-master.md` |
| 本目录说明 | `data/mingxi/eval/README.md` |

### 数据

| 内容 | 路径 |
|---|---|
| 银标清单 / datasetVersion | `data/mingxi/eval/silver-manifest.json` |
| 银标（P1 教师） | `data/mingxi/eval/gold/*.json` |
| **P3 剧本 scenarios** | `data/mingxi/eval/scenarios/*.json` |
| 词表 | `data/mingxi/eval/vocab/` |
| 真实语料卡 | `data/mingxi/real/latest-cards.json` |

### 评测代码（runners）

| 层 | 脚本 |
|---|---|
| P1 理解烟雾 | `scripts/mingxi/run-intent-eval.mjs` |
| P0+P3 剧本 Oracle | `scripts/mingxi/run-agent-scripts.mjs` |
| **Eval v2 总控** | `scripts/mingxi/run-eval-v2.mjs` |
| Agent 本体 | `lib/mingxi/intent/` · `lib/mingxi/agent/` · `lib/mingxi/engine/` |

### 报告产物（跑完后看这里）

| 报告 | 路径 |
|---|---|
| **Eval v2 总报告 HTML** | `data/mingxi/eval/reports/agent-eval-v2-report.html` |
| Eval v2 JSON | `data/mingxi/eval/reports/agent-eval-v2-report.json` |
| P1 HTML | `data/mingxi/eval/reports/intent-agent-report.html` |
| P1 JSON | `data/mingxi/eval/reports/intent-agent-report.json` |
| P3 HTML | `data/mingxi/eval/reports/agent-scripts-report.html` |
| P3 JSON | `data/mingxi/eval/reports/agent-scripts-report.json` |

---

## 门禁怎么读

| 层 | 失败条件 |
|---|---|
| **P0** | 确认门 / citation / stance 红线任一失败 |
| **P1** | Path@2 &lt; 90% **或** 正负极性翻转 &gt; 0 **或** 护栏失败；**不看 C2** |
| **P3** | 剧本通过率 &lt; 80% |
| **C2 / R-C2** | 只出现在报告灰色栏，永不单独打挂 CI |
| **P4** | 未默认跑（Rubric/pairwise） |

---

## 环境变量（P1）

```
SILICONFLOW_API_KEY=...
SILICONFLOW_SILVER_MODEL=Qwen/Qwen3-VL-32B-Instruct
SILICONFLOW_AGENT_MODEL=Qwen/Qwen2.5-7B-Instruct
```

写在仓库根目录 `.env`（勿提交）。
