# AI-NOTES — read this first (for any AI or developer continuing this project)

Owner: Danial (architect, construction project manager). Works on an iPad (Safari) and Windows (Chrome).
Talks in Persian; reply in English is fine. **Rule: after every working session, update this file with what changed,
the design decisions and anything that speeds up the next session.**

## What this repo is
- AIDE · Executive Desk — secretary / CEO calendar desk. Static site (GitHub Pages) + Cloudflare Worker API
  `aide-api` (D1 database). Live: https://danialmor.github.io/aide/
- A **copy** of this repo lives in `danialmor/VERTEX` at `VERTEX/aide/`, synced by the VERTEX workflow
  `.github/workflows/sync-aide.yml` (every 5 min, or run "Sync Aide copy" by hand). Edit here, review in the VERTEX copy.
- In the VERTEX copy there is **no Aide login page**: people sign in on the VERTEX control panel (`VERTEX/admin/`);
  it signs them into Aide (`aideSso` in VERTEX `admin/index.html`, token stored as `localStorage['aide.tok']`).
  The standalone site keeps its own login. Session token is kept in localStorage because the API's cookie is third-party.

## Working method the owner wants
- Go **one template / one change at a time**; show it, wait for approval, then the next.
- Review happens in a Claude **artifact preview** (copy of the site with the API stubbed in-page; nothing is saved).
  Changes go to GitHub `main` (live) **only when the owner says «آپدیت کن»**. Until then work sits on branch
  `review/template-framing`.
- Design language is **English** (base); Persian is a layer applied at the end (Settings → Language: فارسی).
  Design in Gregorian first; Shamsi and other calendars are added at the end.
- Finger-friendly: touch targets ≥ 44px.

## Layout standard (approved)
- Reference = the **Roadmap** tab framing: content ~26px from the menu, ~32px from the right edge, 24px top/bottom,
  the main card fills the page height; small templates (no big card) are centred.
- No page title/description/top bar on tabs, no outer frame around the content area.
- **Navigation is a top bar** (from the owner's "Talmo" video): brand left · one rounded pill with all sections
  (scrolls sideways), active section = filled dark pill · search pill · icon circles on the right. CSS block
  "Top navigation" in `index.html` (desktop ≥ 821px; phones keep the bottom tab bar).

## Templates (Moxen) — `templates/<slug>/`
- 15 date/time templates run unchanged inside an iframe per tab (`js/template-frames.js`, tab ids `tpl-<slug>`).
  Tab names English; Persian names come from the interface dictionary (`/* template tabs */` in lang-dict).
- `templates/fa.js` is the bridge loaded by every template: (1) fit into AIDE — transparent page backdrops,
  decorative blobs hidden, dark full-page backdrops kept as cards, layout standard above; (2) translation
  Spanish → English (base) or → Persian when the desk language is fa; (3) theme bridge `MAP` — maps a template's
  own CSS variables to the site theme tokens `--t-*` (done: `lunario`; add one template at a time).
- Removed on purpose: "Time tools" combined tab (owner rejected), Layouts tab, the old rebuilt template tabs.
- Known leftovers: a few Spanish strings (Time dial sample text, Repeat-rule name, Year-to-day month names).

## Themes
- `A.THEMES` in `index.html`; 12 themes were added from the Moxen templates (Convite, Época, Esfera, Estadía,
  Franjas, Itinerario, Lunario, Parangón, Puntual, Rueda, Solape, Vencimientos).

## Release checklist
- Bump `VERSION` in `sw.js`; bump `?v=` on changed scripts in `index.html` and `fa.js?v=` in template pages.
- Push to `main`, then run "Sync Aide copy" in danialmor/VERTEX Actions (or wait ~5–20 min).

## 2026-11-22 (later)
- Talmo theme is the approved default (light `talmo`, dark `talmo-night`); other themes selectable in Themes.
- Menu layout setting (Themes page → "Menu layout"): `top` (default, Talmo top bar) or `side` (previous side menu);
  stored as `settings.navLayout`, applied as `html[data-nav]`.
- Top bar round buttons: theme switch, Requests bell, Themes, Users (admin only), Settings, profile, lock, language, sign-out, New.
- Templates: only the main accent, neutrals and shadows follow the theme; decorative colours stay. Shamsi conversion in
  `templates/fa.js` (section 4) when `calSystem === 'jalali'`; day grids of Monthly calendar / Date picker / Book a time
  still need per-template conversion.
- Page titles hidden on: repeats, roadmap, tpl-lunario, tpl-epoca, tpl-turno, tpl-estadia, tpl-itinerario, tpl-recurrencia, tpl-convite.
- CEO view (step 3): `ceo.html` = read-only page for the CEO, opened by a private link `ceo.html#k=<48-hex token>` (no login).
  Worker endpoints: `POST/DELETE/GET /api/ceo-link` (secretary creates/revokes; stored in `system_settings` as
  `ceolink:<sha256(token)>` → workspace owner) and `GET /api/ceo/:token` (events, open tasks, name, calSystem, lang).
  Secretary tab `ceo-view` (`js/ceo-view.js`) creates/copies/revokes the link and previews the page.
  **Needs the updated `cloudflare/worker.js` deployed to the `aide-api` Worker.**
- AI (step 4): `js/ai-bridge.js` loads the VERTEX assistant (`shared/ai/ai.js`) and sets `window.VX_CTX` with the desk's events, tasks, requests and people.
- Team (step 5): `js/team.js` tab `team`: members of the VERTEX subscription (hub `GET /team/members`), per-member upcoming events (`event.for`), reminders (`task.forCode`), meetings and notices sent with hub `POST /notify`. VERTEX shows them in a bell on every platform (`shared/notify.js`, loaded by auth.js).
- Lock = flip clock: `js/flipclock.js` intercepts the Lock buttons and shows a full-screen flip clock (time, Shamsi/Gregorian date, next meeting); tap to return, no sign-out.

## 2026-11-22 — Brand "A" menu (top bar)
- In top-bar mode, Settings, Themes, language (EN/فا) and Sign out are hidden from the bar and shown in a vertical drop-down under the brand "A" (`.tb-drop`, script near end of index.html). Side-menu mode is unchanged.
- Pending (owner request): secretary keeps this full calendar; other users get an independent calendar per platform in their own desk; secretary can pick any user to view their work calendar.

## 2026-11-22 — Original FlipClock
- Lock now shows the owner's original FlipClock (flipclock/, from FlipClock-main.zip by imvbh) in a full-screen iframe. Sidebar, external icon fonts and social links removed; ✕ button posts `aide-flip-close` to return. Double-tap = full screen (original behaviour).
