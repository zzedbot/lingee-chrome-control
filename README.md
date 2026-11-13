<p align="center">
  <img src="docs/assets/lingee-logo.svg" alt="Lingee 灵基" width="302">
</p>

<h1 align="center">Lingee Chrome Agent Bridge</h1>

<p align="center">
  面向 AI Agent 的本地 Chrome 控制桥 · 复用用户现有浏览器、登录状态与页签
</p>

Lingee Chrome Agent Bridge（灵基 Chrome Agent 桥接器）是一套可供第三方 AI 平台调用的本地浏览器控制方案。它通过经过认证的本地管道连接 Native Messaging Host 与 Chrome MV3 扩展，对用户已经打开的 Chrome 页签提供可审计、受策略约束的高层控制能力。

## Architecture

```text
Agent / MCP client
        │ JSON-RPC over authenticated local pipe
        ▼
Native messaging host
        │ Chrome Native Messaging (length-prefixed JSON over stdio)
        ▼
Chrome MV3 extension
        │ Chrome extension APIs + chrome.debugger / CDP
        ▼
The user's existing Chrome profile and tabs
```

本项目为独立实现，不包含 OpenAI 私有代码、二进制文件、扩展标识、私有协议或私有认证机制。

标准 Agent 接口只暴露受约束的高层操作。扩展内部虽然使用 `chrome.debugger` 实现 Frame、输入、导航等待等能力，但 `lingee-chrome-control` Skill 明确禁止第三方 Agent 绕过标准接口使用 raw CDP、页面脚本或 DOM 注入。

## Capabilities

| 能力领域 | 当前支持 |
|---|---|
| 浏览器与页签 | 复用现有 Chrome 登录状态；列出、打开、激活、关闭、分组和导航页签；前进、后退与刷新 |
| 语义定位 | CSS、role/name、label、文本、test ID；唯一性、可见性、启用状态和结果大小校验 |
| Frame | 同源、跨源/OOPIF、嵌套 Frame 的有序路径定位；Frame 导航和旧上下文失效检测 |
| 页面读取 | 可见文本、紧凑 DOM、无障碍树、属性、批量文本、PNG/JPEG 截图 |
| 等待与导航 | 元素六种状态；URL 精确/包含/glob 匹配；commit、DOMContentLoaded、load、networkidle；操作前注册导航预期 |
| 表单和输入 | 点击、双击、填充、逐字输入、按键、复选框、单选框、原生下拉单选/多选 |
| 可视化鼠标 | 初始化居中、持续显示、快速可见移动、点击波纹、拖拽轨迹、滚轮和滚动反馈；动画绘制成功后才派发真实输入 |
| 文件与下载 | 下载预期、显式媒体下载、动态 File Chooser、CSS file input、绝对路径和文件数量校验 |
| 对话框与日志 | alert/confirm/prompt 生命周期；结构化控制台日志；带游标的浏览器事件 |
| 多会话 | 页签写操作租约、只读共享、显式移交、续期、临时页签清理、handoff/deliverable 保留 |
| 安全策略 | 站点 allow/block、敏感元数据门禁、扩展侧 kill switch/blocklist、认证本地管道、敏感结果裁剪 |
| 接入方式 | MCP stdio、标准 Node CLI、公共 JavaScript Bridge Client，以及可独立分发的 `lingee-chrome-control` Skill |

完整标准方法与参数见 [API 文档](docs/API.md)，Skill 的能力总览和调用示例分别位于 [capabilities.md](skills/lingee-chrome-control/references/capabilities.md) 与 [examples.md](skills/lingee-chrome-control/references/examples.md)。

## Requirements

- Google Chrome with Manifest V3 support
- Node.js 22 or newer for building and MCP clients
- Windows、macOS 或 Linux

源码仓库中的 Native Host 安装器支持三个平台；当前回归验证以 Windows 为主。Skill 内直接附带的免编译 Native Host 二进制目前为 Windows 版本。

## Build and install from source

1. Install build dependencies:

   ```powershell
   npm.cmd install
   ```

2. Build the standalone Native Messaging Host executable:

   ```powershell
   npm.cmd run build:host
   ```

3. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose the repository's `extension` directory.

4. Copy the generated extension ID from `chrome://extensions`, then register the Native Messaging Host:

   ```powershell
   npm.cmd run install:host -- --extension-id YOUR_EXTENSION_ID
   ```

5. Fully restart Chrome. The extension popup should show **Connected to native host**.

6. Verify the bridge:

   ```powershell
   node .\src\jsonrpc-cli.mjs bridge.getInfo
   node .\src\jsonrpc-cli.mjs browser.listTabs
   ```

7. Approve a site before reading or controlling it:

   ```powershell
   node .\src\jsonrpc-cli.mjs policy.allowHost '{"host":"example.com"}'
   node .\src\jsonrpc-cli.mjs browser.openTab '{"url":"https://example.com"}'
   ```

PowerShell quoting varies by host. Third-party applications should normally call the MCP server or import `src/bridge-client.mjs` instead of shelling out.

## Install from the bundled Skill

[`skills/lingee-chrome-control`](skills/lingee-chrome-control) 是可独立交付的完整技能包，不依赖 Bridge 源码目录，已经包含：

- 完整的 Chrome unpacked extension
- Windows Native Host 可执行文件
- Native Host 安装/卸载脚本
- Bridge Client、标准调用 CLI、只读诊断和版本预检脚本
- 所有高层能力的参数表、安全边界、故障处理和调用示例

安装步骤：

1. 在 `chrome://extensions` 开启开发者模式，通过 **Load unpacked** 加载 `skills/lingee-chrome-control/assets/chrome-extension`。
2. 复制 Chrome 显示的 32 位扩展 ID。
3. 先检查安装目标和文件哈希：

   ```powershell
   node .\skills\lingee-chrome-control\scripts\install-host.mjs --extension-id YOUR_EXTENSION_ID --dry-run
   ```

4. 确认后去掉 `--dry-run` 完成当前用户级 Native Host 注册，重启 Chrome。
5. 运行只读诊断与版本预检：

   ```powershell
   node .\skills\lingee-chrome-control\scripts\doctor.mjs
   node .\skills\lingee-chrome-control\scripts\preflight.mjs
   ```

第三方平台应在整个任务中保持一个稳定、非敏感的 `UNIVERSAL_BROWSER_SESSION_ID`。存在多个 Chrome Bridge 实例时，必须先发现实例并明确设置 `UNIVERSAL_BROWSER_INSTANCE_ID`，不能根据页签标题猜测用户配置。

## Regression tests

重新加载 unpacked extension 后，可运行真实 Chrome 端到端回归：

```powershell
npm.cmd run test:chrome
```

测试会在打开测试页签前校验 Host、扩展版本及兼容标记，并验证虚拟鼠标初始化、移动、点击、滚动、导航后位置恢复和旧覆盖层清理。修改 Native Host 后应重新构建和安装；安装器使用内容哈希命名可执行文件，不会覆盖正在运行的 Host。

如需验证 Chrome 152+ 的外部扩展 Frame 隔离，可提供一个已知、非敏感的测试扩展资源 URL：

```powershell
$env:UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL = "chrome-extension://EXTENSION_ID/web-accessible-test-page.html"
npm.cmd run test:chrome:foreign-frame
```

未提供 URL 时该专项测试会明确失败，不会把未执行误报为通过；验证过程仍使用标准高层接口。

### Full web and KDesign fixture

`test/web-fixture` 是一个确定性的 React 17 测试站，使用已审计的 `@kdcloudjs/kdesign` 1.8.74，包含全部可见 Bridge 操作目标、KDesign 组件矩阵，以及 KDesign Pro 风格的登录、工作台、列表、表单、详情流程和报表页面。

构建测试站并验证每个标准能力都有对应测试用例：

```powershell
npm.cmd run test:web:build
npm.cmd test
```

在现有 Chrome 会话中运行完整高层 Bridge 场景：

```powershell
npm.cmd run test:web:chrome
```

运行前需要明确选择一个 Bridge 实例，并预先批准 `127.0.0.1`；测试不会自行修改策略。敏感元数据关闭时，测试只验证门禁，不会擅自开启历史、书签或下载元数据访问。路由和手工测试方式见 [测试站说明](test/web-fixture/README.md)。

当前自动化测试同时验证标准能力注册表、Skill 内容同步、Native Host 集成、虚拟鼠标、Frame、表单控件、会话租约，以及测试站对全部 MCP/CLI 能力的覆盖。提交代码前建议执行：

```powershell
npm.cmd run check
npm.cmd test
```

## MCP configuration

Use the absolute path to `src/mcp-server.mjs`:

```json
{
  "mcpServers": {
    "universalChrome": {
      "command": "node",
      "args": ["E:/AI/codex/workspace/chrome/src/mcp-server.mjs"]
    }
  }
}
```

MCP server 暴露按用途划分的高层工具，例如 `browser_list_tabs`、`browser_dom_snapshot`、`browser_click`、`browser_fill`、`browser_wait_for`、`browser_expect_navigation`、`browser_screenshot` 和 `policy_allow_host`。工具集合由 Skill 内的标准能力注册表统一生成并校验。

If several Chrome profiles create bridge instances, set `UNIVERSAL_BROWSER_INSTANCE_ID` for the MCP process. Discover IDs with:

```powershell
node .\src\jsonrpc-cli.mjs --instances
```

## JavaScript client

```javascript
import { connectBridge } from "./src/bridge-client.mjs";

const browser = await connectBridge();
await browser.call("policy.allowHost", { host: "example.com" });
const tab = await browser.call("browser.openTab", { url: "https://example.com" });
const snapshot = await browser.call("browser.domSnapshot", { tabId: tab.id });
await browser.call("browser.click", {
  tabId: tab.id,
  locator: { role: "link", name: "More information" }
});
```

## Security model

Installing a browser-control extension grants powerful permissions. The project therefore defaults to denying websites other than loopback hosts. A caller must explicitly add each site with `policy.allowHost` or deliberately enable `allowAll`.

The runtime descriptor contains a random bearer token and is created with user-only file permissions where supported. Transport uses a Windows named pipe or Unix-domain socket, not a network-facing port. The token is still required because other processes running as the same OS user may be able to reach the pipe.

Read [Security](docs/SECURITY.md) before deploying this bridge to end users.

## Repository layout

| 路径 | 用途 |
|---|---|
| `extension/` | Chrome MV3 扩展源码 |
| `src/` | Native Host、MCP server、公共 Bridge Client 与会话管理 |
| `skills/lingee-chrome-control/` | 可独立安装的 Skill、扩展、Windows Host、脚本和参考文档 |
| `scripts/` | 构建、安装和真实 Chrome E2E 脚本 |
| `test/` | 单元、集成、Skill 契约与浏览器测试 |
| `test/web-fixture/` | 完整能力与 KDesign/KDesign Pro 风格测试站 |
| `docs/` | 架构、API、安全、差异和回归计划 |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API and methods](docs/API.md)
- [Security](docs/SECURITY.md)
- [Differences from the current Codex Chrome implementation](docs/CODEX-DIFFERENCES.md)
- [Regression plan](docs/REGRESSION-PLAN-2026-11-12.md)
- [Skill entrypoint](skills/lingee-chrome-control/SKILL.md)
- [Skill capability catalog](skills/lingee-chrome-control/references/capabilities.md)
- [Skill workflow examples](skills/lingee-chrome-control/references/examples.md)

## Uninstall native host

```powershell
npm.cmd run uninstall:host
```

This removes the Native Messaging registration, host executable, and runtime descriptors. It intentionally preserves the policy file. Remove the unpacked extension separately from `chrome://extensions`.

## License

The clean-room code in this repository is licensed under MIT. OpenAI, ChatGPT, Codex, Chrome, and Playwright are trademarks of their respective owners. No affiliation or endorsement is implied.
