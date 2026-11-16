/* Reiseplaner · Check- und Packlisten nach Ziel, Reiseart und Wetter (docs/CHECK_PACKLISTE.md), Claude 16.11.2026.
   Planung M03 (Wetter & Packen) und M04 (Ausland & Dokumente). Reine Funktionen ohne Speicher-, DOM- oder Netzzugriff:
   die App (app/packliste.js) holt Daten auf Knopfdruck und reicht sie hier hinein.
   Grundsätze: keine Visa-, Impf- oder Gültigkeitsregeln im Code (nur Prüfpunkt + amtlicher Link), unbekannt bleibt
   unbekannt, Wetterwerte sind Vorhersage oder ausdrücklich Durchschnitt, Schlüssel der Punkte sind stabil (Häkchen in t.check).
   UMD wie v5logic.js: window.RPPack im Browser, module.exports in Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPPack = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Amtliche Quellen (am 16.11.2026 erreichbar geprüft) ---------- */
  var LINKS = {
    aa: { url: 'https://www.auswaertiges-amt.de/de/reiseundsicherheit/reise-und-sicherheitshinweise', label: 'Auswärtiges Amt: Reise- und Sicherheitshinweise' },
    aaHealth: { url: 'https://www.auswaertiges-amt.de/de/reiseundsicherheit/reise-gesundheit', label: 'Auswärtiges Amt: Reisen und Gesundheit' },
    openMeteo: { url: 'https://open-meteo.com/', label: 'Open-Meteo' }
  };

  /* ---------- Länder: nur stabile Merkmale. eu = EU-Mitglied, sch = Schengen, eea = EWR (EU-Roamingregel), cur = Währung ---------- */
  var C = function (n, eu, sch, eea, cur) { return { name: n, eu: !!eu, schengen: !!sch, eea: !!eea, cur: cur }; };
  var COUNTRIES = {
    DE: C('Deutschland', 1, 1, 1, 'EUR'), AT: C('Österreich', 1, 1, 1, 'EUR'), CH: C('Schweiz', 0, 1, 0, 'CHF'),
    LI: C('Liechtenstein', 0, 1, 1, 'CHF'), FR: C('Frankreich', 1, 1, 1, 'EUR'), IT: C('Italien', 1, 1, 1, 'EUR'),
    NL: C('Niederlande', 1, 1, 1, 'EUR'), BE: C('Belgien', 1, 1, 1, 'EUR'), LU: C('Luxemburg', 1, 1, 1, 'EUR'),
    DK: C('Dänemark', 1, 1, 1, 'DKK'), PL: C('Polen', 1, 1, 1, 'PLN'), CZ: C('Tschechien', 1, 1, 1, 'CZK'),
    HU: C('Ungarn', 1, 1, 1, 'HUF'), SI: C('Slowenien', 1, 1, 1, 'EUR'), SK: C('Slowakei', 1, 1, 1, 'EUR'),
    HR: C('Kroatien', 1, 1, 1, 'EUR'), ES: C('Spanien', 1, 1, 1, 'EUR'), PT: C('Portugal', 1, 1, 1, 'EUR'),
    GR: C('Griechenland', 1, 1, 1, 'EUR'), SE: C('Schweden', 1, 1, 1, 'SEK'), NO: C('Norwegen', 0, 1, 1, 'NOK'),
    FI: C('Finnland', 1, 1, 1, 'EUR'), IE: C('Irland', 1, 0, 1, 'EUR'), GB: C('Vereinigtes Königreich', 0, 0, 0, 'GBP'),
    TR: C('Türkei', 0, 0, 0, 'TRY'), US: C('USA', 0, 0, 0, 'USD')
  };
  /* Länder mit Vignette bzw. digitaler Vignette für Pkw auf Autobahnen: nur als Anlass für einen Prüfpunkt. */
  var VIGNETTE = { AT: 1, CH: 1, CZ: 1, SI: 1, HU: 1, SK: 1 };
  /* Eingebaute Allgäu/Tirol-Ziele (app/basis.js PLACES) ohne eigene Koordinaten: ungefähre Ortsmitte. */
  var BUILTIN = {
    oberjoch: { lat: 47.52, lon: 10.41, country: 'DE' }, oberstaufen: { lat: 47.56, lon: 10.02, country: 'DE' },
    balder: { lat: 47.47, lon: 10.1, country: 'DE' }, tannheim: { lat: 47.5, lon: 10.52, country: 'AT' }
  };
  function countryName(cc) { return COUNTRIES[cc] ? COUNTRIES[cc].name : cc; }
  var ISO2 = /^[A-Z]{2}$/;
  var okPoint = function (p) { return !!p && isFinite(+p.lat) && isFinite(+p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180 && !(+p.lat === 0 && +p.lon === 0); };

  /* ---------- Ziel und Reiseländer ableiten ---------- */
  /* ctx.place(id) → Katalogort {lat,lon,country} oder null; ctx.geo → Ergebnis der Ortssuche {lat,lon,country,label} */
  function destPoint(t, ctx) {
    ctx = ctx || {};
    if (Array.isArray(t.legs) && t.legs.length) {
      var l = t.legs[0];
      if (okPoint(l)) return { lat: +l.lat, lon: +l.lon, label: l.name || '', src: 'etappe' };
    }
    if (t.destGeo && okPoint(t.destGeo)) return { lat: +t.destGeo.lat, lon: +t.destGeo.lon, label: t.dest || '', src: 'ziel' };
    if (t.place && BUILTIN[t.place]) return { lat: BUILTIN[t.place].lat, lon: BUILTIN[t.place].lon, label: '', src: 'katalog' };
    if (ctx.geo && okPoint(ctx.geo)) return { lat: +ctx.geo.lat, lon: +ctx.geo.lon, label: ctx.geo.label || t.dest || '', src: 'ortssuche' };
    return null;
  }
  /* → {list:[ISO2], confirmed:bool, unknown:bool}; Reihenfolge der ersten Nennung, ohne Dubletten */
  function tripCountries(t, ctx) {
    ctx = ctx || {};
    if (Array.isArray(t.countries) && t.countries.length) return { list: t.countries.filter(function (c) { return ISO2.test(c); }), confirmed: true, unknown: false };
    var find = typeof ctx.place === 'function' ? ctx.place : function () { return null; };
    var out = [], unknown = false;
    var add = function (cc) { cc = String(cc || '').toUpperCase(); if (ISO2.test(cc)) { if (out.indexOf(cc) < 0) out.push(cc); } else unknown = true; };
    var ofPlace = function (id) { var p = id ? find(id) : null; return p && p.country ? p.country : null; };
    if (Array.isArray(t.legs) && t.legs.length) t.legs.forEach(function (l) { add(ofPlace(l.place)); });
    else if (t.destGeo && t.destGeo.place) add(ofPlace(t.destGeo.place));
    else if (t.place && BUILTIN[t.place]) add(BUILTIN[t.place].country);
    else if (ctx.geo && ctx.geo.country) add(ctx.geo.country);
    else unknown = true;
    return { list: out, confirmed: false, unknown: unknown || !out.length };
  }

  /* ---------- Hilfen ---------- */
  var WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var validDate = function (s) { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  var addDays = function (s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  var dayDiff = function (a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); };
  var fmtDay = function (s) { var d = new Date(s + 'T00:00:00Z'); return WD[d.getUTCDay()] + ' ' + s.slice(8, 10) + '.' + s.slice(5, 7) + '.'; };
  var fmtDate = function (s) { return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4); };
  var dec = function (v) { return String(Math.round(v * 10) / 10).replace('.', ','); };
  var item = function (key, label, note, link) { return [key, label, note || '', undefined, link || null]; };
  var fixedRange = function (t) { return t && t.dateMode === 'fix' && validDate(t.start) && validDate(t.end) && t.end >= t.start ? { from: t.start, to: t.end } : null; };

  /* ---------- Dokumente & Einreise ---------- */
  /* opt.idDocCheck (RPV5.idDocCheck), opt.party (t.party) für Format-5-Ausweise */
  function docGroup(t, countries, opt) {
    opt = opt || {};
    var cs = countries || { list: [], unknown: true }, abroad = cs.list.filter(function (c) { return c !== 'DE'; });
    var flight = t.travel === 'flug', car = t.travel === 'auto', range = fixedRange(t), items = [];
    if (!abroad.length) {
      if (cs.unknown && (flight || (Array.isArray(t.idDocs) && t.idDocs.length))) items.push(item('d-land', 'Reiseland festlegen', 'Ziel unter „Ort & Unterkunft“ oder mit „Wetter laden“ bestimmen. Dann erscheinen Einreise- und Dokumentpunkte passend zum Land.'));
      if (!items.length && !(Array.isArray(t.idDocs) && t.idDocs.length)) return null;
    }
    var names = abroad.map(countryName).join(', ');
    var info = abroad.map(function (c) { return COUNTRIES[c] || null; });
    var allKnown = info.every(Boolean), allSch = allKnown && info.every(function (c) { return c.schengen || c.eu; });
    var anyNonEu = info.some(function (c) { return !c || !c.eu; }), anyNonEea = info.some(function (c) { return !c || !c.eea; });
    if (abroad.length) {
      items.push(item('d-gueltig', 'Ausweise aller Mitreisenden: gültig bis nach der Rückkehr' + (range ? ' am ' + fmtDate(range.to) : '') + '?',
        'Ablaufdatum ansehen. Ob ' + names + ' eine Mindestgültigkeit verlangt, steht beim Auswärtigen Amt.', LINKS.aa));
      items.push(item('d-dokument', 'Welches Dokument reicht (Personalausweis oder Reisepass)?',
        (allSch ? 'In EU und Schengen oft der Personalausweis. ' : '') + 'Hängt von Staatsangehörigkeit und Reiseland ab; Kinder brauchen eigene Dokumente.'));
      if (!allSch) items.push(item('d-einreise', 'Einreise und Visum für ' + names + ' prüfen', 'Einreisebestimmungen ändern sich; vor Buchung und kurz vor Abreise erneut ansehen.', LINKS.aa));
      if (anyNonEu || flight) items.push(item('d-impf', 'Impfungen und Gesundheitshinweise für ' + names + ' prüfen', 'Bei Bedarf reisemedizinische Beratung (Hausarzt, Tropeninstitut) rechtzeitig vor der Reise.', LINKS.aaHealth));
      if (info.some(function (c) { return c && c.eu; })) items.push(item('d-ehic', 'Krankenversichertenkarte einpacken', 'Bei gesetzlich Versicherten gilt die Rückseite meist als Europäische Krankenversicherungskarte; sie deckt keinen Rücktransport.'));
      items.push(item('d-kv', 'Auslandsreise-Krankenversicherung prüfen', anyNonEu ? 'Außerhalb der EU besonders wichtig: Geltungsbereich, Zeitraum und Rücktransport ansehen.' : 'Geltungsbereich, Zeitraum und Rücktransport ansehen.'));
      var curs = [];
      info.forEach(function (c) { if (c && c.cur !== 'EUR' && curs.indexOf(c.cur) < 0) curs.push(c.cur); });
      if (curs.length || !allKnown) items.push(item('d-geld', 'Zahlungsmittel: ' + (curs.length ? 'Währung ' + curs.join(', ') : 'Währung des Reiselands prüfen'), 'Karte für Zahlung im Ausland und etwas Bargeld; Gebühren der eigenen Bank prüfen.'));
      if (anyNonEea) items.push(item('d-roaming', 'Mobilfunk: Roaming-Kosten prüfen', (info.some(function (c) { return c && !c.eea; }) ? names + ' gehört nicht (ganz) zur EU-Roamingregel. ' : '') + 'Tarif oder Datenpaket vor Abreise klären.'));
      if (car) {
        items.push(item('d-fuehrerschein', 'Führerschein und Fahrzeugschein mitnehmen', 'Bei Mietwagen: Bedingungen für Fahrten ins Ausland prüfen.'));
        var vig = abroad.filter(function (c) { return VIGNETTE[c]; });
        if (vig.length) items.push(item('d-vignette', 'Maut bzw. Vignette für ' + vig.map(countryName).join(', ') + ' prüfen', 'Vor der ersten Autobahn kaufen, nur beim offiziellen Anbieter des Landes (Vorsicht vor teuren Zwischenhändlern).'));
        items.push(item('d-verkehr', 'Verkehrsregeln und Ausrüstungspflichten für ' + names + ' prüfen', 'Zum Beispiel Warnwesten, Winterausrüstung, Umweltzonen.'));
      }
      if (flight) items.push(item('d-name', 'Name auf Flugticket und Reisedokument vergleichen', 'Schreibweise muss übereinstimmen.'));
      items.push(item('d-kopie', 'Kopien oder Fotos der Dokumente getrennt aufbewahren', 'Nicht in der Reise speichern, wenn andere sie sehen können.'));
    }
    /* Format 5: erfasste Ausweise mit Ergebnis (L1–L3), Rückkehr = Abreisedatum */
    if (Array.isArray(t.idDocs) && typeof opt.idDocCheck === 'function') {
      var KIND = { perso: 'Personalausweis', pass: 'Reisepass', kinderpass: 'Kinderreisepass', fuehrerschein: 'Führerschein', gesundheitskarte: 'Krankenversichertenkarte', sonst: 'Dokument' };
      var who = function (id) { var p = (opt.party || []).find(function (x) { return x && x.id === id; }); return p && p.name ? p.name : ''; };
      t.idDocs.forEach(function (d) {
        var r = opt.idDocCheck(d, range ? range.to : null, null);
        items.push(item('iddoc:' + d.id, (d.label || KIND[d.kind] || 'Dokument') + (who(d.who) ? ' · ' + who(d.who) : ''), r.text, LINKS.aa));
      });
    }
    return items.length ? ['Dokumente & Einreise' + (names ? ': ' + names : ''), items] : null;
  }

  /* ---------- Packliste passend zur Reise (Dauer, Anreise, Zielart, Reiseart) ---------- */
  var KIND_PACK = {
    therme: ['p-x-bad', 'Badesachen und Badeschuhe'], baden: ['p-x-bad', 'Badesachen und Badeschuhe'], wasser: ['p-x-bad', 'Badesachen und Badeschuhe'],
    berge: ['p-x-schuhe', 'Feste Schuhe mit Profil'], aktiv: ['p-x-rucksack', 'Tagesrucksack und Trinkflasche'], natur: ['p-x-rucksack', 'Tagesrucksack und Trinkflasche'],
    unterwelt: ['p-x-hoehle', 'Warme Schicht für Höhlen oder Bergwerke'], stadt: ['p-x-stadtschuh', 'Bequeme Schuhe für viel Laufen'],
    winter: ['p-x-winter', 'Warme, wasserfeste Schuhe']
  };
  var TYPE_PACK = {
    tag: [['p-x-tag', 'Proviant und Getränke'], ['p-x-tagplan', 'Ausweis, Geld und geladenes Handy']],
    wochenende: [['p-x-kultur', 'Kulturbeutel'], ['p-x-schlaf', 'Schlafsachen']],
    wellness: [['p-x-kultur', 'Kulturbeutel'], ['p-x-schlaf', 'Schlafsachen'], ['p-x-sauna', 'Bademantel und Saunatücher']],
    familie: [['p-x-kultur', 'Kulturbeutel'], ['p-x-kinderapo', 'Kinderapotheke (Fieber, Pflaster, Sonnenschutz)'], ['p-x-fahrt', 'Beschäftigung und Snacks für die Fahrt'], ['p-x-wechsel', 'Wechselkleidung griffbereit']],
    rund: [['p-x-teilen', 'Gepäck so teilen, dass eine Tasche für einzelne Nächte reicht'], ['p-x-kultur', 'Kulturbeutel']]
  };
  var norm = function (s) { return String(s || '').toLocaleLowerCase('de').replace(/[^a-zäöüß]/g, ''); };
  /* base: Bezeichnungen der vorhandenen Grundliste, um Dubletten zu vermeiden; kinds: Merkmale des Katalogziels */
  function fitGroup(t, base, kinds, nights) {
    var have = (base || []).map(norm), seen = Object.create(null), items = [];
    var push = function (key, label, note) {
      if (seen[key]) return; seen[key] = 1;
      var n = norm(label);
      if (have.some(function (h) { return h && (h === n || (h.length > 6 && n.indexOf(h) >= 0)); })) return;
      items.push(item(key, label, note));
    };
    nights = Math.max(0, Math.round(+nights || 0));
    if (nights > 0) push('p-x-kleidung', 'Kleidung für ' + (nights + 1) + ' Tage', nights >= 8 ? 'Bei mehr als einer Woche lieber Wäsche unterwegs einplanen (Waschmittel, Waschmöglichkeit prüfen).' : '');
    if (nights >= 8) push('p-x-waschmittel', 'Reisewaschmittel', '');
    if (nights > 0) push('p-x-medis', 'Eigene Medikamente für die ganze Reise', 'Plus ein paar Tage Reserve.');
    if (t.travel === 'auto') push('p-x-auto', 'Warnweste, Warndreieck und Verbandkasten im Auto', 'In Deutschland vorgeschrieben; im Ausland gelten eigene Regeln.');
    if (t.travel === 'bahn') push('p-x-bahn', 'Tickets und Reservierungen offline aufs Handy laden', '');
    if (t.travel === 'flug') {
      push('p-x-handgepaeck', 'Handgepäck: Flüssigkeiten und Größen nach Regeln von Airline und Flughafen', 'Regeln vor dem Packen auf deren Seiten prüfen.');
      push('p-x-akku', 'Powerbank und Ersatzakkus ins Handgepäck', 'Nicht in den aufgegebenen Koffer; Vorgaben der Airline prüfen.');
    }
    (TYPE_PACK[t.type] || []).forEach(function (x) { push(x[0], x[1], ''); });
    (kinds || []).forEach(function (k) { var x = KIND_PACK[k]; if (x) push(x[0], x[1], 'passt zum Ziel'); });
    return items.length ? ['Packliste: passend zur Reise', items] : null;
  }

  /* ---------- Wetter: Open-Meteo ---------- */
  var HORIZON = 16, STALE_MS = 12 * 3600e3, CLIMATE_YEARS = 3;
  var DAILY_F = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,weather_code,uv_index_max';
  var DAILY_A = 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max';
  var round2 = function (v) { return Math.round(+v * 100) / 100; };
  /* today: 'YYYY-MM-DD' (Gerätetag). → {mode:'forecast'|'climate'|'past'|'none', from, to, forecastFrom?} */
  function weatherPlan(t, today) {
    var r = fixedRange(t);
    if (!r || !validDate(today)) return { mode: 'none' };
    if (r.to < today) return { mode: 'past', from: r.from, to: r.to };
    var last = addDays(today, HORIZON - 1), from = r.from < today ? today : r.from;
    if (from <= last) return { mode: 'forecast', from: from, to: r.to > last ? last : r.to, cut: r.to > last, tripTo: r.to };
    return { mode: 'climate', from: r.from, to: r.to, forecastFrom: addDays(r.from, -(HORIZON - 1)) };
  }
  function forecastUrl(p, plan) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + round2(p.lat) + '&longitude=' + round2(p.lon) + '&daily=' + DAILY_F +
      '&timezone=auto&start_date=' + plan.from + '&end_date=' + plan.to;
  }
  /* Kalendertage um k Jahre zurück; 29.02. wird in Nicht-Schaltjahren zum 28.02. */
  function shiftYears(s, k) {
    var y = +s.slice(0, 4) - k, md = s.slice(5);
    if (md === '02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) md = '02-28';
    return y + '-' + md;
  }
  /* Archiv der letzten vollständigen Jahre vor dem Reisebeginn (Archiv hängt einige Tage nach) */
  function climateUrls(p, plan, today) {
    var out = [], k = 1;
    while (out.length < CLIMATE_YEARS && k < 10) {
      var a = shiftYears(plan.from, k), b = shiftYears(plan.to, k);
      if (b <= addDays(today, -7)) out.push({ year: +plan.from.slice(0, 4) - k, url: 'https://archive-api.open-meteo.com/v1/archive?latitude=' + round2(p.lat) + '&longitude=' + round2(p.lon) + '&daily=' + DAILY_A + '&timezone=auto&start_date=' + a + '&end_date=' + b });
      k++;
    }
    return out;
  }
  var numOrNull = function (v) { return v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v; };
  function pick(d, k, i) { return d && Array.isArray(d[k]) ? numOrNull(d[k][i]) : null; }
  /* Antwort von /v1/forecast → {kind:'forecast', days:[…]}; wirft bei unbrauchbarer Antwort */
  function normForecast(j) {
    var d = j && j.daily;
    if (!d || !Array.isArray(d.time)) throw new Error('Wetter: Antwort ohne Tageswerte.');
    return {
      kind: 'forecast', days: d.time.filter(validDate).map(function (date, i) {
        return { date: date, tmax: pick(d, 'temperature_2m_max', i), tmin: pick(d, 'temperature_2m_min', i), pop: pick(d, 'precipitation_probability_max', i),
          precip: pick(d, 'precipitation_sum', i), snow: pick(d, 'snowfall_sum', i), wind: pick(d, 'wind_speed_10m_max', i), code: pick(d, 'weather_code', i), uv: pick(d, 'uv_index_max', i) };
      })
    };
  }
  /* Archiv-Antworten mehrerer Jahre → Durchschnitt je Reisetag. Regentag ab 1 mm, Schneetag ab 1 cm. */
  function normClimate(list, plan) {
    var tripDays = [], n = dayDiff(plan.from, plan.to);
    for (var i = 0; i <= n; i++) tripDays.push(addDays(plan.from, i));
    var years = [], acc = tripDays.map(function () { return { tmax: [], tmin: [], precip: [], snow: [], wind: [], rain: 0, snowy: 0, n: 0 }; });
    (list || []).forEach(function (x) {
      var d = x && x.data && x.data.daily; if (!d || !Array.isArray(d.time)) return;
      if (years.indexOf(x.year) < 0) years.push(x.year);
      d.time.forEach(function (date, j) {
        var idx = j; if (idx >= acc.length) return;
        var a = acc[idx], tx = pick(d, 'temperature_2m_max', j), tn = pick(d, 'temperature_2m_min', j), pr = pick(d, 'precipitation_sum', j), sn = pick(d, 'snowfall_sum', j), w = pick(d, 'wind_speed_10m_max', j);
        if (tx != null) a.tmax.push(tx); if (tn != null) a.tmin.push(tn); if (w != null) a.wind.push(w);
        if (pr != null) { a.precip.push(pr); a.n++; if (pr >= 1) a.rain++; }
        if (sn != null) { a.snow.push(sn); if (sn >= 1) a.snowy++; }
      });
    });
    var avg = function (v) { return v.length ? Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length * 10) / 10 : null; };
    var max = function (v) { return v.length ? Math.max.apply(null, v) : null; };
    if (!years.length) throw new Error('Wetter: keine Archivwerte erhalten.');
    years.sort();
    return {
      kind: 'climate', years: years, days: tripDays.map(function (date, i) {
        var a = acc[i];
        return { date: date, tmax: avg(a.tmax), tmin: avg(a.tmin), precip: avg(a.precip), snow: avg(a.snow), wind: max(a.wind),
          rainShare: a.n ? a.rain / a.n : null, snowShare: a.snow.length ? a.snowy / a.snow.length : null, samples: a.n };
      })
    };
  }
  /* WMO-Wettercode → Text (Symbol nie ohne Text) */
  var WMO = { 0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Nebel mit Reif', 51: 'leichter Niesel', 53: 'Niesel', 55: 'starker Niesel',
    56: 'gefrierender Niesel', 57: 'gefrierender Niesel', 61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'gefrierender Regen', 67: 'gefrierender Regen',
    71: 'leichter Schneefall', 73: 'Schneefall', 75: 'starker Schneefall', 77: 'Schneegriesel', 80: 'Regenschauer', 81: 'Regenschauer', 82: 'heftige Regenschauer',
    85: 'Schneeschauer', 86: 'starke Schneeschauer', 95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit Hagel' };
  function codeText(c) { return c == null ? '' : (WMO[c] || ''); }
  /* Zeile je Tag als Text */
  function dayText(d, kind) {
    var p = [];
    if (d.tmin != null || d.tmax != null) p.push((d.tmin != null ? dec(d.tmin) : '?') + ' bis ' + (d.tmax != null ? dec(d.tmax) : '?') + ' °C');
    if (kind === 'forecast') {
      p.push(d.pop != null ? 'Regen ' + Math.round(d.pop) + ' %' : 'Regen: keine Angabe');
      if (d.snow != null && d.snow > 0) p.push('Schnee ' + dec(d.snow) + ' cm');
      if (codeText(d.code)) p.push(codeText(d.code));
    } else {
      if (d.rainShare != null) p.push('Niederschlag in ' + Math.round(d.rainShare * 100) + ' % der Jahre');
      if (d.snow != null && d.snow > 0) p.push('Schnee Ø ' + dec(d.snow) + ' cm');
    }
    if (!p.length) return 'keine Daten';
    return p.join(' · ');
  }
  function isStale(entry, nowMs) { return !entry || !entry.fetchedAt || nowMs - Date.parse(entry.fetchedAt) > STALE_MS; }
  function cacheKey(p, plan, mode) { return [round2(p.lat), round2(p.lon), plan.from, plan.to, mode].join(','); }

  /* ---------- Wetter-Packpunkte (Richtwerte) ---------- */
  var TH = { rain: 60, rainShare: 0.4, cold: 5, frost: -5, hot: 25, uv: 6, wind: 50 };
  function weatherGroup(t, wx) {
    if (!wx || !Array.isArray(wx.days) || !wx.days.length) return null;
    var fc = wx.kind === 'forecast', items = [], days = wx.days;
    var when = function (list, f) { var l = list.slice(0, 3).map(function (d) { return fmtDay(d.date) + (f ? ' (' + f(d) + ')' : ''); }); return l.join(', ') + (list.length > 3 ? ' und ' + (list.length - 3) + ' weitere' : ''); };
    var why = fc ? 'Vorhersage' : 'typisch für die Reisetage (Durchschnitt, keine Vorhersage)';
    var rain = days.filter(function (d) { return fc ? d.pop != null && d.pop >= TH.rain : d.rainShare != null && d.rainShare >= TH.rainShare; });
    if (rain.length) items.push(item('p-w-regen', 'Regenjacke oder Schirm', 'wegen Regen am ' + when(rain, fc ? function (d) { return Math.round(d.pop) + ' %'; } : null) + ' · ' + why));
    var tmins = days.map(function (d) { return d.tmin; }).filter(function (v) { return v != null; });
    var tmaxs = days.map(function (d) { return d.tmax; }).filter(function (v) { return v != null; });
    var lo = tmins.length ? Math.min.apply(null, tmins) : null, hi = tmaxs.length ? Math.max.apply(null, tmaxs) : null;
    if (lo != null && lo < TH.cold) items.push(item('p-w-kalt', 'Warme Schicht (Pullover, Fleece) und Mütze', 'tiefster Wert ' + dec(lo) + ' °C · ' + why));
    if (lo != null && lo < TH.frost) items.push(item('p-w-frost', 'Thermounterwäsche und warme Handschuhe', 'Frost bis ' + dec(lo) + ' °C · ' + why));
    if (hi != null && hi >= TH.hot) items.push(item('p-w-hitze', 'Leichte Kleidung, Sonnenhut und Trinkflasche', 'bis ' + dec(hi) + ' °C · ' + why));
    var uv = days.filter(function (d) { return d.uv != null && d.uv >= TH.uv; });
    if (uv.length) items.push(item('p-w-uv', 'Sonnencreme mit hohem Schutz', 'UV-Index ' + Math.round(Math.max.apply(null, uv.map(function (d) { return d.uv; }))) + ' am ' + when(uv) + ' · ' + why));
    var wind = days.filter(function (d) { return d.wind != null && d.wind >= TH.wind; });
    if (wind.length) items.push(item('p-w-wind', 'Winddichte Jacke', 'Wind bis ' + Math.round(Math.max.apply(null, wind.map(function (d) { return d.wind; }))) + ' km/h · ' + why));
    var snow = days.filter(function (d) { return fc ? d.snow != null && d.snow > 0 : d.snowShare != null && d.snowShare > 0; });
    if (snow.length) {
      items.push(item('p-w-schnee', 'Wasserfeste Schuhe mit Profil', 'Schnee am ' + when(snow) + ' · ' + why));
      if (t.travel === 'auto') items.push(item('p-w-ketten', 'Winterausrüstung am Auto prüfen (Reifen, Ketten, Eiskratzer)', 'Schnee möglich · Regeln im Reiseland beachten'));
    }
    return items.length ? ['Packliste: wegen Wetter', items] : null;
  }

  return {
    LINKS: LINKS, COUNTRIES: COUNTRIES, BUILTIN: BUILTIN, TH: TH, HORIZON: HORIZON, STALE_MS: STALE_MS,
    countryName: countryName, destPoint: destPoint, tripCountries: tripCountries, docGroup: docGroup, fitGroup: fitGroup,
    weatherPlan: weatherPlan, forecastUrl: forecastUrl, climateUrls: climateUrls, shiftYears: shiftYears, normForecast: normForecast,
    normClimate: normClimate, codeText: codeText, dayText: dayText, isStale: isStale, cacheKey: cacheKey, weatherGroup: weatherGroup,
    fmtDay: fmtDay, fmtDate: fmtDate, addDays: addDays
  };
});
