# Reiseplaner

Ein persönlicher Planer für Ausflüge, Wochenenden und längere Reisen. Er verbindet Zeitraum, Ort, Unterkunft, Tagesplan, Packliste und eine nachvollziehbare Kostenschätzung in einer Oberfläche für Handy und Desktop.

> **Projektstatus:** Frühe Entwicklung. Die Beispielunterkünfte, Aktivitäten, Tarife und Öffnungszeiten sind keine live geprüften Angebote. Für Buchungsentscheidungen müssen Datum, Belegung, Preis und Bedingungen direkt beim Anbieter geprüft werden.

## Starten

Die App besteht derzeit aus einer Datei. `index.html` im normalen Browser öffnen oder lokal einen kleinen Webserver starten:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen. Über http/https ausgeliefert, merkt sich die App ihre Dateien und startet danach auch ohne Netz. Auf dem iPhone lässt sie sich über „Zum Home-Bildschirm“ wie eine App ablegen. Als Datei geöffnet gibt es keinen Offline-Start. Eine Dateivorschau innerhalb der ChatGPT-iPhone-App kann die interaktive Oberfläche nicht zuverlässig ausführen. Der HTML-Anhang in ChatGPT ist daher kein App-Link.

## Was bereits geht

- Reisen mit festem, flexiblem oder offenem Zeitraum anlegen und bearbeiten, leer oder mit einer Vorlage (Wochenende, Städtereise, Tagesausflug, Sommer-, Winterurlaub; Silvester als ausgefülltes Beispiel)
- Beispielkatalog für vier Winterregionen mit Unterkünften und Aktivitäten
- Tagesplan, Kostenübersicht, Pack- und Buchungscheckliste
- Eigene Unterkunft, Aktivität und Kostenposten ergänzen
- Einzelne oder alle Reisen als JSON-Datei sichern und ohne stilles Überschreiben wieder importieren
- Bei beschädigten lokalen Speicherdaten wird das Schreiben gesperrt; Rohdaten lassen sich vor einem bewussten Zurücksetzen herunterladen
- Heller und dunkler Modus je nach Geräteeinstellung
- Unterwegs-Ansicht: Während einer Reise mit festem Datum zeigt der Überblick, was heute und morgen geplant ist
- Reisemappe: kompakte Zusammenfassung zum Drucken oder Speichern als PDF, Kalenderdatei (`.ics`) für den Tagesplan und Kurzfassung als Text zum Teilen. Notizen werden nur auf ausdrücklichen Wunsch aufgenommen
- Plan B bei schlechtem Wetter: Indoor-Ideen aus dem Katalog, die zum Datum passen, zum Beispiel unter Beachtung von Wochentag und Feiertagsöffnung
- Offline-Start und App-Icon (Service Worker, Manifest)
- Zahlungsbuch: Für jeden Posten lassen sich Buchungsstatus, tatsächlich gebuchter Betrag, Bezahltes und Fälligkeit erfassen. Überfällige Zahlungen erscheinen im Plan-Check und im Kalender
- Katalog-Unterkünfte nutzen, wo vorhanden, Preisabfragen der Buchungsportale vom 14.10.2026 je Saison, mit Quelle und Hinweis, ob eure Daten genau abgefragt wurden. Sonst gelten gekennzeichnete Schätzwerte
- Packliste ergänzt sich aus den geplanten Unternehmungen (z. B. Bademantel für die Sauna, Grödel für die Klamm)

## Reisefinder (v2.0)

In jeder Reise gibt es den Reiter **Reisefinder**:

1. Ort, Unterkunftslimit, Fahrzeit, Bewertung und Unterkunftsart eingeben; Merkmale als **Muss**, **Wunsch** oder **Egal** markieren.
2. Booking, Airbnb und FeWo-direkt über vorbereitete Suchlinks öffnen; CHECK24 und Holidu über ihre Startseiten. Suchdaten dort kontrollieren. Die App ruft keine Live-Angebote ab.
3. Eigene Filter benennen und speichern, oder Wellness/Ruhe, FeWo/Ausflüge und Flexibel/Komfort als Startpunkt verwenden.
4. Tatsächlich gefundene Angebote mit Zeitraum, Personen, Preisbasis, Quelle, Prüfdatum, Gebühren, Verfügbarkeit und Tarifbedingungen erfassen.
5. Angebote merken, bis zu vier vergleichen und eine Unterkunft bewusst in die Kostenplanung übernehmen. Das löst keine Buchung aus.

Unbekannte Merkmale erfüllen kein Muss. Offene Pflichtgebühren erfüllen kein Preislimit. Angebot und Bezahlung sind getrennt: bereits bezahlte Beträge bleiben Reisekosten, Kautionen stehen separat. Der Vergleich verwendet dieselbe Kostenfunktion wie der Planer; die restlichen Reiseausgaben bleiben Planwerte.

**Sicherung:** Format v2 enthält auch Angebote und Profile; v1-Dateien werden beim Import aufwärts migriert. Alte Programme können v2-Dateien nicht importieren. Fünf lokale vorherige Speicherstände können als Sicherungsdatei heruntergeladen und kontrolliert importiert werden. Bei einem erkannten neueren Stand aus einer anderen Browseransicht wird das Schreiben blockiert; offene eigene Änderungen exportieren und neu laden. Das ist keine atomare Mehrbenutzersynchronisation. Browser löschen/Zurücksetzen kann auch diese lokalen Kopien entfernen.

Anbieterzugänge, Quellen und nächste Integrationsschritte: [docs/PROVIDER_INTEGRATION.md](docs/PROVIDER_INTEGRATION.md).

## Passwortgeschützte Sicherungen

Über **Mit Passwort sichern** könnt ihr alle Reisen oder eine einzelne Reise als verschlüsselte JSON-Datei herunterladen. Mindestens 12 Zeichen verwenden, besser eine lange, einzigartige Passphrase. Datei und Passwort getrennt aufbewahren: Es gibt keine Passwort-Wiederherstellung.

Die Verarbeitung bleibt im Browser. AES-256-GCM verschlüsselt den Inhalt; der Schlüssel wird mit PBKDF2-SHA-256 (600.000 Durchläufe) und zufälligem Salz abgeleitet. Jede Datei erhält einen neuen zufälligen Initialisierungsvektor. Falsches Passwort und beschädigte Dateien werden abgelehnt, bevor etwas importiert wird.

**Wichtig:** Nur die Exportdatei ist verschlüsselt. Die lokalen Reisen, Sicherungspunkte und gewöhnlichen JSON-Exporte bleiben unverschlüsselt. Die Funktion benötigt Web Crypto, üblicherweise über HTTPS oder localhost; ohne Unterstützung wird sie nicht durch eine unsichere Ersatzlösung ersetzt. Passwortschutz ist keine Cloud-Synchronisation und keine Absicherung eines bereits kompromittierten Geräts. Kein unabhängiges Sicherheitsaudit.

Zum Wiederherstellen **Sicherung importieren** wählen und das Passwort eingeben. Danach zeigt die Vorschau neue, identische und abweichende Reisen mit derselben ID sowie Angebote/Profile. Erst die anschließende Entscheidung importiert neue Reisen oder erstellt zusätzliche Kopien. Bestehende Reisen werden nicht überschrieben. Bei Speicherfehlern wird der Import zurückgenommen und nicht als erfolgreich gemeldet.

Das innere Reiseformat bleibt v2 (v1 wird weiterhin akzeptiert). Die separate verschlüsselte Hülle hat Version 1; ältere Appstände können diese nicht öffnen. Maximal 5 MB Reiseinhalt bzw. 8 MB verschlüsselte Datei. Weitere technische Details: [docs/BACKUP_SECURITY.md](docs/BACKUP_SECURITY.md).

## Weitere Grenzen

- Reisekosten sind zunächst **Planwerte**, kein bestätigter Gesamtpreis. Fehlende Pflichtkosten werden als offen angezeigt.
- Die Daten liegen im Browser-Speicher des jeweiligen Geräts. Es gibt **keine automatische Synchronisation** zwischen PC und Handy. Nutze den Export für Sicherungen und den manuellen Transfer.
- Der ältere optionale `window.claude`-Speicherpfad ist eine Altfunktion und kein zugesagter Cloud-Dienst.
- Frühere Browserprüfungen sind im Status dokumentiert. Für den neuen Finder ist der Klicktest erweitert; sein aktuelles CI-Ergebnis steht bei GitHub Actions. Ein echter iPhone-/Safari-Test steht aus.
- Keine Buchung, Zahlung oder Anbieteranfrage wird durch die App ausgelöst.

## Prüfen

Node.js ab Version 20 genügt; es gibt keine Laufzeit-Abhängigkeiten:

```bash
npm test
npm run test:browser   # Klicktest in Chromium, braucht Playwright; ohne Playwright übersprungen
```

Die Prüfungen decken unter anderem Reisedauer, Datumsregeln, Gästekartenrabatte, Kosten, Sicherungsdateien, beschädigten Browser-Speicher, Reisephasen, Kalenderexport und den Aufbau der Startansicht ab.

## Projektstruktur

| Pfad | Inhalt |
| --- | --- |
| `index.html` | Aktuelle App, einschließlich CSS und JavaScript |
| `tests/` | Logik-, Start- und Browser-Klickprüfungen |
| `sw.js`, `manifest.webmanifest`, `*.png` | Offline-Start und App-Icon |
| `docs/STATUS.md` | Bestätigter Stand und bekannte Grenzen |
| `docs/ROADMAP.md` | Nächste Entwicklungsschritte |
| `docs/COLLABORATION.md` | Abstimmung und sicheres Arbeiten zu dritt auf `main` |
| `AGENTS.md` | Arbeitsregeln für künftige Coding-KIs |

Beiträge und Fehlerberichte sind willkommen. Bitte keine privaten Reisepläne, Buchungsnummern oder exportierten Sicherungsdateien ins öffentliche Repository stellen. Eine Open-Source-Lizenz wurde noch nicht festgelegt.


