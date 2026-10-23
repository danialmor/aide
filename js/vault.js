/* Aide · vault — sign-in and encrypted storage.
   HONEST SECURITY NOTE: this site is static (GitHub Pages), so there is no
   server to check passwords. Instead your data is encrypted in the browser with
   AES-GCM 256, using a key derived from your password with PBKDF2-SHA256
   (310,000 rounds). Without the password the saved data is unreadable.
   The password cannot be recovered — keep a backup file (Settings → Backup). */
(function () {
  'use strict';
  const A = window.Aide, { h, $ } = A;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const KEY = 'aide.vault.', USERS = 'aide.users', FAIL = 'aide.fail', ITER = 310000;
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  let cur = null;

  const V = A.vault = {
    supported: !!(window.crypto && crypto.subtle),
    users: () => { try { return JSON.parse(localStorage.getItem(USERS) || '[]'); } catch (e) { return []; } },
    async derive(pw, salt, iter) {
      const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async seal(data) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cur.key, enc.encode(JSON.stringify(data)));
      localStorage.setItem(KEY + cur.user, JSON.stringify({ v: 1, u: cur.user, s: b64(cur.salt), i: cur.iter, iv: b64(iv), ct: b64(new Uint8Array(ct)), t: Date.now() }));
    },
    async create(user, pw, data) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      cur = { user, salt, iter: ITER, key: await V.derive(pw, salt, ITER) };
      await V.seal(data);
      const u = V.users(); if (!u.includes(user)) { u.push(user); localStorage.setItem(USERS, JSON.stringify(u)); }
    },
    async open(user, pw) {
      const raw = localStorage.getItem(KEY + user); if (!raw) throw new Error('No such account on this device.');
      const b = JSON.parse(raw), salt = unb64(b.s), key = await V.derive(pw, salt, b.i);
      let pt; try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(b.iv) }, key, unb64(b.ct)); } catch (e) { throw new Error('Wrong username or password.'); }
      cur = { user, salt, iter: b.i, key }; return JSON.parse(dec.decode(pt));
    },
    save: data => cur ? V.seal(data) : Promise.resolve(),
    async changePassword(oldPw, newPw) {
      const user = cur.user; await V.open(user, oldPw);   // proves the old password
      const salt = crypto.getRandomValues(new Uint8Array(16)); cur = { user, salt, iter: ITER, key: await V.derive(newPw, salt, ITER) };
      await V.seal(A.db.data);
    },
    user: () => cur && cur.user,
    exportBlob: () => localStorage.getItem(KEY + (cur ? cur.user : '')) || '',
    importBlob(text) { const b = JSON.parse(text); if (!b || b.v !== 1 || !b.u || !b.ct) throw new Error('This is not an Aide backup file.'); localStorage.setItem(KEY + b.u, text); const u = V.users(); if (!u.includes(b.u)) { u.push(b.u); localStorage.setItem(USERS, JSON.stringify(u)); } return b.u; },
    lock() { cur = null; A.db.data = null; },
    wipe() { if (cur) { localStorage.removeItem(KEY + cur.user); localStorage.setItem(USERS, JSON.stringify(V.users().filter(x => x !== cur.user))); } cur = null; A.db.data = null; },
  };

  /* brute-force slow-down: 3 free tries, then 2^n seconds (max 5 min) */
  const fail = { get() { try { return JSON.parse(localStorage.getItem(FAIL)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }, set(o) { localStorage.setItem(FAIL, JSON.stringify(o)); } };

  function strength(pw) {
    let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
    const bits = pw.length * Math.log2(pool || 1); let s = Math.min(1, bits / 70);
    if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui)/i.test(pw)) s = Math.min(s, .15);
    return { s, label: s < .35 ? 'Weak' : s < .6 ? 'Fair' : s < .85 ? 'Good' : 'Strong', bar: s < .35 ? 'var(--danger)' : s < .6 ? 'var(--b-travel)' : 'var(--b-visit)' };
  }

  /* ── the login screen ─────────────────────────────────────────────── */
  A.showLogin = function (msg) {
    const root = $('#login'); root.hidden = false; $('#app').hidden = true; root.replaceChildren();
    const users = V.users(); let mode = users.length ? 'in' : 'up';
    const draw = () => {
      const up = mode === 'up';
      const user = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, value: users.length === 1 && !up ? users[0] : '', placeholder: 'e.g. alex' });
      const pw = h('input', { type: up ? 'password' : 'password', autocomplete: up ? 'new-password' : 'current-password', required: true, placeholder: up ? 'At least 10 characters' : 'Your password' });
      const pw2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repeat password' });
      const eye = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Show password', onClick: () => { pw.type = pw.type === 'password' ? 'text' : 'password'; } }, A.ico('eye'));
      const meter = h('div', { class: 'meter', hidden: !up }, h('i')), mlabel = h('span', { class: 'note' });
      const sample = h('input', { type: 'checkbox', checked: true }), err = h('div', { class: 'warn', role: 'alert', hidden: true });
      const go = h('button', { class: 'btn primary', type: 'submit' }, up ? 'Create secure vault' : 'Unlock desk');
      pw.addEventListener('input', () => { if (!up) return; const r = strength(pw.value); meter.firstChild.style.setProperty('--s', r.s); meter.firstChild.style.setProperty('--bar', r.bar); mlabel.textContent = pw.value ? 'Strength: ' + r.label : ''; });
      const show = t => { err.textContent = t; err.hidden = !t; form.classList.remove('shake'); void form.offsetWidth; if (t) form.classList.add('shake'); };
      const form = h('form', { class: 'login-form', novalidate: true, onSubmit: async e => {
        e.preventDefault(); show('');
        const u = user.value.trim().toLowerCase(), p = pw.value;
        if (!V.supported) return show('This browser blocks encryption. Open the site over https:// (GitHub Pages) or localhost.');
        if (!u || !p) return show('Enter a username and password.');
        const f = fail.get(); if (!up && f.until > Date.now()) return show('Too many attempts. Try again in ' + Math.ceil((f.until - Date.now()) / 1000) + ' s.');
        go.disabled = true; go.textContent = 'Working…';
        try {
          if (up) {
            if (!/^[a-z0-9._-]{2,32}$/.test(u)) throw new Error('Username: 2–32 letters, numbers, dot, dash or underscore.');
            if (p.length < 10) throw new Error('Use at least 10 characters. A passphrase of 3–4 words works well.');
            if (p !== pw2.value) throw new Error('The two passwords do not match.');
            if (V.users().includes(u)) throw new Error('That username already exists on this device.');
            const data = sample.checked ? A.sample() : { settings: {} };
            await V.create(u, p, data); A.load(data);
          } else { const data = await V.open(u, p); A.load(data); fail.set({ n: 0, until: 0 }); }
          root.hidden = true; $('#app').hidden = false; A.start();
        } catch (ex) {
          if (!up) { const n = f.n + 1; fail.set({ n, until: n > 3 ? Date.now() + Math.min(300, Math.pow(2, n - 3)) * 1000 : 0 }); }
          show(ex.message || 'Something went wrong.'); go.disabled = false; go.textContent = up ? 'Create secure vault' : 'Unlock desk';
        }
      } },
        h('div', null, h('h1', null, up ? 'Create your desk' : 'Welcome back'), h('p', { class: 'muted' }, up ? 'One private vault for the schedule, notes and contacts.' : (msg || 'Sign in to open the executive desk.'))),
        A.field('Username', user), A.field('Password', h('div', { class: 'pw' }, pw, eye)),
        up ? [A.field('Repeat password', pw2), h('div', null, meter, mlabel), h('label', { class: 'row small' }, sample, h('span', null, 'Start with sample data so I can explore'))] : null,
        err, go,
        h('p', { class: 'note' }, up ? 'Your data is encrypted in this browser with your password. It never leaves this device, and the password cannot be recovered — keep a backup file.' : 'Data stays encrypted on this device.'),
        h('div', { class: 'row wrap' },
          users.length || up === false ? h('button', { type: 'button', class: 'btn sm', onClick: () => { mode = up ? 'in' : 'up'; draw(); } }, up ? 'I already have a vault' : 'Create a new vault') : null,
          h('label', { class: 'btn sm' }, 'Restore backup file', h('input', { type: 'file', accept: '.aide,.json,application/json', class: 'sr', onChange: async e => { const f = e.target.files[0]; if (!f) return; try { const name = V.importBlob(await f.text()); users.splice(0, users.length, ...V.users()); mode = 'in'; draw(); A.toast('Backup restored for “' + name + '”. Sign in with its password.'); } catch (ex) { show(ex.message); } } }))));
      root.replaceChildren(h('div', { class: 'login-card' },
        h('div', { class: 'login-art' },
          h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'A'), h('div', null, h('b', null, 'Aide'), h('small', null, 'Executive Desk'))),
          h('div', null, h('h2', null, 'Every meeting, visit and promise — in one calm place.'), h('p', null, 'Built for the person who runs the executive’s day.')),
          h('ul', null, h('li', null, 'Day, week, month and year calendars'), h('li', null, 'Visitor and meeting requests with ready replies'), h('li', null, 'Visiting hours, notes and meeting timers'), h('li', null, 'Works offline on phone and desktop'))),
        form));
      (up ? user : (users.length === 1 ? pw : user)).focus({ preventScroll: true });
    };
    draw();
  };
})();
