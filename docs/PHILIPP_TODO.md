# Was Philipp noch erledigt

Stand 14.10.2026, nach erfolgreichem iPhone-Nutzertest. Diese Liste betrifft Zugang/Entscheidungen, nicht Entwicklungsaufgaben.

## Erledigt

- GitHub Pages, öffentliche Variablen und die richtige Supabase-URL stehen laut Claude korrekt.
- Kernschema und Umkreis-Katalog kamen über die GitHub-Integration. Keine SQL-Datei erneut ausführen.
- Philipp meldet: „iPhone test passt alles habs bei mir getestet“. Erfolgreicher eigener Gerätetest dokumentiert. Einzelne Testschritte/Buildnummer wurden nicht genannt; daraus wird kein künstliches Testprotokoll erzeugt.

## Jetzt notwendig

1. **E-Mail-Domain nennen:** Welche vorhandene Domain im Cloudflare-Konto soll für den Reiseplaner verwendet werden? Gewünschte Absenderadresse nennen, z. B. `reisen@DEINE-DOMAIN`. Domainname genügt; keine Schlüssel im Chat/Repo.
2. **SMTP-Zugang einrichten:** Nach gemeinsamer Dienstwahl den Dienst verbinden und dessen domainbezogene DNS-Einträge in Cloudflare setzen. SMTP-Host/Port/Benutzer/Kennwort sowie Absender nur in Supabase → Authentication → E-Mail/SMTP eintragen. Keine Zugangsdaten ins öffentliche Repository. Konkrete Dienst-/Tarifwahl und DNS-Werte fehlen noch und werden nicht erfunden.
3. **Externe Anmeldung abnehmen:** Sobald SMTP steht, mit einer Adresse außerhalb des Supabase-Projektteams Registrierung, Bestätigungslink und Passwort-Reset testen. Mit einem zweiten Konto eine Reise teilen; Lesen/Bearbeiten prüfen. Nur falls diese konkreten Punkte nicht schon im eigenen Test enthalten waren. Der allgemeine iPhone-Test muss nicht erneut wiederholt werden.

## Vor breiter öffentlicher Freigabe

4. **Betreiber und Kontaktweg festlegen:** Wer betreibt das Projekt, welche Kontaktadresse ist vorgesehen? Diese Angaben werden für passende Betreiber-/Datenschutztexte benötigt. Umsetzung und Datenflussbeschreibung übernimmt die Entwicklung.
5. **Lizenzentscheidung:** Soll der öffentliche Quellcode ausdrücklich als Open Source freigegeben werden? Lizenzwahl bleibt offen. Ein öffentliches Repository allein legt keine Lizenz fest.

## Keine Aufgabe für Philipp

- Neue Datenmodelle, Rechte, Kontolöschung/-export, Besitzerwechsel, Backup/Restore-Verfahren, Zeitplanung und Anbieteradapter entwickeln/testen wir im Repository.
- Keine Migration doppelt einspielen, keine zweite Datenbank erstellen, keine privaten Reisen im öffentlichen Issue posten.
- Das Silvester-Beispiel bleibt ehrlich als Plan über Budget stehen, bis echte Alternativen vorliegen; kein Handlungsdruck für eine automatische Kürzung.
