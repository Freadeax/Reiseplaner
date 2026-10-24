/* RPPlatform · Plattformschicht (P00 §3, Paket A1, Claude 24.10.2026).

   Eine Stelle für alles, was je nach Umgebung anders geht: Datei sichern, Teilen, Drucken, Standort.
   Heute gibt es nur die Website (Browser und installierte Startbildschirm-App). Die App-Hülle (Capacitor)
   ist vorbereitet, aber ruht (Philipp 23.10.2026); ihre Wege stehen hier schon, damit die Oberfläche später
   nichts ändern muss.

   Regeln:
   * Jede Methode liefert einen sichtbaren Zustand {ok, state, where?, text?}, nie stillen Erfolg und nie eine
     unbehandelte Ausnahme. state: 'ok' | 'cancelled' | 'unavailable' | 'error'.
   * Fehlt ein Weg, nimmt die Schicht den nächsten (Teilen → Zwischenablage → Text zum Kopieren) und sagt,
     welcher es war (where), damit die Oberfläche die passende Meldung zeigt.
   * can(cap) wirft nie.
   Ohne Browser testbar: create(env) mit eigenem navigator/document/URL/Blob/Capacitor. */
(function (root, factory) {
  'use strict';
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else if (root) root.RPPlatform = Object.assign(lib.create(lib.browserEnv(root)), { lib });
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const CAPS = ['files.save', 'share', 'share.files', 'clipboard', 'print', 'geo'];

  function browserEnv(w) {
    return {
      window: w, navigator: w.navigator, document: w.document, URL: w.URL, Blob: w.Blob,
      setTimeout: w.setTimeout ? w.setTimeout.bind(w) : null,
      matchMedia: w.matchMedia ? w.matchMedia.bind(w) : null,
      Capacitor: w.Capacitor || null,
    };
  }
  const ok = (where, extra) => Object.assign({ ok: true, state: 'ok', where }, extra || {});
  const fail = (state, text, extra) => Object.assign({ ok: false, state, text }, extra || {});
  const isAbort = e => !!e && (e.name === 'AbortError' || /cancel/i.test(String(e.message || '')));
  const safeName = n => String(n || 'Reiseplaner-Export.txt').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^[.\s]+/, '').slice(0, 120) || 'Reiseplaner-Export.txt';

  function create(env) {
    env = env || {};
    const nav = env.navigator || {};
    const C = env.Capacitor;
    const native = !!(C && typeof C.isNativePlatform === 'function' && (() => { try { return C.isNativePlatform(); } catch (e) { return false; } })());
    const plugins = native ? (C.Plugins || {}) : {};

    function detect() {
      if (native) { let p = 'web'; try { p = C.getPlatform(); } catch (e) {} return { kind: p === 'ios' || p === 'android' ? p : 'web', shell: 'capacitor' }; }
      let standalone = false;
      try { standalone = nav.standalone === true || !!(env.matchMedia && env.matchMedia('(display-mode: standalone)').matches); } catch (e) {}
      return { kind: standalone ? 'pwa' : 'web', shell: standalone ? 'installed-pwa' : 'browser' };
    }
    const where = detect();

    function can(cap) {
      try {
        switch (cap) {
          case 'files.save': return !!(plugins.Filesystem && plugins.Share) || !!(env.URL && env.URL.createObjectURL && env.Blob && env.document);
          case 'share': return !!plugins.Share || typeof nav.share === 'function';
          case 'share.files': return !!plugins.Share || (typeof nav.canShare === 'function' && typeof nav.share === 'function');
          case 'clipboard': return !!(nav.clipboard && typeof nav.clipboard.writeText === 'function');
          case 'print': return !native && !!(env.window && typeof env.window.print === 'function');
          case 'geo': return !!(nav.geolocation && typeof nav.geolocation.getCurrentPosition === 'function');
          default: return false;
        }
      } catch (e) { return false; }
    }

    /* Datei sichern. Browser: Download über einen Blob-Link. App: Datei in den Cache, dann Teilen-Menü
       („In Dateien sichern“); scheitert das, Download als Rückfall. data: String oder Array von Teilen (Blob-Teile). */
    function webSave(name, type, data) {
      const parts = Array.isArray(data) ? data : [String(data == null ? '' : data)];
      const blob = new env.Blob(parts, { type: type || 'application/octet-stream' });
      const url = env.URL.createObjectURL(blob), a = env.document.createElement('a');
      a.href = url; a.download = name; env.document.body.appendChild(a); a.click(); a.remove();
      const revoke = () => { try { env.URL.revokeObjectURL(url); } catch (e) {} };
      if (env.setTimeout) env.setTimeout(revoke, 60000); else revoke();
      return ok('download', { name });
    }
    async function saveFile(opt) {
      opt = opt || {};
      const name = safeName(opt.name);
      if (plugins.Filesystem && plugins.Share && typeof opt.data === 'string') {
        try {
          const r = await plugins.Filesystem.writeFile({ path: name, data: opt.data, directory: 'CACHE', encoding: 'utf8' });
          await plugins.Share.share({ title: name, files: [r.uri], dialogTitle: 'Datei sichern oder teilen' });
          return ok('share', { name });
        } catch (e) {
          if (isAbort(e)) return fail('cancelled', 'Sichern abgebrochen.');
        }
      }
      if (!(env.URL && env.URL.createObjectURL && env.Blob && env.document)) return fail('unavailable', 'Dateien können hier nicht gesichert werden. Bitte im Browser öffnen.');
      try { return webSave(name, opt.type, opt.data); }
      catch (e) { return fail('error', 'Datei konnte nicht gesichert werden: ' + String(e && e.message || e).slice(0, 200)); }
    }

    async function copyText(text) {
      if (!can('clipboard')) return fail('unavailable', 'Zwischenablage nicht verfügbar.');
      try { await nav.clipboard.writeText(String(text)); return ok('clipboard'); }
      catch (e) { return fail('error', 'Kopieren nicht erlaubt.'); }
    }

    /* Teilen: Teilen-Menü → Zwischenablage → manuell kopieren (where:'manual', die Oberfläche zeigt den Text).
       Abbrechen im Teilen-Menü ist kein Fehler und löst keinen Rückfall aus. */
    async function share(opt) {
      opt = opt || {};
      const payload = {};
      if (opt.title) payload.title = String(opt.title);
      if (opt.text) payload.text = String(opt.text);
      if (opt.url) payload.url = String(opt.url);
      try {
        if (plugins.Share) { await plugins.Share.share(payload); return ok('share'); }
        if (typeof nav.share === 'function') { await nav.share(payload); return ok('share'); }
      } catch (e) {
        if (isAbort(e)) return fail('cancelled', 'Teilen abgebrochen.');
      }
      const body = [opt.text, opt.url].filter(Boolean).join('\n');
      const c = await copyText(body);
      if (c.ok) return c;
      return fail('unavailable', 'Bitte den Text markieren und kopieren.', { where: 'manual', body });
    }

    function print() {
      if (!can('print')) return fail('unavailable', native ? 'Drucken geht in der App noch nicht. Bitte die Website im Browser öffnen.' : 'Drucken wird hier nicht unterstützt. Bitte im Browser öffnen.');
      try { env.window.print(); return ok('print'); }
      catch (e) { return fail('error', 'Drucken wird hier nicht unterstützt. Bitte im Browser öffnen.'); }
    }

    /* Standort, auf etwa 1 km gerundet (wie bisher in Entdecken), damit kein genauer Ort gespeichert wird. */
    function geoCurrent(opt) {
      opt = opt || {};
      if (!can('geo')) return Promise.resolve(fail('unavailable', 'Standort wird von diesem Browser nicht unterstützt. Bitte Ort eingeben.'));
      const digits = opt.precise === true ? 5 : 2, f = Math.pow(10, digits);
      return new Promise(resolve => {
        try {
          nav.geolocation.getCurrentPosition(
            pos => resolve(ok('geo', { lat: Math.round(pos.coords.latitude * f) / f, lon: Math.round(pos.coords.longitude * f) / f, acc: pos.coords.accuracy == null ? null : Math.round(pos.coords.accuracy), rounded: digits === 2 })),
            err => resolve(err && err.code === 1 ? fail('cancelled', 'Standort nicht freigegeben. Bitte Ort eingeben.') : fail('error', 'Standort nicht ermittelt. Bitte Ort eingeben.')),
            { enableHighAccuracy: false, timeout: Math.max(1000, Math.min(60000, +opt.timeoutMs || 10000)), maximumAge: 600000 }
          );
        } catch (e) { resolve(fail('error', 'Standort nicht ermittelt. Bitte Ort eingeben.')); }
      });
    }

    function capabilities() { const r = {}; CAPS.forEach(c => { r[c] = can(c); }); return r; }

    return { kind: where.kind, shell: where.shell, native, can, capabilities, files: { save: saveFile }, share, copyText, print, geo: { current: geoCurrent } };
  }

  return { create, browserEnv, CAPS, safeName };
});
