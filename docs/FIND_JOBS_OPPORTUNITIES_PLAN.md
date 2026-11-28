# Find Jobs Opportunities — implementation plan

## Product goal

Add a prominent **Find Jobs Opportunities** action to Organization Discovery. A signed-in user starts a resumable discovery run. Eligible announcements are validated, normalized, de-duplicated, stored once, and surfaced on the Dashboard with their original source and application route.

The feature must never claim to scan the entire internet. It scans the registered source inventory and the permitted endpoints those sources expose.

## Chosen approach

Use a source-adapter pipeline, in this order:

1. **Official employer RSS / Atom feeds and documented APIs** — preferred because they are structured, efficient, and intended for redistribution or machine access.
2. **Official employer JobPosting JSON-LD** — parse Schema.org fields such as title, hiring organization, datePosted, validThrough, jobLocation, description, employmentType, and application contact details.
3. **Official employer career pages and sitemaps** — limited HTML extraction only when source terms and robots policy permit it.
4. **Job portals / aggregators** — discovery-only until an approved API/feed or explicit permission is recorded. Do not scrape or bulk-copy a portal merely because its pages are public.
5. **Search-engine discovery** — optional lead generation only; never treat a search snippet or its displayed date as proof that a vacancy is current.

Do not bypass authentication, bot protection, rate limits, robots rules, or source terms. Keep sources with pending or denied permission disabled for automated import.

## Click-to-Dashboard workflow

1. User clicks **Find Jobs Opportunities** in Organization Discovery.
2. Frontend creates or resumes a scan run and displays progress, batch count, source count, and skipped/blocked counts.
3. Backend selects only enabled sources whose permission status is allowed.
4. Source adapters fetch feeds/API data or permitted official pages, with per-source rate limits and safe HTTPS/host checks.
5. Extract each vacancy's evidence and fields:
   - Job title and hiring organization
   - Original announcement URL and source website/domain
   - Published date and last application date
   - Province, city, duty station, or remote status
   - Employment type and salary, only when explicitly stated
   - Concise description, responsibilities, qualifications, education and experience summaries (the original link retains the complete posting)
   - Application method: official form, email, or other stated route
   - Application URL/email and the exact application instructions
   - Source evidence, fetch time, and verification status
6. Validate dates using Asia/Kabul: only postings dated **today or yesterday** are eligible for the new-jobs Dashboard view. A future deadline is required for a vacancy to be marked active/current. Missing or ambiguous dates/deadlines remain in review and are not shown as confirmed current. Expired and rejected items are excluded.
7. De-duplicate by canonical original URL, source external ID, and normalized content hash. Re-scans update the same record rather than creating copies.
8. Persist accepted vacancies through a server-side Edge Function using the service role; never expose a service-role key in browser code.
9. Dashboard shows new verified opportunities, source, location, posted/deadline dates, full details, and a clearly labeled **Apply on original site** link. It also shows the last scan time and scan summary.
10. A failed or interrupted scan saves its cursor and can resume. A scan is only marked complete after every eligible source/batch has been processed.

## Data model changes

The live database currently contains two parallel vacancy paths:
- organization_vacancies for organization-page scan evidence
- jobs + job_sources + job_source_runs for the Job Search pipeline

The existing scan-current-hiring function writes to organization_vacancies, while Job Search reads jobs. The implementation must unify these paths or add a single ingestion adapter so a successful scan reaches the same canonical job record used by Dashboard and Job Search.

Preserve source attribution and the original URL. Add concise application-instruction excerpts and extraction evidence in jobs.metadata; preserve the exact application email/form URL and original announcement link. Do not republish entire copyrighted job descriptions. Keep organization_vacancies as audit/evidence history if needed, but do not show it as a confirmed job without passing the canonical validation rules.

## Source governance

Current database audit (2026-11-28):
- 1,163 organization candidates have collection_permission_status = pending.
- All 4 registered job portals have permission_status = pending.
- Therefore there are currently no approved sources to enable for automated importing.

Do not silently change pending sources to allowed. Add a source-review workflow that records the evidence, terms review date, robots review date, permitted collection method, rate limit, and reviewer decision. Public visibility or a reachable website alone is not permission.

## Safety and quality rules

- Country scope remains Afghanistan, including remote work only where the employer explicitly accepts applicants residing in Afghanistan.
- Use Kabul calendar dates, not the browser's UTC date.
- For the current-new-jobs view, require publication date to be today or yesterday.
- Never show an expired deadline as active.
- Do not infer missing location, salary, qualifications, age requirements, or application instructions. Label missing fields as not stated.
- Keep official source links visible and never submit an application automatically.
- Preserve exact age/eligibility requirements stated by the employer; do not recommend roles a user is not eligible to apply for.
- Record blocked, unreachable, unsupported, and permission-pending sources as distinct outcomes; none of these outcomes means “no jobs exist”.

## Delivery phases and estimates

These are engineering effort estimates, not a promise that third-party permissions or API credentials will be granted on this schedule.

| Phase | Deliverable | Estimate |
|---|---|---:|
| 0 | Audit current schema, scanner, source permissions, and data flow | 0.5 day |
| 1 | Canonical vacancy schema + secure ingestion and de-duplication | 1–1.5 days |
| 2 | Source adapters: RSS/Atom, JSON-LD, approved API, permitted HTML | 1–2 days |
| 3 | Organization button, resumable progress, source outcomes | 0.5–1 day |
| 4 | Dashboard cards, full details, original application route | 0.5–1 day |
| 5 | Date-boundary, expiry, duplicate, RLS, and end-to-end tests | 1 day |

**Reliable MVP estimate: 4.5–7 working days** once at least one source is approved and reachable. If all source permissions remain pending, the UI and pipeline can be built and tested with fixtures, but live automatic imports must remain disabled. Broad coverage of every website cannot be guaranteed; new sources need individual compatibility and permission review.

## Acceptance tests

- Clicking the button starts or resumes a scan and shows truthful progress.
- A source with pending/denied permission is never fetched for automatic import.
- Today/yesterday postings are eligible; older or future-dated postings are rejected.
- Past-deadline vacancies never appear as current.
- Missing dates or application instructions are visibly marked for review, not invented.
- Each accepted record shows its source URL, employer, location, deadline, and application route where present.
- Re-running a scan updates records without duplicates.
- An interrupted scan resumes without skipping or double-counting batches.
- Dashboard and Job Search read the same canonical vacancy records.
- No privileged key is shipped to the frontend.
