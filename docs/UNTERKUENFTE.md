# Unterkünfte · Ausbau

Stand 16.11.2026 (Claude, Thread „Unterkünfte und ihre Funktionen erweitern“). Grundlage: Projektanweisungen §8, §9, §11,
Planung M07 (Register) und M08 (Angebote).

## Bestand vor dem Ausbau

- **Ort & Unterkunft** (`app/ansichten.js` `tUnterkunft`): Allgäu-Beispielkatalog `STAYS` mit Preisstichproben, eigene Unterkunft
  (`customStays`), ein einzelnes Feld „Angebotspreis gesamt“ (`stayQuote`), Anfragetext, Gästekarte.
- **Reisefinder** (`app/ereignisse.js` `tSuche`): Muss/Wunsch-Filter, Suchlinks zu Booking, CHECK24, FeWo-direkt, Airbnb, Holidu,
  konkrete Angebote (`offers`) mit Gebühren (inklusive/extra/unbekannt), Vergleich bis vier, Auswahl für die Planung
  (`activeOfferId`, Buchungsstatus wird bei Wechsel nicht übernommen), Buchung/Zahlung/Storno (Format 3/5).
- Format 5 hatte `offers[i].history`, `minNights`, `board` samt Rechenregeln (`v5logic.js` `offerPriceState`, `offerFits`,
  `comparable`), aber keine Oberfläche.
- Kein Unterkunftsregister mit Quellen und Prüfdatum für alle Nutzer (`stayRef` ungenutzt).

## Stufe 1 · Angebote vollständig nutzen (umgesetzt, `app/angebote.js`)

| Funktion | Regel |
| --- | --- |
| Preis neu prüfen | Knopf an der Angebotskarte. Öffnet den Anbieter-Link, neuer Preis oder „unverändert“ wird ein Preisstand (`history`). Erster Stand = ursprüngliche Erfassung, bleibt bei max. 50 Ständen erhalten. Prüfdatum nicht in der Zukunft und nicht vor dem letzten Stand. |
| Gebucht bleibt gebucht (O4) | Gebuchte, bezahlte oder stornierte Angebote behalten Preis, Verfügbarkeit und Prüfdatum; der neue Stand ist nur Hinweis („aktuell günstiger: Umbuchung prüfen“). |
| Verpflegung (O2) | `board` je Angebot. Senkt den Essensansatz je Person und Nacht (Planannahme): Frühstück 7 €, Halbpension 7 € + 55 % des Rests, Vollpension Tagesansatz − 5 €, All inclusive ganzer Ansatz. Hinweis in der Kostenzeile. |
| Mindestnächte (O5) | `minNights` je Angebot. Karte nennt Widersprüche; „Für Planung auswählen“ lehnt zu kurze Reisen ab; bei gewählter Unterkunft kein Speichern über der Reisedauer. |
| Vergleich (O6) | Hinweis „nicht vergleichbar: Personen/Nächte“, zusätzliche Zeilen je Nacht, je Person und Nacht, Verpflegung, Mindestnächte, Preisverlauf. Offene Gebühren bleiben offen. |
| Link einfügen (F4) | Anbieter, Daten und Personen werden aus der Adresse gelesen (Booking, Airbnb, FeWo-direkt; CHECK24/Holidu nur Anbieter). Die Seite wird nicht abgerufen, Preise bleiben Handeingabe. |

Speichern läuft über `f5Commit` (Format 5, Anheben nur nach Bestätigung). Test: `tests/angebote.cjs` (31 Prüfungen, Node).
Browser-Sichtprüfung bei 390 px Breite in Chromium (Blatt, Karte, Vergleich). **Kein iPhone-Test.**

## Stufe 2 · Unterkunft-Reiter, Arten, Portale, Register (umgesetzt)

Philipp 16.11.: „Komplexes Ausbauen des kompletten Unterkunft-Reiters, Anbindung an mehrere und Erweitern des Registers,
vor allem mit exotischen Sachen. Hotel, aber auch Airbnb usw.“

| Teil | Datei | Inhalt |
| --- | --- | --- |
| Register | `lodging.js` (`window.RPLodging`) | 28 Arten in 6 Gruppen (Hotel & Pension, Ferienwohnen, Land & Hof, Camping & Glamping, Berg & Hütte, Ausgefallen: Baumhaus, Iglu, Hausboot, Burg/Schloss, Kloster, Leuchtturm, Schlaffass …) mit Prüfpunkten; 16 Portale; 9 echte Betriebe mit Quelle und Prüfdatum, ohne Preise |
| Reiter | `app/unterkuenfte.js` | Stand „Eure Unterkunft“ mit nächstem Schritt; Merkliste zeigt Art, Angebote je Unterkunft, „Angebot erfassen“; Arten mit Portalen und Register-Einträgen (Entfernung ab Abfahrtsort, Luftlinie); „Auf die Merkliste“ ohne Auswahlwechsel |
| Eigene Unterkunft | `app/ereignisse.js` `stay-add` | Art wählbar; leerer Preis = „Preis offen“ statt 0 € |

**Anbindung, ehrlich:** Es gibt keine Live-Schnittstelle (PROVIDER_INTEGRATION: Booking/Expedia nur für freigeschaltete
Partner, CHECK24/Airbnb ohne offene Such-API). Booking, Airbnb und FeWo-direkt öffnen mit Ziel, Datum und Personen
(geprüftes Linkformat); alle anderen Portale öffnen ihre Startseite. Angebote aus neuen Portalen laufen als Anbieter
„Direkt beim Gastgeber“ mit Link, damit ältere App-Stände die Daten weiter lesen.

**Register-Regeln (tests/lodging-Teil in `tests/unterkuenfte.cjs`):** stabile IDs `lg-…`, jede Quelle HTTPS mit Prüfdatum und
Art (offiziell/magazin/portal); „bestätigt“ nur mit offizieller Quelle; keine Preise oder Verfügbarkeit im Register;
Lage als ungefährer Ortspunkt. Einträge 16.11.2026 über Websuche geprüft (Domain und Seiten des Anbieters sichtbar), die Seiten
selbst waren aus der Cloud nicht abrufbar. Hofgut Hopfenburg: Unterkunftsarten nur laut Magazin, als Hinweis markiert.

Datenfelder: `customStays[i].kind`, `.reg`, `.geo` (optional; customStays werden nicht feldweise geprüft). Bleibt beim
Auswählen eines Angebots erhalten (`applyOffer`). Speicherort Register: Datei (Philipp 17.11.).

## Stufe 3 · Reisefinder im Reiter (umgesetzt 17.11.)

Philipp 17.11.: „Ja!“ zum Eingliedern. Der Teil „Angebote vergleichen“ (`suche`) ist kein eigener Bereich mehr:

- `uAngebote(t)` (`app/unterkuenfte.js`) zeigt im Reiter den Abschnitt `#u-angebote` mit Schnelllinks (Booking, Airbnb,
  FeWo-direkt) und `tSuche(t,{embedded:true})`: Filter, Angebote, Vergleich und „Eure Daten“ (Verlauf), ohne Nummern.
- `app/aufbau.js`: Ziel-Teile `['unterkunft','angebote']`, Tab `suche` entfernt. Alte Links `#r-…-suche` leitet
  `go()` (`app/routing.js`) auf `-unterkunft` um und scrollt zu `#u-angebote`.
- Nächster Schritt in „Eure Unterkunft“ heißt jetzt „Zu den Angeboten“.

## Nächste Stufen (Vorschlag)

3. **Feinschliff Angebote:** `stayQuote` als Angebot führen; kürzere Angebotskarte am Handy (Aktionen in einem Menü).
4. **Register wachsen lassen:** weitere geprüfte Einträge je Art und Region (Quelle Pflicht), Korrektur melden (M07 F7).
5. **Register in der Datenbank** (M07/D01): Tabellen mit Verlauf und Dublettenschutz, `stayRef`. Braucht eine
   Supabase-Migration und Philipps Freigabe.
6. Erinnerung „Preis in 7 Tagen erneut prüfen“ über die Fristen (M08 F8); Lage eigener Unterkünfte für Wege nutzen.
