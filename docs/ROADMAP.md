# Roadmap

Die Reihenfolge schützt zuerst Daten, Geld und Termine. Ein Punkt gilt erst nach Code- und Browserprüfung als abgeschlossen.

1. **Lauffähigkeit belegen:** Start, Navigation, Reiseanlage, Import/Export und Fehlerzustände in einem echten Browser sowie auf einem iPhone prüfen. Fehler aus der ChatGPT-Dateivorschau klar von App-Fehlern trennen.
2. **Kostenmodell:** Konkrete Angebote separat von Unterkunftsprofilen speichern. Preisbasis, Nächte, Personen, Gebühren, Quelle und Gültigkeit erfassen. Bezahlte Beträge, Restzahlung, Reserve und Kaution getrennt zeigen.
3. **Silvesterreise:** Vergleich weniger tatsächlich passender Optionen für 30.12.2026–03.01.2027, zwei Personen ab 73110, Obergrenze 1.500 €. Preise und Verfügbarkeit datumsbezogen belegen.
4. **Allgemeiner Finder:** Kombinierbare Filter, Kandidatenvergleich und andere Regionen; unbekannte Merkmale nicht als Treffer darstellen.
5. **Gemeinsame Nutzung:** Erst mit Benutzerkonten, serverseitiger Zugriffskontrolle, konfliktfester Synchronisation und Datenmigration. Browser-Speicher allein reicht dafür nicht.

## Ideen außerhalb der Reihenfolge (Claude, 13.10.2026)

Ergänzungen, die keine Daten gefährden; Umsetzung nach Absprache mit Philipp:

- **Erledigt in 1.5:** Unterwegs-Ansicht, Reisemappe (Druck/PDF), Kalenderexport, Teilen-Text. Echte Gerätetests stehen aus.
- **Anreisetag mit Uhrzeit:** optionale Abfahrts- und Check-in-Zeit, damit der Kalender und der Plan-Check echte Zeiten statt grober Fenster nutzen (braucht Speicherfeld, also Version + Migration).
- **Wetterbedingte Alternativen:** pro Tag eine „Plan B“-Unternehmung (Indoor) markieren und in der Mappe mitdrucken.
- **Reise-Rückblick:** Nach Status „Vorbei“ tatsächliche Ausgaben gegen Planwerte stellen und als Erfahrungswert für die nächste Reise vorschlagen (hängt am Kostenmodell aus Punkt 2).
- **Offline-Fähigkeit:** Service Worker, damit die App unterwegs ohne Netz öffnet; Daten bleiben ohnehin lokal.

Unterkunfts- und Aktivitätsdaten brauchen künftig Quellen mit Prüfdatum und Gültigkeit. Vorlagen sind Planideen und keine buchbaren Pauschalangebote.
