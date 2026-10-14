/* Reiseplaner · Umkreis-Katalog: Rechenregeln (Issue #7)
   Reine Funktionen ohne DOM. Dieselben Regeln gelten in der Datenbank-Funktion public.catalog_search
   (supabase/migrations/20261014160000_catalog.sql); tests/catalog.cjs und tests/db prüfen den Gleichlauf.
   Entfernungen: Luftlinie (Haversine, Erdradius 6371 km). Straßen-km sind eine grobe Schätzung
   (Luftlinie × ROAD_FACTOR) und werden in der Oberfläche immer als Schätzung gekennzeichnet. */
(function (root) {
  'use strict';
  var ROAD_FACTOR = 1.3, AVG_KMH = 80, MAX_KM = 2000;
  var KINDS = {
    natur: 'Natur & Wandern', wasser: 'See, Fluss & Meer', berge: 'Berge & Aussicht', stadt: 'Stadt & Bummeln',
    kultur: 'Kultur & Geschichte', burg: 'Burgen & Schlösser', therme: 'Therme & Wellness', familie: 'Mit Kindern',
    genuss: 'Wein, Bier & Essen', technik: 'Technik & Industrie', winter: 'Winter & Schnee', unterwelt: 'Höhlen & Unterwelt'
  };
  /* Kategorie im Reiseplan (CAT in index.html) */
  var KIND_CAT = { therme: 'wellness', winter: 'schnee', genuss: 'genuss' };
  var RANGES = [
    { id: 'feierabend', name: 'Feierabend', min: 0, max: 60, sub: 'bis ca. 60 km' },
    { id: 'tag', name: 'Tagesausflug', min: 0, max: 150, sub: 'bis ca. 150 km' },
    { id: 'wochenende', name: 'Wochenende', min: 80, max: 350, sub: 'ca. 80–350 km' },
    { id: 'lang', name: 'Langes Wochenende', min: 200, max: 600, sub: 'ca. 200–600 km' },
    { id: 'weit', name: 'Richtig weg', min: 400, max: 1200, sub: 'ab ca. 400 km' }
  ];
  /* Schnellauswahl Abfahrtsort ohne Netz (Stadtmitte, ungefähr) */
  var ORIGINS = [
    ['Aachen', 50.776, 6.084], ['Augsburg', 48.371, 10.898], ['Basel', 47.560, 7.589], ['Berlin', 52.520, 13.405],
    ['Bielefeld', 52.030, 8.532], ['Bonn', 50.737, 7.098], ['Braunschweig', 52.269, 10.521], ['Bremen', 53.079, 8.802],
    ['Chemnitz', 50.827, 12.921], ['Dortmund', 51.514, 7.468], ['Dresden', 51.050, 13.738], ['Düsseldorf', 51.227, 6.773],
    ['Erfurt', 50.978, 11.029], ['Essen', 51.456, 7.012], ['Frankfurt am Main', 50.110, 8.682], ['Freiburg im Breisgau', 47.995, 7.850],
    ['Göppingen', 48.703, 9.652], ['Graz', 47.071, 15.439], ['Hamburg', 53.551, 9.994], ['Hannover', 52.375, 9.732],
    ['Heilbronn', 49.142, 9.219], ['Innsbruck', 47.269, 11.404], ['Karlsruhe', 49.007, 8.404], ['Kassel', 51.312, 9.480],
    ['Kiel', 54.323, 10.123], ['Koblenz', 50.356, 7.594], ['Köln', 50.938, 6.960], ['Konstanz', 47.660, 9.175],
    ['Leipzig', 51.340, 12.375], ['Linz', 48.306, 14.286], ['Lübeck', 53.866, 10.687], ['Magdeburg', 52.121, 11.628],
    ['Mainz', 49.993, 8.247], ['Mannheim', 49.488, 8.466], ['München', 48.137, 11.575], ['Münster', 51.960, 7.626],
    ['Nürnberg', 49.454, 11.077], ['Osnabrück', 52.279, 8.047], ['Passau', 48.574, 13.462], ['Regensburg', 49.013, 12.101],
    ['Rostock', 54.092, 12.099], ['Saarbrücken', 49.240, 6.997], ['Salzburg', 47.800, 13.044], ['Stuttgart', 48.776, 9.183],
    ['Trier', 49.750, 6.637], ['Ulm', 48.398, 9.992], ['Wien', 48.208, 16.373], ['Würzburg', 49.792, 9.953],
    ['Zürich', 47.377, 8.540]
  ].map(function (o) { return { label: o[0], lat: o[1], lon: o[2] }; });

  function rad(x) { return x * Math.PI / 180; }
  function airKm(a, b) {
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  function roadKm(air) { return Math.round(air * ROAD_FACTOR); }
  /* grobe Fahrzeit in Minuten, auf 5 Minuten gerundet */
  function driveMin(air) { return Math.max(5, Math.round(air * ROAD_FACTOR / AVG_KMH * 60 / 5) * 5); }
  function durText(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + ' Std.' + (m ? ' ' + m + ' Min.' : '') : m + ' Min.'; }
  function validPoint(p) { return !!p && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180; }

  /* Rohdaten (catalog-data.js) oder Datenbankantwort in dieselbe Form bringen */
  function normSpot(s) {
    return { id: String(s.id), name: String(s.name), kind: KINDS[s.kind] ? s.kind : 'natur', lat: +s.lat, lon: +s.lon,
      hours: +s.hours || 2, indoor: !!s.indoor, family: !!s.family, months: (s.months || []).map(Number), slot: s.slot || '',
      summary: s.summary || '', tip: s.tip || '' };
  }
  function normPlace(p) {
    var nights = p.nights || [p.nights_min, p.nights_max];
    return { id: String(p.id), name: String(p.name), region: p.region || '', country: p.country || '', lat: +p.lat, lon: +p.lon,
      kinds: (p.kinds || []).filter(function (k) { return KINDS[k]; }), months: (p.months || []).map(Number),
      nights: [nights[0] == null ? 0 : +nights[0], nights[1] == null ? 7 : +nights[1]], summary: p.summary || '', angle: p.angle || '',
      airKm: p.air_km != null ? +p.air_km : p.airKm != null ? +p.airKm : null,
      spots: (p.spots || []).map(normSpot) };
  }

  function checkQuery(q) {
    if (!validPoint(q)) throw new Error('Abfahrtsort ohne gültige Koordinaten');
    var max = +q.maxKm, min = +(q.minKm || 0);
    if (!(max > 0 && max <= MAX_KM)) throw new Error('Kilometerbereich: höchstens ' + MAX_KM + ' km');
    if (!(min >= 0 && min < max)) throw new Error('Kilometerbereich: „ab“ muss kleiner als „bis“ sein');
    return { lat: +q.lat, lon: +q.lon, maxKm: max, minKm: min, kinds: (q.kinds || []).filter(function (k) { return KINDS[k]; }) };
  }

  /* Gleiche Regel wie public.catalog_search: geschätzte Straßen-km im Bereich [min, max], Themen überschneiden sich,
     sortiert nach Luftlinie, höchstens 80 Ziele. */
  function searchLocal(data, query) {
    var q = checkQuery(query), out = [];
    (data.places || []).forEach(function (raw) {
      var p = normPlace(raw), air = airKm(q, p), road = air * ROAD_FACTOR;
      if (road < q.minKm || road > q.maxKm) return;
      if (q.kinds.length && !p.kinds.some(function (k) { return q.kinds.indexOf(k) >= 0; })) return;
      p.airKm = round1(air); out.push(p);
    });
    out.sort(function (a, b) { return a.airKm - b.airKm || (a.id < b.id ? -1 : 1); });
    return { version: data.version || 0, places: out.slice(0, 80) };
  }

  function seasonFit(p, month) { return !month || !p.months.length ? null : p.months.indexOf(+month) >= 0; }
  function spotSeason(s, month) { return !month || !s.months.length ? null : s.months.indexOf(+month) >= 0; }
  function nightsFit(p, nights) { return nights == null || nights === '' ? null : +nights >= p.nights[0] && +nights <= p.nights[1]; }

  /* Bewertung: Themen-Treffer, Saison, passende Dauer, Familie/Schlechtwetter. Keine Preise, keine Beliebtheit. */
  function rank(result, prefs) {
    prefs = prefs || {};
    var kinds = prefs.kinds || [];
    return result.places.map(function (p) {
      var why = [], score = 0;
      var hit = p.kinds.filter(function (k) { return kinds.indexOf(k) >= 0; });
      if (hit.length) { score += hit.length * 3; why.push(hit.map(function (k) { return KINDS[k]; }).join(', ')); }
      var sf = seasonFit(p, prefs.month);
      if (sf === true) { score += 3; why.push('gute Reisezeit'); } else if (sf === false) { score -= 4; }
      var nf = nightsFit(p, prefs.nights);
      if (nf === true) { score += 2; why.push('passt zur Dauer'); } else if (nf === false) { score -= 2; }
      var spots = p.spots.filter(function (s) { return spotSeason(s, prefs.month) !== false; });
      if (prefs.family) { var fam = spots.filter(function (s) { return s.family; }).length; score += Math.min(3, fam); if (fam >= 3) why.push(fam + ' Ideen für Kinder'); }
      var indoor = spots.filter(function (s) { return s.indoor; }).length;
      if (prefs.rainy) { score += Math.min(4, indoor * 1.5); if (indoor) why.push(indoor + '× drinnen'); }
      return { place: p, score: score, why: why, season: sf, nightsFit: nf, roadKm: roadKm(p.airKm), minutes: driveMin(p.airKm),
        spots: spots, closed: p.spots.length - spots.length, indoor: indoor };
    }).sort(function (a, b) { return b.score - a.score || a.place.airKm - b.place.airKm; });
  }

  /* „Überrasch mich“: unter den besten Treffern zufällig, damit nicht immer dasselbe Ziel kommt */
  function surprise(ranked, rnd) {
    if (!ranked.length) return null;
    var top = ranked.slice(0, Math.max(3, Math.ceil(ranked.length / 3)));
    var r = typeof rnd === 'function' ? rnd() : Math.random();
    return top[Math.min(top.length - 1, Math.floor(r * top.length))];
  }

  /* Zwischenstopps: Attraktionen anderer Ziele, die kaum Umweg bedeuten. Umweg = Luftlinie A→S + S→Z − A→Z.
     Nur im mittleren Teil der Strecke (nicht direkt hinter der Haustür oder kurz vor dem Ziel). */
  function stopsAlong(places, origin, dest, opt) {
    opt = opt || {};
    var maxDetour = opt.maxDetour || 25, total = airKm(origin, dest), out = [];
    if (total < 60) return [];
    places.forEach(function (raw) {
      var p = raw.spots && raw.id ? raw : normPlace(raw);
      if (p.id === dest.id) return;
      p.spots.forEach(function (s) {
        var a = airKm(origin, s), b = airKm(s, dest), detour = a + b - total;
        if (detour <= maxDetour && a >= total * 0.2 && b >= total * 0.15) out.push({ spot: s, place: p, fromStart: round1(a), detourKm: Math.round(detour * ROAD_FACTOR) });
      });
    });
    out.sort(function (x, y) { return x.detourKm - y.detourKm || x.fromStart - y.fromStart; });
    return out.slice(0, opt.limit || 6).sort(function (x, y) { return x.fromStart - y.fromStart; });
  }

  /* Ausflüge vom Ziel aus: Attraktionen anderer Ziele im Umkreis */
  function nearbyFrom(places, dest, radius) {
    var out = [];
    places.forEach(function (raw) {
      var p = raw.spots && raw.id ? raw : normPlace(raw);
      if (p.id === dest.id) return;
      p.spots.forEach(function (s) { var d = airKm(dest, s); if (d <= (radius || 50)) out.push({ spot: s, place: p, airKm: round1(d), roadKm: roadKm(d) }); });
    });
    return out.sort(function (a, b) { return a.airKm - b.airKm; }).slice(0, 8);
  }

  /* Tagesgerüst: Ideen auf Tage und Zeitfenster verteilen. Tag 0 = Anreise (erst nachmittags), letzter Tag = Abreise
     (nur vormittags). Lange Ideen (≥ 4 Std.) belegen Vormittag und Nachmittag. Abend-Ideen in den Abend.
     Drinnen-Ideen eher nachmittags, damit sie bei Regen getauscht werden können. Gibt [{spotId, day, slot}] zurück. */
  /* occupied (optional): ['Tag|Zeitfenster', …] schon belegte Felder, z. B. aus einem bestehenden Plan („Lücken füllen“).
     range (optional): {from, to} nur diese Tage verwenden (Etappen einer Rundreise). */
  function dayPlan(spots, nights, occupied, range) {
    var days = Math.max(1, Math.round(+nights || 0) + 1), last = days - 1;
    var free = [], occ = {};
    (occupied || []).forEach(function (k) { occ[k] = true; });
    for (var d = 0; d < days; d++) {
      var slots = { morgen: true, nachm: true, abend: true };
      if (days > 1 && d === 0) slots.morgen = false;
      if (days > 1 && d === last) { slots.nachm = false; slots.abend = false; }
      if (range && (d < range.from || d > range.to)) slots = { morgen: false, nachm: false, abend: false };
      Object.keys(slots).forEach(function (k) { if (occ[d + '|' + k]) slots[k] = false; });
      free.push(slots);
    }
    var list = spots.slice().sort(function (a, b) { return (b.hours >= 4) - (a.hours >= 4) || a.indoor - b.indoor; });
    var out = [];
    list.forEach(function (s) {
      var i;
      if (s.hours >= 4 && s.slot !== 'abend') {
        for (i = 0; i < days; i++) if (free[i].morgen && free[i].nachm) { free[i].morgen = free[i].nachm = false; out.push({ spotId: s.id, day: i, slot: 'morgen' }); return; }
        return;
      }
      /* bevorzugtes Zeitfenster zuerst über alle Tage, erst dann das andere */
      var prefs = s.slot === 'abend' ? ['abend'] : s.indoor ? ['nachm', 'morgen'] : ['morgen', 'nachm'];
      for (var k = 0; k < prefs.length; k++) for (i = 0; i < days; i++) if (free[i][prefs[k]]) { free[i][prefs[k]] = false; out.push({ spotId: s.id, day: i, slot: prefs[k] }); return; }
    });
    return out;
  }

  /* Packhinweise je Thema; landen über das Feld bring in der bestehenden Packliste der App. Allgemeine Hinweise, keine Vorschriften. */
  var BRING = {
    natur: ['Feste Schuhe', 'Regenjacke'], berge: ['Feste Schuhe', 'Warme Schicht für oben'], wasser: ['Badesachen & Handtuch', 'Sonnenschutz'],
    therme: ['Badesachen & Handtuch', 'Badeschlappen'], unterwelt: ['Jacke (in Höhlen und Stollen ist es kühl)', 'Feste Schuhe'],
    winter: ['Warme Kleidung, Handschuhe, Mütze'], familie: ['Snacks & Getränke für Kinder'], burg: ['Bequeme Schuhe'], stadt: ['Bequeme Schuhe'],
    kultur: [], genuss: [], technik: []
  };
  function bringFor(kind) { return (BRING[kind] || []).slice(); }

  /* Dauer aus Freitext wie „ca. 2,5 Std.“, „90 Min.“, „1 Std. 30 Min.“; null wenn unbekannt */
  function parseHours(txt) {
    if (txt == null) return null;
    var t = String(txt).replace(',', '.'), h = t.match(/(\d+(?:\.\d+)?)\s*(?:std|h\b|stunde)/i), m = t.match(/(\d+)\s*min/i);
    if (!h && !m) return null;
    return (h ? +h[1] : 0) + (m ? +m[1] / 60 : 0);
  }

  /* Rundreise: Reihenfolge nach nächstem Nachbarn ab Start, danach 2-opt-Verbesserung; Rückkehr zum Start.
     Liefert {order:[Ziel…], legs:[{from,to,airKm,roadKm,minutes}], roadKm, minutes}. Alles Schätzungen. */
  function roundTrip(origin, places) {
    var rest = places.slice(), order = [], cur = origin;
    while (rest.length) {
      var bi = 0, bd = Infinity;
      rest.forEach(function (p, i) { var d = airKm(cur, p); if (d < bd) { bd = d; bi = i; } });
      cur = rest.splice(bi, 1)[0]; order.push(cur);
    }
    var len = function (o) { var s = 0, c = origin; o.forEach(function (p) { s += airKm(c, p); c = p; }); return s + airKm(c, origin); };
    var improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (var i = 0; i < order.length - 1; i++) for (var j = i + 1; j < order.length; j++) {
        var cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
        if (len(cand) + 1e-9 < len(order)) { order = cand; improved = true; }
      }
    }
    var legs = [], c = origin, pts = order.concat([origin]);
    pts.forEach(function (p) { var a = airKm(c, p); legs.push({ from: c, to: p, airKm: round1(a), roadKm: roadKm(a), minutes: driveMin(a) }); c = p; });
    return { order: order, legs: legs, roadKm: legs.reduce(function (s, l) { return s + l.roadKm; }, 0), minutes: legs.reduce(function (s, l) { return s + l.minutes; }, 0) };
  }
  /* Nächte auf Etappen verteilen: jedes Ziel mindestens 1 Nacht, Rest nach üblicher Mindestdauer und gleichmäßig. */
  function splitNights(order, total) {
    var n = order.map(function () { return 1; }), left = Math.max(0, Math.round(+total || 0) - order.length);
    order.forEach(function (p, i) { var want = Math.max(0, (p.nights ? p.nights[0] : 1) - 1); var give = Math.min(want, left); n[i] += give; left -= give; });
    for (var i = 0; left > 0; i = (i + 1) % order.length) { n[i]++; left--; }
    return n;
  }

  /* Text-Filter über Name, Region, Beschreibung, Idee und Attraktionen */
  function textMatch(p, q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return true;
    var hay = [p.name, p.region, p.country, p.summary, p.angle].concat(p.spots.map(function (s) { return s.name + ' ' + s.summary; })).join(' ').toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function sortRanked(ranked, mode) {
    var r = ranked.slice();
    if (mode === 'nah') r.sort(function (a, b) { return a.place.airKm - b.place.airKm; });
    else if (mode === 'weit') r.sort(function (a, b) { return b.place.airKm - a.place.airKm; });
    else if (mode === 'ideen') r.sort(function (a, b) { return b.spots.length - a.spots.length || b.score - a.score; });
    return r;
  }

  /* Mini-Karte: gleichabstandstreue Projektion um den Start (Kosinus-Korrektur), passend in w×h mit Rand.
     Liefert {origin:{x,y}, points:[{id,x,y}], kmPerPx, rings:[{km,r}]} für ein SVG ohne Kartendienst. */
  function mapLayout(origin, places, w, h, pad) {
    pad = pad == null ? 18 : pad;
    var k = Math.cos(rad(origin.lat)), xy = function (p) { return { x: (p.lon - origin.lon) * k * 111.32, y: -(p.lat - origin.lat) * 110.57 }; };
    var pts = places.map(function (p) { var q = xy(p); q.id = p.id; return q; });
    var ext = pts.reduce(function (m, q) { return Math.max(m, Math.abs(q.x), Math.abs(q.y)); }, 20);
    var scale = Math.min((w / 2 - pad) / ext, (h / 2 - pad) / ext);
    var cx = w / 2, cy = h / 2;
    var step = [25, 50, 100, 200, 300, 500, 750, 1000].find(function (s) { return ext / s <= 4; }) || 1000;
    var rings = []; for (var r = step; r <= ext * 1.05; r += step) rings.push({ km: r, r: r * scale });
    return { origin: { x: cx, y: cy }, points: pts.map(function (q) { return { id: q.id, x: Math.round((cx + q.x * scale) * 10) / 10, y: Math.round((cy + q.y * scale) * 10) / 10 }; }), kmPerPx: 1 / scale, rings: rings };
  }

  /* Belastung eines Tages: verfügbare Stunden (Standard 10) minus Fahrzeit am An- bzw. Abreisetag. */
  function dayCapacity(dayIndex, days, driveMinutes) {
    var cap = 10;
    if (days > 1 && (dayIndex === 0 || dayIndex === days - 1)) cap -= (driveMinutes || 0) / 60;
    if (days === 1) cap -= 2 * (driveMinutes || 0) / 60;
    return Math.max(0, Math.round(cap * 10) / 10);
  }

  /* Attraktion als eigene Unternehmung der Reise. Kosten sind offen, nicht kostenlos. */
  function toAct(s, place, uidFn) {
    return { id: uidFn('c'), custom: true, t: s.name, cat: KIND_CAT[s.kind] || 'ausflug', cost: 0, costOpen: true, per: 'pp',
      dur: s.hours >= 1 ? 'ca. ' + String(s.hours).replace('.', ',') + ' Std.' : 'ca. ' + Math.round(s.hours * 60) + ' Min.',
      link: '', note: s.summary + (s.tip ? ' Tipp: ' + s.tip : '') + ' (Katalog: ' + place.name + '. Preis, Öffnungszeiten und Saison vor Ort prüfen.)',
      slot: s.slot || (s.indoor ? 'nachm' : 'morgen'), indoor: !!s.indoor, catalogSpot: s.id, ort: place.name, map: s.name + ', ' + place.name,
      hours: s.hours, bring: bringFor(s.kind) };
  }

  var api = { ROAD_FACTOR: ROAD_FACTOR, AVG_KMH: AVG_KMH, MAX_KM: MAX_KM, KINDS: KINDS, KIND_CAT: KIND_CAT, RANGES: RANGES, ORIGINS: ORIGINS,
    airKm: airKm, roadKm: roadKm, driveMin: driveMin, durText: durText, validPoint: validPoint, normPlace: normPlace, normSpot: normSpot,
    checkQuery: checkQuery, searchLocal: searchLocal, seasonFit: seasonFit, spotSeason: spotSeason, rank: rank, surprise: surprise,
    stopsAlong: stopsAlong, nearbyFrom: nearbyFrom, dayPlan: dayPlan, toAct: toAct, BRING: BRING, bringFor: bringFor, parseHours: parseHours,
    roundTrip: roundTrip, splitNights: splitNights, textMatch: textMatch, sortRanked: sortRanked, mapLayout: mapLayout, dayCapacity: dayCapacity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RPCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
