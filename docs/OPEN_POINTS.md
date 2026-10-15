# Entscheidungen und offene Arbeitspakete

Stand 14.10.2026 · ChatGPT · Ausgangspunkt `8bf665f`.
Gelesen: Issues #1–#7 einschließlich Claude-Kommentaren, AGENTS, COLLABORATION, STATUS, ROADMAP, README und PUBLIC_PRODUCT; aktueller App-Code. Private Claude-Chats wurden nicht abgerufen. Der angehängte HTML-Stand 1.3 ist älter und ersetzt main nicht.

## Festgelegt

| Thema | Verbindlicher Stand | Bezug |
| --- | --- | --- |
| Zielgruppe | Öffentliche Anwendung für beliebige Nutzer; Reisen standardmäßig privat | #6, PUBLIC_PRODUCT |
| Gast und Login | Gastmodus bleibt; Konto ergänzt dauerhaftes Speichern/Gerätewechsel; bewusste Gastübernahme | #6 |
| Sicherungen | Normaler Export/Import ohne Passwort; verschlüsselte Altimporte erhalten | neuere Entscheidung ersetzt #4-Exportoberfläche |
| Zusammenarbeit | Nur main, eigene fertige Commits pushen, vor Push fremde Änderungen prüfen; Abstimmung in Issues | AGENTS/COLLABORATION |
| Hosting | Aktuell GitHub Pages; Cloudflare nur für E-Mail. Cloudflare Pages bleibt spätere Option | neuere Korrektur in #6 |
| Backend | Bestehendes Supabase-Projekt und eingespieltes Schema weiterverwenden | #6; keine erneute Kernmigration |
| Preise | Quellen/Prüfdatum, exakte Belegung und Zeitraum; alte/skalierte Werte kennzeichnen | #3 |
| Kosten | Zahlungen sind keine Einsparung, Kaution separat; offene Gebühren verhindern Budgetzusage | Projektanweisungen |

## Erfragte Punkte und ihr Ergebnis

| Frage von Claude | Ergebnis / noch offen |
| --- | --- |
| Eigene Saisonwerte außerhalb Silvester? | #3 umgesetzt als recherchierte Stichproben; weitere Inserate und Erneuerung offen |
| GitHub Pages aktivieren? | Laut letzter Übergabe online; nicht mehr als grundsätzliche Produktentscheidung offen |
| Cloudflare Pages statt GitHub Pages? | Durch Entscheidung „Cloudflare nur E-Mail“ ersetzt |
| Passwortschutz für normale Sicherung? | Durch neuere Entscheidung ohne Passwort ersetzt; Altimport bleibt |
| Silvester-Beispiel über Budget ändern? | Weiter offen. Keine automatische Kürzung oder Änderung von Zeitraum/Budget; konkrete Angebote fehlen |
| Welche Domain und welcher SMTP-Dienst? | Offen; DNS/SMTP-Konfiguration und Versand an echte externe Nutzer fehlen |
| Wer hat das Produktionsschema eingespielt? | **Geklärt:** die GitHub-Integration (verzögert), nicht der SQL-Editor (Philipp, 14.10.). Die Katalog-Migrationen kamen ebenfalls über die Integration. Nicht erneut ausführen |
| Funktioniert Produktion mit echten Konten/iPhone? | Philipp meldet erfolgreichen eigenen iPhone-Test am 14.10. abends. Einzelprotokoll nicht angegeben; SMTP/Mehrkonten separat abnehmen |

## Priorisierte nächste Arbeiten

| Priorität | Arbeit | Stand / Abnahme |
| --- | --- | --- |
| ~~P0~~ | GitHub-Variable RP_SUPABASE_URL und Live-Konfiguration | **Erledigt** (Claude, 14.10. abends): Live-`config.js` zeigt `.supabase.co`, Lauf 38610561776 mit `deploy` grün. Umkreis-Katalog in der Produktion (54/255, nur lesbar), Live-Seite nutzt die Datenbank |
| P0 | Auth-E-Mail | Domain/SMTP festlegen, Bestätigung und Reset mit externen Adressen nachweisen. Kein Dienst in diesem Paket aktiviert |
| P0 | Produktion und echte Geräte | iPhone-Nutzertest laut Philipp erfolgreich. Konkrete externe Auth-/Mehrkontenabnahme nach SMTP noch separat nachweisen; keine erneute pauschale Gerätetest-Aufgabe |
| P1 | Betreiberbackup | Ablauf und isolierte Restore-Probe; Benutzerexport ersetzt dies nicht |
| P1 | Konto-Lebenszyklus | Kontoexport/-löschung, Anzeigenamen, atomarer Besitzerwechsel. Neue Migrationen und echte Datenbanktests nötig |
| P1 | Öffentlicher Betrieb | Betreiberkontakt/Datenschutz mit tatsächlichem Betreiber und Datenflüssen; keine erfundenen Rechtstexte |
| P1 | Vollständige Kosten | Drei abgeleitete Verpflegungsszenarien jetzt ergänzt; offene Gebühren, weitere Preisunsicherheiten, Erstattungen und Teilzahlungen bleiben offen |
| P1 | Exakte Reisezeiten | **Teilweise umgesetzt (Claude, 15.10.):** Uhrzeit je Termin, Abfahrt und Check-in, Überschneidungen, Termine vor der Ankunft, Kalender. Wege zwischen Terminen mit bekannter Lage werden geschätzt und geprüft. Offen: Zeitzonen, echte Routen- und Bahn-Fahrzeiten |
| P2 | Anbieter | Suchlinks direkt beim Anbieter prüfen; Live-Adapter nur mit erlaubtem Zugriff; feste Gebühren/Mindestnächte/Saisonwechsel sauber behandeln |
| P2 | Katalog und konkrete Silvesterreise | Feratel/Holidu, Ersatz Haus Haug, erneuerte Preise, 2–4 gleichwertige konkrete Angebote; höchstens 1.500 € für zwei, ohne offene Pflichtkosten als 0 zu behandeln |
| P2 | Eigene Ideen und Rückblick | Indoor-Merkmal, tatsächliche Ausgaben, später Realtime als Benachrichtigung |

## Durchsicht gegen PUBLIC_PRODUCT

Gastnutzung, neutrale Standardwerte, Kontentrennung, Revisionen und Rollen sind implementiert und im vorhandenen Testbestand beschrieben. Dies ist kein neuer Produktionsnachweis. Betrieb ist noch keine vollständig abgenommene öffentliche Dauerlösung: SMTP, echte Produktionskonten, Konto-Lebenszyklus, Backup/Restore und Betreibertexte fehlen.

Aktuell behoben: Zahlungen für entfernte Posten dürfen keine verbleibenden Planposten bezahlen. `financeSummary` zeigt insgesamt Bezahlt, trennt `activePaid`/`detachedPaid` und berechnet Restbetrag nur mit Zahlungen für aktuelle Posten. Erstattung/Stornokosten bleiben zu klären; kein Verlust der gespeicherten Einträge.

Die neuen Szenarien variieren ausschließlich Verpflegung über vorhandene FOOD-Planannahmen. Günstig nimmt nur bei bestätigter Küche zusätzlich Selbstkochen an, aktueller Plan entspricht exakt cost(t), konservativ nutzt mindestens den Auswärts-Ansatz. Unterkunft, Aktivitäten, Buchungen und Pufferprozentsatz bleiben identisch; Reserve wird auf das jeweilige Szenario neu berechnet. Keine garantierte Unter-/Obergrenze, keine automatische Änderung der Reise oder Speicherung neuer Felder.

## Integrierte parallele Übergabe #7

Während der Arbeit erschien cabefc5 (Claude, v3.1). Vollständige Übergabe gelesen und Code integriert: 54 Ziele/255 Ideen, Umkreis, Zwischenstopps, Tagesgerüst, Offline-Kopie, Preis-offen und additive Felder. Neue Produktions-Katalogmigrationen, echte Standort-/Nominatim-Abfrage und iPhone bleiben ungeprüft. Eigene Indoor-Ideen sind jetzt implementiert; der frühere offene Punkt ist damit teilweise erledigt. Nicht gleichzeitig die Kernmigration erneut ausführen.

## Persönliche Aufgaben und nächstes Paket

[PHILIPP_TODO.md](PHILIPP_TODO.md) trennt erledigte Einrichtung vom noch benötigten Domain-/SMTP-Zugang, externer Auth-Abnahme und Betreiber-/Lizenzentscheidung. Spartipps mit Verpflichtungsschutz/Vorschau umgesetzt; echte Stornoabrechnung, Erstattungen und Buchungshistorie bleiben gesondert. Nächste Entwicklung: Konto-Lebenszyklus und Betreiberbackup mit echten Datenbanktests, vor SQL-Arbeit neues Issue abstimmen.
