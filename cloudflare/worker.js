const COOKIE = "__Host-aide_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 310000;
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
function setCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_DAYS * 86400}`;
}
function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const expected = "https://danialmor.github.io";
  return origin === expected;
}
async function currentUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer ([A-Fa-f0-9]+)$/);
  const token = bearer ? bearer[1] : cookieValue(request, COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.role, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?"
  ).bind(tokenHash, Date.now()).first();
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
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
async function createUser(env, { username, password, role = "user", displayName = "", title = "", bio = "" }) {
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, username.toLowerCase(), salt, hash, role, now).run();
  await env.DB.prepare("INSERT INTO profiles (user_id, display_name, title, bio, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, String(displayName).slice(0, 100), String(title).slice(0, 100), String(bio).slice(0, 1000), now).run();
  return { id, username: username.toLowerCase(), role, createdAt: now };
}
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 503);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
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
      const role = Number(count?.total || 0) === 0 ? "system_admin" : "user";
      const user = await createUser(env, { username, password: input.password, role, displayName: input.displayName || username, title: input.title || "", bio: input.bio || "" });
      await audit(env, user.id, "user.registered", user.id);
      const token = randomHex(32);
      const expires = Date.now() + SESSION_DAYS * 86400000;
      await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), user.id, await sha256(token), Date.now(), expires).run();
      return json({ token, user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt }, profile: { displayName: input.displayName || username, title: input.title || "", bio: input.bio || "" } }, 201, { "set-cookie": setCookie(token) });
    } catch (e) {
      if (String(e).includes("UNIQUE")) return json({ error: "This username is already registered." }, 409);
      throw e;
    }
  }

  if (path === "/api/login" && request.method === "POST") {
    const input = await bodyJson(request);
    if (!input || typeof input.username !== "string" || typeof input.password !== "string") return json({ error: "Username and password are required." }, 400);
    const row = await env.DB.prepare("SELECT id, username, password_salt, password_hash, role, created_at FROM users WHERE username=?")
      .bind(input.username.toLowerCase()).first();
    if (!row || await passwordHash(input.password, row.password_salt) !== row.password_hash) {
      return json({ error: "Invalid username or password." }, 401);
    }
    const token = randomHex(32), now = Date.now(), expires = now + SESSION_DAYS * 86400000;
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), row.id, await sha256(token), now, expires).run();
    await audit(env, row.id, "user.login", row.id);
    return json({ token, user: { id: row.id, username: row.username, role: row.role, createdAt: row.created_at } }, 200, { "set-cookie": setCookie(token) });
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

  if (path === "/api/data" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key=?").bind("workspace:" + user.id).first();
    if (!row) return json({ data: null });
    try { return json({ data: JSON.parse(row.value) }); }
    catch { return json({ error: "Stored workspace data is invalid." }, 500); }
  }

  if (path === "/api/data" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const input = await bodyJson(request);
    if (!input || !input.data || typeof input.data !== "object" || Array.isArray(input.data)) return json({ error: "A workspace data object is required." }, 400);
    const value = JSON.stringify(input.data);
    if (value.length > 900000) return json({ error: "Workspace data exceeds the 900 KB limit." }, 413);
    await env.DB.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind("workspace:" + user.id, value).run();
    await audit(env, user.id, "workspace.saved", user.id, "bytes=" + value.length);
    return json({ ok: true, savedAt: Date.now(), bytes: value.length });
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
      await env.DB.prepare("UPDATE users SET role='system_admin' WHERE id=?").bind(existing.id).run();
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

  if (path === "/api/admin/users" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin"])) return json({ error: "Not found." }, 404);
    const result = await env.DB.prepare("SELECT u.id, u.username, u.role, u.created_at, p.display_name, p.title, p.bio, p.updated_at FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.role != 'system_admin' ORDER BY u.created_at DESC LIMIT 1000").all();
    return json({ users: (result.results || []).map(r => ({ id: r.id, username: r.username, role: r.role, createdAt: r.created_at, profile: { displayName: r.display_name, title: r.title, bio: r.bio, updatedAt: r.updated_at } })) });
  }

  if (path === "/api/admin/users/role" && request.method === "PATCH") {
    const user = await currentUser(request, env);
    if (!requireRole(user, ["system_admin"])) return json({ error: "Not found." }, 404);
    const input = await bodyJson(request);
    if (!input || typeof input.userId !== "string" || !["user", "ceo"].includes(input.role)) return json({ error: "Invalid role change." }, 400);
    const target = await env.DB.prepare("SELECT id, role FROM users WHERE id=? AND role != 'system_admin'").bind(input.userId).first();
    if (!target) return json({ error: "User not found." }, 404);
    await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(input.role, input.userId).run();
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
    const expected = "https://danialmor.github.io";
    const cors = {};
    if (origin === expected) {
      cors["access-control-allow-origin"] = expected;
      cors["access-control-allow-credentials"] = "true";
      cors["access-control-allow-methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      cors["access-control-allow-headers"] = "Content-Type, Authorization";
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
