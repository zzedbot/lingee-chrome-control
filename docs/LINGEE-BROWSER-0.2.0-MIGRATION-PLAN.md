# Lingee Browser 0.2.0 完整迁移计划

更新日期：2026-11-16
状态：实现与通用回归完成；待业务页重新授权复验及 Git 提交
执行原则：无兼容期、无旧名称回退、一次性硬切换

## 1. 已确认决策

- [x] `https://app.lingee.com` 是金蝶灵基产品官网。
- [x] 产品通用层统一使用 **Browser**，不再使用 Chrome 作为产品或协议名称。
- [x] 当前发行版提供 Google Chrome/Chromium 适配，未来允许增加其他浏览器适配器。
- [x] 0.2.0 不保留 `org.universal_browser.bridge`、`UNIVERSAL_BROWSER_*` 或其他旧标识的运行时兼容。
- [x] 不注册双 Native Host，不提供旧环境变量别名，不读取旧运行目录。
- [x] 扩展继续使用原签名密钥，保持现有扩展 ID。
- [x] Skill 仍只内置当前 CRX，不重复内置 unpacked 扩展源码；轻量 Native Host 继续保留。

## 2. 目标命名

| 类型 | 0.1.x | 0.2.0 |
|---|---|---|
| 产品名 | Lingee Chrome Agent Bridge | Lingee Browser Agent Bridge |
| Skill | `lingee-chrome-control` | `lingee-browser-control` |
| Skill 显示名 | Lingee Chrome Control | Lingee Browser Control |
| Native Host | `org.universal_browser.bridge` | `com.lingee.app.browser_agent_bridge` |
| MCP Server | `universalChrome` | `lingeeBrowser` |
| npm 包 | `lingee-chrome-agent-bridge` | `lingee-browser-agent-bridge` |
| MCP 命令 | `universal-browser-mcp` | `lingee-browser-mcp` |
| RPC 命令 | `universal-browser-rpc` | `lingee-browser-rpc` |
| Windows 数据目录 | `%LOCALAPPDATA%\UniversalBrowserBridge` | `%LOCALAPPDATA%\Lingee\BrowserAgentBridge` |
| macOS 数据目录 | `Application Support/UniversalBrowserBridge` | `Application Support/Lingee/BrowserAgentBridge` |
| Linux 数据目录 | `universal-browser-bridge` | `lingee/browser-agent-bridge` |
| Windows 管道 | `universal-browser-bridge-*` | `lingee-browser-agent-bridge-*` |
| 日志前缀 | `[universal-browser-bridge]` | `[lingee-browser-agent-bridge]` |
| CRX | `lingee-chrome-agent-bridge-*.crx` | `lingee-browser-agent-bridge-*.crx` |
| Skill ZIP | `lingee-chrome-control-skill-*.zip` | `lingee-browser-control-skill-*.zip` |

目标环境变量：

```text
LINGEE_BROWSER_BRIDGE_HOME
LINGEE_BROWSER_INSTANCE_ID
LINGEE_BROWSER_SESSION_ID
LINGEE_BROWSER_E2E_FOREIGN_EXTENSION_URL
```

## 3. 平台边界

产品、协议、目录、配置、包名和 Skill 中不得再使用 Chrome 作为通用名称。以下内容属于当前 Chromium 适配实现，可以保留：

- `chrome.*` 扩展 API。
- `chrome-extension://` URL scheme。
- `chrome://extensions` 安装管理地址。
- Google Chrome Native Messaging 注册表路径。
- CRX/CRX3 格式名称。
- 明确说明“当前适配器支持 Google Chrome/Chromium”的文档。

禁止保留：

- `Lingee Chrome Agent Bridge`、`Lingee Chrome Control`。
- `lingee-chrome-*` 产品、Skill 或发布包名。
- `org.universal_browser.bridge`。
- `UNIVERSAL_BROWSER_*`。
- `UniversalBrowserBridge`、`universal-browser-*`。
- `universalChrome`。

## 4. 实施清单

### A. 基线与计划

- [x] 保存本迁移计划。
- [x] 确认 0.1.33 安全扫描修复保留在工作区中。
- [x] 将 Skill 源目录重命名为 `skills/lingee-browser-control`。
- [x] 记录迁移前测试基线与 Git 状态（0.1.33：151/151；迁移工作区状态已保存）。

### B. 核心身份硬切换

- [x] Native Host 改为 `com.lingee.app.browser_agent_bridge`。
- [x] 扩展连接端只连接新 Host，不回退旧 Host。
- [x] Native Messaging manifest 和注册表键只写新 Host。
- [x] 数据目录、runtime、policy、resource export 路径切换为 Lingee Browser 名称。
- [x] 命名管道和日志前缀切换为 Lingee Browser 名称。
- [x] 页面监控内部键切换为 Lingee Browser 名称。
- [x] Host descriptor 增加 `product`、`browserFamily`、`browserTarget`。

### C. 环境变量、MCP 与 CLI

- [x] 全部环境变量切换为 `LINGEE_BROWSER_*`。
- [x] 删除旧环境变量读取逻辑，不提供别名。
- [x] MCP 示例名切换为 `lingeeBrowser`。
- [x] npm 包名切换为 `lingee-browser-agent-bridge`。
- [x] bin 命令切换为 `lingee-browser-mcp`、`lingee-browser-rpc`。
- [x] CLI usage、错误提示和测试同步更新。

### D. 扩展品牌与官网

- [x] 扩展显示名改为 Lingee Browser Agent Bridge。
- [x] manifest 增加 `homepage_url: https://app.lingee.com`。
- [x] 扩展弹窗、标题、说明和链接切换为 Browser 品牌。
- [x] 官网只作为品牌链接，不新增站点权限、遥测或网络依赖。
- [x] 当前适配实现仍使用 `chrome.*`，但不将 Chrome 写入产品身份。

### E. Skill 完整迁移

- [x] `SKILL.md` frontmatter 名称改为 `lingee-browser-control`。
- [x] Skill 显示名改为 Lingee Browser Control。
- [x] Skill 文档、脚本、示例、环境变量和安装说明全部更新。
- [x] Skill 只保留 `lingee-browser-agent-bridge-0.2.0.crx` 作为扩展资产。
- [x] 本机安装目录切换为 `~/.codex/skills/lingee-browser-control`。
- [x] 旧本机 Skill 目录移出启用目录，不保留自动发现别名。
- [x] 仓库 Skill、已安装 Skill 和最终 ZIP 均通过 `quick_validate.py`。

### F. 版本、构建与发布资产

- [x] 版本升级为 0.2.0。
- [x] 重新构建 Node 依赖型轻量 Native Host。
- [x] 使用原密钥生成 `lingee-browser-agent-bridge-0.2.0.crx`。
- [x] 验证 CRX3 格式、扩展 ID、源码文件清单和逐文件哈希。
- [x] 生成 CRX SHA-256 文件。
- [x] 生成 `lingee-browser-control-skill-0.2.0.zip` 和 SHA-256 文件。
- [x] 最终 Skill ZIP 中无 unpacked extension、无旧 CRX、无旧产品标识。

### G. 文档与历史文件

- [x] README、API、架构、差异、交接、TODO 和发布说明更新。
- [x] 测试站用户可见品牌改为 Lingee Browser Control。
- [x] 当前配置示例全部使用 `lingeeBrowser` 与 `LINGEE_BROWSER_*`。
- [x] 历史文档中的可执行旧命令改为新命令或明确标记为不可执行历史记录。
- [x] GitHub 远端仓库改名不在本地代码迁移中自动执行，需用户另行明确授权。

### H. 自动化与静态验收

- [x] `npm test` 全部通过，测试数不少于 151。
- [x] `npm run check` 通过。
- [x] 测试站生产构建通过。
- [x] 静态扫描无不可见字符转义告警。
- [x] 活跃源码、Skill、测试和当前文档中无 `org.universal_browser.bridge`。
- [x] 活跃源码、Skill、测试和当前文档中无 `UNIVERSAL_BROWSER_`。
- [x] 活跃源码、Skill、测试和当前文档中无 `UniversalBrowserBridge`、`universal-browser-*`、`universalChrome`。
- [x] 活跃产品标识中无 `Lingee Chrome` 或 `lingee-chrome-*`。
- [x] `chrome` 剩余项全部属于本计划第 3 节允许的平台适配边界。

### I. 本机切换与真实浏览器验收

- [x] 安装新 Native Host，只注册 `com.lingee.app.browser_agent_bridge`。
- [x] 新运行目录默认拒绝；不自动读取旧策略或旧 runtime descriptor。
- [x] 明确清理本机旧 Host 注册项，不保留双注册。
- [x] 重新加载 0.2.0 扩展。
- [x] 预检验证 Host/扩展均为 0.2.0。
- [ ] 验证应用、基础资料和铁路局入口语义点击。
- [x] 验证虚拟鼠标初始化、移动、点击和滚动。
- [x] 验证真实浏览器完整能力回归及 KDesign/KDesign Pro 专项。
- [x] 验证会话结束清理且用户页签保留。

### J. Git 收尾

- [x] 审查最终差异和发布资产大小。
- [x] 确认工作树只包含本迁移相关内容。
- [ ] 提交 0.2.0 迁移。
- [ ] 推送远端。

## 5. 硬切换影响

- 0.1.x 扩展不能连接 0.2.0 Host。
- 0.2.0 扩展不能连接旧 Host。
- 旧 `UNIVERSAL_BROWSER_*` 配置立即失效。
- 第三方平台必须把 MCP 名称更新为 `lingeeBrowser`。
- 新数据目录不读取旧 `policy.json`，站点授权需要重新确认。
- 旧 runtime descriptor、管道和临时导出不会迁移。
- 扩展签名密钥不变，因此扩展 ID 应保持不变。

## 6. 完成标准

只有在代码、Skill、CRX、Native Host、文档、自动化测试和真实浏览器验收全部完成，并且第 4 节所有必需项均勾选后，0.2.0 迁移才视为完成。

## 7. 2026-11-16 验收记录

- 自动化：`npm test` 161/161，通过；`npm run check` 与测试站生产构建通过。
- 真实 Chrome 基础回归：Host 与扩展均为 0.2.0，虚拟鼠标和会话清理通过。
- KDesign 专项：62 个组件路由、22 个 KDesign Pro 页面、158 项检查通过。
- 发布资产：CRX SHA-256 为 `09869c4a9511163e8fdc88ba1d6c014fdd397f50bc210cab434f04f4ac5abacf`；Skill ZIP SHA-256 为 `3b94a20b7269c02904c17a4dca93a692aa1c7ce1dd5f7d3580e723929233a967`。
- 待办：新数据目录按硬切换策略未继承 `111.42.60.82` 的授权，需用户重新授权后复验“应用 → 基础资料 → 铁路局”；Git 提交和推送尚未执行。
