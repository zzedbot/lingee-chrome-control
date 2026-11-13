import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Drawer,
  Dropdown,
  Input,
  InputNumber,
  Menu,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Radio,
  Rate,
  Select,
  Slider,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree
} from "@kdcloudjs/kdesign";
import "@kdcloudjs/kdesign/dist/kdesign.css";
import "./styles.css";

const cases = [
  ["observation", "观察", "readText / domSnapshot / accessibilitySnapshot / screenshot"],
  ["semantic-input", "语义输入", "click / fill / press / type"],
  ["pointer", "指针", "mouseMove / coordinateClick / drag"],
  ["scroll", "滚动", "wheel / scroll"],
  ["file-dialog", "文件与对话框", "setFileInput / handleDialog"],
  ["navigation", "导航", "open / activate / navigate / back / forward / reload / group / close"],
  ["events", "事件", "getEvents"],
  ["metadata", "敏感元数据", "history / bookmark / downloads search（需单独批准）"]
];

function App() {
  const [route, setRoute] = useState(location.hash || "#/lab");
  useEffect(() => {
    const listener = () => setRoute(location.hash || "#/lab");
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>Lingee Test Lab</strong><span>标准控制面 · KDesign 1.8.74</span></div>
        <nav aria-label="测试页面导航">
          <a href="#/lab">能力实验室</a>
          <a href="#/kdesign">KDesign 组件</a>
          <a href="#/pro">KDesign Pro 场景</a>
          <a href="#/target">导航目标页</a>
        </nav>
      </header>
      <main>
        {route === "#/kdesign" ? <KDesignMatrix /> : route === "#/pro" ? <ProScenarios /> : route === "#/target" ? <NavigationTarget /> : <CapabilityLab />}
      </main>
      <footer>仅用于 Lingee Chrome Control 确定性回归；不收集或上传数据。</footer>
    </div>
  );
}

function CapabilityLab() {
  const [status, setStatus] = useState("等待操作");
  const [text, setText] = useState("");
  const [typed, setTyped] = useState("");
  const [key, setKey] = useState("未按键");
  const [choice, setChoice] = useState("alpha");
  const [checked, setChecked] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [wheel, setWheel] = useState(0);
  const [asyncReady, setAsyncReady] = useState(false);
  const [frameVisible, setFrameVisible] = useState(true);
  const drag = useRef(null);
  const frame = useRef(null);
  const chooser = useRef(null);

  useEffect(() => {
    const move = (event) => {
      if (!drag.current) return;
      setDragX(Math.max(0, Math.min(260, event.clientX - drag.current)));
    };
    const up = () => drag.current = null;
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
    return () => { removeEventListener("mousemove", move); removeEventListener("mouseup", up); };
  }, []);

  useEffect(() => {
    const receiveFrameResult = (event) => {
      if (["lingee-frame-target", "lingee-nested-target"].includes(event.data)) setStatus(event.data === "lingee-frame-target" ? "frame-target:ok" : "nested-frame:ok");
      if (event.data === "lingee-frame-coordinate") setStatus("frame-coordinate:ok");
      if (typeof event.data === "string" && event.data.startsWith("lingee-frame-file:")) setStatus(event.data.replace("lingee-", ""));
      if (typeof event.data === "string" && event.data.startsWith("lingee-frame-input:")) setStatus(event.data.replace("lingee-", ""));
    };
    addEventListener("message", receiveFrameResult);
    return () => removeEventListener("message", receiveFrameResult);
  }, []);

  return (
    <Page title="全能力实验室" subtitle="每个交互都提供唯一定位器、状态回显和可重复初始状态。">
      <section className="case-grid" aria-label="能力覆盖矩阵">
        {cases.map(([id, title, methods]) => <article className="case-card" key={id} data-testid={`case-${id}`}><span>{title}</span><code>{methods}</code></article>)}
      </section>

      <Section title="语义定位与键盘输入" id="semantic">
        <div className="row wrap">
          <button id="native-click" data-testid="native-click" onClick={() => setStatus("native-click:ok")}>原生点击按钮</button>
          <label>唯一文本框<input data-testid="native-fill" value={text} onChange={(e) => setText(e.target.value)} placeholder="填写 Lingee" /></label>
          <label>连续输入<textarea data-testid="native-type" value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <label>逐字输入<input data-testid="sequential-input" onChange={(e) => setStatus(`sequential:${e.target.value}`)} /></label>
          <label>按键捕获<input data-testid="native-key" onKeyDown={(e) => setKey(e.key)} /></label>
          <label><input data-testid="native-check" type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> 已确认</label>
          <label>原生选择<select data-testid="native-select" value={choice} onChange={(e) => setChoice(e.target.value)}><option value="alpha">Alpha</option><option value="beta">Beta</option></select></label>
          <button data-testid="double-click" onDoubleClick={() => setStatus("double-click:ok")}>双击目标</button>
        </div>
        <div className="locator-query-fixture" aria-label="Locator 查询夹具">
          <span className="locator-query-item" data-testid="locator-query-first" data-query-kind="first">查询文本 Alpha</span>
          <span className="locator-query-item" data-testid="locator-query-hidden" hidden>查询文本 Beta</span>
          <button data-testid="locator-query-disabled" disabled>禁用按钮</button>
        </div>
        <div className="row wrap">
          <button data-testid="start-async-target" onClick={() => setTimeout(() => setAsyncReady(true), 300)}>启动异步控件</button>
          {asyncReady ? <button data-testid="async-target">异步控件已就绪</button> : null}
        </div>
        <output data-testid="semantic-result">{status};fill={text};type={typed};key={key};checked={String(checked)};select={choice}</output>
        <div className="ambiguous"><button>同名按钮</button><button>同名按钮</button></div>
      </Section>

      <Section title="坐标、拖拽和滚轮" id="pointer">
        <div id="coordinate-target" className="coordinate-target" role="button" tabIndex="0" data-testid="coordinate-target" onClick={(e) => setStatus(`coordinate:${e.nativeEvent.offsetX},${e.nativeEvent.offsetY}`)}>坐标点击区域</div>
        <div className="drag-track" data-testid="drag-track"><button id="drag-handle" aria-label="拖拽滑块" data-testid="drag-handle" style={{ transform: `translateX(${dragX}px)` }} onMouseDown={(e) => drag.current = e.clientX - dragX}>⇆</button></div>
        <div id="wheel-zone" className="wheel-zone" role="region" tabIndex="0" aria-label="滚轮测试区域" data-testid="wheel-zone" onWheel={(e) => setWheel((value) => value + Math.sign(e.deltaY))}>在此滚轮 <output data-testid="wheel-result">wheel={wheel}</output></div>
        <output data-testid="pointer-result">{status};drag={Math.round(dragX)}</output>
      </Section>

      <Section title="文件、下载和 JavaScript 对话框" id="files">
        <div className="row wrap">
          <label className="file-label">选择测试文件<input type="file" data-testid="file-input" onChange={(e) => setStatus(`file:${e.target.files?.[0]?.name || "none"}`)} /></label>
          <input ref={chooser} hidden type="file" multiple data-testid="dynamic-file-input" onChange={(e) => setStatus(`chooser:${[...e.target.files].map((file) => file.name).join(",")}`)} />
          <button data-testid="open-file-chooser" onClick={() => chooser.current?.click()}>打开文件选择器</button>
          <button data-testid="confirm-dialog" onClick={() => setStatus(confirm("确认执行 Lingee 对话框测试？") ? "dialog:accepted" : "dialog:dismissed")}>打开确认框</button>
          <button data-testid="prompt-dialog" onClick={() => setStatus(`prompt:${prompt("输入测试文本", "Lingee") ?? "dismissed"}`)}>打开输入框</button>
          <a data-testid="download-link" download="lingee-test.txt" href="data:text/plain;charset=utf-8,Lingee%20Chrome%20Control">下载测试文件</a>
          <button data-testid="console-log" onClick={() => { console.warn("Lingee structured warning"); setStatus("console:logged"); }}>写入控制台日志</button>
        </div>
        <output data-testid="file-dialog-result">{status}</output>
      </Section>

      <Section title="滚动与长页面" id="scroll">
        <div className="scroll-box" data-testid="scroll-box">
          {Array.from({ length: 24 }, (_, i) => <p key={i}>滚动样本行 {String(i + 1).padStart(2, "0")}</p>)}
          <button data-testid="scroll-destination" onClick={() => setStatus("scroll-target:ok")}>滚动终点</button>
        </div>
      </Section>

      <Section title="导航与页面结构" id="navigation">
        <div className="row wrap">
          <a data-testid="navigation-link" href="#/target">进入导航目标页</a>
          <a data-testid="full-navigation-link" href="/?full=1#/target">完整导航目标页</a>
          <a data-testid="redirect-navigation-link" href="/redirect-target">重定向目标页</a>
          <a data-testid="new-tab-link" href="?child=1#/target" target="_blank" rel="noreferrer">新标签页目标</a>
          <button data-testid="reload-counter" onClick={() => { sessionStorage.setItem("reloadCount", String(Number(sessionStorage.getItem("reloadCount") || 0) + 1)); location.reload(); }}>递增并刷新</button>
        </div>
        <div className="row wrap">
          <button data-testid="remove-frame" onClick={() => setFrameVisible(false)}>移除主框架</button>
          {frameVisible ? <iframe id="frame-shell" data-testid="frame-shell" tabIndex="0" ref={frame} title="同源观察框架" src="/frame-outer.html" /> : null}
          <iframe data-testid="cross-frame" title="跨源观察框架" src={`http://localhost:${location.port}/frame-outer.html`} />
          <iframe className="ambiguous-frame" title="歧义框架一" src="/frame-inner.html" />
          <iframe className="ambiguous-frame" title="歧义框架二" src="/frame-inner.html" />
        </div>
      </Section>
    </Page>
  );
}

function KDesignMatrix() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const columns = useMemo(() => [
    { title: "单据号", dataIndex: "id", key: "id" },
    { title: "客户", dataIndex: "customer", key: "customer" },
    { title: "金额", dataIndex: "amount", key: "amount" },
    { title: "状态", dataIndex: "status", key: "status", render: (value) => <Tag type={value === "已审核" ? "success" : "warning"}>{value}</Tag> }
  ], []);
  const data = [
    { key: "1", id: "SO-1001", customer: "星海制造", amount: "¥ 12,800", status: "已审核" },
    { key: "2", id: "SO-1002", customer: "远山科技", amount: "¥ 8,600", status: "待审核" }
  ];
  const menu = <Menu onClick={() => {}}><Menu.Item key="edit">编辑</Menu.Item><Menu.Item key="copy">复制</Menu.Item></Menu>;

  return (
    <Page title="KDesign 组件矩阵" subtitle="使用 @kdcloudjs/kdesign 1.8.74，覆盖高频企业组件及弹层定位。">
      <Section title="基础操作与反馈">
        <div className="row wrap" data-testid="kdesign-basic">
          <Button type="primary">主按钮</Button><Button>次按钮</Button><Button disabled>禁用按钮</Button>
          <Tooltip tip="工具提示内容"><Button>悬停提示</Button></Tooltip>
          <Dropdown overlay={menu}><Button>更多操作</Button></Dropdown>
          <Popconfirm message="确定删除这条记录吗？"><Button type="danger">删除记录</Button></Popconfirm>
          <Badge count={7}><span className="badge-anchor">通知</span></Badge>
          <Tag type="success">已完成</Tag><Progress percent={68} style={{ width: 160 }} />
        </div>
        <Alert type="info" message="这是用于可访问性快照的 KDesign 提示。" />
      </Section>

      <Section title="表单控件">
        <div className="form-grid" data-testid="kdesign-form">
          <label>客户名称<Input placeholder="请输入客户名称" /></label>
          <label>订单数量<InputNumber min={0} defaultValue={2} /></label>
          <label>启用审批<Switch defaultChecked /></label>
          <label>同意条款<Checkbox>我已阅读</Checkbox></label>
          <label>优先级<Radio.Group defaultValue="normal"><Radio value="normal">普通</Radio><Radio value="urgent">紧急</Radio></Radio.Group></label>
          <label>所属部门<Select defaultValue="finance" style={{ width: 180 }}><Select.Option value="finance">财务部</Select.Option><Select.Option value="sales">销售部</Select.Option></Select></label>
          <label>业务日期<DatePicker /></label>
          <label>完成度<Slider defaultValue={40} /></label>
          <label>服务评分<Rate defaultValue={4} /></label>
        </div>
      </Section>

      <Section title="数据展示与选择">
        <Tabs defaultActiveKey="table"><Tabs.TabPane tab="订单表格" key="table"><Table rowSelection={{ selectedRowKeys: selectedRows, onChange: setSelectedRows }} columns={columns} dataSource={data} pagination={false} /></Tabs.TabPane><Tabs.TabPane tab="组织树" key="tree"><Tree defaultExpandAll treeData={[{ key: "root", title: "金蝶集团", children: [{ key: "hr", title: "人力资源" }, { key: "fin", title: "财务共享" }] }]} /></Tabs.TabPane></Tabs>
        <Pagination defaultCurrent={1} total={120} pageSize={10} showQuickJumper />
        <Collapse><Collapse.Panel header="展开查看审计信息" panelKey="audit"><p>创建人：Lingee QA；版本：1.8.74</p></Collapse.Panel></Collapse>
      </Section>

      <Section title="弹层和流程">
        <Steps current={1}><Steps.Step title="创建单据" /><Steps.Step title="经理审批" /><Steps.Step title="财务归档" /></Steps>
        <div className="row wrap"><Button data-testid="open-modal" onClick={() => setModal(true)}>打开模态框</Button><Button data-testid="open-drawer" onClick={() => setDrawer(true)}>打开抽屉</Button></div>
        <Modal title="订单确认" visible={modal} onOk={() => setModal(false)} onCancel={() => setModal(false)}><p data-testid="modal-content">请确认订单 SO-1001 的金额。</p></Modal>
        <Drawer title="单据详情" visible={drawer} onClose={() => setDrawer(false)}><p data-testid="drawer-content">客户：星海制造</p></Drawer>
      </Section>
    </Page>
  );
}

function ProScenarios() {
  const [active, setActive] = useState("workbench");
  return (
    <div className="pro-shell">
      <aside><div className="pro-logo">KDesign Pro Lab</div>{["workbench", "list", "form", "detail", "report", "login"].map((id) => <button className={active === id ? "active" : ""} key={id} data-testid={`pro-nav-${id}`} onClick={() => setActive(id)}>{({ workbench: "工作台", list: "列表页", form: "表单页", detail: "详情流程", report: "统计报表", login: "登录页" })[id]}</button>)}</aside>
      <div className="pro-main"><div className="pro-header"><Breadcrumb items={[{ title: "典型页面" }, { title: active }]} /><span>测试用户 · 中文</span></div>{active === "workbench" ? <Workbench /> : active === "list" ? <ProList /> : active === "form" ? <ProForm /> : active === "detail" ? <ProDetail /> : active === "report" ? <ProReport /> : <ProLogin />}</div>
    </div>
  );
}

function Workbench() { return <Page title="工作台" subtitle="对应 KDesign Pro workbench 模板"><div className="metric-grid">{[["待办任务", "18"], ["本月销售", "¥ 286k"], ["审批效率", "92%"], ["风险事项", "3"]].map(([a,b]) => <Card key={a}><small>{a}</small><strong>{b}</strong></Card>)}</div><Section title="快捷入口"><div className="shortcut-grid">{["新建订单", "费用报销", "采购申请", "数据报表"].map(x => <Button key={x}>{x}</Button>)}</div></Section></Page>; }
function ProList() { return <Page title="订单列表" subtitle="对应 basic/form/tree/card list 模板"><Section title="筛选条件"><div className="row wrap"><Input placeholder="订单号/客户" style={{ width: 220 }} /><Select defaultValue="all" style={{ width: 150 }}><Select.Option value="all">全部状态</Select.Option><Select.Option value="open">处理中</Select.Option></Select><Button type="primary">查询</Button><Button>重置</Button></div></Section><Section title="列表结果"><Table columns={[{title:"订单号",dataIndex:"id"},{title:"客户",dataIndex:"name"},{title:"负责人",dataIndex:"owner"}]} dataSource={[{key:1,id:"KD-2026-001",name:"苍穹科技",owner:"王经理"},{key:2,id:"KD-2026-002",name:"星瀚制造",owner:"李经理"}]} pagination={false}/><Pagination total={42} pageSize={10}/></Section></Page>; }
function ProForm() { const [saved,setSaved]=useState(false); return <Page title="新建业务申请" subtitle="对应 basic/vertical/guide/anchor form 模板"><Section title="基本信息"><div className="form-grid"><label>申请主题<Input placeholder="输入申请主题" /></label><label>申请类型<Select defaultValue="purchase"><Select.Option value="purchase">采购申请</Select.Option><Select.Option value="travel">差旅申请</Select.Option></Select></label><label>申请金额<InputNumber min={0} defaultValue={1000}/></label><label>紧急程度<Radio.Group defaultValue="normal"><Radio value="normal">普通</Radio><Radio value="urgent">紧急</Radio></Radio.Group></label></div></Section><div className="row"><Button type="primary" data-testid="pro-form-submit" onClick={() => setSaved(true)}>提交申请</Button><Button>保存草稿</Button></div><output data-testid="pro-form-result">{saved ? "申请已提交" : "等待提交"}</output></Page>; }
function ProDetail() { return <Page title="采购申请详情" subtitle="对应 basic/vertical/cross/columns/flow detail 模板"><Steps current={2}><Steps.Step title="提交"/><Steps.Step title="部门审批"/><Steps.Step title="财务复核"/><Steps.Step title="完成"/></Steps><div className="detail-grid"><Card title="申请信息"><dl><dt>单据编号</dt><dd>PO-2026-1101</dd><dt>申请部门</dt><dd>数字化中心</dd></dl></Card><Card title="审批意见"><p>预算充足，等待财务复核。</p></Card></div></Page>; }
function ProReport() { return <Page title="经营统计报表" subtitle="对应 list/statistics report 模板"><div className="chart" role="img" aria-label="一月至六月销售额柱状图">{[42,65,51,78,72,91].map((v,i)=><div key={i}><span style={{height:`${v}%`}}></span><small>{i+1}月</small></div>)}</div><Table columns={[{title:"指标",dataIndex:"name"},{title:"本期",dataIndex:"value"},{title:"同比",dataIndex:"change"}]} dataSource={[{key:1,name:"营业收入",value:"286 万",change:"+12.8%"},{key:2,name:"毛利率",value:"38.6%",change:"+2.1%"}]} pagination={false}/></Page>; }
function ProLogin() { const [result,setResult]=useState("等待登录"); return <div className="login-card"><h1>欢迎使用 KDesign Pro Lab</h1><label>用户名<Input data-testid="pro-login-user" placeholder="test-user" /></label><label>密码<Input type="password" data-testid="pro-login-password" placeholder="仅测试，不要输入真实密码" /></label><Checkbox>记住测试账号</Checkbox><Button type="primary" data-testid="pro-login-submit" onClick={() => setResult("模拟登录成功")}>登录测试环境</Button><output data-testid="pro-login-result">{result}</output></div>; }

function NavigationTarget() { return <Page title="导航目标页" subtitle="用于 navigate/back/forward/reload 和多标签页测试。"><Alert type="success" message="navigation-target:ready"/><p data-testid="reload-state">reloadCount={sessionStorage.getItem("reloadCount") || "0"}</p><a href="#/lab">返回能力实验室</a></Page>; }
function Page({ title, subtitle, children }) { return <div className="page"><header className="page-heading"><h1>{title}</h1><p>{subtitle}</p></header>{children}</div>; }
function Section({ title, id, children }) { return <section className="section" id={id}><h2>{title}</h2>{children}</section>; }

ReactDOM.render(<App />, document.getElementById("root"));
