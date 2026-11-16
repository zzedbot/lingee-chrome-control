#!/usr/bin/env node

// The repository installer intentionally reuses the standalone Skill installer so
// development and distributed installations have one Node-runtime contract.
await import("../skills/lingee-chrome-control/scripts/install-host.mjs");
