# Lingee Chrome Control Web Fixture

This deterministic local site exercises every standard Lingee Chrome Control capability that has a visible web-page representation, plus targeted KDesign and KDesign Pro interaction patterns.

## Run

```powershell
cd test/web-fixture
npm install
npm run dev
```

Open the printed loopback URL. Approve only that exact loopback host through the normal Lingee policy flow before controlling it.

## Pages

- `#/lab`: native semantic input, pointer, drag, wheel, scroll, file input, dialogs, downloads, navigation, iframe observation, ambiguity and failure cases.
- `#/kdesign`: real `@kdcloudjs/kdesign` components, including buttons, inputs, selectors, table, tree, tabs, pagination, collapse, popconfirm, modal and drawer.
- `#/pro`: representative KDesign Pro login, workbench, list, form, detail-flow and report patterns based on the public repository structure.
- `#/target`: deterministic navigation/reload target.

The exact upstream commits and targeted component/page families are recorded in [REFERENCES.md](./REFERENCES.md).

The fixture never asks for real credentials. The login page is a local simulation; enter test-only values.

## Automated Bridge run

From the repository root:

```powershell
npm run test:web:chrome
```

The runner uses only standard high-level Bridge methods. It verifies typed locator queries, asynchronous waits, same-origin/cross-origin/nested frames, frame freshness, SPA/full/redirect navigation, native checked/select controls, double-click, sequential input, session leases and tab markers, action-bound downloads, dynamic file choosers, structured console logs, pointer/dialog/tab flows, and bounded failure cases. It requires one selected live Bridge instance and already approved `127.0.0.1` and `localhost` hosts; it never edits policy. When sensitive-metadata access is disabled, history, bookmark, and download-metadata cases pass by verifying `SENSITIVE_METADATA_APPROVAL_REQUIRED` rather than enabling that separate gate.
