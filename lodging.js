/* Reiseplaner · Unterkunftsregister (Claude, 16.11.2026; Projektanweisungen §8, §9; Planung M07 F1–F4, F12, F16)
   Reine Daten und Funktionen ohne DOM, im Browser als window.RPLodging, in Node per require.
   Drei Teile:
   1. KINDS   – Unterkunftsarten von Hotel bis Iglu, mit typischen Prüfpunkten. Das sind allgemeine Hinweise, was man bei
                dieser Art klären sollte, keine Zusagen über einen bestimmten Betrieb.
   2. PORTALS – Such- und Buchungsportale je Art. mode 'search' nur dort, wo das Adressformat im Code schon genutzt und
                geprüft wird (Booking, Airbnb, FeWo-direkt, s. app/ereignisse.js providerUrl); sonst 'portal' = Startseite,
                Ort und Datum stellt man dort selbst ein. Keine Live-Abfrage, keine Schnittstelle, keine Preise.
   3. ENTRIES – echte Betriebe mit Quelle und Prüfdatum. Nur Angaben, die die Quelle hergibt; jede Eigenschaft mit Status
                'bestaetigt' (offizielle Quelle) oder 'unbestaetigt' (Magazin/Portal/Annahme). Keine Preise, keine
                Verfügbarkeit. Lage = ungefährer Ortspunkt. Neue Einträge nur mit Quelle (tests/lodging.cjs prüft das).
   Speicherort zunächst diese Datei (Entscheidung offen: Datenbank später, D01). */
(function (root) {
  'use strict';
  var CHECKED = '2026-11-16', CHECKED2 = '2026-11-17';
  /* Quellenarten: offiziell = Website des Betriebs; tourismus = Seite des regionalen Tourismusverbands (Merkmale dort
     bleiben 'unbestaetigt'); magazin; portal. */
  var SRC_TYPES = { offiziell: 'Anbieter-Website', tourismus: 'Tourismusverband', magazin: 'Magazin', portal: 'Portal' };
  var GROUPS = [
    { id: 'klassisch', name: 'Hotel & Pension' },
    { id: 'wohnen', name: 'Ferienwohnen' },
    { id: 'land', name: 'Land & Hof' },
    { id: 'draussen', name: 'Camping & Glamping' },
    { id: 'berg', name: 'Berg & Hütte' },
    { id: 'besonders', name: 'Ausgefallen' }
  ];
  /* offerType: Zuordnung zur groben Angebotsart (offers[i].type: hotel|fewo|pension|other), damit ältere Stände lesbar bleiben */
  var KINDS = [
    { id: 'hotel', group: 'klassisch', name: 'Hotel', icon: '🏨', offerType: 'hotel', text: 'Zimmer mit Service, oft mit Frühstück.', check: ['Frühstück inklusive?', 'Parkplatz und Gebühr', 'Kurtaxe extra?'] },
    { id: 'wellnesshotel', group: 'klassisch', name: 'Wellnesshotel', icon: '♨️', offerType: 'hotel', text: 'Hotel mit Sauna, Bad oder Spa als Schwerpunkt.', check: ['Spa im Preis oder Gebühr?', 'Mindestalter im Spa', 'Halbpension Pflicht?', 'Mindestaufenthalt an Feiertagen'] },
    { id: 'gasthof', group: 'klassisch', name: 'Gasthof', icon: '🍺', offerType: 'pension', text: 'Wirtshaus mit Zimmern, meist im Ort.', check: ['Ruhetag der Küche', 'Frühstück inklusive?', 'Zimmer über der Gaststube (Lärm)?'] },
    { id: 'pension', group: 'klassisch', name: 'Pension / B&B', icon: '🛏️', offerType: 'pension', text: 'Kleines Haus mit wenigen Zimmern, oft familiär.', check: ['Anreisezeit (Schlüssel)', 'Barzahlung?', 'Frühstück inklusive?'] },
    { id: 'aparthotel', group: 'klassisch', name: 'Aparthotel', icon: '🏢', offerType: 'hotel', text: 'Apartment mit Küche und Hotelservice.', check: ['Endreinigung extra?', 'Küchenausstattung'] },
    { id: 'hostel', group: 'klassisch', name: 'Hostel', icon: '🎒', offerType: 'other', text: 'Günstige Betten, oft im Mehrbettzimmer.', check: ['Privatzimmer oder Schlafsaal?', 'Bettwäsche/Handtücher extra?', 'Altersgrenzen'] },
    { id: 'fewo', group: 'wohnen', name: 'Ferienwohnung', icon: '🏠', offerType: 'fewo', text: 'Wohnung mit Küche zum Selbstversorgen.', check: ['Endreinigung', 'Kurtaxe', 'Bettwäsche/Handtücher', 'Mindestnächte', 'Kaution'] },
    { id: 'ferienhaus', group: 'wohnen', name: 'Ferienhaus', icon: '🏡', offerType: 'fewo', text: 'Ganzes Haus, gut für Familien und Gruppen.', check: ['Endreinigung', 'Nebenkosten (Strom, Holz)', 'Kaution', 'An- und Abreisetag (oft Samstag)'] },
    { id: 'chalet', group: 'wohnen', name: 'Chalet', icon: '🛖', offerType: 'fewo', text: 'Holzhaus in den Bergen, oft mit Sauna oder Kamin.', check: ['Sauna im Preis?', 'Zufahrt im Winter (Schneeketten)', 'Endreinigung, Kaution'] },
    { id: 'tinyhouse', group: 'wohnen', name: 'Tiny House', icon: '📦', offerType: 'fewo', text: 'Sehr kleines Haus auf wenigen Quadratmetern.', check: ['Bad und WC im Haus?', 'Heizung im Winter', 'Platz für Gepäck'] },
    { id: 'bauernhof', group: 'land', name: 'Bauernhof', icon: '🐄', offerType: 'fewo', text: 'Ferien auf einem echten Hof, oft mit Tieren.', check: ['Mitmachen bei den Tieren?', 'Frühstück oder Selbstversorger', 'Allergien (Tiere, Heu)'] },
    { id: 'weingut', group: 'land', name: 'Weingut / Winzerhof', icon: '🍇', offerType: 'pension', text: 'Gästezimmer beim Winzer, oft mit Weinprobe.', check: ['Weinprobe im Preis?', 'Hofladen-Öffnungszeiten'] },
    { id: 'heuhotel', group: 'land', name: 'Heuhotel', icon: '🌾', offerType: 'other', text: 'Schlafen im Heu, meist auf einem Hof.', check: ['Schlafsack mitbringen?', 'Allergien (Heu, Staub)', 'Saison (oft nur Sommer)', 'Sanitär im Nebengebäude'] },
    { id: 'camping', group: 'draussen', name: 'Campingplatz', icon: '⛺', offerType: 'other', text: 'Stellplatz für Zelt, Wohnwagen oder Wohnmobil.', check: ['Preis je Person und Stellplatz', 'Strom extra?', 'Kurtaxe', 'Hunde', 'Wintercamping geöffnet?'] },
    { id: 'stellplatz', group: 'draussen', name: 'Wohnmobil-Stellplatz', icon: '🚐', offerType: 'other', text: 'Einfacher Platz für Wohnmobile.', check: ['Reservierbar oder nur vor Ort?', 'Ver- und Entsorgung', 'Länge des Fahrzeugs'] },
    { id: 'glamping', group: 'draussen', name: 'Glamping', icon: '🏕️', offerType: 'other', text: 'Komfort-Zelt, Lodge oder Safarizelt mit Bett.', check: ['Eigenes Bad oder Sanitärhaus?', 'Heizung', 'Saison', 'Bettwäsche inklusive?'] },
    { id: 'jurte', group: 'draussen', name: 'Jurte / Tipi', icon: '🛖', offerType: 'other', text: 'Rundzelt mit Ofen oder Betten.', check: ['Heizung (Ofen, Holz)', 'Sanitär', 'Saison'] },
    { id: 'schaeferwagen', group: 'draussen', name: 'Schäfer- / Zirkuswagen', icon: '🚃', offerType: 'other', text: 'Holzwagen mit Bett, oft auf einer Wiese.', check: ['Sanitär im Nebengebäude?', 'Heizung', 'Saison'] },
    { id: 'berghuette', group: 'berg', name: 'Berghütte (bewirtschaftet)', icon: '⛰️', offerType: 'other', text: 'Alpenvereins- oder Privathütte, nur zu Fuß erreichbar.', check: ['Nur zu Fuß: Gepäck tragen', 'Hüttenschlafsack Pflicht?', 'Halbpension üblich', 'Mitgliederpreis Alpenverein', 'Saison (meist Sommer)', 'Reservierung über Hüttenportal'] },
    { id: 'selbstversorgerhuette', group: 'berg', name: 'Selbstversorgerhütte / Alm', icon: '🪵', offerType: 'fewo', text: 'Hütte ohne Wirt, ihr versorgt euch selbst.', check: ['Zufahrt (Weg, Schnee)', 'Strom und Wasser vorhanden?', 'Holz für den Ofen', 'Endreinigung'] },
    { id: 'baumhaus', group: 'besonders', name: 'Baumhaus', icon: '🌳', offerType: 'other', text: 'Schlafen zwischen Baumkronen.', check: ['Bad im Baumhaus oder am Boden?', 'Heizung, Winterbetrieb', 'Treppe/Leiter (Kinder, Gepäck)', 'Mindestalter'] },
    { id: 'iglu', group: 'besonders', name: 'Iglu / Schneehotel', icon: '🧊', offerType: 'other', text: 'Eine Nacht im Schnee, meist mit Expeditionsschlafsack.', check: ['Nur im Winter', 'Schlafsack gestellt?', 'Warme Toilette/Dusche wo?', 'Bergbahn zur Anreise', 'Mindestalter'] },
    { id: 'hausboot', group: 'besonders', name: 'Hausboot', icon: '🛥️', offerType: 'other', text: 'Wohnen und fahren auf dem Wasser.', check: ['Führerscheinfrei oder Bootsführerschein?', 'Einweisung', 'Kaution', 'Treibstoff/Motorstunden extra', 'Endreinigung'] },
    { id: 'schloss', group: 'besonders', name: 'Burg / Schloss', icon: '🏰', offerType: 'hotel', text: 'Hotel oder Ferienwohnung in historischen Mauern.', check: ['Zimmer im historischen Teil oder Neubau?', 'Treppen ohne Aufzug', 'Veranstaltungen (Hochzeiten)'] },
    { id: 'kloster', group: 'besonders', name: 'Kloster', icon: '⛪', offerType: 'pension', text: 'Gästehaus im Kloster, ruhig und einfach.', check: ['Ruhezeiten', 'Mahlzeiten zu festen Zeiten', 'Einzel- oder Doppelzimmer'] },
    { id: 'leuchtturm', group: 'besonders', name: 'Leuchtturm / Wärterhaus', icon: '🗼', offerType: 'fewo', text: 'Wohnung in oder neben einem Leuchtturm.', check: ['Im Turm oder im Nebenhaus?', 'Treppen', 'Mindestnächte'] },
    { id: 'weinfass', group: 'besonders', name: 'Schlaffass', icon: '🛢️', offerType: 'other', text: 'Großes Holzfass mit Betten, meist beim Winzer.', check: ['Sanitär außerhalb?', 'Saison', 'Bettwäsche'] },
    { id: 'sonstiges', group: 'besonders', name: 'Andere besondere Unterkunft', icon: '✨', offerType: 'other', text: 'Waggon, Kapsel, Turm, Mühle und mehr.', check: ['Was ist im Preis?', 'Bad und Heizung', 'Erreichbarkeit'] }
  ];
  /* Portale. kinds: wofür sie sich anbieten ('*' = fast alles mit Bett). mode 'search' = vorbereiteter Suchlink,
     'portal' = Startseite. offerProvider = Wert für offers[i].provider (bestehende Liste); sonst 'direkt'. */
  var PORTALS = [
    { id: 'booking', name: 'Booking.com', home: 'https://www.booking.com/', mode: 'search', offerProvider: 'booking', kinds: ['hotel', 'wellnesshotel', 'gasthof', 'pension', 'aparthotel', 'hostel', 'fewo', 'ferienhaus', 'chalet', 'tinyhouse', 'bauernhof', 'weingut', 'glamping', 'schloss', 'kloster', 'baumhaus', 'hausboot', 'leuchtturm', 'sonstiges'] },
    { id: 'airbnb', name: 'Airbnb', home: 'https://www.airbnb.de/', mode: 'search', offerProvider: 'airbnb', kinds: ['fewo', 'ferienhaus', 'chalet', 'tinyhouse', 'bauernhof', 'baumhaus', 'jurte', 'schaeferwagen', 'glamping', 'hausboot', 'leuchtturm', 'weinfass', 'selbstversorgerhuette', 'schloss', 'sonstiges', 'pension'] },
    { id: 'fewo', name: 'FeWo-direkt', home: 'https://www.fewo-direkt.de/', mode: 'search', offerProvider: 'fewo', kinds: ['fewo', 'ferienhaus', 'chalet', 'tinyhouse', 'bauernhof', 'selbstversorgerhuette', 'leuchtturm'] },
    { id: 'check24', name: 'CHECK24 Hotel', home: 'https://hotel.check24.de/', mode: 'portal', offerProvider: 'check24', kinds: ['hotel', 'wellnesshotel', 'gasthof', 'pension', 'aparthotel', 'schloss'] },
    { id: 'holidu', name: 'Holidu', home: 'https://www.holidu.de/', mode: 'portal', offerProvider: 'holidu', kinds: ['fewo', 'ferienhaus', 'chalet', 'tinyhouse', 'bauernhof'] },
    { id: 'traum', name: 'Traum-Ferienwohnungen', home: 'https://www.traum-ferienwohnungen.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['fewo', 'ferienhaus', 'chalet', 'bauernhof', 'leuchtturm', 'selbstversorgerhuette'] },
    { id: 'hrs', name: 'HRS', home: 'https://www.hrs.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['hotel', 'wellnesshotel', 'gasthof', 'aparthotel'] },
    { id: 'expedia', name: 'Expedia', home: 'https://www.expedia.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['hotel', 'wellnesshotel', 'aparthotel', 'schloss'] },
    { id: 'trivago', name: 'trivago (Preisvergleich)', home: 'https://www.trivago.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['hotel', 'wellnesshotel', 'gasthof', 'pension', 'aparthotel'] },
    { id: 'hostelworld', name: 'Hostelworld', home: 'https://www.hostelworld.com/', mode: 'portal', offerProvider: 'direkt', kinds: ['hostel'] },
    { id: 'landreise', name: 'Landreise.de (Bauernhof & Land)', home: 'https://www.landreise.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['bauernhof', 'weingut', 'heuhotel', 'fewo', 'ferienhaus'] },
    { id: 'pincamp', name: 'PiNCAMP (ADAC)', home: 'https://www.pincamp.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['camping', 'stellplatz', 'glamping', 'jurte', 'schaeferwagen', 'tinyhouse'] },
    { id: 'campinginfo', name: 'camping.info', home: 'https://www.camping.info/', mode: 'portal', offerProvider: 'direkt', kinds: ['camping', 'stellplatz', 'glamping'] },
    { id: 'glampinghub', name: 'Glamping Hub', home: 'https://glampinghub.com/', mode: 'portal', offerProvider: 'direkt', kinds: ['glamping', 'baumhaus', 'jurte', 'schaeferwagen', 'tinyhouse', 'sonstiges'] },
    { id: 'huetten', name: 'Hüttenreservierung (Alpenvereine)', home: 'https://www.hut-reservation.org/', mode: 'portal', offerProvider: 'direkt', kinds: ['berghuette'] },
    { id: 'kuhnle', name: 'Kuhnle-Tours (Hausboote)', home: 'https://www.kuhnle-tours.de/', mode: 'portal', offerProvider: 'direkt', kinds: ['hausboot'] }
  ];
  /* Echte Betriebe. facts: {merkmal: {v: true|false, st: 'bestaetigt'|'unbestaetigt'}}. src.type: offiziell|magazin|portal. */
  var FACTS = { winter: 'Im Winter geöffnet', sommer: 'Im Sommer geöffnet', restaurant: 'Restaurant / Verpflegung', fuss: 'Nur zu Fuß erreichbar', fuehrerscheinfrei: 'Ohne Führerschein fahrbar', familie: 'Für Familien', sauna: 'Sauna / Wellness', fruehstueck: 'Frühstück', hofladen: 'Hofladen' };
  var ENTRIES = [
    { id: 'lg-tripsdrill-naturresort', name: 'Natur-Resort Tripsdrill', kinds: ['baumhaus', 'schaeferwagen'], place: 'Cleebronn', region: 'Baden-Württemberg', country: 'DE', lat: 49.03, lon: 9.06,
      url: 'https://tripsdrill.de/de/natur-resort', summary: 'Baumhäuser und Schäferwagen neben dem Wildparadies und Erlebnispark Tripsdrill, mit Sommer- und Wintersaison.',
      facts: { sommer: { v: true, st: 'bestaetigt' }, winter: { v: true, st: 'bestaetigt' }, familie: { v: true, st: 'unbestaetigt' } },
      src: { url: 'https://tripsdrill.de/de/natur-resort', type: 'offiziell', checked: CHECKED }, bookVia: ['direkt'] },
    { id: 'lg-burg-staufeneck', name: 'Burghotel Staufeneck', kinds: ['schloss', 'hotel'], place: 'Salach', region: 'Baden-Württemberg', country: 'DE', lat: 48.69, lon: 9.75,
      url: 'https://www.burg-staufeneck.de/', summary: 'Hotel mit Restaurant bei der Burgruine Staufeneck über dem Filstal.',
      facts: { restaurant: { v: true, st: 'bestaetigt' } },
      src: { url: 'https://www.burg-staufeneck.de/en/rooms-suites', type: 'offiziell', checked: CHECKED }, bookVia: ['direkt', 'booking'] },
    { id: 'lg-baumhaushotel-seemuehle', name: 'Baumhaushotel Seemühle', kinds: ['baumhaus', 'fewo'], place: 'Gräfendorf', region: 'Bayern (Unterfranken)', country: 'DE', lat: 50.12, lon: 9.74,
      url: 'https://www.das-baumhaushotel.de/', summary: 'Baumhäuser und Appartements an einer alten Mühle im Spessart.',
      facts: {},
      src: { url: 'https://www.das-baumhaushotel.de/baumhaeuser/', type: 'offiziell', checked: CHECKED }, bookVia: ['direkt'] },
    { id: 'lg-iglulodge-nebelhorn', name: 'Iglu Lodge am Nebelhorn', kinds: ['iglu'], place: 'Oberstdorf', region: 'Allgäu', country: 'DE', lat: 47.42, lon: 10.33,
      url: 'https://www.ok-bergbahnen.com/en/erlebnis-spass/mehr-winterspass/iglulodge-nebelhorn/', summary: 'Iglus im Skigebiet Nebelhorn, erreichbar mit der Bergbahn.',
      facts: { winter: { v: true, st: 'bestaetigt' }, sommer: { v: false, st: 'unbestaetigt' } },
      src: { url: 'https://www.ok-bergbahnen.com/en/erlebnis-spass/mehr-winterspass/iglulodge-nebelhorn/', type: 'offiziell', checked: CHECKED }, bookVia: ['direkt'] },
    { id: 'lg-iglu-dorf-kuehtai', name: 'Iglu-Dorf Kühtai', kinds: ['iglu'], place: 'Kühtai', region: 'Tirol', country: 'AT', lat: 47.21, lon: 11.02,
      url: 'https://www.iglu-dorf.com/en/location/kuhtai', summary: 'Iglu-Dorf im Skigebiet Kühtai westlich von Innsbruck.',
      facts: { winter: { v: true, st: 'bestaetigt' } },
      src: { url: 'https://www.iglu-dorf.com/en/location/kuhtai', type: 'offiziell', checked: CHECKED }, bookVia: ['direkt'] },
    { id: 'lg-prinz-luitpold-haus', name: 'Prinz-Luitpold-Haus (DAV)', kinds: ['berghuette'], place: 'Bad Hindelang, Hinterstein', region: 'Allgäu', country: 'DE', lat: 47.39, lon: 10.39,
      url: 'https://www.alpenverein.de/artikel/bio-hutte-prinz-luitopold-haus_10975006-013d-4865-8051-d3cae26fcc4a', summary: 'Alpenvereinshütte am Allgäuer Hauptkamm, Aufstieg vom Giebelhaus; bio-zertifizierte Hüttenküche.',
      facts: { fuss: { v: true, st: 'bestaetigt' }, restaurant: { v: true, st: 'bestaetigt' }, winter: { v: false, st: 'unbestaetigt' } },
      src: { url: 'https://www.alpenverein.de/artikel/bio-hutte-prinz-luitopold-haus_10975006-013d-4865-8051-d3cae26fcc4a', type: 'offiziell', checked: CHECKED }, bookVia: ['huetten'] },
    { id: 'lg-kloster-schoental', name: 'Bildungshaus Kloster Schöntal', kinds: ['kloster'], place: 'Schöntal', region: 'Baden-Württemberg (Hohenlohe)', country: 'DE', lat: 49.33, lon: 9.50,
      url: 'https://www.kloster-schoental.de/uebernachten/', summary: 'Übernachten im barocken Kloster an der Jagst.',
      facts: {},
      src: { url: 'https://www.kloster-schoental.de/uebernachten/', type: 'offiziell', checked: CHECKED }, bookVia: ['direkt'] },
    { id: 'lg-kuhnle-rechlin', name: 'Kuhnle-Tours Hausbootstation Rechlin', kinds: ['hausboot'], place: 'Rechlin (Müritz)', region: 'Mecklenburgische Seenplatte', country: 'DE', lat: 53.35, lon: 12.72,
      url: 'https://www.kuhnle-tours.de/', summary: 'Hausboote auf der Müritz und den angrenzenden Seen; der Anbieter hat auch führerscheinfreie Boote.',
      facts: { fuehrerscheinfrei: { v: true, st: 'bestaetigt' } },
      src: { url: 'https://www.kuhnle-tours.de/boot/fuehrerscheinfrei-boot-fahren/', type: 'offiziell', checked: CHECKED }, bookVia: ['kuhnle'] },
    { id: 'lg-hofgut-hopfenburg', name: 'Hofgut Hopfenburg', kinds: ['glamping', 'camping', 'bauernhof'], place: 'Münsingen', region: 'Schwäbische Alb', country: 'DE', lat: 48.41, lon: 9.50,
      url: 'https://www.hopfenburg.de/', summary: 'Hofgut mit Campingplatz und besonderen Unterkünften auf der Schwäbischen Alb; Hofladen und Frühstück laut Website.',
      facts: { fruehstueck: { v: true, st: 'bestaetigt' }, hofladen: { v: true, st: 'bestaetigt' } },
      src: { url: 'https://www.hopfenburg.de/hof-erleben/essen', type: 'offiziell', checked: CHECKED }, note: 'Art der Unterkünfte (Jurten, Wagen, Zelte) nur laut Magazin promobil, beim Anbieter prüfen.', bookVia: ['direkt'] },
    /* Ergänzt 17.11.2026 (Philipp „Ja!“ zum Erweitern), geprüft über Websuche: Domain und Seiten sichtbar. */
    { id: 'lg-schlafen-im-weinfass', name: 'Schlafen im Weinfass', kinds: ['weinfass'], place: 'Sasbachwalden', region: 'Schwarzwald (Ortenau)', country: 'DE', lat: 48.62, lon: 8.13,
      url: 'https://www.schlafen-im-weinfass.de/', summary: 'Schlaffässer in den Reben über Sasbachwalden; die Gemeinde führt das Angebot auch auf ihrer Website.',
      facts: {},
      src: { url: 'https://www.schlafen-im-weinfass.de/', type: 'offiziell', checked: CHECKED2 }, bookVia: ['direkt'] },
    { id: 'lg-hasenhof-hornberg', name: 'Heuhotel auf dem Hasenhof', kinds: ['heuhotel', 'bauernhof'], place: 'Hornberg', region: 'Schwarzwald', country: 'DE', lat: 48.21, lon: 8.23,
      url: 'https://www.schwarzwald-tourismus.info/unterkuenfte/heuhotel-auf-dem-hasenhof-94807be499', summary: 'Schlafen im Heu auf einem Schwarzwaldhof bei Hornberg.',
      facts: {},
      src: { url: 'https://www.schwarzwald-tourismus.info/unterkuenfte/heuhotel-auf-dem-hasenhof-94807be499', type: 'tourismus', checked: CHECKED2 }, note: 'Nur über den Tourismusverband gefunden; Saison und Ausstattung beim Hof erfragen.', bookVia: ['direkt'] },
    { id: 'lg-heuferienhof-altkamp', name: 'Heu-Ferienhof Altkamp', kinds: ['heuhotel', 'bauernhof'], place: 'Putbus, OT Altkamp (Rügen)', region: 'Mecklenburg-Vorpommern', country: 'DE', lat: 54.35, lon: 13.47,
      url: 'https://www.auf-nach-mv.de/reiseziele/a-heuferienhof-gmbh', summary: 'Hof auf Rügen mit Heukojen zum Übernachten.',
      facts: {},
      src: { url: 'https://www.auf-nach-mv.de/reiseziele/a-heuferienhof-gmbh', type: 'tourismus', checked: CHECKED2 }, note: 'Heukojen laut Buchungsportalen; beim Hof bestätigen lassen.', bookVia: ['direkt'] },
    { id: 'lg-ettershaus-baumhaeuser', name: 'Baumhäuser im Sonnenresort Ettershaus', kinds: ['baumhaus', 'hotel'], place: 'Bad Harzburg', region: 'Harz (Niedersachsen)', country: 'DE', lat: 51.88, lon: 10.56,
      url: 'https://sonnenhotels.de/de/blog/seh-baumhaus-urlaub-harz-ettershaus', summary: 'Resort-Hotel im Harz mit 14 Baumhäusern laut Anbieter.',
      facts: { sauna: { v: true, st: 'unbestaetigt' } },
      src: { url: 'https://sonnenhotels.de/de/blog/seh-baumhaus-urlaub-harz-ettershaus', type: 'offiziell', checked: CHECKED2 }, bookVia: ['direkt'] },
    { id: 'lg-weissenhaeuser-strandkorb', name: 'Schlafstrandkorb am Weissenhäuser Strand', kinds: ['sonstiges'], place: 'Wangels, Weissenhäuser Strand', region: 'Ostsee (Schleswig-Holstein)', country: 'DE', lat: 54.30, lon: 10.82,
      url: 'https://www.weissenhaeuserstrand.de/en/offers/wicker-beach-bed/', summary: 'Eine Nacht im Schlafstrandkorb am Strand des Ferienparks.',
      facts: { winter: { v: false, st: 'unbestaetigt' } },
      src: { url: 'https://www.weissenhaeuserstrand.de/en/offers/wicker-beach-bed/', type: 'offiziell', checked: CHECKED2 }, note: 'Nur in der warmen Saison anzunehmen; Termine beim Anbieter.', bookVia: ['direkt'] },
    { id: 'lg-huettenpalast-berlin', name: 'Hüttenpalast', kinds: ['sonstiges', 'hostel'], place: 'Berlin-Neukölln', region: 'Berlin', country: 'DE', lat: 52.49, lon: 13.43,
      url: 'https://huettenpalast.de/', summary: 'Alte Wohnwagen und Holzhütten in einer früheren Fabrikhalle, dazu Zimmer.',
      facts: {},
      src: { url: 'https://huettenpalast.de/en/hotel/', type: 'offiziell', checked: CHECKED2 }, bookVia: ['direkt'] },
    { id: 'lg-hotel-im-wasserturm', name: 'Hotel im Wasserturm', kinds: ['sonstiges', 'hotel'], place: 'Köln', region: 'Nordrhein-Westfalen', country: 'DE', lat: 50.93, lon: 6.95,
      url: 'https://www.hotel-im-wasserturm.de/', summary: 'Hotel in einem historischen Wasserturm in der Kölner Innenstadt, mit Dachterrasse.',
      facts: { restaurant: { v: true, st: 'unbestaetigt' } },
      src: { url: 'https://www.hotel-im-wasserturm.de/', type: 'offiziell', checked: CHECKED2 }, bookVia: ['direkt', 'booking'] }
  ];

  var kindById = function (id) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i]; return null; };
  var portalById = function (id) { for (var i = 0; i < PORTALS.length; i++) if (PORTALS[i].id === id) return PORTALS[i]; return null; };
  function portalsFor(kind) { return PORTALS.filter(function (p) { return !kind || p.kinds.indexOf(kind) >= 0; }); }
  function km(a, b) {
    if (!a || !b || !isFinite(+a.lat) || !isFinite(+b.lat)) return null;
    var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }
  /* Register durchsuchen: kind, text (Name/Ort/Region), from {lat,lon} für Entfernung, maxKm. Sortiert nach Entfernung. */
  function find(q) {
    q = q || {};
    var text = String(q.text || '').trim().toLocaleLowerCase('de');
    return ENTRIES.filter(function (e) {
      if (q.kind && e.kinds.indexOf(q.kind) < 0) return false;
      if (text && (e.name + ' ' + e.place + ' ' + e.region).toLocaleLowerCase('de').indexOf(text) < 0) return false;
      return true;
    }).map(function (e) { return { e: e, km: km(q.from, e) }; })
      .filter(function (x) { return !(q.maxKm != null && x.km != null && x.km > q.maxKm); })
      .sort(function (a, b) { return (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km) || a.e.name.localeCompare(b.e.name, 'de'); });
  }
  /* Merkmal als Text, Status immer sichtbar */
  function factText(e, k) {
    var f = e.facts && e.facts[k]; if (!f) return null;
    return (f.v ? '' : 'nicht: ') + FACTS[k] + (f.st === 'bestaetigt' ? ' (laut Anbieter)' : ' (unbestätigt)');
  }
  /* Prüfung der Daten (Tests und Konsole) */
  function validate() {
    var ids = {}, errs = [];
    KINDS.forEach(function (k) { if (ids['k:' + k.id]) errs.push('Art doppelt: ' + k.id); ids['k:' + k.id] = 1; if (!GROUPS.some(function (g) { return g.id === k.group; })) errs.push('Gruppe fehlt: ' + k.id); if (['hotel', 'fewo', 'pension', 'other'].indexOf(k.offerType) < 0) errs.push('offerType: ' + k.id); });
    PORTALS.forEach(function (p) { if (!/^https:\/\//.test(p.home)) errs.push('Portal ohne HTTPS: ' + p.id); p.kinds.forEach(function (k) { if (!kindById(k)) errs.push('Portal ' + p.id + ': Art ' + k); }); });
    ENTRIES.forEach(function (e) {
      if (!/^lg-[a-z0-9-]+$/.test(e.id) || ids[e.id]) errs.push('ID: ' + e.id); ids[e.id] = 1;
      if (!e.src || !/^https:\/\//.test(e.src.url) || !/^\d{4}-\d{2}-\d{2}$/.test(e.src.checked) || !SRC_TYPES[e.src.type]) errs.push('Quelle fehlt: ' + e.id);
      if (!/^https:\/\//.test(e.url)) errs.push('Link: ' + e.id);
      if (!e.kinds.length || e.kinds.some(function (k) { return !kindById(k); })) errs.push('Art: ' + e.id);
      Object.keys(e.facts || {}).forEach(function (k) { var f = e.facts[k]; if (!FACTS[k] || typeof f.v !== 'boolean' || ['bestaetigt', 'unbestaetigt'].indexOf(f.st) < 0) errs.push('Merkmal ' + k + ': ' + e.id); if (f.st === 'bestaetigt' && e.src.type !== 'offiziell') errs.push('bestätigt nur mit offizieller Quelle: ' + e.id); });
      ['price', 'priceNight', 'preis'].forEach(function (k) { if (k in e) errs.push('Keine Preise im Register: ' + e.id); });
      (e.bookVia || []).forEach(function (b) { if (b !== 'direkt' && !portalById(b)) errs.push('bookVia: ' + e.id); });
    });
    return errs;
  }
  var api = { CHECKED: CHECKED, SRC_TYPES: SRC_TYPES, GROUPS: GROUPS, KINDS: KINDS, PORTALS: PORTALS, FACTS: FACTS, ENTRIES: ENTRIES, kindById: kindById, portalById: portalById, portalsFor: portalsFor, km: km, find: find, factText: factText, validate: validate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPLodging = api;
})(typeof window !== 'undefined' ? window : this);
