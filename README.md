# Aide · Executive Desk

A private, installable web app for executive assistants: calendars (day, 3-day, week, month, year, agenda), visitor and meeting requests, visiting hours, tasks, notebook, timers and world clocks. English UI, phone and desktop layouts. Pure HTML/CSS/JS, no build step, no dependencies.

Design language inspired by Moxen's free resources (moxen.cl/recursos). All code in this repository is original.

## Publish on GitHub Pages (works from an iPad browser)
1. github.com → **New repository** → name it `aide` → **Public** (free Pages needs public) → Create.
2. **Add file → Upload files**: drag the *contents* of this folder (index.html, sw.js, manifest.webmanifest, `css/`, `js/`, `icons/`, `.nojekyll`) → **Commit changes**.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `/ (root)` → Save.**
4. After about a minute the site is live at `https://YOUR-NAME.github.io/aide/`.
5. Phone: open the link in Safari → Share → **Add to Home Screen**.

Prefer a private repo? Use Cloudflare Pages or Netlify (free) connected to it.

## Security — please read
- No server exists, so the login is a **lock on local data**: everything is encrypted in the browser (AES-GCM 256, key from your password via PBKDF2-SHA256, 310,000 rounds).
- **A forgotten password cannot be recovered.** Use Settings → Backup regularly.
- Data lives per browser/device. Phone and desktop do **not** sync; move data with the backup file (Settings → Backup, then "Restore backup file" on the login screen). Automatic sync would need a backend (e.g. Supabase) later.

## Releasing updates
Change `VERSION` in `sw.js` each time you publish so phones fetch the new files.

## Shortcuts
Ctrl/⌘+K search · N new event · T today · ←/→ navigate · focused event: arrows move, Shift+↑↓ resize, Delete removes.
