# AIDE online persistence and data-safety plan

## Current architecture

- Static frontend: GitHub Pages, index.html.
- API: Cloudflare Worker aide-api, source cloudflare/worker.js.
- Database: Cloudflare D1 aide-online, bound as DB.
- Workspace JSON: system_settings keys beginning workspace:.
- Per-account preferences: system_settings keys beginning account_preferences:.
- Accounts/profiles/sessions/audit: users, profiles, sessions, audit_log.

## Data-safety controls

1. Do not automatically clear localStorage, sessionStorage, IndexedDB, or browser caches during online login. Older local AIDE data may be the only copy of older records.
2. Queue workspace and settings writes separately to preserve their ordering.
3. Use SHA-256 content revisions on GET and compare-and-swap writes on PUT. Stale snapshots receive HTTP 409 rather than replacing newer content.
4. Three-way merge changes made to different records/fields; pause and provide a downloadable recovery archive when edits conflict.
5. Show explicit save states. A failed save must never be presented as successful.
6. Locking the desk must wait for pending saves and be cancelled if the latest online state cannot be confirmed.
7. Maintain a D1 Time Travel bookmark and a tested export/recovery path before production maintenance.

## Recovery and operations

- AIDE's conflict/retry dialogs provide a recovery JSON. It can include workspace records and settings in readable JSON; store it securely.
- An encrypted legacy browser archive retains old local vault bytes but is not automatically imported into the current online database. Do not clear old browser storage until that archive is safely stored and its contents have been reconciled.
- Verify changes from two browser sessions before considering a sync release complete.
- If a deployment fails, restore the previous Worker version; do not restore the D1 database unless actual database contents need rollback.

## Verification status

- D1 database and live application tables have been read-only inspected; valid JSON was observed in stored workspace/preferences rows.
- A D1 Time Travel bookmark and SQL export were created before sync-safety code changes.
- Local static syntax checks and merge-algorithm test cases are run before release.
- A full browser test with the user's authenticated account is not available from the repository connector, so a real user save/reload test remains a required release check.
