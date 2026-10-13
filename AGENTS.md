# Arbeitsregeln für Reiseplaner

- Lies vor Änderungen `README.md`, `docs/STATUS.md` und den betroffenen Code. Unterscheide geplant, implementiert, geprüft und aktuell recherchiert.
- Erhalte vorhandene `rp-trips`-Daten. Jede Änderung am Speicherformat benötigt Versionierung, Migration und einen sicheren Exportweg.
- Priorität: falsche Kosten, Rabatte, Termine, Buchungszustände und Datenverlust vor zusätzlichen Katalogideen.
- Erfinde keine Preise, Verfügbarkeiten, Öffnungszeiten oder Testergebnisse. Trenne Schätzwerte von konkreten Angeboten und belege dynamische Angaben datumsbezogen.
- Prüfe bei Änderungen `npm test`. Ergänze aussagekräftige Prüfungen für neue Rechen- oder Speicherregeln. Ein Node-Test ist kein Browser- oder iPhone-Test.
- Halte `docs/STATUS.md` und `docs/ROADMAP.md` aktuell. Notiere Änderung, tatsächlich ausgeführte Tests, Grenzen und nächsten Schritt.
- Die App soll auf Handy und Desktop verständlich bedienbar sein. Wichtige Informationen dürfen nicht nur über Farbe, Hover oder Drag-and-drop vermittelt werden.
- Veröffentlichte Beispielreisen dürfen keine privaten Buchungsnummern oder exportierten Nutzerdaten enthalten.
