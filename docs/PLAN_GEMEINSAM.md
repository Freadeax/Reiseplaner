# Gemeinsam planen · Konzept und Stufen

Stand 16.11.2026 · Thread „Gemeinsam mit Mitreisenden planen“ (Auftrag Philipp 16.11.: Kollaboration – Plan mit Partner,
Familie oder Gruppe gemeinsam in nahezu Echtzeit bearbeiten und Ideen eintragen). Baut auf der Planung
`M06_GEMEINSAM.md` (19.10.) auf und ersetzt sie nicht; Kennzeichnung: **[Code]** vorhanden, **[neu]** in diesem Thread
umgesetzt, **[Plan]** noch nicht umgesetzt, **[Freigabe]** braucht Philipps ausdrückliche Zustimmung (Migration = Produktion).

## 1 · Ziel in einem Satz

Zwei bis acht Menschen planen dieselbe Reise auf ihren eigenen Geräten, sehen die Änderungen der anderen nach wenigen
Sekunden, können jederzeit Ideen einwerfen und verlieren dabei nie still eine Eingabe.

## 2 · Bestand (geprüft im Code, 16.11.)

| Bereich | Stand |
| --- | --- |
| Konten | E-Mail-Code-Anmeldung (Supabase Auth) **[Code]** `cloud.js`, `app/konto.js` |
| Rollen | Eigentümer / Bearbeiter / Leser je Reise, durchgesetzt per RLS **[Code]** Migration `20261014120000` |
| Einladungen | Link mit Einmal-Token (nur Hash gespeichert), Ablauf ≤ 30 Tage, widerrufbar, optional an E-Mail gebunden **[Code]** |
| Speichern | Reise = ein JSON-Dokument mit Revision `version`; Schreiben nur `where version = bekannt` **[Code]** |
| Abgleich | nach Änderung (0,8 s), bei Fokus, online-Ereignis und alle 60 s **[Code]** `app/speicher.js` `Sync` |
| Konflikt | **jede** gleichzeitige Änderung derselben Reise = Konflikt der ganzen Reise; Wahl „Online übernehmen / meine als Kopie / überschreiben“ **[Code]** |
| Mitglieder | Liste mit E-Mail-Adressen, Rollen ändern, entfernen, Besitz übergeben **[Code]** |

**Hauptlücke:** Weil jede gleichzeitige Änderung die ganze Reise in den Konflikt schickt, ist echtes gemeinsames Arbeiten
heute unangenehm. A hakt die Packliste ab, B trägt eine Zahlung ein, und eine Person muss sich für „ihre“ oder „die andere“
Fassung entscheiden. Zweite Lücke: Änderungen anderer erscheinen erst nach bis zu 60 s. Dritte Lücke: Leser (z. B. Kinder,
Freunde) können nichts beitragen, und es gibt keinen Ort für Ideen, die (noch) nicht in den Plan gehören.

## 3 · Stufen

| Stufe | Inhalt | Migration | Stand |
| --- | --- | --- | --- |
| G1 | **Drei-Wege-Abgleich**: unabhängige Änderungen werden zusammengeführt, nur echte Widersprüche erscheinen, Wahl je Punkt | nein | **[neu]** |
| G2 | **Schneller Abgleich**: Supabase Realtime meldet „Reise geändert“ → sofortiger Abgleich; „Anna ist gerade in der Reise“ | ja (Publikation) | Datenbank und Oberfläche **[neu]** |
| G3 | **Anzeigename** statt E-Mail in Mitgliederliste und Hinweisen (M06.1) | ja (`profiles`) | Datenbank und Oberfläche **[neu]** |
| G4 | **Ideen-Pinnwand** je Reise: alle Mitglieder (auch Leser) tragen Ideen ein und stimmen mit „Daumen hoch“ ab; Bearbeiter übernehmen eine Idee in den Plan | ja (`trip_ideas`, `trip_idea_votes`) | Datenbank und Oberfläche **[neu]** |
| G5 | **Was hat sich geändert?** Verlauf ohne Inhalte („Anna: Unterkunft, Tagesplan 31.12.“) und Hinweis beim Öffnen (M06.3) | ja (`trip_events`, `trip_seen`) | Datenbank und Oberfläche **[neu]** |
| G6 | **Ich bin Mitreisende/r X**: `party[i].member` nur durch die Person selbst (Format 5, `claim_party`) | ja | [Plan], gemeinsam mit Format-5-Thread |
| G7 | Abstimmungen mit mehreren Optionen, Kommentare an Tag/Unternehmung (M06.4/M06.5) | ja | später, nach G4-Erfahrung |

Reihenfolge: G1 sofort (rein clientseitig). G2–G5 kommen als **eine** Migration `…_gemeinsam.sql`, lokal mit Supabase
getestet, dann Philipps Freigabe. Danach die Oberflächen schrittweise.

## 4 · G1 Drei-Wege-Abgleich (umgesetzt)

**Grundsatz:** Nur was beide Seiten *unterschiedlich* geändert haben, ist ein Widerspruch. Alles andere wird übernommen.
Der Vergleichspunkt („Basis“) ist der Server-Stand, auf dem die lokale Bearbeitung beruht.

- **Basis merken** (`Store.put`): Beim ersten lokalen Bearbeiten einer online gespeicherten Reise wird der bisherige lokale
  Stand (= Server-Stand der bekannten Version) als `meta.base` gespeichert, bis das Speichern online gelingt. Nur in dieser
  Zeit kostet das Speicherplatz.
- **Einheiten** (`merge3.js`, `window.RPMerge`):
  - Oberste Felder einzeln, aber **gekoppelte Gruppen** zusammen (z. B. Zeitraum `start/end/nights/dateMode/month`,
    Unterkunft `stayId/stayQuote/place/catalog`, Anreise `origin/dest/km/routeKm/travel/…`). Ändert A das Anreisedatum und B
    die Nächte, ist das ein Widerspruch, keine stille Mischung.
  - Listen mit `id` je Eintrag (Unternehmungen, Zusatzkosten, Zahlungen, Unterkünfte, …) **je Eintrag**: neue Einträge beider
    Seiten bleiben, Löschungen werden übernommen, ein Eintrag gilt als Ganzes (Betrag und „bezahlt“ werden nie gemischt).
    Gelöscht auf der einen, geändert auf der anderen Seite = Widerspruch.
  - Objekte als Zuordnung (z. B. Checkliste `check`) je Schlüssel.
  - Alles andere (Listen ohne `id`, Texte) als Ganzes.
  - Reihenfolge einer Liste: hat nur eine Seite umsortiert, gilt deren Reihenfolge; sonst die Online-Reihenfolge, eigene neue
    Einträge hinter ihrem bisherigen Vorgänger.
- **Prüfung:** Das Ergebnis muss `validateExtras` bestehen und darf das Format nicht senken; sonst bleibt es beim bisherigen
  Konflikt der ganzen Reise. Felder, die diese App nicht kennt (neuere Formate), laufen unverändert durch.
- **Ablauf beim Speichern:** Server meldet „Version geändert“ → Online-Stand holen → Abgleich. Ohne Widerspruch wird das
  Ergebnis mit der neuen Version gespeichert und kurz gemeldet („Änderungen von anderen übernommen, eure bleiben
  erhalten“). Mit Widerspruch erscheint in der Reise eine Liste der Punkte, je Punkt „meine“ oder „online“; alles andere ist
  schon zusammengeführt. Die bisherigen drei Wege (übernehmen, Kopie, überschreiben) bleiben als Ausweg.
- **Grenzen:** Ohne gemerkte Basis (Änderungen aus einer Version vor diesem Schritt) bleibt es beim bisherigen Konflikt.
  Fachliche Folgen über Bereiche hinweg (A löscht eine Unternehmung, B plant sie gleichzeitig in einen Tag) werden nicht
  erkannt, sind aber sichtbar und nicht verloren.

## 5 · G2 Schneller Abgleich (Plan)

- Migration: `alter publication supabase_realtime add table public.trips;` Realtime prüft für `postgres_changes` die RLS
  der Leserechte; jedes Mitglied bekommt nur Ereignisse seiner Reisen.
- Client (`cloud.js`, neuer Teil `app/gemeinsam.js`): ein Kanal je Konto, Ereignis wird **nur als Auslöser** genutzt
  (`Sync.schedule(0)`), nie als Datenquelle; Daten kommen weiter über `listTrips` mit Prüfung. Ohne Verbindung bleibt der
  60-s-Takt. Solange eine geteilte Reise offen und sichtbar ist, Takt 15 s als Rückfall.
- Anwesenheit: Presence auf privatem Kanal `trip:<id>` (RLS auf `realtime.messages`, nur Mitglieder), zeigt „Anna ist
  gerade hier“ (Anzeigename aus G3, sonst „ein Mitglied“). Keine Position, keine Eingaben.
- Kosten: Supabase Free erlaubt 200 gleichzeitige Verbindungen und 2 Mio. Nachrichten im Monat; für den Start ausreichend.

## 6 · G3 Anzeigename (Plan)

Tabelle `profiles(user_id pk, display_name ≤ 40, druckbar)`, nur selbst schreiben. Funktion `trip_member_list` liefert
`display_name` und die E-Mail nur noch dem Eigentümer. Nach Annahme einer Einladung: „Wie sollen dich die anderen sehen?“
(freiwillig; ohne Namen „Mitglied 2“). Entscheidung 7 der Planung (Anzeigename freiwillig) wird damit umgesetzt.

## 7 · G4 Ideen-Pinnwand (Plan)

- `trip_ideas(id, trip_id, author, body ≤ 500, link ≤ 500 nur https, day date null, ref text null, status 'neu'|'eingeplant'|'verworfen', created_at, updated_at, deleted_at)`,
  `trip_idea_votes(idea_id, user_id, primary key)`.
- RLS: lesen alle Mitglieder; anlegen alle Mitglieder (auch Leser); eigenen Text ändern/zurückziehen Autor; Status setzen
  Bearbeiter und Eigentümer; abstimmen alle, nur die eigene Stimme. Höchstens 200 offene Ideen je Reise.
- Oberfläche: Bereich „Ideen“ in der Reise mit Eingabefeld oben („Was wollt ihr unbedingt machen?“), Karten mit Daumen und
  Zähler, Filter „neu / eingeplant“. „In den Plan“ öffnet den normalen Weg (Unternehmung anlegen, Vorschau) und setzt danach
  den Status; die Idee ändert den Plan nie selbst.
- Gastmodus und lokale Reisen: Ideen wie bisher als Notiz; Pinnwand erklärt, dass sie ein Konto braucht.
- Warum eigene Tabellen: Ideen und Stimmen sind kleine, häufige, personenbezogene Aktionen. Im Reise-Dokument würden sie
  Revisionen hochzählen und Konflikte erzeugen (M06 G7).

## 8 · G5 Was hat sich geändert? (Plan)

Trigger auf `trips` vergleicht alte und neue Bereichs-Schlüssel und schreibt `trip_events(trip_id, version, actor, kinds text[])`
ohne Inhalte; 90 Tage. `trip_seen(trip_id, user_id, version)`. Beim Öffnen: „Seit deinem letzten Besuch: Anna – Unterkunft,
Kosten“. Die Bereichsliste kommt aus derselben Gruppentabelle wie G1 (`RPMerge.GROUPS`), damit Abgleich und Verlauf dieselben
Namen verwenden.

## 9 · Tests

- G1: `tests/merge3.cjs` (reine Fälle: unabhängige Felder, gekoppelte Gruppen, Listen je Eintrag, Löschen gegen Ändern,
  Reihenfolge, unbekannte Felder, Format-5-Felder, Ergebnis ungültig → kein Abgleich) und `tests/sync-merge.cjs` (zwei
  Geräte gegen nachgebildeten Server: zusammengeführt ohne Konflikt; Widerspruch → Wahl je Punkt; Basis entfällt nach
  Erfolg).
- G2–G5: `tests/db/` gegen lokalen Supabase-Stack mit Eigentümer, Bearbeiter, Leser, Fremdem, unangemeldet (Fälle aus M06 §6
  G1–G10 plus: Leser legt Idee an → ja, Leser setzt Status → nein, Fremder liest Ideen → 0 Zeilen, Realtime-Ereignis nur für
  Mitglieder). E2E mit zwei Browser-Kontexten.

## 9a · Migration `20261116120000_gemeinsam.sql`

Freigabe Philipp 16.11. („auf live bringen der neuen Sachen“). Inhalt wie §5–§8; dazu: Leser dürfen Ideen eintragen und
abstimmen (Philipp 16.11.), Status nur Eigentümer/Bearbeiter, Zurückziehen weich (Autor oder Eigentümer), kein hartes Löschen
über die API, höchstens 200 Ideen je Reise, nur `https`-Links. `trip_member_list` liefert `display_name`; E-Mail nur für den
Eigentümer und die eigene Zeile (ältere App-Stände zeigen dann die Konto-ID statt E-Mail). Kontolöschung: Profil und Stimmen
weg, Ideen und Verlauf bleiben anonym. `supabase/config.toml`: Realtime lokal eingeschaltet (für `tests/db/gemeinsam.cjs`).

## 10 · Offene Entscheidungen für Philipp

1. ~~Migration G2–G5~~ freigegeben 16.11.
2. ~~Leser: Ideen und Stimmen~~ ja (Philipp 16.11.).
3. Anzeigename freiwillig (Entscheidung 7)? Vorschlag: ja.
4. Verlauf 90 Tage aufbewahren? Vorschlag: ja.

## 11 · Stand 16.11. abends und nächste Schritte

Umgesetzt: G1–G5 vollständig, aus G2 auch Anwesenheit („Gerade in der Reise“) und Rückfall-Takt 15 s.
Offen (brauchen je eine Migration und Philipps Freigabe): **G6** `party[i].member` über `claim_party` („Ich bin Mitreisende/r X“,
damit „meine Ausgaben/Aufgaben“ funktionieren), **G7** Abstimmungen mit mehreren Optionen und Kommentare an Tag/Unternehmung.
Ebenfalls offen: Prüfung auf iPhone/Safari mit zwei echten Konten.
