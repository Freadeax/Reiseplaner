# Datenvertrag v5 · eine gemeinsame Version für alle Module · Entwurf

Stand 15.11.2026, Claude (Thread „Offene Punkte weiterentwickeln“). Grundlage: Planungsunterlagen D00 §5.x/§5.y und die
Moduldokumente M01–M12 §5/§6 (Projektordner `pakete/planung/docs/planung/`), Verfahren wie [`SCHEMA_V3.md`](SCHEMA_V3.md) und
[`SCHEMA_V4.md`](SCHEMA_V4.md). Entscheidung Philipp 23.10.2026: **Format 5 als eine gemeinsame Version** nach Format 4.

Die Regeln stehen in `v5logic.js` (`window.RPV5`), geprüft in `tests/v5logic.cjs`.
**Status: Vertrag und reine Funktionen fertig. Nicht in der App verdrahtet, keine Datenbankmigration.** Die App kennt
weiterhin höchstens Format 4 und lehnt Format-5-Reisen in Sicherungen ab (Test „Ältere App-Stände“).

## 0 · Grundsätze

1. **v5 ist eine Obermenge von v4.** Alle Felder von Format 2–4 behalten Bedeutung und Prüfung. Es kommen nur Felder hinzu.
2. **Version je Reise, keine Rückstufung.** `schemaVersion: 5` erst mit einem nicht leeren v5-Feld; einmal 5, immer 5.
3. **Unbekannt bleibt unbekannt.** Fehlende Preise, Gebühren, Kurse und Daten sind `null`, nie 0. Rechenregeln liefern dann
   `null` mit Text („Stornobedingungen klären“), keine Schätzung.
4. **Geld in Cent.** Alle Rechenregeln runden kaufmännisch auf ganze Cent; Restbeträge ergeben sich als Differenz, damit
   Summen exakt stimmen.
5. **Soll und Ist getrennt.** `payPlan` ist der Zahlungsplan (Soll), `payments` sind tatsächliche Teilzahlungen (Ist), `paid`
   bleibt deren Summe, damit Format-2/3-Rechnungen unverändert gelten.
6. **Keine Buchungsnummern außerhalb der Mappe.** Der einzige Ort für Codes ist `t.docs[i].secret`; alle anderen Ausgaben
   laufen durch `outputFilter`.
7. **Personen nur als `party`-ID.** Unbekannte IDs werden abgelehnt; `partyUses` zeigt vor dem Entfernen alle Verweise.
   Konto-Verknüpfung nur als Konto-UUID (`party[i].member`), nie E-Mail.

## 1 · Version, Speicher, Sync, Sicherung

| Bereich | Regel | Funktion |
| --- | --- | --- |
| Erkennen | ein v5-Feld (§2) nicht leer. Leere Listen, leere Objekte, leerer Text zählen nicht | `needsV5` |
| Zielversion | `max(gespeichert, 5 falls needsV5, 4 falls needsV4, 3 falls needsV3, 2)` | `targetVersion` |
| Rückstufung | abgewiesen, clientseitig und (mit der Migration) per Trigger | `assertNoDowngrade` |
| Format < 5 schreiben | keine, auch keine leeren v5-Felder; volle werden abgelehnt | `serializeTrip5` |
| Format 5 schreiben | unverändert als tiefe Kopie (Feldtreue) | `serializeTrip5` |
| Prüfen | v5-Felder nur bei `schemaVersion === 5` | `validateV5` |
| Ältere Stände | „neueres Format, nur lesen“ über `SCHEMA_MAX` (`sync-unreadable`) | `readable` |
| Anheben | nur über einen Kandidaten mit Bestätigung; übernimmt dabei `cardConfirmed` in `guestCards` (§4) | `candidate5` |
| Sicherung | Version je Reise; Stände bis Format 4 lehnen Dateien mit v5 ab (geprüft) | App |

## 2 · Felder

Ort: J = Reise-JSON. Alle Felder optional. Tabellen (T) und Geräte-Speicher (G) aus D00 §5.x sind **nicht** Teil dieses
Vertrags; sie kommen mit den Server-Paketen (Stufe E) bzw. eigenen Gerätemodulen.

### 2.1 Reiseebene (`t.*`)

| Feld | Modul | Form (Kurz) | Wichtigste Regeln |
| --- | --- | --- | --- |
| `checkoutTime` | M01 | `'HH:MM'` | |
| `tasks` | M02/M06 | `[{id, title≤120, due:{date,time?,tz?}\|null, done, doneAt?, by?, doneBy?, src?:'user'\|'rule:<id>'}]` ≤ 300 | `doneAt` (UTC) nur bei `done` |
| `deadlineAck` | M02 | `{<fristId>: {at:UTC, note≤200}}` ≤ 500 | Frist-IDs wie `deadlines()` (`pay:`, `offer:`, `cancel:` …). Wird heute schon gelesen (app/fristen.js), Schreibweg kommt mit Format 5 |
| `packing` | M03 | `{custom:[{id,label≤80,group?,who?,qty?}], hidden:[itemKey]}` | ersetzt `t.check`/`customChecks` nicht |
| `countries` | M04 | `[ISO2]` ≤ 30, eindeutig | nur bestätigte Länder |
| `idDocs` | M04 | `[{id, who, kind, label?, validUntil\|null}]` | **kein Feld für die Dokumentnummer** (unbekannte Felder werden abgelehnt) |
| `insurance` | M04 | `[{id, kind, provider, phone, from, to, who:[id]\|null, note≤200}]` | `to ≥ from` |
| `emergency` | M04 | `{homeContact:{name,phone}\|null, stayPhone, note≤500}` | keine Gesundheitsangaben |
| `variant` | M05 | `{group, label≤60, state:'offen'\|'gewaehlt'\|'verworfen', from?, at?}` | zwei `gewaehlt` je Gruppe: Hinweis, nie automatisch zurücksetzen (`variantConflicts`) |
| `assumptions` | M05 | `{fuel/acts/stay:{low,high}\|null, note}` | `low ≤ high`; `fuel` in €/l |
| `prosCons` | M05 | `{pros,cons,open:[Text≤120] ≤ 10}` | |
| `criteria` | M10 | `{must,like,avoid:[key], budgetWish, budgetMax, returnBy:{date?,time}, maxDriveMin, cancel:'frei'\|'egal', notes}` | Schlüssel nur in einer Gruppe; Wunsch ≤ Obergrenze; `t.budget` bleibt maßgeblich, `budgetMax` geht vor (`budgetMax()`) |
| `origin_tpl` | M10 | `{id, version, kind:'builtin'\|'user', at}` | |
| `guestCards` | M09 | `[{id, cardId?, name, scope:{stayId}\|{offerId}, status:'enthalten'\|'nicht'\|'unbestaetigt', evidence, persons, custom?}]` ≤ 10 | **„enthalten“ braucht einen Beleg**; Bezug genau eine Unterkunft oder ein Angebot |
| `docs` | M11 | `[{id, kind, title≤80, link:{key}, valid, file:{sha256,bytes,mime,pages?}\|null, secret:{label,value}\|{label,value:null,local:true}\|null, share:'ich'\|'mitglieder', owner?, cloud:{state,path?}}]` ≤ 200 | Datei ≤ 15 MB, gleiche Datei nur einmal je Reise; `share:'ich'` braucht `owner`; Cloud-Pfad nur bei `done`; Verknüpfung auf Gelöschtes bleibt stehen |
| `stayRef` | M07 | `{id, ver?}` | ergänzt `stayId` |
| `dayRoutes` | M12 | `{<Tagindex>: {order:[uid], km, min, src:'schaetzung'\|'osrm', at}}` | berechnete Route braucht Abrufzeit |

Aus D00 §5.x **nicht übernommen**, weil schon vorhanden: `customActs[i].geo` und `customStays[i].geo` sind Format-2-Felder
(app/ereignisse.js prüft sie bereits).

### 2.2 Verschachtelte Felder

| Ort | Feld | Form | Regeln |
| --- | --- | --- | --- |
| `offers[i]` | `kind` | `'stay'\|'transport'\|'activity'\|'package'\|'insurance'` | fehlt = `stay` (O10) |
| | `ref` | `{type:'lodging'\|'spot'\|'place'\|'transport', id}` | |
| | `history` | `[{at, price, basis, availability, src≤200, note≤200}]` ≤ 50 | aufsteigend nach Datum |
| | `minNights`, `board` | 1–60; `'none'\|'breakfast'\|'half'\|'full'\|'allinc'` | |
| | `payPlan` | `[{id, label≤60, due, amount\|pct\|rest:true}]` ≤ 12 | genau eins je Rate; höchstens ein Rest; Summe ≤ Preis (O8) |
| `offers[i]`, `ledger[key]` | `payments` | `[{id, on, amount>0, by?}]` ≤ 100 | **Summe = `paid`** auf den Cent, sonst Ablehnung |
| | `cancelTerms` | `{freeUntil:{date,time,tz}\|null, steps:[{from, pct\|fee}] ≤ 10, src, checkedAt}` | Stufen aufsteigend, `freeUntil` vor der ersten Stufe, nicht existierende Uhrzeiten (Zeitumstellung) abgelehnt |
| `transport.out/back[i]` | `terminal`, `baggage`, `who`, `arrActual` | wie M01 §5 | Terminal nur bei `flug` |
| `party[i]` | `member`, `attend` | Konto-UUID; `{actId: 'ja'\|'vielleicht'\|'nein'}` | ein Konto höchstens einmal je Reise |
| `expenses[i]` | `fx` | `{cur, orig, rate, on, src:'ecb'\|'manual'}` | `amount` bleibt Euro und führend; ohne Kurs `amount: null` |
| `items[i]` | `ref` | `{type:'spot'\|'place'\|'lodging', id, ver?}` | ergänzt `act` |

## 3 · Rechenregeln (alle rein, Cent-genau)

| Funktion | Zweck | Pflichtfälle |
| --- | --- | --- |
| `cancelFee(terms, amount, at, opt)` | Stornogebühr zum Zeitpunkt `at` | R1–R9 (M02 §6). Ohne Bedingungen: `null` + Aufgabe „Stornobedingungen klären“. Prozent auf unbekannten Preis: `null`. Zwischen „kostenlos bis“ und der ersten Stufe: `null`, nicht 0 € |
| `cancelDeadlines(key, terms)` | Fristen mit stabilen IDs `cancel:<key>:<n>` (0 = Ende kostenlos) | für `deadlines()` |
| `payPlanSchedule(plan, price)` | Raten in Euro; Rest = Preis − gerundete Raten | O7 (204,00 € + 476,00 € = 680 €), O8 |
| `payPlanStatus(plan, price, paid, today)` | Zahlungen füllen Raten nach Fälligkeit: bezahlt, teilweise, offen, überfällig, unbekannt | |
| `offerPriceState(o, today)` | aktueller Preis, Veränderung seit erstem Preisstand, Hinweise | O3, O4 (gebucht bleibt Buchungsbetrag, „Umbuchung prüfen“), O9 |
| `offerFits`, `comparable` | Mindestnächte, Belegung, Vergleichbarkeit | O5, O6 |
| `budgetVerdict(known, open, max)` | im Budget / nicht sicher / über | V2, V3 (offene Posten verhindern „im Budget“) |
| `guestCardStatus(t, ctx)` | Kartenstatus der aktuellen Unterkunft | G-R10; unter Format 5 identisch zu `cardStatusOf` |
| `idDocCheck`, `coverageGaps`, `fxToEur` | Ausweis, Versicherung, Fremdwährung | L1–L7 |
| `outputFilter(t, purpose)` | Ausgabefilter für `book`, `share`, `ics`, `plan`, `template`, `backup`, `mappe` | U-R1–U-R4 |

Korrektur gegenüber M02 R8: Der Fall „New York 12:30 Ortszeit ebenfalls noch frei“ stimmt so nicht (12:30 in New York ist
18:30 in Wien). Maßgeblich ist der **Zeitpunkt**: Derselbe Moment (17:30 Berlin = 11:30 New York) ist auf jedem Gerät noch frei;
angezeigt wird in der Zone der Frist. So getestet.

## 4 · Gästekarten beim Anheben (G-R12)

`candidate5` hebt eine Reise nur, wenn die Änderung ein v5-Feld füllt. Dabei:

- Ist `t.cardConfirmed === true` und eine Unterkunft gewählt, entsteht **ein** Eintrag `status:'enthalten'`,
  `evidence:{on:null, note:'aus früherer Bestätigung übernommen'}`, Bezug auf das aktive Angebot oder die Unterkunft.
- `cardConfirmed` bleibt unverändert gespeichert (Feldtreue), wird ab Format 5 aber nicht mehr gelesen.
- Ohne Eintrag gilt wie bisher der Katalog: Karte möglich → `unbestaetigt`, sonst `nicht`.
- Ändert sich der Status beim Anheben, wird **nichts** gespeichert (interner Fehler). Getestet für jede Katalog-Unterkunft mit
  und ohne Bestätigung gegen die echte `cost()` der App.

## 5 · Ausgabewege (D03, M11 §6)

| Zweck | Unterlagen (`docs`) | Codes (`secret.value`) | Ausweise, Versicherung, Notfallblatt | Konto-Verknüpfung |
| --- | --- | --- | --- | --- |
| `mappe` | ja | ja | ja | ja |
| `backup` | ja, ohne Dateiinhalt | nur mit ausdrücklicher Wahl | ja | ja |
| `plan`, `share`, `book`, `ics`, `template` | nein | nein | nein | nein |

Dateiinhalte stehen nie in der Reise-JSON; die Mappe-Dateien liegen getrennt (`RPFiles`, M11.1).

## 6 · Abgrenzung

- **Nicht Teil von v5:** Tabellen `profiles`, `user_prefs`, `user_templates`, `trip_polls`, `trip_comments`, `trip_events`,
  `reg_*`, `app_config` (Stufe E, jede mit eigener Migration und Freigabe). Wetter-, Geocoding- und Feiertags-Caches (Gerät).
- **Zurückgestellt (D00 §5.x):** `t.reminders`, `t.ideas`, `items[].alt` bis ein Modul sie braucht.
- `secret` mit `share:'ich'`: Der Vertrag erlaubt beide Formen (Wert in der Reise oder `local:true` ohne Wert). Welche die
  App schreibt, entscheidet M11.2 [offen, Empfehlung: `local:true`].

## 7 · Tests (`tests/v5logic.cjs`, in `npm test`)

Version und Feldtreue, Ablehnung durch die heutige App (Sicherung mit Format 5), vollständige Beispielreise gültig,
41 Ablehnungsfälle über alle Module, `partyUses`, R1–R9 inklusive Zeitzonen, O3–O10, V2/V3/V8, G-R10/G-R12 gegen die App,
L1–L7, U-R1–U-R4. Nur Node; kein Browser- oder iPhone-Test.

## 8 · Einführung in Schritten

| Schritt | Inhalt | Voraussetzung |
| --- | --- | --- |
| 1 | Vertrag + `v5logic.js` + Tests (erledigt 15.11., 45b830a) | – |
| 2 | Datenbank: neue Migration `CHECK schema_version in (2,3,4,5)`, Rückstufungsschutz bleibt; lokal `test:db`, `test:e2e` | **Freigabe Philipp** (Produktionsänderung beim Push); erledigt 15.11., 0ef05dd |
| 3 | Lese-Release: App lädt `v5logic.js`, `SCHEMA_MAX = 5`, `validateExtras` ruft `validateV5`, Speichern/Sync/Sicherung nutzen `serializeTrip5`; `F5_WRITE = false` (keine Reise wird angehoben) | Schritt 2 live; **erledigt 16.11.** (`tests/format5-app.cjs`) |
| 4 | `F5_WRITE = true` (**16.11., Freigabe Philipp**, `app/format5.js`: erledigt, Stornobedingungen, Zahlungsplan), dann Funktionen einzeln: M02.2 Storno-Vorschau und `cancel:`-Fristen, M08.2 Zahlungsplan/Teilzahlungen, M09.3 Gästekarten-Status, M02.4 Aufgaben, M05.2 Varianten-Vergleich, M10 Kriterien, M04.3, M11.2 Mappe | je eigener Schritt mit Oberfläche |

Schritt 3 berührt gemeinsame Dateien (`app/v3.js`, `app/ereignisse.js`, `app/speicher.js`, `index.html`, `sw.js`) und wird mit
dem Thread abgestimmt, der gerade die Oberfläche neu gestaltet.
