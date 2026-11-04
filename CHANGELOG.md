# 版本历史

以下 8 个历史版本均已按 Wix 完整源码编号独立下载核实，并导入 GitHub。每个版本的 Git 文件树哈希与核实后的原始源码快照一致。GitHub 的 `history/wix-*` 分支保存相应源码，主分支保存当前应用源码及开发流程。

Wix 导出不包含原始 Git 提交对象及父子链。本仓库是可追溯的快照迁移历史，不能视为原始 Git 历史的完整镜像。下面日期为 Wix 返回的 UTC 时间；GitHub 导入提交时间为迁移时间。更早的需求讨论不作为已恢复源码版本。

| Wix UTC 时间 | 源码版本及 GitHub 提交 | 相较上一可恢复版本的改动 |
|---|---|---|
| 2026-11-04T10:12:03Z | [ae74bb9a](https://github.com/Slash2024/essay_folio/tree/history/wix-ae74bb9a) · [提交](https://github.com/Slash2024/essay_folio/commit/3a816a50f02e2bef4344cc15c4b393afe478efb8) | **最早可恢复源码快照**：此前功能的累计基线；没有更早源码可作差异比较。包含题库、作文录入及修改历史、Markdown 批阅与解析统计、交互批阅、表达库和手动推送等既有功能。 |
| 2026-11-04T11:08:41Z | [f7173d58](https://github.com/Slash2024/essay_folio/tree/history/wix-f7173d58) · [提交](https://github.com/Slash2024/essay_folio/commit/36be9c8c3fa765d16cad1376922faaf8002bacd6) · [差异](https://github.com/Slash2024/essay_folio/compare/3a816a50f02e2bef4344cc15c4b393afe478efb8...36be9c8c3fa765d16cad1376922faaf8002bacd6) | **按开头、中间、结尾逐句阅读**：新增逐句文章视图和分组边界调整；点击句子查看对应批注；保存分组设置，保留已有学习状态。 |
| 2026-11-04T11:17:05Z | [185163e6](https://github.com/Slash2024/essay_folio/tree/history/wix-185163e6) · [提交](https://github.com/Slash2024/essay_folio/commit/9632b15a53b336e017fbb349d0ff9c0241fd9e93) · [差异](https://github.com/Slash2024/essay_folio/compare/36be9c8c3fa765d16cad1376922faaf8002bacd6...9632b15a53b336e017fbb349d0ff9c0241fd9e93) | **大幅改写采用整句对照**：识别几乎整句重写的建议，以完整原句和修改句对照展示；少量改词继续使用行内差异。 |
| 2026-11-04T11:27:23Z | [86db9691](https://github.com/Slash2024/essay_folio/tree/history/wix-86db9691) · [提交](https://github.com/Slash2024/essay_folio/commit/6fdfa05750e13e3fa2580aa9fbffee3cac7de730) · [差异](https://github.com/Slash2024/essay_folio/compare/9632b15a53b336e017fbb349d0ff9c0241fd9e93...6fdfa05750e13e3fa2580aa9fbffee3cac7de730) | **修复英文句号分句**：修复空格分隔的所有格、引号不配对等造成的错误合句；保留缩写和小数等必要例外，并补充回归用例。 |
| 2026-11-04T12:01:55Z | [a4016f67](https://github.com/Slash2024/essay_folio/tree/history/wix-a4016f67) · [提交](https://github.com/Slash2024/essay_folio/commit/aca77a80affef2db5caf634247fac810ce26f9a8) · [差异](https://github.com/Slash2024/essay_folio/compare/6fdfa05750e13e3fa2580aa9fbffee3cac7de730...aca77a80affef2db5caf634247fac810ce26f9a8) | **送审前标点与空格检查**：新增中文全角标点转半角及空格规则检查、修改预览和逐项确认；接入草稿、提交和编辑流程，不自动改写内容。 |
| 2026-11-04T12:36:43Z | [c1d85159](https://github.com/Slash2024/essay_folio/tree/history/wix-c1d85159) · [提交](https://github.com/Slash2024/essay_folio/commit/8e5c0ecd9bb27491099f07cc2478e03f5e2fe84a) · [差异](https://github.com/Slash2024/essay_folio/compare/aca77a80affef2db5caf634247fac810ce26f9a8...8e5c0ecd9bb27491099f07cc2478e03f5e2fe84a) | **手工整理原文批注**：新增批注编辑、选区定位、重点标记、个人补充、隐藏恢复、整理版本记录与恢复及导出；人工整理作为覆盖层，保留原始批阅与锁定原稿。 |
| 2026-11-04T12:48:08Z | [a23e4aab](https://github.com/Slash2024/essay_folio/tree/history/wix-a23e4aab) · [提交](https://github.com/Slash2024/essay_folio/commit/bafa39bc349be7335a118982dcca2342f1b61151) · [差异](https://github.com/Slash2024/essay_folio/compare/8e5c0ecd9bb27491099f07cc2478e03f5e2fe84a...bafa39bc349be7335a118982dcca2342f1b61151) | **完善手工整理选区定位**：新增使用当前选区和精确引文查找；多处匹配可选择；定位失败阻止使用旧范围误保存，并完善编辑界面。 |
| 2026-11-04T13:15:52Z | [3e04e518](https://github.com/Slash2024/essay_folio/tree/history/wix-3e04e518) · [提交](https://github.com/Slash2024/essay_folio/commit/22ca42b664adbd2c1448ec0ae397401fe9c63cf0) · [差异](https://github.com/Slash2024/essay_folio/compare/bafa39bc349be7335a118982dcca2342f1b61151...22ca42b664adbd2c1448ec0ae397401fe9c63cf0) | **批注整理新手引导**：新增六步交互引导和根据幕布参考记录改编的隔离示例；支持跳过、重播、记住进度，在编辑器中打开帮助时保留未保存内容。 |

## 来源与校验

[source-history.json](docs/source-history.json) 保存原 Wix 编号、源版本时间、GitHub 提交、历史分支、Git 文件树哈希、变更文件清单和逐文件 SHA-256。8 个版本合计 935 项文件校验已通过。预备迁移包中的本地提交及标签编号仅用于对应先前备份，不冒充 GitHub 上的标签。

## GitHub 开发流程

迁移之后另行加入类型检查、5 组既有回归测试、PR 模板和开发发布说明。CI 仅有仓库读取权限，不发布网站，也不写入主分支或版本分支。后续变更按 [CONTRIBUTING.md](CONTRIBUTING.md) 执行。

## 数据范围

服务端密钥值、个人访问码、环境文件、个人写作与批阅数据导出、上传原件、浏览器测试材料、依赖目录和构建缓存未纳入迁移。题库、公共题图、默认表达库、提示词、评分标准和演示示例属于应用源码。
