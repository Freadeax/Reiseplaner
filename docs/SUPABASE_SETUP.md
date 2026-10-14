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
npm run test:db                   # Rechte, Auth, Einladungen, Konflikte über die echte API
npm run test:e2e                  # Chromium gegen die gebaute Website unter /Reiseplaner/ + lokalen Stack
supabase stop
```

`supabase/config.toml` gilt nur lokal (E-Mails landen in Mailpit, http://127.0.0.1:55324). Die Produktionswerte werden im Dashboard gesetzt.

## Änderungen am Schema

Neue Datei `supabase/migrations/<JJJJMMTTHHMMSS>_<name>.sql`, niemals bereits eingespielte Dateien ändern. Erst lokal mit `supabase db reset` und den Tests prüfen, dann `db push`. Änderungen am Dokumentformat (`schemaVersion`) brauchen eine Migration in der App (`migrateTrip`) und in der Datenbank-Prüfung.
