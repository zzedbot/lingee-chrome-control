# Source references

Inspected on 2026-11-11. The fixture is independently authored and uses the published KDesign package; it does not copy KDesign Pro page source.

## KDesign

- Repository: <https://github.com/kingdee/kdesign>
- Inspected commit: `0189097792acb7379aea32f8b20fad52045f9e28`
- Package release pinned by the fixture: `@kdcloudjs/kdesign@1.8.74`
- Targeted interaction families: button, input, input-number, checkbox, radio, switch, select, date-picker, slider, rate, menu, dropdown, tooltip, popconfirm, modal, drawer, tabs, table, tree, pagination, collapse, steps, alert, badge, tag, progress and card.

## KDesign Pro

- Repository: <https://github.com/kingdee/kdesign-pro>
- Inspected commit: `dc769181d12a91e9b7b39845f708b992a24b2844`
- Targeted source families: `src/layouts`, `src/pages/login`, and the `typical` workbench, list, form, detail and report trees.
- Fixture scenarios: application shell, simulated login, workbench metrics, searchable list, business form, approval detail flow and statistics report.

KDesign Pro is a Umi-based application template built on KDesign rather than a standalone widget library, so its coverage is expressed as representative page workflows composed from the published KDesign components.
