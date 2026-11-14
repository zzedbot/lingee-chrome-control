# Lingee Chrome Control Skill evaluation

Date: 2026-11-14  
Evaluated version: `0.1.27`  
Verdict: **Pass — suitable for controlled use through the standard MCP or bundled CLI surface**

## Scope

This evaluation covers the repository Skill at `skills/lingee-chrome-control`, the installed Skill at `C:\Users\fcliq\.codex\skills\lingee-chrome-control`, the bundled Chrome extension and Native Host, the generic control documentation, the KDesign/KDesign Pro reference, and the validated workflow runner and examples.

## Results

| Area | Result | Evidence |
| --- | --- | --- |
| Skill package structure | Pass | Skill Creator validation reports `Skill is valid!` for both repository and installed copies. |
| Repository/installed parity | Pass | Recursive SHA-256 inventory has no differing or missing files. |
| Version compatibility | Pass | Host `0.1.27`, extension `0.1.27`, expected `0.1.27`; all compatibility markers match. |
| Standard capability surface | Pass | 28 capability families present; no missing capabilities. |
| Automated tests | Pass | `npm test`: 124/124 tests passed. |
| Live Bridge health | Pass | One connectable instance, extension connected, read-only doctor and preflight both return `ok: true`. |
| KDesign route coverage | Pass | 62/62 official component routes load and pass structural/console checks. |
| KDesign deep interaction coverage | Pass | 41 components pass real Chrome interaction checks. The remaining 21 are structure-oriented components. |
| KDesign Pro route coverage | Pass | 22/22 official template routes load and pass structural/console checks. |
| KDesign Pro deep interaction coverage | Pass | 15 pages pass real Chrome interaction checks. The remaining 7 are structure/exception/detail variants. |
| End-to-end browser regression | Pass | 158 real Chrome checks completed with `ok: true`; no known upstream issue occurred in this run. |
| Workflow safety | Pass | Workflow schema rejects raw CDP, page script, unknown methods, malformed expectations, and missing variables before or during deterministic execution. |

## Added Skill coverage

- `references/kdesign.md` documents detailed KDesign component and KDesign Pro page invocation patterns, including MCP/CLI equivalents, locators, actions, verification, navigation, overlays, upload, authentication handoff, and recovery.
- `scripts/run-workflow.mjs` validates and executes reviewed sequential workflows through the existing standard Bridge method allowlist. It preserves typed variables, uses one stable session, forwards timeouts, and verifies returned results.
- `examples/kdesign-components.json` contains reusable Select, Checkbox, overlay, and upload workflows.
- `examples/kdesign-pro-pages.json` contains list query, table selection, form submission, and detail-tab workflows.

These additions intentionally do not create `kdesign.*` or `kdesignPro.*` Bridge methods. KDesign behavior remains a composition layer above the generic browser-control contract, so the same MCP and CLI methods continue to work across KDesign versions and ordinary web applications.

## Safety assessment

- Raw CDP, `Runtime.evaluate`, page JavaScript, and unknown control methods remain outside the Skill contract.
- Visible actions use pointer-aware Bridge methods; the workflow runner cannot bypass this allowlist.
- Login, MFA, CAPTCHA, and production credentials remain user handoff points.
- File upload examples require reviewed absolute file paths.
- Consequential actions still require the approval rules documented by the Skill; a workflow file is not approval by itself.

## Remaining limitations

1. Example locators are templates. A deployed business page must be inspected first because KDesign portals, labels, and CSS classes can vary by release and application layout.
2. The workflow runner is deliberately sequential. It has no conditional branches, automatic retries, or rollback; callers must inspect failures and avoid replaying non-idempotent business actions.
3. Hover-only UI still relies on fresh viewport coordinates through `browser.mouseMove`; there is no semantic hover locator method yet.
4. Structure-oriented KDesign components and exception/detail-only Pro pages do not need synthetic mutations, so their coverage is structural rather than deep interaction coverage.
5. The maintained component baseline is KDesign `1.8.74`; upgrades require rerunning the official catalog and real-Chrome regression.

## Overall rating

**96/100**

- Functional completeness: 20/20
- Safety and policy compliance: 20/20
- Portability and package independence: 20/20
- KDesign/KDesign Pro guidance and examples: 18/20
- Verification depth and maintainability: 18/20

The two deductions reflect version-sensitive example locators and the intentionally small, sequential workflow language. Neither requires framework-specific browser APIs.
