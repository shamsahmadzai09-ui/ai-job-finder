// Public, browser-safe configuration.
//
// WHAT BELONGS HERE
//   - SUPABASE_URL:       your project URL (Supabase dashboard > Project Settings > API).
//   - SUPABASE_ANON_KEY:  the "anon" / "publishable" key. It is designed to be public and is
//                         only safe because Row Level Security (Phase 2) protects the data.
//
// WHAT MUST NEVER BE HERE
//   - The service_role / secret key, Groq API key, Google client secret, OAuth tokens,
//     or any password. Those live only in Supabase Edge Function secrets.
//     (supabase-client.js refuses to start if it detects a service_role key.)

export const CONFIG = {
  APP_NAME: 'AI Job Finder',
  APP_VERSION: '0.2.0-afghanistan',
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-SUPABASE-ANON-PUBLIC-KEY'
};
