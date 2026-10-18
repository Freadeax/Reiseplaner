# Supabase einrichten und betreiben

Stand 14.10.2026 · Issue #6 · Gilt für **ein** dauerhaftes Produktionsprojekt, unabhängig vom Website-Host (GitHub Pages heute, Cloudflare Pages später). Bei Deployments wird kein neues Projekt angelegt, und es gibt keinen Datenreset.

## Was die Website von Supabase nutzt

| Teil | Wofür |
| --- | --- |
| Auth (E-Mail + Passwort) | Registrierung mit Bestätigungs-E-Mail, Anmeldung, Abmeldung, Sitzung, Passwort-Wiederherstellung (PKCE: Links führen mit `?code=` zurück auf die Website, das Hash-Routing bleibt unberührt) |
| Datenbank `public.trips` | Eine Zeile je Reise, Inhalt als JSON-Dokument, `version` für Konflikterkennung, Soft-Delete |
| `public.trip_members` | Wer eine Reise mit welcher Rolle sehen oder bearbeiten darf |
| `public.trip_invites` | Einladungen als gehashte, ablaufende, widerrufbare, einmalige Tokens, optional an eine E-Mail gebunden |
| Funktionen | `create_trip_invite`, `accept_trip_invite`, `trip_member_list`, `trip_role_of` |

Nicht genutzt werden Realtime, Storage, Edge Functions und Secret Keys. Abgeglichen wird bei Anmeldung, Änderung, Fokus, wieder verfügbarem Netz und alle 60 s.

## Datenmodell und Begründung

```
auth.users ──< trip_members >── trips ──< trip_invites
             (owner|editor|viewer)  (data jsonb, version, deleted_at)
```

- **Strukturiert (eigene Tabellen und Spalten):** Alles, was über Zugriff entscheidet (Eigentümer, Mitgliedschaft, Rolle, Einladung), und was für Listen und Prüfungen gebraucht wird (`title`, `date_mode`, `start_date`, `end_date`, `status`, `version`, Zeitstempel, `deleted_at`). Diese Felder leitet ein Trigger aus dem Dokument ab. Clients können sie nicht direkt setzen.
- **JSONB `trips.data`:** Tagesplan, Kosten, Angebote, Zahlungsbuch, Buchungsstatus, Quellen, Checkliste und Notizen. Sie hängen fachlich an genau einer Reise, werden gemeinsam bearbeitet und müssen **atomar mit einer Versionsprüfung** gespeichert werden. Eine Aufteilung auf viele Tabellen würde jede Speicherung zu einer Transaktion über viele Zeilen machen, ohne dass heute Abfragen über mehrere Reisen gebraucht werden. Das Format ist `schemaVersion 2` der App, dieselbe Struktur wie die JSON-Sicherung, und Import und Export bleiben austauschbar.
- **Später strukturieren**, sobald Abfragen über mehrere Reisen gebraucht werden (z. B. „alle offenen Zahlungen“ oder serverseitige Anbieter-Adapter): Angebote und Zahlungen in eigene Tabellen mit Fremdschlüssel `trip_id`, migriert per SQL aus `data`.
- **IDs:** Bestehende Reise-IDs (`t…`) bleiben erhalten (`trips.id`). Ist eine ID bei einem anderen Konto schon vergeben, legt die App eine Kopie mit neuer ID an. Eine eigene, schon angelegte Zeile (Antwort verloren) wird erkannt und nicht doppelt angelegt.
- **Version:** Jede Änderung erhöht `version` serverseitig. Die App schreibt nur mit `where version = <bekannt>`. Kommt nichts zurück, lädt sie den Serverstand und zeigt einen Konflikt (Online-Version übernehmen, eigene als Kopie oder bewusst überschreiben).
- **Löschen:** Nur der Eigentümer löscht, und zwar als Markierung (`deleted_at`). So erfahren auch Offline-Geräte von der Löschung, und Reisen tauchen nicht wieder auf.

## Rechte (in der Datenbank durchgesetzt)

RLS ist auf allen Tabellen aktiv und erzwungen. `anon` hat keine Rechte, `authenticated` nur über Spalten-Grants (z. B. ist `owner_id` nie änderbar).

| Aktion | Eigentümer | Bearbeiter | Leser | Andere / unangemeldet |
| --- | --- | --- | --- | --- |
| Reise lesen | ja | ja | ja | nein |
| Reise ändern | ja | ja | nein | nein |
| Löschen / Wiederherstellen | ja | nein | nein | nein |
| Mitglieder sehen | ja | ja | ja | nein |
| Rolle ändern (Bearbeiter ↔ Leser), entfernen | ja | nein | nein | nein |
| Selbst verlassen | – (Eigentümer bleibt) | ja | ja | – |
| Einladen, Einladungen sehen/widerrufen | ja | nein | nein | nein |
| Sich selbst Rechte geben | nein | nein | nein | nein |

Ein Besitzerwechsel ist noch nicht umgesetzt. Der Eigentümer kann nicht entfernt werden.

## Produktionsprojekt (Stand 14.10.2026)

- Projekt-URL: `https://sqkszjurzobltvdluiwh.supabase.co` (Projekt-Ref `sqkszjurzobltvdluiwh`). Die URL ist öffentlich und steht auch in der Website-Konfiguration.
- **Migrationen über die Supabase-GitHub-Integration:** Repository `Freadeax/Reiseplaner`, Working directory `.`, „Deploy to production“ an, Produktionszweig `main`. Neue Dateien in `supabase/migrations/` werden bei jedem Push auf `main` eingespielt. Auth- und API-Einstellungen aus `config.toml` ignoriert die Integration standardmäßig, sie werden im Dashboard gepflegt. **Migrationen deshalb nicht zusätzlich im SQL-Editor ausführen.**
- Branching (Vorschau-Datenbanken) ist im Gratistarif nicht verfügbar und wird nicht gebraucht.
- **Beobachtung 14.10.2026:** Die Integration hat die Migration nicht eingespielt. Das gilt für einen Doku-Push (`9f230f6`) wie für einen Push, der die Migrationsdatei ändert (`3acfe22`), auch nach 25 Minuten noch nicht (REST-API: `PGRST205`, Tabelle nicht gefunden). Ersatzweg: **`supabase/manual/apply-20261014120000-reiseplaner_core.sql` einmal im SQL-Editor ausführen.** Die Datei läuft in einer Transaktion und trägt die Migration in `supabase_migrations.schema_migrations` ein, damit Integration und `db push` sie nicht doppelt ausführen. Lokal auf einer frischen Datenbank geprüft: Tabellen angelegt, Historie verbucht, zweiter Lauf bricht ohne Änderung ab, `test:db` grün.
- **Nachtrag 14.10.2026, abends:** Die Integration hat doch eingespielt, nur mit Verzögerung. Philipp hat den SQL-Editor nicht benutzt; die Kerntabellen waren gegen 15:15 Uhr da. Die Katalog-Migrationen aus `cabefc5` waren direkt nach dem Deploy in der Produktion. Die Integration ist damit der normale Weg; die Dateien in `supabase/manual/` sind nur Notausgang, wenn nach etwa einer Stunde weiterhin `PGRST205` bzw. `PGRST202` kommt.

## Ersteinrichtung (Philipp, einmalig, Gratistarif)

1. Unter <https://supabase.com/dashboard> ein Projekt anlegen, z. B. „reiseplaner“, Region EU (z. B. Frankfurt). Das Datenbankpasswort im Passwortmanager ablegen und **nicht** ins Repository.
2. **Migration einspielen** (genau eine Variante; für das Produktionsprojekt ist die GitHub-Integration aktiv, siehe oben):
   - Mit CLI: `npx supabase@2.120.0 login`, dann `npx supabase@2.120.0 link --project-ref <ref>`, dann `npx supabase@2.120.0 db push`. Das spielt `supabase/migrations/*.sql` ein, nur neue Dateien.
   - Ohne CLI: Den Inhalt von `supabase/migrations/20261014120000_reiseplaner_core.sql` im Dashboard unter *SQL Editor* ausführen, einmalig.
3. **Authentication → Sign In / Providers → Email:** E-Mail-Anmeldung an, „Confirm email“ an, minimale Passwortlänge 10.
4. **Authentication → URL Configuration:**
   - Site URL: `https://freadeax.github.io/Reiseplaner/`
   - Redirect URLs (exakt): `https://freadeax.github.io/Reiseplaner/`, für lokale Tests zusätzlich `http://127.0.0.1:8080/Reiseplaner/`. Später kommen die Cloudflare-Adressen dazu (siehe `docs/HOSTING_MIGRATION.md`).
5. **E-Mail-Versand:** Der eingebaute Versand liefert laut Supabase nur an Mitglieder des Projektteams und derzeit etwa 2 E-Mails pro Stunde (Stand 14.10.2026, kann sich ändern). Für echte Nutzer unter *Authentication → Emails → SMTP Settings* einen eigenen SMTP-Dienst eintragen (viele Anbieter haben einen Gratistarif). Ohne SMTP funktionieren Registrierung und Passwort-Reset für fremde Adressen nicht.
6. **Schlüssel:** Unter *Project Settings → API Keys* den **Publishable Key** (`sb_publishable_…`) und die Projekt-URL (`https://<ref>.supabase.co`) kopieren. Secret Keys und `service_role` niemals weitergeben oder eintragen.
7. **GitHub → Settings → Secrets and variables → Actions → Variables** (Variablen, keine Secrets, weil die Werte öffentlich sind):
   - `RP_SUPABASE_URL` = Projekt-URL
   - `RP_SUPABASE_PUBLISHABLE_KEY` = Publishable Key
   - optional `RP_SITE_URL`, sonst wird die aktuelle Seitenadresse verwendet
   - `PAGES_ENABLED` = `true`, erst nach Schritt 8
8. **GitHub → Settings → Pages → Build and deployment → Source: „GitHub Actions“.** Danach veröffentlicht der Workflow „Tests & Pages“ nach jedem grünen Push auf `main`.

Der Build lehnt Secret Keys und `service_role`-JWTs ab, und die Artefaktprüfung sucht zusätzlich nach Schlüsseln.

## Gratistarif: Grenzen, die den Betrieb betreffen (Stand 14.10.2026, laut supabase.com/pricing)

- Bis zu 2 aktive Projekte, 500 MB Datenbank, 50.000 monatlich aktive Nutzer und 5 GB Datenübertragung.
- **Pausierung nach 1 Woche Inaktivität.** Danach lädt die App nicht online, bis das Projekt im Dashboard fortgesetzt wird. Lokale Kopien bleiben im Browser, Änderungen warten in der Warteschlange.
- **Keine automatischen Backups im Gratistarif.** Wichtige Reisen zusätzlich über „Reisen sichern“ als Datei exportieren. Eine Betreibersicherung ist z. B. `npx supabase@2.120.0 db dump --data-only -f backup.sql` (lokal und privat aufbewahren, nie ins Repository).
- Es gibt keine Zusage dauerhaft kostenloser oder unterbrechungsfreier Verfügbarkeit. Tarife können sich ändern. Kostenpflichtige Tarife werden nur auf Philipps ausdrücklichen Auftrag aktiviert.

## Lokale Entwicklung und Tests

```bash
npm install -g supabase@2.120.0   # oder npx supabase@2.120.0 …
supabase start                    # Docker nötig; spielt die Migrationen in einen lokalen Stack
                                  # Sperrt ein Netz public.ecr.aws: SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start
npm run test:db                   # Rechte, Auth, Einladungen, Konflikte, Konto-Lebenszyklus über die echte API
npm run test:e2e                  # Chromium gegen die gebaute Website unter /Reiseplaner/ + lokalen Stack
supabase stop
```

`supabase/config.toml` gilt nur lokal (E-Mails landen in Mailpit, http://127.0.0.1:55324). Die Produktionswerte werden im Dashboard gesetzt.

## Umkreis-Katalog (Issue #7, seit v3.1)

- **Tabellen** `catalog_places` (Ziele) und `catalog_spots` (Attraktionen) mit Koordinaten, Themen, guten Monaten und Dauer. Keine Preise, keine Öffnungszeiten, keine Nutzerdaten.
- **Rechte:** RLS erzwungen. `anon` und `authenticated` dürfen nur lesen. Schreiben geht ausschließlich über Migrationen, also redaktionell. `tests/db/supabase-api.cjs` prüft, dass Einfügen, Ändern und Löschen abgelehnt werden.
- **Suche:** `catalog_search(p_lat, p_lon, p_max_km, p_min_km, p_kinds)`.
  - Luftlinie nach Haversine, geschätzte Straßen-km = Luftlinie × 1,3.
  - Bereich [min, max], Themen-Überschneidung, sortiert nach Luftlinie, höchstens 80 Ziele.
  - Ergebnis `{version, places:[…]}`.
  - Dieselbe Regel steht in `catalog.js`. Der Datenbanktest vergleicht beide Ergebnisse für mehrere Abfragen.
- **Eine Quelle:** `catalog-data.js`. Nach Änderungen `node scripts/catalog-sql.mjs` ausführen. Für eine neue Version `version` erhöhen und `--stamp JJJJMMTTHHMMSS` angeben, dann entsteht eine neue Seed-Migration. `npm test` schlägt fehl, wenn Daten ungültig oder Migrationen veraltet sind.
- **Gültigkeitsprüfung:** Prüfung von IDs, Koordinaten, Monaten, Themen und Entfernung der Attraktion zum Ziel (höchstens 60 km). Texte mit Preis- oder Uhrzeitangaben werden abgelehnt.
- **Ausweg ohne Integration:** `supabase/manual/apply-catalog-v1.sql` im SQL-Editor. Die Datei läuft in einer Transaktion und verbucht beide Migrationen in der Historie. Lokal geprüft: erster Lauf ok, zweiter bricht ohne Änderung ab.
- **App ohne Datenbank:** Ohne Datenbank, offline oder bei leerem Katalog rechnet die App mit der Offline-Kopie und zeigt die Quelle an.

## Konto-Lebenszyklus (Migration 20261016120000, 16.10.2026)

- `transfer_trip_ownership(p_trip, p_new_owner)`: nur der Eigentümer, nur an ein bestehendes Mitglied; der bisherige Eigentümer wird Bearbeiter. `trips.owner_id` wandert mit (sonst nähme eine spätere Kontolöschung die Reise über `on delete cascade` mit). `trips_before_write` erlaubt den Wechsel nur innerhalb dieser Funktion.
- `my_account_summary()`: eigene Reisen mit weiteren Mitgliedern, fremde Reisen mit Rolle.
- `export_my_account()`: alle zugänglichen Reisen mit Rolle und vollständigem Dokument, selbst erstellte Einladungen.
- `delete_my_account(p_confirm_email, p_delete_shared)`: Bestätigung über die eigene E-Mail; eigene geteilte Reisen nur mit `p_delete_shared = true`, sonst Abbruch. Löscht `auth.users`, alles Weitere über Fremdschlüssel.
- Nebenbei behoben: Beim Löschen eines Kontos setzte `trips_before_write` das per Fremdschlüssel geleerte `updated_by` fremder Reisen wieder auf das gelöschte Konto und erhöhte die Version. Lokal mit der alten Triggerfassung nachgestellt.
- Geprüft lokal (`supabase start`, Docker): `db lint`, `test:db` mit `tests/db/account.cjs`, `test:e2e` mit Kontolöschung über die Oberfläche.

## Anmeldung per E-Mail-Code (P0.7, 18.10.)

- App: „Mit Code aus der E-Mail anmelden“ ruft `signInWithOtp` mit `shouldCreateUser: false` und danach `verifyOtp` (Typ `email`) auf (`cloud.js`). Es meldet sich nur an, wer schon ein Konto hat; neue Konten entstehen weiter nur über „Registrieren“. Unbekannte Adressen sehen dieselbe Anzeige wie bekannte.
- Lokal enthält die Vorlage `supabase/templates/magic_link.html` (über `[auth.email.template.magic_link]` in `config.toml`) den Code `{{ .Token }}` und zusätzlich den Link. Der E2E-Test liest den Code aus Mailpit.
- **Produktion, einmalig durch Philipp (noch offen):** Im Dashboard unter Authentication → Emails → Templates die Vorlage „Magic Link“ um `{{ .Token }}` ergänzen; der Text aus `supabase/templates/magic_link.html` kann übernommen werden. Die GitHub-Integration übernimmt Auth-Einstellungen aus `config.toml` nicht. Ohne diese Änderung enthält die E-Mail nur den Link, die Code-Eingabe schlägt dann fehl.
- Code-Länge und Gültigkeit stehen bei den Einstellungen des E-Mail-Anbieters im Dashboard; die App akzeptiert 6 bis 10 Ziffern. Zwischen zwei E-Mails an dieselbe Adresse wartet die App 60 s (Supabase-Standard) oder die Zeit, die der Server meldet.
- Der eingebaute Mailversand des Gratistarifs erlaubt nur wenige E-Mails pro Stunde. Für echten Betrieb bleibt eigenes SMTP offen.
- Nicht gegen die Produktion geprüft (aus der Cloud-Umgebung nicht erreichbar).

## Änderungen am Schema

Neue Datei `supabase/migrations/<JJJJMMTTHHMMSS>_<name>.sql`, niemals bereits eingespielte Dateien ändern. Erst lokal mit `supabase db reset` und den Tests prüfen, dann `db push`. Änderungen am Dokumentformat (`schemaVersion`) brauchen eine Migration in der App (`migrateTrip`) und in der Datenbank-Prüfung.
