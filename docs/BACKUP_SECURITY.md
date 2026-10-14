# Passwortschutz für Reise-Sicherungen

Implementiert am 14.10.2026, Arbeitspaket #4. Keine Änderung des lokalen Reiseformats oder der Kostenberechnung.

## Was geschützt wird

Die optionale Exportdatei enthält den vorhandenen v1/v2-Reiseexport als verschlüsselten Inhalt. Titel, Reisenotizen, Angebotslinks und Reisedaten werden nicht als Klartext in die Exporthülle geschrieben. Der generische Dateiname enthält nur das Exportdatum.

Nicht geschützt: `rp-trips`, lokale Sicherungspunkte, Klartext-Exporte, bereits geöffnete Reiseinformationen und ein kompromittierter Browser/Computer. Passwörter werden nicht in Browser-Speicher, Reiseobjekten oder Exportdateien abgelegt. Eingabefelder werden nach Start der Verarbeitung geleert; Schließen eines Dialogs verwirft das noch laufende UI-Ergebnis. JavaScript kann keine vollständige Löschung aller temporären Zeichenketten im Arbeitsspeicher garantieren. Kein unabhängiges Sicherheitsaudit; keine absolute Sicherheitszusage.

## Formatvertrag

| Feld | Festes Format |
| --- | --- |
| `format` | `reiseplaner-encrypted-backup` |
| `version` | `1` |
| `cipher` | `AES-256-GCM` |
| `kdf` | `PBKDF2-SHA-256` |
| `iterations` | `600000` |
| `salt` | Standard-Base64, 16 zufällige Bytes |
| `iv` | Standard-Base64, 12 zufällige Bytes |
| `ciphertext` | Base64 der verschlüsselten UTF-8-JSON-Daten mit 128-Bit-GCM-Tag |

Authentifizierte Zusatzdaten sind die UTF-8-JSON-Darstellung der geordneten Liste `[format, version, cipher, kdf, iterations, salt, iv]`. Die Exportfunktion erzeugt Salz und IV mit `crypto.getRandomValues`. Der abgeleitete Schlüssel ist nicht exportierbar. Parameter werden vor Schlüsselableitung strikt geprüft; beliebige Iterationszahlen aus importierten Dateien werden nicht ausgeführt.

Mindestlänge für neu erstellte Sicherungen: 12 Zeichen. Eine lange, einzigartige Passphrase ist empfohlen. Ein langes, aber vorhersehbares Passwort ist nicht automatisch stark. Wiederherstellung braucht das exakte Passwort; keine automatische Unicode-Normalisierung oder Leerzeichenentfernung. Verlust des Passworts bedeutet, dass diese Datei nicht wiederhergestellt werden kann.

## Import und Fehler

- Web Crypto benötigt einen unterstützten sicheren Browserkontext, üblicherweise HTTPS oder localhost. Bei fehlender Unterstützung verständliche Ablehnung; kein Downgrade auf selbstgeschriebene Verschlüsselung.
- Maximal 5 MiB Klartext-Inhalt, 8 MiB eingelesene Hülle. Base64, Salz/IV-Länge, Parameter, Authentifizierung, UTF-8, JSON und Reiseformat werden geprüft.
- Erst nach erfolgreicher Entschlüsselung erfolgt die unverändernde Importvorschau. Falsches Passwort und Manipulation führen zu einer gemeinsamen Fehlermeldung; keine Reise wird gespeichert.
- Gleiche Reise-ID: nur überspringen oder als zusätzliche Kopie importieren. Abweichungen und identischer Inhalt werden sichtbar; das Feld `updated` wird beim Inhaltsvergleich ignoriert. Kein stilles Zusammenführen von Buchungsdaten.
- Import wird als ein lokaler Speicherzugriff vorbereitet. Scheitert dieser, bleibt der bisherige In-Memory-Reisestamm erhalten; es wird kein Importerfolg gemeldet. Bereits bestehende Konfliktprüfung gegenüber anderen Browseransichten bleibt aktiv. Das ist keine atomare Mehrbenutzerdatenbank.
- Klartext v1/v2 bleibt kompatibel. Ältere Apps können die neue verschlüsselte Hülle nicht lesen; zum Austausch gegebenenfalls bewusst Klartext exportieren und privat behandeln.

## Quellen und Prüfungen

Web-Crypto-Verwendung anhand der offiziellen API-Dokumentation geprüft:
- [SubtleCrypto.deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)
- [AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)

`tests/secure-backup.cjs` nutzt die echte Node-WebCrypto-Implementierung für Rundlauf, Zufallswerte, falsches Passwort, Manipulation, Parameter- und Größenlimits, fehlende Kryptounterstützung, v1-Kompatibilität, unverändernde Vorschau und Import-Rollback. Der vorhandene Chromium-Test wurde um Export, Entschlüsselung, falsches Passwort und Konfliktvorschau erweitert. Tatsächliche Ausführung und CI-Ergebnis werden im Status und Issue #4 dokumentiert. Kein echter iPhone-/Safari-Test.
