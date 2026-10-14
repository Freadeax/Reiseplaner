/* Öffentliche Konfiguration des Reiseplaners.
   Leer = Gastmodus (Reisen nur in diesem Browser). Für die veröffentlichte Website erzeugt
   `npm run build` diese Datei in public/ aus den Umgebungsvariablen RP_SUPABASE_URL und
   RP_SUPABASE_PUBLISHABLE_KEY (siehe docs/SUPABASE_SETUP.md).
   Hier NUR die Projekt-URL und den Publishable Key (sb_publishable_…) eintragen –
   niemals Secret- oder service_role-Schlüssel. */
window.RP_CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};
