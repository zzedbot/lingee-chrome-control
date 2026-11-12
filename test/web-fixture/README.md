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

The runner uses only standard high-level Bridge methods. It verifies all seven typed locator queries against visible, hidden and disabled elements, then clicks and verifies the long-page destination, confirm and prompt dialogs, a completed deterministic download, navigation and new-tab links, reload-count persistence, and the iframe `Frame target`, in addition to the capability-level checks. It requires one selected live Bridge instance and an already approved `127.0.0.1` host; it never edits policy. When sensitive-metadata access is disabled, history, bookmark, and download-metadata cases pass by verifying `SENSITIVE_METADATA_APPROVAL_REQUIRED` rather than enabling that separate gate; the fixture's own download is verified through its current-tab lifecycle events.
