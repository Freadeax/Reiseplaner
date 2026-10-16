# Reiseplaner

Ein Reiseplaner für alle, für Ausflüge, Wochenenden und längere Reisen. Er verbindet Zeitraum, Ort, Unterkunft, Tagesplan, Packliste und eine nachvollziehbare Kostenschätzung in einer Oberfläche für Handy und Desktop.

> **Projektstatus:** Frühe Entwicklung. Die Beispielunterkünfte, Aktivitäten, Tarife und Öffnungszeiten sind keine live geprüften Angebote. Für Buchungsentscheidungen müssen Datum, Belegung, Preis und Bedingungen direkt beim Anbieter geprüft werden.

## Starten

**Website:** online unter `https://freadeax.github.io/Reiseplaner/`, verbunden mit dem Supabase-Projekt. Am 14.10.2026 abends geprüft: Live-`config.js` mit `.supabase.co`, Katalog kommt aus der Datenbank. Philipp bestätigt einen erfolgreichen eigenen iPhone-Test. SMTP und konkrete externe Kontoabnahme bleiben offen. Aktuelle Betriebsgrenzen stehen in [docs/STATUS.md](docs/STATUS.md).

Die App bleibt buildlos: `index.html` plus `config.js` und `cloud.js`. Lokal im Browser öffnen oder einen kleinen Webserver starten:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen. Über http/https ausgeliefert, merkt sich die App ihre Dateien und startet danach auch ohne Netz. Auf dem iPhone lässt sie sich über „Zum Home-Bildschirm“ wie eine App ablegen. Als Datei geöffnet gibt es keinen Offline-Start. Eine Dateivorschau innerhalb der ChatGPT-iPhone-App kann die interaktive Oberfläche nicht zuverlässig ausführen. Der HTML-Anhang in ChatGPT ist daher kein App-Link.

## Darstellung wählen

Oben über **Darstellung** zwischen drei Oberflächen wechseln: **Reisebuch** (warm und großzügig), **Planungsstudio** (klare Arbeitsbereiche, Seitennavigation am Desktop) und **Kompakt** (weniger Abstand für schnelle Orientierung). Alle nutzen dieselben Reisen und Funktionen. Die Auswahl bleibt in diesem Browser; Hell-/Dunkelmodus folgt dem Gerät.

**Vorlagen:** Kurzreisen, Urlaub & Auszeit, Flugvorbereitung und ausgefülltes Beispiel sind getrennt gruppiert. Eine Vorschau zeigt Umfang und Vorbereitung, ohne etwas zu speichern. Erst „Als neue Reise anlegen“ erstellt euren Plan; beim Schließen bleibt ein offener eigener Entwurf erhalten. Flugvorlagen bereiten Aufgaben vor, enthalten aber keine geprüften Flugverbindungen.

## Was bereits geht

- **Persönliches Reiseregal:** Reisen nach Titel, Ziel oder Unterkunft durchsuchen, nach Zeitgruppe filtern und sinnvoll sortieren. Eine laufende oder kommende Reise wird hervorgehoben. Zeitgruppen ändern keinen Buchungsstatus; die Ansicht löscht oder verändert keine Reisen.

- Reisen mit festem, flexiblem oder offenem Zeitraum anlegen und bearbeiten, leer oder mit einer Vorlage (Wochenende, Städtereise, Tagesausflug, Sommer-, Winterurlaub; Silvester als ausgefülltes Beispiel)
- **Entdecken (Umkreis-Katalog, v3.1):** Abfahrtsort per Standort, Ortssuche oder Städteliste wählen, Kilometerbereich (z. B. „Wochenende 80–350 km“ oder frei von–bis), Themen, Monat, Dauer, „Mit Kindern“ und „Auch bei Schlechtwetter“. Der Katalog schlägt aus 102 Zielen in Deutschland und elf Nachbarländern mit 468 Attraktionen passende Ziele vor, mit Zwischenstopps auf dem Weg und Ausflügen vom Ziel. „Überrasch mich“ wählt zufällig unter den besten Treffern. Auf Knopfdruck entsteht eine Reise mit verteiltem Tagesgerüst. Keine Preise und keine Öffnungszeiten: übernommene Ideen stehen auf „Preis offen“, bis ihr einen Betrag eintragt. Kilometer und Fahrzeit sind gekennzeichnete Schätzungen (Luftlinie × 1,3)
- **Seit v3.3:** „Ziel direkt finden“ über den ganzen Katalog, teilbarer Link je Ziel (`#ziel-<id>`), „Ähnliche Ziele“ im Ziel-Blatt.
- **Seit v3.2:**
  - Entdecken: Merkliste „Irgendwann mal“ (nur im Browser), Textsuche und Sortierung in den Treffern, Mini-Karte mit Luftlinien-Kreisen, Saisonstreifen je Ziel.
  - **Rundreise bauen:** 2–6 Ziele, kürzeste Reihenfolge, Etappen-km und Fahrzeiten geschätzt, Nächte je Etappe.
  - Tagesplan: Auslastung je Tag mit geschätzter Fahrzeit, Warnung bei überladenen Tagen, Tage tauschen (gebuchte Termine bleiben geschützt), „Lücken füllen“ mit Ideen aus der Umgebung, Tagesroute als Kartenlink, Packhinweise aus Katalog-Themen in der Packliste.
- Beispielkatalog für vier Winterregionen mit Unterkünften und Aktivitäten
- Tagesplan, Kostenübersicht, Pack- und Buchungscheckliste
- Eigene Unterkunft, Aktivität und Kostenposten ergänzen. Eigene Unternehmungen mit Dauer in Stunden, Indoor-Merkmal und Packhinweisen; leerer Preis bleibt offen, kostenlos nur bei ausdrücklicher Angabe
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

**Neue Wunsch-Auswahl in Entdecken:** zwölf Stimmungskarten mit „unbedingt“, „gern“ und „lieber nicht“, fünf Schnellprofile und ein optionaler Ja/Nein/Vielleicht-Stapel. Tempo, Reisegruppe, Regenalternativen, Monat und Dauer erklären die Zielreihenfolge. Fehlende Muss-Merkmale bleiben sichtbar; „lieber nicht“ wertet ab. Bahn-/Flugverbindungen und Preise sind ungeprüft, ein Budget wird nicht als erfüllt gezählt. Wünsche bleiben getrennt von Reisen in diesem Browser. Die Anreiseauswahl im Wunschprofil ist noch keine Flugplanung.

Die Wunschübersicht erlaubt einzelne Wünsche zu entfernen und Schnellprofile oder Zurücksetzen unmittelbar rückgängig zu machen. Ergebnisse lassen sich auf belegte Muss-Wünsche begrenzen; ausgeblendete Alternativen werden gezählt und können wieder angezeigt werden. Der Zielvergleich nennt Wunschabdeckung, Muss-Lücken und Ungeprüftes. „Überrasch mich“ respektiert die sichtbare Auswahl und Muss-Grenzen. Antworten auf eine überholte Suche verändern eure neue Auswahl nicht.

In jeder Reise gibt es den Reiter **Reisefinder**:

1. Ort, Unterkunftslimit, Fahrzeit, Bewertung und Unterkunftsart eingeben; Merkmale als **Muss**, **Wunsch** oder **Egal** markieren.
2. Booking, Airbnb und FeWo-direkt über vorbereitete Suchlinks öffnen; CHECK24 und Holidu über ihre Startseiten. Suchdaten dort kontrollieren. Die App ruft keine Live-Angebote ab.
3. Eigene Filter benennen und speichern, oder Wellness/Ruhe, FeWo/Ausflüge und Flexibel/Komfort als Startpunkt verwenden.
4. Tatsächlich gefundene Angebote mit Zeitraum, Personen, Preisbasis, Quelle, Prüfdatum, Gebühren, Verfügbarkeit und Tarifbedingungen erfassen.
5. Angebote merken, bis zu vier vergleichen und eine Unterkunft bewusst in die Kostenplanung übernehmen. Das löst keine Buchung aus.

Unbekannte Merkmale erfüllen kein Muss. Offene Pflichtgebühren erfüllen kein Preislimit. Angebot und Bezahlung sind getrennt: bereits bezahlte Beträge bleiben Reisekosten, Kautionen stehen separat. Der Vergleich verwendet dieselbe Kostenfunktion wie der Planer; die restlichen Reiseausgaben bleiben Planwerte.

**Sicherung:** Format v2 enthält auch Angebote und Profile; v1-Dateien werden beim Import aufwärts migriert. Alte Programme können v2-Dateien nicht importieren. Fünf lokale vorherige Speicherstände können als Sicherungsdatei heruntergeladen und kontrolliert importiert werden. Bei einem erkannten neueren Stand aus einer anderen Browseransicht wird das Schreiben blockiert; offene eigene Änderungen exportieren und neu laden. Das ist keine atomare Mehrbenutzersynchronisation. Browser löschen/Zurücksetzen kann auch diese lokalen Kopien entfernen.

Anbieterzugänge, Quellen und nächste Integrationsschritte: [docs/PROVIDER_INTEGRATION.md](docs/PROVIDER_INTEGRATION.md).

## Konten und dauerhafte Speicherung (Supabase)

Seit Issue #6 im Code umgesetzt und gegen einen **lokalen** Supabase-Stack geprüft. Das Produktionsschema ist laut letzter Betriebsprüfung vorhanden; Live-Konfiguration, SMTP und Tests mit echten Konten bleiben offene Betriebsaufgaben (siehe STATUS).

- **Ohne Konto (Gastmodus):** wie bisher nur in diesem Browser (`rp-trips`).
- **Mit Konto:**
  - Registrieren mit Bestätigungs-E-Mail, Anmelden, Abmelden, Passwort vergessen. Der Link führt zurück auf die Website und setzt dort ein neues Passwort.
  - Reisen werden online gespeichert und zusätzlich je Konto getrennt im Browser zwischengespeichert, auch offline nutzbar.
  - Die Anzeige oben unterscheidet „Gast“, „Lokal gespeichert“, „Synchronisation ausstehend“, „Offline“, „Online gespeichert“ (erst nach Bestätigung der Datenbank), „Speicherfehler“ und „Konflikt“.
- **Übernahme lokaler Reisen:** Nie automatisch. Nach der Anmeldung bietet die App eine Vorschau mit Prüfung an. Gleiche IDs werden als Kopie übernommen, die Gast-Kopie bleibt.
- **Gemeinsam planen:** Eigentümer laden per Link ein. Der Link läuft ab, gilt einmal, ist widerrufbar und optional an eine E-Mail gebunden. Rollen sind „Bearbeiten“ oder „Lesen“ und lassen sich ändern oder entziehen. Rechte setzt die Datenbank durch (Row Level Security), nicht die Oberfläche. Die öffentliche Website-Adresse macht keine Reise öffentlich.
- **Gleichzeitige Bearbeitung:** Gespeichert wird nur auf die zuletzt bekannte Version. Sonst erscheint ein Konflikt mit der Wahl „Online-Version übernehmen“, „Meine Version als Kopie“ oder „bewusst überschreiben“. Löschungen werden als Markierung übertragen und tauchen nicht wieder auf.
- **Grenzen:**
  - Lokaler Speicher ist keine Datensicherung, und der Supabase-Gratistarif hat keine automatischen Backups. Wichtige Reisen zusätzlich als Datei sichern.
  - Ein Wechsel der Website-Domain überträgt weder Browser-Speicher noch Anmeldung.
  - Offline lassen sich nur Reisen bearbeiten, die schon im Browser liegen. Offline-Anmeldung und Einladungen sind nicht möglich.
  - Kein Realtime-Abgleich (Abgleich bei Änderung und Fokus sowie alle 60 s).
- **Konto und Daten (Migration `20261016120000`):** Kontodaten herunterladen, Konto löschen mit Übersicht und bewusster Wahl je geteilter Reise (an Mitreisende übergeben oder mitlöschen), Bestätigung mit der E-Mail-Adresse. Gastdaten im Browser bleiben unberührt. Funktioniert erst, wenn die Migration in der Produktion eingespielt ist.

Einrichtung und Betrieb: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Hosting und späterer Wechsel zu Cloudflare Pages: [docs/HOSTING_MIGRATION.md](docs/HOSTING_MIGRATION.md). Produktziel und Abnahmekriterien: [docs/PUBLIC_PRODUCT.md](docs/PUBLIC_PRODUCT.md).

## Betrieb: Einrichtung und verbleibende Aufgaben

Die Einrichtung unten ist bereits erfolgt; offene Aufgaben für Philipp stehen in [docs/PHILIPP_TODO.md](docs/PHILIPP_TODO.md).

1. Supabase-Projekt (Gratistarif) anlegen und die Migration einspielen. Dazu Auth-URLs, E-Mail-Bestätigung und eigenes SMTP konfigurieren, siehe `docs/SUPABASE_SETUP.md`.
2. Unter GitHub → *Settings → Secrets and variables → Actions → Variables* setzen: `RP_SUPABASE_URL`, `RP_SUPABASE_PUBLISHABLE_KEY` und `PAGES_ENABLED=true`. Nur öffentliche Werte, niemals Secret- oder service_role-Schlüssel.
3. GitHub → *Settings → Pages → Build and deployment → Source: GitHub Actions*.

Danach veröffentlicht der Workflow „Tests & Pages“ jeden grünen Stand von `main`.

Der Umkreis-Katalog kommt aus denselben Migrationen. Spielt die GitHub-Integration sie nicht ein, einmalig `supabase/manual/apply-catalog-v1.sql` im SQL-Editor ausführen. Bis dahin nutzt die Website automatisch die Offline-Kopie in der App und sagt das auch.

**Sichern und importieren benötigt normalerweise kein Passwort.** Die Exportdatei enthält eure Reisepläne einschließlich privater Notizen. Bereits passwortgeschützte Altdateien bleiben mit dem damaligen Passwort importierbar. Details zu diesem Altformat stehen in [docs/BACKUP_SECURITY.md](docs/BACKUP_SECURITY.md). Die Export-Schaltflächen für Passwortschutz wurden aus dem normalen Ablauf entfernt; Anmeldung ist davon unabhängig.

Entscheidungen, offene Fragen aus der Zusammenarbeit mit Claude und nächste Abnahmen: [docs/OPEN_POINTS.md](docs/OPEN_POINTS.md).

## Weitere Grenzen

- Reisekosten sind zunächst **Planwerte**, kein bestätigter Gesamtpreis. Fehlende Pflichtkosten werden als offen angezeigt.
- Ohne Konto liegen die Daten nur im Browser des jeweiligen Geräts. Synchronisation zwischen Geräten gibt es nur mit Konto und eingerichtetem Supabase-Projekt.
- Der frühere `window.claude`-Speicherpfad wurde entfernt und durch Supabase ersetzt.
- Frühere Browserprüfungen sind im Status dokumentiert. Für den neuen Finder ist der Klicktest erweitert; sein aktuelles CI-Ergebnis steht bei GitHub Actions. Philipp hat einen erfolgreichen eigenen iPhone-Test gemeldet; automatisierte Browserprüfungen bleiben davon getrennt.
- Keine Buchung, Zahlung oder Anbieteranfrage wird durch die App ausgelöst.

## Prüfen

Node.js ab Version 20 genügt; es gibt keine Laufzeit-Abhängigkeiten:

```bash
npm test
npm run test:browser   # Klicktest in Chromium, braucht Playwright; ohne Playwright übersprungen
npm run audit:ui       # Sichtprüfung (Kontrast, Tippflächen, Überlauf, Fokus) aller Darstellungen; Hinweise, kein Pflichttest
npm run build          # Website-Artefakt nach public/ (mit RP_SUPABASE_* aus der Umgebung)
npm run check:artifact # nur erlaubte Dateien, keine Schlüssel
supabase start         # lokaler Supabase-Stack (Docker, Supabase CLI 2.120.0)
npm run test:db        # Rechte, Auth, Einladungen, Konflikte über die echte API
npm run test:e2e       # Chromium gegen gebaute Website unter /Reiseplaner/ + lokalen Stack
```

Die Prüfungen decken unter anderem Reisedauer, Datumsregeln, Gästekartenrabatte, Kosten, Sicherungsdateien, beschädigten Browser-Speicher, Reisephasen, Kalenderexport und den Aufbau der Startansicht ab.

## Projektstruktur

| Pfad | Inhalt |
| --- | --- |
| `index.html` | Aktuelle App, einschließlich CSS und JavaScript (Fachlogik, Speicher, Abgleich, Oberfläche) |
| `cloud.js` | Einziger Supabase-Zugriff (Auth, Reisen, Freigaben, Katalogsuche) |
| `catalog.js` | Rechenregeln des Umkreis-Katalogs (Entfernung, Bereich, Bewertung, Stopps, Tagesgerüst) |
| `catalog-data.js` | Katalogdaten, einzige Quelle; daraus erzeugt `scripts/catalog-sql.mjs` die Seed-Migration |
| `config.js` | Öffentliche Konfiguration. Leer bedeutet Gastmodus, der Build erzeugt sie aus Umgebungsvariablen |
| `vendor/` | supabase-js 2.117.2 (MIT), lokal statt CDN |
| `scripts/` | `build.mjs` (Artefakt nach `public/`) und `check-artifact.mjs` |
| `supabase/` | `migrations/*.sql` (Schema, RLS, Funktionen) und `config.toml` (nur lokal) |
| `.github/workflows/tests.yml` | Prüfungen und Veröffentlichung auf GitHub Pages |
| `tests/` | Logik-, Start-, Sync- und Browser-Klickprüfungen; `tests/db/` Rechte über die Supabase-API; `tests/e2e-cloud.cjs` Ende-zu-Ende |
| `sw.js`, `manifest.webmanifest`, `*.png` | Offline-Start und App-Icon |
| `docs/STATUS.md` | Bestätigter Stand und bekannte Grenzen |
| `docs/ROADMAP.md` | Nächste Entwicklungsschritte |
| `docs/COLLABORATION.md` | Abstimmung und sicheres Arbeiten zu dritt auf `main` |
| `AGENTS.md` | Arbeitsregeln für künftige Coding-KIs |

Beiträge und Fehlerberichte sind willkommen. Bitte keine privaten Reisepläne, Buchungsnummern oder exportierten Sicherungsdateien ins öffentliche Repository stellen. Eine Open-Source-Lizenz wurde noch nicht festgelegt.


