# Privacy Policy for Lingee Browser Agent Bridge

**Effective date: November 20, 2026**

Lingee Browser Agent Bridge (the **Extension**) connects a supported browser to a Native Messaging Host and a browser-control agent selected by the user. This policy explains how the Extension handles user data.

## Summary

The Extension does not sell user data and does not independently send user data to advertising, analytics, profiling, or data-broker services. It processes data only when necessary to perform browser-control features requested by the user. Most processing occurs locally between the Extension and the Native Messaging Host on the user's device.

When the user connects the Extension to an AI agent or other compatible client, the data required to complete the requested task is delivered to that user-selected client. The client or AI service may process or retain that data under its own privacy policy. Users should connect only clients and services they trust.

## Data the Extension may handle

Depending on the feature requested by the user and the content of the selected browser tab, the Extension may handle:

- **Website content:** page text, images or screenshots, links, form state, accessibility information, console feedback, and other visible or explicitly requested page content.
- **Web browsing information:** tab URLs and titles, navigation state, and, only after a separate optional browser permission is granted, explicitly requested browser-history results. Bookmark and download metadata may also be handled when separately approved.
- **User and agent-directed activity:** browser-control commands such as clicks, pointer coordinates, scrolling, keyboard input, form input, navigation, uploads, and downloads. The Extension does not continuously record the user's physical mouse or keyboard activity.
- **Personal information contained in a page or task:** for example, names, email addresses, usernames, account or record identifiers, when that information is part of the page content or task explicitly selected by the user.
- **Personal communications:** message or email content only when the user asks the connected agent to read, draft, or send it.
- **Financial or transaction information:** amounts, order details, or transaction-page content only when the user explicitly requests a related browser task. Consequential payment actions require a separate confirmation workflow.
- **User-selected files:** file paths, file metadata, and files explicitly selected for an upload or download workflow.

The Extension is not designed to collect health information or precise location. It does not intentionally read or export passwords, authentication cookies, authorization headers, saved credentials, browser-profile secrets, Local Storage, Session Storage, or runtime authentication tokens. Password-field values are redacted from structured page inspection.

## How data is used

Data is used only to:

- observe the browser state needed for a user-requested task;
- perform browser actions expressly requested or approved by the user;
- enforce site permissions, session ownership, confirmation, and other safety controls;
- return task results and bounded diagnostic information to the user-selected agent; and
- maintain the security and reliability of the Extension's disclosed browser-control purpose.

The Extension does not use user data for advertising, cross-context behavioral profiling, generalized market research, creditworthiness, or lending decisions.

## Data sharing and transfer

The Extension communicates with its Native Messaging Host on the same computer. The Host exposes an authenticated local connection to the compatible client selected by the user. Data needed for a task may therefore be transferred to that client or its AI service solely to provide the requested browser-control functionality.

The Extension does not sell user data. It does not transfer user data to third parties except when necessary to provide the user-selected functionality, comply with applicable law, protect against security abuse, or as otherwise permitted by the Chrome Web Store User Data Policy.

## Storage and retention

- Extension enablement, blocklist, and related settings are stored locally in the browser until changed by the user or removed with the Extension.
- Browser permission grants are managed by the browser and may be revoked by the user at any time.
- Native Host policy and installation settings are stored locally on the user's device.
- Session clipboard data is held only in Native Host memory and is cleared when the session ends or expires.
- Temporary session artifacts are bounded and are removed by their documented release or session-cleanup operations.
- Page content, screenshots, and task results are not retained by the Extension as a developer-operated cloud database. A connected client or AI service may retain them according to its own settings and privacy policy.

## Permissions and user controls

Site access is denied by the Host until the user approves the relevant host scope. History and bookmark permissions are optional and are not required at installation. They can be granted or revoked separately from the Extension's Security settings. Sensitive history, bookmark, and download metadata also requires a separate Host policy approval.

Users may disable browser control, revoke optional permissions, change the extension-side blocklist, end a session, disconnect the Native Host, uninstall the Extension, or stop using a connected client at any time.

## Security

The Extension uses browser extension APIs, Native Messaging, authenticated local IPC, allow/block policies, bounded results, session isolation, and explicit confirmation controls. No security measure is perfect, and users should connect the Extension only to trusted clients and approve only the sites and actions they intend to use.

## Chrome Web Store Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes to this policy

This policy may be updated when the Extension's functionality or legal requirements change. Material changes to data practices will be disclosed before the changed practices take effect. The effective date above identifies the current version.

## Contact

Questions or privacy requests may be submitted through the public project issue tracker:

<https://github.com/zzedbot/lingee-chrome-control/issues>

---

# Lingee Browser Agent Bridge 隐私政策

**生效日期：2026 年 11 月 20 日**

Lingee Browser Agent Bridge（以下简称“本扩展”）用于连接受支持的浏览器、本机 Native Messaging Host，以及用户自行选择的浏览器控制 Agent。本政策说明本扩展如何处理用户数据。

## 概要

本扩展不出售用户数据，也不会自行将用户数据发送给广告、分析、画像或数据经纪服务。仅在完成用户请求的浏览器控制功能所必需时处理相关数据。大部分处理发生在用户设备上的扩展与 Native Messaging Host 之间。

当用户将本扩展连接到 AI Agent 或其他兼容客户端时，完成任务所需的数据会提供给用户选择的客户端。该客户端或 AI 服务可能依据其自身隐私政策处理或保留数据。用户应仅连接其信任的客户端和服务。

## 本扩展可能处理的数据

根据用户要求的功能和所选浏览器页签的内容，本扩展可能处理：

- **网站内容：**页面文本、图片或截图、链接、表单状态、无障碍信息、控制台反馈，以及用户明确请求的其他页面内容。
- **网页浏览信息：**页签 URL 和标题、导航状态；仅在用户另行授予可选浏览器权限后，处理用户明确请求的浏览历史结果。书签和下载元数据也仅在另行批准后处理。
- **用户和 Agent 指定的操作：**点击、指针坐标、滚动、键盘输入、表单输入、导航、上传和下载等浏览器控制指令。本扩展不会持续记录用户真实鼠标或键盘活动。
- **页面或任务中包含的个人信息：**例如姓名、电子邮箱、用户名、账户或记录标识，但仅限于用户选择的页面内容或任务需要。
- **个人通信：**仅在用户要求连接的 Agent 阅读、起草或发送消息、邮件时处理相应内容。
- **财务或交易信息：**仅在用户明确要求相关浏览器任务时处理金额、订单信息或交易页面内容。具有后果的支付操作需要独立确认流程。
- **用户选择的文件：**用户明确选择用于上传或下载流程的文件路径、文件元数据及文件。

本扩展并非用于收集健康信息或精确位置。本扩展不会主动读取或导出密码、身份验证 Cookie、Authorization Header、已保存凭据、浏览器配置文件机密、Local Storage、Session Storage 或运行时认证令牌。结构化页面检查会对密码字段值进行脱敏。

## 数据用途

相关数据仅用于：

- 观察完成用户任务所需的浏览器状态；
- 执行用户明确要求或批准的浏览器操作；
- 执行站点权限、会话所有权、操作确认和其他安全控制；
- 向用户选择的 Agent 返回任务结果和受限的诊断信息；
- 维护本扩展所公开浏览器控制用途的安全性与可靠性。

本扩展不会将用户数据用于广告、跨场景行为画像、通用市场研究、信用评估或贷款决策。

## 数据共享与传输

本扩展与同一台计算机上的 Native Messaging Host 通信。Host 通过经过认证的本地连接向用户选择的兼容客户端提供服务。因此，任务所需的数据可能仅为提供用户请求的浏览器控制功能而传递给该客户端或其 AI 服务。

本扩展不出售用户数据。除提供用户选择的功能、遵守适用法律、抵御安全滥用，或 Chrome Web Store 用户数据政策允许的其他情形外，不会向第三方传输用户数据。

## 存储与保留

- 扩展开关、阻止列表及相关设置保存在浏览器本地，直至用户修改或卸载扩展。
- 浏览器权限由浏览器管理，用户可以随时撤销。
- Native Host 策略及安装设置保存在用户设备本地。
- 会话剪贴板数据仅保存在 Native Host 内存中，并在会话结束或过期时清除。
- 临时会话产物受到大小和生命周期限制，并通过对应释放操作或会话清理删除。
- 本扩展不会将页面内容、截图和任务结果保留在开发者运营的云端数据库中；连接的客户端或 AI 服务可能根据其自身设置和隐私政策保留这些内容。

## 权限与用户控制

在用户批准相应主机范围前，Host 默认拒绝站点访问。历史记录与书签权限为可选权限，安装时不强制申请，用户可在扩展的 Security settings 中分别授予或撤销。访问敏感的历史记录、书签和下载元数据还需要单独的 Host 策略批准。

用户可以随时禁用浏览器控制、撤销可选权限、修改扩展侧阻止列表、结束会话、断开 Native Host、卸载扩展，或停止使用连接的客户端。

## 安全措施

本扩展使用浏览器扩展 API、Native Messaging、经过认证的本地 IPC、允许/阻止策略、受限结果、会话隔离以及明确确认等安全机制。任何安全措施都无法保证绝对安全；用户应仅连接可信客户端，并只批准其确实希望使用的站点和操作。

## Chrome Web Store Limited Use

对从 Google API 获得的信息的使用将遵守 Chrome Web Store 用户数据政策，包括 Limited Use 要求。

## 政策变更

本政策可能根据扩展功能或法律要求变化而更新。涉及数据实践的重大变化将在新实践生效前披露。文首生效日期代表当前版本。

## 联系方式

如有问题或隐私请求，可通过项目公开 Issue 页面提交：

<https://github.com/zzedbot/lingee-chrome-control/issues>
