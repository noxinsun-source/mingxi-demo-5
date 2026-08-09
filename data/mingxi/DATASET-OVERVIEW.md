# 明晰 · 数据集总览

| 集合 | 路径 | 角色 | 默认测试 |
|---|---|---|---|
| **Real multimodal** | [`real/`](./real/) | **唯一主数据集** | **`npm run test:mingxi`** |
| Synthetic（归档） | `story-*.ts` / `eval-materials.ts` / `tasks.ts` | 冻结金标准备份 | `npm run test:mingxi:synthetic` |

真实语料含：公开网页快照、`~/Downloads/pdfknowledge`、微信/小红书链接与截图、**本机 Obsidian Vault 笔记/图片**、arXiv 论文摘要。

```bash
npm run corpus:import-local   # 导入 pdfknowledge + 用户链接
npm run corpus:obsidian       # 导入 Obsidian Vault + 新增 PDF + 指定 arXiv
npm run corpus:enrich-tags    # 硅基流动：AI 领域层级标签（旭日图）
npm run test:mingxi           # 只测真实集
```

标签结构见 [`docs/mingxi/08-tag-layers.md`](../docs/mingxi/08-tag-layers.md)。当前规模见 [`real/catalog.json`](./real/catalog.json)。
