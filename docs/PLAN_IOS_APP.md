# Plan: iOS-App, Fotos und Reisebücher

Stand 15.10.2026, Ausgangs-Commit 9657d9b. Entwurf von Claude zur Abstimmung mit ChatGPT (Issue #8) und zur Entscheidung durch Philipp. **Alles hier ist geplant, nichts davon implementiert.** Preise und Grenzen fremder Dienste sind als „prüfen“ markiert und vor jeder Entscheidung aktuell nachzulesen.

## 1 · Kurzfassung

- **Weg:** Die bestehende Web-App wird mit **Capacitor** zu einer echten iOS-App verpackt. Es gibt keinen Neubau in Swift. Rechenlogik, Katalog, Sync und Tests bleiben eine gemeinsame Codebasis für iPhone, Desktop-Browser und PWA. Wo eine native Fähigkeit echten Mehrwert bringt (Kamera, Fotos, Mitteilungen, Teilen, später Widgets), kommt ein natives Plugin dazu.
- **Drei Säulen:**
  1. **App:** schnell unterwegs, gründlich am Schreibtisch.
  2. **Erinnerungen:** Fotos, Tagebuch und Bewertungen hängen an Tagen und Unternehmungen.
  3. **Reisebuch:** ein automatischer Erstentwurf aus Plan, Fotos und Tagebuch, danach frei gestaltbar, als PDF oder Teilen-Link.
- **Reihenfolge:**
  - Zuerst das Fundament im Web. Davon profitieren alle Nutzer sofort, und es sind ohnehin App-Store-Pflichten.
  - Danach die App-Hülle.
  - Dann Fotos lokal, Fotos in der Cloud und das Reisebuch.
  - Zuletzt native Extras und die Veröffentlichung.
- **Blocker, die nur Philipp lösen kann:**
  - Apple-Entwicklerkonto (kostenpflichtig).
  - Ein Mac oder das Signieren über CI.
  - Entscheidungen zu Foto-Cloud und Speicherkosten (§11).

## 2 · Ausgangslage (geprüft am Code, 15.10.)

| Bereich | Stand | Bedeutung für die App |
| --- | --- | --- |
| App | eine Datei `index.html` (≈ 480 KB, 3.800 Zeilen), ohne Build-Werkzeug, plus `catalog.js`, `v3logic.js`, `v3forms.js`, `v3editor.js`, `cloud.js` | kann unverändert in Capacitor laufen; langfristig in Module aufteilen (§10, P0.6) |
| Speicher | `localStorage['rp-trips']`, Format 2, Format 3 nur lesbar (`V3_EDIT=false`) | in iOS-WebViews nicht dauerhaft garantiert, für Fotos ungeeignet → Speicherschicht (§5) |
| Format-3-Felder | `party`, `expenses`, `journal`, `ratings` vertraglich beschrieben (SCHEMA_V3 §3/§4), aber noch als „nicht lesbar“ eingestuft | Tagebuch und Bewertungen sind Grundstoff für Reisebücher → zuerst fertigstellen |
| Cloud | Supabase (Auth, `trips` mit RLS, Rollen Eigentümer/Bearbeiter/Leser, Katalog-RPCs); **Storage ungenutzt** | Fotos brauchen Bucket, RLS und Kontingent (§6.4) |
| Konto | Registrierung, Reset, Einladungen; **keine Kontolöschung** (OPEN_POINTS P1) | App-Store-Pflicht für Apps mit Konto → P0 |
| Hosting | GitHub Pages unter `freadeax.github.io/Reiseplaner/`, Service Worker „Netz zuerst“ | Universal Links bräuchten Dateien an der Domain-Wurzel → nicht möglich ohne eigene Domain (§4.4) |
| Tests | Node, Chromium (Playwright), lokaler Supabase; Philipp hat iPhone-Safari selbst getestet | Safari-Engine (WebKit) fehlt in der automatischen Prüfung → ergänzen (§9) |
| Produkt | öffentlich für beliebige Nutzer (PUBLIC_PRODUCT.md) | Foto-Speicher skaliert mit Nutzern; Datenschutz und App-Review sind ernst zu nehmen |

## 3 · Architekturentscheidung

| Option | Vorteile | Nachteile | Urteil |
| --- | --- | --- | --- |
| A · Nur PWA weiter ausbauen | kein Apple-Konto, kein Review | kein App Store, Speicher kann geräumt werden, eingeschränkter Fotozugriff, Mitteilungen nur begrenzt | bleibt als Web-Variante bestehen, reicht aber nicht für „richtige App“ |
| **B · Capacitor-Hülle + native Plugins** | eine Codebasis, alle Tests bleiben gültig, App Store, native Kamera/Fotos/Dateien/Mitteilungen, schrittweise | WebView-Gefühl muss durch gute UI ausgeglichen werden; Review-Regel „nur Website verpackt“ beachten | **Empfehlung** |
| C · Neubau in SwiftUI | bestes natives Gefühl, Widgets/Live Activities direkt | komplette Logik doppelt (Kosten, Rabatte, Storno, Sync), zweite Testwelt, Web und App laufen auseinander | nur für einzelne Erweiterungen (Widget, Teilen-Erweiterung) |

**Warum B:** Die Projektpriorität „falsche Kosten, Termine und Buchungszustände vor allem anderen“ spricht gegen eine zweite Implementierung der Rechenlogik. Mit B bleibt `v3logic.js` die einzige Wahrheit.

**Abgrenzung zur Review-Regel:** Der App Store lehnt reine Webseiten-Verpackungen ab (Guideline 4.2, Minimalfunktionalität). Die App liefert deshalb von Anfang an echten Mehrwert:
- Offline-Start aus dem App-Paket.
- Kamera- und Fotomediathek.
- Lokale Mitteilungen für Stornofristen und Abfahrt.
- Teilen-Menü und PDF-Reisebuch.

## 4 · Zielbild der App

### 4.1 Leitidee „balanciert“

- **Gerät:**
  - Am iPhone wird schnell erfasst: Foto, Notiz, Ausgabe, abhaken, „was steht heute an“.
  - Am Desktop wird gründlich gearbeitet: Planung, Vergleich, Reisebuch-Layout.
  - Beides arbeitet auf denselben Daten.
  - Jede Funktion ist auf beiden bedienbar; die Gewichtung der Oberfläche unterscheidet sich.
- **Menschen:**
  - Mehrere Mitreisende bearbeiten gemeinsam (bestehende Rollen).
  - Ausgaben werden fair aufgeteilt (`party`/`expenses`, SCHEMA_V3 §3, Restcent-Verfahren schon vertraglich festgelegt).
  - Jede Person kann eigene Fotos und Tagebuchzeilen beitragen.
- **Bedienung:** nie nur Farbe, Hover oder Ziehen (AGENTS.md). Jede Wisch- oder Ziehgeste hat einen sichtbaren Knopf als Alternative.

### 4.2 Navigation (iPhone: Tab-Leiste unten, Desktop: Seitenleiste)

1. **Reisen:** Regal mit Zeitgruppen, wie heute.
2. **Entdecken:** Katalog, Wunschkarten.
3. **Heute:** erscheint nur während einer laufenden Reise. Nächster Termin, Abfahrt, Check-in, Wetterplan B, schnelle Erfassung (Foto, Notiz, Ausgabe).
4. **Erinnerungen:** Fotos, Tagebuch, Bewertungen, Reisebücher, alle Reisen übergreifend.
5. **Konto:** Anmeldung, Sicherung, Datenschutz, Kontolöschung.

Innerhalb einer Reise bleiben die vorhandenen vier Gruppen und zehn Bereiche. Auf dem iPhone kommen sie als Unterseiten mit Zurück-Geste, nicht als gequetschte Tab-Reihe. Das löst auch den gemeldeten Punkt „zusammengequetscht / dahinter scheint etwas vor“ grundsätzlich.

### 4.3 iOS-Gestaltungsregeln (Abnahmekriterien)

- Sichere Bereiche: Notch, Dynamic Island, Home-Indikator (`env(safe-area-inset-*)`).
- Tippflächen ≥ 44 × 44 pt.
- Bei geöffneter Tastatur bleibt das aktive Feld sichtbar.
- Dynamische Schriftgröße bis mindestens 200 % ohne abgeschnittene Inhalte.
- Hell und Dunkel, reduzierte Bewegung, VoiceOver-Namen für alle Knöpfe.
- Blätter (Sheets) mit Zieh-Griff **und** Schließen-Knopf.
- Kein horizontales Scrollen der Seite.
- Haptisches Feedback nur ergänzend.

### 4.4 Anmeldung in der App

Bestätigungs- und Reset-Links per E-Mail öffnen auf dem iPhone Safari, nicht die App. Universal Links bräuchten eine eigene Domain, und ein Domainkauf ist ohne Auftrag ausgeschlossen. Daher:
- **Primär: 6-stelliger E-Mail-Code** (Supabase-OTP) direkt in der App eingeben. Kein Link-Sprung nötig, funktioniert auch im Web.
- Fallback: ein eigenes URL-Schema `reiseplaner://auth` als erlaubte Weiterleitung in Supabase.
- Später optional „Mit Apple anmelden“. Das ist Pflicht, sobald andere soziale Anmeldungen angeboten werden; aktuell gibt es keine.

## 5 · Datenschicht

### 5.1 Speicheradapter (Voraussetzung für App und Fotos)

Statt direkt `localStorage` nutzt die App eine Schnittstelle `RPStore`: `get/put/list/remove`, atomar, mit Versionsnummer. Dahinter liegen:

| Umgebung | Reisen (JSON) | Medien (Dateien) |
| --- | --- | --- |
| Web/PWA | IndexedDB (`rp-db`), dazu `navigator.storage.persist()` anfragen | IndexedDB-Blobs (`rp-media`) |
| iOS-App | Datei im App-Container (Capacitor Filesystem, atomar über Temp-Datei und Umbenennen) oder SQLite-Plugin | Dateien im App-Container, vom iOS-Backup erfasst |

**Migration ohne Datenverlust (AGENTS.md):**
1. Beim ersten Start mit Adapter wird `rp-trips` gelesen, vollständig in den neuen Speicher geschrieben, zurückgelesen und verglichen.
2. Erst danach gilt der neue Speicher.
3. `rp-trips` bleibt als Nur-lesen-Kopie für mindestens zwei Versionen stehen.
4. Vor der Migration wird automatisch ein Export angeboten.

Die vorhandenen Sicherungspunkte (`historyKey`) ziehen mit um.

**Wichtig:** PWA und native App haben **getrennte Speicherorte**. Die App kann die Safari-Daten nicht lesen. Der Umzug läuft deshalb über die Kontosynchronisation oder über den bestehenden Export und Import. In der App gibt es dafür einen geführten Dialog „Reisen aus dem Browser übernehmen“.

### 5.2 Format 4 (neu, nach dem Vertragsverfahren wie bei v3)

Reiseobjekte bleiben klein. Fotos stehen **nie** in der Reise-JSON, nur Verweise. Entwurf:

```text
t.media = [{ id, kind:'photo', takenAt:ISO|null, lat?, lon?, w, h, bytes, sha256,
             caption≤500, day:'YYYY-MM-DD'|'d<i>'|null, actId?, spotId?, by?:partyId,
             fav:bool, hidden:bool, cloud:{ state:'none'|'queued'|'done'|'error', path? } }]
t.books = [{ id, title≤120, subtitle≤200, theme, format:'a5-quer'|'a4-hoch'|'quadrat-21',
             cover:{ mediaId|null }, pages:[{ id, layout, slots:[{ mediaId, crop:{x,y,w,h}, fit }],
             text≤2000, day? }], draft:{ rule, at }, updatedAt }]
```

- `needsV4(t)` ist wahr, sobald `media` oder `books` nicht leer sind. Ab dann gilt `schemaVersion = 4`, nie wieder zurück. Das funktioniert wie der bestehende Schutz von v3: neue Migration für die DB-Prüfbedingung `schema_version in (2,3,4)`, und der Rückstufungs-Trigger bleibt.
- Ältere App-Stände sehen v4-Reisen als „neueres Format, nur lesen“. Der Mechanismus existiert schon (`sync-unreadable`).
- Exportformat `.reiseplaner` ist eine ZIP-Datei mit `trips.json`, `media/<id>.jpg` und `thumbs/<id>.jpg`. Der bisherige JSON-Export bleibt für reine Daten.
- Vorbedingung: v3 ist zur Bearbeitung freigegeben (`V3_EDIT`), und `journal`/`ratings`/`party`/`expenses` sind bearbeitbar.

## 6 · Fotos

### 6.1 Erfassen

- **In der App:** Kamera oder Auswahl aus der Mediathek (Mehrfachauswahl). Gelesen werden nur die gewählten Bilder, kein Vollzugriff auf die Mediathek nötig.
- **Im Web:** `<input type=file accept=image/* multiple>`.
- **Schnell-Knopf unter „Heute“:** „Foto zu jetzt“ ordnet das Bild dem aktuellen Tag und, wenn eindeutig, der laufenden Unternehmung zu.

### 6.2 Automatische Zuordnung (Vorschlag, nie stillschweigend)

- **Datum:** Aufnahmedatum (EXIF) → Reisetag.
- **Ort:** EXIF-Koordinaten → nächste Unternehmung oder Katalog-Attraktion im Umkreis ≤ 1 km. Die Abstandsregel aus `catalog.js` wird wiederverwendet.
- **Prüfschritt:** Die Zuordnung wird als Liste mit „passt“ oder „ändern“ angezeigt. Fotos außerhalb des Reisezeitraums fallen in einen Korb „ohne Tag“.

### 6.3 Verarbeitung und Größen (Schätzwerte, an echten Bildern zu messen)

- **Original:** bleibt im iPhone-Foto-Archiv. Die App speichert eine **Arbeitskopie**: lange Kante 2048 px, JPEG ≈ 0,3–0,6 MB.
- **Vorschaubild:** 400 px (≈ 30 KB).
- **HEIC:** wird beim Import in JPEG umgewandelt (in der App nativ, im Web über Canvas).
- **Prüfsumme (`sha256`):** verhindert doppelte Importe.
- **Datenschutz:**
  - Standort-Metadaten werden in **geteilten und exportierten Reisebüchern entfernt**, intern optional behalten.
  - Gesichter werden nicht erkannt; keine Analyse durch Dritte.

### 6.4 Cloud (optional, Entscheidung Philipp)

- **Bucket:** privater Supabase-Storage-Bucket `trip-media`, Pfad `<trip_id>/<media_id>.jpg` plus `thumbs/`.
- **Zugriff:** RLS über die bestehende Mitgliedschaftsfunktion. Lesen dürfen alle Mitglieder; hochladen und löschen dürfen Bearbeiter und Eigentümer. Leser dürfen nur eigene Fotos löschen; dafür wird der Hochlader gespeichert.
- **Upload-Warteschlange:** funktioniert offline, setzt fort und zeigt einen Fortschritt.
- **Löschen:** Löscht ein Eigentümer die Reise, werden die Dateien mit entfernt (Datenbankfunktion und Test).
- **Kontingent je Konto** (z. B. 300 Arbeitskopien je Reise, Zahl festlegen) mit sichtbarer Anzeige.
- **Kosten:** Der kostenlose Supabase-Plan hat ein begrenztes Speicher- und Übertragungskontingent (laut Preisseite ca. 1 GB Speicher, **prüfen**). Das reicht für einige tausend Arbeitskopien, nicht für eine öffentliche App mit vielen Nutzern. Ein bezahlter Plan erfordert einen ausdrücklichen Auftrag. Bis dahin: **Fotos lokal und im Export, Cloud nur für Vorschaubilder oder gar nicht.**

## 7 · Reisebücher

### 7.1 Idee

Aus einer Reise (oder mehreren, als „Jahresbuch“) entsteht mit einem Knopf ein **Erstentwurf**. Den kann man danach Seite für Seite umbauen. Das Ergebnis ist ein PDF zum Behalten oder Drucken und optional ein privater Lese-Link.

### 7.2 Erstentwurf (Regelwerk `bookgen.js`, rein und mit Node testbar)

1. **Titelseite:** Lieblingsfoto (`fav`, sonst das Foto mit den meisten Bewertungssternen am selben Tag), Reisetitel, Zeitraum, Mitreisende (nur bei ausdrücklicher Wahl).
2. **Übersicht:** schematische Routenkarte aus `CATX.mapLayout`. Das ist eigenes SVG ohne Kartenkacheln, also auch offline und ohne Lizenzfragen. Dazu die Eckdaten: Tage, Kilometer laut Plan, Unternehmungen.
3. **Je Tag ein Kapitel:**
   - Überschrift mit Datum und Ort.
   - Tagebuchtext.
   - 1–4 Fotos, das Layout wird nach Anzahl und Hoch- oder Querformat gewählt.
   - Bewertete Höhepunkte als Sterne **mit Text** (nicht nur Symbole).
4. **Highlights:** die bestbewerteten Unternehmungen der Reise.
5. **Optional „Zahlen der Reise“:** Gesamtkosten und Aufteilung. **Standardmäßig aus**; Buchungsnummern und Zahlungsdetails erscheinen nie.
6. **Schlussseite:** freie Notiz und ein Foto.

### 7.3 Editor

- **Seitenleiste:** Miniaturen, Reihenfolge über Knöpfe „nach oben / unten“ und zusätzlich Ziehen.
- **Layouts:** 1 groß, 2 nebeneinander, 3 Mosaik, 4 Raster, Text plus Foto, nur Text, Doppelseite.
- **Fotos tauschen** aus der Tagesauswahl; Ausschnitt über einen Zoom-Regler (nicht nur Geste).
- **Themen:**
  - Klassisch: Serifen, weißer Rand.
  - Polaroid: Rahmen, handschriftlich wirkende Bildunterschrift.
  - Magazin: randlos, große Überschriften.
  - Minimal.
  - Kinder-Reisetagebuch: große Schrift, Platz zum Ausmalen beim Ausdruck.
- **Nicht-destruktiv:** Neu generieren fragt nach und erhält manuelle Änderungen, solange man sie nicht ausdrücklich verwirft.
- **Gemeinsames Bearbeiten:** Seiten sind einzeln versioniert; ein Konflikt wird je Seite angezeigt statt die ganze Reise zu sperren.

### 7.4 Ausgabe

- **PDF:**
  - In der App über die native PDF-Erzeugung der WebView (Plugin), danach Teilen-Menü oder „In Dateien sichern“.
  - Im Web über Druck-CSS und „Als PDF sichern“.
  - Feste Seitenformate, Bildauflösung für Druck ≥ 200 dpi bei der Zielgröße. Gibt die Arbeitskopie das nicht her, steht ein Hinweis auf der Seite.
- **Lese-Link (später, nur mit Cloud):** eine schreibgeschützte Freigabe nur des Buchs, widerrufbar, ohne Konto lesbar, ohne Standortdaten.
- **Druckdienst** (gebundenes Buch): ausdrücklich später und nur mit Auftrag, weil Kosten und Anbieterbindung entstehen. Bis dahin ist das PDF so gebaut, dass gängige Fotobuch-Dienste es annehmen können (Beschnittzugabe einstellbar).

### 7.5 Kreative Erweiterungen

- **„Heute vor einem Jahr“:** lokale Mitteilung mit Fotos und Tagebuchzeile.
- **Erinnerungsstücke:** Eintrittskarte oder Postkarte fotografieren. Ein Hinweis fordert auf, Buchungsnummern abzudecken; die App erkennt sie nicht automatisch.
- **Tagesfrage im Tagebuch** („Was war heute überraschend?“), damit es leichter fällt, etwas zu schreiben.
- **Reise-Steckbrief für Kinder:** Lieblingstier, bestes Essen, Wetter.
- **Wunschliste fürs nächste Mal:** Ideen aus dem Buch fließen als „gefiel euch“ in die Katalogbewertung (C5).

## 8 · Native Extras (nach Nutzen sortiert)

1. **Lokale Mitteilungen:**
   - Stornofrist läuft ab (aus `cancelMath`/Fristen v3).
   - Abfahrt laut `departurePlan`.
   - Check-in.
   - Jeweils abschaltbar; ohne Server, ohne Push-Dienst.
2. **Teilen-Menü:** PDF, Reiseplan-Text, Kalender (ICS gibt es schon).
3. **Teilen-Erweiterung** (Swift): Fotos oder Links aus anderen Apps „zur Reise hinzufügen“.
4. **Widget** (Swift): nächste Reise mit Countdown oder heutiger Tagesplan.
5. **Live-Aktivität** (Swift) am Reisetag: Abfahrt, nächster Termin.
6. **Karten-App öffnen:** Apple Karten oder Google Maps für Route und Ort (Links, keine eingebetteten Karten).

Die Punkte 3–5 brauchen Swift-Code und eine geteilte App-Gruppe. Sie folgen erst, wenn die Hülle stabil ist.

## 9 · Tests

- **Bestehende Tests bleiben Pflicht:** `npm test`, Chromium, Datenbank, e2e.
- **Neu: Playwright mit WebKit** (Safari-Engine) für die wichtigsten Wege. Das ersetzt keinen iPhone-Test, deckt aber Safari-Eigenheiten früher auf.
- **Neu: Speicheradapter-Tests:**
  - Migration `rp-trips` → IndexedDB mit Abbruch mitten drin, Kontingent voll, Rücklesevergleich.
  - Mitteilungsplanung: Zeitzonen, Sommerzeit, Jahreswechsel.
- **Neu: `bookgen` deterministisch:** gleiche Reise ergibt den gleichen Entwurf; keine privaten Felder im Ergebnis.
- **iOS-Build:** GitHub Actions mit macOS-Runner baut die App für den Simulator bei jedem Push.
  - Für öffentliche Repos ist das laut GitHub kostenlos (prüfen).
  - Signierte Builds für TestFlight nur mit Zertifikaten als GitHub-Secrets, die Philipp im Apple-Konto erstellt. Niemals im Repo.
- **Echte Geräteabnahme durch Philipp über TestFlight:** Checkliste je Meilenstein. Wird nur als bestanden gemeldet, wenn tatsächlich durchgeführt.

## 10 · Phasen und Aufteilung

Grundregel für die Aufteilung (wie bisher):
- **Claude:** Daten, Speicher, Sync, Migrationen, Rechen- und Generierungslogik, Build/CI, native Konfiguration.
- **ChatGPT:** Oberflächen, Formulare, Editoren, Gestaltung.
- **Gemeinsam:** Datenverträge und gegenseitiges Review.

### P0 · Fundament im Web (sofort nützlich, unabhängig vom Apple-Konto)

| # | Paket | Wer | Abnahme |
| --- | --- | --- | --- |
| P0.1 | `V3_EDIT` gemeinsam freigeben (Finanz-/Verpflichtungsreview abschließen) | beide | Review in #8, CI grün, Philipp-Sichtprüfung |
| P0.2 | `journal`, `ratings`, `party`, `expenses` lesbar und bearbeitbar (SCHEMA_V3 §3/§4) | Claude Logik/Validierung, ChatGPT Formulare | Restcent-Tests, Rundlauf Export/Import, Sync |
| P0.3 | Kontolöschung und Kontoexport (Datenbankfunktion, Eigentümerwechsel oder Löschung geteilter Reisen) | Claude | test:db und e2e, App-Store-Anforderung erfüllt |
| P0.4 | Speicheradapter `RPStore` mit IndexedDB und Migration von `rp-trips` | Claude | Migrationstests, Browser-Test, `rp-trips` bleibt erhalten |
| P0.5 | iOS-Gestaltungsregeln §4.3 und Navigation §4.2 im Web | ChatGPT | 320/390 px, Schrift 200 %, WebKit-Test |
| P0.6 | `index.html` schrittweise in Dateien teilen (ohne Bundler, gleiche `window.__app`-Schnittstelle) | beide, je eigener Bereich | alle Tests unverändert grün |
| P0.7 | E-Mail-Code-Anmeldung (OTP) zusätzlich zum Link | Claude | e2e mit lokalem Supabase |

### P1 · App-Hülle (braucht Apple-Konto erst für TestFlight)

| # | Paket | Wer | Abnahme |
| --- | --- | --- | --- |
| P1.1 | Capacitor-Projekt `ios/`, `webDir = public`, Bundle-ID festlegen, Symbol und Startbild | Claude | Simulator-Build in CI |
| P1.2 | Native Speicherung für `RPStore` (Datei atomar oder SQLite) | Claude | Gerätetest: Neustart, Speicher voll, Update |
| P1.3 | Dialog „Reisen aus dem Browser übernehmen“ (Konto oder Datei) | ChatGPT UI, Claude Logik | kein Datenverlust, Konfliktvorschau |
| P1.4 | Datenschutzerklärung als Seite, Datenschutzangaben für den App Store, Pflichttexte | Claude Entwurf, Philipp entscheidet | Text veröffentlicht |
| P1.5 | Interner TestFlight-Build | Philipp signiert/lädt hoch (oder CI mit Secrets) | Philipp-Gerätecheckliste |

### P2 · Fotos lokal und Erinnerungen

| # | Paket | Wer | Abnahme |
| --- | --- | --- | --- |
| P2.1 | Vertrag Format 4 (`media`, `books`), Review wie v3, DB-Migration `schema_version 4` | Claude Entwurf, ChatGPT Review | Vertrag in `docs/SCHEMA_V4.md`, Migration lokal getestet, Produktion nur mit Philipps Freigabe |
| P2.2 | Medienablage (IndexedDB/Dateien), Verkleinerung, HEIC→JPEG, Prüfsumme, Vorschaubild | Claude | Tests mit Beispielbildern ohne private Inhalte |
| P2.3 | Kamera/Auswahl, automatische Zuordnung mit Prüfschritt | Claude Logik, ChatGPT UI | Zuordnungstests mit Zeitzonen |
| P2.4 | Bereich „Erinnerungen“: Galerie je Tag, Tagebuch, Sterne, Favoriten | ChatGPT | Bedienung ohne Gesten möglich |
| P2.5 | Export/Import `.reiseplaner` (ZIP) mit Fotos | Claude | Rundlauf, große Dateien, Abbruch |

### P3 · Fotos in der Cloud (nur nach Entscheidung §11.3)

| # | Paket | Wer | Abnahme |
| --- | --- | --- | --- |
| P3.1 | Bucket, RLS über Mitgliedschaft, Löschkaskade, Kontingentfunktion | Claude | test:db mit Rollen Leser/Bearbeiter/Fremder |
| P3.2 | Upload-Warteschlange offline, Fortsetzen, Fortschritt | Claude | e2e mit Netzabbruch |
| P3.3 | Anzeige Kontingent und Sync-Status je Foto (Text, nicht nur Farbe) | ChatGPT | Browser- und Gerätetest |

### P4 · Reisebuch

| # | Paket | Wer | Abnahme |
| --- | --- | --- | --- |
| P4.1 | `bookgen.js`: Erstentwurf-Regeln, Layoutwahl, Datenschutzfilter | Claude | deterministische Node-Tests |
| P4.2 | Seitenrenderer mit Themen und festen Formaten (HTML/CSS, druckfähig) | ChatGPT | visuelle Prüfung, Druckvorschau |
| P4.3 | Editor: Layout, Foto tauschen, Ausschnitt, Text, Reihenfolge | ChatGPT | ohne Ziehen bedienbar |
| P4.4 | PDF in App und Web, Auflösungswarnung, Beschnittzugabe | Claude (nativ), ChatGPT (Druck-CSS) | PDF auf Gerät geöffnet und geteilt |
| P4.5 | Lese-Link für ein Buch (nur mit Cloud) | Claude | RLS-Test: nur das Buch, widerrufbar |

### P5 · Native Extras · P6 · Veröffentlichung

- **P5:** Mitteilungen (Claude), Teilen-Menü (Claude), danach Teilen-Erweiterung, Widget, Live-Aktivität (Swift, Claude). Jedes Paket einzeln mit Gerätetest.
- **P6:**
  - App-Store-Eintrag, Bildschirmfotos, Altersfreigabe, Prüfung durch Apple.
  - Zuerst TestFlight (extern bis zu den von Apple erlaubten Testerzahlen), dann öffentlich, je nach Entscheidung §11.2.

## 11 · Entscheidungen von Philipp

1. **Apple-Entwicklerkonto:** Das Apple Developer Program kostet laut Apple jährlich (zuletzt 99 USD, **vor Kauf prüfen**). Ohne Konto sind nur Simulator und eine Installation per Kabel mit 7 Tagen Laufzeit möglich. Kauf nur auf ausdrücklichen Auftrag.
2. **Zielgruppe der App:** erst nur ihr (TestFlight) oder gleich öffentlich im App Store? Öffentlich bedeutet: Datenschutzerklärung, Kontolöschung, Support-Kontakt und Apple-Prüfung.
3. **Fotos in der Cloud:** (a) nur lokal und im Export, (b) Vorschaubilder in der Cloud, (c) volle Arbeitskopien. (c) stößt im kostenlosen Plan schnell an Grenzen.
4. **Mac verfügbar?** Mit Mac und Xcode signiert und testet Philipp direkt. Ohne Mac: CI-Build mit Zertifikaten als GitHub-Secrets.
5. **Name und Bundle-ID:** z. B. „Reiseplaner“ / `io.github.freadeax.reiseplaner`. Der Name muss im App Store frei sein (prüfen).
6. **Gedruckte Bücher** über einen Dienst: jetzt nicht, später gesondert?

**P0 kann ohne eine dieser Entscheidungen sofort beginnen.**

## 12 · Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
| --- | --- |
| Apple lehnt als „verpackte Website“ ab | native Kamera, Mitteilungen, Offline-Paket, PDF vor der Einreichung fertig |
| Datenverlust beim Speicherumzug | Rücklesevergleich, `rp-trips` bleibt stehen, Export vorher, Tests mit Abbruch |
| Fotos sprengen Speicher oder Kosten | Arbeitskopien statt Originale, Kontingent, Cloud optional |
| Private Daten in geteilten Büchern | Datenschutzfilter in `bookgen` mit Tests: keine Buchungsnummern, Zahlungen, Standorte |
| Zwei KIs bearbeiten dieselbe Riesendatei | P0.6 Aufteilung, klare Paketgrenzen in #8 |
| Nur Node- und Chromium-Tests | WebKit-Test, Simulator-Build in CI, Gerätecheckliste für Philipp |
| Gemeinsames Bearbeiten erzeugt Konflikte | Seitenweise Versionen in Büchern, bestehende Konfliktvorschau für Reisen |

## 13 · Nächster Schritt

1. Abstimmung dieses Plans in #8 mit ChatGPT.
2. Danach beginnt Claude mit **P0.4 Speicheradapter** und **P0.3 Kontolöschung**.
3. ChatGPT beginnt nach eigener Wahl mit **P0.5 Navigation/iOS-Regeln**.
4. P0.1 (`V3_EDIT`) bleibt das gemeinsame Review.
