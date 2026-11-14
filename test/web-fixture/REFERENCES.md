# Source references

Inspected on 2026-11-13. The fixture is independently authored from the upstream catalogs and adapts the public page structures into deterministic local test routes. It does not present itself as an upstream distribution.

## KDesign

- Repository: <https://github.com/kingdee/kdesign>
- Inspected commit: `0189097792acb7379aea32f8b20fad52045f9e28`
- Package release pinned by the fixture: `@kdcloudjs/kdesign@1.8.74`
- Catalog baseline: all 62 component directories containing official demos at the inspected commit.
- Test implementation: one deterministic route and rendered specimen per component, plus deeper automated interaction coverage for representative pointer, text input, overlay and container behaviors.

## KDesign Pro

- Repository: <https://github.com/kingdee/kdesign-pro>
- Inspected commit: `dc769181d12a91e9b7b39845f708b992a24b2844`
- Catalog baseline: all 22 page templates found under the public `src/pages` route tree at the inspected commit.
- Covered families: workbench (1), detail (5), list (5), report (2), form (5), exception (3), and login (1).
- Test implementation: source-path-labelled local adaptations of every template, preserving the official information architecture and characteristic layout while replacing network and authentication dependencies with deterministic data.

KDesign Pro is a Umi-based application template built on KDesign rather than a published standalone widget package. The fixture therefore mirrors its official page source structure instead of importing a nonexistent `@kdcloudjs/kdesign-pro` package.
