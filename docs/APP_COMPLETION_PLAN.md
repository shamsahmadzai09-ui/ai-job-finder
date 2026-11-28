# AI Job Finder — Full Application Completion Plan

## Goal
Deliver a reliable Afghanistan-only job platform, not a set of placeholder screens. Every visible action must work, show a truthful state, and be covered by acceptance tests. Never claim to scan the whole internet: only registered sources and endpoints that are permitted and technically reachable can be scanned.

## Current verified baseline (2026-11-28)
- Static PWA shell, routing, authentication flows, and private profile editor exist.
- Supabase has 10 public tables: profiles, profile_items, job_sources, jobs, job_source_runs, organization_candidates, organization_site_checks, organization_social_accounts, organization_social_posts, organization_vacancies.
- There are 1,163 organization candidate records and four job-source records.
- The live jobs table currently has zero rows.
- Two Edge Functions are deployed: check-organization-sites and scan-current-hiring.
- Organization discovery, site checks, social-account suggestions, source directory, and vacancy evidence are present.
- Job Search and Dashboard query jobs, but no jobs are currently imported.
- Recommended Jobs, CV & Cover Letter, Email Center, and Applications still contain phase placeholders.
- Live database does not yet contain applications, job_matches, generated_documents, application_events, or notifications tables.
- No scheduled scan is configured. pg_cron and pg_net were not present in the earlier extension audit.
- Source collection permissions are pending; do not change them to allowed without documented permission.
- The latest Pages deployment must be checked before claiming any commit is live.

## Product navigation and required behavior

### 1. Dashboard
- Live counts: verified active jobs, new today/yesterday, matches, saved applications, interviews.
- New opportunities feed with employer, location, posted date, deadline, source, verification badge, and original application link.
- Last scan time, scan outcome, and clear empty/error/loading states.
- Counts must come from database queries, not hard-coded demo values.

### 2. Job Search
- Search by title, employer, skills, and keywords.
- Filters: Afghan province/city, sector, employment type, remote eligibility, publication date, and deadline.
- Sort by newest and deadline.
- Only verified active jobs with a future deadline are shown as current.
- Job details page includes all extracted fields and a link to the original announcement.
- No fabricated salary, location, eligibility, or application instructions.

### 3. Job Sources
- Source inventory with type, collection method, permission state, terms/robots review dates, rate limit, last scan, and last result.
- Add/edit/review source flow restricted to authorized administrators.
- Pending/denied sources remain disabled.
- Supported adapters: RSS, Atom, documented APIs, JobPosting JSON-LD, and permitted official HTML.
- Record per-source scan history and errors.

### 4. Organization Discovery
- Search/filter the 1,163 candidates by name, sector, verification, hiring evidence, and collection permission.
- Distinguish directory/registry URLs from an employer's own website.
- Verify and record first-party website/careers URL with evidence.
- Website health checks must not be described as vacancy scans.
- Find Jobs Opportunities starts a resumable run and reports eligible, processed, blocked, pending-permission, failed, and discovered counts separately.
- Do not call an incomplete batch a completed full scan.

### 5. Recommended Jobs
- Server-side matching against the signed-in user's profile.
- Explain score components and list missing requirements.
- Mandatory eligibility checks override score.
- Never infer qualifications, experience, or personal attributes.
- Recompute when profile or job data changes.

### 6. My Profile
- Private account-owned profile and repeatable education, skills, languages, work experience, certificates, and projects.
- Validate required fields and save reliably.
- Provide export/delete controls and clear privacy notice.
- Avoid collecting sensitive details that are not necessary for job matching.
- Never use a user's age or other protected personal detail to recommend a role that violates the employer's stated eligibility.

### 7. CV & Cover Letter
- Generate drafts only from facts saved by the user.
- User can edit, preview, save, and export PDF.
- Clearly mark missing information; never invent experience, degrees, skills, references, or achievements.
- AI provider credentials remain server-side. If no AI key is configured, provide a clearly labeled template-based draft rather than pretending AI ran.

### 8. Email Center
- Optional Google OAuth connection with minimum required scopes.
- Draft/review flow shows recipient, subject, body, and attachments before any send.
- No message is sent without a separate explicit user approval.
- Gmail integration remains unavailable until valid OAuth client credentials and redirect configuration are supplied.
- Tokens must be encrypted server-side; never store them in browser localStorage.

### 9. Applications Tracker
- Save a job to the user's own application list.
- Track saved, preparing, submitted, interview, rejected, withdrawn, and offer states.
- Add notes, dates, reminders, and append-only status history.
- Submitted status must require explicit user confirmation and be auditable.
- Users can only access their own records.

### 10. Settings and notifications
- Profile preferences, province filters, work types, remote preference, and notification settings.
- Connection diagnostics for Supabase and optional integrations.
- PWA install/update/offline status.
- In-app notifications first; push/email only after permission and credentials are configured.

## Backend and security work
- Reconcile the live schema with checked-in migrations; do not apply incompatible duplicate table definitions.
- Add missing tables and indexes for matches, applications, application events, generated documents metadata, and notifications.
- Enable RLS on every exposed table and write ownership-based policies.
- Keep job ingestion, matching, AI calls, OAuth token handling, and sensitive status transitions server-side.
- Never ship service-role, AI, or OAuth secrets to the browser.
- Add server-side validation, URL/host allowlists, source rate limits, deduplication, and audit logs.
- Fix or explicitly accept each Supabase security/performance advisor finding.
- Keep job_source_runs private to trusted server/admin access unless a safe user-facing summary view is created.

## Scheduling and source permissions
- Scheduled scans every six hours only after a scheduler is configured and tested.
- Use Supabase Cron if supported/configured, or GitHub Actions with a server-only secret; never put secrets in repository files.
- Source adapters may only collect from endpoints whose terms/robots rules and permission status allow that method.
- A public webpage is not, by itself, permission for bulk automated collection.
- If a source has no feed/API and automated HTML collection is not permitted, retain a manual link-out workflow.

## Delivery order and estimated engineering effort
These are engineering estimates, not guarantees about third-party approvals or credentials.

| Sprint | Deliverable | Estimate |
|---|---|---:|
| 0 | Full audit, reconcile schema and migration history, deployment baseline | 0.5–1 day |
| 1 | Canonical jobs pipeline, source adapters, permissions, deduplication, scan runs | 2–3 days |
| 2 | Dashboard, search, job details, organization scan progress | 1–2 days |
| 3 | Profile-backed matching and Recommended Jobs | 1–2 days |
| 4 | Applications schema, tracker, history, reminders | 1–2 days |
| 5 | CV/cover-letter drafts, editing, PDF export, private document storage | 2–3 days |
| 6 | Settings, notifications, scheduled scans, optional OAuth/Gmail | 2–4 days |
| 7 | Security, accessibility, mobile/PWA, regression and end-to-end testing | 2–3 days |

Core platform estimate: about 10–16 working days. Gmail and AI-provider integrations may take longer because they require external credentials, OAuth consent configuration, and provider availability. Source coverage depends on permission and feed/API availability.

## Release acceptance checklist
- Every navigation item opens a functional page; no phase placeholder remains in the released scope.
- Every visible button has a real action and success/failure feedback.
- Fresh installs and signed-in accounts work on desktop and Android mobile.
- Job Search and Dashboard show the same canonical records.
- Date rules use Asia/Kabul; current-new view includes only today/yesterday postings and excludes expired deadlines.
- Re-running or resuming scans creates no duplicates and never falsely reports completion.
- Source permission controls are enforced by the server, not just the UI.
- RLS tests prove one user cannot read another user's profile, documents, matches, or applications.
- No secrets are present in frontend files or Git history.
- No external email or job application is sent without explicit approval.
- Automated checks pass and the deployed Pages URL is confirmed live before release is announced.
