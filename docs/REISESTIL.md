# Reisestil · der Planer passt sich an, ohne einzuengen

Stand 16.11.2026, Claude (Thread „Planer an Reisestil anpassen“, Auftrag Philipp 16.11.). Markierung wie im Systemplan:
**[Code]** umgesetzt und getestet, **[Plan]** Vorschlag, **[offen]** braucht Philipps Entscheidung.

## 1 · Ziel

Ein Tagesausflug braucht keine Unterkunftssuche, eine Rundreise braucht Etappen, eine Wellness-Auszeit wenige Termine und
viel Ruhe, ein Familienurlaub Pausen und Ermäßigungen. Heute zeigt der Planer jeder Reise dieselben zehn Teile in fünf
Bereichen. Der Reisestil soll

- die **passenden Teile nach vorn holen** und Unpassendes leiser stellen, aber **nie sperren oder löschen**,
- **Vorlagen, Startansicht und Hinweise** („Als Nächstes“) an den Stil anpassen,
- ein **Tempo** (ruhig, normal, aktiv) vorschlagen, das andere Module lesen (Fixpunkte und Puffer),
- mit **einem Klick** alles wieder zeigen („Alle Teile zeigen“) und jederzeit wechselbar sein.

Grundsatz aus dem Projekt: einfacher, modularer Aufbau, der Nutzer nicht erschlägt. Alle Einstiege (Neue Reise, Vorlage,
Entdecken, Rundreise aus dem Katalog) verwenden dieselben Reisedaten, Kosten und Termine; der Stil ändert **keine**
Berechnung.

## 2 · Datenmodell

**[Code]** Der Reisestil ist das vorhandene Feld `t.type` (Freitext, ohne Prüfung in Sicherung, Sync oder Datenbank).
Es gibt kein neues Speicherfeld und keine Migration. Neu sind zwei Werte:

| `t.type` | Name | Tempo-Vorgabe | Kern | leiser |
| --- | --- | --- | --- | --- |
| `tag` | Tagesausflug | normal | Ort, Ideen, Tagesplan, Kosten | Angebote vergleichen (keine Übernachtung) |
| `wochenende` | Wochenende | normal | alles | – |
| `stadt` | Städtetrip | normal | Ideen zuerst, Tagesplan | – |
| `wellness` (neu) | Wellness-Auszeit | ruhig | Unterkunft, Angebote | – |
| `rund` | Rundreise & Roadtrip | normal | Etappen (Ort & Unterkunft), Tagesplan | – |
| `strand` | Bade- & Sommerurlaub | normal | alles | – |
| `winter` | Winter & Schnee | normal | Pakete (Katalog) | – |
| `familie` (neu) | Familienurlaub | ruhig | alles | – |

Für alle Stile gilt: **Pakete** sind leiser, solange die Reise keinen Paket-Katalog hat (heute nur „Allgäu & Tirol“).

Ältere App-Stände zeigen `wellness`/`familie` als „Reise“ und behalten den Wert beim Speichern (Freitext). Unbekannte
Werte behandelt der neue Stand wie `wochenende` (alles sichtbar, Tempo normal).

**Tempo.** `styleOf(t).pace` ist `t.pace` (Format 5, seit 16.11. auf main), wenn gültig gesetzt, sonst die Vorgabe des
Stils. Vorgaben sind bewusst zurückhaltend (Realismus statt Überladung): „ruhig“ für Wellness und Familie, sonst „normal“;
„aktiv“ gibt es nur als eigene Wahl je Reise. Das Wort „gemischt“ aus dem Entdecken-Profil zählt als „normal“.

**Anzeige-Einstellung.** „Alle Teile zeigen“ ist eine reine Darstellungs-Einstellung je Browser (`localStorage`
`rp-stil`, `{alle:true}`), wie die gemerkten Aufklappflächen (`rp-fold`). Sie gehört nicht zur Reise und wird nicht
synchronisiert.

## 3 · Regeln

1. **Nichts verschwindet, was Inhalt hat.** Ein leiser Teil wird trotzdem gezeigt, wenn er Daten enthält
   (Angebote vergleichen: `t.offers`; Pakete: `t.packageId`) oder gerade geöffnet ist.
2. **Jede Adresse bleibt gültig** (`#r-<id>-<teil>`). Leise Teile stehen im Überblick unter „Reisestil“ mit Link und
   im Bereichsmenü am Handy.
3. **Keine stillen Änderungen.** Ein Stilwechsel ändert nur die Anzeige. Dauer passt sich wie bisher nur beim Wechsel
   zu oder von „Tagesausflug“ an (`applyType`).
4. **Hinweise sind Vorschläge**, keine Pflicht, und nennen ihren Grund. Sie stehen in „Als Nächstes“ mit derselben
   Rangfolge wie andere Hinweise und verdrängen keine Warnung zu Geld oder Terminen.
5. **Keine erfundenen Fakten.** Hinweise wie „Familienermäßigungen prüfen“ sind Prüfaufträge, keine Preisangaben.

## 4 · Was der Stil steuert

| Ort | Wirkung | Status |
| --- | --- | --- |
| Neue Reise / Eckdaten | Unter „Art“: ein Satz, wie sich der Planer einrichtet, und das Tempo | [Code] |
| Bereichsleiste | Bereichsname je Stil (Tagesausflug: „Ziel & Anreise“, Rundreise: „Route & Unterkünfte“) | [Code] |
| Teilleiste | leise Teile ausgeblendet (Regel 1, 2), mit „Alle Teile zeigen“ zurück | [Code] |
| Startteil eines Bereichs | Städtetrip: Programm öffnet immer bei „Ideen“ (sonst wie bisher: Tagesplan, sobald Termine stehen) | [Code] |
| Als Nächstes | Stil-Hinweise (§5) | [Code] |
| Überblick | aufklappbarer Abschnitt „Reisestil“: Stil, Tempo, leise Teile mit Link, Umschalter | [Code] |
| Vorlagen | Wellness-Vorlage legt `wellness` an, neue Vorlage „Familienurlaub“ | [Code] |
| Entdecken | Profil „Mit Kindern“ und Übernachtung → Familienurlaub; Schwerpunkt Therme bei 1–3 Nächten → Wellness | [Code] |
| Fixpunkte und Puffer | liest `styleOf(t).pace` (Thread „Fixpunkte und Pufferzeiten“) | [Code] Schnittstelle |
| Packliste | Stil-Packlisten (Familie, Wellness, Roadtrip) – gehört dem Thread „Check- und Packlisten“ | [Plan] |

## 5 · Stil-Hinweise („Als Nächstes“)

Reine Ableitungen, rangieren als Hinweis (Rang 40–75), außer Widersprüchen in der Rundreise (Rang 22, Stufe „Wichtig“).

- **Rundreise:** ohne Etappen „Etappen festlegen“; Summe der Etappen-Nächte ≠ Reisedauer → Widerspruch nennen (beide Zahlen);
  Etappe mit über 5 Std. Fahrzeit → Zwischenstopp oder Fahrtag ohne Programm vorschlagen.
- **Tagesausflug:** Hin- und Rückfahrt zusammen über 4 Std. (aus Routen- oder Kilometer-Schätzung) → „Viel Fahrzeit für einen Tag“.
- **Familienurlaub:** Anfahrt über 2,5 Std. → Pause einplanen; ohne Regenidee → eine Idee für drinnen sammeln;
  Ermäßigungen und Familienkarten prüfen, sobald Programmpunkte mit Preis eingeplant sind.
- **Wellness-Auszeit:** Spa- und Behandlungstermine früh anfragen, sobald eine Unterkunft gewählt ist und die Reise feste Daten hat.
- **Städtetrip:** mit Auto → Parken an der Unterkunft oder Park & Ride klären; mit eingeplanten Programmpunkten →
  Tages- oder Gästeticket für Bus und Bahn prüfen.

## 6 · Nächste Schritte

1. **[Plan]** Packlisten je Stil über den Packlisten-Thread (Vorschlag: `styleOf(t).key` als Eingabe).
2. **[Plan]** Format 5: `origin_tpl` beim Anlegen aus einer Vorlage schreiben, sobald `F5_WRITE=true`.
3. **[offen]** Weitere Stile (Camping, Aktiv/Wandern, Fernreise) als eigene Werte oder als Zusatz („Bausteine“) zu
   einem Grundstil? Empfehlung: erst Rückmeldung zu den acht Stilen abwarten; Zusätze würden ein Speicherfeld brauchen.
4. **[Plan]** Backpacking/Budget-Komfort als Stil-Zusatz erst mit Format 5 (`criteria`).
