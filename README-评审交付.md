# 明晰 Demo 5.0 · 评审交付包

这是“明晰”产品 Demo 的可运行全栈源码包，包含完整演示入口、手机端高保真交互、网页工作台、AI 用途确认、知识领域旭日图、知识补全交互、梳逻辑回忆和 40 步新手指引。

> **交付性质：产品 Demo / 评审源码，不是生产系统。** 这里的“完整”指产品页面、演示状态和关键交互流程完整，不代表所有功能都已连接生产后端。

## 能力边界

- 领域旭日基于仓库内 60 篇银标演示笔记真实生成，用于展示分类结构与探索交互。
- 手机捕获、用途确认和梳逻辑线包含部分可运行 API、规则、Agent/LLM 适配与本地降级路径；真实模型调用需要评审者自行配置本机环境变量。
- 第四页“知识扩展 / 知识补全”是高保真前端 Demo：起点、3–6 跳知识节点和搜索结果来自内置演示数据，保存只更新本次页面状态。
- “外查核实”展示完整人工审阅流程，但使用录制/演示资料，不应被视为实时联网事实结论。
- 本包不包含生产级账户权限、多租户、真实知识库接入、稳定实时搜索、持久化多粒度知识图谱与任务运行系统。

如果需要“任意输入一篇笔记 → 后端生成多粒度知识图谱 → 联网补证 → 持久化 runId 与图谱”的真实知识补全链路，请使用独立项目 [noxinsun-source/knowledge-completion](https://github.com/noxinsun-source/knowledge-completion)。该项目不包含在本 Demo 交付仓库中。

> 在线评审网址：<https://mingxi-demo-five.zippy-coin-5950.chatgpt.site/demo>

## 打开方式

- 在线评审网址：`https://mingxi-demo-five.zippy-coin-5950.chatgpt.site/demo`
- 本地完整 Demo：`http://localhost:4317/demo`
- 全自动演示：`http://localhost:4317/demo?autotour=1`
- 网页工作台：`http://localhost:4317/mingxi/web`
- 手机 Demo：`http://localhost:4317/demo/phone`

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

浏览器打开 `http://localhost:4317/demo`。生产构建验证：

```bash
npm run build
npm run start
```

## 技术说明

- Next.js 16 + React 19 + TypeScript
- vinext / Vite / Cloudflare Worker
- `/api/mingxi/*` 为后端 API 路由
- `.openai/hosting.json` 为 Sites 托管配置
- `drizzle/` 为数据库迁移文件

它不是一个单独的静态 HTML。单 HTML 可以保留外观，但无法完整保留 API、数据处理和全栈交互，因此本包以“可复现源码 + 锁定依赖 + 在线网址”的方式交付。

## 文件范围

本包只保留 Demo 可靠运行所需的应用路由、明晰组件、明晰业务库、演示数据、媒体素材、构建配置和数据库迁移。未包含原仓库中的 Git 历史、环境变量、依赖缓存、构建缓存、个人会话、个人笔记，以及知识补全独立项目、知识网络独立项目、Notegraph Studio 等无关实验目录。

任何真实 API 密钥都没有放入本包。默认 Demo 数据和本地降级路径可用于展示；若要接入真实模型，请自行创建本机 `.env`，且不要提交或转发该文件。
