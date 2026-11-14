import React from "react";
import { KDESIGN_CATEGORIES, KDESIGN_COMPONENTS, KDESIGN_PRO_CATEGORIES, KDESIGN_PRO_TEMPLATES, OFFICIAL_BASELINE } from "./official-catalog.js";

export function TestLabShell({ section, children }) {
  return (
    <div className="lab-shell">
      <header className="lab-header">
        <a className="lab-brand" href="#/kdesign" aria-label="Lingee KDesign Complete Test Lab">
          <img src="/lingee-logo.svg" alt="Lingee" />
          <span className="lab-brand-divider" />
          <span><strong>KDesign Complete Test Lab</strong><small>确定性 Chrome 自动化夹具</small></span>
        </a>
        <label className="lab-global-search">
          <span aria-hidden="true">⌕</span>
          <input data-testid="catalog-global-search" type="search" placeholder="搜索组件、模板或源码路径" />
        </label>
        <div className="lab-header-status">
          <span className="lab-version">KDesign {OFFICIAL_BASELINE.kdesign.packageVersion}</span>
          <span className="lab-ready"><i />官方基线已锁定</span>
        </div>
      </header>
      <div className="lab-body">
        <aside className="lab-sidebar" aria-label="测试目录">
          <nav>
            <NavGroup title="Capability Lab">
              <NavLink href="#/lab" active={section === "capability"}>浏览器能力实验室</NavLink>
            </NavGroup>
            <NavGroup title={`KDesign Components · ${KDESIGN_COMPONENTS.length}`}>
              <NavLink href="#/kdesign" active={section === "kdesign"}>组件目录总览</NavLink>
              {KDESIGN_CATEGORIES.map((category) => (
                <NavLink key={category} href={`#/kdesign?category=${encodeURIComponent(category)}`}>
                  {category}<span>{KDESIGN_COMPONENTS.filter((item) => item.category === category).length}</span>
                </NavLink>
              ))}
            </NavGroup>
            <NavGroup title={`KDesign Pro Templates · ${KDESIGN_PRO_TEMPLATES.length}`}>
              <NavLink href="#/pro" active={section === "pro"}>模板路由总览</NavLink>
              {KDESIGN_PRO_CATEGORIES.map((category) => {
                const first = KDESIGN_PRO_TEMPLATES.find((item) => item.category === category);
                return <NavLink key={category} href={`#/pro/${first.id}`}>{category}<span>{KDESIGN_PRO_TEMPLATES.filter((item) => item.category === category).length}</span></NavLink>;
              })}
            </NavGroup>
          </nav>
          <div className="lab-sidebar-footer"><i />Deterministic mode</div>
        </aside>
        <main className="lab-content">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ title, children }) {
  return <section className="lab-nav-group"><h2>{title}</h2>{children}</section>;
}

function NavLink({ href, active = false, children }) {
  return <a className={active ? "active" : ""} href={href}>{children}</a>;
}
