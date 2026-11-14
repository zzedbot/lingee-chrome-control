import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Alert } from "@kdcloudjs/kdesign";
import "@kdcloudjs/kdesign/dist/kdesign.css";
import { KDesignCatalog } from "./KDesignCatalog.jsx";
import { KDesignProLab } from "./KDesignProLab.jsx";
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

  const cleanRoute = route.split("?")[0];
  if (cleanRoute === "#/kdesign" || cleanRoute.startsWith("#/kdesign/")) {
    return <KDesignCatalog componentId={cleanRoute.startsWith("#/kdesign/") ? cleanRoute.slice("#/kdesign/".length) : undefined} />;
  }
  if (cleanRoute === "#/pro" || cleanRoute.startsWith("#/pro/")) {
    return <KDesignProLab templateId={cleanRoute.startsWith("#/pro/") ? cleanRoute.slice("#/pro/".length) : "workbench"} />;
  }
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
        {cleanRoute === "#/target" ? <NavigationTarget /> : <CapabilityLab />}
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

function NavigationTarget() { return <Page title="导航目标页" subtitle="用于 navigate/back/forward/reload 和多标签页测试。"><Alert type="success" message="navigation-target:ready"/><p data-testid="reload-state">reloadCount={sessionStorage.getItem("reloadCount") || "0"}</p><a href="#/lab">返回能力实验室</a></Page>; }
function Page({ title, subtitle, children }) { return <div className="page"><header className="page-heading"><h1>{title}</h1><p>{subtitle}</p></header>{children}</div>; }
function Section({ title, id, children }) { return <section className="section" id={id}><h2>{title}</h2>{children}</section>; }

ReactDOM.render(<App />, document.getElementById("root"));
