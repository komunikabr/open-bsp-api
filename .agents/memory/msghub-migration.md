---
name: MsgHub migration gotchas
description: Key issues encountered migrating MsgHub from Supabase+Deno to Neon+Node/Express+Replit Auth
---

# MsgHub Migration Gotchas

**Why:** Non-obvious issues that took multiple attempts.

## Express v5 wildcard route
Use `/{*splat}` not `*` for catch-all SPA fallback — Express v5 breaks on the old syntax.

## tsx path aliases
`TSX_TSCONFIG_PATH=tsconfig.json` env var (not a Node flag) enables `@shared/*` path aliases in ESM mode.

## crypto in ESM routes
Use `import { webcrypto } from "crypto"` then `const { getRandomValues } = webcrypto` — global `crypto` is not available in Node ESM without this.

## Organizations GET returns array
Frontend expects array from `GET /api/organizations`; route must return `[]` not `null` when no org found, and `[org]` not `org` when found.

## Key generation server-side
API key (`mh_` prefix + 48 hex chars) must be generated server-side in the POST route, not client-side.

**How to apply:** Review when adding new routes or debugging auth/key flows.
