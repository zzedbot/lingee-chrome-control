# Lingee Chrome Control Web Fixture

This deterministic local site exercises every standard Lingee Chrome Control capability that has a visible web-page representation, the complete official KDesign demo-bearing component catalog, and every public KDesign Pro page template in the inspected upstream revision.

## Run

```powershell
cd test/web-fixture
npm install
npm run dev
```

Open the printed loopback URL. Approve only that exact loopback host through the normal Lingee policy flow before controlling it.

## Pages

- `#/lab`: native semantic input, pointer, drag, wheel, scroll, file input, dialogs, downloads, navigation, iframe observation, ambiguity and failure cases.
- `#/kdesign`: catalog for all 62 official KDesign component directories that contain demos. Each component has its own `#/kdesign/<component>` route, source reference, stable locator and visible state output.
- `#/pro`: catalog for all 22 official KDesign Pro templates. Each workbench, detail, list, report, form, exception and login source page has its own `#/pro/<template>` route.
- `#/target`: deterministic navigation/reload target.

The exact upstream commits and targeted component/page families are recorded in [REFERENCES.md](./REFERENCES.md).

The fixture never asks for real credentials. The login page is a local simulation; enter test-only values.

## Automated Bridge run

From the repository root:

```powershell
npm run test:web:chrome
```

The runner uses only standard high-level Bridge methods. It verifies typed locator queries, asynchronous waits, same-origin/cross-origin/nested frames, frame freshness, SPA/full/redirect navigation, native checked/select controls, double-click, sequential input, session leases and tab markers, action-bound downloads, dynamic file choosers, structured console logs, pointer/dialog/tab flows, and bounded failure cases. It requires one selected live Bridge instance and already approved `127.0.0.1` and `localhost` hosts; it never edits policy. When sensitive-metadata access is disabled, history, bookmark, and download-metadata cases pass by verifying `SENSITIVE_METADATA_APPROVAL_REQUIRED` rather than enabling that separate gate.

Run the independent KDesign/KDesign Pro scenario with:

```powershell
npm run test:chrome:kdesign
```

This scenario traverses all 62 KDesign component routes and all 22 KDesign Pro template routes, validates their recorded upstream source paths, performs deeper Button, Input, Modal, Drawer, form and simulated-login interactions, and checks structured console errors after every route. It uses only the same public high-level Bridge methods and always ends its browser session.

The current KDesign release has a reproducible `SplitPanel` teardown issue: an asynchronous `ResizeObserver` callback can read `clientWidth` after its wrapper ref has been cleared. The runner records that exact upstream signature as a known issue and still fails on every other fixture-originated console error.
