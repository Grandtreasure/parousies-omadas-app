const { createClient } = window.supabase;

window.supabaseClient = createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

window.publicAppUrl = (token) => {
  const base = new URL("./index.html", window.location.href);
  base.search = new URLSearchParams({ token }).toString();
  return base.toString();
};
