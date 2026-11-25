// Safe Supabase connection layer.
//
// - Validates the configuration before anything is attempted.
// - Refuses to run with a service_role key (that key must never reach a browser).
// - Loads the supabase-js library lazily, only when it is needed and configured.
// - Never logs keys or tokens.

import { CONFIG } from './config.js';

// Pinned to an exact version. Upgrade deliberately and re-test.
const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

function decodeJwtRole(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64)).role ?? null;
  } catch {
    return null;
  }
}

/** Returns { state: 'missing' | 'invalid' | 'dangerous' | 'ready', message } */
export function getConfigStatus() {
  const url = (CONFIG.SUPABASE_URL || '').trim();
  const key = (CONFIG.SUPABASE_ANON_KEY || '').trim();

  if (!url || !key || /YOUR-/i.test(url) || /YOUR-/i.test(key)) {
    return { state: 'missing', message: 'Supabase is not configured yet. Edit js/config.js (see README).' };
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    return { state: 'invalid', message: 'SUPABASE_URL must look like https://<project-ref>.supabase.co' };
  }
  if (decodeJwtRole(key) === 'service_role' || /^sb_secret_/i.test(key)) {
    return {
      state: 'dangerous',
      message: 'A secret/service_role key was found in js/config.js. Remove it immediately, rotate it in Supabase, and use the anon/publishable key instead.'
    };
  }
  return { state: 'ready', message: 'Configuration looks valid.' };
}

let clientPromise = null;

/** Lazily creates the Supabase client. Throws if the configuration is not 'ready'. */
export function getClient() {
  const status = getConfigStatus();
  if (status.state !== 'ready') return Promise.reject(new Error(status.message));

  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ SUPABASE_JS_URL).then(({ createClient }) =>
      createClient(CONFIG.SUPABASE_URL.trim(), CONFIG.SUPABASE_ANON_KEY.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    ).catch((err) => {
      clientPromise = null; // allow retry
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Real connection test used by the Settings page.
 * Returns an array of { label, ok, detail } steps.
 */
export async function testConnection() {
  const steps = [];
  const status = getConfigStatus();
  steps.push({ label: 'Configuration', ok: status.state === 'ready', detail: status.message });
  if (status.state !== 'ready') return steps;

  // 1) Reachability: Supabase Auth health endpoint (no user data involved).
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${CONFIG.SUPABASE_URL.trim().replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY.trim() },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    steps.push({
      label: 'Project reachable',
      ok: res.ok,
      detail: res.ok ? 'Supabase Auth responded.' : `Supabase responded with HTTP ${res.status}. Check the URL and anon key.`
    });
  } catch (err) {
    steps.push({
      label: 'Project reachable',
      ok: false,
      detail: err.name === 'AbortError' ? 'Timed out after 8 seconds.' : 'Network error. Are you online, and is the URL correct?'
    });
  }

  // 2) Client library loads and initializes (local session check only; no data is read).
  try {
    const client = await getClient();
    const { error } = await client.auth.getSession();
    steps.push({
      label: 'Client library',
      ok: !error,
      detail: error ? 'Loaded, but session check failed.' : 'supabase-js loaded and initialized. No user signed in yet (login arrives in Phase 2).'
    });
  } catch {
    steps.push({
      label: 'Client library',
      ok: false,
      detail: 'Could not load supabase-js from the CDN. Check your connection and the Content-Security-Policy.'
    });
  }
  return steps;
}
