# AIDE online API setup (Cloudflare)

## Important: choose a same-site deployment

The current production frontend is on GitHub Pages. A Worker on a separate `workers.dev` hostname is a cross-site origin, and browsers may refuse to send its authentication cookies from the GitHub Pages site. For reliable cookie-based sessions, serve the frontend and API on the same site (recommended: a Cloudflare-hosted frontend with the API on that same origin, or a custom domain such as `aide.example.com` with the API on `api.aide.example.com`). Set `APP_ORIGIN` to the exact frontend origin. Do not consider online sign-in production-ready until this is resolved and tested in the target browsers.

## 1. Create D1 and apply schema

From the `cloudflare` directory, install Wrangler if needed and authenticate with Cloudflare:

```bash
npm install -g wrangler
wrangler login
wrangler d1 create aide-online
```

Copy the returned database ID into `wrangler.toml` based on `wrangler.toml.example`, set `APP_ORIGIN` to the actual frontend origin, then run:

```bash
wrangler d1 execute aide-online --remote --file=./schema.sql
```

## 2. Configure secrets and origin

```bash
wrangler secret put ADMIN_BOOTSTRAP_KEY
```

Use a long random value and keep it private. Do not commit it to GitHub. Confirm `APP_ORIGIN` exactly matches the deployed frontend origin. If the frontend later uses a custom domain, update this value.

## 3. Deploy API

```bash
wrangler deploy
```

Copy the deployed Worker URL. The frontend integration still needs to be completed and pointed to that URL before production use.

## 4. Initialize the hidden system administrator once

After deploying, send a POST request to `/api/admin/bootstrap` with JSON:

```json
{
  "bootstrapKey": "THE_SECRET_SET_IN_CLOUDFLARE",
  "username": "choose-a-private-admin-username",
  "password": "use-a-unique-long-password"
}
```

The first successful call initializes the system administrator and marks bootstrap as used. If the supplied username already exists in this D1 database, that account is promoted to `system_admin` and its current password is preserved. If it does not exist, a new `system_admin` account is created using the supplied password. This operation is one-time and requires the private `ADMIN_BOOTSTRAP_KEY`.

If the endpoint returns `503 Bootstrap is not configured`, the deployed Worker cannot read `ADMIN_BOOTSTRAP_KEY` in the environment handling that request. Add the secret to the correct Worker/environment and redeploy/retry; do not put the secret in source code or commit it to GitHub. If the account can log in on the website but does not exist in this D1 database, the website is authenticating against a different backend and this bootstrap will not promote that other account.

The secret and bootstrap endpoint must be treated as sensitive. Do not share the admin credentials with regular users or the CEO.

## API endpoints

- `POST /api/register` — public registration; creates a regular user and profile.
- `POST /api/login`, `POST /api/logout`
- `GET /api/me`, `PUT /api/profile`
- `GET /api/admin/stats` — system-admin only.
- `GET /api/admin/users` — system-admin only; excludes system-admin accounts.
- `PATCH /api/admin/users/role` — system-admin only; assigns `user` or `ceo`.
- `GET /api/admin/audit` — system-admin only.
- `GET /api/health`

## Before public launch

1. Integrate the API into AIDE's current sign-in/register/profile screens.
2. Test duplicate registrations, incorrect passwords, session expiry, profile edits and role checks.
3. Add rate limiting / abuse protection (for example, Cloudflare rate limiting or Turnstile).
4. Decide how to migrate existing local-only profiles. Current browser data cannot be automatically discovered from the server; users need an explicit migration/export/import workflow.
5. Configure backups and retention for D1.
