/* RPPhotos · lokale Fotoablage (Paket 5, docs/PLAN_IOS_APP.md §6.1–6.3, Phase P2; Vertrag docs/SCHEMA_V4.md §2).
   Noch NICHT an die App angebunden; Einbindung siehe pakete/fotos/EINBINDUNG.md. Speicherformat rp-trips unverändert.

   Bausteine:
     * Ablage: eigene IndexedDB-Datenbank "rp-media" (getrennt von "reiseplaner"). Objektspeicher "meta" mit kleinen
       Datensätzen {key, id, variant, type, size, w, h, sha256, at} und "data" mit {key, bytes:ArrayBuffer}; key = "<id>:<variant>".
       Varianten: work (Arbeitskopie, Pflicht), thumb (Vorschaubild, Pflicht), original (optional). Bytes statt Blob, weil
       ältere WebKit-Versionen Blobs in IndexedDB nicht zuverlässig speichern; die Anzeige baut sich daraus einen Blob.
       Ein Foto wird in EINER Transaktion geschrieben (alle Varianten oder keine), danach zurückgelesen und verglichen.
       Fehler (kein IndexedDB, Kontingent, Rücklesevergleich) liefern immer eine Ablehnung mit Grund, nie stillen Erfolg.
     * Größen: lange Kante 2048 px (Arbeitskopie) und 400 px (Vorschau), nie vergrößert. Byte-Angaben stammen immer aus
       der tatsächlich erzeugten Datei, nie aus einer Schätzung.
     * EXIF-Leser (nur JPEG): Aufnahmezeit, Ausrichtung, GPS und Pixelmaße aus dem SOF-Kopf. Wirft nie bei kaputten Daten,
       sondern liefert null und Hinweise. removeLocation entfernt GPS, XMP und IPTC aus einer JPEG-Datei.
     * Zuordnung (§6.2): Vorschlag für Reisetag und Unternehmung bzw. Katalog-Attraktion (Luftlinie ≤ 1 km, Haversine aus
       catalog.js). Immer needsReview; übernommen wird nur mit applyChoice(..., {confirmed:true}).
     * prepare(): Datei → Arbeitskopie, Vorschau, optional Original, Medieneintrag (besteht RPV4.normalizeMedia).
       Dekodieren und Kodieren macht ein Codec (env.decode/env.encode); browserCodec() ist der Canvas-Weg im Web.
   UMD wie v4logic.js: window.RPPhotos im Browser, module.exports in Node. */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = function () {
    var V4 = null, C = null;
    if (node) { try { V4 = require('./v4logic.js'); } catch (e) { V4 = null; } try { C = require('./catalog.js'); } catch (e) { C = null; } }
    return { V4: V4 || (root && root.RPV4) || null, C: C || (root && root.RPCatalog) || null };
  };
  var api = factory(deps, root);
  if (node) module.exports = api;
  else if (root) root.RPPhotos = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this, function (deps, root) {
  'use strict';

  var DB_NAME = 'rp-media', DB_VERSION = 1, META = 'meta', DATA = 'data', TIMEOUT = 4000;
  var VARIANTS = ['work', 'thumb', 'original'];
  var SIZES = Object.freeze({ work: 2048, thumb: 400 });
  var QUALITY = Object.freeze({ work: 0.82, thumb: 0.75 });
  var RADIUS_KM = 1;          /* §6.2: Umkreis für Unternehmung/Attraktion */
  var AMBIGUOUS_M = 100;      /* zwei Treffer, deren Abstand sich um weniger unterscheidet, gelten als mehrdeutig */
  var ID = /^[a-z][a-z0-9]{3,40}$/, ACT = /^[A-Za-z0-9_-]{1,60}$/, SPOT = /^[a-z0-9][a-z0-9-]{0,79}$/;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var TAKEN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-](0\d|1[0-4]):[0-5]\d)?$/;
  var RESERVED = ['__proto__', 'constructor', 'prototype'];

  function fail(msg, name) { var e = new Error(msg); if (name) e.name = name; throw e; }
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  /* Web Crypto aus der globalen Umgebung (Browser, Worker, Node ≥ 20) */
  function gcrypto() { return (root && root.crypto) || (typeof crypto !== 'undefined' ? crypto : null); }
  function V4() { var v = deps().V4; if (!v) fail('photostore.js braucht v4logic.js (RPV4).'); return v; }

  /* ---------- Bytes ---------- */
  function toU8(x) {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (x && ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    fail('Bilddaten: Bytes erwartet (ArrayBuffer oder Uint8Array).');
  }
  /* Eigenständige Kopie als ArrayBuffer (für IndexedDB und Rückgaben) */
  function bufOf(u8) { return u8.slice().buffer; }
  async function readBytes(file) {
    if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
    if (file && (file.bytes != null)) return toU8(file.bytes);
    return toU8(file);
  }
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }

  /* ---------- SHA-256 ----------
     Web Crypto (crypto.subtle) gibt es nur in sicheren Kontexten (https, localhost). Beim Test über
     http://<PC-IP>:8000 im WLAN fehlt es auf dem iPhone, deshalb eine eigene Umsetzung als Rückfall (gleiches Ergebnis). */
  var K = (function () {
    var k = [], n = 2;
    while (k.length < 64) {
      var prime = true;
      for (var d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (prime) k.push((Math.pow(n, 1 / 3) % 1) * 4294967296 | 0);
      n++;
    }
    return k;
  })();
  function sha256Sync(data) {
    var m = toU8(data), len = m.length, total = ((len + 9 + 63) >> 6) << 6, b = new Uint8Array(total);
    b.set(m); b[len] = 0x80;
    var bits = len * 8, hi = Math.floor(bits / 4294967296);
    b[total - 8] = hi >>> 24; b[total - 7] = hi >>> 16; b[total - 6] = hi >>> 8; b[total - 5] = hi;
    b[total - 4] = bits >>> 24; b[total - 3] = bits >>> 16; b[total - 2] = bits >>> 8; b[total - 1] = bits;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Int32Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) w[t] = (b[off + 4 * t] << 24) | (b[off + 4 * t + 1] << 16) | (b[off + 4 * t + 2] << 8) | b[off + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], c = H[2], dd = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + dd) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = H[i] >>> 16; out[4 * i + 2] = H[i] >>> 8; out[4 * i + 3] = H[i]; }
    return hex(out);
  }
  /* env.subtle: null erzwingt den Rückfall (Tests), undefined nimmt crypto.subtle, falls vorhanden */
  async function sha256(data, env) {
    var u = toU8(data), subtle = env && own(env, 'subtle') ? env.subtle : (gcrypto() && gcrypto().subtle) || null;
    if (subtle && typeof subtle.digest === 'function') {
      try { return hex(new Uint8Array(await subtle.digest('SHA-256', u))); } catch (e) { /* Rückfall unten, gleiches Ergebnis */ }
    }
    return sha256Sync(u);
  }

  /* ---------- Dateiart (an den ersten Bytes, nicht an Name oder MIME-Angabe) ---------- */
  function sniff(data) {
    var u = toU8(data), s = function (a, n) { return String.fromCharCode.apply(null, Array.prototype.slice.call(u, a, a + n)); };
    if (u.length >= 3 && u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'image/jpeg';
    if (u.length >= 8 && u[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
    if (u.length >= 12 && s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
    if (u.length >= 6 && /^GIF8[79]a$/.test(s(0, 6))) return 'image/gif';
    if (u.length >= 12 && s(4, 4) === 'ftyp') {
      var brand = s(8, 4);
      if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].indexOf(brand) >= 0) return 'image/heic';
      if (brand === 'avif' || brand === 'avis') return 'image/avif';
    }
    return null;
  }

  /* ---------- JPEG-Segmente ---------- */
  var SOF = [0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF];
  /* Segmente bis zum Bildbeginn (SOS). Liefert {list:[{marker,start,dataStart,end}], sos, ok}. Wirft nicht. */
  function segments(u) {
    var list = [], i = 2, guard = 0;
    if (!(u.length >= 4 && u[0] === 0xFF && u[1] === 0xD8)) return { list: list, sos: -1, ok: false };
    while (i + 1 < u.length && guard++ < 4096) {
      if (u[i] !== 0xFF) return { list: list, sos: -1, ok: false };
      var j = i; while (j < u.length && u[j] === 0xFF) j++;   /* Füllbytes */
      if (j >= u.length) break;
      var m = u[j];
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i = j + 1; continue; }
      if (m === 0xD9) return { list: list, sos: -1, ok: true };
      if (j + 2 >= u.length) break;
      var len = (u[j + 1] << 8) | u[j + 2];
      if (len < 2 || j + 1 + len > u.length) return { list: list, sos: -1, ok: false };
      if (m === 0xDA) return { list: list, sos: i, ok: true };
      list.push({ marker: m, start: i, dataStart: j + 3, end: j + 1 + len });
      i = j + 1 + len;
    }
    return { list: list, sos: -1, ok: false };
  }
  function segAscii(u, seg, n) { return String.fromCharCode.apply(null, Array.prototype.slice.call(u, seg.dataStart, Math.min(seg.end, seg.dataStart + n))); }
  var XMP_IDS = ['http://ns.adobe.com/xap/1.0/\0', 'http://ns.adobe.com/xmp/extension/\0'];
  function isExif(u, seg) { return seg.marker === 0xE1 && segAscii(u, seg, 6) === 'Exif\0\0'; }
  function isXmp(u, seg) { return seg.marker === 0xE1 && XMP_IDS.some(function (x) { return segAscii(u, seg, x.length) === x; }); }

  /* ---------- TIFF/EXIF ---------- */
  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  function tiff(u, base, end) {
    if (base + 8 > end) return null;
    var le = u[base] === 0x49 && u[base + 1] === 0x49, be = u[base] === 0x4D && u[base + 1] === 0x4D;
    if (!le && !be) return null;
    var u16 = function (p) { return p + 2 > end ? null : le ? u[p] | (u[p + 1] << 8) : (u[p] << 8) | u[p + 1]; };
    var u32 = function (p) { return p + 4 > end ? null : (le ? (u[p] | (u[p + 1] << 8) | (u[p + 2] << 16)) + u[p + 3] * 16777216 : ((u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3]) + u[p] * 16777216); };
    if (u16(base + 2) !== 42) return null;
    var T = { u: u, base: base, end: end, le: le, u16: u16, u32: u32 };
    /* Einträge eines IFD; at = absolute Position. Liefert null bei ungültiger Lage. */
    T.ifd = function (rel) {
      if (rel == null || rel < 8) return null;
      var at = base + rel, n = u16(at);
      if (n == null || n > 1000 || at + 2 + n * 12 + 4 > end) return null;
      var out = [];
      for (var k = 0; k < n; k++) {
        var p = at + 2 + k * 12, type = u16(p + 2), count = u32(p + 4), size = (TYPE_SIZE[type] || 0) * count;
        var valueAt = size <= 4 ? p + 8 : base + u32(p + 8);
        out.push({ tag: u16(p), type: type, count: count, size: size, entry: p, valueAt: valueAt, ok: !!TYPE_SIZE[type] && valueAt + size <= end && valueAt >= base });
      }
      return { at: at, n: n, entries: out };
    };
    T.find = function (ifd, tag) { if (!ifd) return null; for (var k = 0; k < ifd.entries.length; k++) if (ifd.entries[k].tag === tag) return ifd.entries[k]; return null; };
    T.ascii = function (e) {
      if (!e || !e.ok || e.type !== 2 || e.count > 256) return null;
      var s = ''; for (var k = 0; k < e.count; k++) { var ch = u[e.valueAt + k]; if (ch === 0) break; s += String.fromCharCode(ch); }
      return s;
    };
    T.short = function (e) { return e && e.ok && e.type === 3 && e.count >= 1 ? u16(e.valueAt) : e && e.ok && e.type === 4 && e.count >= 1 ? u32(e.valueAt) : null; };
    T.long = function (e) { return e && e.ok && (e.type === 4 || e.type === 13) && e.count >= 1 ? u32(e.valueAt) : null; };
    T.rationals = function (e, n) {
      if (!e || !e.ok || e.type !== 5 || e.count < n) return null;
      var out = [];
      for (var k = 0; k < n; k++) { var num = u32(e.valueAt + 8 * k), den = u32(e.valueAt + 8 * k + 4); if (!den) return null; out.push(num / den); }
      return out;
    };
    return T;
  }
  var TAG = { orientation: 0x0112, exifIfd: 0x8769, gpsIfd: 0x8825, original: 0x9003, offset: 0x9011, subsec: 0x9291,
    latRef: 1, lat: 2, lonRef: 3, lon: 4 };

  /* EXIF-Datum „JJJJ:MM:TT hh:mm:ss“ (+ Sekundenbruchteil, + Versatz) → ISO wie SCHEMA_V4 §2, sonst null.
     Ohne Versatz bleibt es eine Ortszeit der Kamera; es wird keine Zeitzone ergänzt. */
  function exifTime(dt, sub, off) {
    var x = typeof dt === 'string' && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(dt);
    if (!x) return null;
    var date = x[1] + '-' + x[2] + '-' + x[3];
    if (!validDate(date) || +x[1] < 1800 || +x[4] > 23 || +x[5] > 59 || +x[6] > 59) return null;
    var s = date + 'T' + x[4] + ':' + x[5] + ':' + x[6];
    var ms = typeof sub === 'string' && /^\d+/.exec(sub.trim());
    if (ms) s += '.' + ms[0].slice(0, 3);
    var o = typeof off === 'string' && /^([+-])(\d{2}):(\d{2})$/.exec(off.trim());
    if (o && +o[2] <= 14 && +o[3] <= 59) s += o[1] + o[2] + ':' + o[3];
    return TAKEN.test(s) ? s : null;
  }

  /* Liest nur, was §6 braucht. Wirft nie; Unlesbares wird null und als Hinweis gemeldet. */
  function readExif(data) {
    var u = toU8(data), out = { type: sniff(u), width: null, height: null, orientation: null, takenAt: null, gps: null, gpsEntries: 0, hasExif: false, hasXmp: false, hasIptc: false, warnings: [] };
    if (out.type !== 'image/jpeg') { if (out.type) out.warnings.push('EXIF wird nur aus JPEG gelesen (' + out.type + ').'); else out.warnings.push('Kein bekanntes Bildformat.'); return out; }
    var segs = segments(u);
    if (!segs.ok) out.warnings.push('JPEG-Aufbau unvollständig oder beschädigt.');
    segs.list.forEach(function (seg) {
      if (SOF.indexOf(seg.marker) >= 0 && out.width == null && seg.dataStart + 5 <= seg.end) {
        var h = (u[seg.dataStart + 1] << 8) | u[seg.dataStart + 2], w = (u[seg.dataStart + 3] << 8) | u[seg.dataStart + 4];
        if (w > 0 && h > 0) { out.width = w; out.height = h; }
      }
      if (isXmp(u, seg)) out.hasXmp = true;
      if (seg.marker === 0xED) out.hasIptc = true;
      if (!isExif(u, seg) || out.hasExif) return;
      out.hasExif = true;
      var T = tiff(u, seg.dataStart + 6, seg.end);
      if (!T) { out.warnings.push('EXIF-Kopf unlesbar.'); return; }
      var ifd0 = T.ifd(T.u32(T.base + 4));
      if (!ifd0) { out.warnings.push('EXIF-Verzeichnis unlesbar.'); return; }
      var o = T.short(T.find(ifd0, TAG.orientation));
      if (o >= 1 && o <= 8) out.orientation = o;
      var exifPtr = T.long(T.find(ifd0, TAG.exifIfd)), ex = exifPtr != null ? T.ifd(exifPtr) : null;
      if (exifPtr != null && !ex) out.warnings.push('EXIF-Unterverzeichnis unlesbar.');
      if (ex) {
        var raw = T.ascii(T.find(ex, TAG.original));
        out.takenAt = exifTime(raw, T.ascii(T.find(ex, TAG.subsec)), T.ascii(T.find(ex, TAG.offset)));
        if (raw && !out.takenAt) out.warnings.push('Aufnahmezeit unlesbar („' + raw.slice(0, 19) + '“).');
      }
      var gpsPtr = T.long(T.find(ifd0, TAG.gpsIfd)), g = gpsPtr != null ? T.ifd(gpsPtr) : null;
      if (gpsPtr != null && !g) out.warnings.push('GPS-Verzeichnis unlesbar.');
      if (g) out.gpsEntries = g.n;
      if (g && g.n) {
        var la = T.rationals(T.find(g, TAG.lat), 3), lo = T.rationals(T.find(g, TAG.lon), 3);
        var laR = T.ascii(T.find(g, TAG.latRef)), loR = T.ascii(T.find(g, TAG.lonRef));
        if (la && lo && /^[NS]$/.test(laR || '') && /^[EW]$/.test(loR || '')) {
          var lat = (la[0] + la[1] / 60 + la[2] / 3600) * (laR === 'S' ? -1 : 1), lon = (lo[0] + lo[1] / 60 + lo[2] / 3600) * (loR === 'W' ? -1 : 1);
          if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.gps = { lat: lat, lon: lon };
          else out.warnings.push('GPS-Angabe außerhalb des gültigen Bereichs.');
        } else if (T.find(g, TAG.lat) || T.find(g, TAG.lon)) out.warnings.push('GPS-Angabe unvollständig oder unlesbar.');
      }
    });
    return out;
  }

  /* Standort entfernen (PLAN_IOS_APP §6.3): leert das GPS-Verzeichnis im EXIF (Aufnahmezeit und Ausrichtung bleiben),
     entfernt XMP (kann exif:GPS… enthalten) und IPTC/APP13 (Ortsnamen). Ist das EXIF nicht sicher lesbar, fällt das ganze
     EXIF-Segment weg. Gibt eine neue Datei zurück; die Eingabe bleibt unverändert. Danach wird nachgeprüft. */
  function removeLocation(data) {
    var src = toU8(data);
    if (sniff(src) !== 'image/jpeg') fail('Standort entfernen: nur JPEG möglich.');
    var segs = segments(src);
    if (!segs.ok) fail('Standort entfernen: JPEG-Aufbau beschädigt, Datei wird nicht übernommen.');
    var u = src.slice(), drop = [], removed = { gps: false, xmp: false, iptc: false, exif: false };
    segs.list.forEach(function (seg) {
      if (isXmp(u, seg)) { drop.push(seg); removed.xmp = true; return; }
      if (seg.marker === 0xED) { drop.push(seg); removed.iptc = true; return; }
      if (!isExif(u, seg)) return;
      var T = tiff(u, seg.dataStart + 6, seg.end), ifd0 = T && T.ifd(T.u32(T.base + 4));
      if (!ifd0) { drop.push(seg); removed.exif = true; return; }
      var ptr = T.find(ifd0, TAG.gpsIfd);
      if (!ptr) return;
      var g = T.ifd(T.long(ptr));
      if (!g) { drop.push(seg); removed.exif = true; return; }
      g.entries.forEach(function (e) { if (e.size > 4 && e.ok) u.fill(0, e.valueAt, e.valueAt + e.size); });
      u.fill(0, g.at, g.at + 2 + g.n * 12 + 4);   /* Anzahl 0, keine Einträge, kein Folgeverzeichnis */
      if (g.n) removed.gps = true;
    });
    if (drop.length) {
      var parts = [], pos = 0;
      drop.sort(function (a, b) { return a.start - b.start; }).forEach(function (s) { parts.push(u.subarray(pos, s.start)); pos = s.end; });
      parts.push(u.subarray(pos));
      var n = parts.reduce(function (a, p) { return a + p.length; }, 0), joined = new Uint8Array(n), at = 0;
      parts.forEach(function (p) { joined.set(p, at); at += p.length; });
      u = joined;
    }
    var check = readExif(u);
    if (check.gps || check.gpsEntries || check.hasXmp || check.hasIptc) fail('Standort entfernen: Nachprüfung fehlgeschlagen, Datei wird nicht übernommen.');
    return { bytes: u, removed: removed };
  }

  /* ---------- Größen (§6.3) ---------- */
  function positiveInt(v) { return typeof v === 'number' && Number.isInteger(v) && v > 0; }
  /* Ausrichtung 5–8 vertauscht Breite und Höhe (Kamera hochkant) */
  function orientedSize(w, h, orientation) {
    if (!positiveInt(w) || !positiveInt(h)) fail('Bildgröße ungültig.');
    return orientation >= 5 && orientation <= 8 ? { w: h, h: w } : { w: w, h: h };
  }
  /* Lange Kante auf max, Seitenverhältnis bleibt, nie vergrößern, mindestens 1 px. */
  function fitSize(w, h, max) {
    if (!positiveInt(w) || !positiveInt(h) || !positiveInt(max)) fail('Bildgröße ungültig.');
    var long = Math.max(w, h);
    if (long <= max) return { w: w, h: h, scaled: false };
    var f = max / long;
    return w >= h ? { w: max, h: Math.max(1, Math.round(h * f)), scaled: true } : { w: Math.max(1, Math.round(w * f)), h: max, scaled: true };
  }
  /* Ziele aus der Größe des dekodierten (bereits richtig gedrehten) Bildes; das Vorschaubild folgt der Arbeitskopie. */
  function planSizes(w, h, sizes) {
    var s = sizes || SIZES, work = fitSize(w, h, s.work);
    return { source: { w: w, h: h }, work: work, thumb: fitSize(work.w, work.h, s.thumb) };
  }

  /* ---------- Zuordnung (§6.2) ---------- */
  function airKm(a, b) {
    var C = deps().C;
    if (C && typeof C.airKm === 'function') return C.airKm(a, b);
    var rad = function (x) { return x * Math.PI / 180; }, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function point(o) {
    var p = o && (o.geo || o);
    return p && typeof p.lat === 'number' && typeof p.lon === 'number' && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? { lat: p.lat, lon: p.lon } : null;
  }
  function dayKeyOf(d) { return d.date != null ? d.date : 'd' + d.i; }
  function readDays(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (d) {
      if (!d || !Number.isInteger(d.i) || d.i < 0 || own(seen, d.i)) return false;
      if (d.date != null && !validDate(d.date)) return false;
      if (d.date == null && d.i > 9999) return false;
      seen[d.i] = 1; return true;
    });
  }
  function nearest(list, at, radiusKm) {
    var hits = list.map(function (x) { return { id: x.id, km: airKm(at, x.p) }; }).filter(function (x) { return x.km <= radiusKm; })
      .sort(function (a, b) { return a.km - b.km || (a.id < b.id ? -1 : 1); });
    return { hits: hits, ambiguous: hits.length > 1 && (hits[1].km - hits[0].km) * 1000 < AMBIGUOUS_M };
  }
  /* photo: {takenAt, lat?, lon?} (EXIF-Ergebnis mit gps oder Medieneintrag).
     ctx: {days:[{i, date|null}], acts:[{id, days?:[i], day?, lat/lon oder geo, spotId?|catalogSpot?}], spots:[{id, lat, lon}], radiusKm}.
     Ergebnis ist immer ein Vorschlag (needsReview: true); nichts wird übernommen. */
  function suggest(photo, ctx) {
    ctx = ctx || {};
    var days = readDays(ctx.days), radius = typeof ctx.radiusKm === 'number' && ctx.radiusKm > 0 ? ctx.radiusKm : RADIUS_KM;
    var r = { needsReview: true, day: null, dayIndex: null, dayWhy: null, basket: false, actId: null, spotId: null, distanceM: null, placeWhy: null, candidates: [] };
    var taken = photo && typeof photo.takenAt === 'string' && TAKEN.exec(photo.takenAt);
    if (!taken || !validDate(taken[1])) r.dayWhy = 'ohne-zeit';
    else if (!days.length || days.every(function (d) { return d.date == null; })) r.dayWhy = 'ohne-daten';
    else {
      var hit = days.filter(function (d) { return d.date === taken[1]; })[0];
      if (hit) { r.day = dayKeyOf(hit); r.dayIndex = hit.i; r.dayWhy = 'datum'; } else r.dayWhy = 'ausserhalb';
    }
    r.basket = r.day === null;   /* Korb „ohne Tag“ */
    var at = point(photo && photo.gps ? photo.gps : photo);
    if (!at) { r.placeWhy = 'kein-standort'; return r; }
    if (r.dayWhy === 'ausserhalb') { r.placeWhy = 'ausserhalb'; return r; }
    var acts = (Array.isArray(ctx.acts) ? ctx.acts : []).filter(function (a) {
      if (!a || typeof a.id !== 'string' || !ACT.test(a.id) || RESERVED.indexOf(a.id) >= 0 || !point(a)) return false;
      if (r.dayIndex == null) return true;
      var ds = Array.isArray(a.days) ? a.days : Number.isInteger(a.day) ? [a.day] : [];
      return ds.indexOf(r.dayIndex) >= 0;
    }).map(function (a) { return { id: a.id, p: point(a), spot: SPOT.test(a.spotId || '') ? a.spotId : SPOT.test(a.catalogSpot || '') ? a.catalogSpot : null }; });
    var near = nearest(acts, at, radius);
    near.hits.forEach(function (h) { r.candidates.push({ kind: 'unternehmung', id: h.id, distanceM: Math.round(h.km * 1000) }); });
    if (near.hits.length) {
      if (near.ambiguous) { r.placeWhy = 'mehrdeutig'; return r; }
      var a = acts.filter(function (x) { return x.id === near.hits[0].id; })[0];
      r.actId = a.id; r.spotId = a.spot; r.distanceM = Math.round(near.hits[0].km * 1000); r.placeWhy = 'unternehmung';
      return r;
    }
    var spots = (Array.isArray(ctx.spots) ? ctx.spots : []).filter(function (s) { return s && typeof s.id === 'string' && SPOT.test(s.id) && point(s); })
      .map(function (s) { return { id: s.id, p: point(s) }; });
    var ns = nearest(spots, at, radius);
    ns.hits.forEach(function (h) { r.candidates.push({ kind: 'attraktion', id: h.id, distanceM: Math.round(h.km * 1000) }); });
    if (!ns.hits.length) { r.placeWhy = 'nichts-im-umkreis'; return r; }
    if (ns.ambiguous) { r.placeWhy = 'mehrdeutig'; return r; }
    r.spotId = ns.hits[0].id; r.distanceM = Math.round(ns.hits[0].km * 1000); r.placeWhy = 'attraktion';
    return r;
  }
  /* Prüfliste „passt / ändern“: Vorschläge in Aufnahmereihenfolge (ohne Zeit zuletzt), Korb „ohne Tag“ getrennt.
     photos: [{id, takenAt, lat?, lon?}] */
  function reviewList(photos, ctx) {
    var rows = (Array.isArray(photos) ? photos : []).map(function (p, n) { return { id: p && p.id, n: n, takenAt: p && p.takenAt || null, suggestion: suggest(p, ctx) }; });
    rows.sort(function (a, b) {
      if (a.takenAt !== b.takenAt) { if (!a.takenAt) return 1; if (!b.takenAt) return -1; return a.takenAt < b.takenAt ? -1 : 1; }
      return a.n - b.n;
    });
    return { rows: rows.filter(function (x) { return !x.suggestion.basket; }), basket: rows.filter(function (x) { return x.suggestion.basket; }) };
  }
  /* Übernimmt eine bestätigte Wahl (day, actId, spotId; null entfernt) in eine neue Kopie des Eintrags.
     Ohne {confirmed:true} wird nichts übernommen. Ergebnis ist geprüft (RPV4.normalizeMedia). */
  function applyChoice(entry, choice, opts) {
    if (!opts || opts.confirmed !== true) fail('Zuordnung: nur nach Bestätigung übernehmen.');
    if (!choice || typeof choice !== 'object') fail('Zuordnung: Auswahl fehlt.');
    var next = JSON.parse(JSON.stringify(entry));
    if (own(choice, 'day')) next.day = choice.day;
    ['actId', 'spotId'].forEach(function (k) { if (own(choice, k)) { if (choice[k] == null) delete next[k]; else next[k] = choice[k]; } });
    return V4().normalizeMedia(next);
  }

  /* ---------- Import einer Datei ---------- */
  function newId(env) {
    var rnd = env && env.random, bytes = new Uint8Array(10);
    if (typeof rnd === 'function') rnd(bytes);
    else if (gcrypto() && gcrypto().getRandomValues) gcrypto().getRandomValues(bytes);
    else fail('Keine Zufallsquelle für Foto-IDs.');
    var s = 'f'; for (var i = 0; i < bytes.length; i++) s += (bytes[i] % 36).toString(36);
    return s;
  }
  /* file: Blob/File oder {bytes}. opts: {id?, keepOriginal:false, keepLocation:false, existing:[media], ctx?}.
     env: {decode(bytes, type) → {w, h, img, close?}, encode(src, w, h, {quality}) → Bytes (JPEG), subtle?, random?}.
     Liefert {entry, files:{work, thumb, original?}, exif, suggestion, notes} oder {duplicate: id}. Nichts wird gespeichert. */
  async function prepare(file, opts, env) {
    opts = opts || {}; env = env || {};
    if (typeof env.decode !== 'function' || typeof env.encode !== 'function') fail('Foto-Import: Codec fehlt (decode/encode).');
    var bytes = await readBytes(file), type = sniff(bytes), notes = [];
    if (!type) fail('Foto-Import: kein unterstütztes Bildformat (JPEG, PNG, HEIC, WebP, GIF, AVIF).');
    var exif = readExif(bytes);
    if (type !== 'image/jpeg') notes.push('Aufnahmezeit und Standort werden im Web nur aus JPEG gelesen; bitte Tag selbst wählen.');
    var decoded;
    try { decoded = await env.decode(bytes, type); }
    catch (e) { fail(type === 'image/heic' ? 'Foto-Import: HEIC kann dieser Browser nicht lesen (Safari und die App können es).' : 'Foto-Import: Bild konnte nicht gelesen werden.'); }
    try {
      if (!decoded || !positiveInt(decoded.w) || !positiveInt(decoded.h)) fail('Foto-Import: Bildgröße nicht lesbar.');
      var plan = planSizes(decoded.w, decoded.h);
      var files = {};
      for (var v of ['work', 'thumb']) {
        var out = toU8(await env.encode(decoded, plan[v].w, plan[v].h, { quality: QUALITY[v] })).slice();
        var info = readExif(out);
        if (info.type !== 'image/jpeg') fail('Foto-Import: Kodierung lieferte kein JPEG.');
        /* gemessene Maße der erzeugten Datei; nur wenn unlesbar, die angeforderte Canvas-Größe */
        files[v] = { bytes: out, type: 'image/jpeg', w: info.width || plan[v].w, h: info.height || plan[v].h };
      }
    } finally { if (decoded && typeof decoded.close === 'function') try { decoded.close(); } catch (e) { /* nichts */ } }
    var sum = await sha256(files.work.bytes, env);
    var dup = (Array.isArray(opts.existing) ? opts.existing : []).filter(function (m) { return m && m.sha256 === sum; })[0];
    if (dup) return { duplicate: dup.id, notes: ['Dieses Bild ist schon in der Reise.'] };
    if (opts.keepOriginal === true) {
      if (opts.keepLocation === true) files.original = { bytes: bytes.slice(), type: type, w: exif.width, h: exif.height };
      else if (type === 'image/jpeg') files.original = { bytes: removeLocation(bytes).bytes, type: type, w: exif.width, h: exif.height };
      else notes.push('Original nicht gespeichert: Standort lässt sich aus ' + type + ' nicht sicher entfernen.');
    }
    var input = { id: opts.id || newId(env), takenAt: exif.takenAt, w: files.work.w, h: files.work.h, bytes: files.work.bytes.length, sha256: sum };
    if (opts.keepLocation === true && exif.gps) { input.lat = exif.gps.lat; input.lon = exif.gps.lon; }
    var entry = V4().normalizeMedia(input);
    var suggestion = opts.ctx ? suggest({ takenAt: exif.takenAt, gps: exif.gps }, opts.ctx) : null;
    if (!exif.takenAt) notes.push('Keine Aufnahmezeit gefunden; das Foto landet im Korb „ohne Tag“.');
    return { entry: entry, files: files, exif: { takenAt: exif.takenAt, orientation: exif.orientation, hasGps: !!exif.gps, warnings: exif.warnings }, suggestion: suggestion, notes: notes };
  }

  /* Canvas-Weg fürs Web (nicht in Node getestet). createImageBitmap mit imageOrientation 'from-image' dreht nach EXIF;
     ohne createImageBitmap über <img>. Transparente Flächen werden weiß, weil JPEG keine Transparenz kennt. */
  function browserCodec(g) {
    g = g || root;
    return {
      decode: async function (bytes, type) {
        var blob = new g.Blob([bytes], { type: type });
        if (typeof g.createImageBitmap === 'function') {
          try { var bmp = await g.createImageBitmap(blob, { imageOrientation: 'from-image' }); return { w: bmp.width, h: bmp.height, img: bmp, close: function () { if (bmp.close) bmp.close(); } }; }
          catch (e) { /* weiter mit <img> */ }
        }
        var url = g.URL.createObjectURL(blob), img = new g.Image();
        img.src = url;
        try { await img.decode(); } catch (e) { g.URL.revokeObjectURL(url); throw e; }
        return { w: img.naturalWidth, h: img.naturalHeight, img: img, close: function () { g.URL.revokeObjectURL(url); } };
      },
      encode: async function (src, w, h, o) {
        var c = typeof g.OffscreenCanvas === 'function' ? new g.OffscreenCanvas(w, h) : Object.assign(g.document.createElement('canvas'), { width: w, height: h });
        var cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(src.img, 0, 0, w, h);
        var blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/jpeg', quality: o && o.quality })
          : await new Promise(function (res, rej) { c.toBlob(function (b) { if (b) res(b); else rej(new Error('Kodierung fehlgeschlagen')); }, 'image/jpeg', o && o.quality); });
        c.width = c.height = 0;   /* Speicher früh freigeben (iOS) */
        return new Uint8Array(await blob.arrayBuffer());
      }
    };
  }

  /* ---------- Ablage in IndexedDB ---------- */
  function reason(e) {
    var n = e && e.name || '';
    if (n === 'QuotaExceededError') return 'Speicherplatz für Fotos erschöpft (QuotaExceededError)';
    if (n === 'InvalidStateError' || n === 'SecurityError') return 'Fotoablage ist in diesem Browsermodus nicht nutzbar (' + n + ')';
    if (n === 'VersionError') return 'Fotoablage gehört zu einer neueren App-Version (VersionError)';
    if (n === 'TimeoutError') return 'Fotoablage antwortet nicht (Zeitüberschreitung)';
    return String(e && e.message || e || 'Unbekannter Fehler').slice(0, 200);
  }
  function wrap(e) { var x = new Error(reason(e)); x.name = e && e.name || 'Error'; x.cause = e; return x; }
  function keyOf(id, variant) { return id + ':' + variant; }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('Fotoablage: ungültige Foto-ID.'); }
  function checkVariant(v) { if (VARIANTS.indexOf(v) < 0) fail('Fotoablage: unbekannte Variante.'); }

  function create(env) {
    env = env || {};
    var db = null, opening = null;
    var ms = env.timeoutMs || TIMEOUT, now = env.now || function () { return new Date().toISOString(); };
    function open() {
      if (db) return Promise.resolve(db);
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        var factory, done = false, r, timer;
        var finish = function (err, d) {
          if (done) { if (d) try { d.close(); } catch (e) { /* nichts */ } return; }
          done = true; clearTimeout(timer); opening = null;
          if (err) reject(wrap(err)); else { db = d; db.onversionchange = function () { try { db.close(); } catch (e) { /* nichts */ } db = null; }; resolve(db); }
        };
        try { factory = env.indexedDB ? env.indexedDB() : root && root.indexedDB; } catch (e) { finish(e); return; }
        if (!factory) { finish(Object.assign(new Error('Fotoablage: IndexedDB fehlt in diesem Browser'), { name: 'NotSupportedError' })); return; }
        timer = setTimeout(function () { finish(Object.assign(new Error('timeout'), { name: 'TimeoutError' })); }, ms);
        try { r = factory.open(DB_NAME, DB_VERSION); } catch (e) { finish(e); return; }
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'key' });
          if (!d.objectStoreNames.contains(DATA)) d.createObjectStore(DATA, { keyPath: 'key' });
        };
        r.onsuccess = function () { finish(null, r.result); };
        r.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); finish(r.error || new Error('Fotoablage konnte nicht geöffnet werden')); };
        r.onblocked = function () { /* wartet auf andere Tabs; die Zeitüberschreitung greift */ };
      });
      return opening;
    }
    /* Ergebnis erst nach dem Commit; Abbruch (z. B. Kontingent) lehnt mit Grund ab. */
    function tx(stores, mode, work) {
      return open().then(function (d) {
        return new Promise(function (resolve, reject) {
          var t, out, err = null;
          try { t = d.transaction(stores, mode); } catch (e) { reject(wrap(e)); return; }
          t.oncomplete = function () { resolve(out); };
          t.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); };
          t.onabort = function () { reject(wrap(err || t.error || new Error('Transaktion der Fotoablage abgebrochen'))); };
          var abort = function (e) { err = e; try { t.abort(); } catch (x) { reject(wrap(e)); } };
          try { work(t, function (v) { out = v; }, abort); } catch (e) { abort(e); }
        });
      });
    }
    var on = function (req, cb, abort) { req.onsuccess = function () { try { cb(req.result); } catch (e) { abort(e); } }; };
    function getRec(t, id, variant, cb, abort) {
      on(t.objectStore(META).get(keyOf(id, variant)), function (m) {
        if (!m) { cb(null); return; }
        on(t.objectStore(DATA).get(keyOf(id, variant)), function (d) { cb({ meta: m, data: d || null }); }, abort);
      }, abort);
    }

    /* files: {work:{bytes,type,w,h}, thumb:{…}, original?:{…}}. Schreibt alles in einer Transaktion.
       Ein vorhandenes Foto mit anderem Inhalt wird nur mit {replace:true} ersetzt, sonst abgelehnt. */
    async function put(id, files, o) {
      checkId(id); o = o || {};
      if (!files || !files.work || !files.thumb) fail('Fotoablage: Arbeitskopie und Vorschaubild sind Pflicht.');
      var recs = [];
      for (var v of VARIANTS) {
        if (!files[v]) continue;
        var u = toU8(files[v].bytes);
        if (!u.length) fail('Fotoablage: leere Datei (' + v + ').');
        var type = files[v].type || sniff(u) || 'application/octet-stream';
        recs.push({ meta: { key: keyOf(id, v), id: id, variant: v, type: type, size: u.length, w: positiveInt(files[v].w) ? files[v].w : null, h: positiveInt(files[v].h) ? files[v].h : null, sha256: await sha256(u, env), at: now() }, data: { key: keyOf(id, v), bytes: bufOf(u) } });
      }
      await tx([META, DATA], 'readwrite', function (t, done, abort) {
        on(t.objectStore(META).get(keyOf(id, 'work')), function (cur) {
          if (cur && cur.sha256 !== recs[0].meta.sha256 && o.replace !== true) { abort(Object.assign(new Error('Fotoablage: unter dieser ID liegt schon ein anderes Bild.'), { name: 'ConstraintError' })); return; }
          var ms2 = t.objectStore(META), ds = t.objectStore(DATA);
          /* Beim Ersetzen fällt ein altes Original weg, das nicht mitgegeben wurde; sonst bleibt es erhalten. */
          if (o.replace === true) VARIANTS.forEach(function (v) { if (!files[v]) { ms2.delete(keyOf(id, v)); ds.delete(keyOf(id, v)); } });
          recs.forEach(function (r) { ms2.put(r.meta); ds.put(r.data); });
          done(true);
        }, abort);
      });
      /* Rücklesevergleich: Größe und Prüfsumme jeder Variante. Bei Abweichung kein Erfolg und nichts Halbes liegen lassen. */
      var bad = [];
      for (var i = 0; i < recs.length; i++) {
        var got = await read(id, recs[i].meta.variant);
        if (!got || got.size !== recs[i].meta.size || await sha256(got.bytes, env) !== recs[i].meta.sha256) bad.push(recs[i].meta.variant);
      }
      if (bad.length) {
        try { await remove(id); } catch (e) { /* Fehler unten melden */ }
        fail('Fotoablage: Rücklesevergleich fehlgeschlagen (' + bad.join(', ') + '), Foto nicht gespeichert.', 'DataError');
      }
      return { id: id, variants: recs.map(function (r) { return r.meta.variant; }), bytes: recs.reduce(function (a, r) { return a + r.meta.size; }, 0) };
    }
    function read(id, variant) {
      return tx([META, DATA], 'readonly', function (t, done, abort) {
        getRec(t, id, variant, function (r) {
          if (!r) { done(null); return; }
          var b = r.data && r.data.bytes ? toU8(r.data.bytes) : null;
          done(Object.assign({}, r.meta, { bytes: b ? bufOf(b) : null, damaged: !b || b.length !== r.meta.size }));
        }, abort);
      });
    }
    async function get(id, variant) { checkId(id); checkVariant(variant || 'work'); return read(id, variant || 'work'); }
    async function info(id) {
      checkId(id);
      return tx([META], 'readonly', function (t, done, abort) {
        var out = {}, left = VARIANTS.length;
        VARIANTS.forEach(function (v) { on(t.objectStore(META).get(keyOf(id, v)), function (m) { if (m) out[v] = m; if (--left === 0) done(out); }, abort); });
      });
    }
    async function has(id) { var i = await info(id); return { work: !!i.work, thumb: !!i.thumb, original: !!i.original }; }
    async function removeVariant(id, variant) {
      checkId(id); checkVariant(variant);
      if (variant !== 'original') fail('Fotoablage: Arbeitskopie und Vorschaubild nur zusammen mit dem Foto löschen.');
      return tx([META, DATA], 'readwrite', function (t, done) { t.objectStore(META).delete(keyOf(id, variant)); t.objectStore(DATA).delete(keyOf(id, variant)); done(true); });
    }
    async function remove(id) {
      checkId(id);
      return tx([META, DATA], 'readwrite', function (t, done) { VARIANTS.forEach(function (v) { t.objectStore(META).delete(keyOf(id, v)); t.objectStore(DATA).delete(keyOf(id, v)); }); done(true); });
    }
    function allMeta() { return tx([META], 'readonly', function (t, done, abort) { on(t.objectStore(META).getAll(), function (v) { done(v || []); }, abort); }); }
    async function ids() { var seen = {}; (await allMeta()).forEach(function (m) { seen[m.id] = 1; }); return Object.keys(seen).sort(); }
    /* Belegung aus den gespeicherten Größen (gemessen, keine Schätzung). */
    async function usage() {
      var out = { photos: 0, bytes: 0, work: { count: 0, bytes: 0 }, thumb: { count: 0, bytes: 0 }, original: { count: 0, bytes: 0 } }, seen = {};
      (await allMeta()).forEach(function (m) { if (!own(out, m.variant)) return; out[m.variant].count++; out[m.variant].bytes += m.size; out.bytes += m.size; seen[m.id] = 1; });
      out.photos = Object.keys(seen).length;
      return out;
    }
    /* Prüfsummen nachrechnen: {ok, damaged:[varianten], missing:[pflichtvarianten]} */
    async function check(id) {
      var i = await info(id), out = { ok: true, damaged: [], missing: [] };
      ['work', 'thumb'].forEach(function (v) { if (!i[v]) out.missing.push(v); });
      for (var v of VARIANTS) {
        if (!i[v]) continue;
        var r = await read(id, v);
        if (!r || r.damaged || await sha256(r.bytes, env) !== i[v].sha256) out.damaged.push(v);
      }
      out.ok = !out.damaged.length && !out.missing.length;
      return out;
    }
    function mediaIds(trips) {
      var s = {};
      (Array.isArray(trips) ? trips : []).forEach(function (t) { (t && Array.isArray(t.media) ? t.media : []).forEach(function (m) { if (m && typeof m.id === 'string') s[m.id] = 1; }); });
      return s;
    }
    /* Dateien ohne Eintrag in einer Reise (Aufräumen nur auf Nachfrage, nie automatisch) */
    async function orphans(trips) { var s = mediaIds(trips); return (await ids()).filter(function (id) { return !own(s, id); }); }
    /* Einträge ohne Arbeitskopie auf diesem Gerät: „Foto auf diesem Gerät nicht vorhanden“, Eintrag bleibt */
    async function missing(trips) {
      var have = {}; (await allMeta()).forEach(function (m) { if (m.variant === 'work') have[m.id] = 1; });
      return Object.keys(mediaIds(trips)).filter(function (id) { return !own(have, id); }).sort();
    }
    /* Angabe des Browsers (Schätzwert, kein Messwert der Ablage) */
    async function estimate() {
      var nav = env.navigator || (root && root.navigator);
      if (!nav || !nav.storage || typeof nav.storage.estimate !== 'function') return null;
      var e = await nav.storage.estimate();
      return { usage: e.usage == null ? null : e.usage, quota: e.quota == null ? null : e.quota, source: 'browser-schaetzung' };
    }
    function close() { if (db) { try { db.close(); } catch (e) { /* nichts */ } db = null; } }
    return { open: function () { return open().then(function () { return true; }); }, put: put, get: get, info: info, has: has, remove: remove,
      removeVariant: removeVariant, ids: ids, usage: usage, check: check, orphans: orphans, missing: missing, estimate: estimate, close: close };
  }

  return {
    DB_NAME: DB_NAME, DB_VERSION: DB_VERSION, VARIANTS: VARIANTS, SIZES: SIZES, QUALITY: QUALITY, RADIUS_KM: RADIUS_KM, AMBIGUOUS_M: AMBIGUOUS_M,
    sha256: sha256, sha256Sync: sha256Sync, sniff: sniff, readExif: readExif, removeLocation: removeLocation, exifTime: exifTime,
    orientedSize: orientedSize, fitSize: fitSize, planSizes: planSizes,
    suggest: suggest, reviewList: reviewList, applyChoice: applyChoice,
    newId: newId, prepare: prepare, browserCodec: browserCodec, create: create
  };
});
