// Fill these in from your Supabase project: Settings -> API.
//
// The anon key is *meant* to be public — it identifies the project, it does not
// grant permission. What a visitor may actually do is decided by the row level
// security policies in db/schema.sql, on the server. Never put the
// service_role key here; that one really is a master key.
window.CONFIG = {
  SUPABASE_URL: "PASTE_YOUR_PROJECT_URL_HERE",
  SUPABASE_ANON_KEY: "PASTE_YOUR_ANON_KEY_HERE",

  // Used only for displaying times. The authoritative timezone lives in the
  // shop_settings row in the database.
  TIMEZONE: "Asia/Jerusalem"
};
