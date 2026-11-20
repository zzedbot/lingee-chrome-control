# Differences from the current Codex Chrome implementation

## Scope and methodology

This project is a clean-room functional analogue based on:

- Public OpenAI documentation describing the Codex Chrome extension's user-visible behavior
- The installed plugin's public-facing manifest, skill/API descriptions, and observable component boundaries
- Chrome's documented Native Messaging, extension, and DevTools Protocol APIs

It does not copy or depend on OpenAI's proprietary `browser-client`, `extension-host`, Chrome extension package, private protocols, brand assets, authentication, or server infrastructure.

Because the OpenAI extension is not publicly source-licensed, exact internal equivalence cannot be verified. “Same” below means equivalent architectural role or observable capability, not byte-for-byte or protocol compatibility.

## Architecture comparison

| Area | Current Codex Chrome implementation | Lingee Browser Agent Bridge | Difference |
|---|---|---|---|
| Browser surface | User's existing Chrome profile | User's existing Chrome profile | Equivalent |
| Extension platform | Chrome extension | Chrome Manifest V3 extension | Equivalent role |
| Browser control | Chrome extension APIs, debugger/CDP, higher-level browser API | Chrome extension APIs, debugger/CDP, clean-room locator API | Same primitives; different implementation |
| Foreign extension frame isolation | Runtime monitor on controlled tabs before debugger attachment | Clean-room runtime monitor installed before attachment | Partial: existing, dynamically added and known-shadow-root frames are covered; a brand-new shadow root attached later to an already-connected host may wait for a relevant rescan |
| Desktop bridge | OpenAI Native Messaging Host | Independent Native Messaging Host | Same pattern; incompatible protocol |
| Chrome-to-host transport | Native Messaging over stdio | Native Messaging over stdio | Equivalent |
| Host discovery | Codex privileged browser runtime/native pipe bridge | Descriptor-based local named pipe/Unix socket discovery | Same local-IPC role; different discovery/authentication |
| Agent entry point | Codex privileged JavaScript runtime and `agent.browsers.*` | MCP stdio, JSON-RPC CLI, and JavaScript client | Intentionally vendor-neutral |
| Public capability contract | Private runtime-owned capability surface | One bundled standard-capability registry drives MCP schemas and the Skill CLI gate | Lingee is public and fail-closed; protocols remain incompatible |
| Distribution | Signed OpenAI Chrome Web Store extension and bundled proprietary plugin | Unpacked/signed local extension plus lightweight Host launcher and script requiring system Node.js 22+ | Node runtime and automatic production updates are not bundled |
| Extension identity | OpenAI-controlled fixed ID | ID assigned to the loaded/published independent extension | Necessarily different |
| Native host name | `com.openai.codexextension` | `com.lingee.app.browser_agent_bridge` | Necessarily different |

## Capability comparison

Status meanings: **Aligned** means the same user-visible capability and safety boundary is present through Lingee's public protocol; **Partial** means the core workflow is present with a documented protocol or product-level difference; **Intentionally not implemented** means the boundary belongs to proprietary product infrastructure or would weaken this project's standard-control contract.

| Capability | Status | Notes |
|---|---|---|
| List and select existing tabs | Implemented | Unapproved tab details are redacted |
| Open, close, activate, and navigate tabs | Implemented | HTTP(S) site approval enforced |
| Back, forward, reload | Implemented | — |
| Tab grouping | Implemented | Title, color, and collapsed state supported |
| Read page text | Implemented | Bounded result size |
| DOM snapshot | Implemented with differences | Compact clean-room format, not Codex's private snapshot schema |
| Typed locator queries | Implemented | Count, bounded all-text, strict inner/text content and attribute reads, visibility and enabled state; no arbitrary locator evaluation |
| Nested frame locators | Implemented | Ordered semantic frame paths, loader freshness checks and independent frame-origin policy; different private protocol |
| Element and navigation waits | Implemented | Bounded element states, URL/load states and action-bound navigation including SPA/full navigation |
| Form control operations | Implemented | Checked-state verification, native select options, double click, and sequential input |
| Session/tab lifecycle | Implemented with differences | Explicit non-secret session IDs, renewable exclusive leases, temporary tabs and handoff/deliverable markers |
| Download and file chooser lifecycle | Implemented | Wait-before-action ordering, completed downloads, restricted media target, captured chooser and validated files |
| Structured console logs | Implemented | Bounded primitive summaries, filtering/cursor and policy-sanitized source URLs; no remote object handles |
| Browser session clipboard | Implemented with differences | Per-session bounded Native Host memory with independent read/write gates; plain text, Markdown, inert HTML, and validated PNG only; intentionally never accesses the OS clipboard |
| Accessibility snapshot | Implemented | Uses CDP Accessibility domain |
| Playwright-style selectors | Partially equivalent | CSS, role/name, label, text, test ID; not the full Codex subset or upstream Playwright |
| Click, fill, keypress, scroll | Implemented | CDP Input-backed |
| Drag and coordinate-level computer use | Aligned at execution layer | Coordinate actions require a short-lived, single-use screenshot observation bound to tab, document and normalized DOM/layout evidence; overlay, input and result share an operation sequence. Visual reasoning remains with the calling model |
| Visible virtual pointer | Implemented | Persistent closed-Shadow-DOM pointer starts centered, follows mouse, click, wheel, and drag actions, and is removed on detach; exact Codex styling and internals are proprietary |
| Screenshots | Aligned with additional freshness contract | PNG/JPEG and beyond-viewport output; only viewport PNG creates coordinate-safe evidence |
| Responsive viewport emulation | Implemented | Bounded desktop/tablet/mobile dimensions and device scale; session-scoped reset and pointer recalibration |
| Current-document resource export | Implemented with differences | Lists policy-approved HTTP(S) resources already observed in the top-level document and packages an explicit opaque-ID selection into a bounded session-temporary ZIP; no arbitrary fetch or private Codex export protocol |
| File chooser/input upload | Partial | Captured chooser and CSS input paths validate absolute regular files; every upload is hard-gated by a tab/origin/action/session-bound confirmation intent, but there is no private OS secure-picker service |
| JavaScript dialogs | Implemented | — |
| Downloads | Aligned for supported workflow | Wait-before-action lifecycle, completed result, restricted locator-backed media download, and gated metadata search are implemented; private Codex download objects/protocol remain incompatible |
| CDP events and raw commands | Implemented | Explicit local allowlist |
| History and bookmarks | Implemented, off by default | Independent sensitive-metadata approval |
| Multiple Chrome profiles/instances | Partial | Explicit instance selection plus per-session tab leases and lifecycle markers; no Codex private task grouping or profile UI |
| Browser authentication forms | Intentionally not implemented | No OpenAI secure credential form, password manager, or secret-isolation service; users complete secrets, MFA and CAPTCHA directly in Chrome |
| Vision-based computer use | Intentionally external | MCP screenshot consumers may add their own vision loop; the Bridge enforces observation freshness but does not ship a model |
| Consequential-action confirmation | Partial | Structured intents cover upload, message send, deletion, payment, permission change, login and browser permission. The Host hard-gates uploads; generic click business meaning must be declared by the standard Skill/caller because the Host cannot infer it reliably |
| Website approval UI | Partial | Machine-readable exact-host/subdomain policy gates are implemented; confirmation is surfaced by the calling agent rather than proprietary Codex product UI |
| Allow/block lists | Implemented | JSON policy plus extension defense-in-depth blocklist |
| Memory and account data controls | Not applicable | Belongs to OpenAI product/account infrastructure |
| Telemetry and training controls | Not implemented | No telemetry is sent by this project |
| WebMCP/private browser capabilities | Not guaranteed | Only documented methods in this repository are supported |

## Reuse assessment

Reused directly:

- Chrome Native Messaging protocol specification
- Chrome extension APIs
- Chrome DevTools Protocol
- Node.js standard library, esbuild bundling, and a lightweight Windows launcher
- MCP's public JSON-RPC protocol shape

Not reused:

- OpenAI's extension ID or Chrome Web Store package
- `com.openai.codexextension`
- OpenAI's `extension-host.exe`
- OpenAI's `browser-client.mjs`
- The proprietary `agent.browsers.*` runtime implementation
- OpenAI brand assets, UI, service authentication, telemetry, or private safety services

## Practical compatibility

This implementation is not wire-compatible with the OpenAI extension or Codex Native Host. Third-party software must call the supplied MCP server, JSON-RPC bridge, or JavaScript client.

The final 0.1.31 review closes the public high-level TODO surface without claiming private protocol equivalence. Remaining product differences are deliberate boundaries: integrated proprietary consent UI, secure credential entry, Codex's private visual reasoning/orchestration, store-managed automatic updates, and private service/security infrastructure. One implementation limitation remains explicitly partial rather than hidden: late-created shadow roots may not be discovered until a relevant monitor rescan. The standard Skill continues to block raw CDP, page JavaScript and unknown methods even though the extension internally uses documented Chrome debugger primitives to implement approved high-level operations.
