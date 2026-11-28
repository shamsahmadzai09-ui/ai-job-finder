# AI Job Finder

A multi-user AI-assisted job-search PWA for people looking for work **inside Afghanistan only**. Each person will have a separate private profile. The platform will collect Afghan vacancies from permitted government, private-sector, NGO, and organization sources; match jobs to each user's profile; prepare application documents; and track applications. No application or email is submitted without explicit approval. **Nothing is sent or submitted without explicit approval.**

**Status: In progress — foundation and organization discovery are present, but the full product is not yet complete.** The live database currently has no imported job records; Recommended Jobs, CV & Cover Letter, Email Center, and Applications still need implementation. See [docs/APP_COMPLETION_PLAN.md](docs/APP_COMPLETION_PLAN.md) for the complete product scope, delivery order, dependencies, and release tests.

| Area | Current verified state |
|---|---|
| PWA shell, routing, authentication, private profile editor | Implemented; deployment/device verification remains |
| Organization discovery and website checks | Implemented; these checks are not proof every employer career site was scanned |
| Job sources and vacancy ingestion | Partial; permissions are pending and live jobs table currently has 0 rows |
| Dashboard and Job Search | UI and database queries exist; awaiting verified imported jobs |
| Recommended Jobs / matching | Profile-based keyword scoring and explanations implemented; advanced persisted/AI matching remains |
| CV & Cover Letter / PDF | Profile-based editable templates, private saving, and print-to-PDF implemented; AI provider not configured |
| Email Center / Gmail | Private email drafts and manual mail-app handoff implemented; Gmail OAuth not configured |
| Applications tracker | Save jobs, private status/notes, and status history implemented; needs end-to-end account testing |
| Scheduled scans and notifications | Not configured |
| Full security and end-to-end release tests | Remaining |

---

## Folder structure

```
ai-job-finder/
├── index.html                  App entry point (shell + CSP meta tag)
├── offline.html                Offline fallback page
├── manifest.webmanifest        PWA manifest
├── sw.js                       Service worker (allowlist cache of the static shell only)
├── _headers                    Security headers for Cloudflare Pages / Netlify
├── .gitignore
├── css/styles.css              Styles (light/dark, responsive, no inline styles)
├── js/
│   ├── config.js               PUBLIC settings: Supabase URL + anon key placeholders
│   ├── supabase-client.js      Config validation, lazy client, real connection test
│   ├── app.js                  Shell, hash router, mobile drawer
│   ├── pages.js                Page renderers, account sign-in and private profile editor
│   ├── pwa.js                  SW registration, update + install prompts, offline state
│   ├── ui.js                   DOM helpers (no innerHTML), icons, toasts
│   ├── seed-profile.js         Initial profile (read-only until Phase 2)
│   └── offline.js              Script for offline.html
├── icons/                      192, 512, maskable 512, Apple touch icon, favicon
├── docs/ARCHITECTURE.md
└── supabase/
    ├── migrations/             SQL goes here (Phase 2)
    └── functions/              Edge Functions go here (Phases 3-6)
```

---

## 1. Run it locally

A service worker needs `http://localhost` or HTTPS, so do not open `index.html` by double-clicking.

**Windows (recommended):** open the extracted project folder and double-click the existing `start-local.bat`. It starts the server from that folder, uses port **8081** (so an old server on 8080 cannot interfere), and opens the app in your browser automatically. Keep the server terminal window open while using the app.

The terminal must show a path ending in your extracted `ai-job-finder` project folder. That folder must contain `index.html`, `css`, and `js`.

**Any OS / manual:**

```bash
cd ai-job-finder
python3 -m http.server 8081
# Windows can use: py -m http.server 8081
# or: npx serve . --listen 8081
```

Open <http://localhost:8081>. If you see a directory listing of Windows folders such as Desktop or Documents, stop that server with Ctrl+C: it is running from the wrong folder. Start the existing launcher from the folder containing `index.html`.

---

## 2. Product scope

- Country scope: Afghanistan only; no international vacancies.
- Locations: all Afghan provinces and cities, with province/city filters.
- Work types: full-time, part-time, contract, internship, and remote roles only when the employer and job are based in Afghanistan or explicitly open to candidates residing in Afghanistan.
- Users: public multi-user platform; each account can access only its own private profile, documents, matches, and application records.
- Sources: permitted and verifiable Afghan government, private-sector, NGO, and employer vacancy sources. Each listing must retain its original source link and publication/deadline information where available.

## 3. Create your Supabase project and connect it

1. Go to <https://supabase.com>, create a project, and wait for it to finish provisioning.
2. Open **Project Settings > API**.
3. Copy the **Project URL** and the **anon / publishable** key.
4. Edit `js/config.js`:
   ```js
   SUPABASE_URL: 'https://abcdxyz.supabase.co',
   SUPABASE_ANON_KEY: '<your anon/publishable key>',
   ```
5. **Never** put the `service_role` / secret key in this file. The app detects it and refuses to start, but treat that as a last line of defense. If you ever paste one by mistake, rotate it in the Supabase dashboard.

The anon key is designed to be public. It becomes safe to ship only because Row Level Security (Phase 2) protects the data. Do not put any private user data in the database before Phase 2 is applied.

Do not paste any keys into the chat with an AI assistant.

## 4. GitHub setup

Keep this repository **private** until its Git history has been cleaned of previously committed personal information. The current app files use an empty public-safe profile template; real profile data must only be stored in a private, access-controlled database after Phase 2.

```bash
cd ai-job-finder
git init
git add .
git commit -m "Phase 1: project foundation"
git branch -M main
git remote add origin https://github.com/<your-username>/ai-job-finder.git
git push -u origin main
```

Before every commit, run `git status` and confirm no `.env` files or secret keys are staged.

## 5. Hosting (recommended: Cloudflare Pages)

The app is plain static files with no build step.

1. Cloudflare dashboard > **Workers & Pages > Create > Pages > Connect to Git**.
2. Select the repository.
3. Framework preset: **None**. Build command: *(empty)*. Output directory: `/`.
4. Deploy. You get an HTTPS URL, which is required for installing the PWA.

Cloudflare Pages reads `_headers`, so the security headers (CSP, `X-Frame-Options`, and others) are applied. **Netlify** works identically. GitHub Pages also works, but it ignores `_headers` (the CSP `<meta>` tag in `index.html` still applies).

---

## 6. How to test Phase 1

**A. Basic load**
1. Run locally, open the URL. The dashboard loads with five stat cards showing "–" and "Available in Phase N".
2. Header pill reads **Supabase: Not configured** (amber).
3. Click every sidebar item. Each page loads, the title updates, the active item is highlighted. There are no buttons that do nothing.
4. Open `#/job/123` in the address bar: "Job not found" empty state. Open `#/nonsense`: "Page not found".

**B. Responsive**
5. Narrow the window below 900 px (or use device mode). The sidebar becomes a drawer opened by the menu button; the backdrop, Escape key, and choosing a link all close it.
6. Switch your OS to dark mode: the app follows it.

**C. Configuration safety**
7. In `js/config.js`, set a valid-looking URL (`https://abcdxyz.supabase.co`) and any anon key. The pill changes to **Config valid**.
8. Settings > **Test Supabase connection**. With real values you should see three OK rows (configuration, project reachable, client library). With wrong values you get a clear Failed row.
9. Temporarily set a key that is a `service_role` JWT (use a dummy one only) and confirm the pill turns red: **Unsafe key!** Remove it afterwards.

**D. PWA**
10. Chrome DevTools > Application > **Manifest**: no errors, three icons listed. **Service Workers**: `sw.js` activated.
11. Application > Cache Storage: only `ajf-shell-v1` with the static files. Nothing from supabase.co.
12. Tick **Offline** in DevTools > Network and reload: the app shell still opens and the offline banner appears. Navigate to a URL that was never cached: the offline page appears.
13. On the deployed HTTPS URL, install the app (Chrome address-bar install icon, or Settings > Install app). On Android Chrome use "Add to Home screen"; on iOS Safari use Share > Add to Home Screen.
14. Make a trivial change to a file, bump `CACHE_VERSION` in `sw.js`, reload: a "new version" toast with a Reload button appears.
15. Settings > **Clear offline data** resets the worker and cache.

---

## Phase 1 checklist

**Built and verified in this environment**
- [x] All JS files pass a syntax check; `manifest.webmanifest` is valid JSON
- [x] Every file in the service worker's precache list exists; all key URLs return HTTP 200 from a local server
- [x] App renders in headless Chrome: sidebar, dashboard, five stat cards, status pill, settings page
- [x] Mobile layout (390 px) renders correctly with the drawer menu button

**Implemented but you must test on your side**
- [ ] Settings > Test Supabase connection against your real project (needs your URL and anon key)
- [ ] Service worker install, offline fallback, and update toast (DevTools steps above)
- [ ] PWA installation on HTTPS (desktop and phone)
- [ ] Desktop layout with sidebar visible and no menu button (CSS fixed after my last desktop screenshot, which I could not re-capture)
- [ ] Loading supabase-js from the jsDelivr CDN (needs internet; the CSP allows it)

**Not built yet (by design)**
- [ ] Login, database, RLS, secure profile saving (Phase 2)
- [ ] Job sources, matching, AI, documents, Gmail, tracker, automation (Phases 3-6)

**Known limitations**
- Profile page now contains optional personal, education, skills, language, work-experience, certificate, project, and CV-planning sections. Repeatable sections support adding/removing entries. Secure saving is not enabled until Phase 2; do not enter real personal details in the public preview.
- supabase-js is loaded from a CDN at a pinned version; a later phase can vendor it locally for tighter control.
- `CACHE_VERSION` in `sw.js` must be bumped manually whenever a shell file changes.
