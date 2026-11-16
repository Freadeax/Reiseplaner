# Fixpunkte, Puffer und Realismus im Tagesplan

Stand 16.11.2026, Claude (Thread „Fixpunkte und Pufferzeiten einplanen“, Auftrag Philipp 16.11.). Ziel aus Philipps Liste:
unumstößliche Termine klar kennzeichnen, bewusst Puffer und freie Zeit einplanen, und den Plan vor Überladung schützen
(„Raum zum Atemholen statt militärischer Übung“). Markierung: **[Code]** umgesetzt und getestet, **[Plan]** nächster Schritt.

## 1 · Begriffe

| Begriff | Bedeutung | Herkunft |
| --- | --- | --- |
| **Fixpunkt** | Termin, der sich nicht verschieben lässt, ohne Geld oder eine Buchung zu riskieren | abgeleitet, später auch von Hand |
| **Puffer** | Zeit vor einem Fixpunkt, die frei bleiben muss (Weg, Parken, Anstehen, Flughafen) | Richtwert je Art, plus Weg |
| **Freie Zeit** | Zeit eines Tages, die nach Programm, Fahrt und Wegen übrig bleibt | `dayLoad` |
| **Freier Halbtag** | Tageszeit (Vormittag, Mittag, Nachmittag, Abend) ohne Programmpunkt | `t.items` |
| **Tempo** | ruhig / normal / aktiv: wie viel ein Tag verträgt | `styleOf(t).pace` (Thread Reisestil), sonst normal |

### 1.1 Was ist ein Fixpunkt? [Code]

Ohne neues Speicherfeld, nur aus vorhandenen Angaben:

1. **Abfahrt** am Anreisetag (`t.departTime`), Ankunft als Schätzung dazu (`arrivalMin`).
2. **Check-in ab** (`t.checkinTime`) am Anreisetag: frühester Zeitpunkt, kein Ende.
3. **Abschnitte der Anreise** (Format 3, `t.transport.out/back`) mit Abfahrtszeit an einem Reisetag; Flug, Bahn, Bus, Fähre.
4. **Gebuchte, angefragte oder bezahlte Unternehmungen** im Tagesplan (`activityCommitted`, dieselbe Schutzregel wie beim
   Tauschen und Löschen). Ohne Uhrzeit bleiben sie Fixpunkt, aber „Uhrzeit fehlt“.
5. **Termine mit festem Datum** (`act.onlyDate`, z. B. Silvesterfeier am 31.12.).
6. **Abreise** am letzten Tag; Uhrzeit aus dem Rückweg-Abschnitt, sonst „Uhrzeit offen“.

[Plan, Format 5] Von Hand: `items[i].fix: true` (nur mit Uhrzeit gültig), z. B. für eine geführte Tour ohne Buchung in der App.

### 1.2 Richtwerte für Puffer (unverbindlich, als Richtwert angezeigt)

| Fixpunkt | Puffer davor |
| --- | --- |
| Flug | 120 Min. (wie `V3.RULES.airportBuffer`) |
| Bahn, Fernbus, Fähre | 15 Min. |
| gebuchte Unternehmung, fester Termin | 15 Min. |
| Check-in, Abfahrt mit dem Auto | 0 Min. |

Dazu kommt die Wegzeit vom vorherigen Punkt, wenn sie bekannt ist (`dayWays` aus dem Thread „Routen und Karten“, sonst
`transferGaps`). Unbekannter Weg zählt **nicht** als 0: Der Puffer gilt dann als „nicht prüfbar“, wenn beide Punkte an
verschiedenen Orten liegen könnten.

## 2 · Prüfregeln je Tag [Code]

`fixDay(t, day)` liefert Fixpunkte, Puffer, Hinweise und einen Zustand. Regeln:

| Fall | Stufe | Text (Beispiel) |
| --- | --- | --- |
| Programmpunkt überschneidet sich mit einem Fixpunkt | Konflikt | „Rodeln (14:00–16:00) überschneidet sich mit Massage 15:00.“ |
| Zwei Fixpunkte überschneiden sich | Konflikt | |
| Programmpunkt nach der Abfahrt des Rückwegs | Konflikt | |
| Lücke vor dem Fixpunkt kleiner als Puffer + Weg | knapp | „Vor Massage 15:00 nur 10 Min. frei, empfohlen 15 Min.“ |
| Programmpunkt mit Uhrzeit vor der geschätzten Ankunft | knapp | „(Schätzung)“ |
| Punkt ohne Uhrzeit in derselben Tageszeit wie ein Fixpunkt | nicht prüfbar | „Ob X vor Y fertig ist, lässt sich ohne Uhrzeit nicht prüfen.“ |
| Punkt mit Uhrzeit, aber ohne Dauer, vor einem Fixpunkt | nicht prüfbar | |
| Fixpunkt ohne Uhrzeit (gebucht, aber Zeit fehlt) | nicht prüfbar | „Uhrzeit eintragen, sonst ist keine Konfliktprüfung möglich.“ |

**Fehlende Uhrzeiten erlauben keine sichere Konfliktfreigabe** (Projektregel 12): Ein Tag mit „nicht prüfbar“ heißt nie
„passt“, sondern „nicht sicher“.

### 2.1 Zustand eines Tages (Realismus)

| Tempo | höchstens Programmpunkte | freie Zeit mindestens | freier Halbtag |
| --- | --- | --- | --- |
| ruhig | 2 | 40 % der Tageskapazität | ja |
| normal | 3 | 25 % | ja |
| aktiv | 5 | 10 % | nein |

Tageskapazität = 10 Std. minus Fahrt (und Wege, sobald `dayLoad` sie liefert). Zustand, schlimmster zuerst:

1. **überladen**: mehr Programm als Kapazität (`dayLoad.over`) oder ein Konflikt.
2. **voll**: Grenzen des Tempos überschritten (zu viele Punkte, zu wenig freie Zeit, kein freier Halbtag).
3. **nicht sicher**: Dauer oder Uhrzeit fehlt, Puffer nicht prüfbar.
4. **ausgewogen**: Programm mit Luft. **frei**: nichts geplant.

Jeder Zustand steht als Wort im Tageskopf, nicht nur als Farbe.

### 2.2 Über die ganze Reise

- Drei oder mehr volle oder überladene Tage hintereinander → „Einen ruhigen Tag dazwischen einplanen“.
- Ab drei Reisetagen kein einziger freier Halbtag → „Für Wetterumschwünge und spontane Entdeckungen einen Halbtag freihalten“.
- Letzter Tag: Rückweg-Ankunft unbekannt → „Heimkehrzeit offen“; Programm am Abreisetag über 3 Std. → Hinweis auf
  Erholungszeit nach der Rückkehr.

### 2.3 Vorschläge statt Automatik

Für einen vollen oder überladenen Tag schlägt die App **einen** verschiebbaren Punkt vor (nicht gebucht, kein Fixpunkt,
größte Dauer) und einen Tag mit der meisten freien Zeit. Die Schaltfläche öffnet das vorhandene Verschieben-Blatt; nichts wird
still geändert.

## 3 · Darstellung [Code]

- Tageskopf: eine Zeile „Fixpunkte 2 · frei ≈ 3 Std. · ausgewogen“ (bzw. „! voll“, „! nicht sicher“).
- Programmpunkt: Kennzeichen „Fix“ (mit Text für Vorlesehilfen „Fixpunkt:“) vor dem Titel.
- Unter dem Tagesplan: Abschnitt „Fixpunkte & Puffer“ je Tag mit Uhrzeit, Puffer davor, Hinweisen und Vorschlag.

## 4 · Datenmodell [Plan, Format 5, abgestimmt mit Thread „Offene Punkte / Systeme“]

| Feld | Form | Zweck |
| --- | --- | --- |
| `items[i].fix` | `true` | von Hand unumstößlich; nur mit `time` |
| `t.keepFree` | `[{day, slot, why:'erholung'\|'wetter'\|'spontan'}]` ≤ 100, Tag+Tageszeit eindeutig | bewusst freigehaltene Zeit; „Lücken füllen“ lässt sie aus |
| `t.pace` | `'ruhig'\|'normal'\|'aktiv'` | Tempo der Reise (gelesen über `styleOf`) |

Geschrieben werden die Felder erst mit `F5_WRITE = true`. Bis dahin liest `fixpunkte.js` sie bereits, falls vorhanden.

## 5 · Abgrenzung

- Wegzeiten und Tageskarte: Thread „Routen und Karten“ (`app/wege.js`, `dayWays`); hier nur gelesen.
- Tempo je Reiseart: Thread „Reisestil“ (`app/reisestil.js`, `styleOf`); hier nur gelesen.
- Fristen vor der Reise (Zahlung, Storno, Online-Check-in): `app/fristen.js`, nicht Teil des Tagesplans.
