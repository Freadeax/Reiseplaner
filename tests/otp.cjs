/* Anmeldung per E-Mail-Code (P0.7): cloud.js mit nachgebildetem Supabase-Client und der Konto-Bereich aus
   index.html mit den echten registrierten Handlern (DOM nur als Zeichenkette nachgebildet).
   Kein Browser- und kein Datenbanktest; der echte Ablauf mit lokalem Supabase steht in tests/e2e-cloud.cjs. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const cloudSrc = fs.readFileSync(__dirname + '/../cloud.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const appSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace("go(location.hash||'reisen',true);", '');

const apiErr = (msg, status, code) => Object.assign(new Error(msg), { name: 'AuthApiError', status, code });
const netErr = () => Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
const tick = () => new Promise(r => setImmediate(r));

/* Verhält sich in den geprüften Punkten wie der lokale Auth-Dienst (GoTrue v2.197, siehe Bericht):
   unbekannte Adresse + create_user=false → 422 otp_disabled; falscher/unbekannter/benutzter Code → 403 otp_expired;
   ein neuer Code ersetzt den alten. */
function fakeSupabase() {
  const F = { calls: [], cb: null, fail: [], n: 0, users: { 'anna@example.test': { id: 'uA', email: 'anna@example.test', pw: 'Anna-Passwort-1', code: null } } };
  const session = u => ({ access_token: 't-' + u.id, user: { id: u.id, email: u.email } });
  const none = error => ({ data: { user: null, session: null }, error });
  F.client = {
    auth: {
      onAuthStateChange(cb) { F.cb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: null }, error: null }; },
      async signInWithOtp(a) {
        F.calls.push(['otp', JSON.parse(JSON.stringify(a))]); const f = F.fail.shift(); if (f) return none(f);
        const u = F.users[String(a.email).toLowerCase()];
        if (!u) return none(apiErr('Signups not allowed for otp', 422, 'otp_disabled'));
        u.code = String(482910 + F.n++); return none(null);
      },
      async verifyOtp(a) {
        F.calls.push(['verify', JSON.parse(JSON.stringify(a))]); const f = F.fail.shift(); if (f) return none(f);
        const u = F.users[String(a.email).toLowerCase()];
        if (!u || a.type !== 'email' || !u.code || u.code !== a.token) return none(apiErr('Token has expired or is invalid', 403, 'otp_expired'));
        u.code = null; const s = session(u); if (F.cb) F.cb('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signInWithPassword(a) {
        F.calls.push(['password', a.email]); const u = F.users[String(a.email).toLowerCase()];
        if (!u || u.pw !== a.password) return none(apiErr('Invalid login credentials', 400, 'invalid_credentials'));
        const s = session(u); if (F.cb) F.cb('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { F.calls.push(['signout']); if (F.cb) F.cb('SIGNED_OUT', null); return { error: null }; }
    }
  };
  return F;
}

/* Gemeinsamer Kontext: erst cloud.js (echter Code), dann die App. */
function load(opts) {
  opts = opts || {};
  const F = fakeSupabase(), store = new Map(opts.storage || []), callbacks = {}, intervals = new Map();
  let focused = null, nextId = 1;
  const fields = {}, buttons = {};
  const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /* #view: beim Setzen von innerHTML entstehen die Felder neu, mit dem value-Attribut aus dem HTML. */
  const view = { _h: '', focus() { focused = '#view'; } };
  Object.defineProperty(view, 'innerHTML', { get() { return this._h; }, set(h) {
    this._h = h; for (const k of Object.keys(fields)) delete fields[k]; for (const k of Object.keys(buttons)) delete buttons[k];
    for (const m of h.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) { const v = /\bvalue="([^"]*)"/.exec(m[0]); const id = m[1]; fields[id] = { id, value: v ? unesc(v[1]) : '', focus() { focused = id; } }; }
    for (const m of h.matchAll(/<button\b[^>]*data-acc="([^"]+)"[^>]*>([^<]*)<\/button>/g)) if (!buttons[m[1]]) buttons[m[1]] = { disabled: /\sdisabled[\s>]/.test(m[0]), textContent: m[2], html: m[0] };
  } });
  const syncEl = { className: '', textContent: '', querySelector() { return syncEl._s; }, _s: { textContent: '' } };
  const el = () => ({ innerHTML: '', hidden: false, style: {}, textContent: '', className: '', querySelector() { return { textContent: '', style: {} }; } });
  const els = { '#view': view, '#sync': syncEl, '#sheet-root': el(), '#dock': el(), '#dock-nm': el(), '#dock-sum': el(), '#dock-bar': el() };
  const submitBtn = { disabled: false };
  const document = {
    addEventListener: (k, fn) => (callbacks[k] ||= []).push(fn),
    getElementById: id => fields[id] || null,
    querySelector(k) {
      if (els[k]) return els[k];
      const b = /^\[data-acc="([^"]+)"\]$/.exec(k); if (b) return buttons[b[1]] || null;
      if (k === '[data-acc-form]') return view._h.includes('data-acc-form') ? {} : null;
      if (/^\[data-acc-form="[^"]+"\] button\[type="submit"\]$/.test(k)) return submitBtn;
      return null;
    },
    querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} }, visibilityState: 'visible'
  };
  const ctx = {
    window: { addEventListener() {}, RP_CONFIG: { supabaseUrl: 'http://sb.test', supabaseKey: 'sb_publishable_test' }, supabase: { createClient: () => F.client } },
    location: { hash: '', href: 'http://127.0.0.1:8080/Reiseplaner/', origin: 'http://127.0.0.1:8080', pathname: '/Reiseplaner/', protocol: 'file:' },
    history: { replaceState() {} }, scrollTo() {}, navigator: { onLine: true },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, document,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {},
    setInterval: fn => { const id = nextId++; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    console, URL, Date
  };
  ctx.window.document = document;
  vm.createContext(ctx);
  vm.runInContext(cloudSrc, ctx);
  if (opts.cloudOnly) return { F, cloud: ctx.window.RPCloud };
  vm.runInContext(appSrc, ctx);
  const a = ctx.window.__app;
  const submitFn = callbacks.submit.find(fn => String(fn).includes("closest('[data-acc-form]')"));
  const clickFn = callbacks.click.find(fn => String(fn).includes("closest('[data-acc]')"));
  assert(submitFn && clickFn, 'Konto-Handler registriert');
  const T = {
    F, a, store, fields, buttons, view, intervals, cloud: ctx.window.RPCloud, focused: () => focused,
    submit: async kind => { submitBtn.disabled = false; await submitFn({ target: { closest: k => k === '[data-acc-form]' ? { getAttribute: () => kind } : null }, preventDefault() {} }); },
    click: async (act, val) => { await clickFn({ target: { closest: k => k === '[data-acc]' ? { getAttribute: n => n === 'data-acc' ? act : n === 'data-val' ? (val == null ? null : val) : null } : null } }); },
    /* Countdown: nur die registrierten Code-Intervalle ausführen (nicht den 60-s-Abgleich) */
    tickOtp: () => { for (const [, fn] of [...intervals]) if (String(fn).includes('code-resend')) fn(); },
    html: () => view._h
  };
  return T;
}

(async () => {
  /* ---------- 1. cloud.js allein ---------- */
  {
    const { F, cloud } = load({ cloudOnly: true });
    await cloud.init();
    assert.equal(typeof cloud.sendCode, 'function'); assert.equal(typeof cloud.verifyCode, 'function');

    await assert.rejects(cloud.sendCode('kein-at'), e => e.code === 'email' && /gültige E-Mail/.test(e.message));
    await assert.rejects(cloud.sendCode(''), e => e.code === 'email');
    assert.equal(F.calls.length, 0, 'ungültige Adresse geht nicht an den Server');

    const ok = await cloud.sendCode('  anna@example.test ');
    assert.deepEqual(JSON.parse(JSON.stringify(ok)), { email: 'anna@example.test', wait: 60, throttled: false });
    const [kind, args] = F.calls.pop();
    assert.equal(kind, 'otp'); assert.equal(args.email, 'anna@example.test');
    assert.strictEqual(args.options.shouldCreateUser, false, 'kein Konto-Anlegen per Code');
    assert.equal(args.options.emailRedirectTo, 'http://127.0.0.1:8080/Reiseplaner/', 'Link in der E-Mail führt auf diese Seite');

    const unknown = await cloud.sendCode('niemand@example.test');
    assert.deepEqual(JSON.parse(JSON.stringify(unknown)), { email: 'niemand@example.test', wait: 60, throttled: false }, 'unbekannte Adresse: gleiche Antwort wie Versand');

    F.fail.push(apiErr('For security purposes, you can only request this after 37 seconds.', 429, 'over_email_send_rate_limit'));
    assert.deepEqual(JSON.parse(JSON.stringify(await cloud.sendCode('anna@example.test'))), { email: 'anna@example.test', wait: 37, throttled: true });
    F.fail.push(apiErr('email rate limit exceeded', 429, 'over_email_send_rate_limit'));
    await assert.rejects(cloud.sendCode('anna@example.test'), e => e.code === 'rate' && /später erneut/.test(e.message) && e.wait === 60);
    F.fail.push(netErr());
    await assert.rejects(cloud.sendCode('anna@example.test'), e => e.network === true && /Keine Verbindung/.test(e.message));
    F.fail.push(apiErr('Unable to validate email address: invalid format', 400, 'email_address_invalid'));
    await assert.rejects(cloud.sendCode('a@b.cd'), e => e.code === 'email');
    F.fail.push(apiErr('Error sending magic link email', 500, 'unexpected_failure'));
    await assert.rejects(cloud.sendCode('anna@example.test'), e => e.code === 'send' && /nicht gesendet/.test(e.message) && !/magic/i.test(e.message));

    F.calls.length = 0;
    await assert.rejects(cloud.verifyCode('anna@example.test', '12345'), e => e.code === 'format');
    await assert.rejects(cloud.verifyCode('anna@example.test', '12345678901'), e => e.code === 'format');
    await assert.rejects(cloud.verifyCode('anna@example.test', 'abcdef'), e => e.code === 'format');
    await assert.rejects(cloud.verifyCode('kein-at', '123456'), e => e.code === 'email');
    assert.equal(F.calls.length, 0, 'unvollständiger Code geht nicht an den Server');

    await cloud.sendCode('anna@example.test');
    const wrong = await cloud.verifyCode('anna@example.test', '000000').catch(e => e);
    const noUser = await cloud.verifyCode('niemand@example.test', '000000').catch(e => e);
    assert.equal(wrong.code, 'invalid'); assert.equal(wrong.message, noUser.message, 'unbekannte Adresse: gleiche Meldung wie falscher Code');
    assert(/stimmt nicht oder ist abgelaufen/.test(wrong.message));
    F.fail.push(apiErr('Request rate limit reached', 429, 'over_request_rate_limit'));
    await assert.rejects(cloud.verifyCode('anna@example.test', '000000'), e => e.code === 'rate' && /Zu viele Versuche/.test(e.message));
    F.fail.push(netErr());
    await assert.rejects(cloud.verifyCode('anna@example.test', '000000'), e => e.network === true);

    let seen = null; cloud.onAuth((ev, u) => { seen = [ev, u]; });
    const code = F.users['anna@example.test'].code;
    F.calls.length = 0;
    const user = await cloud.verifyCode(' anna@example.test ', ' ' + code.slice(0, 3) + ' ' + code.slice(3) + ' ');
    assert.deepEqual(JSON.parse(JSON.stringify(user)), { id: 'uA', email: 'anna@example.test' });
    assert.deepEqual(F.calls[0], ['verify', { email: 'anna@example.test', token: code, type: 'email' }], 'Leerzeichen entfernt, Typ email');
    assert.deepEqual(JSON.parse(JSON.stringify(seen)), ['SIGNED_IN', { id: 'uA', email: 'anna@example.test' }], 'gleiches Anmelde-Ereignis wie bei Passwort');
    await assert.rejects(cloud.verifyCode('anna@example.test', code), e => e.code === 'invalid', 'Code nur einmal gültig');
    const orig = F.client.auth.verifyOtp; F.client.auth.verifyOtp = async () => ({ data: { user: { id: 'uA' }, session: null }, error: null });
    await assert.rejects(cloud.verifyCode('anna@example.test', '123456'), e => e.code === 'session', 'ohne Sitzung kein Erfolg');
    F.client.auth.verifyOtp = orig;
  }

  /* ---------- 2. Konto-Bereich in index.html ---------- */
  const guestTrip = (a, title) => Object.assign(a.newTrip({ title, dateMode: 'fix', start: '2027-05-01', end: '2027-05-04' }));
  const T = load();
  const { a, F } = T;
  await tick(); await tick();
  assert(a.Auth.ready && !a.Auth.user, 'Gastmodus nach Start');
  const g = guestTrip(a, 'Gast-Reise OTP'); a.Store.put(g, true);
  assert.equal(a.Store.key(), 'rp-trips');

  a.UI.view = 'konto'; a.render();
  const signinForm = '<form class="panel" data-acc-form="signin"><label class="fld"><span>E-Mail</span><input type="email" id="acc-email" autocomplete="email" required value=""></label><label class="fld"><span>Passwort</span><input type="password" id="acc-pw" autocomplete="current-password" required></label><button class="btn" type="submit">Anmelden</button></form>';
  assert(T.html().includes(signinForm), 'Passwort-Anmeldung unverändert');
  assert(T.buttons.mode && T.html().includes('data-val="code">Mit Code aus der E-Mail anmelden</button>'), 'Einstieg in die Code-Anmeldung sichtbar');

  /* Eingetippte Adresse wird übernommen, Fokus ins Adressfeld, Reiter „Anmelden“ bleibt markiert */
  T.fields['acc-email'].value = ' Anna@Example.test ';
  await T.click('mode', 'code');
  assert(T.html().includes('data-acc-form="code-send"') && !T.html().includes('data-acc-form="signin"'));
  assert.equal(T.fields['acc-email'].value, 'Anna@Example.test'); assert.equal(T.focused(), 'acc-email');
  assert(T.html().includes('data-val="signin" aria-pressed="true">Anmelden</button>'));
  assert(T.html().includes('Zurück zur Anmeldung mit Passwort'));

  /* Fehler im ersten Schritt: im Formular, als Alarm, Feld markiert, Fokus zurück */
  T.fields['acc-email'].value = 'anna';
  await T.submit('code-send');
  assert(/role="alert" id="acc-code-err">Bitte eine gültige E-Mail-Adresse eingeben/.test(T.html()));
  assert(/id="acc-email"[^>]*aria-describedby="acc-code-err acc-code-help" aria-invalid="true"/.test(T.html()));
  assert.equal(T.focused(), 'acc-email'); assert.equal(F.calls.length, 0);
  assert.equal(T.fields['acc-email'].value, 'anna', 'Eingabe bleibt zum Korrigieren stehen');

  F.fail.push(netErr()); T.fields['acc-email'].value = 'anna@example.test';
  await T.submit('code-send');
  assert(T.html().includes('Keine Verbindung zum Server') && T.html().includes('data-acc-form="code-send"'));
  F.fail.push(apiErr('email rate limit exceeded', 429, 'over_email_send_rate_limit'));
  await T.submit('code-send');
  assert(T.html().includes('Gerade können keine weiteren E-Mails versendet werden') && T.html().includes('data-acc-form="code-send"'));

  /* Unbekannte und bekannte Adresse sehen gleich aus */
  const step2 = async mail => { T.fields['acc-email'].value = mail; await T.submit('code-send'); return T.html().split(mail).join('<ADRESSE>'); };
  const viewUnknown = await step2('niemand@example.test');
  assert(T.html().includes('data-acc-form="code-verify"'));
  await T.click('code-back');
  assert(T.html().includes('data-acc-form="code-send"')); assert.equal(T.fields['acc-email'].value, 'niemand@example.test'); assert.equal(T.focused(), 'acc-email');
  const viewKnown = await step2('anna@example.test');
  assert.equal(viewKnown, viewUnknown, 'Anzeige verrät nicht, ob ein Konto existiert');
  assert.strictEqual(F.calls.filter(c => c[0] === 'otp').every(c => c[1].options.shouldCreateUser === false), true);

  /* Codefeld, Fokus, Beschreibung, Wartezeit */
  const h = T.html();
  assert(/<input type="text" id="acc-code" inputmode="numeric" autocomplete="one-time-code"[^>]*required aria-describedby="acc-code-sent acc-code-hint">/.test(h), 'Codefeld für Ziffern und Code-Vorschlag');
  assert(h.includes('<input type="email" autocomplete="username" value="anna@example.test" hidden readonly>'), 'Adresse für Passwortmanager');
  assert(h.includes('Falls zu <b>anna@example.test</b> ein Konto besteht'));
  assert.equal(T.focused(), 'acc-code');
  assert(T.buttons['code-resend'].disabled && /Neuer Code in 60 s möglich/.test(T.buttons['code-resend'].textContent));
  assert(T.buttons['code-back'] && T.html().includes('data-val="signin">Mit Passwort anmelden</button>'));
  const sentBefore = F.calls.filter(c => c[0] === 'otp').length;
  await T.click('code-resend');
  assert.equal(F.calls.filter(c => c[0] === 'otp').length, sentBefore, 'während der Wartezeit kein neuer Versand');

  /* Falscher Code, unvollständiger Code, Netzfehler */
  T.fields['acc-code'].value = '000000'; await T.submit('code-verify');
  assert(/role="alert" id="acc-code-err">Der Code stimmt nicht oder ist abgelaufen/.test(T.html()));
  assert(/id="acc-code"[^>]*aria-describedby="acc-code-sent acc-code-err acc-code-hint" aria-invalid="true"/.test(T.html()));
  assert.equal(T.focused(), 'acc-code'); assert.equal(T.fields['acc-code'].value, '', 'falscher Code wird geleert');
  assert(!a.Auth.user && a.Store.key() === 'rp-trips');
  const verBefore = F.calls.filter(c => c[0] === 'verify').length;
  T.fields['acc-code'].value = '12 34'; await T.submit('code-verify');
  assert(T.html().includes('vollständig eingeben')); assert.equal(F.calls.filter(c => c[0] === 'verify').length, verBefore);
  F.fail.push(netErr()); T.fields['acc-code'].value = '482910'; await T.submit('code-verify');
  assert(T.html().includes('Keine Verbindung zum Server')); assert.equal(T.fields['acc-code'].value, '482910', 'bei Netzfehler bleibt der Code stehen');
  assert(!a.Auth.user);

  /* Wartezeit abgelaufen → erneut senden; alter Code gilt nicht mehr */
  const oldCode = F.users['anna@example.test'].code;
  a.UI.otp.sentAt -= 61000; T.tickOtp();
  assert.equal(T.buttons['code-resend'].disabled, false); assert.equal(T.buttons['code-resend'].textContent, 'Code erneut senden');
  await T.click('code-resend');
  assert(T.html().includes('Falls ein Konto besteht, ist ein neuer Code unterwegs. Nur der neueste Code gilt.'));
  assert(T.buttons['code-resend'].disabled && /in 60 s/.test(T.buttons['code-resend'].textContent)); assert.equal(T.focused(), 'acc-code');
  assert.notEqual(F.users['anna@example.test'].code, oldCode);
  T.fields['acc-code'].value = oldCode; await T.submit('code-verify');
  assert(T.html().includes('stimmt nicht oder ist abgelaufen') && !a.Auth.user, 'alter Code ungültig');

  /* Server bremst erneutes Senden: Wartezeit vom Server, kein „neuer Code“ behauptet */
  a.UI.otp.sentAt -= 61000; T.tickOtp();
  F.fail.push(apiErr('For security purposes, you can only request this after 37 seconds.', 429, 'over_email_send_rate_limit'));
  await T.click('code-resend');
  assert(T.html().includes('Ein neuer Code ist erst in 37 s möglich') && !T.html().includes('ist ein neuer Code unterwegs'));
  assert(/Neuer Code in 3[67] s möglich/.test(T.buttons['code-resend'].textContent));
  assert([...T.intervals.values()].some(fn => String(fn).includes('code-resend')), 'Countdown läuft');

  /* Richtiger Code → gleicher Ablauf wie nach Passwort-Anmeldung */
  T.fields['acc-code'].value = ' ' + F.users['anna@example.test'].code + ' '; await T.submit('code-verify');
  assert.equal(a.Auth.user && a.Auth.user.id, 'uA'); assert.equal(a.Store.key(), 'rp-u:uA');
  assert.equal(a.UI.otp, null); assert.equal(a.UI.authMode, 'signin');
  assert(!a.Store.list().some(t => t.title === 'Gast-Reise OTP'), 'Gastdaten nicht automatisch im Konto');
  assert.equal(a.guestPendingCount(), 1);
  const afterOtp = T.html();
  assert(afterOtp.includes('<dt>Angemeldet</dt><dd>anna@example.test</dd>') && afterOtp.includes('Reisen ohne Konto in diesem Browser') && afterOtp.includes('data-acc="adopt-open"'));
  T.tickOtp(); assert(![...T.intervals.values()].some(fn => String(fn).includes('code-resend')), 'Countdown endet ohne Codeformular');

  /* Vergleich: Passwort-Anmeldung in frischem Kontext mit gleichem Gastbestand */
  const P = load({ storage: [['rp-trips', T.store.get('rp-trips')]] });
  await tick(); await tick();
  P.a.UI.view = 'konto'; P.a.render();
  P.fields['acc-email'].value = 'anna@example.test'; P.fields['acc-pw'].value = 'Anna-Passwort-1';
  await P.submit('signin');
  assert.equal(P.a.Store.key(), 'rp-u:uA'); assert.equal(P.a.guestPendingCount(), 1);
  assert.equal(P.html(), afterOtp, 'Kontoansicht nach Code-Anmeldung entspricht der nach Passwort-Anmeldung');

  /* Abmelden → wieder normale Anmeldung, kein alter Code-Schritt */
  await a.Auth.signOut(false);
  assert(!a.Auth.user && a.Store.key() === 'rp-trips');
  a.UI.view = 'konto'; a.render();
  assert(T.html().includes(signinForm.replace('value=""', 'value="anna@example.test"')) && !T.html().includes('code-verify'));

  /* Code-Schritt verlassen über „Mit Passwort anmelden“ setzt den Schritt zurück, Adresse bleibt */
  await T.click('mode', 'code'); T.fields['acc-email'].value = 'anna@example.test'; await T.submit('code-send');
  await T.click('mode', 'signin');
  assert(T.html().includes('data-acc-form="signin"') && !T.html().includes('code-verify')); assert.equal(T.fields['acc-email'].value, 'anna@example.test');
  await T.click('mode', 'code'); assert(T.html().includes('data-acc-form="code-send"'));

  console.log('E-Mail-Code (P0.7): cloud.js ohne Konto-Anlegen, Adress- und Codeprüfung, gleiche Antwort für unbekannte Adressen, Wartezeit/Rate-Limit, Netzfehler, einmaliger Code; Oberfläche mit Fokus, Fehlerzuständen, Countdown, erneut senden, Zurück, gleicher Kontoansicht wie nach Passwort-Anmeldung und Abmelden geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
