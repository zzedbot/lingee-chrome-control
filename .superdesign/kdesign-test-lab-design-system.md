# Lingee KDesign Complete Test Lab

## Product purpose

This is a deterministic browser-automation test application, not a marketing site. It must expose every public KDesign component family and every official KDesign Pro template route as inspectable, independently addressable fixtures. Every interactive example needs a stable test id, an adjacent state/result readout, and a reset path. Dense information is acceptable, but controls must remain visually separated and readable.

## Information architecture

- Persistent application shell with a 64px white header, product identity, global fixture search, version badge, and compact regression status.
- 248px left navigation grouped into `Capability Lab`, `KDesign Components`, and `KDesign Pro Templates`.
- KDesign Components contains the complete official `components/*/demo` catalog. Group by General, Layout, Navigation, Data Entry, Data Display, Feedback, and Advanced.
- The component overview shows catalog coverage, interaction coverage, assertion coverage, and failures. Each component has its own route and specimen card.
- KDesign Pro mirrors the official source categories and routes: Workbench; Detail (basic, columns, cross, vertical, flow); List (basic, tree, form, banner, card); Report (list, statistics); Form (basic, guide, anchor, vertical, preview); Exception (403, 404, 500); Login.
- Never merge several official templates into one synthetic page. Each official template has a separate route, title, source-path label, and test-state panel.

## Visual system

- Follow the visual language of `@kdcloudjs/kdesign@1.8.74` and the official KDesign Pro source.
- Page background: `#f2f4f7`; panels: `#ffffff`; primary text: `#212121`; secondary text: `#666666`; muted text: `#999999`.
- Primary action/theme blue: `#276ff5`; link/action blue: `#0e5fd8`; selected pale blue uses the KDesign theme-2 token.
- Borders: `#d9d9d9`; subtle borders: `#e5e5e5`; danger: `#fb2323`; success: `#1ba854`.
- Use the system font stack from the application and KDesign. No decorative fonts, gradients, glassmorphism, neon, or oversized marketing typography.
- Header and navigation use restrained enterprise styling. Active navigation uses pale blue fill with blue text and a 3px left indicator.
- Content panels use 2px to 6px radii and the official card shadow `0 3px 8px 1px rgba(0,0,0,.06)`.
- Standard page padding: 20px to 24px. Grid gap: 12px to 16px. Dense component specimen cards may use 16px padding.

## Component specimen pattern

- Header row: component name, official source path, coverage badges, and `Reset` action.
- Main specimen area: real KDesign component examples in normal, disabled, loading, validation, and boundary states where applicable.
- Right or bottom inspector: deterministic state values, last action, locator strategy, and assertion status.
- Every overlay component must have an obvious trigger and a visible result region after dismissal.
- Use stable `data-testid` values derived from the official component directory and example purpose.

## KDesign Pro page pattern

- Preserve official enterprise page structure: white operation bar, filters or steps panel, flexible main content, and bottom pagination/action area.
- List pages use the official panel/filter/operation/main/pagination hierarchy.
- Form pages use the official operation bar, steps/panel region, and collapsible form content.
- Detail pages use the official operation bar, collapse/card sections, and field-label hierarchy.
- Login uses the official split layout: blue illustration/banner region and 400px form rail.
- Exception pages are separate 403, 404, and 500 fixtures with recovery actions.

## Test visibility and accessibility

- Coverage badges: `Rendered`, `Interactive`, `Asserted`, and `Pending` with text labels, not color alone.
- Result panels use monospace text only for machine-readable values; normal UI text remains system sans-serif.
- Ensure keyboard focus visibility, accessible names, labels, and sufficient contrast.
- Responsive behavior may collapse the sidebar below 960px, but desktop at 1440px is the primary test viewport.
- Motion must be minimal and deterministic; overlays may use KDesign defaults but the test shell itself should not animate layout.

## Required first design

Design the desktop component-catalog overview route. It should show the persistent shell, full category navigation, four coverage summary cards, a searchable/filterable component grid, per-component status badges, and a right-side test inspector preview. Also expose the KDesign Pro route groups in the sidebar so the future template pages clearly fit the same shell.
