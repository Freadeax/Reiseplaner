# Eingebundene Bibliotheken

| Datei | Herkunft | Version | Lizenz |
| --- | --- | --- | --- |
| `supabase-js-2.117.2.js` | npm `@supabase/supabase-js@2.117.2`, Datei `dist/umd/supabase.js` (unverändert) | 2.117.2 (25.09.2026), SHA-256 `59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd` | MIT, siehe `supabase-js-LICENSE.txt` |

Die Bibliothek liegt im Repository statt auf einem CDN, damit die Website ohne fremde Laufzeit-Domain und auch offline (Service Worker) startet und bei jedem Host identisch ist. Aktualisieren: `npm pack @supabase/supabase-js@<version>`, `dist/umd/supabase.js` hierher kopieren, Dateinamen und `scripts/build.mjs`/`index.html` anpassen, Prüfsumme in dieser Tabelle aktualisieren, Tests ausführen.
