# Reiseplaner

Ein persönlicher Planer für Ausflüge, Wochenenden und längere Reisen. Er verbindet Zeitraum, Ort, Unterkunft, Tagesplan, Packliste und eine nachvollziehbare Kostenschätzung in einer Oberfläche für Handy und Desktop.

> **Projektstatus:** Frühe Entwicklung. Die Beispielunterkünfte, Aktivitäten, Tarife und Öffnungszeiten sind keine live geprüften Angebote. Für Buchungsentscheidungen müssen Datum, Belegung, Preis und Bedingungen direkt beim Anbieter geprüft werden.

## Starten

Die App besteht derzeit aus einer Datei. `index.html` im normalen Browser öffnen oder lokal einen kleinen Webserver starten:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen. Eine Dateivorschau innerhalb der ChatGPT-iPhone-App kann die interaktive Oberfläche nicht zuverlässig ausführen. Der HTML-Anhang in ChatGPT ist daher kein App-Link.

## Was bereits geht

- Reisen mit festem, flexiblem oder offenem Zeitraum anlegen und bearbeiten
- Beispielkatalog für vier Winterregionen mit Unterkünften und Aktivitäten
- Tagesplan, Kostenübersicht, Pack- und Buchungscheckliste
- Eigene Unterkunft, Aktivität und Kostenposten ergänzen
- Einzelne oder alle Reisen als JSON-Datei sichern und ohne stilles Überschreiben wieder importieren
- Heller und dunkler Modus je nach Geräteeinstellung

## Wichtige Grenzen

- Reisekosten sind zunächst **Planwerte**, kein bestätigter Gesamtpreis. Fehlende Pflichtkosten werden als offen angezeigt.
- Die Daten liegen im Browser-Speicher des jeweiligen Geräts. Es gibt **keine automatische Synchronisation** zwischen PC und Handy. Nutze den Export für Sicherungen und den manuellen Transfer.
- Der ältere optionale `window.claude`-Speicherpfad ist eine Altfunktion und kein zugesagter Cloud-Dienst.
- Browser-Klicktests und ein echter iPhone-Test stehen noch aus. Die vorhandenen Node-Prüfungen ersetzen sie nicht.
- Keine Buchung, Zahlung oder Anbieteranfrage wird durch die App ausgelöst.

## Prüfen

Node.js ab Version 20 genügt; es gibt keine Laufzeit-Abhängigkeiten:

```bash
npm test
```

Die Prüfungen decken unter anderem Reisedauer, Datumsregeln, Gästekartenrabatte, Kosten, Sicherungsdateien und den Aufbau der Startansicht ab.

## Projektstruktur

| Pfad | Inhalt |
| --- | --- |
| `index.html` | Aktuelle App, einschließlich CSS und JavaScript |
| `tests/` | Logik- und Startprüfungen |
| `docs/STATUS.md` | Bestätigter Stand und bekannte Grenzen |
| `docs/ROADMAP.md` | Nächste Entwicklungsschritte |
| `AGENTS.md` | Arbeitsregeln für künftige Coding-KIs |

Beiträge und Fehlerberichte sind willkommen. Bitte keine privaten Reisepläne, Buchungsnummern oder exportierten Sicherungsdateien ins öffentliche Repository stellen. Eine Open-Source-Lizenz wurde noch nicht festgelegt.
