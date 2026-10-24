/* RPPlatform (P00 A1): Erkennung, Fähigkeiten, Rückfälle und sichtbare Zustände. Node-Test mit nachgebildeten
   Browser- und App-Umgebungen; kein Browser-, iPhone- oder Android-Test. */
const assert = require('assert');
const lib = require('../platform.js');

function fakeDoc() {
  const clicks = [];
  return {
    clicks,
    body: { appendChild() {} },
    createElement() { const a = { click() { clicks.push({ href: a.href, download: a.download }); }, remove() {} }; return a; },
  };
}
function browser(over) {
  const doc = fakeDoc(), revoked = [];
  const env = Object.assign({
    window: { print() { env._printed = (env._printed || 0) + 1; } },
    navigator: {}, document: doc,
    URL: { createObjectURL: b => { env._blob = b; return 'blob:1'; }, revokeObjectURL: u => revoked.push(u) },
    Blob: function (parts, o) { this.parts = parts; this.type = o.type; },
    setTimeout: fn => fn(),
    matchMedia: () => ({ matches: false }),
  }, over || {});
  env._revoked = revoked;
  return env;
}
let n = 0; const test = async (name, fn) => { await fn(); n++; };

(async () => {
  await test('Erkennung Browser, PWA, App', () => {
    assert.strictEqual(lib.create(browser()).kind, 'web');
    assert.strictEqual(lib.create(browser()).shell, 'browser');
    assert.strictEqual(lib.create(browser({ matchMedia: () => ({ matches: true }) })).kind, 'pwa');
    assert.strictEqual(lib.create(browser({ navigator: { standalone: true } })).shell, 'installed-pwa');
    const C = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
    const p = lib.create(browser({ Capacitor: C }));
    assert.strictEqual(p.kind, 'ios'); assert.strictEqual(p.shell, 'capacitor'); assert.strictEqual(p.native, true);
    const w = lib.create(browser({ Capacitor: { isNativePlatform: () => false } }));
    assert.strictEqual(w.native, false); assert.strictEqual(w.kind, 'web');
    const broken = lib.create(browser({ Capacitor: { isNativePlatform() { throw new Error('x'); } } }));
    assert.strictEqual(broken.native, false);
    assert.doesNotThrow(() => lib.create({}));
  });

  await test('can() wirft nie, unbekannt ist false', () => {
    const p = lib.create({});
    lib.CAPS.forEach(c => assert.strictEqual(p.can(c), false, c));
    assert.strictEqual(p.can('gibt-es-nicht'), false);
    const evil = lib.create(browser({ navigator: { get clipboard() { throw new Error('x'); } } }));
    assert.strictEqual(evil.can('clipboard'), false);
    const b = lib.create(browser());
    assert.strictEqual(b.can('files.save'), true); assert.strictEqual(b.can('print'), true); assert.strictEqual(b.can('share'), false);
    assert.deepStrictEqual(Object.keys(b.capabilities()), lib.CAPS);
  });

  await test('Datei sichern im Browser: Download, Blob-Link freigegeben, Name bereinigt', async () => {
    const env = browser(), p = lib.create(env);
    const r = await p.files.save({ name: 'a/b:c?.json', type: 'application/json', data: '{"x":1}' });
    assert.deepStrictEqual(r, { ok: true, state: 'ok', where: 'download', name: 'a-b-c-.json' });
    assert.deepStrictEqual(env.document.clicks, [{ href: 'blob:1', download: 'a-b-c-.json' }]);
    assert.deepStrictEqual(env._blob.parts, ['{"x":1}']); assert.strictEqual(env._blob.type, 'application/json');
    assert.deepStrictEqual(env._revoked, ['blob:1']);
    const parts = await p.files.save({ name: 'x.zip', type: 'application/zip', data: ['A', 'B'] });
    assert.strictEqual(parts.ok, true); assert.deepStrictEqual(env._blob.parts, ['A', 'B']);
    assert.strictEqual(lib.safeName(''), 'Reiseplaner-Export.txt');
    assert.strictEqual(lib.safeName('...'), 'Reiseplaner-Export.txt');
    assert.strictEqual(lib.safeName('x'.repeat(300)).length, 120);
  });

  await test('Datei sichern: ohne Möglichkeit sichtbar „nicht verfügbar“, Fehler mit Text', async () => {
    const r = await lib.create({}).files.save({ name: 'x.json', data: '1' });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.state, 'unavailable'); assert.ok(r.text);
    const env = browser({ URL: { createObjectURL() { throw new Error('voll'); } } });
    const e = await lib.create(env).files.save({ name: 'x.json', data: '1' });
    assert.strictEqual(e.state, 'error'); assert.ok(/voll/.test(e.text));
  });

  await test('Datei sichern in der App: Cache + Teilen-Menü, Abbruch ist kein Fehler, sonst Download-Rückfall', async () => {
    const calls = [];
    const P = { Filesystem: { writeFile: async o => { calls.push(['write', o.path, o.directory]); return { uri: 'file://c/' + o.path }; } },
                Share: { share: async o => { calls.push(['share', o.files[0]]); } } };
    const C = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: P };
    const r = await lib.create(browser({ Capacitor: C })).files.save({ name: 'R.json', data: '{}' });
    assert.deepStrictEqual(r, { ok: true, state: 'ok', where: 'share', name: 'R.json' });
    assert.deepStrictEqual(calls, [['write', 'R.json', 'CACHE'], ['share', 'file://c/R.json']]);
    P.Share.share = async () => { throw new Error('Share canceled'); };
    const c = await lib.create(browser({ Capacitor: C })).files.save({ name: 'R.json', data: '{}' });
    assert.strictEqual(c.state, 'cancelled');
    P.Filesystem.writeFile = async () => { throw new Error('Speicher voll'); };
    const env = browser({ Capacitor: C });
    const f = await lib.create(env).files.save({ name: 'R.json', data: '{}' });
    assert.strictEqual(f.where, 'download'); assert.strictEqual(env.document.clicks.length, 1);
  });

  await test('Teilen: Menü, Abbruch ohne Rückfall, Zwischenablage, sonst Text zum Kopieren', async () => {
    const shared = [];
    const s = await lib.create(browser({ navigator: { share: async o => shared.push(o) } })).share({ title: 'T', text: 'Hallo', url: 'https://x' });
    assert.deepStrictEqual(s, { ok: true, state: 'ok', where: 'share' });
    assert.deepStrictEqual(shared, [{ title: 'T', text: 'Hallo', url: 'https://x' }]);
    const copied = [];
    const abort = await lib.create(browser({ navigator: { share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, clipboard: { writeText: async t => copied.push(t) } } })).share({ text: 'A' });
    assert.strictEqual(abort.state, 'cancelled'); assert.deepStrictEqual(copied, []);
    const fallback = await lib.create(browser({ navigator: { share: async () => { throw new Error('NotAllowed'); }, clipboard: { writeText: async t => copied.push(t) } } })).share({ text: 'A', url: 'https://u' });
    assert.deepStrictEqual(fallback, { ok: true, state: 'ok', where: 'clipboard' });
    assert.deepStrictEqual(copied, ['A\nhttps://u']);
    const manual = await lib.create(browser({ navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } })).share({ text: 'B' });
    assert.strictEqual(manual.ok, false); assert.strictEqual(manual.where, 'manual'); assert.strictEqual(manual.body, 'B'); assert.ok(manual.text);
    const none = await lib.create({}).share({ text: 'C' });
    assert.strictEqual(none.where, 'manual'); assert.strictEqual(none.body, 'C');
  });

  await test('Teilen in der App nutzt das Share-Plugin', async () => {
    const got = [];
    const C = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Share: { share: async o => got.push(o) } } };
    const r = await lib.create(browser({ Capacitor: C, navigator: { share: async () => { throw new Error('nicht nehmen'); } } })).share({ title: 'T', text: 'x' });
    assert.strictEqual(r.where, 'share'); assert.deepStrictEqual(got, [{ title: 'T', text: 'x' }]);
  });

  await test('Drucken: Browser ja, App mit Hinweis, Fehler mit Text', () => {
    const env = browser(), p = lib.create(env);
    assert.deepStrictEqual(p.print(), { ok: true, state: 'ok', where: 'print' }); assert.strictEqual(env._printed, 1);
    const app = lib.create(browser({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} } }));
    const r = app.print(); assert.strictEqual(r.state, 'unavailable'); assert.ok(/App/.test(r.text));
    const bad = lib.create(browser({ window: { print() { throw new Error('x'); } } })).print();
    assert.strictEqual(bad.state, 'error');
  });

  await test('Standort: gerundet auf ~1 km, Ablehnung und Fehler mit Text', async () => {
    let opts;
    const geo = (pos, err) => ({ geolocation: { getCurrentPosition: (ok, no, o) => { opts = o; pos ? ok(pos) : no(err); } } });
    const r = await lib.create(browser({ navigator: geo({ coords: { latitude: 48.66789, longitude: 9.58321, accuracy: 23.6 } }) })).geo.current();
    assert.deepStrictEqual(r, { ok: true, state: 'ok', where: 'geo', lat: 48.67, lon: 9.58, acc: 24, rounded: true });
    assert.strictEqual(opts.enableHighAccuracy, false); assert.strictEqual(opts.timeout, 10000);
    const precise = await lib.create(browser({ navigator: geo({ coords: { latitude: 48.667891, longitude: 9.583212 } }) })).geo.current({ precise: true, timeoutMs: 5 });
    assert.strictEqual(precise.lat, 48.66789); assert.strictEqual(precise.rounded, false); assert.strictEqual(precise.acc, null); assert.strictEqual(opts.timeout, 1000);
    const denied = await lib.create(browser({ navigator: geo(null, { code: 1 }) })).geo.current();
    assert.strictEqual(denied.state, 'cancelled');
    const timeout = await lib.create(browser({ navigator: geo(null, { code: 3 }) })).geo.current();
    assert.strictEqual(timeout.state, 'error');
    const none = await lib.create({}).geo.current();
    assert.strictEqual(none.state, 'unavailable'); assert.ok(/Ort eingeben/.test(none.text));
  });

  console.log('platform: ' + n + ' Prüfungen bestanden');
})().catch(e => { console.error(e); process.exit(1); });
