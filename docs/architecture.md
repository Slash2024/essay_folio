# Essay Folio 架构与一致性约束

审计基线：GitHub `a68eac48196d8a96183afb8565d145cc99c929f7`；修改前核对的 Wix source revision 为 `3e04e51819780d38bcb276a208344b4389a97c84`。这是静态源码审阅、独立 API 回归与隔离浏览器测试的结论，不代表所有生产数据状态均已覆盖。

## 模块边界

| 层 | 入口 / 模块 | 职责 |
|---|---|---|
| 页面与构建 | `src/pages/index.astro`、`astro.config.mjs`、`integrations/ssr-manifest.mjs` | Astro 页面、React 客户端入口、Wix 服务端适配、发布清单修补；本地 UI 预览通过 `FOLIO_UI_PREVIEW` 隔离 Wix 集成 |
| 应用编排 | `src/components/folio/FolioApp.tsx` | 访问入口、导航、写作状态、排队自动保存、提交、导入、删除及异步加载功能面板 |
| 批阅交互 | `StructuredReview`、`SentenceReview`、`CurationEditor`、`CurationHistory`、`CurationTour` | 按绑定稿件展示批阅、定位原文、人工整理、学习状态、历史恢复及引导 |
| 纯业务逻辑 | `src/lib/review-analysis.ts`、`review-interactions.ts`、`sentence-reading.ts`、`review-curation.ts`、`revisions.ts` | Markdown 解析、稳定建议编号、UTF-16 原文范围、分句分组、整理校验、文本版本差异 |
| 辅助业务 | `src/lib/punctuation-check.ts`、`expression-matcher.ts`、`analytics.ts`、`clipboard.ts`、`export.ts` | 标点建议、表达匹配、统计、送审图文、档案 ZIP 导出 |
| 服务端操作 | `src/pages/api/folio.ts` | 一个 action 分发端点；校验来源、会话、请求体与业务版本，执行云端操作 |
| 会话 | `src/server/session.ts` | 服务端 Secrets、访问码校验、30 天 HMAC Cookie、固定线上来源校验 |
| 存储与版本 | `src/server/archive.ts`、`history.ts` | Wix `EssayArchive` 查询与写入、作文版本、旧数据恢复、批阅解析 |
| 通用 Wix 层 | `src/wix/`、`src/hooks/`、`src/components/members/` | 已有 CMS 和会员适配；主写作档案使用独立个人访问码，不能将两套身份系统混为一谈 |

主业务界面与 API 共享 TypeScript 类型及纯函数；浏览器不直接执行 `EssayArchive` 的提权操作。Markdown 通过 `MarkdownView` 使用 DOMPurify 清理后显示。源码中的默认题库、表达库和提示词，与云端实际个人记录分开保存。

## 数据关系与写入顺序

`EssayArchive` 是按 `kind` 区分多种记录的同一集合，`payload` 保存 JSON，外层字段用于查询。

| kind | 身份与关联 | 关键约束 |
|---|---|---|
| writing | 用户生成的 ID；`questionId`、可选 `parentId` | draft → submitted → reviewed；不同稿件重写使用新 ID |
| revision | `${writingId}-v${version}` | 保存不可变正文；同一 ID 出现不同正文会报冲突 |
| review | 独立 ID；`writingId`、`revisionId` | 原始 Markdown 与对应正文版本绑定；导入后锁定正文 |
| curationVersion | 独立 ID；`reviewId`、`writingId` | 人工整理快照及字段变化；review.curation.history 引用可恢复版本 |
| snapshot | 独立 ID；`writingId` | 保留送审材料快照，不能凭当前正文推断旧批阅原文 |
| notice | 首次提交使用 `submit-${writingId}`，手动使用新 ID | 记录 sending / accepted / failed；仅在服务端使用 Bark 配置 |
| deleted | 原 writing ID | 仅保留删除标记，阻止旧页面自动保存复活记录 |
| expressions / templates / rubrics / preference | 固定设置 ID | 表达库与复习整理使用各自版本检查；设置不属于作文导出内容 |

提交依次保存 writing 和 revision；导入依次保存 review 和 writing 的 reviewed 状态。这些操作不是数据库事务，因此重试必须识别已经成功的步骤。此次修复为提交补齐缺失版本；为相同导入请求返回完整响应并补齐 reviewed 状态，同时拒绝同编号的不同内容或跨稿件复用。前端在一次未完成导入的重试中复用编号。

草稿队列执行请求时读取最近一次成功返回的 `updatedAt`，通过 `baseUpdatedAt` 发送；服务端拒绝落后版本与题目变更。完全相同的草稿重试不再改写时间。保存提示与离页保护比较已确认保存的文本及未完成队列，包括将正文清空的情况。请求进行中撤回到旧正文时仍需入队，避免中间稿随后覆盖最终可见内容；无待处理请求且正文已保存时，恢复正确保存提示。

## 测试边界

`npm run typecheck` 检查 TypeScript。`npm test` 包含解析、句子定位、标点、人工整理、API 数据关联，以及故障注入的一致性回归。新增 `archive-consistency.test.mjs` 使用真实 API 处理器与纯业务逻辑，只替换存储和会话适配，不调用 Wix、Bark 或个人数据。

浏览器测试覆盖写作 → 慢自动保存 → 新文本提示、两个标签页的旧版本冲突、导入写入中断 → 原编号重试；使用合成正文与隔离存储。生产发布仍需独立检查线上页面和真实 Wix 运行环境，不能以隔离测试替代。

## 后续维护重点

1. `baseUpdatedAt` 是先读后写的应用层校验，不能承诺数据库级原子比较更新。真正同时读到同一版本的跨请求写入仍存在竞争窗口；后续应基于经过官方文档确认的条件写入或服务端串行机制处理，不能用单个浏览器队列宣称已解决跨实例并发。
2. API 的 action 分发和应用组件较集中。后续可按写作、批阅、设置、导出拆分处理器和状态逻辑，保持现有请求与历史数据协议。
3. 单稿批阅读取目前最多 100 份、提醒最多 20 条；全量导出使用分页。超大单稿档案需要补充分页接口与交互，当前测试不覆盖该规模。
4. 导出和历史修复会遍历云端记录，且部分读取路径会执行历史补全；后续应分离显式迁移与普通读取，补充跨实例故障恢复验证。

此次变更无需集合结构迁移；未修改历史源码分支、默认内容或个人档案。
