# Offline-Fähigkeit · Konzept und Stand

Stand 16.11.2026 · Thread „Planer offline nutzbar machen“ (Auftrag Philipp 16.11.: „Ein guter Planer lässt sich offline auf dem Smartphone oder als PDF nutzen“). Gilt für die Website (GitHub Pages); eine Handy-App ist seit 23.10. auf Eis.

## 1. Begriffe, die die App ehrlich trennt

Projektregel: lokale Speicherung ist weder Synchronisation noch vollständige Offlinefähigkeit. Die App benutzt deshalb vier getrennte Aussagen und nie eine für die andere:

| Aussage | Bedeutet | Bedeutet **nicht** |
|---|---|---|
| **Auf diesem Gerät gespeichert** | Reise liegt in diesem Browser (localStorage, Zweitkopie IndexedDB) | dass ein anderes Gerät sie hat oder dass sie sicher vor dem Löschen durch den Browser ist |
| **Offline startbar** | Ein vollständiger App-Stand liegt im Zwischenspeicher des Service Workers | dass Ortssuche, Route, Anmeldung oder Links funktionieren |
| **Dauerhaft gespeichert** | Der Browser hat zugesagt, die Website-Daten nicht von sich aus zu löschen (`navigator.storage.persist()`) | eine Sicherung; Gerät verloren heißt Daten verloren |
| **Online gespeichert** | Der Server hat den Stand bestätigt (nur mit Konto) | dass das Gerät offline den neuesten Stand anderer Mitreisender hat |

## 2. Was heute offline geht (im Code geprüft, 16.11.)

| Bereich | Offline | Wie |
|---|---|---|
| App starten, Reisen ansehen und bearbeiten | ja, nach einmaligem Laden über https | `sw.js`, Netz zuerst, sonst Zwischenspeicher |
| Reisedaten | ja | `rp-trips` / `rp-u:<id>` in localStorage, Zweitkopie in IndexedDB (`rpstore.js`), Schutz gegen Überschreiben aus einer anderen Ansicht |
| Änderungen mit Konto | ja, als „nur lokal gespeichert“ | Warteschlange in `app/speicher.js`, Abgleich bei `online` und alle 60 s, Konflikte sichtbar |
| Fotos und Reisebuch | ja | Bilddateien nur in IndexedDB (`photostore.js`) |
| Ziele finden (Umkreis) | ja, mit Offline-Kopie | `catalog-data.js` vorab gespeichert; Kacheln werden nur bei Bedarf geladen |
| Reisemappe und Reisebuch als PDF | ja | Druckdialog des Browsers („Als PDF sichern“), keine Netzressourcen außer der Schrift |
| Ortssuche (Nominatim), Routenberechnung (routing.openstreetmap.de) | **nein** | sichtbare Fehlermeldung, Schätzung bleibt |
| Anmelden, Passwort, Einladungen, Freigaben | **nein** | brauchen den Server |
| Kartenlinks, Anbieterlinks, Wetter (geplant) | **nein** | externe Seiten |
| Schrift Barlow (Google Fonts) | nein, Ersatzschrift | Darstellung bleibt lesbar |

## 3. Lücken und Risiken, nach Schaden geordnet

**R1 · Datenverlust durch ältere App-Version.** Trifft eine ältere App-Version (Offline-Zwischenspeicher, halb geladener Stand, alter Tab) auf eine Reise mit höherem Format im Browser-Speicher, wirft `validateExtras` „Unbekannte Reiseversion“. Der ganze Speicher gilt dann als *beschädigt*, und die App bietet „Speicher zurücksetzen“ an, was alle Reisen des Geräts entfernt. Heute nur über gemischte Zwischenspeicher erreichbar (R2); sobald es Format 6 gibt, regulär.

**R2 · Gemischte Stände im Zwischenspeicher.** `install` lädt die Dateien ohne `cache:'reload'` (kann HTTP-Cache-Kopien des Vorstands holen) und läuft parallel zum ersten Laden; jede Netzantwort ersetzt einzeln ihre Kopie. Bricht das Laden ab, liegen neues `index.html` und ältere Teile nebeneinander. Mit Format 5 (Schreiben ab `F5_WRITE = true`) wird ein solcher Mischstand gefährlich.

**R3 · Handnummer und Handliste in `sw.js`.** `CACHE = 'reiseplaner-v30'` und `FILES` werden von Hand gepflegt. Parallele Threads kollidieren bei jeder Nummer; eine vergessene Datei fehlt offline (nur `tests/app-files.cjs` fängt einen Teil ab).

**R4 · Schlechtes Netz.** Netz zuerst ohne Zeitlimit: Bei sehr langsamer Verbindung (Berghütte, Roaming) wartet der Start, bis der Browser aufgibt.

**R5 · Browser löscht Daten.** Safari löscht Website-Speicher nach 7 Tagen ohne Besuch, außer die Seite ist als Home-Bildschirm-App installiert. Die App fragt heute nicht nach dauerhaftem Speicher und zeigt nicht an, ob er zugesagt ist.

**R6 · Kein sichtbarer Offline-Zustand.** Ohne Konto steht oben immer „Nur in diesem Browser“, auch offline; ob die App überhaupt offline startbar ist, sieht niemand.

**R7 · Unterlagen.** Tickets und Buchungsbelege (Thread „Dokumente und Buchungen zentral speichern“) müssen wie Fotos lokal liegen und in die Offline-Prüfung aufgenommen werden.

## 4. Zielbild

### 4.1 Service Worker mit vollständigen Versionsständen (O1, gegen R2–R4)

- Der Build (`scripts/build.mjs`) setzt in `public/sw.js` eine **Build-Kennung** (Hash über alle ausgelieferten Dateien) und die **Dateiliste** ein: alle Skripte und Stylesheets genau so, wie `index.html` sie mit `?v=<Hash>` lädt, dazu Symbole, Manifest und `catalog-data.js`. Niemand zählt mehr Nummern hoch oder trägt Dateien von Hand ein.
- Ohne Build (Entwicklung direkt aus dem Repository) bleibt die bisherige Handliste als Rückfall.
- `install` holt alle Dateien mit `cache:'reload'` in einen neuen Speicher `reiseplaner-<Kennung>`. Fehlt eine, scheitert die Installation, und der vorige vollständige Stand bleibt aktiv. Es gibt nie einen halben Stand.
- Dateien mit `?v=` sind unveränderlich: aus dem Zwischenspeicher, sonst Netz. Die Seite selbst: Netz mit Zeitlimit (4 s), danach der gespeicherte Stand. Netzantworten überschreiben den vollständigen Stand nicht mehr; der nächste Stand kommt als eigene Installation.
- Alte Speicher werden erst gelöscht, wenn der neue vollständig aktiv ist.

### 4.2 Neueres Format ist kein Schaden (O2, gegen R1)

- Liest die App eine Reise mit höherem Format als `SCHEMA_MAX`, sperrt sie Änderungen wie bisher, zeigt aber „Diese Reisen stammen aus einer neueren Version des Reiseplaners“ mit **„App aktualisieren“** und „Rohdaten sichern“ und bietet **kein Zurücksetzen** an. Für Konten gibt es das schon je Reise (`meta.unreadable`); O2 schließt die Lücke im lokalen Speicher.
- Gilt ab jetzt für jede künftige Format-Erhöhung. Ältere, bereits ausgelieferte Stände lassen sich nicht nachträglich ändern; gegen sie schützt O1.

### 4.3 „Auf diesem Gerät“ und Offline-Hinweis (O3, gegen R5/R6)

- Kopfzeile: ohne Netz „Offline · Änderungen bleiben auf diesem Gerät“ auch ohne Konto.
- Konto-Seite, Abschnitt **„Auf diesem Gerät“**: Offline startbar (ja/nein, Stand vom …), Dauerhaft gespeichert (ja/nein/unbekannt, Knopf „Dauerhaft speichern anfragen“), belegter Speicher, Zahl der Reisen, Fotos auf dem Gerät, ausstehende Änderungen; darunter die Liste „Ohne Netz nicht verfügbar“. Am iPhone der Hinweis „Zum Home-Bildschirm hinzufügen“, weil Safari sonst nach 7 Tagen löschen darf.
- `persist()` wird nur auf Knopfdruck oder beim ersten Speichern einer Reise angefragt, nie beim bloßen Öffnen.

### 4.4 „Für unterwegs bereit machen“ je Reise (O4)

Eine kurze Prüfliste in **Unterlagen → Mappe**, die nur prüft, was die App wirklich prüfen kann, und den Rest als Aufgabe nennt: App offline startbar ✓/✗ · Speicher dauerhaft ✓/✗ · mit Konto: alles abgeglichen ✓/n ausstehend · Fotos und Unterlagen dieser Reise auf dem Gerät (x von y) · Reisemappe als PDF gesichert (nicht prüfbar, nur Erinnerung mit Knopf) · Sicherungsdatei. Abstimmung mit „Dokumente und Buchungen zentral speichern“ (Unterlagen) und „Check- und Packlisten“ (Prüflisten).

### 4.5 Abgleich nach der Rückkehr ins Netz

Bleibt beim bestehenden Weg (Warteschlange, Versionsnummer je Reise, Konflikt sichtbar, nichts still überschrieben). Den Drei-Wege-Abgleich für gleichzeitige Änderungen baut der Thread „Gemeinsam mit Mitreisenden planen“ (`merge3.js`). Offline-Thread ändert daran nichts, testet aber den Weg offline → online im Browser mit.

### 4.6 PDF

Reisemappe und Reisebuch bleiben beim Druckdialog des Browsers (funktioniert offline, keine Zusatzbibliothek). Ergänzungen: Hinweis am iPhone (Teilen → Drucken → Vorschau aufziehen → „PDF sichern“), Datum und App-Stand im Fuß der Mappe, Schrift im Druck ohne Netz prüfen (Ersatzschrift).

## 5. Reihenfolge und Abstimmung

| Paket | Inhalt | Dateien | Status |
|---|---|---|---|
| O1 | Service Worker mit vollständigen Versionsständen, Build setzt Kennung und Liste ein | `sw.js`, `scripts/build.mjs`, Tests | in Arbeit |
| O2 | Neueres Format ≠ beschädigt | `app/speicher.js` (`loadLocal`), `app/ansichten.js` (`storageRecoveryBlock`) | in Arbeit |
| O3 | Offline-Hinweis, „Auf diesem Gerät“, dauerhafter Speicher | neue Datei `app/offline.js`, eine Zeile in `setSync` | geplant |
| O4 | „Für unterwegs bereit machen“ | `app/offline.js`, Mappe | geplant, nach Unterlagen-Thread |
| O5 | PDF-Hinweise, Mappe-Fuß | `app/ansichten.js` (Mappe) | geplant |

Geteilte Dateien: `sw.js` (alle Threads zählten bisher die Nummer hoch, nach O1 nicht mehr nötig), `app/speicher.js` (Thread „Gemeinsam planen“ ändert `put`, `push`, `resolve`; O2 nur `loadLocal`), `app/ansichten.js` (Oberflächen-Thread). Format 5: Thread „Offene Punkte weiterentwickeln“ entscheidet über `F5_WRITE`; O1 und O2 sollen vorher auf `main` sein.

## 6. Tests

- Node: Build-Kennung und Dateiliste stimmen mit `index.html` überein; jede Datei existiert; ohne Build Handliste vollständig (`tests/offline.cjs`). Neueres Format: kein Zurücksetzen, Sperre, Text.
- Browser (Chromium, gebaute Website): online laden, offline neu laden, Reise anlegen, neu laden; neuer Build ausgeliefert, während offline der alte vollständig bleibt; langsames Netz fällt nach Zeitlimit auf den gespeicherten Stand zurück.
- Nicht ersetzbar durch Tests hier: iPhone/Safari (Home-Bildschirm, 7-Tage-Regel, Druck als PDF).
