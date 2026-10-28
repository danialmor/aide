const COOKIE = "__Host-aide_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function randomHex(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), x => parseInt(x, 16));
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, 256);
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}
function setCookie(token, remember = true) {
  const persistence = remember ? `; Max-Age=${SESSION_DAYS * 86400}` : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None${persistence}`;
}
function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    // Allow the production GitHub Pages host and HTTPS GitHub/Cloudflare Pages
    // deployments used for testing this same frontend on other devices.
    return host === "danialmor.github.io" ||
      host.endsWith(".github.io") ||
      host === "aide.pages.dev" ||
      host.endsWith(".aide.pages.dev");
  } catch {
    return false;
  }
}
async function currentUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer ([A-Fa-f0-9]+)$/);
  const token = bearer ? bearer[1] : cookieValue(request, COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.role, u.is_admin, u.created_at, u.owner_id, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?"
  ).bind(tokenHash, Date.now()).first();
  if (!row) return null;
  const effectiveRole = row.role === "system_admin" ? "system_admin" : (row.is_admin || (row.role === "user" && !row.owner_id) ? "admin" : row.role);
  return { id: row.id, username: row.username, role: effectiveRole, createdAt: row.created_at, ownerId: row.owner_id || null };
}
function requireRole(user, roles) {
  return !!user && roles.includes(user.role);
}
async function audit(env, actorId, action, targetId = null, detail = "") {
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorId, action, targetId, detail.slice(0, 500), Date.now()).run();
}
async function bodyJson(request) {
  try { return await request.json(); } catch { return null; }
}
function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{3,32}$/.test(value);
}
function validPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}
async function createUser(env, { username, password, role = "user", displayName = "", title = "", bio = "", ownerId = null }) {
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  const id = crypto.randomUUID();
  const now = Date.now();
  const storedRole = role === "admin" ? "user" : role;
  const isAdmin = role === "admin" ? 1 : 0;
  await env.DB.prepare("INSERT INTO users (id, username, password_salt, password_hash, role, created_at, owner_id, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, username.toLowerCase(), salt, hash, storedRole, now, ownerId, isAdmin).run();
  await env.DB.prepare("INSERT INTO profiles (user_id, display_name, title, bio, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, String(displayName).slice(0, 100), String(title).slice(0, 100), String(bio).slice(0, 1000), now).run();
  return { id, username: username.toLowerCase(), role, createdAt: now };
}
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

  // CORS preflight must be answered even if the database binding is temporarily
  // unavailable; otherwise browsers hide the useful server response as "Failed to fetch".
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 503);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !allowedOrigin(request, env)) {
    return json({ error: "Origin not allowed." }, 403);
  }

  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "AIDE API", version: 1 });
  }

  if (path === "/api/register" && request.method === "POST") {
    const input = await bodyJson(request);
    if (!input || !validUsername(input.username) || !validPassword(input.password)) {
      return json({ error: "Username must be 3–32 letters/numbers/._- and password must be 8–128 characters." }, 400);
    }
    const username = input.username.toLowerCase();
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
    if (existing) return json({ error: "This username is already registered." }, 409);
    try {
      const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();
      const role = Number(count?.total || 0) === 0 ? "system_admin" : "admin";
      const user = await createUser(env, { username, password: input.password, role, displayName: input.displayName || username, title: input.title || "", bio: input.bio || "", ownerId: null });
      await audit(env, user.id, "user.registered", user.id);
      const remember = input.rememberMe !== false;
      const token = randomHex(32);
      const expires = Date.now() + (remember ? SESSION_DAYS * 86400000 : 12 * 60 * 60 * 1000);
      await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), user.id, await sha256(token), Date.now(), expires).run();
      return json({ token, user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt }, profile: { displayName: input.displayName || username, title: input.title || "", bio: input.bio || "" } }, 201, { "set-cookie": setCookie(token, remember) });
    } catch (e) {
      if (String(e).includes("UNIQUE")) return json({ error: "This username is already registered." }, 409);
      throw e;
    }
  }

  if (path === "/api/login" && request.method === "POST") {
    const input = await bodyJson(request);
    if (!input || typeof input.username !== "string" || typeof input.password !== "string") return json({ error: "Username and password are required." }, 400);
    const row = await env.DB.prepare("SELECT id, username, password_salt, password_hash, role, is_admin, owner_id, created_at FROM users WHERE username=?")
      .bind(input.username.toLowerCase()).first();
    if (!row || await passwordHash(input.password, row.password_salt) !== row.password_hash) {
      return json({ error: "Invalid username or password." }, 401);
    }
    const remember = input.rememberMe === true;
    const token = randomHex(32), now = Date.now(), expires = now + (remember ? SESSION_DAYS * 86400000 : 12 * 60 * 60 * 1000);
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), row.id, await sha256(token), now, expires).run();
    await audit(env, row.id, "user.login", row.id);
    const effectiveRole = row.role === "system_admin" ? "system_admin" : (row.is_admin || (row.role === "user" && !row.owner_id) ? "admin" : row.role);
    return json({ token, user: { id: row.id, username: row.username, role: effectiveRole, createdAt: row.created_at } }, 200, { "set-cookie": setCookie(token, remember) });
  }

  if (path === "/api/logout" && request.method === "POST") {
    const auth = request.headers.get("Authorization") || "";
    const bearer = auth.match(/^Bearer ([A-Fa-f0-9]+)$/);
    const token = bearer ? bearer[1] : cookieValue(request, COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }

  if (path === "/api/me" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ user: null }, 200);
    const profile = await env.DB.prepare("SELECT display_name, title, bio, updated_at FROM profiles WHERE user_id=?").bind(user.id).first();
    return json({ user, profile: profile ? { displayName: profile.display_name, title: profile.title, bio: profile.bio, updatedAt: profile.updated_at } : null });
  }

  if (path === "/api/profile" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const input = await bodyJson(request);
    if (!input) return json({ error: "Invalid JSON." }, 400);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO profiles (user_id, display_name, title, bio, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, title=excluded.title, bio=excluded.bio, updated_at=excluded.updated_at")
      .bind(user.id, String(input.displayName || "").slice(0, 100), String(input.title || "").slice(0, 100), String(input.bio || "").slice(0, 1000), now).run();
    await audit(env, user.id, "profile.updated", user.id);
    return json({ ok: true });
  }

  if (path === "/api/preferences" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const key = "account_preferences:" + user.id;
    const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
    if (!row) return json({ preferences: {}, revision: null });
    try { return json({ preferences: JSON.parse(row.value), revision: await sha256(row.value) }); }
    catch { return json({ error: "Stored account preferences are invalid." }, 500); }
  }

  if (path === "/api/preferences" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const input = await bodyJson(request);
    if (!input || !input.preferences || typeof input.preferences !== "object" || Array.isArray(input.preferences)) {
      return json({ error: "An account preferences object is required." }, 400);
    }
    const value = JSON.stringify(input.preferences);
    if (value.length > 100000) return json({ error: "Account preferences exceed the 100 KB limit." }, 413);
    const key = "account_preferences:" + user.id;
    const current = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
    if (current) {
      const currentRevision = await sha256(current.value);
      // Safe idempotent compatibility for old clients that flush unchanged settings without a revision.
      if (value === current.value) return json({ ok: true, unchanged: true, savedAt: Date.now(), bytes: value.length, revision: currentRevision });
      if (typeof input.revision !== "string") {
        const recoveryKey = "legacy_recovery:preferences:" + user.id + ":" + await sha256(value);
        const recoveryValue = JSON.stringify({
          format: "AIDE legacy preference recovery", version: 1, kind: "preferences",
          capturedAt: Date.now(), userId: user.id, serverRevision: currentRevision,
          preferences: input.preferences
        });
        await env.DB.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind(recoveryKey, recoveryValue).run();
        await audit(env, user.id, "account.legacy_recovery_captured", user.id, "bytes=" + value.length);
        return json({ error: "This older client cannot safely replace the latest account settings. Its submitted settings were preserved in recovery; reload the application before editing further.", revision: currentRevision, conflict: true, recoveryCaptured: true }, 409);
      }
      if (input.revision !== currentRevision) {
        return json({ error: "Account settings changed on another device. Reload or merge before saving.", revision: currentRevision, conflict: true }, 409);
      }
      const write = await env.DB.prepare("UPDATE system_settings SET value=? WHERE key=? AND value=?").bind(value, key, current.value).run();
      if (Number(write.meta?.changes || 0) !== 1) {
        const latest = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
        return json({ error: "Concurrent settings update detected.", revision: latest ? await sha256(latest.value) : null, conflict: true }, 409);
      }
    } else {
      const write = await env.DB.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING").bind(key, value).run();
      if (Number(write.meta?.changes || 0) !== 1) {
        const latest = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
        return json({ error: "Settings were initialized on another device.", revision: latest ? await sha256(latest.value) : null, conflict: true }, 409);
      }
    }
    const revision = await sha256(value);
    await audit(env, user.id, "account.preferences_saved", user.id, "bytes=" + value.length);
    return json({ ok: true, savedAt: Date.now(), bytes: value.length, revision });
  }

  if (path === "/api/recoveries" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const includeReviewed = url.searchParams.get("all") === "1";
    const workspaceOwner = user.role === "user" || user.role === "ceo" ? (user.ownerId || user.id) : user.id;
    const workspacePrefix = "legacy_recovery:workspace:" + workspaceOwner + ":";
    const preferencesPrefix = "legacy_recovery:preferences:" + user.id + ":";
    const rows = await env.DB.prepare(
      "SELECT key, value FROM system_settings WHERE (substr(key, 1, ?) = ?) OR (substr(key, 1, ?) = ?) LIMIT 100"
    ).bind(workspacePrefix.length, workspacePrefix, preferencesPrefix.length, preferencesPrefix).all();
    const recoveries = [];
    for (const row of rows.results || []) {
      try {
        const record = JSON.parse(row.value);
        if (!includeReviewed && record.acknowledgedAt) continue;
        recoveries.push({ id: row.key, ...record });
      } catch (_) {
        // Leave malformed records in place rather than deleting them.
      }
    }
    recoveries.sort((a, b) => Number(b.capturedAt || 0) - Number(a.capturedAt || 0));
    return json({ recoveries, count: recoveries.length });
  }

  if (path === "/api/recoveries/ack" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const workspaceOwner = user.role === "user" || user.role === "ceo" ? (user.ownerId || user.id) : user.id;
    const workspacePrefix = "legacy_recovery:workspace:" + workspaceOwner + ":";
    const preferencesPrefix = "legacy_recovery:preferences:" + user.id + ":";
    const input = await bodyJson(request);
    const ids = Array.isArray(input?.ids) ? [...new Set(input.ids.filter(x => typeof x === "string"))].slice(0, 100) : [];
    let acknowledged = 0;
    for (const id of ids) {
      if (!id.startsWith(workspacePrefix) && !id.startsWith(preferencesPrefix)) continue;
      const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(id).first();
      if (!row) continue;
      let record;
      try { record = JSON.parse(row.value); } catch (_) { continue; }
      if (record.acknowledgedAt) continue;
      record.acknowledgedAt = Date.now();
      const marked = await env.DB.prepare("UPDATE system_settings SET value=? WHERE key=? AND value=?")
        .bind(JSON.stringify(record), id, row.value).run();
      acknowledged += Number(marked.meta?.changes || 0);
    }
    if (acknowledged) await audit(env, user.id, "account.recovery_records_acknowledged", user.id, "count=" + acknowledged);
    return json({ ok: true, acknowledged, retained: true });
  }

  if (path === "/api/data" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const workspaceOwner = user.role === "user" || user.role === "ceo" ? (user.ownerId || user.id) : user.id;
    const key = "workspace:" + workspaceOwner;
    const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
    if (!row) return json({ data: null, revision: null });
    try { return json({ data: JSON.parse(row.value), revision: await sha256(row.value) }); }
    catch { return json({ error: "Stored workspace data is invalid." }, 500); }
  }

  if (path === "/api/data" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const input = await bodyJson(request);
    if (!input || !input.data || typeof input.data !== "object" || Array.isArray(input.data)) return json({ error: "A workspace data object is required." }, 400);
    const value = JSON.stringify(input.data);
    if (value.length > 900000) return json({ error: "Workspace data exceeds the 900 KB limit." }, 413);

    const workspaceOwner = user.role === "user" || user.role === "ceo" ? (user.ownerId || user.id) : user.id;
    const key = "workspace:" + workspaceOwner;
    const current = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
    let writeResult;

    // Optimistic concurrency control prevents an older tab/device from replacing
    // a newer complete workspace snapshot. Legacy clients without a revision may
    // initialize an empty workspace, but cannot overwrite an existing one.
    if (current) {
      const currentRevision = await sha256(current.value);
      // A byte-identical old-client flush is a no-op, not a conflict; changing payloads still require a revision.
      if (value === current.value) return json({ ok: true, unchanged: true, savedAt: Date.now(), bytes: value.length, revision: currentRevision });
      if (typeof input.revision !== "string") {
        const recoveryKey = "legacy_recovery:workspace:" + workspaceOwner + ":" + await sha256(value);
        const recoveryValue = JSON.stringify({
          format: "AIDE legacy workspace recovery", version: 1, kind: "workspace",
          capturedAt: Date.now(), userId: user.id, workspaceOwner, serverRevision: currentRevision,
          data: input.data
        });
        await env.DB.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind(recoveryKey, recoveryValue).run();
        await audit(env, user.id, "workspace.legacy_recovery_captured", user.id, "bytes=" + value.length);
        return json({
          error: "This older client cannot safely replace newer online data. Its submitted workspace was preserved in recovery; reload the application before editing further.",
          revision: currentRevision,
          conflict: true,
          recoveryCaptured: true
        }, 409);
      }
      if (input.revision !== currentRevision) {
        return json({
          error: "This workspace changed after it was loaded. The update was blocked to protect newer data. Reload or merge the pending edits before saving.",
          revision: currentRevision,
          conflict: true
        }, 409);
      }
      writeResult = await env.DB.prepare("UPDATE system_settings SET value=? WHERE key=? AND value=?")
        .bind(value, key, current.value).run();
      if (Number(writeResult.meta?.changes || 0) !== 1) {
        const latest = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
        return json({
          error: "Another update reached this workspace at the same time. No data was overwritten; reload and reconcile the pending changes.",
          revision: latest ? await sha256(latest.value) : null,
          conflict: true
        }, 409);
      }
    } else {
      writeResult = await env.DB.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING")
        .bind(key, value).run();
      if (Number(writeResult.meta?.changes || 0) !== 1) {
        const latest = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind(key).first();
        return json({
          error: "Another device initialized this workspace at the same time. No data was overwritten; reload before saving.",
          revision: latest ? await sha256(latest.value) : null,
          conflict: true
        }, 409);
      }
    }

    const revision = await sha256(value);
    await audit(env, user.id, "workspace.saved", user.id, "bytes=" + value.length + ";revision=" + revision.slice(0, 12));
    return json({ ok: true, savedAt: Date.now(), bytes: value.length, revision });
  }

  if (path === "/api/admin/bootstrap" && request.method === "POST") {
    if (!env.ADMIN_BOOTSTRAP_KEY) return json({ error: "Bootstrap is not configured." }, 503);
    const input = await bodyJson(request);
    if (!input || typeof input.bootstrapKey !== "string" || input.bootstrapKey !== env.ADMIN_BOOTSTRAP_KEY) return json({ error: "Not authorized." }, 403);
    if (!validUsername(input.username) || !validPassword(input.password)) return json({ error: "Provide a valid username and a password of at least 10 characters." }, 400);
    const used = await env.DB.prepare("SELECT value FROM system_settings WHERE key='admin_bootstrap_used'").first();
    if (used) return json({ error: "System administrator has already been initialized." }, 409);
    const username = input.username.toLowerCase();
    const existing = await env.DB.prepare("SELECT id, username, created_at FROM users WHERE username=?").bind(username).first();
    let admin;
    if (existing) {
      // Secure one-time bootstrap may promote the existing account without resetting its password.
      await env.DB.prepare("UPDATE users SET role='system_admin', is_admin=0 WHERE id=?").bind(existing.id).run();
      admin = { id: existing.id, username: existing.username, createdAt: existing.created_at };
    } else {
      admin = await createUser(env, { username, password: input.password, role: "system_admin", displayName: "", title: "", bio: "" });
    }
    await env.DB.prepare("INSERT INTO system_settings (key, value) VALUES ('admin_bootstrap_used', '1')").run();
    await audit(env, admin.id, "system.admin_initialized", admin.id);
    const token = randomHex(32), now = Date.now();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), admin.id, await sha256(token), now, now + SESSION_DAYS * 86400000).run();
    return json({ user: { id: admin.id, username: admin.username, role: admin.role, createdAt: admin.createdAt } }, 201, { "set-cookie": setCookie(token) });
  }

  if (path === "/api/admin/stats" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin"])) return json({ error: "Not found." }, 404);
    const counts = await env.DB.prepare("SELECT COUNT(*) AS total, MIN(created_at) AS first_registered_at FROM users WHERE role != 'system_admin'").first();
    const first = await env.DB.prepare("SELECT u.id, u.username, u.created_at, p.display_name FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.role != 'system_admin' ORDER BY u.created_at ASC LIMIT 1").first();
    const roleCounts = await env.DB.prepare("SELECT role, COUNT(*) AS count FROM users WHERE role != 'system_admin' GROUP BY role").all();
    return json({ totalUsers: counts?.total || 0, firstRegisteredAt: counts?.first_registered_at || null, firstUser: first ? { id: first.id, username: first.username, displayName: first.display_name, createdAt: first.created_at } : null, roles: roleCounts.results || [] });
  }

  if (path === "/api/admin/users" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin", "admin"])) return json({ error: "Not found." }, 404);
    const input = await bodyJson(request);
    // Accept both the current API role (ceo) and the older UI alias (manager).
    // This keeps CEO creation working when a browser still has a cached frontend.
    const requestedRole = input && input.role === "manager" ? "ceo" : (input && input.role || "user");
    const allowedRoles = user.role === "system_admin" ? ["admin", "user", "ceo"] : ["user", "ceo"];
    if (!input || !validUsername(input.username) || !allowedRoles.includes(requestedRole)) {
      return json({ error: "نقش یا نام کاربری معتبر نیست. برای مدیرعامل، نقش CEO را انتخاب کنید." }, 400);
    }
    const username = input.username.toLowerCase();
    const role = requestedRole;
    if (role === "ceo") {
      // CEO accounts belong to the creator's workspace, including when created by system_admin.
      const ceoCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE owner_id=? AND role='ceo'").bind(user.id).first();
      if (Number(ceoCount?.total || 0) >= 2) return json({ error: "This workspace already has two CEO accounts. Remove one before creating another." }, 400);
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
    if (existing) return json({ error: "This username is already registered." }, 409);
    const suppliedPassword = validPassword(input.password);
    if (input.password && !suppliedPassword) {
      return json({ error: "Password must be 8–128 characters, or leave it blank to generate a secure temporary password." }, 400);
    }
    let temporaryPassword = suppliedPassword ? input.password : null;
    if (!temporaryPassword) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      temporaryPassword = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
    }
    const ownerId = role === "ceo" ? user.id : (user.role === "system_admin" ? null : user.id);
    const created = await createUser(env, { username, password: temporaryPassword, role, displayName: String(input.displayName || username).slice(0, 100), title: "", bio: "", ownerId });
    await audit(env, user.id, "user.created_by_admin", created.id, created.role);
    return json({ user: created, ...(!suppliedPassword ? { temporaryPassword } : {}) }, 201);
  }

  if (path === "/api/admin/users" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin", "admin"])) return json({ error: "Not found." }, 404);
    const sql = user.role === "system_admin"
      ? "SELECT u.id, u.username, CASE WHEN u.is_admin=1 THEN 'admin' ELSE u.role END AS role, u.created_at, u.owner_id, p.display_name, p.title, p.bio, p.updated_at FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.role != 'system_admin' ORDER BY u.created_at DESC LIMIT 1000"
      : "SELECT u.id, u.username, CASE WHEN u.is_admin=1 THEN 'admin' ELSE u.role END AS role, u.created_at, u.owner_id, p.display_name, p.title, p.bio, p.updated_at FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.owner_id=? ORDER BY u.created_at DESC LIMIT 1000";
    const result = user.role === "system_admin" ? await env.DB.prepare(sql).all() : await env.DB.prepare(sql).bind(user.id).all();
    return json({ users: (result.results || []).map(r => ({ id: r.id, username: r.username, role: r.role, createdAt: r.created_at, ownerId: r.owner_id, profile: { displayName: r.display_name, title: r.title, bio: r.bio, updatedAt: r.updated_at } })) });
  }

  if (path === "/api/admin/users/role" && request.method === "PATCH") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin", "admin"])) return json({ error: "Not found." }, 404);
    const input = await bodyJson(request);
    const allowedRoles = user.role === "system_admin" ? ["admin", "user", "ceo"] : ["user", "ceo"];
    if (!input || typeof input.userId !== "string" || !allowedRoles.includes(input.role)) return json({ error: "Invalid role change." }, 400);
    const target = user.role === "system_admin"
      ? await env.DB.prepare("SELECT id, role FROM users WHERE id=? AND role != 'system_admin'").bind(input.userId).first()
      : await env.DB.prepare("SELECT id, role FROM users WHERE id=? AND owner_id=?").bind(input.userId, user.id).first();
    if (!target) return json({ error: "User not found." }, 404);
    await env.DB.prepare("UPDATE users SET role=?, is_admin=? WHERE id=?").bind(input.role === "admin" ? "user" : input.role, input.role === "admin" ? 1 : 0, input.userId).run();
    await audit(env, user.id, "user.role_changed", input.userId, input.role);
    return json({ ok: true });
  }

  if (path === "/api/admin/audit" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin"])) return json({ error: "Not found." }, 404);
    const rows = await env.DB.prepare("SELECT id, actor_id, action, target_id, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
    return json({ events: rows.results || [] });
  }

  return json({ error: "Not found." }, 404);
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = {};
    if (origin && allowedOrigin(request, env)) {
      cors["access-control-allow-origin"] = origin;
      // The frontend uses Bearer tokens, not cross-origin cookies.
      cors["access-control-allow-methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      cors["access-control-allow-headers"] = "Content-Type, Authorization";
      cors["access-control-allow-credentials"] = "true";
      cors["access-control-max-age"] = "86400";
      cors["vary"] = "Origin";
    }
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error("AIDE API error", error);
      return json({ error: "The server could not complete the request. Please try again; if it continues, check the Cloudflare Worker logs." }, 500, cors);
    }
  }
};
