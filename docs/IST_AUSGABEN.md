# Geschätzte und tatsächliche Ausgaben · Plan-Ist-Vergleich

Stand 16.11.2026, Claude (Thread „Ist-Ausgaben im Budget erfassen“). Teil des Systems Kosten (`docs/PLAN_SYSTEME.md` §2).
Markierung: **[Code]** umgesetzt und getestet, **[Plan]** Vorschlag.

## 1 · Ausgangslage

Vorher gab es drei getrennte Sichten, die nebeneinander standen, aber nicht zusammengerechnet wurden:

| Was | Wo | Bedeutung |
| --- | --- | --- |
| Plan (geschätzt) | `cost(t)` | Planwerte, ein gebuchter Betrag ersetzt den Planwert |
| Bezahlt an Anbieter | Buchungsbuch `t.ledger`, Angebot `paid` | netto nach Erstattungen (`cancelMath`) |
| Ausgaben unterwegs | `t.expenses` (Format 3, `v3split.js`) | Essen, Einkauf, Tanken, Eintritt … mit Kategorie |

Der Rückblick zeigte „Plan · bezahlt · zusätzlich ausgegeben“ ausdrücklich **nicht verrechnet**. Damit ließ sich die
wichtigste Frage unterwegs nicht beantworten: *Wo stehen wir, und reicht das Budget bis zum Ende?*

## 2 · Ergebnis je Bereich [Code]

`istvergleich.js` (rein, `window.RPIST`) rechnet je Kostenbereich (`COSTCAT`):

- **Plan** – `cost(t).byCat` ohne Puffer, also dieselbe Rechnung wie alle anderen Ansichten.
- **Bisher ausgegeben (Ist)** – bezahlt an Anbieter + Ausgaben unterwegs. Mit Cent.
- **Hochrechnung bis Reiseende** – nach den Topf-Regeln unten.
- **Abweichung** in Worten („+40 € mehr als geplant“), offene Preise („Preis offen“), „nichts erfasst“.

Ausgaben-Kategorien → Bereiche: Essen und Einkauf & Vorräte → Essen · Fahrt, Tanken & Parken → Anreise · Eintritt &
Ausflüge → Ausflüge · Wellness, Genuss & Feiern, Sonstiges → gleichnamiger Bereich.

## 3 · Topf-Regeln (gegen Doppelzählung)

Ein **Topf** ist ein Planwert ohne Einzelbuchung, der laufend ausgegeben wird: Verpflegung und Sprit (`lines[i].pot` in
`cost()`). Ein Sprit-Topf endet, sobald der Posten im Buchungsbuch gebucht, mit Betrag erfasst oder angezahlt ist.

| Regel | Fall | Hochrechnung |
| --- | --- | --- |
| T1 | vor der Reise | `max(Topf, Ausgaben)` – Einkauf vorab verdoppelt die Verpflegung nicht |
| T2 | unterwegs, nichts erfasst | Topf (nicht erfasst ≠ 0 €) |
| T2 | unterwegs, mit Ausgaben | `max(Topf, Ausgaben + Topf × Restanteil)`; heute zählt noch als offen; sinkt nie unter den Plan |
| T3 | nach der Reise | mit Ausgaben das Erfasste, ohne Ausgaben der Topf mit Hinweis „nichts erfasst“ |
| T4 | Bereich ohne Topf | Ausgaben kommen dazu („zusätzlich unterwegs“) |
| T5 | bezahlte Buchungen | stecken schon im Plan, werden nie zusätzlich addiert |
| T6 | Puffer | Reserve, keine Ausgabe: nicht verglichen, getrennt genannt |

Gesamtaussage: über Budget · noch nicht sicher (offene Preise) · voraussichtlich unter dem Budget · kein Budget.
Offene Preise verhindern immer „im Budget“ (Projektregel §11).

Unterwegs zusätzlich das **Tempo** je Topf: „bis heute geplant ≈ 300 €, ausgegeben 400 € · schneller als geplant“.

## 4 · Behobener Rechenfehler [Code]

Ein Buchungsbuch-Posten mit **bezahlt höher als Plan und ohne erfassten Betrag** (möglich über Import, Sync oder ältere
Stände; die Eingabe selbst verhindert es) zählte in `cost()` nur mit dem Planwert. Jetzt zählt das Bezahlte
(„bezahlt, mehr als geplant · Plan war …“), gleich in `ledgerRows`. Die Eingabegrenze bleibt der Planwert.

## 5 · Oberfläche [Code]

- **Kosten → Budget:** Abschnitt „Plan und Ist“ (nur wenn schon Geld geflossen ist oder die Reise läuft/vorbei ist):
  Aussage zum Budget in Worten, Kacheln „Bisher ausgegeben“, „Hochrechnung“, unterwegs „Heute ausgegeben“, je Bereich eine
  Zeile (Liste statt Tabelle, damit es am Handy passt), Knopf „+ Ausgabe erfassen“.
- **Heute-Block unterwegs:** eine Zeile „Heute ausgegeben · bisher · Hochrechnung von Budget“ mit „+ Ausgabe erfassen“.
- **Erfassen schneller:** Betrag zuerst, Bezeichnung freiwillig (leer = Name der Kategorie), zuletzt Zahlende/r vorgewählt.
  Vorschau und Bestätigung bleiben (Format-3-Umstellung wird so weiter angekündigt).

Kein neues Speicherfeld, kein Formatwechsel. Ausgaben unterwegs brauchen weiter Format 3 (wie bisher).

## 6 · Grenzen und nächste Schritte [Plan]

1. **Geplanten Posten vor Ort bezahlt.** Wer die Therme an der Kasse zahlt und als Ausgabe einträgt, zählt sie doppelt
   (T4). Heute steht dazu ein Hinweis. Nächster Schritt: in der Schnellerfassung „Das war ein geplanter Posten: …“ mit den
   heutigen offenen Posten des Bereichs; die Wahl schreibt `ledger[key].paid` (vorhandenes Feld, kein neues Format).
2. **Verknüpfung als Feld** (`expenses[i].plan = <ledgerKey>`) wäre die genaue Lösung, braucht aber Format 5
   (`EXPENSE_FIELDS`). Mit dem Format-5-Thread abstimmen, frühestens nach `F5_WRITE = true`.
3. **Fremdwährung:** `expenses[i].fx` (Format 5) – die Hochrechnung rechnet nur mit `amount` in Euro; ohne Kurs bleibt
   der Betrag unbekannt.
4. **Kategorien Gebühren und Schneesport** fehlen bei den Ausgaben (Kurtaxe vor Ort, Skipass an der Kasse landen in
   „Sonstiges“/„Eintritt“). Neue Kategorien würden ältere Stände die Reise ablehnen lassen → nur mit Formatwechsel.
5. **Teilerfassung:** Die Hochrechnung ist nur so gut wie die Erfassung; der Hinweis steht unter der Liste.

Tests: `tests/istvergleich.cjs` (Regeln T1–T6, Cent, offene Preise, Töpfe, bezahlt über Plan, Anbindung, ohne Modul).
