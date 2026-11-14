# KDesign / KDesign Pro 官方全量回归记录

回归日期：2026-11-14  
Bridge / 扩展版本：`0.1.27`  
结果：**通过**

## 汇总

- KDesign 官方组件：62 / 62 路由通过。
- KDesign Pro 官方页面：22 / 22 路由通过。
- 深度交互：41 个 KDesign 组件、15 个 KDesign Pro 页面全部通过。
- 自动化单元/契约测试：118 / 118 通过。
- 真实 Chrome 连续回归：158 个检查通过。
- 控制方式：仅使用 Lingee Chrome Control 标准高层 Bridge 方法；未使用 raw CDP、页面脚本或 DOM 注入。
- 临时页签：由 `endSession` 统一清理。

## KDesign 组件逐项结果

| # | 组件 | 类别 | 层级 | 核心断言 | 结果 |
|---:|---|---|---|---|---|
| 1 | `button` | General | 结构 + 交互 | 文本：主按钮 / 次按钮 / 禁用按钮 | 通过 |
| 2 | `clipboard` | General | 结构 + 交互 | 文本：复制测试文本 | 通过 |
| 3 | `divider` | General | 结构 | 文本：分割线上方 / 业务分区 / 分割线下方 | 通过 |
| 4 | `icon` | General | 结构 | 结构：[data-testid='specimen-icon'] i ≥ 3 | 通过 |
| 5 | `link` | General | 结构 + 交互 | 文本：默认链接 / 禁用链接 | 通过 |
| 6 | `space` | General | 结构 | 文本：操作一 / 操作二 / 操作三 | 通过 |
| 7 | `typography` | General | 结构 | 文本：企业级组件测试 / 完整组件目录与确定性状态回读 | 通过 |
| 8 | `grid` | Layout | 结构 | 结构：[data-testid='specimen-grid'] .grid-demo ≥ 3 | 通过 |
| 9 | `layout` | Layout | 结构 | 文本：Header / Sider / Content / Footer | 通过 |
| 10 | `split-panel` | Layout | 结构 + 交互 | 文本：主数据 / 详情 | 通过 |
| 11 | `anchor` | Navigation | 结构 | 文本：概览 / API | 通过 |
| 12 | `breadcrumb` | Navigation | 结构 | 文本：典型页面 / 订单中心 / 订单详情 | 通过 |
| 13 | `menu` | Navigation | 结构 + 交互 | 文本：工作台 / 业务中心 | 通过 |
| 14 | `pagination` | Navigation | 结构 + 交互 | 结构：[data-testid='specimen-pagination'] button ≥ 2 | 通过 |
| 15 | `steps` | Navigation | 结构 | 文本：提交 / 审批 / 完成 | 通过 |
| 16 | `tabs` | Navigation | 结构 + 交互 | 文本：订单 / 客户 / 订单内容 | 通过 |
| 17 | `base-data` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-base-data'] input ≥ 1 | 通过 |
| 18 | `cascader` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-cascader'] input ≥ 1 | 通过 |
| 19 | `checkbox` | Data Entry | 结构 + 交互 | 文本：独立 Checkbox / 禁用状态 / 全选、半选与组合 | 通过 |
| 20 | `city-picker` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-city-picker'] input ≥ 1 | 通过 |
| 21 | `color-picker` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-color-picker'] ≥ 1 | 通过 |
| 22 | `date-picker` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-date-picker'] input ≥ 2 | 通过 |
| 23 | `filter` | Data Entry | 结构 + 交互 | 文本：缺陷列表 | 通过 |
| 24 | `form` | Data Entry | 结构 + 交互 | 文本：申请主题 / 提交 | 通过 |
| 25 | `geo-zone-picker` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-geo-zone-picker'] .kd-geo-zone-picker ≥ 1 | 通过 |
| 26 | `input` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-input'] input, [data-testid='specimen-input'] textarea ≥ 2 | 通过 |
| 27 | `input-number` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-input-number'] input ≥ 1 | 通过 |
| 28 | `radio` | Data Entry | 结构 + 交互 | 文本：普通 / 紧急 | 通过 |
| 29 | `rate` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-rate'] .kd-rate-item ≥ 5 | 通过 |
| 30 | `search` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-search'] input ≥ 1 | 通过 |
| 31 | `select` | Data Entry | 结构 + 交互 | 文本：财务部 | 通过 |
| 32 | `signature` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-signature'] .kd-signature ≥ 1 | 通过 |
| 33 | `slider` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-slider'] ≥ 1 | 通过 |
| 34 | `stepper` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-stepper'] input ≥ 1 | 通过 |
| 35 | `switch` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-switch'] .kd-switch ≥ 1 | 通过 |
| 36 | `transfer` | Data Entry | 结构 + 交互 | 文本：选项 1 / 选项 8 | 通过 |
| 37 | `tree-select` | Data Entry | 结构 + 交互 | 结构：[data-testid='specimen-tree-select'] input ≥ 1 | 通过 |
| 38 | `upload` | Data Entry | 结构 + 交互 | 文本：选择测试文件 | 通过 |
| 39 | `avatar` | Data Display | 结构 | 文本：KD | 通过 |
| 40 | `badge` | Data Display | 结构 | 文本：通知 / 待办 / 7 | 通过 |
| 41 | `card` | Data Display | 结构 | 文本：申请信息 / PO-2026-1101 / 数字化中心 | 通过 |
| 42 | `carousel` | Data Display | 结构 + 交互 | 文本：第一张 / 第二张 | 通过 |
| 43 | `image` | Data Display | 结构 | 结构：[data-testid='specimen-image'] img ≥ 1 | 通过 |
| 44 | `image-cropper` | Data Display | 结构 + 交互 | 文本：打开图片裁剪 | 通过 |
| 45 | `progress` | Data Display | 结构 | 文本：68 / 82 | 通过 |
| 46 | `qr-code` | Data Display | 结构 | 结构：[data-testid='specimen-qr-code'] canvas, [data-testid='specimen-qr-code'] svg ≥ 1 | 通过 |
| 47 | `svg-icon` | Data Display | 结构 | 结构：[data-testid='specimen-svg-icon'] svg ≥ 4 | 通过 |
| 48 | `table` | Data Display | 结构 + 交互 | 文本：SO-1001 / 星海制造 / 已审核 | 通过 |
| 49 | `tag` | Data Display | 结构 + 交互 | 文本：已完成 / 待审核 / 可关闭 | 通过 |
| 50 | `timeline` | Data Display | 结构 | 文本：创建申请 / 部门审批 / 财务复核 | 通过 |
| 51 | `tree` | Data Display | 结构 + 交互 | 文本：金蝶集团 / 财务共享 / 数字化中心 | 通过 |
| 52 | `alert` | Feedback | 结构 | 文本：信息提示 / 操作成功 / 风险提醒 | 通过 |
| 53 | `collapse` | Feedback | 结构 + 交互 | 文本：审计信息 / 版本信息 | 通过 |
| 54 | `drawer` | Feedback | 结构 + 交互 | 文本：打开抽屉 | 通过 |
| 55 | `dropdown` | Feedback | 结构 + 交互 | 文本：更多操作 | 通过 |
| 56 | `empty` | Feedback | 结构 | 文本：暂无测试数据 | 通过 |
| 57 | `message` | Feedback | 结构 + 交互 | 文本：Info / Success | 通过 |
| 58 | `modal` | Feedback | 结构 + 交互 | 文本：打开模态框 | 通过 |
| 59 | `notification` | Feedback | 结构 + 交互 | 文本：打开通知 | 通过 |
| 60 | `popconfirm` | Feedback | 结构 + 交互 | 文本：删除记录 | 通过 |
| 61 | `spin` | Feedback | 结构 | 文本：加载中 / 业务内容 | 通过 |
| 62 | `tooltip` | Feedback | 结构 | 文本：悬停查看 | 通过 |

## KDesign Pro 页面逐项结果

| # | 页面 | 类别 | 层级 | 核心断言 | 结果 |
|---:|---|---|---|---|---|
| 1 | `workbench` | Workbench | 结构 + 交互 | 文本：待办任务 / 快捷入口 / 待办流程 / 经营概览 | 通过 |
| 2 | `detail-basic` | Detail | 结构 | 文本：基础详情 / 单据编号 / 审批信息 | 通过 |
| 3 | `detail-columns` | Detail | 结构 | 文本：分栏式详情 / 申请信息 / 审批意见 | 通过 |
| 4 | `detail-cross` | Detail | 结构 + 交互 | 文本：横向页签详情 / 基本信息 / 审批记录 / 附件 | 通过 |
| 5 | `detail-vertical` | Detail | 结构 + 交互 | 文本：纵向导航详情 / 基本信息 / 审批记录 | 通过 |
| 6 | `detail-flow` | Detail | 结构 | 文本：流程式详情 / 提交 / 部门审批 / 财务复核 / 完成 | 通过 |
| 7 | `list-basic` | List | 结构 + 交互 | 文本：基础列表 / 列表结果 / 共 42 条记录 | 通过 |
| 8 | `list-tree` | List | 结构 + 交互 | 文本：左树右表 / 组织架构 / 金蝶集团 | 通过 |
| 9 | `list-form` | List | 结构 + 交互 | 文本：内嵌表单列表 / 内嵌新增表单 / 新增行 | 通过 |
| 10 | `list-banner` | List | 结构 + 交互 | 文本：通栏卡片列表 / 本月订单总额 / 同比增长 | 通过 |
| 11 | `list-card` | List | 结构 + 交互 | 文本：卡片列表 / KD-2026-001 / 查看详情 | 通过 |
| 12 | `report-list` | Report | 结构 + 交互 | 文本：列表报表 / 经营指标 / 营业收入 | 通过 |
| 13 | `report-statistics` | Report | 结构 | 文本：统计分析类报表 / 毛利率 / 收入构成 | 通过 |
| 14 | `form-basic` | Form | 结构 + 交互 | 文本：基础表单页 / 申请主题 / 提交申请 | 通过 |
| 15 | `form-guide` | Form | 结构 + 交互 | 文本：向导式表单页 / 基本信息 / 商品明细 / 证明材料 | 通过 |
| 16 | `form-anchor` | Form | 结构 + 交互 | 文本：锚点式表单页 / 审批信息 / 需要财务会签 | 通过 |
| 17 | `form-vertical` | Form | 结构 + 交互 | 文本：纵向页签表单页 / 附件信息 | 通过 |
| 18 | `form-preview` | Form | 结构 + 交互 | 文本：模板预览式表单页 / 实时预览 / 采购申请 | 通过 |
| 19 | `exception-403` | Exception | 结构 | 文本：403 / 访问受限 / 返回工作台 | 通过 |
| 20 | `exception-404` | Exception | 结构 | 文本：404 / 页面不存在 / 返回工作台 | 通过 |
| 21 | `exception-500` | Exception | 结构 | 文本：500 / 服务异常 / 返回工作台 | 通过 |
| 22 | `login` | Login | 结构 + 交互 | 文本：欢迎登录 / 用户名 / 密码 / 登录测试环境 | 通过 |

## 深度交互范围

- General / Navigation：按钮、剪贴板、链接、分栏折叠、菜单、分页、页签、输入、Checkbox、Table、Modal、Drawer。
- Data Entry：BaseData、Cascader、CityPicker、ColorPicker、DatePicker、Filter、Form、GeoZonePicker、InputNumber、Radio、Rate、Search、Select、Signature、Slider、Stepper、Switch、Transfer、TreeSelect、Upload。
- Data Display / Feedback：Carousel、ImageCropper、Tag、Tree、Collapse、Dropdown、Message、Notification、Popconfirm。
- KDesign Pro：Workbench、横向/纵向详情、5 类列表、列表报表、5 类表单、Login。

## 已知上游问题

- KDesign 1.8.74 `SplitPanel` 在组件卸载后，异步 `ResizeObserver` 偶尔读取已清空的 ref 并产生 `clientWidth` 错误。本轮仅在 `interaction:menu` 阶段捕获到一次精确已知签名，已登记但不影响组件功能判定。
- 第三方扩展 `gfbliohnnapiefjpjlpjnehglfpaknnc` 会输出与测试站无关的 `postMessage` 错误；控制台审计按来源隔离，未计入测试站失败。

## 证据文件

- 精确断言矩阵：`test/web-fixture/official-test-matrix.mjs`
- 连续回归原始输出：`kdesign-full-regression-2026-11-14.log`
- 回归执行器：`scripts/kdesign-e2e.mjs`

