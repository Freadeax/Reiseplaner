# Öffentlicher Reiseplaner – Produkt und technische Anforderungen

Stand: 14.10.2026. Verbindliche Produktentscheidung von Philipp: für beliebige Nutzer entwickeln, nicht nur für zwei persönliche Konten. Dieses Dokument beschreibt das Ziel und Abnahmekriterien; es erklärt geplante Funktionen nicht für implementiert. Ausgangspunkt: v2.3 / d7112a3. Hosting/Backend wird in Issue #6 von Claude bearbeitet.

## Produktgrenzen und Einstieg

Eine öffentliche Website ist für alle erreichbar. Reisepläne bleiben standardmäßig privat. Öffentliche Vorlagen sind getrennte, redaktionelle Daten ohne private Notizen, Zahlungen oder Buchungsnummern. Niemand erhält durch Registrierung Zugriff auf fremde Reisen.

Gastmodus bleibt ohne Konto verwendbar; er erklärt lokale Speicherung und ihre Grenzen. Registrierung ergänzt dauerhaftes Speichern und Gerätewechsel. Vor einer Datenübernahme werden Konto, ausgewählte Reisen und Konflikte angezeigt. Keine automatische Veröffentlichung oder Übertragung aller Browserreisen beim Login.

Neue Reisen beginnen ohne persönlichen Startort. Allgemeine Vorlagen bleiben neutral. Das Silvester-Beispiel bleibt ausdrücklich ein Beispiel mit eigenem Startort. Für echte Nutzer sind Zeitraum, Belegung, Budget und Startort eigene Eingaben. Region und Reiseart werden nicht auf Allgäu oder Winter beschränkt.

Normale Sicherung und Import benötigen kein Passwort. Bereits verschlüsselte Sicherungen bleiben mit ihrem bisherigen Passwort wiederherstellbar. Anmeldung, Datenbanksicherung und manueller Datei-Export sind unterschiedliche Funktionen.

## Konten, Berechtigungen und gemeinsame Reisen

| Rolle | Lesen | Reise ändern | Mitglieder verwalten | Reise löschen |
| --- | --- | --- | --- | --- |
| Gast | eigene lokale Pläne | eigene lokale Pläne | nein | eigene lokale Pläne |
| Nichtmitglied mit Konto | nein | nein | nein | nein |
| Leser einer Reise | ja | nein | nein | nein |
| Bearbeiter einer Reise | ja | ja | nein | nein |
| Eigentümer einer Reise | ja | ja | ja | ja |

Dies ist der Zielvertrag für Reise-Mitgliedschaften, kein globales Admin-System. Kontoinhaber sind nicht automatisch Eigentümer aller Reisen. Anbieter und Betriebsadministration erhalten keine Reise-Mitgliedschaft durch Frontendfelder. Leserechte umfassen vorerst sämtliche Reiseinhalte; granulare Rechte für Notizen/Zahlungen sind eine spätere, getrennte Erweiterung.

Einladungen sind zeitlich begrenzt, widerrufbar und an bestätigte Empfänger gebunden. Annahme erfolgt angemeldet; E-Mail-Adressen sind keine öffentlichen Nutzerlisten. Einladungstoken werden nicht als Klartext dauerhaft gespeichert. Besitzerwechsel muss atomar erfolgen, ein letzter Eigentümer darf nicht versehentlich entfernt werden. Wer eine Reise verlässt, verliert Cloud-Zugriff; bereits heruntergeladene Dateien lassen sich nicht zurückrufen.

## Datenvertrag und Synchronisation

Vorschlag für #6, vor Implementation mit Claudes tatsächlichem Schema abgleichen:

- Kontoprofil: Auth-ID, Anzeigename, Sprache; private Kontaktdaten getrennt von öffentlichen Profilfeldern.
- Reise: stabile Server-ID, Eigentümer, versionierter Reiseinhalt, Revision, Erstell-/Änderungsdatum und optionaler Löschmarker. Reise-ID und Auth-ID nicht verwechseln.
- Mitgliedschaft: Reise-ID, Auth-ID, Rolle; eindeutiges Paar. Rechte nicht aus vom Nutzer änderbaren Metadaten ableiten.
- Einladungen: Reise, Empfängerbindung, Ablauf, Hash des Tokens, Annahme/Widerruf.
- Änderungsereignisse: nur erforderliche Metadaten; keine kompletten privaten Reiseinhalte in Fehlerlogs.

Änderungen müssen serverseitig Berechtigung und erwartete Revision in einem Schreibvorgang prüfen. Beispiel: A und B lesen Revision 4; A speichert Revision 5; B darf mit Erwartung 4 nicht überschreiben. B erhält einen Konflikt und kann seine lokale Fassung exportieren, separat kopieren oder nach Vergleich neu übernehmen. Client-Uhrzeiten sind kein Versionsschutz. Realtime ist eine Benachrichtigung, keine Konfliktlösung.

Offline-Änderungen sind sichtbar als ausstehend markiert. Wiederholung nutzt eine Idempotenz-ID. Nicht gespeicherte Entwürfe gehen bei Netzfehler oder Tokenablauf nicht verloren. Abmelden/Accountwechsel trennt lokale Arbeitsstände nach Konto; auf gemeinsam genutzten Geräten darf das nächste Konto keine fremden Pläne angezeigt bekommen. Netzwerkantworten für Reisedaten/Auth werden nicht im öffentlichen Service-Worker-Cache gespeichert.

Import: v1/v2 validieren, Vorschau, Auswahl, Dubletten/abweichende IDs anzeigen, lokale Quelle erhalten. Upload-Bestätigung erst nach bestätigtem Serverergebnis. Alte Sicherungen dürfen additive Felder nicht still verlieren. Restore und Kontolöschung benötigen einen dokumentierten Ablauf einschließlich geteilter Reisen und ausstehender Änderungen.

## Suche, Angebote und Kosten

Anbietersuche wird stufenweise aufgebaut: ehrliche Suchlinks, manuelle Angebote, dann freigegebene serverseitige Adapter. Für Booking, CHECK24, Airbnb oder FeWo gibt es keine behauptete universelle API. Zugang und erlaubte Nutzung je Anbieter prüfen. Kein Schlüssel im Browser und kein Versprechen vollständiger Marktabdeckung.

Adapter liefern ein gemeinsames Angebotsschema: Anbieter-ID, Unterkunft, Zeitraum, Belegung/Altersgruppen, Währung, Preisbasis, Grundpreis, Gebührenzustände, Leistungen, Bedingungen, Verfügbarkeit, Quelle, Prüf-/Ablaufzeit. Merkmale sind ja/nein/unbekannt. Ein Muss mit unbekanntem Wert ist kein Treffer. Gesamtpreise unterschiedlicher Belegung oder Tarife sind keine gleichwertigen Vergleiche.

Suche unterscheidet Ladezustand, Teilantwort, Fehler, leere Ergebnisse und alte Cachewerte. Anbieterfehler dürfen nicht als ausverkauft erscheinen. Abruflimits, Timeout und Kostenbegrenzung gehören in jeden Adapter. Suchtexte und Links werden nicht automatisch als private Reisehistorie veröffentlicht.

Kosten bleiben aus sichtbaren Posten nachvollziehbar: Unterkunft, fixe Gebühren, Anreise/lokale Wege, Verpflegung, Aktivitäten, Reserve. Bezahlt ist keine Einsparung; Kaution ist gesonderter Geldbedarf. Drei Szenarien erst bei definierten Annahmen anzeigen, offene Pflichtkosten verhindern sichere Budgetfreigabe. Zahlungsbuch benötigt später Teilzahlungen, Erstattungen und nachvollziehbare Änderungshistorie.

## Reiseablauf und Gestaltung

Für Tag, Wochenende und lange Reisen: Datum, Zeitzone, An-/Abreise, Wege, Check-in, Treffpunkte, Pausen und Alternativen. Keine Kürzung langer Reisen. Exakte Zeiten ergänzen grobe Fenster; Konflikte brauchen Reisezeiten und Dauer. Ideen, geplante Termine und echte Buchungen bleiben getrennt. Öffnungszeiten und Wetter sind datumsbezogene Quellen, keine Garantien.

Mobil zuerst: Reiseübersicht, Speicherzustand und nächste Aktion vor Details. Alle wichtigen Aktionen mit Tastatur und Touch erreichbar; sichtbare Fokuszustände, verständliche Fehlermeldungen, Schriftvergrößerung und Hell/Dunkel. Öffentliche Beispiele brauchen keine privaten Namen. Gast, angemeldet, lokal geändert, ausstehend, synchronisiert und Konflikt sind unterscheidbare Textzustände.

## Betrieb und Freigabekriterien

Zielhosting: zunächst GitHub Pages, später Cloudflare Pages; Supabase ist der geplante Auth-/Datenbankdienst. Keine Konten/Projekte hierdurch automatisch provisioniert. Anbietergrenzen und Betriebskosten vor realer Freigabe prüfen. Browser erhält ausschließlich öffentliche Konfiguration; privilegierte Schlüssel bleiben serverseitig.

Freigabe in Stufen, mit dokumentierten Nachweisen:

1. Öffentliche lokale App: funktionierende Gastnutzung, neutrale Defaults, ohne Passwort sichern/importieren, Offline-/Fehlerzustände, keine privaten Beispieldaten.
2. Konto-Beta: Registrieren/Bestätigen/Anmelden/Abmelden/Wiederherstellung; zwei unabhängige Konten. Direkte API-Tests belegen, dass A keine Daten von B lesen, ändern oder löschen kann. Unangemeldete API-Aufrufe sind ebenfalls geprüft.
3. Gemeinsame Beta: Owner/Editor/Viewer erlauben und verbieten alle Operationen serverseitig. Tests für gefälschte Rolle, fremde Reise-ID, entzogene Rechte, abgelaufene Einladung, zwei gleichzeitige Änderungen und Accountwechsel.
4. Dauerbetrieb: Überwachung ohne private Inhalte, nachvollziehbare Datenbankmigrationen, geprüfte Wiederherstellung in isolierter Umgebung, Kontodatenexport/-löschablauf, überprüfte Datenschutz-/Betreibertexte und Kontaktweg. Benutzerdatei-Export ersetzt kein Betreiberbackup.
5. Anbieterintegration: jeder Adapter einzeln freigeben, Rechen-/Normalisierungstests und konkrete datumsbezogene Stichprobe; Fehler/Rate-Limit/Teilausfall prüfen.

Node-Simulationen ersetzen weder einen echten Datenbanktest noch Safari/iPhone. Browser-Freigabe umfasst Desktop, schmale Mobilansichten und ein echtes iPhone; Tests nennen Commit und Umgebung. Eine neue Funktion bleibt geplant, bis der entsprechende Nachweis vorliegt.

## Quellen und Zusammenarbeit

Technische Primärquellen, am 14.10.2026 geprüft:
- https://supabase.com/docs/guides/database/postgres/row-level-security – serverseitige Datenregeln.
- https://supabase.com/docs/guides/getting-started/api-keys – öffentliche/privilegierte Schlüssel unterscheiden.
- https://supabase.com/docs/guides/platform/backups – Betreiberbackup und Restore separat planen.

Das Rollenmodell, die Revisionen und Stufen oben sind unsere Entwurfsentscheidungen. SQL-Migrationen werden für #6 nicht parallel angelegt: Claude besitzt das Backend-Arbeitspaket. Änderungen und offene Fragen gehören in GitHub-Issues; aktueller Funktionsstand in STATUS, nächste Aufgaben in ROADMAP. Nur main, vor jedem Push fremde Änderungen integrieren und testen.

## Abgleich mit dem umgesetzten Schema (Claude, #6, 14.10.2026)

Umgesetzt in `supabase/migrations/20261014120000_reiseplaner_core.sql`, Details in `docs/SUPABASE_SETUP.md`:

- **Reise, Mitgliedschaft, Einladung:** wie oben vorgeschlagen.
  - Die Revision heißt `version` und wird vom Server erhöht. Die Versionsprüfung erfolgt atomar in einem Schreibvorgang (`where version = n`).
  - Einladungen sind gehasht, laufen ab, gelten einmal, sind widerrufbar und optional an eine bestätigte E-Mail gebunden. Ohne E-Mail ist der Link ein Einmal-Token.
- **Idempotenz:** Die stabile Reise-ID dient als Idempotenzschlüssel. Ein wiederholtes Anlegen nach verlorener Antwort übernimmt die eigene Zeile, statt zu duplizieren.
- **Service Worker:** Supabase-Antworten werden nicht gecacht (fremder Origin).
- **Noch nicht umgesetzt:**
  - Kontoprofil und Anzeigename. Mitreisende sehen über `trip_member_list` die E-Mail-Adressen der Mitglieder derselben Reise.
  - Besitzerwechsel, Kontolöschung und -export, Änderungsereignisse und Betreiber-Monitoring.
  - Granulare Leserechte für Notizen und Zahlungen.

Diese Punkte bleiben offen im Sinn der Freigabestufen 2 bis 4. Die Rechte-Tests der Stufen 2 und 3 laufen in `tests/db/supabase-api.cjs` gegen einen lokalen Stack, noch nicht gegen das Produktionsprojekt.

