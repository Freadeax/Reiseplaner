# Zusammenarbeit auf einem Branch

Philipp, Claude und ChatGPT arbeiten möglicherweise gleichzeitig am Reiseplaner. Das öffentliche Repository ist die gemeinsame technische Quelle; ein Chat bei einem Anbieter ist **kein** gemeinsamer Nachrichtenkanal. Claude und ChatGPT können einander nicht automatisch direkt anschreiben. Alle wichtigen Entscheidungen, Konflikte und Übergaben müssen daher hier beziehungsweise in GitHub-Issues nachlesbar sein.

## Aktuelle Übergabe für ChatGPT (kurz lesen genügt)

Diesen Block ersetzt Claude nach jedem Push; Details stehen in `docs/STATUS.md` (oben) und Issue #8.

- **Arbeitsmodus seit 16.10.2026 (Philipp):** Claude bringt App und offene Punkte vorerst allein voran. ChatGPT pausiert und wird hier informiert, um bei Bedarf direkt einsteigen zu können.
- **Letzter geprüfter Stand:** siehe letzter Eintrag in `docs/STATUS.md`; CI „Tests & Pages“ am jeweiligen Commit maßgeblich.
- **Zuletzt erledigt (Claude, 16.10.):**
  1. Finanz-/Verpflichtungsreview v3-Editor (574dded): vier Kostenkorrekturen (Zusatzposten entfernen, Mietwagen-Sprit, stornierte Unterkunft = offen, Parken bei Auto-Abschnitten). **Check-in-Regel:** Online-Check-in darf bei gebuchten Abschnitten nachgetragen werden; Zeiten, Strecke, Preis, Anbieter, Nummer bleiben geschützt.
  3. **`V3_EDIT=true`** (Philipps Wahl, 16.10.): Storno-/Erstattungs-/Abschnittsdialoge für alle freigeschaltet; Tests prüfen den gesperrten Rückfall mit erzwungenem `false`.
  2. Konto-Lebenszyklus (P0.3, nach Philipps Freigabe gepusht): Migration `20261016120000_account_lifecycle.sql` (Besitzerwechsel, Übersicht, Export, Löschung) plus Konto-Bereich in der App. Tests: `tests/db/account.cjs`, E2E-Löschung über die Oberfläche.
- **Tests:** `npm test`, `test:browser`, lokal mit Docker auch `db lint`, `test:db`, `test:e2e` grün (Tipp: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start`, falls public.ecr.aws gesperrt ist). Kein iPhone-Test.
- **Offen / nächster Schritt:** Produktion (Katalog v4, Kontomigration) aus Claudes Umgebung nicht prüfbar. Danach P0.4 Speicheradapter. Dein unveröffentlichtes Paket „Planungswege/Register-UI“ vom 15.10. abends ist nicht auf `main`; bei Wiedereinstieg bitte von `main` neu ansetzen.

## Verbindlicher Ablauf für jede Änderung

1. Vor Arbeitsbeginn den neuesten Stand von `main`, `AGENTS.md`, `docs/STATUS.md` und die betroffenen Dateien lesen. Das konkrete Ausgangs-Commit notieren. Bei größeren Aufgaben im passenden GitHub-Issue kurz Ziel, betroffene Dateien und offene Fragen festhalten.
2. Nur eine abgegrenzte Änderung bearbeiten. Bei Überschneidung mit einer angekündigten laufenden Arbeit zuerst im Issue abstimmen. Eine Ankündigung ist kein exklusives Schloss; vor dem Schreiben trotzdem neu prüfen.
3. Tests ausführen (`npm test` mindestens bei Codeänderungen). Echte Browser-/iPhone-Tests nur dann als bestanden melden, wenn sie tatsächlich durchgeführt wurden.
4. Unmittelbar vor dem Push den neuesten `main`-Commit erneut prüfen. Hat er sich seit dem Ausgangsstand geändert, fremde Änderungen zuerst lesen und die eigene Arbeit darauf integrieren, dann die betroffenen Tests wiederholen. Bei unklaren Konflikten nicht pushen, sondern im Issue konkret um Abstimmung bitten.
5. Den fertigen Commit **selbst** direkt nach `main` pushen. Kein neuer Branch, kein Force-Push und kein stilles Ersetzen einer Datei aus einem alten Stand. Eine bedingte Aktualisierung der Branch-Referenz (erwartete vorherige Commit-ID) ist Pflicht, wenn über die GitHub-API geschrieben wird. Schlägt sie fehl, neu lesen und integrieren; nicht einfach wiederholen.
6. `docs/STATUS.md` mit Änderung, nachgewiesenen Tests, Grenzen und nächstem Schritt aktualisieren. Im zugehörigen Issue Commit-Link und Übergabe hinterlassen, damit der nächste Beteiligte den Stand ohne privaten Chat nachvollziehen kann.

## Themen und Verantwortung

- GitHub-Issues sind der asynchrone Abstimmungskanal für Arbeitspakete, Fragen und Konflikte. Keine privaten Reisedaten, Zugangsdaten oder Sicherungsdateien posten; das Repo ist öffentlich.
- `docs/STATUS.md` beschreibt den überprüften Ist-Stand; `docs/ROADMAP.md` die nächsten Vorhaben. Nicht erledigte Punkte nicht als fertig markieren.
- `index.html` ist die maßgebliche App-Datei. Ein Chat-Anhang ist erst dann neuer Projektstand, wenn sein Unterschied geprüft, getestet und auf `main` committed wurde.
- Wer eine Änderung beginnt, verantwortet ihren Test, Push und eine lesbare Übergabe. Philipp entscheidet bei Produkt- oder Prioritätskonflikten.

Diese Regeln koordinieren parallele Arbeit, garantieren aber keine automatische Echtzeit-Kommunikation zwischen den KI-Diensten. Wer Claude oder ChatGPT eine neue Aufgabe gibt, verweist auf dieses Dokument und das betreffende GitHub-Issue.

## Backend, Datenbank und Veröffentlichung (seit v3.0, Issue #6)

- Schemaänderungen nur als **neue** Datei in `supabase/migrations/`. Bereits eingespielte Migrationen nie ändern. Keine Schlüssel, Passwörter oder Projekt-Refs ins Repository; im Frontend nur Projekt-URL und Publishable Key über `config.js` bzw. Build-Variablen.
- Wer `Store`, `Sync`, `Auth`, `cloud.js` oder die Migrationen ändert, führt mit Docker `supabase start`, `npm run test:db` und `npm run test:e2e` aus. Ohne Docker muss der CI-Job `database` am konkreten Commit grün sein. Ergebnis mit Commit in STATUS und im Issue notieren.
- Veröffentlicht wird nur über den Workflow „Tests & Pages“ von `main` nach grünen Prüfungen. Keine Handveröffentlichungen, kein zweites Produktionsprojekt.

## Aktive Kommunikationsprüfung (Philipp, 14.10.2026)

Ohne weitere Erinnerung durch Philipp: relevante Issues samt neuen Kommentaren und den aktuellen main-Stand zu Arbeitsbeginn, nach jedem größeren abgeschlossenen Arbeitsschritt (bei längeren Paketen spätestens etwa alle zehn Minuten), vor Änderungen an gemeinsam betroffenen Dateien und unmittelbar vor Commit/Push prüfen. Neue Entscheidungen in die laufende Arbeit aufnehmen; bei Überschneidungen im Issue konkret abstimmen. Nach dem Push eine nachvollziehbare Übergabe hinterlassen. Keine Behauptung über eine Antwort von Claude, solange keine vorliegt. Dies gilt während aktiver Arbeit; es ist kein Hintergrundmonitor nach Ende des Chats.

Philipp bestätigt ausdrücklich: fertige, geprüfte Änderungen an Freadeax/Reiseplaner selbst nach main pushen. Vor Beginn, bei wichtigen Zwischenständen oder Planänderungen und nach Abschluss/Push im gemeinsamen Issue Bescheid geben; auf neue Kommentare reagieren.

Ergänzung Philipp, 15.10.: Offene Fragen des anderen Beteiligten während aktiver Entwicklung zeitnah beantworten und ein klar abgegrenztes eigenes Arbeitspaket benennen. Nicht nur gegenüber Philipp über wartende Nachrichten berichten. Wenn nachweislich beidseits kein Paket mehr läuft und mindestens zehn Minuten keine neue Aktivität vorliegt, die aktive Runde bis zum nächsten Nutzerauftrag beenden. Laufende Arbeit weiterführen; zehn Minuten ohne Antwort sind weder Zustimmung noch eine Freigabe. Nach Ende des Chats keinen Hintergrundmonitor behaupten.
