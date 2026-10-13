# Projektstand · 13.10.2026

## Bestätigt am aktuellen Quelltext

- Statische, buildlose HTML/CSS/JavaScript-App in `index.html`.
- Sechs Reisearten, acht Bereiche, vier beispielhafte Winterorte und lokale Speicherung.
- Export/Import per JSON mit Formatversion 1; Konflikte werden übersprungen oder als Kopie angelegt.
- Berechnung vermeidet unbestätigte Gästekartenrabatte und berücksichtigt ein gemeinsames Top-Leistungs-Tageslimit.
- Reisen über 31 Tage werden im Datenmodell nicht abgeschnitten; Silvester-Vorlagen verwenden das Kalenderdatum.
- Fehlende Kosten werden sichtbar benannt. Die Anzeige ist trotzdem noch keine vollständige Angebots- oder Zahlungsverwaltung.

## Ausgeführte Prüfungen

`npm test` führt 21 Logikprüfungen und einen Startansicht-Test mit einer simulierten DOM-Umgebung aus. Es ist **kein** echter Browser- oder iPhone-Test. Anbieterpreise, Verfügbarkeiten und Öffnungszeiten wurden für diesen Code-Stand nicht aktuell nachgeprüft.

## Bekannte Grenzen

- ChatGPT-Dateivorschau auf iPhone zeigt möglicherweise nur den statischen Rahmen; die App benötigt eine reguläre Browser-Umgebung.
- Browser-Speicher synchronisiert nicht geräteübergreifend; die optionale Claude-Anbindung ist Altdaten-Kompatibilität, kein tragfähiges Mehrgeräte-Konzept.
- Es fehlt ein echtes Angebotsmodell mit Preisbasis, Gebühren, Belegung, Gültigkeit, Quelle und Buchungsstatus.
- Bezahlte Beträge, Kautionen und noch offene Zahlungen werden nicht sauber getrennt.
- Strecken außerhalb des Beispielstarts Hattenhofen müssen manuell eingetragen werden.
- Kurs- und Verleihtarife für längere Reisen sowie genaue Zeitkonflikte brauchen weitere Regeln.
- Der öffentliche Katalog enthält Schätzwerte und ältere Angaben. Keine Buchungsentscheidung allein anhand dieser Werte treffen.

## Übergabe

Letzte hier vorbereitete App-Version: 1.3. Nächster technischer Schritt: reproduzierbarer Browser-Klicktest auf Desktop und Mobilansicht, anschließend Angebots- und Zahlungsmodell mit Migration der vorhandenen `rp-trips`-Daten. Bestehende Daten niemals still überschreiben. Die vorhandene HTML-Datei bleibt bis zu einer geprüften Migration die maßgebliche App-Quelle.

Zusammenarbeit: Philipp, Claude und ChatGPT arbeiten gegebenenfalls parallel. Die Regeln für nur einen `main`-Branch, eigene Pushes, Konfliktprüfung und asynchrone Übergaben stehen in `docs/COLLABORATION.md`. Der am 13.10.2026 erneut hochgeladene HTML-Anhang war bytegleich mit `index.html`; daraus entstand keine App-Änderung.
