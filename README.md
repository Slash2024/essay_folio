# Essay Folio

个人考研英语写作与批阅记录网站，使用 Astro、React 和 Wix Headless。网站整理外部批阅结果，不调用 AI 进行作文批改。

现有功能包括英语一大小作文与英语二大作文题库、写作与修改记录、送审内容复制、标点检查、Markdown 批阅导入和下载、结构化分析、逐句交互批注、人工整理及学习状态、表达库匹配、手动推送和数据导出。

## 源码与历史

源码仓库：[Slash2024/essay_folio](https://github.com/Slash2024/essay_folio)。该仓库当前为公开仓库；应用数据与服务端密钥不存放于仓库中。

GitHub 用于提交历史、PR 与自动检查。仓库保护规则尚未配置，不能视为已强制执行 PR 流程。

当前线上源码来自 Wix revision `3e04e51819780d38bcb276a208344b4389a97c84`。8 个可恢复历史快照及逐版改动见 [CHANGELOG.md](CHANGELOG.md)，原始编号、对应迁移提交和文件校验值见 [docs/source-history.json](docs/source-history.json)。GitHub 的 `history/wix-<编号前8位>` 分支保存各版原始源码文件树。

这些提交由核实后的源码快照重建。Wix 导出不含原始 Git 历史，不能视为最初仓库的完整 Git 镜像。尚未找到源码的早期需求讨论不伪造成版本。

## 本地开发

使用 Node.js 24 和锁定依赖：

```sh
npm ci
npm run typecheck
npm test
```

完整 Wix 开发与构建需要该站点权限。使用仓库安装的 Wix CLI 登录，并按其当前帮助获取站点开发环境后运行 `npm run dev`。`wix.config.json` 中的站点和应用 ID 为部署目标标识，不是授权密钥。

现有 `npm run build` / `npm run release` 保留 Wix CLI 流程。源码历史中的实际构建也使用过 `npx astro build`，环境必须包含 Wix CLI 提供的运行配置。无凭据的 GitHub CI 仅运行类型检查与独立测试，不执行带生产权限的构建或部署。

服务端从 Wix Secrets 读取 `ESSAY_ACCESS`（访问配置）及 `ESSAY_BARK_KEY`（推送密钥）。只记录密钥名称，不保存或导出值。实际作文、批阅和整理记录在 Wix `EssayArchive` 集合中，源码迁移不会搬动、重置或备份该集合。题库、题图、默认表达库、提示词和评分标准属于源码。

## 架构

模块划分、记录关系、写入顺序及测试边界见 [docs/architecture.md](docs/architecture.md)。

## 后续开发

按 [CONTRIBUTING.md](CONTRIBUTING.md) 使用分支、PR、检查和发布记录。部署继续由 Wix 承载；GitHub 管理源码、代码差异和版本说明。
