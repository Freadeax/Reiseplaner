# Integrations-Prüfbericht · 16.11.2026

Auftrag Philipp 16.11.: „Überprüfung aller Systeme und Module auf Funktionalität und vor allem auf live bringen der neuen Sachen“.
Geprüft wurde der Stand **`64bcfbd`** (main, 16.11. 12:26 UTC) und danach die Korrektur aus diesem Bericht.

## 1. Was live ist (geprüft)

| Prüfung | Ergebnis |
|---|---|
| `npm test` im Cloud-Container auf `64bcfbd` | grün (alle Node-Tests) |
| Actions-Lauf 150 „Tests & Pages“ auf `64bcfbd` | grün: `app`, `browser` (voller Klicktest, Format-5-Browsertest, Build + Offline-Browsertest), `database` (Migrationen, `db lint`, `test:db`, `test:e2e` gegen lokalen Supabase), `build`, `deploy` |
| Ausgelieferte GitHub-Pages-Version | `config.js`: `RP_BUILD.commit = "64bcfbd61615"`, gebaut 16.11. 12:35:54 UTC; `sw.js`: `STAND = "d9e8175caccb"` (am 16.11. ~14:50 UTC abgerufen). Damit ist der neueste main-Stand mit allen Modulen von heute ausgeliefert. |

Heute live und in diesem Stand enthalten: Format 5 schreiben (Storno, Zahlungsplan, Erledigt), Ist-Ausgaben (Plan/Ist), Tickets/Unterlagen (nur Gerät),
Wege im Tagesplan, Fixpunkte & Puffer, Check-/Packlisten mit Wetter, Offline/Service Worker mit „Neue Version verfügbar“, Reisestil,
Bedienbarkeit (zugeklappte Ebenen), gemeinsames Planen G1 (Drei-Wege-Abgleich).

**Nicht live (bewusst):** Migration `20261116120000_gemeinsam` (G2–G5) wartet im Thread „Gemeinsam mit Mitreisenden planen“ auf Philipps Freigabe.

## 2. Zusammenspiel der Module

Neu `tests/integration-f5.cjs` (in `npm test`): **eine** Format-5-Reise mit Angaben aus allen Modulen (Storno, Zahlungsplan, Teilzahlung,
Aufgabe, Fixpunkt, freie Zeit, Tempo, Ausgabe unterwegs, Reisestil Wellness) läuft durch

1. Sicherung exportieren → in leeres Gerät importieren: feldtreu.
2. Server-Form (`toServer`, Sync): feldtreu, bleibt Format 5, wird gesendet (nicht „nur auf diesem Gerät“).
3. Drei-Wege-Abgleich mit unabhängigen Änderungen an Format-5-Feldern: ohne Konflikt, Ergebnis gültig, Format bleibt 5.
4. Variante / „Reise duplizieren“: gültig, Planangaben übernommen, Erledigtes und Zahlungen nicht (siehe Fehler 1).
5. Fristen: Stornofrist, Rate und Aufgabe erscheinen.
6. Kosten, Storno-Anzeige und Reisebuch-Entwurf: ohne Fehler, keine Zahlungen/Aufgaben im Reisebuch.

Gerätespeicher-Schlüssel der Module (`rp-wege-cache-v1`, `rp-wetter`, `rp-fold`, `rp-stil…`, Unterlagen in IndexedDB) überschneiden sich nicht
und liegen nicht in der Reise; Sicherung und Sync enthalten sie bewusst nicht (Cache bzw. „Unterlagen nur Gerät“, `docs/UNTERLAGEN.md`).

## 3. Gefundene Fehler und Korrektur

**Fehler 1 (Datenfehler, behoben): „Reise duplizieren“ / Variante machte Format-5-Reisen mit Teilzahlungen ungültig.**
`variantOffer` setzte `paid = 0`, ließ aber `payments` stehen. Format 5 verlangt Summe der Teilzahlungen = `paid`, die Kopie war also ungültig
(wurde ohne Prüfung gespeichert und wäre danach beim Online-Speichern und beim Import abgelehnt worden). Außerdem kannte `app/varianten.js`
die Format-5-Felder nicht: Aufgaben, Packliste, freie Zeit, Tempo, Länder usw. fielen in der Kopie weg und wurden als „unbekannt“ gemeldet.
Korrektur in `app/varianten.js`:
- Teilzahlungen (`payments`) werden wie `paid` nicht kopiert.
- Format-5-Planfelder werden übernommen (`checkoutTime, tasks, packing, countries, idDocs, insurance, emergency, assumptions, prosCons, criteria, origin_tpl, guestCards, stayRef, dayRoutes, keepFree, pace`); Aufgaben wieder offen (ohne `doneAt/doneBy`), Hinweis „erledigte Aufgaben“ in der Vorschau.
- Nie kopiert: `docs` (Unterlagen und Buchungscodes), `deadlineAck`; `variant` wird neu gesetzt (M05.2).

Sonst keine Fehler gefunden: Format 5 ist in Import, Export, Sync, Abgleich, Fristen und Reisebuch einheitlich über `validateExtras`/`RPV5` geprüft.

## 4. Nicht getestet

- Echte Abfragen an Open-Meteo, Nominatim und routing.openstreetmap.de (aus der Cloud gesperrt; nur mit Attrappen getestet).
- Produktions-Supabase mit echten Konten (nur lokaler Stack in CI), iPhone/Safari, „Neue Version verfügbar“ auf einem echten Gerät.

## 5. Nächste Schritte

1. Philipp: einmal am iPhone die Seite neu laden, „Nach neuer Version suchen“ antippen, Wetter und „Wege berechnen“ mit echter Verbindung ausprobieren.
2. Freigabe der Migration G2–G5 im Thread „Gemeinsam mit Mitreisenden planen“.
3. Teilzahlungen einzeln erfassen (Format 5 `payments`) und dabei Varianten-Test erweitern.
