# Project working agreement

- Read `README.md`, `docs/DEVELOPMENT.md`, and the current Miro access record before changing scope.
- Never describe the seeded demo thresholds as real subsidy conditions. Production refuses demo rules.
- Do not auto-approve AI-generated policy rules. Preserve source evidence, approval history and immutable evaluation input snapshots.
- Keep business facts separate from proposed hiring changes. Unknown values are null, never false/0.
- Every resource API must check ownership on the server. Administration requires ADMIN.
- All state-changing browser APIs require an allowed Origin. Do not log API keys, session tokens, business numbers or passwords.
- Local PostgreSQL-compatible PGlite data is in ignored `data/`. Use a single process at a time; stop the app before local migration/CLI jobs. For concurrent app and cron processes, use PostgreSQL.
- Use `MAWD_DATABASE_URL`, never pick up the host's generic `DATABASE_URL`.
- Before delivery run `npm run check`, `npm run build`, and HTTP smoke against a running local app when relevant.
- Keep API keys empty by default and external integrations off. No external emails, cloud provisioning or public deployment as part of routine local checks.
- Preserve user-owned documents. Keep implementation notes and remaining verification gates in `docs/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
