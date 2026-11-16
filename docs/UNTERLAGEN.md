# Unterlagen & Buchungen · zentraler Speicher (M11, Umsetzung)

Stand 16.11.2026, Claude (Thread „Dokumente und Buchungen zentral speichern“). Grundlage: Planung M11
(`pakete/planung/docs/planung/module/M11_UNTERLAGEN.md`), Datenvertrag [`SCHEMA_V5.md`](SCHEMA_V5.md) Feld `docs`,
Entscheidung Philipp 23.10. „Unterlagen lokal, Cloud nur auf Wahl“.

## 1 · Ziel

Ein Ort je Reise für alles, was man unterwegs vorzeigen muss: Bahn- und Flugtickets, Bordkarten, Fährtickets,
Hotelbestätigung, Mietwagen-Voucher, Eintrittskarten, Gutscheine, Versicherungsnachweis. Dazu Buchungsnummern und
Codes, die bisher höchstens in den Notizen standen. **Offline nutzbar**, ohne dass die Daten das Gerät verlassen.

Gleichzeitig ein **Buchungsüberblick**: Welche Buchungen hat die Reise (Unterkunft, Anreise-Abschnitte, gebuchte
Posten aus dem Zahlungsbuch), welchen Status haben sie, und liegt die passende Unterlage schon bereit?

## 2 · Was gebaut wird (Stufe 1, jetzt)

| Teil | Datei | Inhalt |
| --- | --- | --- |
| Ablage `RPFiles` (M11.1) | `docstore.js` | IndexedDB `rp-files` (getrennt von Fotos `rp-media`), Einträge + Dateien, SHA-256 beim Schreiben und vor dem Anzeigen, Rücklesevergleich, je Konto getrennt (`scope` wie `Store.scope`), Grenzen, reine Prüf- und Umwandlungsregeln |
| Bereich „Buchungen & Tickets“ (M11.3) | `app/unterlagen.js` | neuer Teil im Bereich „Unterlagen“ (`#r-<id>-buchungen`): Buchungsliste mit Status und verknüpften Unterlagen, weitere Unterlagen, Hinzufügen/Bearbeiten/Ansehen/Löschen, Speicheranzeige |
| Heute-Hilfe (U5) | `app/unterlagen.js` `untForDate` | Unterlagen eines Datums (verknüpfter Abschnitt/Termin/Anreisetag oder Gültigkeitsbeginn) |

**Speicherort:** Liste, Dateien und Codes liegen nur auf diesem Gerät, in diesem Browser. Die Reise-JSON (`rp-trips`,
Konto-Sync, Sicherung) bleibt in Stufe 1 **unverändert**. Format 5 wird seit 16.11. geschrieben (`F5_WRITE = true`, 3931111); der Spiegel nach `t.docs` ist ein eigener nächster Schritt.

**Datenschutz (M11 §6 Regel 1):** Unterlagen erscheinen nicht in Reisemappe-Druck, Teilen-Text, Kalenderdatei,
Reisebuch, Vorlagen oder Sicherungsdatei. In Stufe 1 ist das schon dadurch gegeben, dass sie getrennt gespeichert sind.
Codes sind verdeckt („•••• 42“) und werden erst per Tipp angezeigt. Fehlermeldungen nennen nie Titel, Code oder Inhalt.

**Offline:** Die App-Schale kommt aus dem Service-Worker-Cache, die Unterlagen aus IndexedDB. Beim ersten Hinzufügen
fragt die App dauerhaften Speicher an (`navigator.storage.persist()`). Hinweis in der Oberfläche: Der Browser kann
Website-Daten löschen; wichtige Tickets zusätzlich dort aufheben, wo sie herkommen (Mail, Anbieter-App).

**Grenzen:** PDF, JPEG, PNG; höchstens 15 MB je Datei, 200 Einträge und 200 MB je Reise. Dieselbe Datei nur einmal je
Reise (Prüfsumme). Dateiart wird an den ersten Bytes erkannt, nicht nur an der Endung.

**Buchungsüberblick:** liest nur vorhandene Daten, keine neue Quelle für Status oder Preis.
- Unterkunft: aktives Angebot (`activeOffer`), „gebucht“ aus `offer.booked`, Datum = Anreise. Verknüpfung `offer:<id>`.
- Anreise: Abschnitte `t.transport.out/back`, Status aus `t.ledger['tr:<id>']`, Datum aus `dep.date`. Verknüpfung `tr:<id>`.
- Unternehmungen und Posten: Zahlungsbuch-Zeilen mit Status „angefragt“ oder „gebucht“; `act:<id>` bzw. `ledger:<key>`.
- „Gebucht, aber noch keine Unterlage auf diesem Gerät“ ist ein Hinweis, kein Fehler (Auto-Anreise braucht keinen).
- Verknüpfung auf etwas, das es nicht mehr gibt, bleibt stehen: „Verknüpfung nicht mehr vorhanden“ (M11 Regel 5).

## 3 · Stufe 2 (umgesetzt 16.11. abends)

- **Eintrag in der Reise** (`t.docs`, Format 5) über `f5Commit`: Häkchen „In der Reise vermerken“ im Formular. Gespeichert werden
  Titel, Art, Verknüpfung, Gültigkeit und Dateiangaben (Prüfsumme, Größe, Typ), **nie Code, Dateiname oder Notiz**
  (`secret:{label, value:null, local:true}`, `share:'mitglieder'`, `cloud:{state:'none'}`). Vorausgewählt nur, wenn die Reise schon
  Format 5 ist; sonst fragt der erste Klick nach dem Umstellen, erst der zweite speichert (nichts vorher).
- **Zweites Gerät / Mitreisende:** Einträge ohne Datei hier erscheinen mit „Datei auf einem anderen Gerät“; Blatt mit
  „Datei hier hinzufügen“ (gleiche ID) und „Eintrag entfernen“ (zwei Schritte). Der Hinweis „noch keine Unterlage“ gilt weiter je Gerät.
- **Löschen** einer Unterlage entfernt auch ihren Eintrag in der Reise (mit Hinweis). Ohne Schreibrecht bleibt der Eintrag und die Meldung sagt das.
- **Reise löschen** nennt im Bestätigungsschritt „Dabei werden auch 2 Unterlagen (2 KB) auf diesem Gerät gelöscht“ und räumt danach `rp-files` dieser Reise auf.
- **Notizen-Assistent (M11.7):** findet Buchungsnummern, PNR, Auftrags-/Reservierungs-/Bestätigungsnummern und PIN mit Code (mindestens eine Ziffer
  oder 6 Großbuchstaben), zeigt sie verdeckt; „übernehmen“ legt je Fund eine Unterlage an und ersetzt nur den Code in den Notizen durch „(in „Tickets“)“.
- Offen: Sicherung mit Unterlagen auf ausdrückliche Wahl (M11.5), Aufräumen von Unterlagen zu Reisen, die auf einem anderen Gerät gelöscht wurden.

## 4 · Später (eigene Entscheidung nötig)

- Cloud-Kopie je Unterlage (Bucket `trip-docs`, M11.6), Freigabe an Mitreisende: erst nach Entscheidung, Philipp 23.10.: „nur auf Wahl“.
- Assistent „Buchungsnummern aus Notizen in die Mappe verschieben“ (M11.7).
- Hinweis bei Gültigkeit vor Reiseende (z. B. Versicherung) in den Fristen (M02).

## 5 · Tests

- `tests/unterlagen.cjs` (Node, In-Memory-IndexedDB): Dateiart-Erkennung, Prüfsumme, Grenzen, Dubletten, Rücklesevergleich,
  Kontingentfehler ohne Teilerfolg, beschädigte Datei, Konto-Trennung, `toTripDoc` gegen `validateV5`,
  Buchungsüberblick und `untForDate` mit Beispielreise.
- Browser (Chromium): Bereich öffnen, Unterlage mit synthetischem PDF hinzufügen, anzeigen, nach Neuladen offline vorhanden.
- Nicht getestet: echtes iPhone, WebKit-Speicherräumung.
