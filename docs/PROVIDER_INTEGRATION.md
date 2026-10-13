# Anbieterübergreifende Suche

Stand: 13.10.2026. In v2.0 **implementiert**: Anbieteradapter für Suchlinks und manuell erfasste Angebote. **Nicht implementiert**: automatische Live-Abfrage, Preisüberwachung, Anbieter-Scraping oder Buchung. Keine Zugangsdaten liegen im Repository.

## Aktuelle Adapter

| Anbieter | Verhalten im Finder | Grenze |
| --- | --- | --- |
| Booking.com | Suchlink mit Ort, festen Reisedaten, Erwachsenen und einem Zimmer | Zahl der Zimmer derzeit 1; Suchdaten beim Anbieter kontrollieren |
| Airbnb | Ortssuche mit festen Daten und Erwachsenen | Keine Kinder-/Haustieraufteilung; Suchdaten beim Anbieter kontrollieren |
| FeWo-direkt | Suchlink mit Ort, Daten und Erwachsenen | Parameter nicht als stabiler API-Vertrag zugesagt |
| CHECK24 | Hotel-Startseite | Ort, Daten und Personen selbst einstellen |
| Holidu | Anbieter-Startseite | Ort, Daten und Personen selbst einstellen |
| Direkter Gastgeber | Manuelles Angebot mit HTTPS-Quelle | Kein automatisierter Kontakt |

Alle Merkmale, Muss-Filter, Preislimits und Wünsche gelten im Planer für **erfasste Angebote**. Sie werden nicht still als beim Anbieter angewendete Filter ausgegeben. Beispielkatalog und konkrete Angebote sind getrennt. Ein Suchlink oder unbekannter API-Zugang beweist weder Verfügbarkeit noch Ausverkauf.

## Offizielle Integrationswege (Recherche, 13.10.2026)

- Booking Demand API: Managed Affiliate Partner, Vertrag/Partner Centre, API-Token und X-Affiliate-Id erforderlich. [Voraussetzungen](https://developers.booking.com/demand/docs/getting-started/prerequisites).
- Vrbo/FeWo: Expedia Rapid dokumentiert Vrbo-Inventar für entsprechend freigeschaltete Partnerprofile. Ohne Freischaltung ist Vrbo-Inventar nicht zugesagt. [Integrationsleitfaden](https://developers.expediagroup.com/rapid/lodging/vacation-rentals/vrbo-integration-guide).
- CHECK24: offizielle Partner-/Affiliate-Wege vorhanden; daraus ist keine konkrete frei zugängliche Hotel-Such-API für dieses Projekt bestätigt. [Partnerinformationen](https://www.check24.de/partner/).
- Airbnb: API-Nutzung erfolgt im Rahmen genehmigter Schnittstellenprogramme und zulässiger Zwecke. Keine für dieses Projekt freigeschaltete allgemeine Gästesuch-API nachgewiesen. [API-Bedingungen](https://www.airbnb.de/help/article/3418).

## Nächste technische Ausbaustufe (geplant, kein fertiger Backend-Dienst)

1. Anbieterzugänge und zulässigen Funktionsumfang klären. API-Schlüssel ausschließlich als Server-Secrets.
2. Serverseitigen Suchauftrag definieren: Zeitraum, Erwachsene/Kinder mit Alter, Zimmer, Ziel-ID/Koordinaten, Währung EUR, Muss-Kriterien. Orte pro Anbieter auflösen; Regionstext nicht blind als Ziel-ID verwenden.
3. Je Anbieter getrennte Adapter: Fähigkeiten, nicht konfiguriert, laden, Ergebnisse, keine Ergebnisse, Fehler, Zeitüberschreitung, begrenzte Daten. Teilfehler anderer Anbieter müssen erhaltene Ergebnisse nicht verwerfen.
4. Antwort normalisieren: Anbieter-/Unterkunfts-/Tarif-ID, Gesamtbelegung, Zeitraum, Basispreis, zwingende Gebühren inkl./extra/offen, Verfügbarkeit, Stornobedingungen mit Fristen, enthaltene Mahlzeiten, Quelle, geprüft um, gültig bis. Keine Umdeutung unbekannter Merkmale in `false` oder Preis `0`.
5. Vergleich nur gleicher Daten/Belegung/Währung. Deduplizieren nach belegbarer Unterkunftsidentität; verschiedene Tarife getrennt halten. Keine Zusammenlegung allein aufgrund ähnlicher Namen.
6. Cache und Ablauf pro Anbieter nach dessen Regeln, Fehler begrenzt wiederholen, Rate-Limits respektieren. Vor Buchungsentscheidung Preis erneut prüfen. Keine Buchungs-/Zahlungsendpunkte ohne eigenen Auftrag.
7. Mehrgeräte: eigene Nutzer, Reiseberechtigungen, serverseitige Zugriffsprüfung, Revisionen und atomare Konfliktprüfung. Browser-Sicherungen weiter anbieten; Testdaten enthalten keine privaten Reiseexporte.

## Datenmodell und Sicherung

Angebote hängen an einer Reise, enthalten ihre eigenen Daten/Personen und einen eigenen extern erfassten Buchungsstatus. `activeOfferId` ist nur die Auswahl für Planungskosten. Unterkunftswechsel kopieren keinen Angebots-Buchungsstatus. Angebotsgebühren sind Gesamtbeträge für den ganzen Aufenthalt; Kaution separat. Fehlende Pflichtkosten schließen eine sichere Budgetzusage aus.

Die Sicherung exportiert v2, importiert v1/v2 und führt v1 aufwärts ohne Änderung des gelieferten Originals. Profile bleiben pro Reise. Lokale Sicherungspunkte liegen auf demselben Gerät und sind kein Ersatz für Dateien oder eine zukünftige serverseitige Sicherung. Die Fremdänderungsprüfung reduziert Tab-Konflikte, ist mangels atomarer Browser-Speicheroperation keine Garantie bei exakt gleichzeitigen Schreibvorgängen.
