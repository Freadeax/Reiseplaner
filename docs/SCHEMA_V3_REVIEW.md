# Vorprüfung Datenvertrag v3 · 15.10.2026

## Nachtrag: Review-Runde 2 und API-Prüfung

c69c6ab berücksichtigt die wesentlichen Korrekturen der ersten Runde: unabhängige Erstattungen, Gebühren alter Unterkünfte weiter aggregieren, kein Zubringerpreis aus der alten Zielstrecke, Aufteilung nur tatsächlich geflossener Beträge und Feldtreue. Diese Rechenbasis ist im Issue bestätigt; das ist keine Produktionsfreischaltung.

R2-Bedingungen: Datum/Uhrzeit/Zeitzone dürfen unbekannt sein. DST-Lücken ablehnen, mehrdeutige Ortszeiten ungeprüft lassen; ohne vollständigen Zeitpunkt kein behaupteter UTC-Termin oder sicherer Anschluss. Ohne Datum auch keinen ganztägigen Termin erfinden. Unbekannte Gebühr ist nie abgeschlossen. Arrays/IDs/Referenzen begrenzen und prüfen, Historie beim Entfernen erhalten. Ein v3-lesender Client muss v3 vollständig erhalten; leere v3-Felder dürfen nicht in v2-Dateien gelangen. Mitreisenden-Namen sind bei Kontoreisen synchronisiert/geteilt, nicht ausschließlich lokal. Mehrere Zahler und schon erfolgte private Ausgleichszahlungen bleiben ausdrückliche MVP-Grenzen.

9097f46 setzt R2 in reinen Funktionen um. Zusätzliche, ausgeführte Node-Repros an Claude gemeldet:

| Repro | Ausgabe in 9097f46 | Erforderliche Regel |
| --- | --- | --- |
| `cancelMath({paid:50}, null)` | Kosten 0, Erstattung offen 50 | Unbekannte Planbasis ist keine bekannte Null und begründet keine Überzahlung |
| Abschnitt mit `status:'offen', paid:0, cancel.fee:null` entfernen | `ok:true` | Unbekannte Gebühr bleibt geschützt |
| Gleicher Fall mit unbezahlter Gebühr 100 | `ok:true` | Offene Gebühr bleibt geschützt, unabhängig vom früheren Buchungsstatus |

Freischaltbedingung ergänzend: v3 lesen genügt nicht, wenn die sichtbare v2-Kosten-/Budget- und Verpflichtungslogik Transport/Storno ignoriert. Bis zur vollständigen Verdrahtung braucht es ein Kompatibilitäts-Gate oder eine klar begrenzte schreibgeschützte Ansicht ohne falsche Kostenzusagen. E2 in Produktion separat bestätigen; erfolgreicher lokaler Stack, Preview oder CI beweist diesen Stand nicht.

Die folgenden Abschnitte dokumentieren den ursprünglichen Reviewstand vor diesen Überarbeitungen.

Review durch ChatGPT auf Basis von Claudes Vorschlägen in [#8](https://github.com/Freadeax/Reiseplaner/issues/8#issuecomment-6193378536), seiner [Korrektur zum Versionsschutz](https://github.com/Freadeax/Reiseplaner/issues/8#issuecomment-6193400570) und dem gemeinsamen Entwicklungsplan.

Dies ist eine Vorprüfung, kein verabschiedeter Datenvertrag und keine Umsetzung. Der gemeinsame Entwurf für Anreiseabschnitte, Storno, Ausgaben/Aufteilung und Tagebuch liegt noch nicht vollständig vor. Produktionsmigration und Finanzsemantik sind nicht freigegeben.

## Storno: Erstattungen müssen die Nettozahlung verändern

Der Vorschlag `cancel = {on, fee, refund}` erhält `paid` als historisch gezahlten Betrag. `refund` bezeichnet tatsächlich erhaltenes Geld, keine erwartete Erstattung. Bei bekannter Gebühr muss die Rechnung daher von `netPaid = paid − refund` ausgehen:

- Restgebühr offen: `max(0, fee − netPaid)`.
- Erstattung offen: `max(0, netPaid − fee)`.
- Gesamtkosten des stornierten Postens: `fee`; Geldbewegungen werden daneben ausgewiesen.
- Bei unbekannter Gebühr bleiben beide offenen Beträge unbekannt. Bekannte Zahlungen und erhaltene Erstattungen bleiben sichtbar.
- Erst je Posten rechnen, dann die beiden offenen Beträge getrennt summieren. Keine Verrechnung zwischen Posten.

`max(0, fee − paid)` reicht nicht: Eine bereits erhaltene Erstattung kann die wirksame Zahlung unter die Gebühr senken. Ob solche Fälle erlaubt werden oder als widersprüchlich abgelehnt werden sollen, ist eine offene Produktentscheidung. Sie dürfen nicht als ausgeglichen erscheinen.

| Fall | paid | fee | refund erhalten | netPaid | Gebühr offen | Erstattung offen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Anzahlung kleiner als Gebühr | 20 | 100 | 0 | 20 | 80 | 0 |
| Gebühr kleiner als Zahlung | 200 | 50 | 0 | 200 | 0 | 150 |
| Erstattung erledigt | 200 | 50 | 150 | 50 | 0 | 0 |
| Teilweise erstattet | 200 | 50 | 100 | 100 | 0 | 50 |
| Kostenfrei ohne Zahlung | 0 | 0 | 0 | 0 | 0 | 0 |
| Alles erstattet, Gebühr bleibt | 200 | 50 | 200 | 0 | 50 | 0 |
| Gebühr nach Erstattung erhöht | 200 | 100 | 150 | 50 | 50 | 0 |

Die Fälle mit Rückzahlung über `paid − fee` sind durch die bisher vorgeschlagene Grenze `refund ≤ paid` ausdrücklich möglich. Gebühr- und Zahlungsänderungen müssen dieselben Regeln wie die Ersterfassung erfüllen. Geldbeträge als endliche Werte mit festgelegter Cent-Rundung validieren; `null` bedeutet unbekannt, `0` ausdrücklich kostenlos.

## Storno zurücknehmen darf Erstattungen nicht löschen

Der bisherige Vorschlag entfernt bei „Storno zurücknehmen“ das gesamte `cancel` und behält `paid`. Damit verschwindet ein dort gespeichertes `refund` aus der Finanzrechnung. Beispiel: 200 gezahlt, 150 zurückerhalten würde wieder als 200 bezahlt erscheinen.

Vor Umsetzung muss der gemeinsame Vertrag einen sicheren Weg festlegen: erhaltene Erstattungen unabhängig vom Storno als Geldbewegungen erhalten, oder das Zurücknehmen bei vorhandener Erstattung sperren und einen ausdrücklichen Korrekturweg anbieten. Ein Sicherungspunkt ersetzt diese Regel nicht. Keine automatische Änderung historischer Zahlungen.

## Weitere notwendige Entscheidungen

| Bereich | Vor Umsetzung festlegen und prüfen |
| --- | --- |
| Versionsschutz | Einmal v3 bleibt v3. Keine Rückstufung beim Entfernen des letzten neuen Felds. Server schützt auch vor gecachten Alt-Clients. |
| Unterkunft | Ein finanzieller Sachverhalt darf nicht zugleich über `offer.cancel` und `ledger.cancel` doppelt zählen. Stabile Zuordnung und Vorrang definieren. |
| Entfernte Posten | Zahlung, Erstattung und Stornogebühr bleiben mit stabiler ID erhalten, auch nach Entfernung eines Programmpunkts. Keine Verrechnung mit anderen Posten. |
| Termine | Stornieren löscht keine Termine. Entfernen/Umplanen braucht eine ausdrückliche Vorschau; offene Gebühr/Erstattung und historische Daten bleiben sichtbar. |
| Anreiseabschnitte | Stabile IDs, Reihenfolge, Zeitzonen, Datumswechsel und Anschlusszeiten; bekannte, geschätzte und fehlende Kosten getrennt. Bestehende Gesamtkosten nicht zusätzlich zu Abschnittskosten zählen. |
| Ausgaben und Aufteilung | Ausgabe, Zahlung, Erstattung und Kostenübernahme unterscheiden. Unterkunftszahlungen und zusätzlich erfasste Ausgaben nicht doppelt zählen. Zahler-IDs und Rundungsrest nachvollziehbar behandeln. |
| Sicherung und Sync | v2-Import, v3-Export/Import, Wiederherstellung, Konfliktkopie und unbekannte Serverversionen testen. Fehlerhafte Datei vollständig zurückweisen, kein Teilimport. |
| Grenzen | Keine Flugverfügbarkeit, Stornobedingung, Erstattungszusage oder Wechselkurs aus fehlenden Angaben ableiten. |

## Prüfstand

Die Rechentabelle wurde separat mit JavaScript nachgerechnet. Noch keine produktive Berechnung, Schemaänderung oder Datenmigration implementiert. Nach Claudes vollständigem Entwurf folgt das gemeinsame Review einschließlich Rechen-, Import-/Export-, Konflikt- und Datenbankfällen. Der vorhandene Client-Schutz für nicht lesbare Serverzeilen ist bereits ein eigenes v2-Paket; er ersetzt nicht den noch offenen serverseitigen Downgrade-Schutz.
