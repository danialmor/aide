# AIDE online accounts — implementation branch

This branch adds a first server-side account API foundation for AIDE. It does not replace the current UI yet, and it does not change the production `main` branch.

## What is included

- `cloudflare/worker.js`: Cloudflare Worker API for free registration, login/logout, profile updates, role-protected administrator endpoints, first-user stats, and audit events.
- `cloudflare/schema.sql`: Cloudflare D1 schema.
- `cloudflare/wrangler.toml.example`: deployment binding example.
- `cloudflare/SETUP.md`: deployment and bootstrap instructions.

## Important current-state finding

The existing AIDE is a static GitHub Pages app. Its current vault stores the encrypted desk data in the current browser's local storage and IndexedDB; it does not provide a central online user directory. Existing client-side admin/manager roles are UI conveniences, not server-enforced permissions. This new API is a separate foundation and must be integrated into the sign-in/profile UI before users can use it end-to-end.

## Security model

- Public registration always creates role `user`; the client cannot request a privileged role.
- The first public registrant is a normal user, not an administrator.
- A one-time bootstrap secret initializes the separate `system_admin` account.
- Administrator APIs require a valid server-side session and role check; unauthorized admin endpoints return 404.
- System-admin accounts are excluded from the public/admin user directory and first-user counts.
- Session tokens are random, only their SHA-256 hashes are stored in D1, and cookies are HttpOnly/Secure/SameSite=Strict.
- Passwords are derived with PBKDF2-SHA-256 and unique random salts.
- CEO promotion is only available to the system administrator.
- This makes the admin account hidden from the app's user-facing interface; it does not guarantee invisibility to infrastructure owners or someone with access to Cloudflare/GitHub deployment logs.

## Not yet done

The API is not deployed and is not yet wired into `index.html`. Do not treat the current production site as having online registration until the remaining integration and deployment steps are completed.
