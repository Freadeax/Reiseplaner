# Projektstand · 13.10.2026

## Bestätigt am aktuellen Quelltext

- Statische, buildlose HTML/CSS/JavaScript-App in `index.html`.
- Sechs Reisearten, acht Bereiche, vier beispielhafte Winterorte und lokale Speicherung.
- Export/Import per JSON mit Formatversion 1; Konflikte werden übersprungen oder als Kopie angelegt.
- Stand 1.4: Bei beschädigtem `rp-trips`-JSON bleibt der ursprüngliche Inhalt unangetastet. Die Oberfläche bietet einen Rohdaten-Download und ein ausdrücklich bestätigtes Zurücksetzen; Änderungen sind bis dahin gesperrt. Ein verweigerter Browser-Speicher bleibt ein separates Problem.
- Berechnung vermeidet unbestätigte Gästekartenrabatte und berücksichtigt ein gemeinsames Top-Leistungs-Tageslimit.
- Reisen über 31 Tage werden im Datenmodell nicht abgeschnitten; Silvester-Vorlagen verwenden das Kalenderdatum.
- Stand 1.5 (Claude): Ableitungen ohne neues Speicherfeld, `rp-trips` unverändert.
  - Unterwegs-Ansicht: Bei festem Datum zeigt der Überblick „Heute“ und „Morgen“ mit Zeitfenster, Katalog-Öffnungszeiten (als unbestätigt gekennzeichnet) sowie Info- und Kartenlinks.
  - Fehlerbehebung Termine: Eine gerade laufende Reise wurde in „Meine Reisen“ als „vorbei“ angezeigt. Jetzt: „noch X Tage“, „heute geht’s los“, „unterwegs · Tag X von Y“, „Abreisetag“, „vorbei“.
  - Neuer Reiter „Mappe“: druckbare Zusammenfassung (Eckdaten, Tagesplan je Tag, Warnungen aus dem Plan-Check, Planwerte nach Kategorie, offene Kosten, Buchungsstand als Text ☐/☑). Druck-CSS blendet Navigation, Dock und Bedienelemente aus und erzwingt helle Farben.
  - Kalenderexport (`.ics`, RFC 5545: CRLF, Maskierung, Faltung nach 75 Byte): Reise als ganztägiger Termin, jeder Programmpunkt mit grobem Zeitfenster (Vormittag 9–12, Mittag 12–14, Nachmittag 14–18, Abend 18–22 Uhr, ohne Zeitzone) und `STATUS:TENTATIVE`. Punkte nach dem letzten Reisetag werden gezählt, nicht exportiert. Nur bei festem Datum.
  - „Als Text teilen“: Web-Share, sonst Zwischenablage, sonst Textfeld zum Markieren. Notizen (mögliche Buchungsnummern) nur nach Häkchen in Mappe und Text.
- Fehlende Kosten werden sichtbar benannt. Die Anzeige ist trotzdem noch keine vollständige Angebots- oder Zahlungsverwaltung.

## Ausgeführte Prüfungen

`npm test` prüft Logik, Speicherfehler und die Startansicht mit einer simulierten DOM-Umgebung; `tests/unterwegs.cjs` prüft Reisephasen, Kalenderdatei (Datumsgrenzen, Zeilenenden, Faltung mit Umlauten, Maskierung, übersprungene Punkte), Teilen-Text und die Mappe ohne Veränderung der Reise.

Am 13.10.2026 zusätzlich ausgeführt (Claude, Stand 1.5): ein Klicktest in **headless Chromium** (Playwright, `file://`, Google-Fonts blockiert) mit Desktop 1280×900 und Mobilbreite 390×844 bei simuliertem Datum 01.01.2027: Silvester-Vorlage anlegen, Heute-Block und Phase prüfen, Übersicht ohne „vorbei“, Mappe öffnen, `.ics` herunterladen und Inhalt prüfen, Notiz-Häkchen, Druckmedium (Reiter ausgeblendet), PDF-Erzeugung, kein horizontales Scrollen. Ohne JavaScript-Fehler. Das Skript liegt nicht im Repo. Das ist **kein** iPhone-/Safari-Test; Druckdialog, Web-Share und Kalender-Import in echte Kalender-Apps wurden nicht geprüft. Anbieterpreise, Verfügbarkeiten und Öffnungszeiten wurden für diesen Code-Stand nicht aktuell nachgeprüft.

## Bekannte Grenzen

- ChatGPT-Dateivorschau auf iPhone zeigt möglicherweise nur den statischen Rahmen; die App benötigt eine reguläre Browser-Umgebung.
- Browser-Speicher synchronisiert nicht geräteübergreifend; die optionale Claude-Anbindung ist Altdaten-Kompatibilität, kein tragfähiges Mehrgeräte-Konzept.
- Es fehlt ein echtes Angebotsmodell mit Preisbasis, Gebühren, Belegung, Gültigkeit, Quelle und Buchungsstatus.
- Bezahlte Beträge, Kautionen und noch offene Zahlungen werden nicht sauber getrennt.
- Strecken außerhalb des Beispielstarts Hattenhofen müssen manuell eingetragen werden.
- Kurs- und Verleihtarife für längere Reisen sowie genaue Zeitkonflikte brauchen weitere Regeln.
- Der öffentliche Katalog enthält Schätzwerte und ältere Angaben. Keine Buchungsentscheidung allein anhand dieser Werte treffen.

## Übergabe

Letzte hier vorbereitete App-Version: 1.5 (Unterwegs-Ansicht, Reisemappe, Kalenderexport, Teilen-Text). Offen dazu: Import der `.ics` in iOS-Kalender und Google Kalender testen; Druck aus Safari prüfen. Nächster technischer Schritt: reproduzierbarer Browser-Klicktest auf Desktop und Mobilansicht, anschließend Angebots- und Zahlungsmodell mit Migration der vorhandenen `rp-trips`-Daten. Bestehende Daten niemals still überschreiben. Die vorhandene HTML-Datei bleibt bis zu einer geprüften Migration die maßgebliche App-Quelle.

Zusammenarbeit: Philipp, Claude und ChatGPT arbeiten gegebenenfalls parallel. Die Regeln für nur einen `main`-Branch, eigene Pushes, Konfliktprüfung und asynchrone Übergaben stehen in `docs/COLLABORATION.md`. Der am 13.10.2026 erneut hochgeladene HTML-Anhang war bytegleich mit `index.html`; daraus entstand keine App-Änderung.
