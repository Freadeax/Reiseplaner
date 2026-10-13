# Zusammenarbeit auf einem Branch

Philipp, Claude und ChatGPT arbeiten möglicherweise gleichzeitig am Reiseplaner. Das öffentliche Repository ist die gemeinsame technische Quelle; ein Chat bei einem Anbieter ist **kein** gemeinsamer Nachrichtenkanal. Claude und ChatGPT können einander nicht automatisch direkt anschreiben. Alle wichtigen Entscheidungen, Konflikte und Übergaben müssen daher hier beziehungsweise in GitHub-Issues nachlesbar sein.

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
