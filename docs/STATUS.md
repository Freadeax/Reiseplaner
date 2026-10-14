# Projektstand · 14.10.2026

## Warme Oberfläche und gemeinsame Katalogrichtung (ChatGPT)

Ausgangspunkt e36cd65, angekündigt in #7. Erste Designbasis in index.html: Sand/Salbei/Terrakotta, Waldgrün im Dunkelmodus, ruhigere Karten/Reiter, größere Touchziele, Fokus und mobile Detailraster. Nur CSS und theme-color; keine Änderungen an Auth/Store/Sync/SQL/config.js/cloud.js oder gespeicherten Daten. Katalogdaten und DB-Ausbau bleiben bei Claude. Kreative Kombinationen, Regenalternativen und Quellenreife in DESIGN_CATALOG.md vorgeschlagen, noch nicht umgesetzt oder von Claude bestätigt.

E-Mail/Cloudflare-Einrichtung laut Philipp am PC Do/Fr; Erinnerungen 15. und 16.10. jeweils 17 Uhr erstellt. Aktive wiederkehrende Kommunikationsprüfung in COLLABORATION.md festgehalten.

npm test vollständig grün; Gast-Build und Artefaktprüfung bestanden. npm run test:browser versucht, aber Chromium-Binary fehlt; kein erfolgreicher Browserlauf, keine neue visuelle Abnahme und kein iPhone-Test dieses CSS-Pakets. CI/Chromium am neuen Commit noch abzunehmen.


## Buchungsschutz und Spartipp-Vorschau (ChatGPT, 14.10. abends)

Ausgangspunkt 5342765, angekündigt in #5/#6. Philipp meldet erfolgreichen Test auf seinem iPhone: „passt alles“. Als Nutzertest dokumentiert; keine eigenen Geräteprüfungen oder nicht genannten Einzelschritte erfunden. Die frühere pauschale Aussage „kein iPhone-Test“ ist damit für diesen Nutzertest überholt, bleibt bei historischen Prüfläufen korrekt.

- Spartipps schützen gebuchte/angefragte Programmpunkte, Zahlungen, Fälligkeiten und Unterkunftsbuchungen. Keine automatische Koch-Ersparnis ohne bestätigte Küche; Küche bleibt beim Unterkunftsvergleich erhalten.
- Vorschau zeigt Änderung, Plan vorher/nachher, Ersparnis und offene Kosten. Abbrechen verändert nichts. Zwischenzeitlich geänderter Plan sperrt die Übernahme.
- Bezahlte Unterkunft auch ohne „gebucht“ vor Wechsel geschützt. Bezahlte Angebote vor Löschen geschützt. Erneute Auswahl desselben Angebots erhält Buchungscheck.
- Angebotsvergleich nutzt für den Restbetrag jetzt dieselbe Zahlungsberechnung einschließlich anderer aktueller Posten. Veralteter Finder-Text zur Synchronisation korrigiert.
- Persönliche Betreiber-Aufgaben in PHILIPP_TODO.md. Keine neuen Speicherfelder, Migrationen oder Store/Sync/Auth-Änderungen.
- npm test inklusive neuer Regressionsfälle grün. Browser-Skript um Vorschau/Abbrechen/Übernahme erweitert; Browser-Syntax, Gast-Build und Artefaktprüfung bestanden. CI am neuen Commit noch zu prüfen. Lokaler Chromium-Browser fehlt.


## Gesamtprüfung und Kostenvergleich (ChatGPT)

Ausgangspunkt 8bf665f; Issues #1–#7 und Claude-Übergaben geprüft. Paralleles cabefc5/v3.1 vor Abschluss integriert; Umkreis-Katalog und neue Tests erhalten. Entscheidungen, ersetzte Fragen und priorisierte Abnahme in OPEN_POINTS.md. Keine neue Produktions-/SMTP-/iPhone-Prüfung behauptet.

- Drei Kostenvarianten im Kosten-Reiter mit expliziten Verpflegungsannahmen, gleichem Angebot/Programm/Pufferprozentsatz; Ausgaben, Reserve, Gesamt, Restbetrag und Kaution getrennt. Keine garantierten Preisgrenzen; offene Kosten sichtbar.
- Zahlungsfehler korrigiert: Zahlungen für entfernte Posten reduzieren nicht mehr den offenen Betrag des verbleibenden Plans. Insgesamt gezahlt bleibt erhalten, Betrag für entfernte Posten separat erklärt. Unterkunftszahlungstext an vorhandenes Zahlungsbuch angepasst.
- npm test grün (einschließlich neuer Regressionen für entfernte Zahlungen, Szenario-Summen, unveränderte Reise und fehlende Küche). Build im Gastmodus und Artefaktprüfung bestanden; Browser-Skript um Szenarioansicht erweitert und syntaktisch geprüft. Lokaler Chromium-Lauf nicht möglich: Playwright vorhanden, Browserbinary fehlt. GitHub-CI am neuen Commit noch zu prüfen. Kein Store/Sync/Auth/SQL/Workflow-Eingriff und kein neues Speicherformat.




## Betriebsstand · 14.10.2026, abends (Claude, Issue #6)

Gesamtüberblick für alle Beteiligten. Einzelheiten zu v3.0 stehen im nächsten Abschnitt.

| Teil | Stand | Nachweis |
| --- | --- | --- |
| Website | **Online:** `https://freadeax.github.io/Reiseplaner/` (GitHub Pages, Quelle „GitHub Actions“) | HTTP 200; Workflow-Lauf 38583057320 für `3acfe22` vollständig grün, einschließlich `deploy` |
| Artefakt | Nur Website-Dateien; Doku, Tests und SQL nicht abrufbar (404); keine Secret- oder service_role-Schlüssel | per `curl` auf der Live-Seite geprüft |
| Website-Konfiguration | **Behoben:** `RP_SUPABASE_URL` endet auf `.supabase.co`. Die Live-`config.js` (Commit `cabefc5`) zeigt auf `https://sqkszjurzobltvdluiwh.supabase.co` | Lauf 38610561776 vollständig grün inklusive `deploy` |
| Umkreis-Katalog (#7) | **Live in der Produktion:** 54 Ziele und 255 Attraktionen, von der GitHub-Integration eingespielt. Anonym lesbar, Schreiben abgelehnt (`42501`). Die Live-Seite zeigt „Online-Katalog (Datenbank), Version 1“ | REST-Zählung, Chromium gegen https://freadeax.github.io/Reiseplaner/#entdecken, 14.10. abends |
| Supabase-Projekt | `sqkszjurzobltvdluiwh`. Auth: Registrierung an, E-Mail-Bestätigung Pflicht (`mailer_autoconfirm: false`), E-Mail-Anmeldung aktiv. Site- und Redirect-URL laut Philipp eingetragen | `/auth/v1/settings` mit Publishable Key |
| Datenbankschema | **Vorhanden (geprüft 14.10., ca. 15:15 Uhr).** `trips`, `trip_members`, `trip_invites` und die RPC-Funktionen existieren. Ohne Anmeldung wird alles abgelehnt (`42501` bei Lesen, Einfügen, `accept_trip_invite`, `create_trip_invite`), wie in der Migration vorgesehen. Bis ca. 14:50 meldete die API noch `PGRST205`. Eingespielt hat es die GitHub-Integration mit Verzögerung; Philipp hat den SQL-Editor nicht benutzt (Bestätigung 14.10.). Die Schreib- und Rollenprüfung mit echten Konten steht noch aus | REST-API mit Publishable Key |
| E-Mail | Eingebauter Supabase-Versand, nur an Mitglieder des Projektteams und etwa 2 pro Stunde. Cloudflare soll laut Philipp nur für E-Mail dienen. Cloudflare Email Sending versendet an beliebige Empfänger nur im Bezahltarif (Workers Paid), deshalb Vorschlag: eigene Domain mit DNS bei Cloudflare plus SMTP-Dienst mit Gratistarif. Entscheidung offen | Cloudflare-Doku, Kommentar in #6 |

**Nächste Schritte und wer sie übernimmt:**
1. ~~GitHub-Variable korrigieren~~: erledigt.
2. ~~Schema einspielen~~: erledigt. Die SQL-Datei **nicht** zusätzlich ausführen. Sie würde nur abbrechen und nichts ändern.
3. ~~Live-`config.js` prüfen~~: erledigt (Claude).
4. **Philipp:** Auf der Live-Seite mit eigener E-Mail registrieren, bestätigen, eine Reise anlegen und den Passwort-Reset testen, auch auf dem iPhone.
5. **Philipp mit ChatGPT:** E-Mail-Weg festlegen (Domain plus SMTP). Erst danach Mitreisende einladen.
6. **ChatGPT:** Gesamtstand gegen `docs/PUBLIC_PRODUCT.md` durchsehen. Befunde in #6, Codeänderungen an Speicher, Sync oder Schema nur mit `tests/sync.cjs` und dem CI-Job `database` grün.

## v3.1 · Umkreis-Katalog „Entdecken“ (Claude, 14.10.2026, Issue #7)

Ausgangsstand `8bf665f`. Auftrag Philipp: ein fester Katalog auf der Datenbank, der Orte und Attraktionen anhand von Abfahrtsort und Kilometern vorschlägt. Mehr Tiefe, kreativ weitergedacht.

**Umgesetzt:**
- **Datenbank:**
  - Migration `20261014160000_catalog.sql`: Tabellen `catalog_places` und `catalog_spots`, öffentlich nur lesbar.
  - RPC `catalog_search` mit Entfernungsregel.
  - Seed-Migration `20261014160100_catalog_seed_v1.sql`, erzeugt aus `catalog-data.js`.
  - Ausweg für den SQL-Editor: `supabase/manual/apply-catalog-v1.sql`.
- **Daten:**
  - 54 Ziele in DE, AT, CH, FR, IT, CZ und NL mit 255 Attraktionen und 12 Themen, darunter „Höhlen & Unterwelt“ und „Technik & Industrie“.
  - Je Ziel gute Monate, übliche Dauer, Kurzbeschreibung und eine „Ums Eck gedacht“-Idee.
  - Je Attraktion Dauer, drinnen, kindgeeignet und übliche Saison.
  - **Keine Preise, keine Öffnungszeiten.** Saisonangaben sind als „prüfen“ gekennzeichnet. Koordinaten sind ungefähre Lagepunkte.
  - Kartenlinks führen auf eine Kartensuche, nicht auf erfundene Anbieterseiten.
- **App `#entdecken`** (Kopfzeile „Entdecken“ und Startseite):
  - Abfahrtsort per Standort (auf etwa 1 km gerundet), Ortssuche über OpenStreetMap Nominatim (nur auf Knopfdruck) oder Liste mit 49 Städten.
  - Bereiche Feierabend, Tagesausflug, Wochenende, Langes Wochenende und Richtig weg, oder frei von–bis.
  - Themen, Monat, Dauer, „Mit Kindern“ und „Auch bei Schlechtwetter“.
  - Bewertung nach Themen-Treffern, Saison, Dauer, Kinder und Drinnen-Ideen. Im Reisemonat übliche geschlossene Ideen werden ausgeblendet und gezählt.
  - „Überrasch mich“ wählt zufällig unter den oberen Treffern.
  - Im Ziel-Blatt:
    - vorausgewählte Ideen;
    - **Zwischenstopps auf dem Weg** (Umweg höchstens etwa 33 km, im mittleren Teil der Strecke);
    - **Ausflüge vom Ziel** (bis 50 km).
  - „Als neue Reise anlegen“ bzw. „Zur Reise hinzufügen“:
    - **automatisches Tagesgerüst**: Anreisetag ab Nachmittag, Abreisetag vormittags, lange Touren ganztags, Drinnen-Ideen nachmittags, Abend-Ideen abends;
    - Stopps am Anreisetag mittags;
    - Umwege und Ausflugs-km fließen als geschätzte Zusatz-km in die Anreisekosten;
    - Reiseart und Monat werden vorbelegt.
  - In einer Katalogreise: Unternehmungen → „Mehr Ideen aus dem Katalog rund ums Ziel“.
  - Quelle: zuerst die Datenbank, sonst die Offline-Kopie `catalog-data.js` mit derselben Rechnung. Die Quelle steht sichtbar über den Ergebnissen.
- **Ehrliche Kosten:**
  - Übernommene Ideen zeigen „Preis offen, vor Ort prüfen“ statt „kostenlos“. Preis eintragen oder „Ist kostenlos“ wählen.
  - Der Plan-Check meldet offene Preise und „Fahrstrecke geschätzt (Luftlinie × 1,3)“, bis die km von Hand geändert werden.
  - Eigene Katalog-Ideen mit Merkmal „drinnen“ erscheinen jetzt auch im Plan B bei Schlechtwetter.
- **Reiseformat:** nur optionale, additive Felder, kein neues `schemaVersion`.
  - An der Reise: `kmSrc: 'schaetzung'` und `destGeo {lat, lon, place, v}`.
  - An eigenen Unternehmungen: `costOpen`, `indoor`, `km`, `catalogSpot`, `ort`, `map`.
  - Die Sicherungsprüfung (`validateExtras`) lehnt ungültige Werte ab. Ältere App-Versionen ignorieren die Felder; dort würden übernommene Ideen wie bisher als „kostenlos“ erscheinen.
- **Browser-Speicher:** Abfahrtsort und Filter liegen nur in `rp-entdecken`, nicht in den Reisedaten.
- **Version:** Service-Worker-Cache `reiseplaner-v3` mit `catalog.js` und `catalog-data.js`. Build und Artefaktprüfung kennen beide Dateien. Kopfzeile v3.1.

**Ausgeführte Tests (14.10.2026, Container mit Docker, Supabase CLI 2.120.0, Chromium über Playwright):**
- `npm test` grün, darin neu `tests/catalog.cjs`. Abgedeckt sind:
  - Daten gültig und Migrationen aktuell, Haversine gegen die bekannte Strecke Berlin–München;
  - Kilometerbereich, Themen und Saison, Stopps (Göppingen → Berlin ohne Bodensee oder Hamburg), Ausflüge, Tagesgerüst;
  - offener Preis, Plan-Check und Sicherungsprüfung;
  - Rückfall bei leerer oder fehlerhafter Datenbank und Verarbeitung einer Datenbank-Antwort.
- `npm run test:db` grün:
  - Katalog ohne Anmeldung lesbar, anonym und angemeldet nicht schreibbar;
  - **Datenbank und App liefern bei vier Abfragen identische Ziele, Entfernungen und Attraktionen**;
  - ungültige Eingaben werden abgelehnt.
- `npm run test:browser` grün:
  - neuer Ablauf in Chromium Desktop und 320 px dunkel: Ortssuche (Nominatim-Antwort im Test nachgebildet), Bereich, Thema, Ergebnis, Reise mit Tagesgerüst, offener Preis, Preis eintragen, weitere Ideen, Zwischenstopps, Filter nach Neuladen gemerkt;
  - kein horizontales Scrollen.
- `npm run test:e2e` grün: Die gebaute Website unter `/Reiseplaner/` holt den Katalog ohne Anmeldung aus dem lokalen Supabase-Stack („Online-Katalog (Datenbank), Version 1“).
- `supabase db lint` ohne Befund.
- `supabase/manual/apply-catalog-v1.sql` auf der lokalen Datenbank: erster Lauf ok (54/255, Historie verbucht), zweiter bricht ab, danach `test:db` grün.
- Build und Artefaktprüfung grün. Screenshots 390 px gesichtet.

**Grenzen:**
- Die echte Nominatim-Abfrage und der Standort wurden nur im Code geprüft; im Test war die Antwort nachgebildet.
- Kein iPhone/Safari.
- Produktion: Katalog-Migrationen von der Integration eingespielt und live geprüft (54/255, nur lesbar, Live-Seite nutzt die Datenbank).
- Saison, Inhalte und Lage der Attraktionen stammen aus redaktionellem Allgemeinwissen, Stand 14.10.2026, nicht live recherchiert. Vor einer Fahrt beim Anbieter prüfen.
- Straßen-km und Fahrzeit sind Schätzungen, kein Routing.

**Nächste Schritte:**
- **Philipp:** auf dem iPhone „Entdecken“ mit Standort und Ortssuche testen.
- **Alle:** Katalog über `catalog-data.js` erweitern (Norden, Osten und Westen sind dünner besetzt), nur mit Allgemeinwissen ohne Preise.
- **Später:** echte Fahrzeiten über einen Routing-Dienst (nur mit Freigabe und Grenzen); Nutzer-Vorschläge für den Katalog mit Moderation.

## v3.0 · GitHub Pages + Supabase (Claude, 14.10.2026, Issue #6)

Ausgangspunkt `d7112a3`. Vor dem Push mit ChatGPTs `1c67ff5` (öffentliches Produkt, neutrale Standardwerte, Export ohne Passwort) zusammengeführt. Mit `docs/PUBLIC_PRODUCT.md` abgeglichen.

**Umgesetzt (Code, Migration, Tests):**
- **Supabase-Schema** in `supabase/migrations/20261014120000_reiseplaner_core.sql`:
  - Tabellen `trips` (bestehende IDs, `data` JSONB im App-Format schemaVersion 2, abgeleitete Spalten, serverseitige `version`/Zeitstempel, Soft-Delete), `trip_members` (owner/editor/viewer) und `trip_invites` (SHA-256-Hash, Ablauf ≤ 30 Tage, einmalig, widerrufbar, optional an bestätigte E-Mail gebunden).
  - RLS ist aktiv und erzwungen. Spalten-Grants, Trigger gegen Änderungen an ID/Eigentümer/Erstellzeit, Löschen nur durch den Eigentümer.
  - Funktionen `create_trip_invite`, `accept_trip_invite`, `trip_member_list` und `trip_role_of`, alle `security definer` mit leerem `search_path`.
- **`cloud.js`:** einziger Supabase-Zugriff, mit PKCE-Auth: Registrierung, Bestätigung, Anmeldung, Abmeldung, Sitzung und Passwort-Reset mit Rückkehr auf die Website.
- **`config.js`:** öffentliche Konfiguration. Leer bedeutet Gastmodus.
- **`vendor/supabase-js-2.117.2.js`:** lokal statt CDN, MIT, Prüfsumme in `vendor/README.md`.
- **Speicher in `index.html`:**
  - Der Gastbereich `rp-trips` bleibt unverändert. Jedes Konto hat einen eigenen Bereich `rp-u:<id>` mit Reisen, bestätigter Version/Rolle und Warteschlange.
  - Beim Kontowechsel wird der Arbeitsspeicher geleert. Beim Abmelden ohne offene Änderungen wird der Konto-Cache gelöscht, mit offenen Änderungen kommt eine Rückfrage, und der Cache bleibt bis zur nächsten Anmeldung.
  - `window.claude.use('db')` ist entfernt.
- **Abgleich (`Sync`):**
  - Schreiben nur mit bekannter Version, sonst ein sichtbarer Konflikt mit drei Wegen: Online-Version übernehmen, eigene als Kopie oder bewusst überschreiben.
  - Offline-Warteschlange. Löschungen als Markierung. Rechteentzug entfernt die Reise vom Gerät, mit ausstehender Änderung wird sie als „kein Zugriff mehr“ gerettet.
  - Bei einer fremden ID-Kollision entsteht eine neue ID. Nach einer verlorenen Antwort beim Anlegen entsteht keine doppelte Reise (Idempotenz).
  - „Online gespeichert“ erscheint erst nach Bestätigung durch die Datenbank.
- **Oberfläche:**
  - Konto-Seite `#konto`: Anmelden, Registrieren, Passwort vergessen, neues Passwort, Abmelden, Synchronisieren, Einladung annehmen.
  - Bewusste Übernahme der Gast-Reisen mit Vorschau und Validierung.
  - „Teilen & Rechte“: Mitglieder, Rolle ändern, entfernen, Einladungslink erstellen und widerrufen, Reise verlassen. Dazu Konflikt- und Leserecht-Hinweise und Status-Plaketten je Reise.
- **Fehlerbehebungen aus den neuen Tests:**
  - Die Leseregel blockierte `INSERT … RETURNING` für den Eigentümer.
  - Ein Neuaufbau der Konto-Seite durch den Hintergrund-Abgleich hat getippte Passwörter gelöscht. Offene Kontoformulare werden jetzt nicht mehr neu aufgebaut.
  - Ein Wettlauf beim Sitzungsstart konnte eine frische Anmeldung überschreiben.
- **GitHub Pages:**
  - `npm run build` erzeugt `public/` nur mit Website-Dateien und `404.html`. Der Build lehnt Secret- und service_role-Schlüssel ab, `npm run check:artifact` prüft Dateiliste und Schlüssel.
  - Workflow „Tests & Pages“: `app`, `browser` und `database` (lokaler Supabase-Stack in GitHub Actions) laufen vor `build`. `deploy` läuft nur auf `main` und mit `vars.PAGES_ENABLED == 'true'`, mit minimalen Rechten.
  - Der Service Worker cached Supabase-Antworten nicht, sie sind ein fremder Origin.

**Am 14.10.2026 tatsächlich ausgeführt:**
- `npm test`, inklusive neuem `tests/sync.cjs` mit nachgebildetem Server für Offline, Konflikte, Löschung, Leserecht, Entzug, ID-Kollision, Idempotenz, Gast-Übernahme, Kontowechsel und Abmelden: grün.
- `npm run test:browser` (Gastmodus, Chromium): grün.
- `npm run test:db` gegen einen **lokalen** Supabase-Stack (CLI 2.120.0, Postgres 17) über die echte Auth- und REST-API mit drei Konten: grün. Geprüft wurden Registrierung mit Mail-Bestätigung, Anmelden, Abmelden, Passwort-Reset per E-Mail-Link, Lesen/Ändern/Löschen je Rolle, unberechtigtes Konto, unangemeldete Aufrufe, Selbsthochstufung, Einladung einmalig/widerrufen/an E-Mail gebunden, Rechteänderung und -entzug, Versionskonflikt und Soft-Delete.
- `supabase db lint`: keine Befunde.
- `npm run test:e2e`, dreimal hintereinander grün, in Chromium mit der gebauten Website unter `/Reiseplaner/` plus lokalem Stack: Pfad, Direktlink, Neuladen, 404, Registrierung mit Bestätigungslink, Gast-Übernahme, „Online gespeichert“ erst nach Datenbank-Bestätigung, Einladung an ein zweites Konto, Offline-Konflikt ohne Überschreiben, Entzug, Abmelden und Passwort-Reset in der Oberfläche.
- Build-Schutz: Secret Key, service_role-JWT, fremde Datei und eingeschmuggelter Schlüssel brechen jeweils ab.

**Nicht durchgeführt bzw. nicht möglich:**
- Kein Produktions-Supabase-Projekt verbunden, weil Zugangsdaten fehlen.
- GitHub Pages ist nicht aktiviert (404 am 14.10.2026), daher keine Veröffentlichung.
- Kein echter E-Mail-Versand (lokal über Mailpit), kein iPhone/Safari, keine Cloudflare-Pages-Prüfung.
- CI-Nachweis: [Lauf 38566417993](https://github.com/Freadeax/Reiseplaner/actions/runs/38566417993) für `332b1fe`. `app`, `browser`, `database` (lokaler Supabase-Stack in GitHub Actions: Migration, Linter, `test:db` und `test:e2e`) und `build` mit Artefaktprüfung waren erfolgreich. `deploy` wurde übersprungen, weil `PAGES_ENABLED` noch nicht gesetzt ist. Zwei CI-Korrekturen davor: Ports der lokalen Supabase-Dienste auf 553xx verlegt (54324 war auf dem Runner belegt), und der E2E-Test wartet jetzt auf das Ergebnis statt auf eine unveränderte Statusanzeige.

**Grenzen:**
- Gratistarif: Pausierung nach 1 Woche Inaktivität, keine automatischen Backups.
- Eingebauter Supabase-Mailversand nur an Mitglieder des Projektteams, daher eigenes SMTP nötig.
- Kein Realtime, Abgleich alle 60 s und bei Fokus/Änderung.
- Kein Besitzerwechsel, keine Kontolöschung in der App, keine Profile oder Anzeigenamen. Die E-Mail ist für Mitreisende derselben Reise sichtbar.

## Öffentliche Produktgrundlage (ChatGPT, 14.10.2026)

Auf d7112a3, Abstimmung in #6/#1. Claude bearbeitet Store/Sync/Hosting; diese Bereiche hier nicht verändert.
- Neue allgemeine Reisen ohne persönlichen Startort; Beispielreise behält ihre erklärte Hattenhofen-Basis. Ohne Startort kein erfundener Routenlink. Suchprofil-Platzhalter neutral.
- Normaler Export/Import bleibt ohne Passwort. Passwortexport-Schaltflächen entfernt; Entschlüsselung vorhandener Altdateien und Kryptotests bleiben kompatibel.
- PUBLIC_PRODUCT.md legt Ziel für beliebige Nutzer, private Pläne, Rollen, Einladungen, Datenübernahme, Revisionen, Anbieteradapter, Kosten, Termine und öffentliche Freigabestufen fest. Dies ist Architektur/Anforderung, keine implementierte Cloud-Zusage.

Ausgeführt: `npm test` erfolgreich einschließlich neutralem Startort, fehlender Strecke, expliziter Beispielbasis und Erhalt bestehender Startorte im Export/Import. `node --check tests/browser.cjs` und `git diff --check` erfolgreich. Browser-Test für normale Sicherung und verschlüsselten Altimport angepasst; Chromium lokal mangels Browserbinary nicht ausgeführt. Echter iPhone-/Safari- und Mehrkonten-Datenbanktest bleiben offen.

## v2.3 · Zahlungsbuch für alle Reiseposten (Claude, 14.10.2026, Issue #5)

Begonnen auf `df924f0`, vor dem Push mit ChatGPTs `89d2478` (Preiszuordnung, #3) zusammengeführt. Die Unterkunftszahlungen bleiben bei ChatGPTs Angebotsmodell und werden nur gelesen.

- **Optionales Feld `t.ledger[key]`** mit `{status: offen|angefragt|gebucht, amount: Zahl|null, paid: Zahl, due: Datum|''}`.
  - Schlüssel entsprechen den Kostenzeilen, die jetzt ein Feld `key` tragen: `anreise`, `kurbeitrag`, `kurs`, `verleih`, `skipass`, `act:<id>`, `xc:<id>`.
  - Das Feld ist additiv. Sicherung und `schemaVersion` bleiben 2, ältere Stände ignorieren das Feld und schreiben es beim Speichern unverändert mit.
  - `validateLedger` läuft in `validateExtras`, also beim Import und beim Laden aus dem Browser-Speicher.
- **Fehlerbehebung Kosten:** Bisher ließ sich für Kurs, Verleih, Skipass, Tickets oder Unternehmungen kein tatsächlich gebuchter Preis erfassen, sie blieben Schätzwerte. Ein `amount` ersetzt jetzt den Planwert dieses Postens in `cost()` (Quelle „Angabe“, „laut eurer Buchung · Plan war …“), auch im Puffer.
- **Grenzen der Eingaben:** Bezahlt kann nicht höher sein als der Betrag. Ungültiger Status, ein ungültiges Datum und negative Werte werden abgewiesen. Ein Eintrag ohne Inhalt wird entfernt.
- **Kosten-Reiter „Buchungen & Zahlungen“:** Gebucht, bezahlt (inkl. Unterkunftsangebot), noch offen bis Reiseende, Kaution separat und die nächsten Fälligkeiten. Jeder Posten hat Status, Betrag, Bezahlt und „fällig am“. Alles ist als Text sichtbar, nicht nur über Farbe.
- **Plan-Check:** Überfällige Zahlungen werden als Warnung gemeldet, solche innerhalb von 14 Tagen als Hinweis. Zahlungen zu Posten, die nicht mehr im Plan sind, bleiben sichtbar und erzeugen eine Warnung.
- **Mappe und Kalender:** Die Mappe hat einen Abschnitt „Zahlungen“, nur wenn etwas erfasst ist. Der `.ics`-Export enthält offene Fälligkeiten als ganztägige Termine.
- **Tests:** Neu ist `tests/zahlungen.cjs`. `tests/browser.cjs` setzt einen Posten auf „gebucht“, trägt einen Betrag ein und prüft, dass eine Überzahlung abgewiesen und eine gültige Zahlung gespeichert wird. `npm test` und `npm run test:browser` sind grün. Kein iPhone-/Safari-Test.
- **Grenzen:** Kein Teilzahlungsverlauf mit mehreren Daten, keine Erstattungen, keine Kaution für andere Posten und keine Kontoabgleiche. „Noch offen“ enthält auch Essen und Puffer, die erst vor Ort anfallen.

## Preiszuordnung und Aktualität (ChatGPT, 14.10.2026, Issue #3)

Ausgangspunkt `df924f0`; Claudes Übergabe in Issue #3 gelesen und Folgepaket dort angekündigt. Der bereitgestellte HTML-Anhang hat Stand 1.3 und ersetzt nicht die neuere App auf main.

- Exakt passende Preisabfrage für Zeitraum und Personenzahl hat Vorrang vor dem höchsten Saisonvergleich. Regression: Schön Hier 08.–12.03.2027 jetzt 460 € statt 500 €.
- Preisabfragen älter als 30 Tage sowie unklare/zukünftige Prüfdaten erhalten Richtwertstatus und einen offenen Prüfhinweis. Die 30-Tage-Grenze ist eine interne Erinnerungsregel, keine zugesagte Preisgültigkeit; auch frische Werte sind Momentaufnahmen.
- Hochrechnung auf andere Aufenthaltsdauer ist in Kosten und offenen Punkten ausdrücklich sichtbar. Feste Gebühren und Mindestnächte können abweichen. Der höchste Saisonvergleich ist keine garantierte Obergrenze.
- Ungültige Preisstichproben werden ignoriert. Fehlendes Prüfdatum wird ohne Absturz angezeigt. Kein neues Reiseformat und keine Änderung der recherchierten Katalogdaten.

Ausgeführt: `npm test` erfolgreich, einschließlich neuer Regressionen für exakte Preispriorität, 30/31-Tage-Grenze, zukünftiges/fehlendes Prüfdatum, Hochrechnung und ungültige Stichproben. `git diff --check` erfolgreich. Lokaler Chromium-Test konnte nicht starten: Browserbinary fehlt, Installationsdownload liefert ungültiges ZIP. GitHub-CI nach Push prüfen; kein iPhone-/Safari-Test. Keine neue Anbieterrecherche.

Übergabe: Live-Anbieterzugänge und serverseitige Synchronisation bleiben offen. Nächste Schritte sind exakte Gebührenmodelle für Vergleichs-Stichproben und weitere Anbieterabfragen; höchste Saisonwerte allein verhindern keine Unterschätzung.

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
- Ohne Konto synchronisiert der Browser-Speicher nicht geräteübergreifend. Mit Konto läuft der Abgleich über Supabase (v3.0), sobald ein Produktionsprojekt eingerichtet ist.
- Live-Anbieterzugänge und automatisch normalisierte Angebotsantworten fehlen. Das manuelle konkrete Angebotsmodell ist in v2.0 implementiert.
- Zahlungen und Kautionen sind für konkrete Unterkunftsangebote getrennt. Seit v2.3 haben andere Reiseposten ein einfaches Zahlungsbuch (Status, Betrag, bezahlt, Fälligkeit), aber ohne Teilzahlungsverlauf, Erstattungen und Kontoabgleich.
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

## Aktuelle Übergabe nach v3.0 (Claude → Philipp, ChatGPT)

- **Philipp:** Supabase-Projekt anlegen, Migration einspielen, Auth-URLs, E-Mail-Bestätigung und SMTP einrichten, GitHub-Variablen setzen und Pages auf „GitHub Actions“ stellen. Schritte in `docs/SUPABASE_SETUP.md` und README „Betrieb“. Danach `#konto` auf der echten Website testen, auch auf dem iPhone.
- **ChatGPT/Claude:** Speicher- und Abgleichsbereich ist wieder frei. Wer `Store`, `Sync`, `Auth` oder `cloud.js` ändert, muss `tests/sync.cjs`, `npm run test:db` und `npm run test:e2e` grün halten. Schemaänderungen nur als neue Migrationsdatei.
- **Offene Abnahmekriterien aus `docs/PUBLIC_PRODUCT.md`:** Besitzerwechsel, Kontolöschung und -export, Profile/Anzeigenamen, Betreiber-Backup-Ablauf mit Restore-Probe, Datenschutztexte, iPhone/Safari.
