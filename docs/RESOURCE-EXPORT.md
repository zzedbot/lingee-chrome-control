# Controlled content export

## Bridge resource export

`browser.listObservedResources` inventories only HTTP(S) resources already recorded for the current approved top-level document. Its opaque IDs are bound to that document and expire on navigation. `browser.exportObservedResources` accepts only an explicit selection of those IDs and creates a session-temporary ZIP with `manifest.json`.

Limits are 500 listed entries, 20 selected entries, 4 MiB per resource, and 8 MiB total selected bytes. Unapproved origins, subframes, `data:`, `blob:`, `file:`, failed resources, and cancelled resources are excluded. Archives are removed at session end, expiry, or Host shutdown.

The capability does not expose a general HTTP client, request headers, browser cookies, page scripts, raw CDP, hidden download endpoints, or caller-selected output paths. It must not be used to bypass authentication, paywalls, DRM, subscription controls, or site permissions.
