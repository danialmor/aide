# AIDE · Executive Desk

A private, installable web app for executive assistants: calendars, meeting and visitor requests, availability windows, tasks, notes, timers, themes and account settings. The interface is plain HTML/CSS/JavaScript and is hosted as a static site.

## Production architecture

- Frontend: GitHub Pages (index.html and static assets).
- API: Cloudflare Worker, aide-api.
- Database: Cloudflare D1, aide-online, binding DB.
- Workspace records: /api/data, stored as JSON under a workspace-owner key.
- Personal settings: /api/preferences, stored separately per account.
- Profiles and accounts: Cloudflare D1 tables users and profiles.

Workspace records and account preferences are stored server-side. They are not stored only in localStorage. The app sends changes to the API after a short debounce; the Settings page shows an online-save status. On a failed save, do not close or refresh the page before retrying or downloading the recovery backup offered by AIDE.

## Data safety and sync

- Workspace and preference writes are queued per browser session.
- Writes include revision checks. A stale tab/device must not silently replace a newer server snapshot.
- Non-overlapping changes can be merged. If two devices changed the same record or setting incompatibly, AIDE pauses the save and offers a recovery JSON download. Save that file before choosing to reload the current server copy.
- Locking the desk waits for the current online save. If the save cannot be confirmed, AIDE cancels the lock and shows the recovery action.
- The app does not automatically clear legacy localStorage/IndexedDB data. If older local AIDE data is detected, export the encrypted browser archive before doing any manual cleanup. That archive preserves old encrypted data; it is not automatically merged into the online workspace.
- A conflict recovery JSON contains workspace/settings data in readable JSON. Store it securely; it can include confidential calendar, contact, task and note content.
- Keep a separate D1 backup/Time Travel recovery point before schema changes or other database maintenance. Application-level conflict protection is not a substitute for database backups.

## Deployment notes

1. Publish the site from main / root using GitHub Pages.
2. Deploy cloudflare/worker.js as the aide-api Worker with the D1 binding DB pointing to the aide-online database ID in wrangler.toml.
3. Keep the Worker compatibility date and required environment bindings consistent with the deployed settings.
4. Bump VERSION in sw.js when shipping frontend changes so installed mobile clients request the new build.
5. After a release, hard-refresh the site (and reopen/reload an installed iOS/iPadOS app) before testing sync.

## Verification checklist

- Create or edit a test event and verify it remains after reload and login from a second device.
- Change a personal setting and verify it remains after reload.
- Keep two tabs open; make non-conflicting edits in both and check that both survive.
- Make conflicting edits to the same record; verify AIDE blocks the overwrite and offers a recovery file.
- With the network temporarily unavailable, verify the app reports failure and does not claim the change was saved.
- Confirm the latest Time Travel bookmark or SQL export before making changes to production data.

## Limitations

No browser-based system can guarantee zero data loss during a device crash, browser force-quit, or storage/network failure. This release is designed to make save state explicit, block stale overwrites, preserve legacy local storage and provide recovery exports rather than silently discard pending changes.


## Legacy-tab recovery

If an older AIDE tab submits a changed snapshot without a revision, the API now stores that submitted workspace or settings snapshot in a separate `legacy_recovery:` record and rejects the overwrite with HTTP 409. After signing into the updated app, the user is prompted to download a recovery archive and may mark the records as reviewed. Marking them reviewed hides the prompt but **does not delete the server-side recovery data**. Recovered snapshots are not automatically merged; compare them against the current online workspace to avoid duplicating or reintroducing stale values.

## Integrated calendar layouts

The in-app “قالب‌ها” page connects ten Moxen-inspired interaction patterns to actual AIDE sections rather than redistributing the original templates as a separate library: Anaquel (daily dashboard), Convite (requests), Época (year view), Lunario (month view), Parangón (agenda/range overview), Semana (week view), Solape (overlap review), Tregua (reminder/security settings), Turno (availability), and Vencimientos (tasks/deadlines). The implementations are adapted and localized for this application.

The Calendar toolbar now includes a quick Gregorian/Jalali switch. The selected calendar system is saved to the signed-in account's online preferences. Date displays retain both Shamsi and Gregorian context where useful. The existing day, 3-day, week, month, year and agenda views remain connected to the same events and Cloudflare-backed data.

Design inspiration attribution: Moxen, https://moxen.cl/recursos. The original downloaded resources include their own licenses and credits; only adapted, integrated application UI is used here.

