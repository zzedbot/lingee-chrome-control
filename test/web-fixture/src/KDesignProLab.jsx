import React, { useState } from "react";
import {
  Alert, Anchor, Breadcrumb, Button, Card, Checkbox, Collapse, Empty, Form, Input, InputNumber,
  Pagination, Radio, Select, Step, Steps, Table, Tabs, Tag, Tree
} from "@kdcloudjs/kdesign";
import { KDESIGN_PRO_CATEGORIES, KDESIGN_PRO_TEMPLATES, OFFICIAL_BASELINE } from "./official-catalog.js";
import { TestLabShell } from "./TestLabShell.jsx";

const orderColumns = [
  { name: "订单号", code: "id", width: 180 },
  { name: "客户", code: "customer", width: 200 },
  { name: "负责人", code: "owner", width: 130 },
  { name: "状态", code: "status", width: 110, render: (value) => <Tag type={value === "已完成" ? "success" : "warning"}>{value}</Tag> }
];
const reportColumns = [
  { name: "指标", code: "name", width: 240 },
  { name: "本期", code: "value", width: 160, align: "right" },
  { name: "同比", code: "change", width: 160, align: "right" }
];
const orderData = [
  { key: "1", id: "KD-2026-001", customer: "苍穹科技", owner: "王经理", status: "处理中" },
  { key: "2", id: "KD-2026-002", customer: "星瀚制造", owner: "李经理", status: "已完成" },
  { key: "3", id: "KD-2026-003", customer: "云之家", owner: "周经理", status: "处理中" }
];

export function KDesignProLab({ templateId = "workbench" }) {
  const template = KDESIGN_PRO_TEMPLATES.find(({ id }) => id === templateId) || KDESIGN_PRO_TEMPLATES[0];
  return (
    <TestLabShell section="pro">
      <div className="pro-source-shell" data-testid={`pro-template-${template.id}`}>
        <ProRouteBar template={template} />
        <div className="pro-route-body">
          <ProTemplateNav current={template.id} />
          <section className="pro-official-page"><TemplateRenderer template={template} /></section>
        </div>
      </div>
    </TestLabShell>
  );
}

function ProRouteBar({ template }) {
  return (
    <header className="pro-route-bar">
      <div><Breadcrumb items={[{ title: "KDesign Pro" }, { title: template.category }, { title: template.title }]} /><h1>{template.title}</h1></div>
      <div className="pro-source-meta"><span>官方源码镜像</span><code data-testid="pro-source-path">{template.sourcePath}</code><small>{OFFICIAL_BASELINE.kdesignPro.commit.slice(0, 12)}</small></div>
    </header>
  );
}

function ProTemplateNav({ current }) {
  return (
    <aside className="pro-template-nav" aria-label="KDesign Pro 官方模板路由">
      {KDESIGN_PRO_CATEGORIES.map((category) => <section key={category}><h2>{category}</h2>{KDESIGN_PRO_TEMPLATES.filter((item) => item.category === category).map((item, index) => {
        const compatibilityId = index === 0 && ["list", "form", "detail", "report", "login"].includes(category.toLowerCase()) ? `pro-nav-${category.toLowerCase()}` : undefined;
        return <a className={item.id === current ? "active" : ""} href={`#/pro/${item.id}`} key={item.id} data-testid={compatibilityId || `pro-nav-${item.id}`}>{item.title}<small>{item.id}</small></a>;
      })}</section>)}
    </aside>
  );
}

function TemplateRenderer({ template }) {
  if (template.id === "workbench") return <Workbench />;
  if (template.id.startsWith("list-")) return <ListTemplate variant={template.id.slice(5)} />;
  if (template.id.startsWith("detail-")) return <DetailTemplate variant={template.id.slice(7)} />;
  if (template.id.startsWith("report-")) return <ReportTemplate variant={template.id.slice(7)} />;
  if (template.id.startsWith("form-")) return <FormTemplate variant={template.id.slice(5)} />;
  if (template.id.startsWith("exception-")) return <ExceptionTemplate code={template.id.slice(10)} />;
  return <LoginTemplate />;
}

function Workbench() {
  return <ProPage title="工作台" subtitle="对应官方 typical/workbench 页面结构"><div className="pro-metrics">{[["待办任务", "18", "+4"], ["本月销售", "¥ 286k", "+12.8%"], ["审批效率", "92%", "+3.2%"], ["风险事项", "3", "-2"]].map(([label, value, trend]) => <Card key={label}><small>{label}</small><strong>{value}</strong><span>{trend}</span></Card>)}</div><ProPanel title="快捷入口"><div className="pro-shortcuts">{["新建订单", "费用报销", "采购申请", "数据报表"].map((item) => <Button key={item}>{item}</Button>)}</div></ProPanel><div className="pro-two-column"><ProPanel title="待办流程"><DataTable columns={orderColumns.slice(0, 3)} dataSource={orderData.slice(0, 2)} /></ProPanel><ProPanel title="经营概览"><MiniChart /></ProPanel></div></ProPage>;
}

function ListTemplate({ variant }) {
  const [result, setResult] = useState("ready");
  const table = <><DataTable columns={orderColumns} dataSource={orderData} /><div className="pro-pagination"><span>共 42 条记录</span><Pagination total={42} pageSize={10} /></div></>;
  let content;
  if (variant === "tree") content = <div className="pro-tree-list"><Card title="组织架构"><Tree defaultExpandAll treeData={[{ key: "root", title: "金蝶集团", children: [{ key: "north", title: "北区销售" }, { key: "south", title: "南区销售" }] }]} /></Card><ProPanel title="订单列表">{table}</ProPanel></div>;
  else if (variant === "form") content = <><ProPanel title="内嵌新增表单"><div className="pro-inline-form"><Input placeholder="客户名称" /><InputNumber defaultValue={1} min={1} /><Button data-testid="pro-add-row" type="primary" onClick={() => setResult("row-created")}>新增行</Button></div></ProPanel><ProPanel title="订单列表">{table}</ProPanel></>;
  else if (variant === "banner") content = <><div className="pro-banner"><div><small>本月订单总额</small><strong>¥ 1,286,000</strong></div><div><small>同比增长</small><strong>12.8%</strong></div><Button>查看经营分析</Button></div><ProPanel title="通栏卡片下的订单列表">{table}</ProPanel></>;
  else if (variant === "card") content = <div className="pro-card-list">{orderData.map((row) => <Card title={row.id} key={row.id}><dl><dt>客户</dt><dd>{row.customer}</dd><dt>负责人</dt><dd>{row.owner}</dd><dt>状态</dt><dd><Tag type={row.status === "已完成" ? "success" : "warning"}>{row.status}</Tag></dd></dl><Button>查看详情</Button></Card>)}</div>;
  else content = <ProPanel title="列表结果">{table}</ProPanel>;
  return <ProPage title={listTitle(variant)} subtitle={`官方 typical/list/${variant} 布局`}><OperationBar onQuery={() => setResult("queried")} />{content}<output data-testid="pro-list-result">{result}</output></ProPage>;
}

function DetailTemplate({ variant }) {
  const [result, setResult] = useState("ready");
  const details = <dl className="pro-detail-fields"><dt>单据编号</dt><dd>PO-2026-1101</dd><dt>申请部门</dt><dd>数字化中心</dd><dt>申请金额</dt><dd>¥ 86,000</dd><dt>申请人</dt><dd>Lingee QA</dd></dl>;
  let content;
  if (variant === "columns") content = <div className="pro-detail-columns"><Card title="申请信息">{details}</Card><Card title="审批意见"><p>预算充足，等待财务复核。</p><p>预计本周完成。</p></Card></div>;
  else if (variant === "cross") content = <Tabs defaultActiveKey="basic" onChange={(key) => setResult(`tab:${key}`)}><Tabs.TabPane tab="基本信息" key="basic">{details}</Tabs.TabPane><Tabs.TabPane tab="审批记录" key="approval"><TimelineRows /></Tabs.TabPane><Tabs.TabPane tab="附件" key="files"><Empty description="暂无附件" /></Tabs.TabPane></Tabs>;
  else if (variant === "vertical") content = <div className="pro-vertical-detail"><Anchor><Anchor.Link href="#detail-basic-info" title="基本信息" /><Anchor.Link href="#detail-approval" title="审批记录" /></Anchor><div><ProPanel title="基本信息">{details}</ProPanel><ProPanel title="审批记录"><TimelineRows /></ProPanel></div></div>;
  else if (variant === "flow") content = <><div className="pro-flow-steps"><Steps current={2}><Step title="提交" /><Step title="部门审批" /><Step title="财务复核" /><Step title="完成" /></Steps></div><ProPanel title="申请信息">{details}</ProPanel></>;
  else content = <Collapse defaultActiveKey={["basic", "approval"]}><Collapse.Panel header="基本信息" panelKey="basic">{details}</Collapse.Panel><Collapse.Panel header="审批信息" panelKey="approval"><TimelineRows /></Collapse.Panel></Collapse>;
  return <ProPage title={detailTitle(variant)} subtitle={`官方 typical/detail/${variant} 布局`}><div className="pro-operation"><Button type="primary" onClick={() => setResult("submitted")}>提交审批</Button><Button>保存</Button><Button>打印</Button></div>{content}<output data-testid="pro-detail-result">{result}</output></ProPage>;
}

function ReportTemplate({ variant }) {
  const [result, setResult] = useState("ready");
  if (variant === "statistics") return <ProPage title="统计分析类报表" subtitle="官方 typical/report/statistics 布局"><div className="pro-metrics compact">{[["营业收入", "286 万"], ["毛利率", "38.6%"], ["订单数", "126"], ["客单价", "2.27 万"]].map(([label, value]) => <Card key={label}><small>{label}</small><strong>{value}</strong></Card>)}</div><div className="pro-two-column"><ProPanel title="一月至六月销售额"><MiniChart /></ProPanel><ProPanel title="收入构成"><DonutMock /></ProPanel></div></ProPage>;
  return <ProPage title="列表报表" subtitle="官方 typical/report/list 布局"><OperationBar onQuery={() => setResult("queried")} /><ProPanel title="经营指标"><DataTable columns={reportColumns} dataSource={[{ key: "1", name: "营业收入", value: "286 万", change: "+12.8%" }, { key: "2", name: "毛利率", value: "38.6%", change: "+2.1%" }]} /></ProPanel><output data-testid="pro-report-result">{result}</output></ProPage>;
}

function FormTemplate({ variant }) {
  const [saved, setSaved] = useState(false);
  const formBody = <div className="pro-form-grid"><Form.Item label="申请主题" name="subject" required><Input data-testid="pro-form-subject" placeholder="输入申请主题" /></Form.Item><Form.Item label="申请类型" name="type"><Select defaultValue="purchase"><Select.Option value="purchase">采购申请</Select.Option><Select.Option value="travel">差旅申请</Select.Option></Select></Form.Item><Form.Item label="申请金额" name="amount"><InputNumber min={0} defaultValue={1000} /></Form.Item><Form.Item label="紧急程度" name="priority"><Radio.Group defaultValue="normal"><Radio value="normal">普通</Radio><Radio value="urgent">紧急</Radio></Radio.Group></Form.Item></div>;
  let content;
  if (variant === "guide") content = <><div className="pro-flow-steps"><Steps current={1}><Step title="基本信息" /><Step title="商品明细" /><Step title="证明材料" /></Steps></div><ProPanel title="基本信息">{formBody}</ProPanel></>;
  else if (variant === "anchor") content = <div className="pro-vertical-detail"><Anchor><Anchor.Link href="#form-basic-info" title="基本信息" /><Anchor.Link href="#form-approval" title="审批信息" /></Anchor><div><ProPanel title="基本信息">{formBody}</ProPanel><ProPanel title="审批信息"><Checkbox>需要财务会签</Checkbox></ProPanel></div></div>;
  else if (variant === "vertical") content = <Tabs tabPosition="left" defaultActiveKey="basic"><Tabs.TabPane tab="基本信息" key="basic">{formBody}</Tabs.TabPane><Tabs.TabPane tab="附件信息" key="files"><Empty description="暂无附件" /></Tabs.TabPane></Tabs>;
  else if (variant === "preview") content = <div className="pro-preview-form"><ProPanel title="表单配置">{formBody}</ProPanel><Card title="实时预览"><p><strong>采购申请</strong></p><p>金额：¥ 1,000</p><p>状态：草稿</p></Card></div>;
  else content = <Collapse defaultActiveKey={["basic"]}><Collapse.Panel header="基本信息" panelKey="basic">{formBody}</Collapse.Panel><Collapse.Panel header="其他信息" panelKey="other"><Checkbox>需要加急处理</Checkbox></Collapse.Panel></Collapse>;
  return <ProPage title={formTitle(variant)} subtitle={`官方 typical/form/${variant} 布局`}><Form layout="vertical" onFinish={() => setSaved(true)}><div className="pro-operation"><Button data-testid="pro-form-submit" type="primary" htmlType="submit">提交申请</Button><Button>保存草稿</Button></div>{content}</Form><output data-testid="pro-form-result">{saved ? "申请已提交" : "等待提交"}</output></ProPage>;
}

function ExceptionTemplate({ code }) {
  const copy = { "403": ["访问受限", "当前测试会话没有访问此页面的权限。"], "404": ["页面不存在", "目标模板路由可能已移动或被删除。"], "500": ["服务异常", "模板渲染出现异常，请查看结构化控制台日志。"] }[code];
  return <div className="pro-exception"><strong>{code}</strong><h1>{copy[0]}</h1><p>{copy[1]}</p><Button type="primary" href="#/pro/workbench">返回工作台</Button></div>;
}

function LoginTemplate() {
  const [result, setResult] = useState("等待登录");
  return <div className="pro-login"><section><h1>KDesign Pro</h1><h2>开箱即用的中后台前端解决方案</h2><div className="login-illustration"><i /><i /><i /></div></section><aside><div className="login-logo">KDesign Pro Lab</div><h1>欢迎登录</h1><label>用户名<Input data-testid="pro-login-user" placeholder="test-user" /></label><label>密码<Input type="password" data-testid="pro-login-password" placeholder="仅测试，请勿输入真实密码" /></label><div className="login-assist"><Checkbox>记住测试账号</Checkbox><a href="#login-help">登录帮助</a></div><Button data-testid="pro-login-submit" type="primary" onClick={() => { setResult("模拟登录成功"); }}>登录测试环境</Button><output data-testid="pro-login-result">{result}</output></aside></div>;
}

function ProPage({ title, subtitle, children }) { return <div className="pro-page"><header><h1>{title}</h1><p>{subtitle}</p></header>{children}</div>; }
function ProPanel({ title, children }) { return <section className="pro-panel"><h2>{title}</h2>{children}</section>; }
function DataTable({ columns, dataSource }) {
  const [selected, setSelected] = useState([]);
  const rowSelection = {
    type: "checkbox",
    value: selected,
    onChange: setSelected,
    column: { width: 48, lock: true },
    highlightRowWhenSelected: true
  };
  return <div className="table-surface"><Table columns={columns} dataSource={dataSource} pagination={false} primaryKey="key" rowSelection={rowSelection} /><output className="table-selection-summary" data-testid="pro-table-selection" aria-live="polite">已选择 {selected.length} 项</output></div>;
}
function OperationBar({ onQuery = () => {} }) { return <div className="pro-operation"><Input placeholder="订单号/客户" style={{ width: 220 }} /><Select defaultValue="all" style={{ width: 150 }}><Select.Option value="all">全部状态</Select.Option><Select.Option value="open">处理中</Select.Option></Select><Button data-testid="pro-query" type="primary" onClick={onQuery}>查询</Button><Button>重置</Button></div>; }
function TimelineRows() { return <ol className="pro-timeline"><li><i />提交申请<small>09:30</small></li><li><i />部门审批通过<small>10:15</small></li><li className="current"><i />财务复核中<small>11:20</small></li></ol>; }
function MiniChart() { return <div className="pro-chart" role="img" aria-label="一月至六月销售额柱状图">{[42, 65, 51, 78, 72, 91].map((value, index) => <div key={index}><span style={{ height: `${value}%` }} /><small>{index + 1}月</small></div>)}</div>; }
function DonutMock() { return <div className="pro-donut"><div /><ul><li><i className="blue" />软件服务 48%</li><li><i className="cyan" />实施服务 32%</li><li><i className="gray" />其他 20%</li></ul></div>; }
function listTitle(variant) { return ({ basic: "基础列表", tree: "左树右表", form: "内嵌表单列表", banner: "通栏卡片列表", card: "卡片列表" })[variant]; }
function detailTitle(variant) { return ({ basic: "基础详情", columns: "分栏式详情", cross: "横向页签详情", vertical: "纵向导航详情", flow: "流程式详情" })[variant]; }
function formTitle(variant) { return ({ basic: "基础表单页", guide: "向导式表单页", anchor: "锚点式表单页", vertical: "纵向页签表单页", preview: "模板预览式表单页" })[variant]; }
