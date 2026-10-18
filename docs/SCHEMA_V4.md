# Datenvertrag v4 · Fotos und Reisebücher · Entwurf

Stand 18.10.2026, Entwurf von Claude (Paket 2, ohne ChatGPT-Review), ergänzt um die Seitenfelder des Erstentwurfs aus `bookgen.js` (Regel `bookgen-1`, Paket 3). Grundlage: [`PLAN_IOS_APP.md`](PLAN_IOS_APP.md) §5.2, §6, §7
und das Verfahren aus [`SCHEMA_V3.md`](SCHEMA_V3.md). Die Regeln stehen in `v4logic.js` (Tests `tests/v4logic.cjs`).
**Status: Entwurf. Nichts davon ist in der App verdrahtet, keine Datenbankmigration, keine Freigabe.**

## 0 · Grundsätze

1. **Fotos stehen nie in der Reise-JSON.** `t.media` beschreibt Bilder und verweist auf sie. Die Dateien liegen getrennt
   (Web: IndexedDB `rp-media`, App: App-Container, Export: `media/<id>.jpg`, `thumbs/<id>.jpg`). Felder für Bilddaten
   (`data`, `blob`, `exif` usw.) gibt es nicht; unbekannte Felder werden abgelehnt.
2. **v4 ist eine Obermenge von v3.** Alle v2- und v3-Felder behalten Bedeutung und Validierung. Es kommen nur `media` und
   `books` hinzu.
3. **Version je Reise, keine Rückstufung.** `schemaVersion: 4` bekommt eine Reise erst mit einem nicht leeren `media` oder
   `books`. Einmal 4, immer 4, auch wenn alle Fotos und Bücher wieder gelöscht sind.
4. **Nichts erfinden.** Fehlende Aufnahmezeit bleibt `null`, fehlende Koordinaten fehlen. Eine Zuordnung zu Tag oder
   Unternehmung ist ein Vorschlag (PLAN_IOS_APP §6.2), nie eine stille Annahme.
5. **IDs** wie in v3: `/^[a-z][a-z0-9]{3,40}$/`, eindeutig je Liste (Fotos, Bücher, Seiten je Buch).
6. **Reisebücher enthalten keine Buchungsnummern und keine Zahlungsdetails** (§3.3).

## 1 · Version, Speicher, Sync, Sicherung

| Bereich | Regel | Funktion |
| --- | --- | --- |
| Erkennen | `needsV4(t)`: `media` oder `books` vorhanden und nicht leer. Leere Listen zählen nicht | `needsV4` |
| Zielversion | `max(gespeicherte Version, 4 falls needsV4, 3 falls needsV3, 2)`. Nie niedriger als gespeichert | `targetVersion` |
| Rückstufung | Clientseitig abgewiesen, bevor geschrieben wird. Serverseitig über den Trigger (§7) | `assertNoDowngrade` |
| Format < 4 schreiben | keine, auch keine leeren, v4-Felder; nicht leere werden abgelehnt (wie `serializeTrip` in v3) | `serializeTrip4` |
| Format 4 schreiben | unverändert als tiefe Kopie (Feldtreue), leere Listen bleiben | `serializeTrip4` |
| Prüfen | v4-Felder nur bei `schemaVersion === 4`. In einer v2/v3-Reise abgelehnt | `validateV4` |
| Ältere Stände | sehen eine v4-Reise als „neueres Format, nur lesen“ (`SCHEMA_MAX`, Mechanismus `sync-unreadable`) und überschreiben sie nicht | `readable` |
| Feldtreue | Jeder Client, der v4 liest, schreibt `media` und `books` unverändert zurück, auch ohne Foto-Oberfläche. Kein Neuaufbau aus Feldlisten bei Export, Import, Kopie, Wiederherstellung oder Sync | Pflichttest bei Anbindung |
| Konfliktkopie | erhält Version und `media`; beide Reisen verweisen auf dieselben Dateien (gleiche ID, gleiche Prüfsumme) | `archivePlan` |
| Lokal | Reisen wie bisher; Bilddateien im Medienspeicher, Schlüssel = Foto-ID. Eine Reise auf einem zweiten Gerät kennt die Einträge, aber nicht unbedingt die Dateien: dort „Foto auf diesem Gerät nicht vorhanden“, kein Löschen des Eintrags | App |

## 2 · Fotos (`t.media`)

```text
t.media = [{ id, kind:'photo', takenAt:ISO|null, lat?, lon?, w, h, bytes, sha256,
             caption, day:'YYYY-MM-DD'|'d<i>'|null, actId?, spotId?, by?:partyId,
             fav:bool, hidden:bool, cloud:{ state:'none'|'queued'|'done'|'error', path? } }]
```

| Feld | Pflicht | Regel |
| --- | --- | --- |
| `id` | ja | ID, eindeutig in der Reise; zugleich Dateiname `<id>.jpg` |
| `kind` | ja | nur `'photo'` (Video ist nicht Teil von v4) |
| `takenAt` | ja, darf `null` | ISO 8601 `JJJJ-MM-TTThh:mm[:ss[.mmm]][Z\|±hh:mm]`, echtes Kalenderdatum. **Ohne Versatz ist es eine Ortszeit der Kamera, kein Zeitpunkt** (EXIF kennt die Zeitzone oft nicht) |
| `lat`, `lon` | nur gemeinsam | −90…90 bzw. −180…180, endlich. Fehlen = unbekannt |
| `w`, `h` | ja | ganze Pixel 1…20000 (Arbeitskopie, Ziel 2048 px lange Kante) |
| `bytes` | ja | ganze Zahl 1…25 MB der Arbeitskopie |
| `sha256` | ja | 64 Hexzeichen, klein. **Eindeutig je Reise**: verhindert doppelte Importe |
| `caption` | ja | Text ≤ 500, leer erlaubt |
| `day` | ja, darf `null` | Reisetag wie im Tagebuch (v3 §4): Datum oder `d<Index>` (0–9999); `null` = Korb „ohne Tag“ |
| `actId` | nein | Unternehmung (`/^[A-Za-z0-9_-]{1,60}$/` wie `ratings`). Bleibt erhalten, wenn die Unternehmung aus dem Plan fällt |
| `spotId` | nein | Katalog-Attraktion (`/^[a-z0-9][a-z0-9-]{0,79}$/`) |
| `by` | nein | `party`-ID der Person, die das Foto beigetragen hat; muss in `t.party` existieren |
| `fav`, `hidden` | ja | `true`/`false`. `hidden` blendet in Ansichten und Buchentwürfen aus, löscht nichts |
| `cloud` | ja | `state` aus der Liste; `path` nur und genau bei `done`, Form `<Reise>/<Foto-ID>.jpg` |

- **Grenzen:** höchstens 2000 Fotos je Reise (rund 0,6 MB JSON). Das Cloud-Kontingent (PLAN_IOS_APP §6.4) ist eine eigene, niedrigere Zahl und noch offen.
- **Neue Einträge** laufen durch `normalizeMedia`: Standardwerte (`kind`, `caption ''`, `day null`, `fav/hidden false`, `cloud none`),
  Prüfsumme klein geschrieben, Bildunterschrift an den Rändern gekürzt, danach strenge Prüfung. **Gespeicherte Einträge** werden
  nur geprüft (`validateMedia`), nie still umgeschrieben.
- **Standort:** `stripLocation` entfernt `lat/lon` aus Kopien. Pflicht für geteilte und exportierte Reisebücher (PLAN_IOS_APP §6.3).
  Die Arbeitskopie wird über Canvas oder nativ neu kodiert und trägt deshalb keine EXIF-Daten; das prüft die App, nicht dieses Modul.
- **Entfernen:** `removeMedia` liefert eine neue Reise. Wird das Foto in Büchern genutzt, braucht es `confirm`; die Plätze werden
  dann leer (`mediaId: null`), Ausschnitt und Seite bleiben. Die Datei löscht die App getrennt. `mediaUses` zeigt vorher, wo es steckt.

## 3 · Reisebücher (`t.books`)

```text
t.books = [{ id, title, subtitle, theme, format:'a5-quer'|'a4-hoch'|'quadrat-21',
             cover:{ mediaId|null }, pages:[{ id, kind?, layout, slots:[{ mediaId|null, crop:{x,y,w,h}|null, fit, caption? }],
             heading?, sub?, text, items?:[item], map?:[{label, lat, lon}], day? }], draft:{ rule, at|null }|null, updatedAt }]
item = { kind:'fakt'|'stimmung'|'eintrag'|'bewertung'|'plan', label?, value?, title?, text?, actId?, stars?, glyphs? }
```

### 3.1 Felder

| Feld | Regel |
| --- | --- |
| `title` | Pflicht, ≤ 120, nicht nur Leerzeichen |
| `subtitle` | Text ≤ 200, leer erlaubt |
| `theme` | Kennung `/^[a-z][a-z0-9-]{1,39}$/` (bookgen: klassisch, polaroid, magazin, minimal, kinder). Die Liste gehört zur Oberfläche; unbekannte Werte zeigt die App mit dem Standard an, ohne sie zu überschreiben |
| `layout` | Aufzählung: `nur-text`, `text-foto`, `1-gross`, `2-nebeneinander`, `2-gestapelt`, `3-mosaik`, `4-raster`, `karte`. Ein neues Layout ist eine Vertragsänderung |
| `kind` | optional, Seitenart: `titel`, `uebersicht`, `tag`, `weitere` (Tagebucheintrag ohne zugehörigen Reisetag), `highlights`, `zahlen`, `schluss`, `frei` (selbst angelegt) |
| `heading` / `sub` | optional, Überschrift ≤ 120, Unterzeile ≤ 200 |
| `items` | optional, höchstens 100 Angaben je Seite. `kind` Pflicht (`fakt`, `stimmung`, `eintrag`, `bewertung`, `plan`); `label` ≤ 200, `value` ≤ 80, `title` ≤ 120, `text` ≤ 2000, `glyphs` ≤ 10 (Sternzeichen, nur Anzeige), `actId` wie bei Fotos, `stars` ganze Zahl 1–5. Keine weiteren Felder (keine Beträge, Buchungsnummern, Zahler) |
| `map` | optional, höchstens 50 Orte `{label ≤ 80, lat, lon}` für die schematische Karte. **Das sind geplante Orte aus Plan und Katalog, keine Fotostandorte**; `stripLocation` und der Export mit `stripLocation` lassen sie deshalb stehen |
| `slots[].caption` | optional, Bildunterschrift im Buch ≤ 500 (bookgen übernimmt sie aus dem Foto; danach unabhängig vom Foto änderbar) |
| `format` | `a5-quer`, `a4-hoch` oder `quadrat-21` |
| `cover.mediaId` | Foto-ID der Reise oder `null` (Pflichtfeld) |
| `pages` | höchstens 200; Seiten-IDs eindeutig im Buch |
| `slots` | höchstens 12 je Seite. `mediaId` Foto der Reise oder `null` (leerer Platz). `crop` Anteile 0…1 mit `w,h > 0`, `x+w ≤ 1`, `y+h ≤ 1`, oder `null` = ganzes Bild. `fit`: `cover` oder `contain` |
| `text` | Seitentext ≤ 2000, leer erlaubt |
| `day` | optional, Reisetag wie bei Fotos oder `null` |
| `draft` | `null` oder `{rule, at}`: welche Regelversion von `bookgen.js` den Erstentwurf erzeugt hat (z. B. `bookgen-1`) und wann (UTC, oder `null`, wenn kein Zeitpunkt übergeben wurde) |
| `updatedAt` | UTC-Zeitstempel `JJJJ-MM-TTThh:mm:ss[.mmm]Z`. `normalizeBook` setzt ihn nur aus einem übergebenen `now`, nie aus einer erfundenen Zeit |

- **Grenzen:** höchstens 20 Bücher je Reise.
- **Verweise:** Alle `mediaId` müssen in `t.media` derselben Reise existieren (`validateReferences4`). Ein Jahresbuch über
  mehrere Reisen ist in v4 **nicht** abgebildet; es wäre ein eigenes, reiseübergreifendes Objekt (offene Frage 3).
- **Hinweise ohne Ablehnung** (`bookWarnings`): ausgeblendetes Foto im Buch, leerer Platz, kein Titelbild, weiche Datenschutztreffer.

### 3.2 Abhängigkeit `bookgen.js` (Paket 3)

`bookgen.js` erzeugt ein Buch in genau dieser Form, ruft `normalizeBook` aber selbst nicht auf. Das übernimmt der Aufrufer in der App: Er gibt das Ergebnis von `draft()` vor dem Speichern durch `normalizeBook(book, {now, media})`. Der Test
`tests/v4logic.cjs` §11 erzeugt echte Entwürfe mit `bookgen.js` (mit und ohne Fotos, Zahlenseite, Mitreisende) und prüft sie
gegen diesen Vertrag, sobald `bookgen.js` und `v3journal.js` neben `v4logic.js` liegen. Es liest Fotos,
Tagebuch, Bewertungen, Plan und Katalog, aber **nie** `ledger`, `offers`, Notizen oder Zahlungsfelder (§3.3).

### 3.3 Keine Buchungsnummern, keine Zahlungsdetails

1. **Keine Felder dafür.** Buch, Seite und Platz haben feste Feldlisten; `bookingRef`, `paid`, `amount`, `iban`, `notes` usw. werden abgelehnt.
2. **Harte Ablehnung im Text** (Titel, Untertitel und je Seite `heading`, `sub`, `text`, `slots[].caption`, `items[].label/value/title/text`, `map[].label`): eine IBAN mit gültiger Prüfziffer oder eine Kartennummer
   (Vierergruppen, Gruppen 4-6-5/4-6-4 wie bei Amex und Diners oder 13–19 Ziffern am Stück ab 2–6, mit Luhn-Prüfung; IBAN auch mit Leerzeichen oder Bindestrichen). Telefonnummern, Daten und Preise lösen das nicht aus (Tests).
3. **Hinweis vor Teilen und Export:** Wörter wie „Buchungsnummer“, „Reservierungs-Nr.“, „Bestätigungscode“, „PNR“,
   „Booking reference“, „IBAN“, „Kartennummer“. Die Nummer selbst ist nicht erkennbar; der Text gehört den Nutzern, deshalb
   nur ein Hinweis (`privacyFindings`, `hard: false`).

## 4 · Grenzen auf einen Blick

| Größe | Grenze |
| --- | --- |
| Fotos je Reise | 2000 |
| Bildunterschrift | 500 Zeichen |
| Bildseite / Datei | 20000 px / 25 MB |
| Bücher je Reise | 20 |
| Titel / Untertitel | 120 / 200 Zeichen |
| Seiten je Buch / Plätze je Seite | 200 / 12 |
| Seitentext | 2000 Zeichen |
| Überschrift / Unterzeile | 120 / 200 Zeichen |
| Angaben je Seite | 100 (Bezeichnung 200, Wert 80, Titel 120, Text 2000, Sternzeichen 10) |
| Kartenorte je Seite | 50 (Bezeichnung 80) |
| Bildunterschrift im Buch | 500 Zeichen |
| Dateien im Archiv | 2 je Foto über alle Reisen + 2 |

## 5 · Export `.reiseplaner` (ZIP)

```text
manifest.json     { format:'reiseplaner-archiv', archiveVersion:1, createdAt, trips, schemaMax, locationStripped, files:[…] }
trips.json        Reiseliste wie der bisherige JSON-Export
media/<id>.jpg    Arbeitskopie
thumbs/<id>.jpg   Vorschaubild 400 px
```

- `archivePlan(trips, {now, stripLocation})` plant den Inhalt; das Packen (ZIP-Bibliothek oder native Funktion) und das Lesen der
  Dateien macht die App. Jede Reise wird vorher mit `validateV4` geprüft.
- **Gleiche Foto-ID in zwei Reisen** (Konfliktkopie) ergibt eine Datei, wenn die Prüfsumme gleich ist; andere Prüfsumme bricht ab.
- **Standort:** Die vollständige Sicherung behält `lat/lon` der Fotos (sie ist eine Sicherung eigener Daten). Mit `stripLocation` werden sie
  in den exportierten Kopien entfernt, das Manifest vermerkt es. Für geteilte Reisebücher ist das Entfernen Pflicht (§2).
- **Import** (`checkArchive(names, manifest, trips)`), **bevor** etwas entpackt wird: nur `manifest.json`, `trips.json`,
  `media/<id>.jpg`, `thumbs/<id>.jpg` (keine Ordnerwechsel, keine absoluten Pfade, keine Rückstriche, keine Doppelungen),
  höchstens die Archivgrenze. Neuere `archiveVersion` wird abgelehnt. **Fehlende Bilddateien brechen nicht ab, sondern werden
  gemeldet** (Foto „Datei fehlt“); Dateien ohne Eintrag werden nicht übernommen. Die Prüfsumme jeder Datei vergleicht die App mit `sha256`.
  Danach gilt der bestehende Importweg: Version je Reise, kein stilles Überschreiben, Komplettablehnung bei zu neuem Format.
- **JSON-Export** bleibt für reine Daten. Bei v4-Reisen erscheint der Hinweis „Fotos sind nicht enthalten“; die Einträge
  bleiben erhalten und zeigen nach einem Import „Datei fehlt“.

## 6 · Einführung in Schritten

1. **Vorbedingung:** v3 ist zur Bearbeitung freigegeben (`V3_EDIT`), `journal`/`ratings`/`party`/`expenses` bearbeitbar (PLAN_IOS_APP §5.2).
2. **Speicheradapter** für Medien (PLAN_IOS_APP §5.1) mit Migrationstest.
3. **Datenbank-Migration** (eigener Auftrag, Freigabe Philipp): CHECK `schema_version in (2,3,4)`, Rückstufungs-Trigger für 4→3/2.
   Bestehende Migrationen bleiben unverändert.
4. **Lese-Release:** Clients mit `SCHEMA_MAX = 4` lesen und prüfen v4 vollständig und schreiben `media`/`books` unverändert zurück;
   die Erfassung bleibt gesperrt. Eine Weile live, damit gecachte Stände aktualisiert werden.
5. **Freischalten:** Fotos (lokal), dann Reisebuch-Entwurf (`bookgen.js`), dann Export `.reiseplaner`, zuletzt optional Cloud.

## 7 · Testplan

- **Node, umgesetzt (`tests/v4logic.cjs`):** gültige und ungültige Foto- und Bucheinträge, alle Grenzen aus §4 an der Kante,
  Doppelimport über Prüfsumme, Normalisierung ohne erfundene Felder, Standortentfernung nur in Kopien, Verweise auf Fotos und
  Personen, Entfernen mit Bestätigung, `needsV4`, Zielversion, keine Rückstufung, `serializeTrip4`, `readable`,
  Archivplan inklusive Konfliktkopie, Import-Pfadprüfung, fehlende Dateien, keine Buchungsnummern oder Zahlungsdetails in Büchern (auch in `items`, Überschriften, Bildunterschriften und Kartenorten), Seitenarten, Layouts, `items`- und `map`-Grenzen, Kartenorte bleiben bei `stripLocation`, Abgleich mit echten `bookgen.js`-Entwürfen (§11).
- **Bei Anbindung nötig:** Feldtreue durch jede v2/v3-Bearbeitung, Export/Import, Konfliktkopie, Wiederherstellung und `toServer`
  (wie v3 §7); `sync-unreadable` mit v4-Zeile in einem v3-Client; DB-Tests (CHECK 4 erlaubt, 5 abgelehnt, 4→3 abgelehnt auch für
  Eigentümer); Browser-Klickweg und echter iPhone-Test für Kamera, Import und Export.

## 8 · Offene Fragen an Philipp

1. **Cloud-Zustand über Geräte:** `queued`/`error` beschreiben eigentlich das hochladende Gerät. Vorschlag: Andere Geräte behandeln alles außer `done` als „nicht in der Cloud“, das Feld wird trotzdem unverändert zurückgeschrieben.
2. **Standort in der vollständigen Sicherung:** behalten (Vorschlag, Sicherung eigener Daten) oder standardmäßig entfernen?
3. **Jahresbuch über mehrere Reisen:** eigenes Objekt außerhalb der Reisen (späterer Vertrag) oder vorerst nicht?
4. **Kontingent** der Fotos je Reise in der Cloud (PLAN_IOS_APP §6.4: z. B. 300) festlegen.
