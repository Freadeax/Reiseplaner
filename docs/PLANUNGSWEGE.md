# Planungswege (Claude, 16.11.2026)

Auftrag Philipp 16.11.: Planungsmodule in die Tiefe ausbauen, mehr Planungsmöglichkeiten und bessere Bedienung.
Grundlage Projektanweisungen §6 (mehrere Einstiege, dieselben Reisedaten, Orientierung, Eingaben erhalten, Rückgängig).
Code `app/planungswege.js`, Test `tests/planungswege.cjs` (Node, kein Browser-/iPhone-Test).

## Sechs Einstiege (`PW_WEGE`)

| Weg | Adresse | Ergebnis |
| --- | --- | --- |
| Schritt für Schritt | `#planen-schritte` | 7 Schritte: Art, Ziel, Zeit, Budget, Anreise/Heimkehr, Wünsche, Prüfen. Fortschrittspunkte antippbar, Zurück, „Direkt zum Überblick“, „Neu beginnen“ mit Rückgängig. Landet im Überblick der Reise. |
| Alles auf einer Seite | `#neu` | bisheriges Formular; teilt den Entwurf `UI.draft` mit „Schritt für Schritt“ (Wechsel verliert nichts) |
| Ziel finden | `#entdecken` | unverändert |
| Unterkunft steht schon | `#planen-unterkunft` | eigene Unterkunft (Name, Ort, Link, Preis je Nacht/gesamt/unbekannt, Merkmale laut Anbieter) + Zeitraum, Personen, Obergrenze |
| Erlebnis zuerst | `#planen-erlebnis` | eine oder mehrere Unternehmungen, optional mit Datum (wird zum Reisetag), Preis offen erlaubt; landet im Tagesplan |
| Mit Vorlage starten | `#planen` (Vorlagen aufgeklappt) | vorhandene Vorlagen |

`#planen` ist die Übersicht der Wege. Startseite ohne Reisen zeigt dieselben sechs Karten; „+ Neue Reise“ in „Meine Reisen“ führt nach `#planen`.
Der Entwurf liegt bis „Reise anlegen“ nur in `UI.pw`/`UI.draft` und `sessionStorage` (`rp-planen-v1`, nur dieser Tab), nie in `rp-trips`. Neu laden behält die Eingaben; die Wegeübersicht bietet „Weiter planen“ oder „Verwerfen“.

## Wünsche & Grenzen (Format 5 `t.criteria`, M10)

- Muss / Gern / Lieber nicht je Wunsch (15 Schlüssel `PW_KRIT`, passend zur Reiseart vorsortiert), Wunschbudget (≤ Obergrenze `t.budget`), höchstens Fahrzeit einfach, Heimkehr-Uhrzeit (bei festen Daten mit Abreisedatum), kostenlos stornierbar, Notiz.
- Ohne Wünsche entsteht eine Reise wie bisher (kein Formatwechsel). Mit Wünschen wird die neue Reise über `RPV5.candidate5` als Format 5 angelegt; in bestehenden Reisen schreibt das Blatt „Wünsche ändern“ über `f5Commit` (mit Bestätigung beim Anheben).
- Überblick der Reise: Ebene „Wünsche & Grenzen“ (`fold('pw-wuensche')`) gleicht ab: Obergrenze/Wunschbudget (offene Angaben = keine sichere Aussage), Fahrzeit (berechnet / geschätzt / unbekannt), Unterkunftsmerkmale Sauna/Küche/Frühstück (eigene Unterkunft ohne Haken = unbestätigt), Storno. Unbekanntes zählt nie als „passt“.

## Unbekannter Unterkunftspreis

Eigene Unterkunft mit `priceOpen:true`: Kostenzeile „Preis noch offen“ (`open`), Karte zeigt „Preis offen“, `openCosts` meldet „Unterkunftspreis unbekannt“. Vorher wurde ein leerer Preis als 0 € gerechnet (Formular „Eigene Unterkunft“ tut das weiterhin; Kandidat für die nächste Runde).

## Geteilte Dateien (nur Einhängezeilen)

`index.html` (Skript), `app/routing.js` (Adressen `planen*`), `app/unterseiten.js` (`SUB_LEVEL0`), `app/ansichten.js` (`render`, Startseite, `vNeu`-Link, `tUeber`, Unterkunftskarte), `app/kosten.js` + `app/reise.js` (offener Preis), `app.css` (Abschnitt am Ende), `tests/browser.cjs` + `tests/offline-browser.cjs` (Einstieg über `#planen`).

## Nächste Schritte

1. Wünsche an Entdecken übergeben (Muss-Wünsche als Filter, Fahrzeitgrenze als Umkreis) und Ergebnis in die angefangene Reise übernehmen statt neu anzulegen.
2. Formular „Eigene Unterkunft“ und Angebotsvergleich: Preis „unbekannt“ statt 0 €; Merkmale als bestätigt/unbestätigt.
3. Vergleich mehrerer Varianten gegen dieselben Wünsche (M05.2).
4. Eigene Vorlagen aus einer Reise speichern (M10.5).
