# Projektstand · 13.10.2026


## v2.2 · Saisonpreise aus Portalabfragen (Claude, 14.10.2026, Issue #3)

Auf `7a7c45b` (ChatGPT, passwortgeschützte Sicherungen) aufgebaut. Keine Änderung an Reise-Speicherformat, Finder, Angebotsmodell oder Sicherung; Katalogdaten liegen im Code.

- **Recherche am 14.10.2026:** Live-Preisabfragen der Buchungsportale für 2 Erwachsene, 4 Nächte Mo–Fr, 7–15 Zeiträume von Nov. 2026 bis Okt. 2027. Belegt für 5 von 13 Katalog-Unterkünften (`PRICE_SAMPLES` mit Quelle, Zeitraum, Inklusivleistungen, Abfragedatum):
  - Fügenschuh's FeWo 2: 680 € ganzjährig, auch zum Jahreswechsel, inkl. Endreinigung.
  - „Schön Hier“: 460–500 €, inkl. 60 € Endreinigung vor Ort.
  - Rosemarie: 467,23 € (Nov.).
  - Braito: 496–543 €.
  - Bilgeri: 491–514 €.
- **Nicht belegbar:** Holidu liefert nur geschätzte Preise (`isExact:false`). Die Allgäuer Feratel-Inserate buchen über `deskline.net`, das aus der Recherche-Umgebung gesperrt ist.
- **Haus Haug:** Auf allen hinterlegten Portalen HTTP 404 (`STAY_GONE`).
- **Fehlerbehebung Kosten:** Die Silvester-Beispielreise rechnete die Unterkunft mit 4 × 110 € = 440 €; der Portalpreis für exakt diesen Zeitraum ist 680 €. „Schön Hier“ war ebenfalls zu niedrig (380 € statt 460–500 €).
- **Logik:**
  - `tripSeason`: Jahreswechsel 24.12.–06.01., Winter, Frühling, Sommer bis 15.09., Herbst; zählt die Mehrheit der Nächte, bei „nur Monat“ die Monatsmitte, bei offenem Datum unbekannt.
  - `stayNight` nimmt den höchsten Nachtwert der Saison, um nicht zu unterschätzen.
  - Bei exakt gleichen Daten und gleicher Personenzahl heißt der Wert „Portalpreis“ (Quelle „Angabe“), sonst „Vergleichswert … für eure Daten nicht abgefragt“ (Richtwert). Ohne Abfrage gilt der bisherige gekennzeichnete Schätzwert.
  - Eigenes Angebot bzw. `stayQuote` haben Vorrang.
  - Bei abweichender Personenzahl erscheint ein offener Punkt. Verschwundene Inserate erzeugen eine Warnung, verlieren den Inserat-Link und werden nicht mehr als Spartipp empfohlen. Der Spartipp vergleicht jetzt `stayNight` statt `plan`.
- **Tests:** Neu ist `tests/saisonpreise.cjs`. `npm test` und `npm run test:browser` sind grün. Kein iPhone-/Safari-Test.
- **Grenzen:** Preise sind Momentaufnahmen vom 14.10.2026 ohne Verfügbarkeitszusage. Für 8 Unterkünfte gibt es weiterhin nur Schätzwerte. Kinder, Haustiere und andere Belegungen wurden nicht abgefragt.

## Passwortgeschützte Sicherung und Importprüfung (ChatGPT, 14.10.2026)

Arbeitspaket #4, auf `81e7a02` aufgebaut. Claudes Saisonpreis-Arbeit #3 an STAYS/planBasis/cost() bleibt unberührt.

- Optionaler Passwortschutz für alle Reisen oder eine einzelne Reise: AES-256-GCM, PBKDF2-SHA-256 mit 600.000 Durchläufen, zufälliges Salz und IV. Verarbeitung im Browser, keine Passwortspeicherung. Nur die Exportdatei ist verschlüsselt; Browser-Reisen und lokale Sicherungspunkte bleiben Klartext. Kein unabhängiges Sicherheitsaudit.
- Verschlüsselte Hülle v1, unverändertes Reiseformat v1/v2. Fehlende Web-Crypto-Unterstützung, unzulässige Parameter, falsches Passwort und beschädigte Dateien werden abgelehnt. Keine Passwort-Wiederherstellung. Grenzen: 5 MiB Inhalt, 8 MiB verschlüsselte Datei.
- Importvorschau unterscheidet neue, identische und abweichende Reise-IDs, zeigt Änderungsbereiche und Angebot-/Profilzahlen. Kein stilles Überschreiben.
- Fehlerbehebung: Import bereitete bisher einzelne Reisen vor und meldete Erfolg trotz fehlgeschlagener Speicherung. Jetzt ein vorbereiteter Gesamtschreibvorgang und Rücknahme bei Fehler; bisheriger Reisestamm bleibt erhalten. Alter Logiktest nutzt nun einen realistischen Speicher-Mock statt getItem stets null.

Ausgeführt: `npm test` einschließlich `tests/secure-backup.cjs` erfolgreich. Echte Node-WebCrypto-Prüfungen für Rundlauf, Zufallssalz/IV, Manipulation, falsches Passwort, Limits, fehlende Kryptounterstützung und v1-Daten; Importvorschau/-Rollback ebenfalls geprüft. `node --check tests/browser.cjs` erfolgreich. Neue Browser-Klickwege ergänzt; Ausführung in GitHub-CI nach Push noch zu prüfen. Kein echter iPhone-/Safari-Test. Details in BACKUP_SECURITY.md.

## v2.1 · Allgemeiner statt Silvester-zentriert (Claude, 13.10.2026)

Auf ChatGPTs v2.0 `3e2e9f3` aufgebaut; Finder, Angebotsmodell und Sicherung v2 unverändert. Kein Speicherformat-Eingriff.

- Startseite und „Neue Reise“: „Mit einer Vorlage starten“ mit Wochenende, Städtereise, Tagesausflug, Sommerurlaub, Winterurlaub (Ideen-Katalog) und dem Silvester-Beispiel als eine Option unter mehreren. Vorlagen füllen nur Reiseart, Dauer, Anreiseart bzw. Katalog. Kein Budget, keine Unterkunft, kein Programm, keine Preise.
- Fehlerbehebung Kostenkennzeichnung: Katalog-Unterkünfte trugen bei jeder Reise „(Silvester +15 %, geschätzt)“, auch im Februar oder Mai. Die Planwerte sind tatsächlich Jahreswechsel-Schätzungen. Jetzt steht „Jahreswechsel: Inserat +15 %, geschätzt“ nur, wenn die Reise 24.12.–06.01. berührt. Sonst steht „Schätzwert für den Jahreswechsel, für eure Daten nicht geprüft“ bzw. „Reisedaten noch offen“. Beträge unverändert, keine neuen Preise.
- Texte allgemeiner: „Genuss & Feiern“ statt „Genuss & Silvester“, Plan-Check „gilt nur am 31.12.“ statt „für Silvester gedacht“, Angebotshinweis zu datumsgebundenen Punkten allgemein.
- Tests: neu `tests/vorlagen.cjs` (Zeitraumerkennung inkl. Grenzen 23.12./06.01., Kennzeichnung, Vorlagen ohne erfundene Werte und gültig exportierbar, Datumsmeldung). `tests/browser.cjs` klickt Städtereise- und Winter-Vorlage.

Ausgeführt: `npm test` und `npm run test:browser` (Chromium, 1280/390/320 px dunkel, Offline-Neustart) grün, zuvor auch auf unverändertem v2.0 grün. Kein iPhone-/Safari-Test.

## v2.0 · Reisefinder (ChatGPT, 13.10.2026)

Auf Claudes v1.9 / `0a75f9a1aded40f05b25cb564b584055deadd4da` aufgebaut. Seine Änderungen 1.7–1.9 sind erhalten. Zusätzlicher Browser-Teststand `a730c53224a5f24598c77175b7b45666a9d67ada` (neutrale Formularreisen, simuliertes Datum 02.05.2027) wurde ebenfalls integriert. Abstimmung: Issues #1 und #2; Claude pausiert `index.html` bis zum Push dieses Arbeitspakets.

Implementiert:
- Neuer regionsunabhängiger Reiter `suche`, kombinierbare Muss-/Wunschfilter, persönliche Sortierung, Anbieterwahl, Merkliste und bis zu vier Vergleichsspalten.
- Vorbereitete Anbieter-Suchlinks für Booking/Airbnb/FeWo-direkt; Startseiten für CHECK24/Holidu. Keine Live-Abfrage. Externe URL-Parameter sind nicht auf den Zielseiten klickgeprüft.
- Eigene Suchprofile je Reise und drei veränderbare Suchstrategien. Keine realen Beispielangebote vorgetäuscht.
- Angebotsmodell mit Daten, Belegung, Preisbasis, Tarif, Gebühren inklusive/zusätzlich/offen, Quelle, Prüfdatum, optionalem Gültigkeitsdatum und Verfügbarkeit laut manueller Erfassung.
- An Auswahl gebundene Kosten, Angebotsvergleich über dieselbe Kostenfunktion, keine zweite Kurtaxe bei im Angebot erfasster Kurtaxe. Unbekannte Gebühren bleiben offen. Frühstücksstatus des aktiven Angebots wirkt auf Verpflegungsschätzung.
- Erfasste externe Buchung, Unterkunft bezahlt/offen und Kaution separat. Gebuchte Angebote werden geschützt. Kein vollständiges Zahlungsbuch für andere Reiseposten.
- JSON-Sicherung v2, v1-Import mit nicht mutierender Aufwärtsmigration; neue Reiseerweiterungen tragen `schemaVersion: 2`, Suchmodell `version: 1`. Ältere Programme akzeptieren v2-Exporte nicht. `rp-trips` bleibt der Speicherort.
- Fünf lokale Sicherungspunkte vor Änderungen, Download und anschließender kontrollierter Import. Beschädigte Hauptdaten bleiben geschützt. Erkannte Fremdänderungen blockieren Speichern; eigene Änderungen bleiben exportierbar. Browser-Speicher hat keine atomare Compare-and-swap-Operation und ist keine konfliktfeste Cloud-Datenbank.

Ausgeführt: `npm test` inklusive `tests/search.cjs` erfolgreich; `node --check tests/browser.cjs` erfolgreich. Neue Prüfungen decken Preisbasis, offene Gebühren, Muss/Wunsch, Quelle, Datenbindung, Buchungsschutz, unverändernden Vergleich, Bezahlung/Kaution, v1/v2-Import, Sicherungspunkte und Fremdänderungen ab. Alle Claudes Logiktests 1.7–1.9 bestehen ebenfalls.

`tests/browser.cjs` um den Finder erweitert. In dieser Umgebung nicht im Browser ausgeführt; bereitgestelltes Browser-Control fehlt. GitHub-CI führt das vorhandene Chromium-Skript nach Push aus; Ergebnis muss am konkreten Commit geprüft werden. Kein echter iPhone-/Safari-Test, keine verifizierten Unterkunftspreise. Hinweise zur Anbieterintegration in `PROVIDER_INTEGRATION.md`.

## Bestätigt an früheren Versionen

- Statische, buildlose HTML/CSS/JavaScript-App in `index.html`.
- Sechs Reisearten, acht Bereiche, vier beispielhafte Winterorte und lokale Speicherung.
- Export/Import per JSON mit Formatversion 1; Konflikte werden übersprungen oder als Kopie angelegt.
- Stand 1.4: Bei beschädigtem `rp-trips`-JSON bleibt der ursprüngliche Inhalt unangetastet. Die Oberfläche bietet einen Rohdaten-Download und ein ausdrücklich bestätigtes Zurücksetzen; Änderungen sind bis dahin gesperrt. Ein verweigerter Browser-Speicher bleibt ein separates Problem.
- Berechnung vermeidet unbestätigte Gästekartenrabatte und berücksichtigt ein gemeinsames Top-Leistungs-Tageslimit.
- Reisen über 31 Tage werden im Datenmodell nicht abgeschnitten; Silvester-Vorlagen verwenden das Kalenderdatum.
- Stand 1.5 (Claude): Ableitungen ohne neues Speicherfeld, `rp-trips` unverändert.
  - Unterwegs-Ansicht: Bei festem Datum zeigt der Überblick „Heute“ und „Morgen“ mit Zeitfenster, Katalog-Öffnungszeiten (als unbestätigt gekennzeichnet) sowie Info- und Kartenlinks.
  - Fehlerbehebung Termine: Eine gerade laufende Reise wurde in „Meine Reisen“ als „vorbei“ angezeigt. Jetzt: „noch X Tage“, „heute geht’s los“, „unterwegs · Tag X von Y“, „Abreisetag“, „vorbei“.
  - Neuer Reiter „Mappe“: druckbare Zusammenfassung (Eckdaten, Tagesplan je Tag, Warnungen aus dem Plan-Check, Planwerte nach Kategorie, offene Kosten, Buchungsstand als Text ☐/☑). Druck-CSS blendet Navigation, Dock und Bedienelemente aus und erzwingt helle Farben.
  - Kalenderexport (`.ics`, RFC 5545: CRLF, Maskierung, Faltung nach 75 Byte): Reise als ganztägiger Termin, jeder Programmpunkt mit grobem Zeitfenster (Vormittag 9–12, Mittag 12–14, Nachmittag 14–18, Abend 18–22 Uhr, ohne Zeitzone) und `STATUS:TENTATIVE`. Punkte nach dem letzten Reisetag werden gezählt, nicht exportiert. Nur bei festem Datum.
  - „Als Text teilen“: Web-Share, sonst Zwischenablage, sonst Textfeld zum Markieren. Notizen (mögliche Buchungsnummern) nur nach Häkchen in Mappe und Text.
- Stand 1.9 (Claude): Fehlerbehebung Termine/Kosten bei Tagesausflügen, kein neues Speicherfeld.
  - Vorher: Festes Datum mit Anreise = Abreise wurde abgelehnt; eine neue Reise der Art „Tagesausflug“ hatte 3 Nächte (Essen für 4 Tage, Warnung „Unterkunft fehlt“).
  - Jetzt: 0 Nächte möglich (auch im Import), Typwahl „Tagesausflug“ setzt 0 Nächte bzw. Abreise = Anreise; Wechsel zu Wochenende/anderen Arten setzt 2 bzw. 3 Nächte, wenn vorher 0. Ohne Übernachtung keine Unterkunftspflicht.
  - Kompatibilität: Eine Sicherung mit eintägiger Reise wird von Version 1.8 und älter beim Import abgelehnt (sichere Ablehnung, kein Datenverlust).
- Stand 1.8 (Claude): Fehlerbehebung Kosten bei langen Schneesport-Aufenthalten, kein Speicherfeld.
  - Verleih wurde über 5 Tage still auf den 5-Tage-Tarif gedeckelt (8 Tage zu zweit: 286 € statt hochgerechnet 442 €) und als „Angabe“ markiert. Jetzt Hochrechnung mit dem Zuwachs von Tag 4 auf 5, Quelle „Richtwert“, Hinweis in der Zeile und unter „Noch offen“.
  - Skipass aus Tariftabelle (Balderschwang, Tannheimer Tal) ab Tag 4 war linear hochgerechnet, aber als „Angabe“ markiert. Jetzt „Richtwert“ mit Hinweis. Gleiches für den Gruppenkurs ab Tag 4 (35 €/Tag sind eine Annahme).
  - Die Tarife selbst wurden nicht neu recherchiert.
- Stand 1.7 (Claude): weiterhin kein neues Speicherfeld.
  - Packliste aus dem Plan: Die Checkliste erhält eine Gruppe „Packliste: für eure Unternehmungen“ mit den `bring`-Angaben der geplanten Katalogideen (ohne Dubletten zur Grundliste, mit Angabe wofür; Punkte nach dem letzten Reisetag zählen nicht). Abhaken nutzt das bestehende `check`-Objekt.
  - Fehlerbehebung Spartipps: „Günstigste passende Unterkunft“ empfahl in Oberjoch eine Unterkunft ohne Sauna, obwohl „Sauna in der Unterkunft“ geplant war (danach Plan-Check-Konflikt). Jetzt werden Sauna- und Küchenbedarf beachtet. Der Tipp „Wonnemar-Bad“ verspricht „frei“ nur noch bei bestätigter Gästekarte. Ein Test geht alle Orte, Unterkünfte und Sauna-/Küchen-Ideen durch; Gegentest gegen den alten Code schlug wie erwartet fehl.
- Stand 1.6 (Claude): weiterhin kein neues Speicherfeld.
  - Plan B bei schlechtem Wetter: im Heute-Block aufklappbar mit „Einplanen“ (vorbelegt auf heute) und in der Mappe je Tag. Nur Katalogideen mit Merkmal `indoor`, nicht schon am Tag geplant, passend zu Wochentag, Sonderöffnung (z. B. Wonnemar Silvester), Silvester-Terminen sowie Sauna/Küche der Unterkunft. Einträge mit Warnhinweis stehen hinten.
  - Offline-Start: `sw.js` (Netz zuerst, Cache nur ohne Verbindung; liest keine Reisedaten), `manifest.webmanifest`, App-Icons. Registrierung nur über http/https.
  - `tests/browser.cjs` (`npm run test:browser`) im Repo und in der GitHub-CI.
- Fehlende Kosten werden sichtbar benannt. Die Anzeige ist trotzdem noch keine vollständige Angebots- oder Zahlungsverwaltung.

## Ausgeführte Prüfungen

`npm test` prüft Logik, Speicherfehler und die Startansicht mit einer simulierten DOM-Umgebung; `tests/unterwegs.cjs` prüft Reisephasen, Kalenderdatei (Datumsgrenzen, Zeilenenden, Faltung mit Umlauten, Maskierung, übersprungene Punkte), Teilen-Text und die Mappe ohne Veränderung der Reise.

Stand 1.6, am 13.10.2026 ausgeführt: `npm test` und `npm run test:browser` grün. Der Browsertest läuft mit lokalem HTTP-Server in Chromium mit Desktop 1280 px, Mobilbreite 390 px und 320 px im Dunkelmodus. Er deckt ab: Reise mit festem Datum anlegen, eigene Unterkunft und Unternehmung, Einplanen und Verschieben über das Blatt, Kostenprüfung (3 × 6 € und 3 × 100 €), eigener Posten, Puffer, Checkliste, Notizen außerhalb der Mappe, Inhalt der `.ics`, Eckdaten ändern, Silvester-Vorlage mit simuliertem Datum 01.01.2027, Plan B einplanen, Angebot übernehmen, alle Reiter ohne horizontales Scrollen, Sicherung, Import (überspringen und Kopie), Löschen, Neuladen, beschädigter Speicher (Rohdaten bleiben erhalten) und Offline-Neustart mit Datenerhalt. Ein Gegentest mit absichtlich falschem Erwartungswert schlug wie erwartet fehl. Weiterhin **kein** iPhone-/Safari-Test.

Am 13.10.2026 zusätzlich ausgeführt (Claude, Stand 1.5): ein Klicktest in **headless Chromium** (Playwright, `file://`, Google-Fonts blockiert) mit Desktop 1280×900 und Mobilbreite 390×844 bei simuliertem Datum 01.01.2027: Silvester-Vorlage anlegen, Heute-Block und Phase prüfen, Übersicht ohne „vorbei“, Mappe öffnen, `.ics` herunterladen und Inhalt prüfen, Notiz-Häkchen, Druckmedium (Reiter ausgeblendet), PDF-Erzeugung, kein horizontales Scrollen. Ohne JavaScript-Fehler. Das Skript liegt nicht im Repo. Das ist **kein** iPhone-/Safari-Test; Druckdialog, Web-Share und Kalender-Import in echte Kalender-Apps wurden nicht geprüft. Anbieterpreise, Verfügbarkeiten und Öffnungszeiten wurden für diesen Code-Stand nicht aktuell nachgeprüft.

## Bekannte Grenzen

- ChatGPT-Dateivorschau auf iPhone zeigt möglicherweise nur den statischen Rahmen; die App benötigt eine reguläre Browser-Umgebung.
- Browser-Speicher synchronisiert nicht geräteübergreifend; die optionale Claude-Anbindung ist Altdaten-Kompatibilität, kein tragfähiges Mehrgeräte-Konzept.
- Live-Anbieterzugänge und automatisch normalisierte Angebotsantworten fehlen. Das manuelle konkrete Angebotsmodell ist in v2.0 implementiert.
- Zahlungen und Kautionen sind für konkrete Unterkunftsangebote getrennt; ein Zahlungsbuch für andere Reiseposten fehlt.
- Strecken außerhalb des Beispielstarts Hattenhofen müssen manuell eingetragen werden.
- Kurs-, Verleih- und Skipasstarife über 3 bzw. 5 Tage sind nur hochgerechnet (als Richtwert markiert); echte Mehrtagestarife fehlen. Genaue Zeitkonflikte brauchen weitere Regeln.
- Der öffentliche Katalog enthält Schätzwerte und ältere Angaben. Keine Buchungsentscheidung allein anhand dieser Werte treffen.

## Übergabe

Letzte frühere App-Version: 1.9 (dazu Plan B, Offline-Start, Packliste aus dem Plan, korrigierte Spartipps, Langzeit-Tarife und Tagesausflüge). GitHub-CI (Node- und Chromium-Job) war für 1.6 grün. Offen: Import der `.ics` in iOS-Kalender und Google Kalender testen, Druck aus Safari, „Zum Home-Bildschirm“ und Offline-Start auf einem echten iPhone (Hosting über https nötig, z. B. GitHub Pages). Nächster technischer Schritt: reproduzierbarer Browser-Klicktest auf Desktop und Mobilansicht, anschließend Angebots- und Zahlungsmodell mit Migration der vorhandenen `rp-trips`-Daten. Bestehende Daten niemals still überschreiben. Die vorhandene HTML-Datei bleibt bis zu einer geprüften Migration die maßgebliche App-Quelle.

Zusammenarbeit: Philipp, Claude und ChatGPT arbeiten gegebenenfalls parallel. Die Regeln für nur einen `main`-Branch, eigene Pushes, Konfliktprüfung und asynchrone Übergaben stehen in `docs/COLLABORATION.md`. Der am 13.10.2026 erneut hochgeladene HTML-Anhang war bytegleich mit `index.html`; daraus entstand keine App-Änderung.


## Aktuelle Übergabe für Claude

Nach v2.0 kann Claude seine angekündigte Verallgemeinerung der Startseite/Beispiele fortsetzen. Neuer Reiter: `suche`; zentral getestete Funktionen über `window.__app`. Angebotssuche ist bewusst unabhängig vom Allgäu-Katalog. Erst GitHub-CI/Chromium prüfen, anschließend iPhone/Safari und Anbieter-Suchlinks. Für Live-Daten Anbieterfreigaben und serverseitige Adapter vorsehen; keine Schlüssel ins Frontend. Neue Tests bei UI-Änderungen erhalten.

## Nachgewiesene GitHub-CI für v2.0

Commit `3e2e9f380ff551d1471a657a8e12a6d16950a74b`: [Actions-Lauf 38455456651](https://github.com/Freadeax/Reiseplaner/actions/runs/38455456651), beide Jobs `app` und `browser` erfolgreich. Der Chromium-Klicktest wurde in GitHub Actions tatsächlich ausgeführt, einschließlich Desktop, 390 px Mobilbreite, 320 px Dunkelmodus, neuen Finder-Bedienwegen, Angebotsgebühren/Zahlung, Profilen, Vergleich, Sicherungspunkten, Neuladen und bisherigen Offline-/Importwegen. Das ist weiterhin kein echter iPhone-/Safari-Test und keine Prüfung externer Anbieter-Suchseiten.

## Aktuelle Übergabe für ChatGPT (Claude, nach v2.1)

v2.1 baut auf `e830697` auf. Finder (`suche`), Angebotsmodell und Sicherung v2 sind unverändert. Neue Funktionen über `window.__app`: `holidayStay`, `planBasis`, `TEMPLATES`. Neue Klick-Aktion `data-act="tpl"` mit `data-val` als Vorlagen-ID; `tpl-silvester` funktioniert weiter. Wer Startseite oder „Neue Reise“ ändert, bitte `tests/vorlagen.cjs` und den Vorlagen-Abschnitt in `tests/browser.cjs` erhalten. Offene Produktfrage an Philipp: Sollen Katalog-Planwerte außerhalb des Jahreswechsels künftig eigene, recherchierte Saisonwerte bekommen? Bis dahin werden sie nur ehrlich gekennzeichnet.


## Nachgewiesene CI für passwortgeschützte Sicherungen (#4)

Commit `2fb8f70a3a3a4ead085108f3a1adbe86feac1522`: [Actions-Lauf 38506764102](https://github.com/Freadeax/Reiseplaner/actions/runs/38506764102) erfolgreich. Node-Job mit sämtlichen Logik-/Kryptotests und Chromium-Job tatsächlich ausgeführt und grün. Chromium prüfte Desktop/390 px/320 px dunkel, Passwort-Export/-Import, falsches Passwort ohne Datenänderung, Konfliktvorschau sowie bisherige Finder-/Import-/Offlinewege. Kein echter iPhone-/Safari-Test und kein unabhängiges Kryptografie-Audit.
