# Wege und Tageskarte im Tagesplan (Konzept und Stand)

Stand 16.11.2026 · Thread „Routen und Karten in Tagesplanung“ · Modul `app/wege.js` (Teil nach `app/tagesplan.js`)

## Ziel

Der Tagesplan zeigt nicht nur *was* an einem Tag passiert, sondern auch, *wie weit* die Punkte auseinanderliegen und wie viel
Zeit die Wege kosten. Damit wird ein Tag realistisch statt durchgetaktet: Wegzeiten zählen zur Tageslast, und eine
schematische Karte zeigt auf einen Blick, ob ein Tag kreuz und quer führt.

Kostenlos und werbefrei: keine Google-Schnittstellen, keine Kartenkacheln eines fremden Dienstes, kein Schlüssel.

## Bausteine

| Baustein | Funktion | Quelle der Zahlen |
|---|---|---|
| Stationen eines Tages | `dayStops(t, day)`: Unterkunft (bzw. Etappe der Rundreise) → Punkte in Planreihenfolge → zurück | Lage: `a.geo`, Katalog (`actGeo`), sonst Ortssuche auf Knopfdruck (Gerätespeicher) |
| Wege | `dayWays(t, day)`: je Abschnitt km und Minuten, Summen, Anzahl unbekannter Abschnitte | Schätzung (Luftlinie × 1,3) oder berechnet (OSRM) |
| Verkehrsmittel vor Ort | Auto, zu Fuß, Fahrrad; je Reise auf diesem Gerät gemerkt | Standard: Auto bei Anreise mit dem Auto, sonst zu Fuß |
| Berechnen | Knopf „Wege berechnen“: fehlende Orte bei Nominatim suchen (≥ 1,1 s Abstand, höchstens 8 je Klick), dann **eine** Anfrage an routing.openstreetmap.de für den ganzen Tag | FOSSGIS-OSRM `routed-car`, `routed-foot`, `routed-bike` |
| Zeitstrahl | `wegZeile(t, day, uid)`: kleine Zeile „↓ ≈ 8 km · ca. 20 Min. mit dem Auto“ vor jedem Punkt | aus `dayWays` |
| Tageskarte | `wegeSection(t, day)`: SVG-Skizze (Unterkunft ⌂, nummerierte Punkte, Linie), Liste der Abschnitte, Summen, Links | ohne Kacheln, funktioniert offline |
| Tageslast | `dayLoad` zieht die Wegminuten von den 10 Planstunden ab (`ways`) | aus `dayWays` |
| Format 5 | `dayRouteRecord(t, day)` erzeugt einen gültigen `dayRoutes`-Eintrag (SCHEMA_V5 M12) | erst mit `F5_WRITE = true` speichern |

## Regeln

- **Unbekannt bleibt unbekannt.** Ein Punkt ohne Lage erzeugt keinen Weg „0 Min.“, sondern „Lage unbekannt“; die Summe sagt
  „mindestens“, solange Abschnitte fehlen.
- **Schätzung sichtbar.** Jeder Abschnitt trägt „geschätzt“ oder „berechnet am …“. Auto: Luftlinie × 1,3, Ø 50 km/h im
  Nahbereich (ab 30 km Luftlinie Ø 70 km/h) plus 10 Min. Parken/Fußweg; zu Fuß Ø 4,5 km/h; Fahrrad Ø 15 km/h plus 5 Min.
  Berechnete Autofahrten bekommen dieselben 10 Min. Parken/Fußweg dazu, damit beide Wege vergleichbar bleiben.
- **Gleicher Ort:** Punkte unter 300 m Luftlinie gelten als „am selben Ort“ (kein Weg).
- **Ohne Unterkunftslage** dient die Ortsmitte des Ziels (`destGeo`) als Ausgangspunkt, sichtbar markiert („Ortsmitte“).
- **Anreisetag:** die Wege beginnen an der Unterkunft; die Anreise selbst zählt wie bisher über `driveByDay`. **Abreisetag:**
  der letzte Weg führt zurück zur Unterkunft, die Heimfahrt zählt ebenfalls über `driveByDay`.
- **Netz nur auf Knopfdruck.** Übertragen werden nur Koordinaten bzw. der gesuchte Ortsname. Ergebnisse (Orte und Routen)
  werden nur auf diesem Gerät gemerkt (`rp-wege-cache-v1`, höchstens 300 Orte und 60 Routen), nicht in der Reise.
  Routen sind an die genauen Koordinaten gebunden; ändert sich die Reihenfolge, gilt wieder die Schätzung.
- **Namensnennung:** „Wege: © OpenStreetMap-Mitwirkende, Routing FOSSGIS“ unter der Karte.
- **Karten-Apps:** Link „In Karten-App öffnen“ (Google-Maps-URL, kein API-Aufruf, Koordinaten statt Namen wenn bekannt) und
  je Abschnitt „OSM“ (openstreetmap.org/directions mit FOSSGIS-Engine).

## Grenzen

- Keine Verkehrslage, keine Fahrpläne. Öffentliche Verkehrsmittel vor Ort sind nicht berechenbar; dafür bleibt der Link zur
  Karten-App.
- Die Karte ist eine Skizze ohne Hintergrund (Straßen, Gelände). Kartenkacheln wären möglich (OSM-Kacheln erlauben nur
  geringe Nutzung), gehören aber zur offenen Proxy-Entscheidung (PLAN_SYSTEME §8).
- routing.openstreetmap.de ist ein freiwillig betriebener Dienst ohne Zusage; bei Ausfall bleibt die Schätzung.

## Nächste Schritte

1. Mit `F5_WRITE = true`: berechnete Tagesroute auf Wunsch in `t.dayRoutes` speichern (geteilt mit Mitreisenden), Reihenfolge
   optimieren („kürzeste Reihenfolge vorschlagen“, nur als Vorschlag mit Übernehmen/Verwerfen, gebuchte Uhrzeiten fest).
2. Reisemappe/PDF: Wegesumme je Tag und Skizze übernehmen (Offline-Thread).
3. Eigene Unterkunft mit Adresse: Lage einmal suchen und in der Unterkunft speichern (heute nur im Gerätespeicher).
