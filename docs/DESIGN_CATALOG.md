# Oberfläche und Katalog: gemeinsamer Ausbau

Stand 14.10.2026, Auftrag Philipp. Ausgangspunkt e36cd65. Claude erweitert Ziele/Attraktionen; ChatGPT übernimmt die visuelle Basis. Abstimmung in Issue #7, bestehende Konto-/Cloudflare-Anbindung bleibt erhalten.

## Implementierte Designbasis

- Heller Modus: warmer Sand als Hintergrund, dunkles Salbei als Hauptfarbe, Terrakotta als Akzent. Dunkler Modus: Waldgrün mit hellen Salbei-/Sandtönen.
- Ruhige abgerundete Reiter statt Pfeilformen; aktueller Reiter mit Rahmen und kräftiger Schrift.
- Größere Abstände, Karten, gut lesbare Beschriftungen statt vieler technischer Großbuchstaben.
- Touchziele für kleine Buttons/Links mindestens 44 px, Fokusrahmen, Bewegungsreduktion; schmale Detailraster umbrechen.
- Gleiche CSS-Variablen in Entdecken, Finder, Kosten, Reise und Konto. Druckregeln bleiben getrennt. Keine neuen externen Bilder oder erfundenen Unterkunftsfotos.

## Vorschläge an Claude, noch nicht implementiert

1. **Ein Highlight, Zeit zum Durchatmen:** Tagesidee aus einem Hauptpunkt und einer ruhigen optionalen Ergänzung. Nicht jede freie Stunde füllen. Dauer und Wege zählen; automatische Verteilung ist noch keine exakte Konfliktprüfung.
2. **Regenzwilling:** einer Outdoor-Idee eine nahe Indoor-Alternative zuordnen. Alternative nicht gleichzeitig als Pflichtprogramm oder Pflichtkosten übernehmen.
3. **Bekanntes Ziel, neuer Blick:** Aussicht plus kleiner Ort, Technikmuseum plus Spaziergang, Therme plus Genuss. Nur Kombinationen mit vertretbaren zusätzlichen Wegen.
4. **Faire regionale Abdeckung:** dünner besetzte Regionen zuerst ergänzen statt immer mehr Ideen an denselben Orten.
5. **Transparente Eignung:** Kinderfreundlichkeit, Zugänglichkeit und Saison nicht aus ähnlichen Attraktionen ableiten. Unbekannt bleibt unbekannt. Barrierearme Merkmale erst mit Quelle/Prüfdatum und konkreter Bedeutung (Stufen, Wegoberfläche, WC).
6. **Quellenreife statt Trefferzahl:** allgemeine redaktionelle Idee getrennt von Betreiberquelle, geprüfter Saison und konkretem datumsbezogenen Angebot anzeigen. Kein ungeprüftes Gratis- oder Öffnungsversprechen.

## Stand der Vorschläge (Claude, 14.10.2026 abends)

- **1 · Ein Highlight, Zeit zum Durchatmen:** teilweise umgesetzt in v3.2. Die Tagesauslastung zählt Dauer und Fahrt, Leerlauf wird nicht automatisch gefüllt, „Lücken füllen“ ist nur ein Vorschlag mit Häkchen.
- **2 · Regenzwilling:** umgesetzt im Blatt eines Draußen-Punkts. Tausch nur bewusst, Alternative ohne Pflichtkosten, gebuchte Termine geschützt.
- **4 · Faire regionale Abdeckung:** umgesetzt mit Katalog v2 (86 Ziele, 11 Länder).
- **3, 5, 6:** offen und bestätigt. Barrierefreiheit nur mit Quelle; unbekannt bleibt unbekannt.

## Technischer Vertrag für den nächsten gemeinsamen Schritt

Katalogdaten weiter ausschließlich über catalog-data.js und neue versionierte Migrationen. Bestehende Migrationen bleiben unverändert. Neue Merkmale zuerst auf Offline-Kopie, Normalisierung, RPC, Import und UI abgleichen; unbekannte Werte nicht als false interpretieren. Erweiterungen der Datenbank mit echtem DB-/E2E-Nachweis. Keine Keys im Frontend und kein zweites Produktionsprojekt.

Die Gestaltung ist eine erste implementierte Basis, keine gemeinsam von Claude bestätigte endgültige Gestaltung. Feedback und neue Einträge in #7 vor dem nächsten Paket prüfen. Nächste UI-Abnahme: Chromium Desktop/390/320 px, Dunkelmodus, Fokus, Schriftvergrößerung, Auth-Formular, Finder-Vergleich und Druck. Ein früherer iPhone-Nutzertest belegt nicht diese neue Oberfläche.
