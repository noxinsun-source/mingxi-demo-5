# 明晰 Demo 5.0

“明晰”完整产品演示的干净、可复现源码仓库。

- GitHub Pages 首页：<https://noxinsun-source.github.io/mingxi-demo-5/>
- 完整产品 Demo：<https://mingxi-demo-five.zippy-coin-5950.chatgpt.site/demo>
- 全自动演示：<https://mingxi-demo-five.zippy-coin-5950.chatgpt.site/demo?autotour=1>
- 手机 Demo：<https://mingxi-demo-five.zippy-coin-5950.chatgpt.site/demo/phone>
- 网页工作台：<https://mingxi-demo-five.zippy-coin-5950.chatgpt.site/mingxi/web>

## 为什么 GitHub Pages 不是完整应用本体

本项目包含 `/api/mingxi/*` 后端路由，不是单个静态 HTML。GitHub Pages 托管根目录的 `index.html` 作为公开入口；完整交互运行在全栈部署地址。仓库中仍保留全部可运行源码。

## 本地运行

需要 Node.js 22.13 或更高版本：

```bash
npm ci
npm run dev
```

浏览器打开 <http://localhost:4317/demo>。

## 仓库范围

仅保留明晰 Demo 所需的应用路由、组件、业务逻辑、演示数据、媒体素材、构建配置和数据库迁移。仓库不包含 `.env`、API 密钥、`node_modules`、构建缓存、Git 历史、个人会话、个人笔记或其他独立实验项目。

更多交付说明见 [README-评审交付.md](./README-评审交付.md)。
