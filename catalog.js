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
    genuss: 'Wein, Bier & Essen', technik: 'Technik & Industrie', winter: 'Winter & Schnee', unterwelt: 'Höhlen & Unterwelt',
    /* Katalog v4 (Claude, #8) */
    baden: 'Baden & Strand', tiere: 'Tiere & Wildparks', freizeit: 'Freizeit & Erlebnis', aktiv: 'Rad, Kanu & Klettern'
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
    /* weitere Referenzpunkte (Katalog v4) für bisher dünn abgedeckte Gegenden; Stadtmitte, ungefähr */
    ['Bamberg', 49.892, 10.887], ['Bayreuth', 49.945, 11.578], ['Bern', 46.948, 7.447], ['Bozen', 46.498, 11.354],
    ['Cottbus', 51.757, 14.329], ['Darmstadt', 49.873, 8.651], ['Flensburg', 54.784, 9.437], ['Göttingen', 51.541, 9.916],
    ['Halle (Saale)', 51.482, 11.970], ['Ingolstadt', 48.766, 11.425], ['Jena', 50.927, 11.586], ['Kempten', 47.726, 10.314],
    ['Klagenfurt', 46.624, 14.308], ['Luzern', 47.050, 8.309], ['Oldenburg', 53.143, 8.214], ['Potsdam', 52.396, 13.058],
    ['Ravensburg', 47.781, 9.612], ['Rosenheim', 47.857, 12.128], ['Schwerin', 53.629, 11.414], ['Siegen', 50.875, 8.024],
    ['St. Gallen', 47.424, 9.377], ['Straßburg', 48.573, 7.752], ['Tübingen', 48.521, 9.057], ['Wolfsburg', 52.423, 10.787],
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
  function searchLocal(data, query, opt) {
    var q = checkQuery(query), out = [];
    (data.places || []).forEach(function (raw) {
      var p = normPlace(raw), air = airKm(q, p), road = air * ROAD_FACTOR;
      if (road < q.minKm || road > q.maxKm) return;
      if (q.kinds.length && !p.kinds.some(function (k) { return q.kinds.indexOf(k) >= 0; })) return;
      p.airKm = round1(air); out.push({ p: p, air: air });
    });
    /* wie in SQL: nach ungerundeter Luftlinie, dann ID */
    out.sort(function (a, b) { return a.air - b.air || (a.p.id < b.p.id ? -1 : 1); });
    var lim = opt && opt.limit > 0 ? opt.limit : 80; /* wie die Datenbank: Standard 80 je Seite */
    return { version: data.version || 0, total: out.length, places: out.slice(opt && opt.offset > 0 ? opt.offset : 0, (opt && opt.offset > 0 ? opt.offset : 0) + lim).map(function (x) { return x.p; }) };
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

  /* Kacheln (Katalog-Build, catalog/index.js): welche Rasterkacheln kann ein Suchkreis berühren?
     Abstand Punkt→Kachel-Rechteck (geklemmt) gegen die größte Luftlinie, die maxKm Straße entsprechen kann. */
  function tilesFor(index, q) {
    var maxAir = (+q.maxKm) / ROAD_FACTOR + 1, out = [];
    Object.keys(index && index.tiles || {}).forEach(function (k) {
      var b = index.tiles[k].bbox, p = { lat: Math.min(Math.max(+q.lat, b[0]), b[2]), lon: Math.min(Math.max(+q.lon, b[1]), b[3]) };
      if (airKm({ lat: +q.lat, lon: +q.lon }, p) <= maxAir) out.push(k);
    });
    return out.sort();
  }

  /* Profil-Bewertung für „Worauf habt ihr Lust?“ (Claude, #8, Plan C2/C5). Bewertet Ziele (places), nicht einzelne Attraktionen.
     profile.kinds: { art: 'must' | 'like' | 'avoid' }  – unbedingt / gern / lieber nicht
     profile.month 1–12 | null, nights Zahl | null, pace 'ruhig'|'gemischt'|'aktiv'|null, party 'paar'|'familie'|'freunde'|'allein'|null,
     weatherSafe bool, maxMin Zahl | null (max. Fahrzeit Auto, Minuten), travel 'auto'|'bahn'|'flug'|null, budgetPp Zahl | null.
     Regeln: „unbedingt“ nur durch bekannte Merkmale (Art des Ziels oder saisonal passende Attraktion dieser Art). Fahrzeit-Muss nur mit
     bekannter Luftlinie (Schätzung × 1,3, als Schätzung benannt). Bahn-/Flugverbindungen und Preise kennt der Katalog nicht: sie erfüllen
     nie ein Muss, sondern erscheinen als „unbekannt“. „Lieber nicht“ ist eine ausdrücklich erklärte weiche Abwertung, kein Ausschluss.
     Rückgabe je Ziel: { place, score, mustOk, must:{met,missing,unknown}, why:[{type:'plus'|'minus'|'info'|'unknown', text}],
       wishes, met, summary, spots, indoor, family, roadKm, minutes, minutesEstimated:true } ; sortiert mustOk, score, Luftlinie, id. */
  var LEVELS = { must: 1, like: 1, avoid: 1 }, PACES = { ruhig: 1, gemischt: 1, aktiv: 1 }, PARTIES = { paar: 1, familie: 1, freunde: 1, allein: 1 },
    TRAVELS = { auto: 1, bahn: 1, flug: 1 };
  var CALM = ['therme', 'genuss', 'wasser', 'natur', 'baden'], ACTIVE = ['berge', 'natur', 'winter', 'unterwelt', 'aktiv'];
  var own = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  /* einfaches Objekt auch aus anderem Realm (iframe/vm): Prototyp ist null oder ein Objekt-Prototyp ohne weiteren Prototyp */
  var plain = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  /* Eingaben aus Browserprofil oder Formular: nur eigene, bekannte Schlüssel und Werte (kein __proto__/constructor/toString) */
  function checkProfile(pr) {
    pr = plain(pr) ? pr : {};
    var kinds = {};
    if (plain(pr.kinds)) Object.keys(pr.kinds).forEach(function (k) { var v = pr.kinds[k]; if (own(KINDS, k) && own(LEVELS, v)) kinds[k] = v; });
    var num = function (v, lo, hi) { if (typeof v !== 'number' && typeof v !== 'string') return null; v = v === '' ? null : +v; return v != null && isFinite(v) && v >= lo && v <= hi ? v : null; };
    return { kinds: kinds, month: num(pr.month, 1, 12), nights: num(pr.nights, 0, 60), pace: own(PACES, pr.pace) ? pr.pace : null,
      party: own(PARTIES, pr.party) ? pr.party : null, weatherSafe: pr.weatherSafe === true, maxMin: num(pr.maxMin, 5, 2000),
      travel: own(TRAVELS, pr.travel) ? pr.travel : null, budgetPp: num(pr.budgetPp, 0, 1e6) };
  }
  function rankProfile(result, profile) {
    var pr = checkProfile(profile), ks = Object.keys(pr.kinds);
    return (result.places || []).map(function (raw) {
      var p = normPlace(raw); /* idempotent: rohe Katalog- bzw. Datenbankzeilen und bereits normalisierte Ziele */
      var why = [], score = 0, must = { met: [], missing: [], unknown: [] }, wishes = 0, met = 0;
      var plus = function (t) { why.push({ type: 'plus', text: t }); }, minus = function (t) { why.push({ type: 'minus', text: t }); },
        info = function (t) { why.push({ type: 'info', text: t }); }, unk = function (t) { why.push({ type: 'unknown', text: t }); };
      var spots = p.spots.filter(function (s) { return spotSeason(s, pr.month) !== false; });
      var count = function (k) { return spots.filter(function (s) { return s.kind === k; }).length; };
      ks.forEach(function (k) {
        var lv = pr.kinds[k], has = p.kinds.indexOf(k) >= 0, n = count(k), name = KINDS[k];
        if (lv === 'avoid') {
          if (has || n) { var pen = (has ? 3 : 0) + Math.min(3, n); score -= pen; minus(name + ' gehört dazu (lieber nicht, abgewertet)'); }
          return;
        }
        wishes++;
        if (has || n) {
          met++; score += (lv === 'must' ? 4 : 3) + Math.min(2, n * 0.5);
          plus(name + (n ? ' · ' + n + (n === 1 ? ' Idee' : ' Ideen') : ''));
          if (lv === 'must') must.met.push(k);
        } else if (lv === 'must') { must.missing.push(k); minus(name + ' fehlt (unbedingt gewünscht)'); }
      });
      var sf = seasonFit(p, pr.month);
      if (pr.month) { wishes++; if (sf === true) { met++; score += 3; plus('gute Reisezeit'); } else if (sf === false) { score -= 4; minus('Reisemonat außerhalb der empfohlenen Zeit'); } else info('keine Saisonangabe'); }
      var nf = nightsFit(p, pr.nights);
      if (pr.nights != null) { wishes++; if (nf === true) { met++; score += 2; plus('passt zur Dauer'); } else if (nf === false) { score -= 2; minus('Dauer passt schlecht'); } }
      var fam = spots.filter(function (s) { return s.family; }).length, indoor = spots.filter(function (s) { return s.indoor; }).length;
      if (pr.party === 'familie') { wishes++; if (fam) { met++; score += Math.min(3, fam); plus(fam + (fam === 1 ? ' Idee' : ' Ideen') + ' für Kinder'); } else info('keine Attraktion ausdrücklich für Kinder markiert'); }
      if (pr.weatherSafe) { wishes++; if (indoor >= 2) { met++; score += Math.min(4, indoor * 1.5); plus(indoor + '× drinnen, auch bei Regen'); } else { score -= 2; minus(indoor ? 'nur 1 Idee drinnen' : 'kaum etwas drinnen'); } }
      if (pr.pace) {
        var calm = p.kinds.filter(function (k) { return CALM.indexOf(k) >= 0; }).length, act = p.kinds.filter(function (k) { return ACTIVE.indexOf(k) >= 0; }).length;
        if (pr.pace === 'ruhig' && calm) { score += 1.5; plus('eher ruhig (Annahme aus der Art des Ziels)'); }
        if (pr.pace === 'aktiv' && act) { score += 1.5; plus('eher aktiv (Annahme aus der Art des Ziels)'); }
      }
      var minutes = p.airKm != null ? driveMin(p.airKm) : null, rk = p.airKm != null ? roadKm(p.airKm) : null;
      if (pr.maxMin != null && (!pr.travel || pr.travel === 'auto')) {
        if (minutes == null) { must.unknown.push('fahrzeit'); unk('Fahrzeit unbekannt'); }
        else if (minutes <= pr.maxMin) { info('ca. ' + minutes + ' Min. Fahrt (Schätzung)'); }
        else { must.missing.push('fahrzeit'); minus('ca. ' + minutes + ' Min. Fahrt, mehr als ' + pr.maxMin + ' Min. (Schätzung)'); }
      }
      if (pr.travel === 'bahn' || pr.travel === 'flug') {
        if (pr.maxMin != null) must.unknown.push('fahrzeit');
        unk((pr.travel === 'bahn' ? 'Bahnverbindung' : 'Flugverbindung') + ' im Katalog nicht geprüft');
      }
      if (pr.budgetPp != null) { must.unknown.push('budget'); unk('Kosten im Katalog nicht bekannt, Budget nicht bewertet'); }
      /* Budget ist nie erfüllt (unbekannt), schließt aber auch nicht aus; eine Fahrzeitgrenze gilt nur mit bekannter Schätzung als erfüllt. */
      var mustOk = must.missing.length === 0 && must.unknown.indexOf('fahrzeit') < 0;
      return { place: p, score: Math.round(score * 10) / 10, mustOk: mustOk, must: must, why: why, wishes: wishes, met: met,
        summary: wishes ? 'passt zu ' + met + ' von ' + wishes + (wishes === 1 ? ' Wunsch' : ' Wünschen') : 'ohne Wünsche',
        spots: spots, closed: p.spots.length - spots.length, indoor: indoor, family: fam, roadKm: rk, minutes: minutes, minutesEstimated: true };
    }).sort(function (a, b) {
      return (b.mustOk - a.mustOk) || (b.score - a.score) || ((a.place.airKm == null ? 1e9 : a.place.airKm) - (b.place.airKm == null ? 1e9 : b.place.airKm)) || (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0);
    });
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

  /* „Bekanntes Ziel, neuer Blick“ (DESIGN_CATALOG.md, Vorschlag 3): ein Highlight plus eine ruhige Ergänzung am selben Ziel.
     Nur Paare mit kurzem Weg (Luftlinie ≤ 15 km) und zusammen höchstens 7 Std., damit Zeit zum Durchatmen bleibt. */
  var COMBOS = [
    ['berge', 'genuss', 'Aussicht, dann einkehren'], ['berge', 'wasser', 'Oben schauen, unten ans Wasser'],
    ['technik', 'natur', 'Technik, dann Luft schnappen'], ['technik', 'stadt', 'Technik, dann bummeln'],
    ['unterwelt', 'natur', 'Unter Tage, dann ins Grüne'], ['unterwelt', 'genuss', 'Unter Tage, dann einkehren'],
    ['burg', 'stadt', 'Burg und Altstadtbummel'], ['burg', 'natur', 'Burg und Spaziergang'],
    ['kultur', 'genuss', 'Museum, dann genießen'], ['kultur', 'natur', 'Kultur, dann durchatmen'],
    ['natur', 'therme', 'Draußen unterwegs, danach Wärme'], ['wasser', 'genuss', 'Am Wasser, dann einkehren'],
    ['familie', 'natur', 'Programm für Kinder, dann frei laufen'], ['stadt', 'genuss', 'Bummeln, dann genießen'],
    ['winter', 'therme', 'Schnee, danach Wärme']
  ];
  function combos(place, opt) {
    opt = opt || {};
    var sp = place.spots.filter(function (s) { return spotSeason(s, opt.month) !== false && (!opt.family || s.family); }), out = [], used = {};
    COMBOS.forEach(function (c) {
      sp.forEach(function (a) {
        if (a.kind !== c[0] || a.hours > 5) return;
        var best = null;
        sp.forEach(function (b) {
          if (b === a || b.kind !== c[1] || a.hours + b.hours > 7) return;
          var d = airKm(a, b); if (d > 15) return;
          if (!best || d < best.d) best = { b: b, d: d };
        });
        var key = best && [a.id, best.b.id].sort().join('|');
        if (best && !used[key]) { used[key] = true; out.push({ label: c[2], highlight: a, calm: best.b, airKm: round1(best.d), hours: a.hours + best.b.hours }); }
      });
    });
    /* jede Attraktion höchstens einmal als Highlight, abwechslungsreich zuerst */
    var seen = {}, res = [];
    out.forEach(function (x) { if (seen[x.highlight.id]) return; seen[x.highlight.id] = true; res.push(x); });
    return res.slice(0, opt.max || 3);
  }

  /* Ähnliche Ziele: Themen-Überschneidung (Jaccard) und gemeinsame gute Monate, optional nach Entfernung vom Start */
  function similar(place, places, opt) {
    opt = opt || {};
    var mine = place.kinds, mm = place.months;
    return places.map(function (raw) { return raw.spots && raw.id ? raw : normPlace(raw); }).filter(function (p) { return p.id !== place.id; }).map(function (p) {
      var inter = p.kinds.filter(function (k) { return mine.indexOf(k) >= 0; }).length, uni = new Set(mine.concat(p.kinds)).size;
      var mon = mm.length && p.months.length ? p.months.filter(function (m) { return mm.indexOf(m) >= 0; }).length / 12 : 0;
      return { place: p, score: Math.round((inter / Math.max(1, uni) + mon * 0.3) * 100) / 100, shared: p.kinds.filter(function (k) { return mine.indexOf(k) >= 0; }),
        airKm: opt.origin ? round1(airKm(opt.origin, p)) : null };
    }).filter(function (x) { return x.shared.length >= 2; }).sort(function (a, b) {
      return b.score - a.score || (a.airKm != null && b.airKm != null ? a.airKm - b.airKm : 0) || (a.place.id < b.place.id ? -1 : 1);
    }).slice(0, opt.max || 4);
  }
  /* Ziel direkt finden: Treffer über den ganzen Katalog, Name zuerst, dann Region/Ideen */
  function findPlaces(places, q, max) {
    q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
    /* Index-Einträge (catalog/index.js) haben statt Attraktionen nur deren Namen in sn */
    var list = places.map(function (raw) { var p = raw.spots && raw.id ? raw : normPlace(raw); return raw.sn && !(raw.spots && raw.spots.length) ? Object.assign({}, p, { spots: raw.sn.map(function (n, i) { return { id: p.id + '-' + i, name: n, summary: '' }; }) }) : p; });
    /* Gleiche Regel für Gesamtdatei und kompakten Index: Name, Region, Land, Kurzbeschreibung und Namen der Attraktionen */
    var match = function (p) { var hay = [p.name, p.region, p.country, p.summary].concat(p.spots.map(function (x) { return x.name; })).join(' ').toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; }); };
    var hit = list.filter(match).map(function (p) {
      var n = p.name.toLowerCase(); return { place: p, rank: n.indexOf(q) === 0 ? 0 : n.indexOf(q) >= 0 ? 1 : p.region.toLowerCase().indexOf(q) >= 0 ? 2 : 3 };
    });
    return hit.sort(function (a, b) { return a.rank - b.rank || a.place.name.localeCompare(b.place.name, 'de'); }).slice(0, max || 12).map(function (x) { return x.place; });
  }

  /* Zielvergleich: Zeilen für 2–3 bewertete Treffer (aus rank). Nur Unterschiede sichtbar machen, keine Wertung; unbekannt bleibt unbekannt. */
  function compareRows(xs, opt) {
    opt = opt || {};
    var M = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    var months = function (ms) { if (!ms.length) return 'unbekannt'; var a = ms.slice().sort(function (x, y) { return x - y; }); return a.length === 12 ? 'ganzjährig' : a.map(function (m) { return M[m - 1]; }).join(', '); };
    var rows = [
      ['Entfernung (geschätzt)', function (x) { return x.roadKm != null ? '≈ ' + x.roadKm + ' km · ca. ' + durText(x.minutes) : 'Abfahrtsort fehlt'; }],
      ['Gute Reisemonate', function (x) { return months(x.place.months); }]
    ];
    if (opt.month) rows.push(['Im ' + ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][opt.month - 1], function (x) { var f = seasonFit(x.place, opt.month); return f === true ? '✓ gute Reisezeit' : f === false ? '– eher Nebensaison' : 'unbekannt'; }]);
    rows.push(
      ['Übliche Dauer', function (x) { return x.place.nights[0] === x.place.nights[1] ? x.place.nights[0] + ' Nächte' : x.place.nights[0] + '–' + x.place.nights[1] + ' Nächte'; }],
      ['Themen', function (x) { return x.place.kinds.map(function (k) { return KINDS[k]; }).join(', '); }],
      ['Ideen vor Ort', function (x) { var sp = x.spots || x.place.spots; return sp.length + ' (drinnen ' + sp.filter(function (s) { return s.indoor; }).length + ', für Kinder ' + sp.filter(function (s) { return s.family; }).length + ')'; }],
      ['Mit Saisonbetrieb', function (x) { var n = x.place.spots.filter(function (s) { return s.months.length; }).length; return n ? n + ' Idee(n), Termine prüfen' : 'keine bekannt'; }],
      ['Tagesideen (Kombis)', function (x) { return String(combos(x.place, { month: opt.month }).length); }],
      ['Ums Eck gedacht', function (x) { return x.place.angle || '–'; }]
    );
    return rows.map(function (r) { return { label: r[0], values: xs.map(r[1]) }; });
  }

  /* Regenzwilling: nächste Drinnen-Ideen zu einer Draußen-Idee, im Umkreis, in der Saison, ohne schon geplante.
     Nur Vorschlag; erst ein bewusster Tausch plant die Alternative ein (keine doppelten Pflichtkosten). */
  function rainTwins(spot, places, opt) {
    opt = opt || {};
    var out = [], ex = opt.exclude || {};
    places.forEach(function (raw) {
      var p = raw.spots && raw.id ? raw : normPlace(raw);
      p.spots.forEach(function (s) {
        if (!s.indoor || s.id === spot.id || ex[s.id] || spotSeason(s, opt.month) === false) return;
        var d = airKm(spot, s); if (d <= (opt.radius || 30)) out.push({ spot: s, place: p, airKm: round1(d), roadKm: roadKm(d) });
      });
    });
    return out.sort(function (a, b) { return a.airKm - b.airKm; }).slice(0, opt.max || 3);
  }
  function findSpot(places, id) {
    for (var i = 0; i < places.length; i++) { var p = places[i].spots && places[i].id ? places[i] : normPlace(places[i]);
      for (var j = 0; j < p.spots.length; j++) if (p.spots[j].id === id) return { spot: p.spots[j], place: p }; }
    return null;
  }

  /* Weg zwischen zwei Orten im Nahbereich: Luftlinie × ROAD_FACTOR bei Ø 50 km/h plus 10 Min. für Parken/Fußweg, auf 5 Min. gerundet. Schätzung. */
  function localTransferMin(a, b) {
    if (!validPoint(a) || !validPoint(b)) return null;
    return Math.max(5, Math.round((airKm(a, b) * ROAD_FACTOR / 50 * 60 + 10) / 5) * 5);
  }

  /* Echte Straßenroute über routing.openstreetmap.de (FOSSGIS-OSRM, OpenStreetMap-Daten, ohne Schlüssel).
     Punkte als [{lat,lon}]; ergibt URL für eine Anfrage mit allen Abschnitten. */
  var ROUTE_BASE = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
  function routeUrl(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 25 || !points.every(validPoint)) throw new Error('Route braucht 2 bis 25 gültige Punkte.');
    return ROUTE_BASE + points.map(function (p) { return (+p.lon).toFixed(5) + ',' + (+p.lat).toFixed(5); }).join(';') + '?overview=false';
  }
  /* Antwort auswerten: km auf ganze km, Minuten auf 5 gerundet; je Abschnitt dasselbe. Fehler bei unbrauchbarer Antwort. */
  function parseRoute(j) {
    if (!j || j.code !== 'Ok' || !Array.isArray(j.routes) || !j.routes.length) throw new Error('Keine Route gefunden' + (j && j.message ? ': ' + j.message : '') + '.');
    var r = j.routes[0], m = function (sec) { return Math.max(5, Math.round(sec / 60 / 5) * 5); };
    if (!(r.distance >= 0) || !(r.duration >= 0)) throw new Error('Unvollständige Routenantwort.');
    return { km: Math.round(r.distance / 1000), minutes: m(r.duration),
      legs: (r.legs || []).map(function (l) { return { km: Math.round(l.distance / 1000), minutes: m(l.duration) }; }) };
  }

  /* Attraktion als eigene Unternehmung der Reise. Kosten sind offen, nicht kostenlos. */
  function toAct(s, place, uidFn) {
    return { id: uidFn('c'), custom: true, t: s.name, cat: KIND_CAT[s.kind] || 'ausflug', cost: 0, costOpen: true, per: 'pp',
      dur: s.hours >= 1 ? 'ca. ' + String(s.hours).replace('.', ',') + ' Std.' : 'ca. ' + Math.round(s.hours * 60) + ' Min.',
      link: '', note: s.summary + (s.tip ? ' Tipp: ' + s.tip : '') + ' (Katalog: ' + place.name + '. Preis, Öffnungszeiten und Saison vor Ort prüfen.)',
      slot: s.slot || (s.indoor ? 'nachm' : 'morgen'), indoor: !!s.indoor, catalogSpot: s.id, ort: place.name, map: s.name + ', ' + place.name,
      hours: s.hours, bring: bringFor(s.kind), geo: { lat: s.lat, lon: s.lon } };
  }

  var api = { ROAD_FACTOR: ROAD_FACTOR, AVG_KMH: AVG_KMH, MAX_KM: MAX_KM, KINDS: KINDS, KIND_CAT: KIND_CAT, RANGES: RANGES, ORIGINS: ORIGINS,
    airKm: airKm, roadKm: roadKm, driveMin: driveMin, durText: durText, validPoint: validPoint, normPlace: normPlace, normSpot: normSpot,
    checkQuery: checkQuery, searchLocal: searchLocal, seasonFit: seasonFit, spotSeason: spotSeason, rank: rank, tilesFor: tilesFor, rankProfile: rankProfile, checkProfile: checkProfile, surprise: surprise,
    stopsAlong: stopsAlong, nearbyFrom: nearbyFrom, dayPlan: dayPlan, toAct: toAct, BRING: BRING, bringFor: bringFor, parseHours: parseHours,
    roundTrip: roundTrip, splitNights: splitNights, rainTwins: rainTwins, findSpot: findSpot, COMBOS: COMBOS, combos: combos, similar: similar, findPlaces: findPlaces, compareRows: compareRows, localTransferMin: localTransferMin, ROUTE_BASE: ROUTE_BASE, routeUrl: routeUrl, parseRoute: parseRoute, textMatch: textMatch, sortRanked: sortRanked, mapLayout: mapLayout, dayCapacity: dayCapacity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RPCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
