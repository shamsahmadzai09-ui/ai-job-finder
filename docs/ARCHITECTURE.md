# Architecture

## Goals

1. **Truthful**: matches and documents use only facts the owner provided. No invented jobs, experience, or confirmations.
2. **Safe**: no secrets in the browser; private data protected by Row Level Security; nothing sent or submitted without approval.
3. **Simple to run**: static frontend + Supabase. No build step, no server to maintain.

## System overview

```
┌──────────────────────── Browser (PWA) ────────────────────────┐
│  Static HTML/CSS/JS  ·  Service worker (app shell only)       │
│  Holds: Supabase URL + anon key, user session (Supabase Auth) │
└───────┬───────────────────────────────┬───────────────────────┘
        │ supabase-js (RLS-protected)   │ supabase.functions.invoke (JWT)
        ▼                               ▼
┌───────────────────┐        ┌──────────────────────────────────┐
│ Postgres + RLS    │◄──────►│ Edge Functions (Deno)            │
│ Auth, Storage     │        │  job-ingest   analyze-job        │
│ (private buckets) │        │  generate-doc gmail-oauth        │
└─────────▲─────────┘        │  gmail-sync   gmail-send         │
          │                  │ Secrets: Groq key, Google client │
   pg_cron / pg_net          │ secret, service role (server only)│
   (scheduled calls)         └───────┬──────────────┬───────────┘
                                     ▼              ▼
                              Groq API     Gmail API / job-source feeds
```

### Why this split

| Concern | Where it lives | Reason |
|---|---|---|
| UI, routing, display | Browser | No secrets needed |
| Reading/writing the user's own rows | Browser via supabase-js | RLS enforces ownership |
| Groq calls, Gmail tokens, job fetching, status transitions | Edge Functions | Secrets and trust decisions must stay server-side |
| Periodic search | Supabase Cron invoking Edge Functions | Runs when the app is closed |

The browser is never trusted for approvals: "send this email" and "mark as submitted" are validated in Edge Functions that check the stored draft, the approval record, and (for submission) a reliable confirmation signal.

## Security boundaries

- **Browser-visible**: project URL, anon key (public by design).
- **Server-only (Supabase secrets)**: `GROQ_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, token-encryption key, service-role key.
- **Gmail tokens**: refresh tokens stored encrypted, in a table with no client access policy; only Edge Functions read them.
- **CSP** (`index.html` and `_headers`): scripts only from self and jsDelivr; connections only to self and Supabase; no inline script or style.
- **DOM safety**: pages are built with `createElement`/`textContent`. Job descriptions and emails (untrusted text) are never injected as HTML.
- **Service worker**: allowlist cache of static shell files only. Cross-origin and API traffic is never intercepted, so profile data, email, tokens, and documents are never cached.
- **Config guard**: `supabase-client.js` refuses to start if the configured key decodes to `service_role` or starts with `sb_secret_`.

## Frontend design

- Vanilla ES modules, hash router (`#/search`), works from any sub-path, no build step.
- Layout: fixed sidebar on desktop; off-canvas drawer below 900 px. Light and dark themes from `prefers-color-scheme`.
- Semantic color tokens (CSS variables), system font stack including Arabic-script fallback for Pashto/Dari content later.
- Accessibility: skip link, visible focus, `aria-current` on navigation, reduced-motion support, live regions for results and toasts.
- Honest empty states: unbuilt pages say which phase delivers them and offer no dead buttons.

## Pages

Dashboard, Afghanistan Job Search, Recommended, Job Details, My Profile, CV & Cover Letter, Email Center, Applications (tracker), Settings.

## Phase 1 foundation decisions

- **Hash routing** instead of the History API: works on any static host without rewrite rules.
- **Lazy supabase-js**: loaded only once the config is valid and only when first needed, so the shell works with no network or no config.
- **Manual SW update flow**: new versions wait until the user clicks Reload, so code never swaps mid-session.
- **Real checks only**: the Settings connection test calls the Supabase Auth health endpoint and initializes the client; nothing is simulated.

## Planned data model (Phase 2)

`profiles` and `user_settings` (private per account), `jobs` (Afghanistan-only published vacancies, deduplicated by source + external id / normalized content hash), `job_matches` (per user, with score breakdown JSON, eligibility status, explanation), `applications` (private per user), followed by `generated_documents`, `application_events` (append-only audit trail), `connected_accounts`, `email_messages`, and `notifications` as later phases.

All user-owned tables get RLS (`user_id = auth.uid()`). The initial migration creates private `profiles`, `user_settings`, `job_matches`, and `applications`; only published Afghan jobs are publicly readable. Job writes are server-only. Users can create a saved application and edit its notes, but status transitions (especially Submitted) must go through server functions and reliable confirmation; direct client status updates are blocked.

## Afghanistan-only job scope

- No vacancies outside Afghanistan are included.
- Listings must be based in Afghanistan or explicitly accept applicants residing in Afghanistan.
- Province/city, sector, and employment type are searchable filters.
- Every imported vacancy retains its source URL and source name; unverified or expired listings are not presented as active.

## Matching model (Phase 3)

Configurable weights (default): education 25, computer skills 20, language 20, responsibilities/skills 20, location and other 15. Score bands: 85-100 Excellent, 70-84 Possible, below 70 hidden from recommendations. A separate **eligibility check** (age, education, experience, language, location, other mandatory requirements) is computed independently and always wins: an ineligible job is labelled so regardless of score.

## Hosting

Cloudflare Pages (recommended) or Netlify: free tier, HTTPS, honors `_headers`. GitHub Pages works but cannot set response headers.
