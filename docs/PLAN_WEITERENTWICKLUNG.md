# Gemeinsamer Entwicklungsplan (Philipp, Claude, ChatGPT)

Stand 15.10.2026. Auftrag von Philipp: verschiedene Reisearten (auch Fliegen), Oberflächenstruktur überarbeiten,
„Worauf habt ihr Lust?“ komplett neu mit mehr Möglichkeiten, dazu Claudes 11 Erweiterungsideen, systematisch geordnet.
Abstimmung und Aufteilung in Issue #8. Dieses Dokument ist der Plan, nicht der Umsetzungsstand; was umgesetzt und
geprüft ist, steht in `STATUS.md`.

Regeln wie immer: Geld, Termine, Buchungszustände und Datenverlust zuerst. Keine erfundenen Preise, Zeiten oder
Verfügbarkeiten. Jede Änderung am Speicherformat nur über einen abgestimmten, versionierten Datenvertrag
(siehe Abschnitt E). Jedes Paket mit `npm test`, Chromium-Klickweg und ehrlichen Grenzen.

Kennzeichnung: **[abgeleitet]** = keine neuen Speicherfelder, sofort machbar. **[Datenvertrag]** = braucht neue
Felder bzw. Version, erst nach Abstimmung. **[Katalog]** = neue Katalogdaten (neue Seed-Migration, Produktion über
GitHub-Integration, Freigabe Philipp). **[extern]** = Abfrage eines externen Dienstes auf Knopfdruck, mit Quelle
und Abrufdatum.

---

## A · Reisearten und Anreise (auch Fliegen)

Heute: Anreise Auto/Bahn/Flug als eine Auswahl. Bei Bahn/Flug nur ein Ticketbetrag und ein Link zur Verbindungssuche.
Reisetypen: Wochenende, Stadt, Tag, Strand/Sommer, Winter.

| Nr. | Inhalt | Art |
| --- | --- | --- |
| A1 | **Anreise als Abschnitte**: mehrere Teilstrecken je Richtung (z. B. Auto → Flughafen, Flug, Transfer → Unterkunft). Verkehrsmittel: Auto, Bahn, Flug, Fernbus, Fähre, Mietwagen, Taxi/Transfer, Fahrrad. Je Abschnitt Abfahrt/Ankunft mit Zeitzone, Dauer, Kosten (Eingabe), Buchungsstatus. Ankunftszeit am Zielort ergibt sich aus der Kette, nicht aus einer Schätzung | Datenvertrag |
| A2 | **Flug-Details**: Flughäfen (IATA-Code, Eingabe), Flugnummer, Gepäck (Hand-/Aufgabegepäck), Sitzplatz, Check-in-Frist und Online-Check-in-Zeitpunkt, Sicherheitspuffer vor Abflug, Parken am Flughafen oder Anfahrt. Kosten nur als Eingabe bzw. echtes Angebot; Suchlinks zu Flugsuchen ohne Preisbehauptung | Datenvertrag |
| A3 | **Plan-Check für Flugreisen**: Puffer Ankunft Flughafen ↔ Abflug, Zeitzonenwechsel im Tagesplan, Termine vor Landung + Transfer, Rückflug vor Check-out, Ankunft nach Mitternacht (Unterkunft informieren) | abgeleitet (auf A1/A2) |
| A4 | **Reisetypen erweitern**: Fernreise, Badeurlaub, Rundreise, Camping/Wohnmobil, Aktivurlaub (Rad/Wandern), Wellness, Kreuzfahrt (nur Grundgerüst). Je Typ passende Vorlage: Checkliste, Packliste, Kostenblöcke, typische Fristen | abgeleitet (Vorlagen) |
| A5 | **Ausland**: Reisedokumente (Ausweis/Pass, Gültigkeit), Einreise/Visum und Sicherheitshinweise nur als Link zum Auswärtigen Amt, Auslandskrankenversicherung, Währung mit datumsbezogenem EZB-Kurs auf Knopfdruck, Steckdosentyp, Roaming-Hinweis | abgeleitet + extern |
| A6 | **Kosten Anreise neu**: je Abschnitt und Person, Gepäck/Sitzplatz als eigene Posten im Buchungsbuch, damit Status und Fälligkeit wie bei anderen Posten funktionieren | Datenvertrag |

## B · Struktur der Oberfläche

Philipps Befund: an manchen Stellen zusammengequetscht, an anderen scheint etwas durch. Konkrete Befunde aus der
Chromium-Sichtprüfung stehen in #8 (Screenshots je Ansicht und Breite).

| Nr. | Inhalt | Art |
| --- | --- | --- |
| B1 | **Befundliste** aus Screenshots (1280/390/320, hell/dunkel, drei Darstellungen), Stand `58d7a87`, Chromium: siehe unten | Prüfung |
| B2 | **Layoutsystem**: feste Abstandsskala, einheitliche Kartenabstände, maximale Lesebreite, Formularraster (Label über Feld auf schmal, zweispaltig ab Tablet), keine Elemente mit gleicher Stapelhöhe übereinander | abgeleitet |
| B3 | **Deckende Flächen**: Kopfzeile, Dock, Dialoge und klebende Leisten mit deckendem Hintergrund und Schatten statt Transparenz; Dialoge mit abgedunkeltem Hintergrund, Scrollsperre dahinter | abgeleitet |
| B4 | **Navigation der Reise**: zehn Reiter in vier Gruppen bündeln (Planen · Buchen & Kosten · Unterwegs · Unterlagen), mobil als Bereichsauswahl, Desktop als Seitenleiste | abgeleitet |
| B5 | **Sichtprüfung erweitern** (`npm run audit:ui`): Überlappungs-Prüfung (sichtbare Bedienelemente, die sich überdecken), Transparenz-Prüfung für fixierte/klebende Elemente, Mindestabstand zwischen Tippflächen | Prüfung |

**B1-Befunde (Claude, 15.10., Chromium 390/320 px, alle drei Darstellungen):**

1. **Durchscheinen:** Die feste Kostenleiste unten („Reise … 1.462 € / 1.500 €“) liegt über dem Inhalt. Text läuft darunter durch und ist halb verdeckt. Auf der Startseite scheint die dekorative Kompass-Grafik hinter dem Feld „Mit einer Vorlage starten“ durch.
2. **Echte Überlappung bei 320 px:** Suchfeld `#trip-q` und Knopf „Suchen“ im Reiseregal liegen übereinander (alle drei Darstellungen).
3. **Reisekopf mobil zu hoch:** Zurück, Status-Auswahl und Eckdaten stehen untereinander, bevor der Titel kommt. Fast ein halber Bildschirm vergeht, bevor Inhalt erscheint.
4. **Doppelte Navigation:** „Bereich wechseln“ als Auswahl **und** darunter eine abgeschnittene Reiterzeile („Ort & Unt…“).
5. **Wiederholter Hinweis:** Der lange Kasten „Vorläufige Planung · kein bestätigter Gesamtpreis“ steht auch im Tagesplan und drückt den Inhalt nach unten. Besser einmal kompakt mit „mehr“.
6. **Tagesplan mobil:** Die Tagesspalten sind breiter als der Bildschirm, der nächste Tag ist angeschnitten. Der Tageskopf ist voll (Auslastung, Kosten, frei, zwei Knöpfe untereinander). Vorschlag: mobil ein Tag mit Tagesumschalter, Kopfangaben einzeilig bzw. aufklappbar.
7. **Entdecken:** „Mit Kindern“ erscheint doppelt (Art-Chip und Filter-Chip). Die Chips umbrechen unruhig. Unter den Entfernungs-Voreinstellungen stehen zusätzlich die km-Felder (doppelt). Der Sprunglink „Zum Inhalt“ ist am Seitenende sichtbar.
8. Kein Kontrast-, Namens- oder Fokusbefund, keine JS-Fehler (`npm run audit:ui`).

## C · „Worauf habt ihr Lust?“ komplett neu

Heute: 12 Ankreuz-Chips (Natur, Wasser, Berge, Stadt, Kultur, Burgen, Therme, Familie, Genuss, Technik, Winter, Unterwelt)
im Entdecken-Bereich. Treffer = mindestens eine Art passt.

| Nr. | Inhalt | Art |
| --- | --- | --- |
| C1 | **Stimmungskarten statt Chips**: große Karten mit Symbol, Kurzbeschreibung und Beispiel, Mehrfachauswahl mit drei Stufen je Karte: „unbedingt“, „gern“, „lieber nicht“ | abgeleitet (UI) |
| C2 | **Weitere Dimensionen**: Tempo (gemütlich ↔ aktiv), Wer reist (zu zweit, Familie mit Alter der Kinder, Freunde, mit Hund), wetterunabhängig, Budgetrahmen pro Person, Jahreszeit/Monat, Anreise (Auto/Bahn/Flug, max. Fahrzeit), Übernachtung (Hotel, Ferienwohnung, Camping) | abgeleitet (UI + Rangfolge) |
| C3 | **Neue Arten im Katalog**: Strand & Baden, Tiere & Zoo, Freizeitpark, Sport & Abenteuer (Klettern, Rad, Kanu, Sommerrodeln), Märkte & Feste (saisonal mit Termin-Quelle), Romantik & Aussicht, Ruhe & Natur erleben, Fotospots, Regentag drinnen | Katalog |
| C4 | **Schnellstart-Profile**: „Entspanntes Wochenende zu zweit“, „Familientag“, „Aktivtag“, „Regentag“, „Kultur-Kurztrip“, setzen C1/C2 sinnvoll vor und sind danach frei änderbar | abgeleitet |
| C5 | **Ergebnisse erklären**: je Ziel „passt zu 3 von 4 Wünschen · 55 Min. Fahrt · 2 Regenalternativen“, „lieber nicht“ wirkt als Ausschluss oder Abwertung, nicht nur als fehlender Treffer | abgeleitet |
| C6 | **Alternative Auswahl**: „Ja / Nein / Vielleicht“-Stapel mit Beispielbildern bzw. Beispielzielen, aus den Antworten entsteht das Profil (optional, nach C1) | abgeleitet (UI) |

## D · Claudes 11 Erweiterungsideen (strukturiert, erweitert)

### D-I Fristen, Geld, Termine

| Nr. | Inhalt | Art |
| --- | --- | --- |
| D1 | **Fahrplan bis zur Abreise**: Zeitleiste heute → Abfahrt mit Zahlungsfälligkeiten, Stornofristen, offenen Buchungen, Online-Check-in (A2), Packtag, saisonale Punkte (Winterreifen, Vignette, Reisepass-Gültigkeit) | abgeleitet |
| D2 | **Kalender-Erinnerungen**: Fälligkeiten und Fristen als Kalendereinträge mit Alarm in der `.ics`-Datei | abgeleitet |
| D3 | **Ferien- und Feiertagswarnung** bei der Datumswahl (Bundesland wählbar), Quelle und Abrufdatum sichtbar | extern |
| D4 | **Reisevarianten vergleichen**: Reise als Variante kopieren, Varianten nebeneinander (Kosten, Fahr-/Flugzeit, Programm, Budget-Spielraum), eine Variante übernehmen | abgeleitet (Kopie = normale Reise) |

### D-II Unterwegs und Sicherheit

| Nr. | Inhalt | Art |
| --- | --- | --- |
| D5 | **Wetter im Tagesplan** (bis 16 Tage vorher, Open-Meteo, mit Abrufzeit), bei Regen direkt der vorhandene Regen-Tausch | extern |
| D6 | **Packliste nach Wetter, Aktivitäten und Reiseart** (verbindet vorhandene Mitbring-Hinweise mit D5 und A4) | abgeleitet |
| D7 | **Notfall auf Knopfdruck**: nächste Apotheke/Klinik zum Ziel über OpenStreetMap, ergänzt den Notiz-Baustein „Notfall“ | extern |

### D-III Gemeinsam reisen und Erfahrung

| Nr. | Inhalt | Art |
| --- | --- | --- |
| D8 | **Kosten unter Mitreisenden aufteilen**: wer hat was bezahlt, Ausgleich „wer schuldet wem“, passt zu geteilten Reisen | Datenvertrag |
| D9 | **Ausgaben unterwegs erfassen**: schnelle Eingabe vor Ort, speist Budget-Rückblick und D8 | Datenvertrag |
| D10 | **Reisetagebuch und Bewertungen**: Zeile je Tag, Bewertung der Unternehmungen; gut bewertete Arten fließen in C5 ein | Datenvertrag |

### D-IV Inspiration

| Nr. | Inhalt | Art |
| --- | --- | --- |
| D11 | **Beste Reisezeit je Ziel** aus den Saisondaten des Katalogs, plus „Überrasch mich mit Rahmen“ (Dauer, Budget, max. Anreise), das einen fertigen Planentwurf erzeugt | abgeleitet |

## E · Grundlagen für alles mit „Datenvertrag“

| Nr. | Inhalt | Stand |
| --- | --- | --- |
| E1 | Schutz vor nicht lesbaren Serverfassungen im Client | umgesetzt `58d7a87` |
| E2 | Serverseitiger Downgrade-Schutz (neue Migration) | wartet auf Philipps Freigabe |
| E3 | **Datenvertrag v3** gemeinsam: Anreise-Abschnitte (A1/A2/A6), Storno/Erstattung, Ausgaben/Aufteilung (D8/D9), Tagebuch (D10). Eine Version für alles, mit Migration, Export/Import, Rückweg und DB-CHECK `in (2,3)` | Entwurf in #8 |

## Vorschlag Reihenfolge und Aufteilung (zur Abstimmung)

1. **Sofort parallel, ohne Speicheränderung**
   - ChatGPT: B1–B4 Oberflächenstruktur (Layoutsystem, deckende Flächen, Navigation in vier Gruppen), danach C1/C4/C6 als Interaktion.
   - Claude: B5 Prüfwerkzeug (liefert die Befunde für B1), C2/C5 Rangfolge und Erklärung in `catalog.js`, D1/D2 Fahrplan und Kalender-Erinnerungen, A4 Reisetyp-Vorlagen.
2. **Datenvertrag v3** gemeinsam entwerfen (E3), Claude schreibt Entwurf mit Rechenfällen, ChatGPT prüft; Philipp gibt E2 frei.
3. **Danach**: A1/A2/A3/A6 Fliegen und Anreise-Abschnitte (Claude Modell/Rechnung, ChatGPT Formulare), C3 Katalogerweiterung (Claude, neue Seed-Migration), D5–D7 externe Dienste, D8–D10 gemeinsam.

Jeder kündigt in #8 an, welche Funktionen und Dateien er anfasst, und meldet Push mit Tests und Grenzen.
