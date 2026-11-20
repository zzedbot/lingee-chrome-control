# Lingee Browser Control 执行可靠性整改计划

日期：2026-11-16
目标版本：0.2.2
依据：`diagnostic-20261116-231336.zip` 中 23:09～23:13 会话审计，以及保存成功提示未被捕获的补充分析。

## 1. 整改目标

- Windows PowerShell 调用不再依赖跨命令边界不稳定的内联 JSON。
- 表单填写优先使用语义定位，逐字段精确读回并在首个不一致处停止。
- 最终表单状态变化后，旧的后果性 Action Intent 不得继续执行。
- 在动作执行前注册观察器，可靠捕获短暂出现的 Toast、Message、Notification 等页面反馈。
- Toast 只作为辅助证据；保存或提交仍需记录 ID、状态、列表行或重新打开读回等持久化证据。
- 用确定性状态等待代替固定 `Start-Sleep`。
- 错误提示直接给出可复制的正确命令，减少模型试错和往返。

## 2. 已确认问题与整改映射

| 编号 | 已确认问题 | 整改措施 | 验收证据 |
|---|---|---|---|
| R1 | PowerShell 单引号内联 JSON 在 Lingee Build 命令边界仍可能被破坏 | Windows 示例和 Skill 统一要求 `ConvertTo-Json | --params-stdin` 或 `--params-file`；CLI 对混用参数和缺失 stdin 给出精确修复提示 | CLI 单测覆盖单引号失效场景、stdin、文件、空参数和混用错误 |
| R2 | `endSession --params-stdin '{}'` 属于易犯的参数混用 | 无参数方法统一推荐 `invoke.mjs call browser.endSession`；usage 和错误详情给出该形式 | 无参数调用测试通过，混用时返回结构化建议 |
| R3 | 表单使用脆弱的 `nth-of-type` 定位 | Skill、KDesign 参考和示例要求优先 `testId`、role/name、label、精确文本，稳定 CSS 仅作末级选择 | 示例不再以布局序号定位普通字段；测试检查语义定位模板 |
| R4 | 只独立读回首尾字段 | 新增/更新确定性表单工作流模板，每个 `fill` 后紧跟 `locatorState` 精确值断言 | Workflow 测试证明首个不匹配即停止 |
| R5 | Mock 模式变化后仍执行旧保存意图 | Action Intent 绑定准备时的文档身份和可选页面状态摘要；同一标签页发生受控写操作后使未执行意图失效 | 单测覆盖字段修改、导航和文档替换后的 `ACTION_INTENT_STALE` |
| R6 | 保存 Toast 在读取前已消失 | 新增高层 `browser.performAndWaitForFeedback`：先注册受限 DOM 观察，再执行标准可见动作，返回匹配反馈及动作结果 | 扩展、Host、MCP、CLI、Skill 映射和真实测试页用例全部覆盖 |
| R7 | `readText`/`domSnapshot` 没有历史，控制台也不包含 Toast | 文档明确区分即时快照、控制台日志和临时反馈观察能力 | API/Skill 示例说明三者边界 |
| R8 | 工具栏变化被误当作持久化成功 | 保存模板将“反馈捕获”和“持久化验证”拆为两个必需阶段 | 回归测试要求 Toast + 记录状态/重新打开读回，缺一不得宣称完成 |
| R9 | 固定等待 20 秒、3 秒 | Bridge 恢复使用有界 preflight 重试；页面动作使用 locator/URL/load/feedback 状态等待 | Skill 和示例中不再出现用于业务同步的固定睡眠 |
| R10 | 固定测试编码 `TEST001` 易冲突 | 示例使用时间戳或调用方提供的唯一后缀，并在保存前检查目标记录范围 | 示例与测试使用唯一测试标识 |

## 3. 实施批次

### A. CLI 与 Windows 调用契约

- [x] 更新 `src/jsonrpc-cli.mjs` 的参数解析、usage 和结构化修复建议。
- [x] 更新 Skill 的 `SKILL.md`、`references/tools.md`、`references/examples.md` 和故障排查文档。
- [x] 明确 Windows 下禁止内联 JSON；无参数方法不传 `{}`。
- [x] 扩充 `test/jsonrpc-cli.test.mjs` 与 `test/skill-invoke.test.mjs`。

### B. 短暂页面反馈捕获

- [x] 设计并实现 `browser.performAndWaitForFeedback` 高层方法。
- [x] 仅允许嵌套标准可见动作；禁止 raw CDP、页面脚本及任意方法名。
- [x] 在动作前安装观察器，限制匹配文本、节点数、文本长度和超时。
- [x] 返回动作结果、捕获文本、角色/aria-live、出现时间和是否已消失。
- [x] 接入扩展、Native Host、MCP、CLI capability、API 文档和测试站。
- [x] 为 KDesign Message/Notification 及普通 `role=status/alert` 增加自动化与真实浏览器回归入口；真实浏览器结果见第 4 节待验项。

### C. Action Intent 新鲜度

- [x] Intent 记录准备时的 `documentId` 和页面表单状态 `stateDigest`。
- [x] 执行前复核标签页、来源、文档身份和状态摘要。
- [x] 准备后发生受控写操作时，相关待执行 Intent 标记为 stale。
- [x] 用户改变表单后必须重新准备并重新展示最终摘要。
- [x] 增加导航、字段修改、文档替换、状态摘要变化及未变化正常执行等单测。

### D. 表单与持久化工作流

- [x] 更新 `examples/kingdee-business-page.json`，改为语义 Locator、逐字段精确读回、首错停止。
- [x] 增加唯一测试编码约定。
- [x] 保存动作同时捕获成功/失败反馈，但不把 Toast 当作最终成功依据。
- [x] 在 Skill 中要求记录 ID/状态、列表行或重新打开读回至少一种持久化证据。
- [x] 删除业务流程中的固定睡眠示例，改用有界状态等待。

### E. 版本、构建与一致性

- [x] 将扩展、Host、CLI、Skill 和包版本统一升级为 0.2.2。
- [x] 构建轻量 Native Host 资产并核对源码/资产一致性。
- [x] 生成 CRX3、SHA-256 和 Skill 内置 CRX。
- [x] 核对解包扩展、Host、Skill capability 哈希与版本。

## 4. 测试计划

- [x] 全量 Node 自动化测试通过（175/175）。
- [x] Skill `quick_validate.py` 通过。
- [x] CLI：PowerShell stdin、params-file、无参数、混用、缺失 stdin、无效 JSON。
- [ ] Feedback 真实 Chrome 验收：立即/延迟出现、快速消失、重复提示、超时、导航、Frame、文本截断；基础捕获与基线排除自动化已通过。
- [x] Intent 自动化：准备后无变化可执行；受控写入、导航、文档替换或摘要变化后旧 Intent 失败关闭。
- [x] KDesign 真实 Chrome 验收：Message.success、Notification、KDesign Pro 表单提交提示均可捕获。
- [x] 持久化真实 Chrome 验收：捕获 KDesign Pro 表单“申请提交成功”后，独立读回持久状态“申请已提交”。
- [x] 安全负向自动化：raw CDP、页面脚本、未知嵌套动作继续被阻断。

## 5. 完成判定

- 所有 R1～R10 均有对应代码、文档和自动化测试证据。
- 任何短暂 Toast 都不会因为模型下一轮延迟或固定睡眠而丢失。
- 页面反馈与持久化状态分别报告，不再把工具栏变化、Toast 或控制台无错误单独当作保存成功。
- Windows 示例中不存在内联 JSON 调用建议。
- 版本与打包资产完全一致，并形成可复核的测试记录。

## 6. 进度记录

- 2026-11-16：完成两轮诊断分析并创建本计划，尚未开始代码变更。
- 2026-11-17：完成 A～E 批次代码、Skill、文档、测试资产和 0.2.2 打包；`npm run check`、174/174 Node 测试及 Skill 校验通过。
- 2026-11-17：发布版与 Skill 内置 CRX 的 SHA-256 均为 `9e8345637083a32a5e27fe0684e5d56a7218787c8b324b9f3ecb1859eaf31781`。
- 2026-11-17：安装 0.2.2 Native Host 并在扩展重新加载后完成真实 Chrome 验收；`display-feedback` 覆盖 Message、Notification 等 9 类交互，KDesign Pro `form-basic` 完成 Toast 与持久状态双重验证。
- 2026-11-17：修复 `kdesign-e2e.mjs --help` 误启动全量浏览器回归的问题，并新增自动化保护；全量测试更新为 175/175。
- 待办：扩展真实 Chrome 反馈韧性矩阵仍需补齐延迟出现、重复提示、明确超时、导航/Frame 上下文变化和文本截断；这些不是本次“保存成功提示漏捕”核心路径的关闭阻塞项。
