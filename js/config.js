// Supabase project: Settings -> API.
//
// The anon key is *meant* to be public — it identifies the project, it does not
// grant permission. What a visitor may actually do is decided by the grants and
// row level security policies in supabase/migrations, on the server. Never put
// the service_role key here; that one really is a master key.
window.CONFIG = {
  SUPABASE_URL: "https://qvwncsjqlaextvlifmaz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2d25jc2pxbGFleHR2bGlmbWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTQwMDQsImV4cCI6MjEwMzg3MDAwNH0.pFUKBgU-0V_7PKmlxfNCrbQnbNh7YZAYO-YamdJ_vp0",

  // Used only for displaying times. The authoritative timezone lives in the
  // shop_settings row in the database.
  TIMEZONE: "Asia/Jerusalem"
};
