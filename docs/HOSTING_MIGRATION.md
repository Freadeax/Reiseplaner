# Hosting: GitHub Pages heute, Cloudflare Pages später

Stand 14.10.2026 · Issue #6. Website und Daten sind getrennt: Die Website besteht nur aus statischen Dateien (`public/`), die Daten liegen im **einen** Supabase-Projekt. Ein Host-Wechsel ändert nur die Website-Adresse. Konten und online gespeicherte Reisen bleiben erhalten. Es gibt keine zweite Produktionsdatenbank und keinen Datenreset.

## Wie gebaut und veröffentlicht wird

| | Wert |
| --- | --- |
| Build-Befehl | `npm run build` (Node ≥ 20, `.node-version` = 22, keine Abhängigkeiten) |
| Ausgabeordner | `public/` (nur die Dateien aus `FILES` in `scripts/build.mjs`: `index.html`, `app.css`, `app/*.js`, die Skripte im Hauptordner, Katalogkacheln, `404.html`, `sw.js`, `config.js`, Manifest, Icons, `vendor/supabase-js-*.js` + Lizenz) |
| Öffentliche Variablen | `RP_SUPABASE_URL`, `RP_SUPABASE_PUBLISHABLE_KEY`, optional `RP_SITE_URL`, `RP_BASE_PATH` |
| Routing | Hash-Routing (`#reisen`, `#r-<id>-<reiter>`, `#konto`). Direkte Links und Neuladen funktionieren ohne Server-Regeln. `404.html` leitet unbekannte Pfade zur App. Supabase-Rückkehr über `?code=`, Einladungen über `?einladung=` |
| Prüfung | `npm run check:artifact`: nur erlaubte Dateien, keine Secret-/service_role-Schlüssel, keine Datenbank-Passwörter |

### GitHub Pages (aktuell)

- Adresse: `https://freadeax.github.io/Reiseplaner/`, `RP_BASE_PATH=/Reiseplaner/`.
- Workflow `.github/workflows/tests.yml` („Tests & Pages“):
  - Prüfungen: `app` (Node), `browser` (Chromium) und `database` (lokaler Supabase-Stack mit Migrationen, Linter, API-Rechtetest und E2E).
  - Danach `build`: Artefakt erzeugen, prüfen und hochladen.
  - `deploy` läuft nur auf `main` und nur wenn `vars.PAGES_ENABLED == 'true'`.
  - Rechte: global `contents: read`, nur der Deploy-Job hat `pages: write` und `id-token: write`.
- Einmalig: *Settings → Pages → Build and deployment → Source: GitHub Actions* und die Variablen aus `docs/SUPABASE_SETUP.md` setzen.

## Wechsel zu Cloudflare Pages

1. **Projekt anlegen:** Im Cloudflare-Dashboard *Workers & Pages → Create → Pages → Connect to Git* das Repository `Freadeax/Reiseplaner` verbinden.
2. **Build-Einstellungen:**
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `public`
   - Root directory: Repository-Wurzel
3. **Variablen** unter *Settings → Environment variables*, für Production und, falls gewünscht, für Preview:
   - `RP_SUPABASE_URL` und `RP_SUPABASE_PUBLISHABLE_KEY`: dieselben Werte wie bei GitHub
   - `RP_BASE_PATH=/`, weil Cloudflare die App im Wurzelpfad ausliefert
   - optional `RP_SITE_URL=https://<projekt>.pages.dev/`
   - `NODE_VERSION` ist nicht nötig, weil `.node-version` vorhanden ist (Cloudflare-Standard ist laut Doku Node 22)
   - Keine Secrets eintragen.
4. **Supabase → Authentication → URL Configuration:** Redirect URLs um `https://<projekt>.pages.dev/` ergänzen, für Vorschauen optional `https://*.<projekt>.pages.dev/**`. Die GitHub-Adresse **bleibt** zunächst eingetragen.
5. **Prüfen auf der neuen Adresse:** Start, `#konto`, Neuladen, Anmeldung, Passwort-Reset (Link öffnet die neue Adresse), Einladung annehmen, eine Reise ändern und auf der alten Adresse sehen.

### Übergangsphase (beide Adressen aktiv)

- Beide Websites sprechen mit demselben Supabase-Projekt. Konten und Online-Reisen sind auf beiden gleich.
- **Browser-Speicher wird nicht übertragen.** Er hängt an der Domain, und auch die Anmeldung muss auf der neuen Adresse neu erfolgen. Vor dem Umstieg auf der alten Adresse:
  1. angemeldet „Jetzt synchronisieren“ wählen, bis die Anzeige **„Online gespeichert“** zeigt und keine Änderung mehr aussteht,
  2. Gast-Reisen (ohne Konto) über „Ansehen und ins Konto übernehmen“ übernehmen oder über „Reisen sichern“ als Datei exportieren und auf der neuen Adresse importieren.
- Einladungslinks enthalten die Adresse, auf der sie erstellt wurden, und funktionieren dort, solange beide Adressen in der Redirect-Liste stehen.
- Die Site URL in Supabase erst auf die neue Adresse umstellen, wenn diese geprüft ist. Sie bestimmt die Standard-Weiterleitung in E-Mails. Die App gibt bei Registrierung und Passwort-Reset die aktuelle Adresse als `redirectTo` mit, deshalb reicht die Allowlist.

### Rückkehr bei Fehlern

- GitHub Pages bleibt während der Übergangsphase unverändert aktiv. Bei Problemen einfach die alte Adresse weiter nutzen, die Daten sind dieselben.
- Erst nach stabilem Betrieb: `PAGES_ENABLED` auf `false` setzen und optional unter *Settings → Pages* deaktivieren. Die GitHub-Adressen aus der Redirect-Liste erst danach entfernen.

### Was ein Wechsel nicht tut

- Kein neues Supabase-Projekt, keine Datenmigration, kein Reset.
- Kein Umzug von lokalen Daten oder Sitzungen zwischen Domains, siehe oben.
- Keine Domain wird gekauft. Eine eigene Domain ist ein separater Auftrag und braucht neue Einträge in den Redirect-URLs.
