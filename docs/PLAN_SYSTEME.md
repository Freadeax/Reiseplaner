# Systemplan · Stand, Lücken und nächste Pakete je System

Stand 15.11.2026, Claude. Ausgangsstand `main` 269ea64 plus die Änderungen dieses Commits. Ergänzt die Modul- und
Plattformplanung (Projektordner `pakete/planung/docs/planung/`, Einstieg `00_UEBERSICHT.md`) um eine Sicht **je laufendem
System**: Was ist im Code, was fehlt, in welcher Reihenfolge geht es weiter. Reihenfolge nach Projektregel: Geld, Termine,
Speicherung, Zugriff vor neuen Ideen. Markierung: **[Code]** im Repository geprüft, **[Plan]** Vorschlag, **[offen]** braucht
Philipps Entscheidung.

Website only (Philipp 23.10.): Plattform-Pakete für iOS/Android/Windows ruhen. Die Oberfläche wird gerade in einem eigenen
Thread neu gestaltet; alle Pakete unten sind deshalb so geschnitten, dass sie zuerst als reine Logik mit Node-Tests entstehen
und die Oberfläche danach in einem kleinen, abgestimmten Schritt folgt.

## 1 · Überblick

| System | Kern im Code | Reife | Wichtigste Lücke | Nächstes Paket |
| --- | --- | --- | --- | --- |
| Kosten | `app/kosten.js` `cost`, `openCosts`, `costScenarios`; `app/gaestekarten.js` `cardPricing` | hoch | Teilzahlungen, Zahlungsplan, Preisstände fehlen als Daten | Format 5 Schritt 3, dann M08.2 |
| Zahlungsbuch, Buchung, Storno | `app/zahlungsbuch.js`, v3 `refunds/cancel` | hoch | keine Stornobedingungen vor dem Storno (Gebühr erst danach bekannt) | M02.2 Storno-Vorschau (`cancelFee`) |
| Fristen und Termine | `app/fristen.js` `deadlines`, `app/unterwegs.js` `icsData`, Tagesplan | mittel-hoch | „erledigt“ nur lesbar, keine eigenen Aufgaben, keine Storno-Fristen | Format 5 Schritt 3 + M02.4 |
| Speicherung lokal | `rp-trips` + `rpstore.js` (IndexedDB-Zweitkopie), Format 2–5 (5 nur lesen), Sicherung/Archiv | hoch | Format 5 wird gelesen, noch nicht geschrieben | Format 5 Schritt 2/3 |
| Konto, Sync, Zugriff | `cloud.js`, `app/speicher.js`, Supabase RLS, Migrationen bis `20261024060000` | mittel | SMTP/Domain fehlt, Anzeigenamen, Fotos nicht in der Cloud, kein Betreiber-Backup | E-Mail (Philipp), dann M06.1 |
| Fotos und Reisebuch | `app/format4.js`, `app/fotos.js`, `photostore.js`, `bookgen/bookedit/bookprint.js` | mittel-hoch | **seit 15.11. freigeschaltet**; Upload in die Cloud fehlt | P05 Storage-Bucket (Stufe E) |
| Katalog/Register | `catalog.js`, `catalog-data.js`, Supabase `catalog_*` | mittel | keine Quellen/Prüfdatum je Feld, keine Register-Tabellen | M07.1 |
| Externe Dienste | `app/reise.js` Ortssuche/Routing, `platform.js` | mittel | kein Proxy; Bedingungen von OSMF/FOSSGIS ungeprüft | Proxy-Entscheidung [offen] |
| Varianten, Vorlagen, Kriterien | `app/varianten.js` `variantCopy`, Vorlagen in `kosten.js` | mittel | Vergleich und Obergrenze getrennt vom Wunschbudget fehlen | M05.2 + M10 nach Format 5 |

## 2 · Kosten

**[Code]** `cost(t)` rechnet Unterkunft, Anreise (einfach oder Abschnitte), Aktivitäten, Verpflegung, Zusatzposten, Reserve;
Gästekarten über `cardPricing` (nur bestätigt senkt die Summe, Tageslimit chronologisch). `openCosts` sammelt alles Unbekannte,
damit kein „im Budget“ entsteht. Drei Verpflegungsszenarien (`costScenarios`).

Lücken nach Gewicht:
1. **Angebotspreis ohne Verlauf.** Ein geänderter Preis überschreibt den alten; ob ein gebuchtes Angebot inzwischen
   günstiger ist, sieht niemand. Lösung im Vertrag: `offers[i].history` + `offerPriceState` (O3/O4/O9) [Code: v5logic].
2. **Verpflegung doppelt möglich.** `board:'half'` gibt es noch nicht; ein Halbpension-Angebot und `t.food='auswaerts'`
   zählen Abendessen zweimal (M08 O2). Paket M08.3 nach Format 5: Verpflegungsplan zieht inklusive Mahlzeiten ab.
3. **Wunschbudget und Obergrenze sind ein Feld** (`t.budget`). `criteria.budgetMax` + `budgetVerdict` trennen das (V2/V3).
**16.11.:** Plan-Ist-Vergleich je Bereich mit Hochrechnung (`istvergleich.js`, `docs/IST_AUSGABEN.md`) [Code].
4. Szenarien variieren nur die Verpflegung. M05 `assumptions` (Sprit, Aktivitäten, Unterkunft als Spannen) folgt mit M05.2.

Abnahme je Paket: Regressionsvergleich wie G-R12 (alle Vorlagen, Pakete, Katalog-Unterkünfte centgenau gleich), dann die
neuen Rechenfälle.

## 3 · Zahlungsbuch, Buchung, Storno

**[Code]** Buchungsbuch `ledger[key]` mit `status, amount, paid, due`; Angebote mit `paid, booked, deposit`; Format 3:
`refunds`, `cancel{on, fee}`, `paidBy`. Schutzregeln: gebuchte/angefragte/bezahlte Posten werden bei Unterkunfts- und
Ortswechsel nie still entfernt.

Lücken:
1. **Teilzahlungen.** `paid` ist eine Summe; Anzahlung und Rest mit Datum fehlen. Vertrag: `payments[]` (Ist), Summe muss
   `paid` entsprechen; `payPlan[]` (Soll) mit Rest auf den Cent (O7). Fristen entstehen aus offenen Raten (`payPlanStatus`).
2. **Stornobedingungen vor dem Storno.** Heute kennt die App die Gebühr erst, wenn storniert ist. `cancelTerms` +
   `cancelFee` beantworten „was kostet es, wenn wir heute absagen“ und liefern Fristen „kostenlos bis …“ (R1–R9).
3. **Abgelehnt** als Status (Anfrage ohne Zusage) fehlt (D00 §6.1); als kleine Ergänzung in Format 5 Schritt 3 prüfen,
   weil `LEDGER_STATUS` heute eine feste Liste ist und ältere Stände unbekannte Werte ablehnen würden.

## 4 · Fristen und Termine

**[Code]** `deadlines(t, now)` ist die eine Quelle für Fahrplan, „Als Nächstes“, Kalenderdatei und die Wochenübersicht;
stabile IDs, Zeitzonen, Sommerzeit. Tagesplan mit Uhrzeiten, Überschneidungen, Wegzeiten (Schätzung oder OSRM).

Lücken:
1. **„Erledigt“-Markierung** (`t.deadlineAck`) wird gelesen, aber nicht geschrieben: der Schreibweg ist ein v5-Feld.
2. **Storno- und Ratenfristen** (seit 16.11. in `deadlines` gelesen, Eingabe folgt mit `F5_WRITE`): `cancelDeadlines` (`cancel:<key>:<n>`) und offene
   Raten (`plan:<offer>:<rate>`) einhängen. IDs sind so gewählt, dass bestehende `pay:`-Fristen nicht wechseln.
3. **Eigene Aufgaben** (`t.tasks`) mit Zuständigkeit (M02.4/M06).
4. Mitteilungen gibt es auf der Website nicht; Kalenderdatei bleibt der Weg (M02 §7). Web-Push erst mit gemeinsamen Reisen.

## 5 · Speicherung

**[Code]** Gast: `rp-trips` in `localStorage`, Zweitkopie in IndexedDB (`rpstore.js`), Sicherungspunkte, Export/Import ohne
Passwort, verschlüsselter Altimport, `.reiseplaner`-Archiv mit Fotos. Formate 2/3/4 je Reise, keine Rückstufung,
Feldtreue-Tests, ältere Stände sehen neuere Reisen als „nur lesen“.

Format 5, Schritte (Details `SCHEMA_V5.md` §8):
1. **Vertrag + `v5logic.js` + Tests** – erledigt 15.11.
2. **Migration** `CHECK schema_version in (2,3,4,5)`: lokal mit Docker prüfen (`test:db`, `test:e2e`), Push nur mit
   **Philipps ausdrücklicher Freigabe**, weil die Supabase-GitHub-Anbindung sie sofort in die Produktion spielt.
3. **Lese-Release** `F5_WRITE=false`: `v5logic.js` laden, `SCHEMA_MAX=5`, `validateExtras` → `validateV5`, Sicherung, Sync und
   Konfliktkopie über `serializeTrip5`. Betroffen: `app/v3.js`, `app/ereignisse.js`, `app/speicher.js`, `app/kosten.js`
   (Sicherung), `index.html`, `sw.js`, `scripts/build.mjs`, `scripts/check-artifact.mjs`. Pflichttests: Feldtreue jeder v5-Reise
   über Export → Import, Sync-Rundlauf, Konfliktkopie; Format-4-Stand liest v5 nur.
4. **Schreiben freischalten** nach einigen Tagen, dann Module einzeln (Reihenfolge §9).

Weitere Lücke: Die Gast-Speicherung hat keine Mengenwarnung vor dem `localStorage`-Limit (≈ 5 MB je Herkunft). Mit Fotos liegt
nur die Beschreibung in der Reise (≈ 300 Byte je Foto), das Risiko ist klein, aber 2000 Fotos × mehrere Reisen erreichen
1–2 MB. [Plan] `RPStore` meldet Füllstand; Warnung ab 70 %.

## 6 · Konto, Sync und Zugriff

**[Code]** Supabase-Konto (E-Mail-Code), Reisen in `trips` mit Rollen (Eigentümer, Bearbeiter, Leser) und RLS,
Versionsvergleich beim Speichern (`where version = n`), Konfliktdialog ohne stillen Verlust, Löschmarken, Kontoexport,
Kontolöschung und Besitzerwechsel (Migration `20261016120000`), Rückstufungsschutz im Trigger.

Lücken nach Gewicht:
1. **E-Mail-Versand an fremde Adressen** (SMTP/Domain) – blockiert echte öffentliche Nutzung. Philipp: Domain nennen,
   Dienst wählen (PHILIPP_TODO 1–3). Die Vorlage „Magic Link“ braucht `{{ .Token }}`.
2. **Betreiber-Backup:** Supabase Free hat keine automatischen Backups, Storage-Dateien sind in keinem Datenbank-Backup
   (M15). [Plan] wöchentlicher `pg_dump` per GitHub Action in einen privaten Speicher + dokumentierte Restore-Probe;
   Entscheidung Free/Pro [offen, Nr. 12].
3. **Mitgliederliste zeigt E-Mail** statt Anzeigename (M06.1, Entscheidung 7 [offen], Empfehlung freiwillig).
4. **Fotos nur auf dem Gerät.** `cloud.state` bleibt `none`; es gibt noch keinen Upload. Bucket `trip-media` mit RLS je
   Reise, Kontingent 300 je Reise, Löschkaskade (P05, Stufe E).
5. `party[i].member` (Konto ↔ Mitreisende) braucht eine Server-Funktion `claim_party`, damit nur die Person selbst sich
   verknüpft; der Vertrag erlaubt nur Konto-UUIDs, nie E-Mails.

## 7 · Fotos und Reisebuch

**[Code]** Fotos werden im Browser verkleinert (Arbeitskopie + Vorschau, kein Original), Standort bleibt in der App, Export
entfernt ihn standardmäßig. Reisebuch: Entwurf, Editor, Druck/PDF. **15.11.: `F4_WRITE=true`** – drei Wochen Lese-Release
und die Datenbank nimmt Format 4 seit 24.10. an. Erste Reise mit Foto wird nach Bestätigung auf Format 4 gehoben.

Nächste Schritte: Sichtprüfung durch Philipp (iPhone: Foto hinzufügen, Buch drucken), dann Cloud-Upload (§6.4),
Sammelbuch aller Reisen (M13).

## 8 · Externe Dienste

**[Code]** Ortssuche (Nominatim) nur auf Knopfdruck oder Enter; Routing (routing.openstreetmap.de) auf Knopfdruck; Katalog
aus Supabase oder lokaler Kopie. **15.11.: Abstand ≥ 1 s zwischen Nominatim-Anfragen** (die Streckenberechnung suchte
Start und Ziel direkt nacheinander) und Test, dass beim Tippen nicht gesucht wird. Damit ist die offene Prüfung aus
00_UEBERSICHT §6 („Autovervollständigung?“) beantwortet: nein.

Offen: Namensnennung OSMF/FOSSGIS sichtbar prüfen, Proxy vor öffentlichem Start (Entscheidung 10 [offen]), Open-Meteo
(freigegeben) als M03.1 Adapter mit Cache auf dem Gerät.

## 9 · Reihenfolge der nächsten Pakete

| # | Paket | Art | Abhängigkeit | Wer |
| --- | --- | --- | --- | --- |
| 1 | Format 5 Migration (lokal geprüft) – erledigt 15.11. | Datenbank | **Freigabe Philipp** (erteilt) | Claude |
| 2 | Format 5 Lese-Release – erledigt 16.11. | Speicherung | 1 live; Abstimmung mit dem Oberflächen-Thread | Claude |
| 3 | M02.2 Storno-Vorschau + `cancel:`-Fristen | Geld/Termine | 2 | Claude |
| 4 | M08.2 Zahlungsplan + Teilzahlungen | Geld | 2 | Claude |
| 5 | M09.3 Gästekarten-Status mit Beleg | Geld | 2 | Claude |
| 6 | M02.4 Aufgaben + „erledigt“ schreiben | Termine | 2 | Claude |
| 7 | M05.2 Varianten-Vergleich + Obergrenze | Geld | 2 | Claude |
| 8 | Betreiber-Backup + Restore-Probe | Betrieb | Entscheidung 12 | Claude |
| 9 | SMTP/Domain, externe Anmeldung | Zugang | Philipp | Philipp, dann Claude |
| 10 | M03.1 Wetter (Open-Meteo) | Planung | – (ohne Format 5) | Claude |

Pakete 3–7 können parallel in eigenen Dateien entstehen, sobald 2 steht; je Paket zuerst die reine Funktion (liegt für 3, 4,
5 und 7 schon in `v5logic.js`), dann die Oberfläche.

## 10 · Offene Entscheidungen (unverändert aus 00_UEBERSICHT §5, Stand 15.11.)

7 Anzeigename freiwillig · 8 Register nur Philipp · 9 OSM nur Kennungen · 10 Proxy · 11 Löschfrist 30 Tage · 12 Supabase
Free/Pro · 13 Betreiber/Kontakt · 14 Domain. Neu: **Freigabe der Format-5-Migration** (Schritt 2), sobald sie lokal geprüft ist.
