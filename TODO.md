# Lingee Chrome Control 能力补齐 TODO

更新日期：2026-11-11
当前基线：0.1.26 / `overlay-v13` / `codex-read-v1` / `isolated-world-v1` / `navigation-v1` / `codex-lifecycle-v1`
参照对象：本机 Codex Browser Use 公开运行接口与仓库 `docs/CODEX-DIFFERENCES.md`

## 执行规则

- 严格按编号顺序推进；前一项达到完成标准后才能开始下一项。
- 每次只将一个顶层任务标记为进行中或完成，避免并行修改公共 locator、队列和会话状态。
- 新能力必须同时覆盖 Extension、Native Host、MCP、Skill CLI、Skill 文档和 Skill 内置扩展副本。
- Skill 标准控制面只允许高层 MCP/CLI 方法；不得重新暴露 raw CDP、任意页面脚本、DOM `.click()` 或未知 Bridge 方法。
- Extension 内部可以使用 Chrome API/CDP 实现高层能力，但必须进行参数校验、站点授权、文档一致性检查和结果验证。
- 会产生鼠标动作的能力必须继续满足虚拟鼠标先绘制、再派发真实输入的强绑定要求。
- 每项至少包含单元测试、契约测试和必要的真实 Chrome E2E；不以仅匹配源码文字的测试代替行为验证。
- 完成一项时更新本文件、`docs/API.md`、`docs/ARCHITECTURE.md`、`docs/CODEX-DIFFERENCES.md`、`docs/HANDOFF.md` 和 Skill 工具参考。

## 完成标准

每个顶层任务只有同时满足以下条件才能勾选：

1. 高层 API、错误码和安全边界已定义。
2. Extension、Host、MCP、CLI 映射完整，未知参数失败关闭。
3. 仓库 Skill 与安装副本一致，内置扩展与 `extension/` 逐文件一致。
4. `npm run check`、`npm test` 和相关真实 Chrome E2E 通过。
5. 不泄露 token、管道地址、敏感页面数据或未经批准的站点信息。
6. 工作区差异经过审查，文档和验证记录已更新。

## 有序任务

### 01. 统一标准能力注册表（已完成）

- [x] 建立单一标准 Bridge 方法注册表，统一生成 MCP 工具、Skill CLI 白名单和工具参考校验输入。
- [x] 消除 `src/mcp-server.mjs` 与 `scripts/invoke.mjs` 的手工方法清单漂移风险。
- [x] 为每个方法记录作用域、是否需要 `tabId`、是否产生输入、是否需要敏感元数据授权及超时类别。
- [x] 保证 `browser.cdp`、`policy.allowCdpMethod`、直接 CDP 名称和未知方法不进入 Skill 标准注册表。
- 验收：新增方法只需在一个注册源声明；MCP/CLI 契约测试自动证明两端一致。

### 02. 类型化 Locator 查询能力（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.locatorCount`。
- [x] 新增 `browser.locatorAllTextContents`。
- [x] 新增 `browser.locatorInnerText` 与 `browser.locatorTextContent`。
- [x] 新增 `browser.locatorGetAttribute`。
- [x] 新增 `browser.locatorIsVisible` 与 `browser.locatorIsEnabled`。
- [x] 所有查询要求 locator 明确、结果有大小上限、只读且不触发页面行为。
- 验收：无需 raw evaluate 即可完成常见元素数量、文本、属性和状态判断。

### 03. Frame 与嵌套 Frame Locator（实现完成，待真实 Chrome 验收）

- [x] 定义可序列化的 frame 路径结构，支持 CSS、角色/名称、标签、文本和 test ID 定位 frame。
- [x] 让第 02 项查询和现有 click/fill/press/type/drag/fileInput 接受可选 frame 路径。
- [x] 支持同源和 Chrome 可合法注入/调试的跨源 iframe；对不可访问 frame 返回稳定错误。
- [x] 导航或 frame documentId 变化时使旧 locator 上下文失效，禁止复用旧坐标。
- [x] 覆盖嵌套 iframe、frame 删除、frame 导航和歧义 frame 的真实 Chrome E2E。
- 验收：企业 ERP 常见 iframe 页面可使用语义 locator 操作，不依赖坐标降级。

### 04. 元素状态等待（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.waitFor`，支持 `attached`、`detached`、`visible`、`hidden`、`enabled`、`disabled`。
- [x] 使用有界超时、合理轮询和导航感知，不使用无限等待或调用方页面脚本。
- [x] 返回最终状态、耗时和稳定错误码；超时不触发输入动作。
- [x] 支持顶层和 frame locator。
- 验收：异步渲染控件可稳定等待，不再依赖固定 sleep。

### 05. URL、加载状态和导航同步（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.waitForURL`。
- [x] 新增 `browser.waitForLoadState`，支持 `commit`、`domcontentloaded`、`load`、有界 `networkidle`。
- [x] 新增 `browser.expectNavigation`，把一个标准高层动作与预期导航绑定。
- [x] 与标签页操作队列、documentId 校验和导航恢复逻辑集成。
- [x] 覆盖 SPA history API、同文档导航、完整导航、重定向和超时。
- 验收：点击后跳转不需要盲目轮询，且不会在旧文档上继续输入。

### 06. 表单和常用控件高层操作（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.check`、`browser.uncheck`、`browser.setChecked`。
- [x] 新增 `browser.selectOption`，支持 value、label、index 和多选。
- [x] 新增 `browser.doubleClick`，复用可见鼠标强绑定反馈。
- [x] 新增 `browser.pressSequentially`，支持受控逐字输入和超时。
- [x] 所有方法验证元素类型、可见性、启用状态和最终值。
- 验收：复选框、开关、原生下拉框和双击交互不再依赖脚本或坐标技巧。

### 07. 会话与标签页所有权（实现完成，待真实 Chrome 验收）

- [x] 为 MCP/CLI 调用引入明确 `sessionId`，不暴露认证 token。
- [x] 建立标签页独占租约，默认禁止其他会话操作已认领页签。
- [x] 定义只读共享、显式移交、租约续期、断连释放和超时回收。
- [x] 阻止其他会话关闭、detach 或导航独占页签。
- [x] 保持不同标签页跨会话并发，同一标签页仍按队列串行。
- 验收：两个会话操作不同页签互不影响；同页签冲突返回稳定所有权错误。

### 08. 临时标签页、Handoff 与 Deliverable（实现完成，待真实 Chrome 验收）

- [x] 区分用户已有页签和会话创建页签。
- [x] 会话结束时自动关闭未标记的临时页签，只释放用户已有页签。
- [x] 新增 `browser.markHandoff` 和 `browser.markDeliverable`。
- [x] 定义跨轮次恢复、标记覆盖规则和异常退出清理。
- [x] 在关闭前保护未提交表单和潜在未保存工作。
- 验收：长期任务可安全交接，普通中间页不会持续堆积。

### 09. 下载生命周期（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.waitForDownload`，在点击动作前注册等待。
- [x] 返回下载 ID、建议文件名、状态和经过安全处理的本地路径。
- [x] 支持完成、失败、取消和超时；不把历史下载误认为当前动作结果。
- [x] 新增受限的 `browser.downloadMedia` 高层能力，禁止任意 URL 下载绕过站点策略。
- [x] 明确下载本身和后续运行文件的不同授权边界。
- 验收：能够可靠表达“点击并等待这一次下载完成”。

### 10. File Chooser 生命周期（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.waitForFileChooser`，与触发 chooser 的高层动作绑定。
- [x] 返回是否允许多文件，并通过高层方法设置绝对文件路径。
- [x] 保留现有 CSS file-input 路径作为兼容方案。
- [x] 校验文件存在、数量、目标站点和用户授权，不读取文件内容。
- 验收：隐藏 file input 和动态 file chooser 均可稳定上传。

### 11. 结构化控制台日志（实现完成，待真实 Chrome 验收）

- [x] 新增 `browser.getConsoleLogs`。
- [x] 支持 level、文本过滤、数量限制和 sequence cursor。
- [x] 返回时间、级别、消息和经过脱敏的来源 URL。
- [x] 与现有 debugger 事件缓冲区共享边界，不返回对象句柄或任意页面数据。
- 验收：可以低噪声诊断页面错误，无需 raw CDP 或扫描全部事件。

### 12. 浏览器会话剪贴板

- [ ] 新增文本剪贴板读写。
- [ ] 评估并按显式 MIME 白名单增加 HTML、Markdown 和二进制条目。
- [ ] 区分浏览器会话剪贴板和操作系统全局剪贴板。
- [ ] 对读取、写入和敏感数据传输建立独立授权与大小限制。
- 验收：复制粘贴工作流可通过标准接口完成，不暴露无关剪贴板内容。

### 13. Viewport 与响应式测试

- [ ] 新增读取、设置和重置临时 viewport 的高层能力。
- [ ] 支持宽度、高度、device scale 和移动端标志中可安全实现的子集。
- [ ] 会话结束自动恢复，除非用户明确要求保留。
- [ ] 变更 viewport 后重新校准截图、坐标和虚拟鼠标位置。
- 验收：可重复验证常见桌面、平板和手机断点。

### 14. 页面资源与受控内容导出

- [ ] 新增页面已观察资源清单，限制为当前已批准站点和当前文档。
- [ ] 支持把明确选择的资源打包为临时本地产物。
- [ ] 评估 Google Workspace 标准导出和 YouTube 字幕导出的高层专用接口。
- [ ] 禁止使用通用网络请求或页面脚本绕过登录、付费或访问控制。
- 验收：常见内容导出有明确方法、来源、格式和权限边界。

### 15. 统一确认与敏感操作门禁

- [ ] 为上传、消息发送、删除、支付、权限变更、登录和浏览器权限建立结构化 action intent。
- [ ] 在 Host 层区分只读、可逆写入、不可逆写入和敏感数据传输。
- [ ] 为第三方智能体提供可机器读取的 confirmation-required 响应。
- [ ] 保留用户会话中已有明确授权，避免重复确认。
- 验收：关键副作用不只依赖 Skill 文本约束，Host 能在动作前实施统一门禁。

### 16. 视觉状态关联与坐标新鲜度

- [ ] 为截图生成短期有效的 observation ID。
- [ ] 坐标点击、拖拽和滚轮可以要求携带最新 observation ID。
- [ ] 页面布局、viewport、导航或窗口尺寸变化后使旧 observation 失效。
- [ ] 与虚拟鼠标动画、实际输入和结果截图建立同一操作序列号。
- 验收：旧截图坐标不能在页面变化后被误用。

### 17. 最终 Browser Use 差距复核与发布

- [ ] 逐项更新 `docs/CODEX-DIFFERENCES.md`，区分对齐、部分对齐和有意不实现。
- [ ] 执行完整单元、集成、真实 Chrome、iframe、下载、文件上传、多会话和慢速视觉回归。
- [ ] 审计 Skill 标准面，确认 raw CDP、页面脚本和未知方法仍被阻断。
- [ ] 审计包内扩展、Host、MCP、CLI、Skill 和版本号一致性。
- [ ] 生成最终 Skill ZIP、独立扩展包、校验和与交接记录。
- 验收：核心企业网页任务在不使用 raw CDP 和页面脚本的前提下达到 Browser Use 同类能力。

## 当前进度

- [x] 0.1.23：标准 MCP/CLI 控制面、raw CDP 阻断、虚拟鼠标强绑定、同标签页操作队列。
- [x] 0.1.24：第一批类型化 Locator 查询代码、契约、单元测试和真实 Chrome E2E 用例已就绪。
- [x] 0.1.25：Frame、元素状态等待、URL/加载状态/导航同步代码、契约和真实 Chrome E2E 用例已就绪。
- [x] 0.1.26：表单控件、会话租约、临时页生命周期、下载、File Chooser 和结构化控制台日志代码与测试已就绪。
- [x] 01. 统一标准能力注册表。
- [ ] 第 02～11 项待最后统一重新加载扩展并通过真实 Chrome E2E 后最终完成；之后进入第 12 项。
