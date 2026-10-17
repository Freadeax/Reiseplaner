/* Reiseplaner · Supabase-Zugriff (Issue #6)
   Einzige Stelle, die mit Supabase spricht. Die Fachlogik in index.html kennt nur window.RPCloud.
   Öffentliche Konfiguration kommt aus window.RP_CONFIG (config.js). Ohne Konfiguration bleibt die App
   im Gastmodus (nur Browser-Speicher). Keine Secret-/service_role-Schlüssel – nur Publishable Key. */
(function () {
  'use strict';
  var cfg = window.RP_CONFIG || {};
  var LIB = 'vendor/supabase-js-2.117.2.js';
  var sb = null, ready = null, listeners = [];

  function enabled() { return !!(cfg.supabaseUrl && cfg.supabaseKey); }
  /* Weiterleitungsziel für E-Mails: aktuelle Seite ohne Query/Hash, damit es auf jedem Host
     (GitHub Pages, Cloudflare Pages, lokal) stimmt. Optional fest über RP_CONFIG.siteUrl. */
  function siteUrl() { return cfg.siteUrl || (location.origin + location.pathname.replace(/index\.html$/, '')); }
  function err(e, fallback) {
    if (!e) return null;
    var x = new Error(e.message || fallback || 'Unbekannter Fehler');
    x.code = e.code || e.status || ''; x.network = !!(e.name === 'TypeError' || /fetch|network|Failed to/i.test(e.message || ''));
    return x;
  }
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = LIB; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Supabase-Bibliothek nicht geladen')); };
      document.head.appendChild(s);
    });
  }
  function init() {
    if (!enabled()) return Promise.resolve(null);
    if (ready) return ready;
    ready = loadLib().then(function () {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rp-auth' }
      });
      sb.auth.onAuthStateChange(function (event, session) {
        listeners.forEach(function (cb) { try { cb(event, session && session.user ? { id: session.user.id, email: session.user.email } : null); } catch (e) { console.error(e); } });
      });
      return sb.auth.getSession().then(function (r) {
        /* PKCE-Code aus Bestätigungs-/Wiederherstellungslink aus der Adresse entfernen */
        try { var u = new URL(location.href); if (u.searchParams.has('code')) { u.searchParams.delete('code'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) {}
        var s = r.data && r.data.session;
        return s ? { id: s.user.id, email: s.user.email } : null;
      });
    });
    return ready;
  }
  function need() { if (!sb) throw new Error('Online-Konto nicht verfügbar'); return sb; }

  /* ---------- Anmeldung per E-Mail-Code (OTP, P0.7) ----------
     Bewusst KEIN Konto-Anlegen per Code (shouldCreateUser:false): Neue Konten entstehen nur über
     „Registrieren“ mit Passwort und Bestätigung. Sonst legte ein Tippfehler in der Adresse still ein
     neues, leeres Konto an. Die Oberfläche verrät nicht, ob es ein Konto gibt: Für unbekannte Adressen
     meldet Supabase „Signups not allowed for otp“ (422); das wird wie ein Versand behandelt. */
  var CODE_WAIT_S = 60; /* Supabase-Standard: frühestens nach 60 s eine weitere E-Mail an dieselbe Adresse */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function codeNet(e) { return !!e && (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || e.status === 0 || /fetch|network|Failed to/i.test(e.message || '')); }
  function codeErr(msg, kind, extra) { var x = new Error(msg); x.code = kind; if (kind === 'network') x.network = true; return Object.assign(x, extra || {}); }
  function waitSeconds(e) { var m = /after (\d+) seconds?/i.exec(e && e.message || ''); return m ? Math.max(1, Number(m[1])) : 0; }
  function cleanCode(token) { return String(token == null ? '' : token).replace(/[\s-]/g, ''); }
  function unwrap(r, fallback) { if (r.error) throw err(r.error, fallback); return r.data; }

  var TRIP_COLS = 'id,data,version,owner_id,deleted_at,updated_at,updated_by';

  window.RPCloud = {
    enabled: enabled,
    init: init,
    siteUrl: siteUrl,
    onAuth: function (cb) { listeners.push(cb); },

    /* ---------- Konto ---------- */
    signUp: async function (email, password) {
      var r = await need().auth.signUp({ email: email, password: password, options: { emailRedirectTo: siteUrl() } });
      var d = unwrap(r, 'Registrierung fehlgeschlagen');
      return { needsConfirmation: !d.session };
    },
    signIn: async function (email, password) { unwrap(await need().auth.signInWithPassword({ email: email, password: password }), 'Anmeldung fehlgeschlagen'); },
    signOut: async function () { unwrap(await need().auth.signOut({ scope: 'local' }), 'Abmelden fehlgeschlagen'); },
    resetPassword: async function (email) { unwrap(await need().auth.resetPasswordForEmail(email, { redirectTo: siteUrl() }), 'E-Mail konnte nicht gesendet werden'); },
    updatePassword: async function (password) { unwrap(await need().auth.updateUser({ password: password }), 'Passwort nicht geändert'); },
    /* Konto-Lebenszyklus (Migration 20261016120000): Übersicht, Export, Eigentümerwechsel, Löschung */
    accountSummary: async function () { return unwrap(await need().rpc('my_account_summary'), 'Kontoübersicht nicht geladen'); },
    exportAccount: async function () { return unwrap(await need().rpc('export_my_account'), 'Kontodaten nicht geladen'); },
    transferTrip: async function (tripId, userId) { unwrap(await need().rpc('transfer_trip_ownership', { p_trip: tripId, p_new_owner: userId }), 'Reise nicht übergeben'); },
    deleteAccount: async function (email, deleteShared) { return unwrap(await need().rpc('delete_my_account', { p_confirm_email: email, p_delete_shared: !!deleteShared }), 'Konto nicht gelöscht'); },
    /* Rückgabe {email, wait, throttled}: wait = Sekunden bis zu einem weiteren Code. throttled = kurz zuvor
       wurde schon ein Code gesendet, der weiter gilt (gleiche Anzeige wie ein Versand). */
    sendCode: async function (email) {
      email = String(email == null ? '' : email).trim();
      if (!EMAIL_RE.test(email)) throw codeErr('Bitte eine gültige E-Mail-Adresse eingeben.', 'email');
      var r = await need().auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: siteUrl() } });
      var e = r.error;
      if (!e) return { email: email, wait: CODE_WAIT_S, throttled: false };
      if (e.code === 'otp_disabled' || /signups not allowed/i.test(e.message || '')) return { email: email, wait: CODE_WAIT_S, throttled: false };
      if (codeNet(e)) throw codeErr('Keine Verbindung zum Server. Bitte Netz prüfen und erneut versuchen.', 'network');
      if (e.status === 429 || /rate.?limit/i.test(String(e.code) + ' ' + e.message)) {
        var s = waitSeconds(e);
        if (s) return { email: email, wait: s, throttled: true };
        throw codeErr('Gerade können keine weiteren E-Mails versendet werden. Bitte später erneut versuchen.', 'rate', { wait: CODE_WAIT_S });
      }
      if (e.code === 'email_address_invalid' || e.code === 'validation_failed') throw codeErr('Bitte eine gültige E-Mail-Adresse eingeben.', 'email');
      throw codeErr('Der Code konnte nicht gesendet werden. Bitte später erneut versuchen.', 'send', { detail: e.message || '' });
    },
    /* Gleiche Meldung für falschen, abgelaufenen oder unbekannten Code bzw. Adresse. */
    verifyCode: async function (email, token) {
      email = String(email == null ? '' : email).trim(); token = cleanCode(token);
      if (!EMAIL_RE.test(email)) throw codeErr('Bitte eine gültige E-Mail-Adresse eingeben.', 'email');
      if (!/^\d{6,10}$/.test(token)) throw codeErr('Bitte den Code aus der E-Mail vollständig eingeben (nur Ziffern).', 'format');
      var r = await need().auth.verifyOtp({ email: email, token: token, type: 'email' });
      var e = r.error;
      if (e) {
        if (codeNet(e)) throw codeErr('Keine Verbindung zum Server. Bitte Netz prüfen und erneut versuchen.', 'network');
        if (e.status === 429 || /rate.?limit/i.test(String(e.code) + ' ' + e.message)) throw codeErr('Zu viele Versuche. Bitte einige Minuten warten und dann erneut versuchen.', 'rate');
        throw codeErr('Der Code stimmt nicht oder ist abgelaufen. Bitte prüfen oder einen neuen Code anfordern.', 'invalid');
      }
      var u = r.data && (r.data.user || (r.data.session && r.data.session.user));
      if (!u || !(r.data && r.data.session)) throw codeErr('Anmeldung nicht abgeschlossen. Bitte erneut versuchen.', 'session');
      return { id: u.id, email: u.email };
    },

    /* ---------- Reisen ---------- */
    listTrips: async function (userId) {
      var a = await need().from('trips').select(TRIP_COLS);
      var b = await need().from('trip_members').select('trip_id,role').eq('user_id', userId);
      var trips = unwrap(a, 'Reisen nicht geladen'), mem = unwrap(b, 'Rollen nicht geladen'), role = {};
      mem.forEach(function (m) { role[m.trip_id] = m.role; });
      return trips.map(function (t) { t.role = role[t.id] || (t.owner_id === userId ? 'owner' : 'viewer'); return t; });
    },
    getTrip: async function (id) {
      var r = await need().from('trips').select(TRIP_COLS).eq('id', id).maybeSingle();
      return unwrap(r, 'Reise nicht geladen');
    },
    insertTrip: async function (id, data) {
      var r = await need().from('trips').insert({ id: id, data: data }).select(TRIP_COLS).single();
      return unwrap(r, 'Reise nicht gespeichert');
    },
    /* Atomare Versionsprüfung: ändert nur, wenn die Serverversion noch der bekannten entspricht.
       Rückgabe null = Konflikt, gelöscht oder kein Schreibrecht (Aufrufer klärt per getTrip). */
    updateTrip: async function (id, data, baseVersion) {
      var r = await need().from('trips').update({ data: data }).eq('id', id).eq('version', baseVersion).select(TRIP_COLS);
      var rows = unwrap(r, 'Reise nicht gespeichert');
      return rows.length ? rows[0] : null;
    },
    deleteTrip: async function (id, baseVersion) {
      var r = await need().from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('version', baseVersion).select(TRIP_COLS);
      var rows = unwrap(r, 'Reise nicht gelöscht');
      return rows.length ? rows[0] : null;
    },

    /* ---------- Freigaben ---------- */
    members: async function (tripId) { return unwrap(await need().rpc('trip_member_list', { p_trip: tripId }), 'Mitglieder nicht geladen'); },
    setRole: async function (tripId, userId, role) {
      var rows = unwrap(await need().from('trip_members').update({ role: role }).eq('trip_id', tripId).eq('user_id', userId).select('role'), 'Rolle nicht geändert');
      if (!rows.length) throw new Error('Rolle nicht geändert (keine Berechtigung)');
    },
    removeMember: async function (tripId, userId) {
      var rows = unwrap(await need().from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId).select('user_id'), 'Mitglied nicht entfernt');
      if (!rows.length) throw new Error('Mitglied nicht entfernt (keine Berechtigung)');
    },
    invites: async function (tripId) {
      return unwrap(await need().from('trip_invites').select('id,role,email,created_at,expires_at,revoked_at,used_at').eq('trip_id', tripId).order('created_at', { ascending: false }), 'Einladungen nicht geladen');
    },
    createInvite: async function (tripId, role, hours, email) {
      var token = unwrap(await need().rpc('create_trip_invite', { p_trip: tripId, p_role: role, p_hours: hours, p_email: email || null }), 'Einladung nicht erstellt');
      return siteUrl() + '?einladung=' + encodeURIComponent(token);
    },
    revokeInvite: async function (id) {
      var rows = unwrap(await need().from('trip_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null).select('id'), 'Einladung nicht widerrufen');
      if (!rows.length) throw new Error('Einladung nicht widerrufen');
    },
    acceptInvite: async function (token) { return unwrap(await need().rpc('accept_trip_invite', { p_token: token }), 'Einladung ungültig'); },

    /* ---------- Umkreis-Katalog (Issue #7), öffentlich lesbar, auch ohne Anmeldung ---------- */
    /* Katalog K2: catalog_search_v2 (Vorfilter, Seiten, Gesamtzahl); fehlt die Funktion noch, die bisherige Suche */
    catalogSearch: async function (q, page) {
      await init();
      var args = { p_lat: q.lat, p_lon: q.lon, p_max_km: Math.round(q.maxKm), p_min_km: Math.round(q.minKm || 0), p_kinds: q.kinds && q.kinds.length ? q.kinds : null };
      var r = await need().rpc('catalog_search_v2', Object.assign({ p_limit: page && page.limit || 80, p_offset: page && page.offset || 0 }, args));
      if (r.error && /PGRST202|catalog_search_v2|does not exist|Could not find/i.test(String(r.error.code) + ' ' + r.error.message)) r = await need().rpc('catalog_search', args);
      return unwrap(r, 'Katalog nicht geladen');
    },
    catalogPlace: async function (id) { await init(); return unwrap(await need().rpc('catalog_place', { p_id: id }), 'Ziel nicht geladen'); },
    catalogFind: async function (text, limit) { await init(); return unwrap(await need().rpc('catalog_find', { p_q: text, p_limit: limit || 12 }), 'Suche nicht möglich'); }
  };
})();
