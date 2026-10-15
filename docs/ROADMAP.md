# Roadmap

## Touch und Dialoge · 15.10.2026 (ChatGPT, #8)

Audit-Touchbefunde außerhalb der dichten SVG-Karte nachgebessert; Dialoge mit Titel, initialem Fokus, Tab-Grenzen und Rückkehr zum Auslöser. Node/Build/Artefakt grün, neue Chromium-Prüfung noch offen. Kosten-/Notizpaket und .chk-Überlaufkorrektur bei Claude. Nach Integration gemeinsamen Browserlauf/Audit wiederholen; kleine Kartenpunkte haben weiterhin die große Ergebnisliste als Alternative.

## Gezielte Vervollständigung · 15.10.2026

Direkte Aktionen aus der Übersicht für offene Aktivitätspreise/Dauern und Aktivitätsfilter mit Zählern/Reset implementiert. Node geprüft, neuer Chromium-Klickweg im Testskript, Ausführung offen. Keine neuen Speicherfelder. Parallel bei Claude: genaue Uhrzeiten mit gebuchten Termin-Signaturen; vor weiterem Eingriff in Zeiten aktuelle Übergabe lesen.

## Serie: Unterkunft, Kostenposten, nächste Schritte · ChatGPT

Paket 1 Orts-/Unterkunftswechsel mit Kandidat, Vorschau und Verpflichtungsschutz implementiert; initiale Auswahl direkt, erneute gleiche Auswahl erhält Buchungszustand. Paket 2 eigene Kostenposten bearbeiten/entfernen mit Zahlungsbindung ebenfalls implementiert und Node-geprüft. Paket 3 nächste Aktionen in der Übersicht implementiert, rein abgeleitet und ohne Buchungsfreigabe. Neue Chromium-Abnahmen offen. Kein Konto-/E-Mail-/Cloudflare-Eingriff.

## Manuelle Planaktionen · ChatGPT, #8

Verschieben/Entfernen/Leeren/Paketübernahme/Eckdaten durch vorhandene Verpflichtungen geschützt, echte Kalendertage statt nur Tagesindex verglichen. Node geprüft, neue Chromium-Abnahme offen. Noch kein allgemeiner Storno-/Umbuchungsablauf. Weitere Unterkunfts-/Ortswechselwege und zusätzliche Zeit-/Transferregeln bleiben nächste Pakete.

## Maßgebliche offene Punkte · 14.10.2026

Siehe [OPEN_POINTS.md](OPEN_POINTS.md): konsolidierte Entscheidungen/Claude-Fragen/Prioritäten. Ältere Abschnitte unten sind historische Fortschrittsnotizen. Normale Exporte ohne Passwort und GitHub Pages als aktuelles Hosting sind die neueren Entscheidungen. Drei Verpflegungsszenarien implementiert; vollständige Preisunsicherheiten/Erstattungen bleiben offen. Zahlungsanrechnung entfernter Posten korrigiert. SMTP, Produktionskonten, iPhone/Safari, Konto-Lebenszyklus und Backup/Restore haben Vorrang vor Live-Anbietererweiterungen.


## Ergänzung Datensicherung · 14.10.2026

Passwortgeschützte Exportdateien und lesbare Konfliktvorschau implementiert (#4). Import-Speicherfehler melden keinen falschen Erfolg mehr. Kein Eingriff in Claudes Saisonpreise #3. Nächste Prüfungen: Chromium-CI, echter iPhone-/Safari-Rundlauf, Austausch einer passwortgeschützten Datei zwischen zwei Geräten. Browser-Daten bleiben unverschlüsselt, keine automatische Synchronisation. Technische Beschreibung in BACKUP_SECURITY.md.

Die Reihenfolge schützt zuerst Daten, Geld und Termine. Ein Punkt gilt erst nach Code- und Browserprüfung als abgeschlossen.

1. **Lauffähigkeit belegen:** Start, Navigation, Reiseanlage, Import/Export und Fehlerzustände in einem echten Browser sowie auf einem iPhone prüfen. Fehler aus der ChatGPT-Dateivorschau klar von App-Fehlern trennen.
2. **Kostenmodell:** Konkrete Angebote separat von Unterkunftsprofilen speichern. Preisbasis, Nächte, Personen, Gebühren, Quelle und Gültigkeit erfassen. Bezahlte Beträge, Restzahlung, Reserve und Kaution getrennt zeigen.
3. **Silvesterreise:** Vergleich weniger tatsächlich passender Optionen für 30.12.2026–03.01.2027, zwei Personen ab 73110, Obergrenze 1.500 €. Preise und Verfügbarkeit datumsbezogen belegen.
4. **Allgemeiner Finder:** Kombinierbare Filter, Kandidatenvergleich und andere Regionen; unbekannte Merkmale nicht als Treffer darstellen.
5. **Gemeinsame Nutzung:** Erst mit Benutzerkonten, serverseitiger Zugriffskontrolle, konfliktfester Synchronisation und Datenmigration. Browser-Speicher allein reicht dafür nicht.

## Ideen außerhalb der Reihenfolge (Claude, 13.10.2026)

Ergänzungen, die keine Daten gefährden; Umsetzung nach Absprache mit Philipp:

- **Erledigt in 1.5/1.6:** Unterwegs-Ansicht, Reisemappe (Druck/PDF), Kalenderexport, Teilen-Text, Plan B bei schlechtem Wetter (abgeleitet, ohne Speicherfeld), Offline-Start. Echte Gerätetests stehen aus.
- **Anreisetag mit Uhrzeit:** optionale Abfahrts- und Check-in-Zeit, damit der Kalender und der Plan-Check echte Zeiten statt grober Fenster nutzen (braucht Speicherfeld, also Version + Migration).
- **Indoor-Merkmal für eigene Unternehmungen:** damit auch selbst angelegte Ideen als Plan B erscheinen (Speicherfeld, also Version + Migration).
- **Reise-Rückblick:** Nach Status „Vorbei“ tatsächliche Ausgaben gegen Planwerte stellen und als Erfahrungswert für die nächste Reise vorschlagen (hängt am Kostenmodell aus Punkt 2).
- **Hosting über https** (z. B. GitHub Pages), damit Offline-Start und Homescreen auf dem iPhone nutzbar sind. Entscheidung bei Philipp, da das Repo öffentlich ist (Daten bleiben lokal).

Unterkunfts- und Aktivitätsdaten brauchen künftig Quellen mit Prüfdatum und Gültigkeit. Vorlagen sind Planideen und keine buchbaren Pauschalangebote.


## Fortschritt v2.0

- Allgemeiner Finder mit Muss-/Wunschfiltern, individuellen Profilen, manuellen Angeboten, Merk-/Vergleichsliste implementiert. Regionsunabhängige Suche; der ältere Katalog bleibt beispielhaft.
- Konkretes Unterkunftsmodell, Preisbasis und Gebühren sowie Unterkunftszahlungen/Kaution implementiert. Zahlungsbuch anderer Reiseposten und echtes Szenariomodell bleiben offen.
- Sicherung v2 + v1-Migration, lokale Sicherungspunkte und Schutz vor erkannten Fremdänderungen implementiert. Keine Cloud-Synchronisation.
- Nächste Schritte: neuen Chromium-Klicktest am Push prüfen; iPhone/Safari; Suchlinkparameter direkt beim Anbieter prüfen; Claudes angekündigte allgemeine Startseite/Beispiele.
- Live-Suche erst mit Anbieterzugängen, serverseitiger Normalisierung und Datenzugriffskonzept; Details in PROVIDER_INTEGRATION.md.

## Saisonpreise (Claude, #3)

- Feratel-/Deskline-Inserate (Berktold, Schwandenhof, BergBuddies, Haus im Wäldle, Alpenrösle) aus einer Umgebung mit Zugriff auf `deskline.net` abfragen oder beim Gastgeber anfragen.
- Holidu-Inserate nur mit exaktem Partnerpreis übernehmen.
- Stichproben regelmäßig erneuern (Prüfdatum steht in `PRICE_CHECKED`). Ältere Werte als veraltet kennzeichnen.
- Ersatz für das verschwundene Inserat Haus Haug wählen.


## Preisprüfung · ChatGPT, 14.10.2026 (#3)

Exakte Daten/Belegung vor Saisonvergleich, Prüfhinweise ab 31 Tagen und sichtbare Dauerhochrechnung implementiert. Die Frischegrenze ist eine interne Prüfregel. Höchste Saisonstichprobe ist keine Preisobergrenze. Nächster Ausbau: feste Endreinigung von variablen Nachtpreisen trennen, Mindestnächte und Saisonwechsel berücksichtigen, Recherchewerte erneuern. Keine automatische Anbieterabfrage.
## Zahlungsbuch (Claude, #5)

- Erledigt in v2.3: Status, Buchungsbetrag, bezahlt und Fälligkeit für alle Posten außer der Unterkunft. Gebuchte Beträge ersetzen Planwerte.
- Offen: Teilzahlungen mit Datum, Erstattungen nach Storno, Reise-Rückblick (tatsächliche Ausgaben gegen Plan), Erinnerungen über Kalender hinaus.


## Öffentliche Anwendung · 14.10.2026

Verbindlich: für beliebige Nutzer, private Reisen als Standard, gezielte Zusammenarbeit. Produkt-/Datenvertrag und Freigabekriterien: PUBLIC_PRODUCT.md. Normale Sicherungen ohne Passwort; verschlüsselte Altimporte erhalten. Allgemeine neue Reisen ohne persönlichen Startort. Backend/Hosting in Claude #6: private Konten zuerst, danach Reise-Mitgliedschaften und Einladungen mit serverseitigen Rechten, Revisionskonflikten und geprüfter Wiederherstellung. Live-Suche, Szenariokosten, exakte Termine und öffentlicher Betrieb sind getrennte Arbeitspakete, keine schon erfüllten Funktionen.

## Hosting & Backend (Claude, #6)

- **Erledigt in v3.0 (Code und lokale Tests):** GitHub-Pages-Workflow, Supabase-Schema mit RLS, Konten, Offline-Abgleich mit Versionskonflikt, Freigaben per Einladung und bewusste Übernahme der Gast-Reisen.
- **Nächste Schritte:**
  1. Produktionsprojekt und Pages einrichten (Philipp).
  2. CI-Ergebnis am Push prüfen.
  3. Echte E-Mail über SMTP testen.
  4. iPhone/Safari: Anmelden, Passwort-Reset und Offline.
- **Danach:**
  - Besitzerwechsel (atomar).
  - Kontolöschung und Datenexport je Konto.
  - Anzeigenamen statt E-Mail.
  - Optional Realtime als Benachrichtigung.
  - Strukturierte Tabellen für Angebote und Zahlungen, sobald Abfragen über mehrere Reisen nötig sind.
  - Betreiber-Backup mit Restore-Probe.
- **Später:** Wechsel zu Cloudflare Pages nach `docs/HOSTING_MIGRATION.md`, mit Übergangsphase und demselben Supabase-Projekt.


## Umkreis-Katalog (Claude, #7)

- **Erledigt in v3.1 (Code und lokale Tests):** Katalog in der Datenbank (54 Ziele, 255 Attraktionen), Suche nach Abfahrtsort und Kilometerbereich, Themen, Saison, Zwischenstopps, Ausflüge vom Ziel, Tagesgerüst, „Preis offen“ statt „kostenlos“.
- **Nächste Schritte:**
  - Migrationen in der Produktion bestätigen.
  - iPhone-Test mit Standort.
  - Katalog in dünn besetzten Regionen ausbauen (Nordwesten, Osten, Benelux, Dänemark, Polen).
- **Ideen:**
  - echte Fahrzeiten per Routing-Dienst mit Freigabe;
  - Bahn-Erreichbarkeit als Thema;
  - Merkliste „Irgendwann mal“ je Konto (eigene Tabelle mit RLS);
  - moderierte Nutzervorschläge;
  - Saisonkalender, also wann ein Ziel am schönsten ist, als Übersicht;
  - „Rundreise bauen“: mehrere Ziele hintereinander mit Etappen-km.

## Buchungsschutz · 14.10. abends

Spartipp-Vorschau, Schutz gebuchter/angefragter Termine und bezahlter Angebote sowie konsistente Restzahlung umgesetzt. Philipp bestätigt eigenen iPhone-Test. Seine verbleibenden Aufgaben: PHILIPP_TODO.md. Entwicklung übernimmt weiterhin Konto-Lebenszyklus, Restore und exakte Zeiten; neue Schemaarbeit vorher im Issue ankündigen.


## Gemeinsame Design-/Katalogrunde · 14.10.2026

Erste warme CSS-Basis implementiert, Details und kreative nächste Pakete in DESIGN_CATALOG.md. Claude: Katalog-/DB-Ausbau; ChatGPT: visuelle Struktur und UI-Abnahme. Erst neue Issue-Einträge abgleichen, dann Regenalternativen und ruhige Tageskombinationen mit Kosten-/Terminregeln konkretisieren. E-Mail/Cloudflare bis Do/Fr am PC zurückgestellt; vorhandene Anbindung erhalten.
## Suche & Tagesplan (Claude, #8)

- **Erledigt in v3.2:** Katalog v2, Merkliste, Textsuche/Sortierung, Mini-Karte, Saisonstreifen, Rundreise, Tagesauslastung mit Fahrzeit, Tage tauschen, Lücken füllen, Tagesroute, Packhinweise.
- **Ideen:**
  - Merkliste ins Konto übernehmen, sobald Konten genutzt werden (eigene Tabelle mit RLS).
  - Etappen nachträglich umsortieren.
  - Echte Fahrzeiten per Routing-Dienst (Freigabe nötig).
  - Bahn-Erreichbarkeit als Thema.
  - Dauer für eigene Unternehmungen als eigenes Eingabefeld: implementiert (ChatGPT, #8), mit Indoor, Packhinweisen und offenem Preis. Neue Chromium-Abnahme steht noch aus.
  - Bestehende eigene Ideen bearbeiten: implementiert mit Vorschau, unveränderten IDs/Terminen, Verpflichtungsschutz und abgesichertem Löschen (ChatGPT, #8); neue Chromium-Abnahme offen.

## Kalenderexport · 15.10.2026 (ChatGPT, #8)

Mitternachts-/Jahresüberlauf und Textmaskierung korrigiert; genaue Uhrzeit ohne bekannte Dauer ohne erfundenes Ende. Node/Build/Artefakt grün. Chromium-Abnahme offen (lokales Binary fehlt). Mit Claudes angekündigter Zeitzonen-/Routing-Arbeit in icsData zusammenführen, Regressionen erhalten; anschließend Zielzeitzonen und Sommerzeitwechsel gesondert prüfen.

## Drei Oberflächen · 15.10.2026 (ChatGPT, #8)

Reisebuch / Planungsstudio / Kompakt implementiert, über „Darstellung“ umschaltbar; lokale Präferenz, jeweils Hell/Dunkel. Neue Startseite, Preiskennzeichnung, Hauptnavigation und Reiseabschnitte; Studio mit Desktop-Seitenleiste. Node/Build/Artefakt bestanden. Neue Browserwege für alle Darstellungen vorbereitet, Chromium-/visuelle Abnahme noch offen. Danach gezielt Rückmeldungen zu Dichte/Navigation sammeln; mobile Aufgaben und Details weiter vereinheitlichen, bestehende Konto-/Routing-Arbeit erhalten.

## Module vereinheitlichen · 15.10.2026 (ChatGPT, #8)

Mobile Bereichsauswahl/Modulorientierung und Checkliste mit Suche/Status/Gruppenzählern umgesetzt. Entfernen von Checkbox getrennt, Sprunglink ohne Routensprung. Node/Build/Artefakt grün; neue Browserwege offen. Nächster Schritt: Claudes Audit-Befunde gezielt korrigieren, danach Formulare/Fehlerzustände weiterer Module angleichen.
