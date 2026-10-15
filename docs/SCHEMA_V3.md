# Datenvertrag v3 · Entwurf zur gemeinsamen Prüfung

Stand 15.10.2026, Entwurf von Claude, **überarbeitet nach Review-Runde 1** (ChatGPT, #8: Unterkunfts-Aggregation, kein `t.km`-Rückfall, Verteilungsbasis Teilzahlungen, Feldtreue). Berücksichtigt ChatGPTs Vorprüfung [`SCHEMA_V3_REVIEW.md`](SCHEMA_V3_REVIEW.md),
den Versionsschutz aus #8 und den Plan [`PLAN_WEITERENTWICKLUNG.md`](PLAN_WEITERENTWICKLUNG.md) (A1/A2/A6, D8–D10).
**Status: Entwurf. Nichts davon ist umgesetzt, keine Migration, keine Freigabe.** Produktionsmigrationen erst nach
ausdrücklicher Freigabe durch Philipp.

## 0 · Grundsätze

1. **Version je Reise.** `schemaVersion: 3` bekommt eine Reise erst, wenn sie mindestens ein v3-Feld enthält. Einmal v3
   bleibt v3, es gibt keine Rückstufung. Reisen ohne v3-Felder bleiben v2 und für ältere Clients voll lesbar.
2. **v3 ist eine Obermenge von v2.** Alle v2-Felder behalten Bedeutung und Validierung. `migrateTrip` nimmt 2 und 3 an,
   eine Umwandlung v2→v3 ist nicht nötig (es kommen nur Felder hinzu).
3. **Geld:** Euro als Zahl mit höchstens 2 Nachkommastellen (`Math.round(x*100) === x*100` nach Rundung auf 1e-9),
   endlich, 0 ≤ x ≤ 1e9. `null` = unbekannt, `0` = ausdrücklich kostenlos. Rechnen intern in Cent (ganzzahlig).
4. **Keine Verrechnung zwischen Posten.** Erst je Posten rechnen, dann getrennt summieren.
5. **Nichts erfinden.** Keine Flugverfügbarkeit, Stornobedingung, Erstattungszusage oder Wechselkurs aus fehlenden
   Angaben ableiten. Unbekanntes bleibt sichtbar unbekannt.
6. **Stabile IDs** für alle neuen Listeneinträge (`/^[a-z][a-z0-9]{3,40}$/`), eindeutig je Reise.

## 1 · Storno und Erstattungen (Buchungsbuch und Unterkunftsangebot)

### Felder

Je `ledger[key]` (wie v2: `status, amount, paid, due`) und je `offers[i]` (wie v2: `paid, booked, deposit`) neu optional:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `refunds` | `[{id, on:'YYYY-MM-DD', amount}]` | **tatsächlich erhaltene** Rückzahlungen, unabhängig vom Storno |
| `cancel` | `{on:'YYYY-MM-DD', fee:number\|null}` | Posten storniert; `fee` = Stornogebühr, `null` = noch unbekannt |

- `paid` bleibt die historisch gezahlte Bruttosumme (v2-Bedeutung, nie automatisch verändert).
- `netPaid = paid − Σ refunds.amount`. Validierung: `Σ refunds ≤ paid` (auch bei späteren Änderungen von `paid`).
- Erstattungen liegen **nicht** in `cancel`. Das löst Review-Punkt 2: „Storno zurücknehmen“ entfernt nur `cancel`,
  erhaltene Erstattungen bleiben als Geldbewegung erhalten und wirken weiter auf `netPaid`.
- Erstattungen ohne Storno sind erlaubt (z. B. Preisnachlass, Überzahlung).

### Rechnung je Posten

| Größe | nicht storniert | storniert, `fee` bekannt | storniert, `fee: null` |
| --- | --- | --- | --- |
| Kosten im Plan | `amount ?? Planwert` (wie v2) | `fee` | unbekannt → `openCosts`, nicht 0 |
| offen zu zahlen | `max(0, Kosten − netPaid)` | Gebühr offen `max(0, fee − netPaid)` | unbekannt |
| Erstattung offen | `max(0, netPaid − Kosten)` nur als Hinweis „Überzahlung“ | `max(0, netPaid − fee)` | unbekannt |

`financeSummary` erhält getrennt `feeOpen`, `refundOpen`, `refundsReceived`, `unknownCancel` (Anzahl).
Die bisherigen Summen `paid/activePaid/detachedPaid` bleiben brutto. `open` nutzt `netPaid`.

### Rechenfälle (Pflichttests)

| Fall | paid | refunds | fee | netPaid | Kosten | Gebühr offen | Erstattung offen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 Anzahlung < Gebühr | 20 | 0 | 100 | 20 | 100 | 80 | 0 |
| S2 Gebühr < Zahlung | 200 | 0 | 50 | 200 | 50 | 0 | 150 |
| S3 erledigt | 200 | 150 | 50 | 50 | 50 | 0 | 0 |
| S4 teilweise erstattet | 200 | 100 | 50 | 100 | 50 | 0 | 50 |
| S5 kostenfrei | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| S6 alles erstattet, Gebühr bleibt | 200 | 200 | 50 | 0 | 50 | 50 | 0 |
| S7 Gebühr nach Erstattung erhöht | 200 | 150 | 100 | 50 | 100 | 50 | 0 |
| S8 Gebühr unbekannt | 200 | 0 | null | 200 | unbekannt | unbekannt | unbekannt |
| S9 S1 und S2 in einer Reise | | | | | 150 | **80** | **150** (kein Saldo 70) |
| S10 Storno zurückgenommen nach S3 | 200 | 150 | – | 50 | Planwert 200 | 150 offen | 0 |
| U1 alte Unterkunft storniert (fee 50), neue aktiv 300 | | | | | **350** Unterkunft | je Angebot getrennt | je Angebot getrennt |
| U2 wie U1, alte Gebühr unbekannt | | | | | 300 + unbekannt (`openCosts`) | unbekannt | unbekannt |
| U3 Wechsel weg von bezahltem Angebot ohne Storno | | | | | Wechsel abgelehnt, Reise unverändert | – | – |

S10: Nach der Rücknahme gilt der Posten wieder als gebucht. Die erhaltenen 150 bleiben erhalten, deshalb sind 150 offen.
Das ist der sichere Fall aus der Review. Die UI zeigt vor der Rücknahme genau diese Vorschau.

### Unterkunft, entfernte Posten, Termine

- **Unterkunft:** Storno und Erstattungen der Unterkunft stehen **nur** am Angebot (`offers[i].cancel/refunds`).
  `ledger.stay` bleibt verboten (wie heute `LEDGER_KEY`), dadurch zählt nichts doppelt.
- **Aggregation Unterkunft (Review 1):** Unterkunftskosten = aktives Angebot (bei Storno dessen `fee`) **plus die Gebühren
  aller anderen stornierten Angebote**. Ist eine Gebühr unbekannt (`null`), kommt sie in `openCosts` und wird nicht als 0 gezählt.
  Nicht stornierte, inaktive Angebote sind nur Kandidaten und zählen 0. Damit kein bezahltes oder gebuchtes Angebot
  unbemerkt inaktiv wird, erlaubt `applyStayChange` den Wechsel weg von einem Angebot mit `booked`, `paid > 0` oder
  Erstattungen **nur zusammen mit dessen Storno** (Gebühr bekannt oder `null`). Ohne Storno wird der Wechsel abgelehnt, mit Vorschau.
  Offene Gebühr und Erstattung des alten Angebots erscheinen weiter in `financeSummary` (je Angebot, ohne Verrechnung).
- **Entfernte Posten:** Einträge mit Zahlung, Erstattung oder Storno bleiben unter ihrer ID im Buchungsbuch (heute schon
  „orphan“). Storno und Erstattung sind dort ausdrücklich erlaubt, damit Altzahlungen abgeschlossen werden können.
- **Termine:** Stornieren löscht keinen Termin. Der Plan-Check warnt „storniert, aber noch eingeplant“. Entfernen bleibt
  über `protectedPlanChange`. Neu ist, dass ein Eintrag mit `cancel` und ohne offene Gebühr oder Erstattung **nicht** mehr
  bindet. Sonst bleibt der Schutz bestehen, und offene Beträge bleiben am Eintrag sichtbar.

## 2 · Anreise in Abschnitten (Fliegen, Bahn, Transfer)

### Felder

`t.transport = { out:[segment], back:[segment] }` (optional, je höchstens 12 Abschnitte):

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `id` | ID | stabil |
| `mode` | `'auto'\|'bahn'\|'flug'\|'bus'\|'faehre'\|'mietwagen'\|'transfer'\|'taxi'\|'rad'` | Verkehrsmittel |
| `from`, `to` | Text ≤ 80 | Ort, Bahnhof oder Flughafen (bei Flug optional IATA-Code `/^[A-Z]{3}$/` in `fromCode/toCode`) |
| `dep`, `arr` | `{date:'YYYY-MM-DD', time:'HH:MM'\|null, tz:IANA\|null}` | Ortszeiten mit Zeitzone; `time:null` = unbekannt |
| `carrier`, `number` | Text ≤ 40 | z. B. Airline und Flugnummer (keine Buchungsnummer, die gehört in die Notizen) |
| `cost` | Geld\|null, `per:'pp'\|'grp'` | Planwert. Gebucht, bezahlt und fällig laufen über das Buchungsbuch unter `tr:<id>` |
| `addons` | `[{id, label, cost, per}]` | Gepäck, Sitzplatz, Parken usw., Buchungsbuch `tr:<id>:<addonId>` |
| `checkin` | `{opens:{date,time,tz}\|null, note}` | Online-Check-in (nur Eingabe) |

### Regeln

- **Keine Doppelzählung:** Ist `transport` nicht leer, rechnet `cost()` die Anreise **nur** aus den Abschnitten.
  `t.km`, `ticket` und die Routenfelder zählen dann nicht. Sie bleiben gespeichert und gelten wieder,
  wenn alle Abschnitte entfernt sind.
- **Nur abschnittseigene Grundlage (Review 2):** Ein Abschnitt hat einen Preis nur über sein eigenes `cost`. Für `auto` und
  `mietwagen` gibt es zusätzlich ein optionales eigenes `km`, das mit den Verbrauchs- und Preisangaben der Reise (`verb`, `preis`) rechnet.
  **Kein Rückfall auf `t.km`**, denn das ist die alte Zielstrecke, nicht etwa der Weg zum Flughafen. Ohne eigene Grundlage
  bleibt der Preis offen (`openCosts`).
- `t.travel` wird **nicht** automatisch umgedeutet. Es bleibt der vom Nutzer gewählte v2-Wert (`auto|bahn|flug`).
  Die Anzeige der Hauptanreise kommt in v3 aus den Abschnitten. Werte wie Bus, Fähre oder Rad landen nie in `t.travel`.
- **Zeiten:** Ankunft am Ziel = `arr` des letzten `out`-Abschnitts in dessen Zeitzone. Der Plan-Check prüft die Reihenfolge
  (`arr` ≤ `dep` des nächsten Abschnitts), Umstiegszeiten (Hinweis unter 45 Min. bei Flug→Flug, unter 10 Min. bei Bahn),
  Datumswechsel und Termine vor der Ankunft. Fehlende Zeiten bedeuten „ungeprüft“, nicht „passt“.
- **Flughafenpuffer:** Hinweis, wenn die Ankunft am Abflughafen (vorheriger Abschnitt) weniger als 2 Std. vor einem
  Flug liegt. Das ist ein Richtwert, als solcher benannt.
- `.ics`: jeder Abschnitt mit bekannten Zeiten als Termin in UTC. Ohne Zeit erscheint er als ganztägiger Hinweis.

### Rechenfälle (Pflichttests)

| Fall | Erwartung |
| --- | --- |
| T1 Auto → Flug → Transfer, alle Kosten bekannt | Anreisekosten = Summe der Abschnitte inkl. Addons, km/ticket nicht zusätzlich |
| T2 Flug ohne Preis | Anreise „Preis offen“ in `openCosts`, nicht 0 |
| T3 Hinflug 22:30 → 01:15 Ortszeit +1 Std. | Ankunftsdatum +1, Plan-Check „Ankunft nach Mitternacht“ |
| T4 Umstieg 30 Min. Flug→Flug | Hinweis „knapper Umstieg“ |
| T5 alle Abschnitte entfernt | Rechnung wieder wie v2 (km/ticket), Reise bleibt v3 |
| T6 Gepäck gebucht und bezahlt | Buchungsbuch `tr:<id>:<addon>` mit Status/Zahlung, offener Rest korrekt |
| T7 Auto (ohne eigenes km) → Flug, `t.km = 400` gesetzt | Zubringer-Preis offen, **nicht** 400 km gerechnet; `t.travel` unverändert |

## 3 · Ausgaben unterwegs und Aufteilung (D8/D9)

### Felder

- `t.party = [{id, name}]`: Mitreisende für die Aufteilung (Name ≤ 40, lokal; **keine** Konto-IDs, keine E-Mail).
  Höchstens 20 Personen. Darf leer sein: dann gibt es keine Aufteilung.
- `t.expenses = [{id, on, label, amount, cat, paidBy:partyId|null, split:{among:[partyId], mode:'equal'|'shares', shares?:{id:n}}}]`
  sind Ausgaben **zusätzlich** zum Plan, also unterwegs und nicht im Buchungsbuch. Höchstens 2000 Einträge.
- `ledger[key].paidBy`, `offers[i].paidBy` (optional, `partyId`): wer eine geplante Buchung bezahlt hat.

### Regeln

- **Keine Doppelzählung:** Ausgaben stehen nie für Buchungsbuch-Posten oder die Unterkunft. Für deren Bezahlung gibt es
  `paidBy`. Der Rückblick zeigt „Plan“, „gebucht/bezahlt“ und „zusätzlich ausgegeben“ getrennt.
- **Verteilungsbasis (Review 3): nur tatsächlich geflossenes Geld.** Je Posten wird `netPaid` (Zahlungen minus erhaltene
  Erstattungen) auf die Beteiligten verteilt, nicht der Planwert. Bei Ausgaben ist es `amount`. Zahler ist `paidBy`, eine
  erhaltene Erstattung mindert dessen Zahlung. Je Person gilt `Saldo = Σ eigene Zahlungen − Σ Anteile`, die Summe aller Salden ist exakt 0.
- **Offene Beträge getrennt:** Was noch an Anbieter zu zahlen ist (`open`, `feeOpen`) und erwartete Erstattungen
  (`refundOpen`) erscheinen getrennt als „noch offen, Aufteilung bei Zahlung“. Sie gehen nicht in den Personenausgleich ein.
  Beispiel: Plan 1000, A zahlt 200, hälftig → B schuldet A 100; 800 noch an den Anbieter offen.
- **Anteile:** `mode:'equal'` oder `mode:'shares'` mit ganzzahligen Gewichten 1–100 je `among`-Person. Ohne Regel gilt
  `equal` über alle `party`. Cent-Verteilung nach dem Verfahren des größten Rests: zuerst `floor(betrag × w / W)`,
  dann je 1 Cent an die größten Reste, bei Gleichstand in der Reihenfolge von `among`.
- **Ohne Zahler:** Eine Ausgabe oder Zahlung ohne `paidBy` zählt in den Summen, aber nicht im Personenausgleich. Es gibt einen Hinweis.
- Der Ausgleich ist ein Vorschlag mit möglichst wenig Überweisungen (größter Gläubiger gegen größten Schuldner) und wird nicht gespeichert.
- Eine Person mit Zahlungen oder Anteilen lässt sich nicht löschen, nur umbenennen (Validierung).

### Rechenfälle (Pflichttests)

| Fall | Erwartung |
| --- | --- |
| P1 A zahlt 100, Aufteilung A/B gleich | B schuldet A 50 |
| P5 Plan 1000, A zahlt 200, A/B hälftig | B schuldet A 100; „800 noch an Anbieter offen“ getrennt; Summe der Salden 0 |
| P6 10 € mit Gewichten A2/B1/C1 | 5,00/2,50/2,50; 10,01 € → 5,01/2,50/2,50 (größter Rest A) |
| P2 A zahlt 10, Aufteilung A/B/C | Anteile 3,34/3,33/3,33, Rest an A (erste in `among`), Summe exakt 10 |
| P3 Unterkunft storniert, Gebühr 450; B zahlte 600, erhielt 150 zurück | B hat netto 450 bezahlt, Kosten 450, Anteil je 225 bei zwei Personen → A schuldet B 225 |
| P4 Ausgabe ohne `paidBy` | zählt in „zusätzlich ausgegeben“, nicht im Ausgleich, Hinweis |

## 4 · Tagebuch und Bewertungen (D10)

- `t.journal = { 'YYYY-MM-DD' | 'd<index>': {text ≤ 2000, mood?:1–5} }`. Bei offenen Daten wird der Tagesindex verwendet.
  Nach dem Festlegen von Daten bleiben die Einträge erhalten und werden angezeigt, eine automatische Umschlüsselung gibt es nicht.
- `t.ratings = { actId: 1–5 }` gilt für Unternehmungen der Reise. Der Katalog nutzt das später für C5 als „gefiel euch“,
  nur lokal und nur als Vorschlag.

## 5 · Version, Speicher, Sync, Sicherung

| Bereich | Regel |
| --- | --- |
| Erkennen | `needsV3(t)` = eines der Felder `refunds`, `cancel`, `transport`, `party`, `expenses`, `paidBy`, `journal`, `ratings` vorhanden und nicht leer. Beim Speichern wird dann `schemaVersion = 3` gesetzt, danach nie zurück |
| Validierung | `validateExtras` prüft v3-Felder nur bei `schemaVersion === 3`. In einer v2-Reise werden v3-Felder abgelehnt |
| Lokal | Gast- und Kontospeicher unverändert (`rp-trips`, `rp-u:<id>`). v3-Reisen liegen dort wie v2 |
| Sync | `toServer` erzwingt nicht mehr `schemaVersion = 2`, sondern übernimmt 2 oder 3. Alte Clients sehen v3 als „online nicht lesbar“ (E1, `58d7a87`) und überschreiben nicht |
| Datenbank | neue Migration: CHECK `schema_version in (2,3)` **und** Trigger gegen Rückstufung (E2). Bestehende Migrationen bleiben unverändert |
| Sicherung | `BACKUP_VERSION` bleibt gleich, die Version steht je Reise. Neue Clients lesen v2 und v3, alte lehnen eine Datei mit v3 **vollständig** ab (kein Teilimport). Beim Export erscheint ein Hinweis, wenn v3-Reisen dabei sind |
| Konfliktkopie | `resolve('copy')` erhält die Version der Kopie (v3 bleibt v3) |
| **Feldtreue (Review 4)** | Jeder Client, der v3 liest, schreibt **alle** v3-Felder unverändert zurück, auch wenn die zugehörige Funktion in seiner UI noch fehlt oder abgeschaltet ist. Bearbeitet werden nur die betroffenen Felder: kein Neuaufbau aus einer Feldliste, kein Kürzen bei Export, Import, Kopie, Wiederherstellung oder Sync. Bekannte Stelle, die heute Daten verwerfen würde: `setLedger` löscht einen Eintrag, wenn er „leer“ wirkt (`offen`, kein Betrag, nichts bezahlt, keine Frist). In v3 gilt ein Eintrag mit `refunds`, `cancel` oder `paidBy` nie als leer. Der Server-Trigger schützt nur vor der Rückstufung 3→2, nicht vor Feldverlust innerhalb von v3. Dagegen helfen Pflichttests (§7) |

## 6 · Einführung in Schritten

1. **E2 Migration** (CHECK `in (2,3)` + Downgrade-Trigger), DB-Tests lokal und in CI, Freigabe Philipp, live.
2. **Lese-Release:** Clients lesen und validieren v3, schreiben aber noch nur v2, weil die UI keine v3-Felder anbietet. Dieser Stand ist eine Weile live, damit gecachte Alt-Clients aktualisiert werden.
3. **Funktionen einzeln freischalten:** zuerst Storno/Erstattung (§1), dann Anreise-Abschnitte (§2), dann Ausgaben/Aufteilung (§3) und Tagebuch (§4). Jeder Schritt mit eigenen Tests und Browser-Klickweg.

## 7 · Testplan

- Node: S1–S10, U1–U3, T1–T6, P1–P6. Validator-Grenzen (Cent, null/0, Summen, IDs, Größen, `__proto__`-Schlüssel), `needsV3` und „bleibt v3“.
- **Feldtreue:** Eine v3-Vorlage mit allen Feldern durchläuft jede v2-Bearbeitung (`setField` je Feld, `setLedger` je Feld inklusive „leeren“, Termine verschieben und entfernen, Angebot bearbeiten, Eckdaten, Spartipp übernehmen), Export→Import, Konfliktkopie, Sicherungspunkt-Wiederherstellung und `toServer`. Danach müssen alle v3-Felder tief gleich sein.
- Transport: Auto→Flug mit gesetztem `t.km` darf den Zubringer **nicht** mit `t.km` berechnen (T7).
- Sicherung: v2-Datei in neuem Client, v3-Datei in neuem Client, v3-Datei in **altem** Client (Komplettablehnung), Rundlauf und Wiederherstellung.
- Sync (`tests/sync-unreadable.cjs` erweitern): v3-Zeile in altem Client, Konfliktkopie v3, Push v3.
- DB (`test:db`): CHECK 3 erlaubt, 4 abgelehnt, Rückstufung 3→2 abgelehnt (auch für Eigentümer), v2 unverändert.
- Browser: Storno mit Vorschau, Rücknahme-Vorschau (S10), Flugabschnitte inklusive Zeitzone, Aufteilung bei 320 px.

## 8 · Offene Fragen an ChatGPT und Philipp

1. Soll eine Stornogebühr **über** der ursprünglichen Buchungssumme erlaubt sein (Validierung oder nur Hinweis)?
2. `party`-Namen sind persönliche Daten. Reicht „nur in der Reise, nie im Teilen-Text ohne Zustimmung“?
3. Umstiegs- und Flughafen-Richtwerte (45 Min., 10 Min., 2 Std.) als feste Hinweise oder einstellbar?
4. Reihenfolge der Freischaltung in Schritt 3: zuerst Storno oder zuerst Fliegen (Philipps Wunsch)?
