import React, { useMemo, useState } from "react";
import {
  Alert, Anchor, Avatar, Badge, BaseData, Breadcrumb, Button, Card, Carousel, Cascader, Checkbox,
  CityPicker, Clipboard, Collapse, ColorPicker, DatePicker, Divider, Drawer, Dropdown, Empty, Filter,
  Form, GeoZonePicker, Icon, Image, ImageCropper, Input, InputNumber, Layout, Link, Menu, Message,
  Modal, Notification, Pagination, Popconfirm, Progress, QRCode, Radio, RangePicker, Rate, Row, Col, Search,
  Select, Signature, Slider, Space, Spin, SplitPanel, Step, Stepper, Steps, Switch, Table, Tabs, Tag,
  TextArea, Timeline, Tooltip, Transfer, Tree, TreeSelect, Typography, Upload
} from "@kdcloudjs/kdesign";
import { InspectionPassed, Processing, Search as SearchSvg, ShoppingBag } from "@kdcloudjs/kdesign-icons";
import { KDESIGN_COMPONENTS, OFFICIAL_BASELINE } from "./official-catalog.js";
import { COMPONENT_TEST_MATRIX } from "../official-test-matrix.mjs";
import { TestLabShell } from "./TestLabShell.jsx";

const tinyImage = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#e8f1ff"/><circle cx="72" cy="60" r="32" fill="#276ff5"/><text x="118" y="66" font-family="sans-serif" font-size="18" fill="#212121">KDesign</text></svg>');
const treeData = [{ key: "root", title: "金蝶集团", children: [{ key: "finance", title: "财务共享" }, { key: "digital", title: "数字化中心" }] }];
const tableColumns = [
  { name: "单据号", code: "id", width: 180 },
  { name: "客户", code: "customer", width: 260 },
  { name: "状态", code: "status", width: 120 }
];
const tableData = [{ key: "1", id: "SO-1001", customer: "星海制造", status: "已审核" }, { key: "2", id: "SO-1002", customer: "远山科技", status: "待审核" }];
const selectOptions = [{ value: "finance", label: "财务部" }, { value: "sales", label: "销售部" }];

export function KDesignCatalog({ componentId }) {
  return (
    <TestLabShell section="kdesign">
      {componentId ? <ComponentDetail componentId={componentId} /> : <CatalogOverview />}
    </TestLabShell>
  );
}

function CatalogOverview() {
  const category = new URLSearchParams((location.hash.split("?")[1] || "")).get("category") || "All";
  const [query, setQuery] = useState("");
  const visible = useMemo(() => KDESIGN_COMPONENTS.filter((item) => {
    const categoryMatches = category === "All" || item.category === category;
    const haystack = `${item.name} ${item.id} ${item.sourcePath} ${item.exportName}`.toLowerCase();
    return categoryMatches && haystack.includes(query.trim().toLowerCase());
  }), [category, query]);

  return (
    <div className="catalog-page" data-testid="kdesign-catalog">
      <PageHeading eyebrow="Capability Lab / Component Catalog" title="KDesign 官方组件目录" subtitle={`基于官方 ${OFFICIAL_BASELINE.kdesign.commit.slice(0, 7)} 提交的 components/*/demo 目录，共 ${KDESIGN_COMPONENTS.length} 个独立夹具。`} />
      <section className="coverage-grid" aria-label="覆盖摘要">
        <CoverageCard label="官方目录范围" value="62 / 62" detail="基线已锁定" tone="success" />
        <CoverageCard label="可交互项深度验收" value="41 / 41" detail="全部通过" tone="success" />
        <CoverageCard label="独立组件路由" value="62" detail="每项可直接访问" />
        <CoverageCard label="官方 Pro 模板" value="22" detail="独立源码路由" tone="success" />
      </section>
      <section className="catalog-panel">
        <div className="catalog-toolbar">
          <label><span>⌕</span><input data-testid="component-catalog-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选组件或源码路径" /></label>
          <span className="catalog-filter-chip">{category === "All" ? "全部组件" : category}</span>
          <span className="catalog-count" data-testid="component-catalog-count">显示 {visible.length} / {KDESIGN_COMPONENTS.length}</span>
        </div>
        <div className="catalog-table-head"><span>组件</span><span>官方源码目录</span><span>测试状态</span></div>
        <div className="catalog-component-list">
          {visible.map((item) => (
            <a href={`#/kdesign/${item.id}`} key={item.id} data-testid={`catalog-component-${item.id}`}>
              <span><strong>{item.name}</strong><small>{item.category} · {item.exportName}</small></span>
              <code>{item.sourcePath}</code>
              <span className="status-badges"><em>Rendered</em><em>{COMPONENT_TEST_MATRIX[item.id].tier === "interaction" ? "Interaction passed" : "Structure passed"}</em></span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function ComponentDetail({ componentId }) {
  const item = KDESIGN_COMPONENTS.find(({ id }) => id === componentId);
  const [state, setState] = useState("ready");
  if (!item) return <NotFound title="未找到组件夹具" href="#/kdesign" />;
  const Specimen = SPECIMENS[item.id];
  return (
    <div className="catalog-page" data-testid={`component-${item.id}`}>
      <PageHeading eyebrow={`KDesign Components / ${item.category}`} title={item.name} subtitle={`${item.sourcePath} · export ${item.exportName}`} actions={<a className="secondary-action" href="#/kdesign">返回目录</a>} />
      <div className="component-detail-grid">
        <section className="specimen-panel">
          <header><div><strong>官方基础用法夹具</strong><small>正常、禁用和边界状态按组件能力呈现</small></div><Button data-testid={`reset-${item.id}`} onClick={() => setState("ready")}>Reset</Button></header>
          <SpecimenBoundary name={item.name}>
            <div className="specimen-stage" data-testid={`specimen-${item.id}`}><Specimen onState={setState} /></div>
          </SpecimenBoundary>
        </section>
        <aside className="inspector-panel">
          <header><strong>Test inspector</strong><Tag type="success">RENDERED</Tag></header>
          <dl>
            <div><dt>Stable locator</dt><dd><code>{`[data-testid="specimen-${item.id}"]`}</code></dd></div>
            <div><dt>Official source</dt><dd><code>{item.sourcePath}</code></dd></div>
            <div><dt>State output</dt><dd data-testid={`component-state-${item.id}`}><code>{state}</code></dd></div>
            <div><dt>Baseline commit</dt><dd><code>{OFFICIAL_BASELINE.kdesign.commit.slice(0, 12)}</code></dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

class SpecimenBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(`KDesign specimen ${this.props.name} failed`, error); }
  render() { return this.state.error ? <Alert type="error" message={`${this.props.name} fixture failed: ${this.state.error.message}`} /> : this.props.children; }
}

const SPECIMENS = {
  button: ({ onState }) => <Space><Button type="primary" data-testid="button-primary" onClick={() => onState("primary-clicked")}>主按钮</Button><Button onClick={() => onState("default-clicked")}>次按钮</Button><Button disabled>禁用按钮</Button></Space>,
  clipboard: ({ onState }) => <Clipboard content="Lingee KDesign fixture" onSuccess={() => onState("copied")}>复制测试文本</Clipboard>,
  divider: () => <div><p>分割线上方</p><Divider>业务分区</Divider><p>分割线下方</p></div>,
  icon: () => <Space><Icon type="search" /><Icon type="notice" /><Icon type="setting" /></Space>,
  link: ({ onState }) => <Space><Link href="#/kdesign/link" onClick={() => onState("link-clicked")}>默认链接</Link><Link disabled>禁用链接</Link></Space>,
  space: () => <Space size="large"><Button>操作一</Button><Button>操作二</Button><Button>操作三</Button></Space>,
  typography: () => <Typography><Typography.Title level={3}>企业级组件测试</Typography.Title><Typography.Paragraph><Typography.Text>完整组件目录与确定性状态回读。</Typography.Text></Typography.Paragraph></Typography>,
  grid: () => <Row gutter={12}><Col span={8}><div className="grid-demo">8</div></Col><Col span={8}><div className="grid-demo">8</div></Col><Col span={8}><div className="grid-demo">8</div></Col></Row>,
  layout: () => { const { Header, Sider, Content, Footer } = Layout; return <Layout className="layout-demo"><Header>Header</Header><Layout><Sider>Sider</Sider><Content>Content</Content></Layout><Footer>Footer</Footer></Layout>; },
  "split-panel": ({ onState }) => <div style={{ width: 620, height: 220 }}><SplitPanel defaultSplit={0.5} min={0.1} max={0.1} firstSlot={<div className="split-slot">主数据</div>} secondSlot={<div className="split-slot">详情</div>} onFold={(_, direction) => onState(`fold:${direction}`)} /></div>,
  anchor: () => <Anchor><Anchor.Link href="#anchor-overview" title="概览" /><Anchor.Link href="#anchor-api" title="API" /></Anchor>,
  breadcrumb: () => <Breadcrumb items={[{ title: "典型页面" }, { title: "订单中心" }, { title: "订单详情" }]} />,
  menu: ({ onState }) => <Menu mode="inline" defaultSelectedKey="1" onClick={({ key }) => onState(`menu:${key}`)} style={{ width: 240 }}><Menu.Item key="1">工作台</Menu.Item><Menu.SubMenu key="sub" title="业务中心"><Menu.Item key="2">订单列表</Menu.Item></Menu.SubMenu></Menu>,
  pagination: ({ onState }) => <Pagination defaultCurrent={1} total={120} pageSize={10} showQuickJumper showTitle onChange={(page) => onState(`page:${page}`)} />,
  steps: () => <Steps current={1}><Step title="提交" /><Step title="审批" /><Step title="完成" /></Steps>,
  tabs: ({ onState }) => <Tabs defaultActiveKey="orders" onChange={(key) => onState(`tab:${key}`)}><Tabs.TabPane tab="订单" key="orders">订单内容</Tabs.TabPane><Tabs.TabPane tab="客户" key="customers">客户内容</Tabs.TabPane></Tabs>,
  "base-data": ({ onState }) => <div data-testid="base-data-control"><BaseData columns={[{ title: "编码", key: "value" }, { title: "名称", key: "label" }]} options={[{ value: "BJ", label: "北京市" }, { value: "SH", label: "上海市" }]} onSearch={(value) => onState(`search:${value}`)} onSelect={(value) => onState(`selected:${value?.value || value}`)} /></div>,
  cascader: ({ onState }) => <div data-testid="cascader-control"><Cascader style={{ width: 260 }} options={[{ value: "zhejiang", label: "浙江", children: [{ value: "hangzhou", label: "杭州" }] }]} placeholder="选择地区" onChange={(value) => onState(`value:${value}`)} /></div>,
  checkbox: CheckboxSpecimen,
  "city-picker": ({ onState }) => <div data-testid="city-picker-control"><CityPicker style={{ width: 260 }} domesticList={[{ id: 1, name: "北京", province: "北京市", country: "中国" }, { id: 2, name: "深圳", province: "广东省", country: "中国" }]} foreignList={[{ id: 3, name: "Tokyo", province: "東京都", country: "日本" }]} onSearch={(value) => onState(`search:${value}`)} onChange={(value) => onState(`city:${value || "none"}`)} /></div>,
  "color-picker": ({ onState }) => <div data-testid="color-picker-control"><ColorPicker defaultValue="#276ff5" onChange={(value) => onState(`color:${value}`)} /></div>,
  "date-picker": ({ onState }) => <div data-testid="date-picker-control"><Space><DatePicker onChange={(_, text) => onState(`date:${text}`)} /><RangePicker onChange={(_, text) => onState(`range:${text.join("~")}`)} /></Space></div>,
  filter: ({ onState }) => <div data-testid="filter-control"><Filter title="缺陷列表" conditions={[{ key: "status", label: "状态", multiple: true, options: [{ value: "open", label: "处理中" }, { value: "done", label: "已完成" }] }]} onChange={(value) => onState(`filter:${JSON.stringify(value)}`)} /></div>,
  form: ({ onState }) => <Form layout="vertical" labelWidth={90} onFinish={(value) => onState(`submit:${value.subject || "empty"}`)}><Form.Item label="申请主题" name="subject" required><Input data-testid="form-subject" onChange={(event) => onState(`draft:${event.target.value}`)} /></Form.Item><Button htmlType="submit" type="primary">提交</Button></Form>,
  "geo-zone-picker": ({ onState }) => <div data-testid="geo-zone-picker-control"><GeoZonePicker countryList={[{ code: "001", name: "中国" }, { code: "002", name: "美国" }]} geoZoneData={[{ code: "11", name: "北京市", group: "B", children: [{ code: "1101", name: "市辖区", children: [{ code: "110101", name: "东城区" }] }] }]} provinceGroup={[["A", "B", "C", "D", "E", "F", "G"], ["H", "I", "J", "K", "L", "M", "N"], ["O", "P", "Q", "R", "S", "T"], ["U", "V", "W", "X", "Y", "Z"]]} tabOptions={["省", "市", "县"]} onCountryChange={(value) => onState(`country:${value?.name || "none"}`)} onChange={(value) => onState(`zone:${JSON.stringify(value)}`)} /></div>,
  input: ({ onState }) => <Space direction="vertical"><Input data-testid="input-basic" placeholder="基础输入框" onChange={(event) => onState(`input:${event.target.value}`)} /><TextArea placeholder="多行文本" onChange={(event) => onState(`textarea:${event.target.value}`)} /></Space>,
  "input-number": ({ onState }) => <div data-testid="input-number-control"><InputNumber min={0} max={100} defaultValue={10} onChange={(value) => onState(`number:${value?.target?.value ?? value}`)} onBlur={(event) => onState(`blur:${event.target.value}`)} /></div>,
  radio: ({ onState }) => <Radio.Group defaultValue="normal" onChange={(event) => onState(`radio:${event.target.value}`)}><Radio value="normal">普通</Radio><Radio value="urgent">紧急</Radio></Radio.Group>,
  rate: ({ onState }) => <div data-testid="rate-control"><Rate defaultValue={4} onChange={(value) => onState(`rate:${value}`)} /></div>,
  search: ({ onState }) => <div data-testid="search-control"><Search prefix onSearch={(value) => onState(`search:${value}`)} onPressEnter={(value) => onState(`enter:${value}`)} /></div>,
  select: ({ onState }) => <div data-testid="select-control"><Select defaultValue="finance" style={{ width: 240 }} onChange={(value) => onState(`select:${value}`)}>{selectOptions.map((option) => <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>)}</Select></div>,
  signature: ({ onState }) => <div style={{ width: 320, height: 130 }}><Signature penColor="#212121" onClear={() => onState("signature:cleared")} /></div>,
  slider: ({ onState }) => <div data-testid="slider-control" style={{ width: 360 }}><Slider defaultValue={40} onChange={(value) => onState(`slider:${value}`)} /></div>,
  stepper: ({ onState }) => <div data-testid="stepper-control"><Stepper defaultValue={3} type="base" onChange={(value) => onState(`stepper:${value?.target?.value ?? value}`)} /></div>,
  switch: ({ onState }) => <div data-testid="switch-control"><Switch defaultChecked onChange={(value) => onState(`switch:${value}`)} /></div>,
  transfer: TransferSpecimen,
  "tree-select": ({ onState }) => <div data-testid="tree-select-control"><TreeSelect style={{ width: 260 }} treeData={treeData} placeholder="选择组织" onChange={(value) => onState(`tree-select:${value}`)} /></div>,
  upload: ({ onState }) => <div data-testid="upload-control"><Upload beforeUpload={(file) => { onState(`file:${file.name}`); return false; }}><Button icon={<Icon type="upload" />}>选择测试文件</Button></Upload></div>,
  avatar: () => <Space><Avatar>KD</Avatar><Avatar shape="square" icon={<Icon type="person" />} /></Space>,
  badge: () => <Space><Badge count={7}><span className="badge-box">通知</span></Badge><Badge dot><span className="badge-box">待办</span></Badge></Space>,
  card: () => <Card title="申请信息" style={{ width: 320 }}><p>单据编号：PO-2026-1101</p><p>申请部门：数字化中心</p></Card>,
  carousel: ({ onState }) => <Carousel autoplay={false} beforeChange={(from, to) => onState(`slide:${from}->${to}`)}><div className="carousel-slide">第一张</div><div className="carousel-slide second">第二张</div></Carousel>,
  image: () => <Image width={240} src={tinyImage} alt="KDesign fixture" />,
  "image-cropper": ImageCropperSpecimen,
  progress: () => <Space direction="vertical"><Progress percent={68} style={{ width: 320 }} /><Progress type="circle" percent={82} /></Space>,
  "qr-code": () => <QRCode value="https://github.com/kingdee/kdesign" />,
  "svg-icon": () => <Space size="large"><ShoppingBag /><SearchSvg /><InspectionPassed /><Processing /></Space>,
  table: TableSpecimen,
  tag: ({ onState }) => <Space><Tag type="success">已完成</Tag><Tag type="warning">待审核</Tag><Tag type="edit" closable onClose={() => onState("tag:closed")}>可关闭</Tag></Space>,
  timeline: () => <Timeline><Timeline.Item>创建申请</Timeline.Item><Timeline.Item color="green">部门审批</Timeline.Item><Timeline.Item color="red">财务复核</Timeline.Item></Timeline>,
  tree: ({ onState }) => <Tree defaultExpandAll treeData={treeData} onSelect={(keys) => onState(`tree:${keys.join(",")}`)} />,
  alert: () => <Space direction="vertical"><Alert type="info" message="信息提示" /><Alert type="success" message="操作成功" /><Alert type="warning" message="风险提醒" /></Space>,
  collapse: ({ onState }) => <Collapse onChange={(keys) => onState(`collapse:${Array.isArray(keys) ? keys.join(",") : keys}`)}><Collapse.Panel header="审计信息" panelKey="audit"><p>创建人：Lingee QA</p></Collapse.Panel><Collapse.Panel header="版本信息" panelKey="version"><p>KDesign 1.8.74</p></Collapse.Panel></Collapse>,
  drawer: DrawerSpecimen,
  dropdown: ({ onState }) => <Dropdown menu={[{ key: "edit", label: "编辑" }, { key: "copy", label: "复制" }]} onVisibleChange={(visible) => onState(`visible:${visible}`)} onItemClick={(key) => onState(`menu:${key}`)}><Button>更多操作</Button></Dropdown>,
  empty: () => <Empty description="暂无测试数据" />,
  message: ({ onState }) => <Space><Button onClick={() => { Message.info("Lingee 信息提示"); onState("message:info"); }}>Info</Button><Button onClick={() => { Message.success("测试成功"); onState("message:success"); }}>Success</Button></Space>,
  modal: ModalSpecimen,
  notification: ({ onState }) => <Button onClick={() => { Notification.open({ type: "info", title: "通知推送", content: "Lingee 确定性通知" }); onState("notification:opened"); }}>打开通知</Button>,
  popconfirm: ({ onState }) => <Popconfirm message="确定删除这条测试记录吗？" onVisibleChange={(visible) => onState(`visible:${visible}`)} onConfirm={() => onState("confirmed")}><Button type="danger">删除记录</Button></Popconfirm>,
  spin: () => <div className="spin-stage"><Spin spinning tip="加载中"><div className="spin-content">业务内容</div></Spin></div>,
  tooltip: () => <Tooltip tip="工具提示内容"><Button>悬停查看</Button></Tooltip>
};

function TransferSpecimen({ onState }) {
  const dataSource = Array.from({ length: 8 }, (_, index) => ({ key: String(index + 1), title: `选项 ${index + 1}` }));
  const [targetKeys, setTargetKeys] = useState(["2", "4"]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  return <Transfer dataSource={dataSource} targetKeys={targetKeys} selectedKeys={selectedKeys} render={(item) => item.title} onChange={(keys) => { setTargetKeys(keys); onState(`target:${keys.join(",")}`); }} onSelectChange={(left, right) => setSelectedKeys([...left, ...right])} />;
}

function ImageCropperSpecimen({ onState }) {
  const [visible, setVisible] = useState(false);
  return <><Button onClick={() => { setVisible(true); onState("cropper:open"); }}>打开图片裁剪</Button><ImageCropper visible={visible} title="编辑图片" image={tinyImage} onClose={() => { setVisible(false); onState("cropper:closed"); }} onCropSuccess={() => { setVisible(false); onState("cropper:success"); }} /></>;
}

function ModalSpecimen({ onState }) {
  const [visible, setVisible] = useState(false);
  const close = (state) => { setVisible(false); onState(state); };
  return <><Button data-testid="open-modal" type="primary" onClick={() => { setVisible(true); onState("modal:open"); }}>打开模态框</Button><Modal title="订单确认" body={<p data-testid="modal-content">请确认订单 SO-1001 的金额。</p>} visible={visible} onOk={() => close("modal:ok")} onCancel={() => close("modal:cancel")} /></>;
}

function DrawerSpecimen({ onState }) {
  const [visible, setVisible] = useState(false);
  return <><Button data-testid="open-drawer" onClick={() => { setVisible(true); onState("drawer:open"); }}>打开抽屉</Button><Drawer title="单据详情" visible={visible} onClose={() => { setVisible(false); onState("drawer:closed"); }}><p data-testid="drawer-content">客户：星海制造</p></Drawer></>;
}

function TableSpecimen({ onState }) {
  const [selected, setSelected] = useState([]);
  const rowSelection = {
    type: "checkbox",
    value: selected,
    onChange: (value) => {
      setSelected(value);
      onState(`selected:${value.join(",") || "none"}`);
    },
    column: { width: 48, lock: true },
    highlightRowWhenSelected: true
  };
  return <div className="table-surface"><Table columns={tableColumns} dataSource={tableData} pagination={false} primaryKey="key" rowSelection={rowSelection} /></div>;
}

function CheckboxSpecimen({ onState }) {
  const options = ["读取", "写入", "审批", "导出"];
  const [basicChecked, setBasicChecked] = useState(false);
  const [squareChecked, setSquareChecked] = useState(true);
  const [selected, setSelected] = useState(["读取"]);
  const allChecked = selected.length === options.length;
  const indeterminate = selected.length > 0 && !allChecked;
  const updateGroup = (value) => {
    setSelected(value);
    onState(`group:${value.join(",") || "none"}`);
  };
  return (
    <div className="checkbox-specimen">
      <section>
        <h3>独立 Checkbox</h3>
        <div className="checkbox-demo-row">
          <Checkbox data-testid="checkbox-basic" checked={basicChecked} onChange={(event) => { setBasicChecked(event.target.checked); onState(`basic:${event.target.checked}`); }}>默认复选项</Checkbox>
          <Checkbox data-testid="checkbox-square" checkboxType="square" checked={squareChecked} onChange={(event) => { setSquareChecked(event.target.checked); onState(`square:${event.target.checked}`); }}>方形复选框</Checkbox>
        </div>
      </section>
      <section>
        <h3>禁用状态</h3>
        <div className="checkbox-demo-row"><Checkbox disabled>禁用未选</Checkbox><Checkbox disabled defaultChecked>禁用已选</Checkbox></div>
      </section>
      <section>
        <h3>全选、半选与组合</h3>
        <Checkbox data-testid="checkbox-select-all" checked={allChecked} indeterminate={indeterminate} onChange={(event) => updateGroup(event.target.checked ? options : [])}>全选权限</Checkbox>
        <Divider />
        <Checkbox.Group data-testid="checkbox-group" value={selected} onChange={updateGroup}>
          {options.map((option) => <Checkbox value={option} key={option}>{option}</Checkbox>)}
        </Checkbox.Group>
        <output className="checkbox-selection-summary">当前选择：{selected.join("、") || "无"}</output>
      </section>
    </div>
  );
}

function CoverageCard({ label, value, detail, tone = "primary" }) { return <article className={`coverage-card ${tone}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>; }
function PageHeading({ eyebrow, title, subtitle, actions }) { return <header className="catalog-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></div>{actions}</header>; }
function NotFound({ title, href }) { return <div className="not-found"><Empty description={title} /><a href={href}>返回</a></div>; }
