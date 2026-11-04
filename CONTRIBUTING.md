# 开发与发布流程

## 每次修改

1. 从 GitHub 获取最新 `main`，核对当前线上 Wix revision 与最近一次已记录发布。若不一致，先找出差异，保留双方内容再继续。
2. 创建 `feature/<主题>` 或 `fix/<主题>` 分支。将用户需求拆为可检查的小提交；提交说明写明功能或修复原因。
3. 运行 `npm ci`、`npm run typecheck`、`npm test`。涉及界面的改动还应检查浏览器交互、窄屏和已有数据兼容性。不得把个人作文、批阅导出和测试凭据提交到仓库。
4. 提交 PR，写明最终行为、验证结果及数据变更；更新 CHANGELOG。由 GitHub Actions 执行类型检查和独立测试。
5. 检查通过后合并。不要强制推送 `main` 或改写 `history/wix-*` 历史分支。仓库保护规则需在远端创建后设置，本文本身不等于已经启用保护。

## 发布与追踪

1. 从一个明确的 GitHub commit 构建，使用已有 Wix 站点和授权环境。不要把 `.env` 或 Wix Secrets 同步到 GitHub，也不要把生产凭据加入普通 PR 的检查任务。
2. 按现有 Wix 发布流程部署；先核对线上头版本，处理并发差异，不强制覆盖其他更新。
3. 验证真实线上页面和关键功能。通过后创建 `release-YYYYMMDD-HHMMSS` 标签或 GitHub Release，记录 GitHub commit、Wix source revision、build ID、UTC 时间及验证结果。
4. 发布失败时保留日志摘要并定位失败阶段，不能把未验证版本标为已上线。

自动部署暂未配置。CI 无需 Wix 生产权限，站点发布仍通过已有授权流程执行。

## 回退

先读取目标发布标签或历史分支与当前版本的差异，确认数据结构兼容性，再从 GitHub 新建 revert 提交、运行检查并重新部署。不要通过改写 Git 历史或删除现有数据实现回退。源码回退不会自动回退 Wix 集合中的个人数据。

## 迁移备份恢复

备份包中的 `essay-folio.bundle` 保存迁移提交与全部标签，可在空目录外执行：

```sh
git clone essay-folio.bundle essay-folio
cd essay-folio
git log --oneline --reverse
git tag --list
```

远端为 `https://github.com/Slash2024/essay_folio.git`。迁移后的 `main` 保留了经过核实的源码快照提交，`history/wix-*` 分支保留各版源文件树。备份包只代表打包时的状态；检查 GitHub 当前分支与 CI 结果后再继续开发。
