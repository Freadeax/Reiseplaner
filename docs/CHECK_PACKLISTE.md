# Check- und Packlisten nach Ziel, Reiseart und Wetter

Stand 16.11.2026 · Claude (Thread „Check- und Packlisten nach Ziel und Wetter“, Auftrag Philipp 16.11.).
Grundlage: Planung M03 (Wetter & Packen) und M04 (Ausland & Dokumente), Projektanweisungen §9 (nichts erfinden).

## 1 · Ziel

Die Checkliste einer Reise soll von selbst zur Reise passen: Dokumente fürs Zielland, Packpunkte für Reiseart, Dauer,
Anreise, Zielart und das Wetter, das tatsächlich zu erwarten ist. Alles bleibt ein Vorschlag zum Abhaken. Nichts wird als
Regel behauptet, was der Planer nicht verlässlich weiß.

## 2 · Was es vorher gab [Bestand]

- `checklist(t)` in `app/kosten.js`: Buchungsaufgaben, Grundliste je Reiseart (`PACK` in `app/basis.js`, nur Winter, Stadt,
  Strand, Standard), Packhinweise aus Unternehmungen, „Kurz vorher“ bei Winter, eigene Punkte. Häkchen in `t.check`.
- Vorlage „Fernreise“ legt Dokument-Aufgaben als eigene Punkte an. Kein Wetter, kein Länderbezug.

## 3 · Neu (dieses Paket)

Zwei neue Dateien, die bestehende Checkliste ruft sie auf:

| Datei | Inhalt |
| --- | --- |
| `packlogic.js` (`window.RPPack`) | rein und testbar: Länder-Tabelle, Reiseländer ableiten, Dokument-Vorlagen, Packregeln, Open-Meteo-Adressen, Normierung von Vorhersage und Klimawerten, Wetter-Packregeln |
| `app/packliste.js` | App-Teil: Abruf auf Knopfdruck, Gerätespeicher für Wetter, Wetterkarte in der Checkliste, Gruppen für `checklist(t)` |

### 3.1 Dokumente & Einreise (Vorlage)

- **Reiseland** wird abgeleitet, nie geraten: Format-5-Feld `t.countries` (bestätigt) › Etappen und Ziel aus dem Katalog
  (Feld `country`) › eingebaute Allgäu/Tirol-Orte › Ortssuche (Nominatim, nur auf Knopfdruck, Ergebnis nur auf dem Gerät).
  Unbekannt bleibt unbekannt: dann ein Hinweis, das Ziel festzulegen.
- Nur bei Ausland. Punkte je Lage: Gültigkeit der Ausweise bis nach Rückkehr (mit Datum), welches Dokument reicht
  (EU/Schengen vs. sonst), Einreise/Visum außerhalb von EU/Schengen, Impfungen und Gesundheit, Krankenversicherung
  (Europäische Krankenversicherungskarte in der EU, Auslandsreise-Krankenversicherung), Zahlungsmittel bei fremder Währung,
  Roaming außerhalb des EWR, mit Auto Führerschein/Fahrzeugschein, Maut/Vignette und Ausrüstungsregeln des Landes.
- **Keine Visa-, Impf- oder Mindestgültigkeitsregeln im Code.** Jeder Punkt sagt „prüfen“ und verlinkt die amtliche Quelle:
  Auswärtiges Amt, Reise- und Sicherheitshinweise (`/de/reiseundsicherheit/reise-und-sicherheitshinweise`) und Reisen und
  Gesundheit (`/de/reiseundsicherheit/reise-gesundheit`), beide am 16.11.2026 erreichbar geprüft. Für Vignetten wurde keine
  Verkaufsseite sicher bestätigt, daher nur der Text „nur beim offiziellen Anbieter kaufen“.
- Länder-Tabelle enthält nur stabile Merkmale (EU, Schengen, EWR, Euro, Währung). Unbekannte Länder: nur Code und
  allgemeine Prüfpunkte.
- Format 5 (`t.idDocs`): sobald Ausweise mit Ablaufdatum erfasst sind, zeigt die Gruppe je Dokument das Ergebnis von
  `RPV5.idDocCheck` („läuft vor der Rückkehr ab“ …). Eingabe dafür kommt mit M04.3 (`F5_WRITE`).

### 3.2 Packliste nach Ziel, Reiseart, Dauer und Anreise

Zusatzgruppe „Packliste: passend zur Reise“ mit stabilen Schlüsseln (`p-x-…`), ohne die Grundliste umzuschlüsseln
(bestehende Häkchen bleiben gültig):
- Dauer: Kleidung für N Tage, ab 8 Nächten Wäsche unterwegs einplanen.
- Anreise: Auto (Warnweste, Warndreieck, Verbandkasten; im Ausland Regeln prüfen), Bahn (Tickets offline), Flug
  (Handgepäckregeln prüfen, Ladegeräte ins Handgepäck).
- Ziel: Merkmale des Katalogziels (Therme, Berge, See, Stadt …) ergänzen passende Punkte.
- Reiseart ohne eigene Grundliste (Tagesausflug, Wochenende, Rundreise, seit Reisestil auch Wellness und Familie) bekommt wenige typische Punkte.
- Doppelte Punkte (gleiche Bezeichnung wie in der Grundliste) werden nicht wiederholt.

### 3.3 Wetter (Open-Meteo, freigegeben 23.10.)

- **Nur auf Knopfdruck** („Wetter laden“), mit Hinweis, was gesendet wird: auf 2 Nachkommastellen gerundete
  Zielkoordinaten und Reisedaten. Kein Startort, keine Personen, kein Konto.
- Bis 16 Tage voraus: **Vorhersage** je Reisetag (Temperatur, Regenwahrscheinlichkeit, Niederschlag, Schnee, Wind, UV,
  Wetter als Text). Weiter entfernt: **typische Werte** aus dem Open-Meteo-Archiv der letzten drei Jahre für dieselben
  Kalendertage, ausdrücklich „Durchschnitt, keine Vorhersage“, mit dem Datum, ab dem es eine Vorhersage gibt.
- Quelle und Abrufzeit sichtbar, ab 12 Std. „veraltet, neu laden“. Gespeichert nur auf dem Gerät (`rp-wetter`), nie in
  der Reise, nie synchronisiert (zeitabhängig).
- Wetter-Packpunkte (Gruppe „Packliste: wegen Wetter“, Schlüssel `p-w-…`), jeweils mit Grund („wegen Regen am Sa 02.01.,
  70 %“): Regen ab 60 % (Klima: an mindestens 40 % der Tage Regen), Kälte unter 5 °C, Frost unter −5 °C, Wärme ab
  25 °C, UV ab 6, Wind ab 50 km/h, Schnee; Schnee mit Auto-Anreise: Winterausrüstung/Ketten prüfen. Richtwerte, keine
  Garantie; keine Schneegarantie.
- Unbekannte Werte erzeugen keinen Punkt und werden als „keine Angabe“ gezeigt.

## 4 · Nicht in diesem Paket

- Ausblenden einzelner abgeleiteter Punkte und eigene Packpunkte je Person/Menge (`t.packing`, Format 5, M03.4) – kommt
  mit `F5_WRITE = true`.
- Wetter im Tagesplan und in „Heute“ (M03.2) – die Logik ist dafür vorbereitet (`RPPack.weatherDays`).
- Amtliche Unwetterwarnungen, Länderkarte mit Notruf/Steckdose (M04.2, braucht redaktionelle Quellen je Wert).

## 5 · Tests

`tests/packliste.cjs` (Node, ohne Netz): Normierung mit Attrappen, Horizont (W1), Regen (W2), unbekannt (W3), veraltet
(W4), Schnee + Auto (W5), stabile Schlüssel (W6), Klima über den Jahreswechsel und 29.02., Länderableitung, Dokumente
nur mit Prüfhinweis und amtlichem Link, keine Gruppe im Inland, Einbindung in `checklist(t)`. Browser: Wetterkarte mit
abgefangener Antwort in Chromium. Eine echte Abfrage gegen Open-Meteo ist aus dem Cloud-Container nicht möglich (Proxy);
sie steht als Prüfpunkt für Philipp aus.
