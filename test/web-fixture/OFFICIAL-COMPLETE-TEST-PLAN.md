# KDesign / KDesign Pro 官方全量验收计划

基线日期：2026-11-13

- KDesign：`0189097792acb7379aea32f8b20fad52045f9e28`，62 个带官方 demo 的组件目录。
- KDesign Pro：`dc769181d12a91e9b7b39845f708b992a24b2844`，22 个公开页面模板。
- 浏览器控制：只允许 Lingee Chrome Control 标准高层 CLI/MCP 方法；禁止 raw CDP、页面脚本和 DOM 注入。

## 每项通过标准

1. 路由能够单独打开，标题、官方源码路径和基线提交正确。
2. 组件或页面的特征内容、语义角色或结构数量符合预期。
3. 对可交互项执行至少一个真实用户操作，并读取确定性状态或可见结果。
4. 禁用、空态、加载、半选、弹层等适用边界状态能够呈现。
5. 当前项执行后没有测试站来源的未登记控制台错误。
6. 失败时记录精确组件、步骤和错误，不以其他页面通过代替。

## 批次

- [x] A. General、Layout、Navigation（16 项）
- [x] B. Data Entry（22 项）
- [x] C. Data Display（13 项）
- [x] D. Feedback（11 项）
- [x] E. KDesign Pro Workbench、Detail、List（11 页）
- [x] F. KDesign Pro Report、Form、Exception、Login（11 页）
- [x] G. 84 项连续回归、控制台审计和临时页签清理

最终回归：2026-11-14，`0.1.27`，158 个检查全部通过。逐项证据见 [OFFICIAL-COMPLETE-REGRESSION-2026-11-14.md](./OFFICIAL-COMPLETE-REGRESSION-2026-11-14.md)。

## 已知上游问题

- KDesign 1.8.74 `SplitPanel` 在卸载后可能由异步 `ResizeObserver` 读取已清空的 wrapper ref。仅精确匹配该签名时登记为上游问题，其他错误仍判定失败。

## 最终记录要求

最终结果必须给出 62 个组件和 22 个页面各自的通过/失败状态、执行的核心断言、失败证据、检查总数以及遗留问题；不能只给汇总数字。
