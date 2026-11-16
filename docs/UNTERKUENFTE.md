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

## Nächste Stufen (Vorschlag)

2. **Ein Unterkunftsbereich statt zwei:** Merkliste von Unterkünften (Profil) mit ihren Angeboten darunter; `stayQuote` und
   eigene Unterkunft gehen in dasselbe Angebotsmodell über; Auswahl, Buchung, Storno, Gästekarte an einer Stelle; kürzere
   Angebotskarte am Handy (Aktionen in einem Menü).
3. **Register in der Datenbank** (M07/D01): Unterkunftsprofile mit Quellen, Prüfdatum, bestätigt/unbestätigt je Merkmal,
   Dublettenschutz, `stayRef`. Braucht eine Supabase-Migration und Philipps Freigabe.
4. Erinnerung „Preis in 7 Tagen erneut prüfen“ über die Fristen (M08 F8); Lage eigener Unterkünfte (`customStays[i].geo`) für Wege.
