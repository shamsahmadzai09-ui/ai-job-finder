import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function safeHttps(raw: string): URL | null {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password || !h ||
        h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
        h.endsWith(".internal") || /^[0-9.]+$/.test(h) || h.startsWith("[") ||
        h === "metadata.google.internal") return null;
    return u;
  } catch { return null; }
}
async function readLimited(response: Response, max = 1200000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(all);
}

const robotsCache = new Map<string, Promise<boolean>>();
async function robotsAllows(target: URL): Promise<boolean> {
  const key = target.origin;
  if (!robotsCache.has(key)) {
    robotsCache.set(key, (async () => {
      try {
        const response = await fetch(key + "/robots.txt", {
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": "AIJobFinder-Afghanistan-VacancyReview/1.0" },
        });
        if (response.status === 404) return true;
        if (!response.ok) { try { await response.body?.cancel(); } catch { /* ignore */ } return false; }
        const text = (await readLimited(response, 100000)).slice(0, 100000);
        const lines = text.split(/\r?\n/);
        let applies = false;
        let active = false;
        const rules: {allow:boolean,path:string}[] = [];
        for (const raw of lines) {
          const line = raw.split("#")[0].trim();
          const colon = line.indexOf(":");
          if (colon < 0) continue;
          const field = line.slice(0, colon).trim().toLowerCase();
          const value = line.slice(colon + 1).trim();
          if (field === "user-agent") {
            if (active && rules.length) applies = true;
            active = value === "*" || /AIJobFinder/i.test(value);
            if (active) applies = true;
          } else if (active && (field === "disallow" || field === "allow") && value) {
            rules.push({ allow: field === "allow", path: value });
          }
        }
        if (!applies) return true;
        const path = target.pathname + target.search;
        const matched = rules.filter((r) => path.startsWith(r.path)).sort((a,b) => b.path.length - a.path.length)[0];
        return !matched || matched.allow;
      } catch { return false; }
    })());
  }
  return await robotsCache.get(key)!;
}

async function fetchPage(raw: string, baseHost?: string) {
  let current = safeHttps(raw);
  if (!current || (baseHost && current.hostname !== baseHost)) return null;
  for (let hop = 0; hop <= 4; hop++) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "AIJobFinder-Afghanistan-VacancyReview/1.0", "Accept": "text/html,application/ld+json" },
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      try { await response.body?.cancel(); } catch { /* ignore */ }
      if (!loc || hop === 4) return null;
      const next = safeHttps(new URL(loc, current).toString());
      if (!next || (baseHost && next.hostname !== baseHost)) return null;
      current = next;
      continue;
    }
    if (!response.ok) { try { await response.body?.cancel(); } catch { /* ignore */ } return null; }
    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/ld\+json|text\/plain|application\/xml|text\/xml/i.test(type)) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      return null;
    }
    return { url: current.toString(), html: await readLimited(response) };
  }
  return null;
}
function plain(s: string) {
  return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
}
function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function collectJobPostings(value: any, out: any[] = []) {
  if (!value) return out;
  if (Array.isArray(value)) { for (const v of value) collectJobPostings(v, out); return out; }
  if (typeof value !== "object") return out;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((t: unknown) => String(t).toLowerCase() === "jobposting")) out.push(value);
  if (value["@graph"]) collectJobPostings(value["@graph"], out);
  return out;
}
function locationText(value: any): string | null {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const parts: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const address = item.address || item;
    if (typeof address === "string") { parts.push(address); continue; }
    const bits = [address.streetAddress, address.addressLocality, address.addressRegion, address.addressCountry]
      .filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
    if (bits.length) parts.push(bits.join(", "));
  }
  return [...new Set(parts)].join(" / ").slice(0, 250) || null;
}
function extractStructured(html: string, pageUrl: string) {
  const found: any[] = [];
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try { collectJobPostings(JSON.parse(raw), found); } catch { /* malformed JSON-LD is ignored */ }
  }
  return found.map((job) => {
    const title = typeof job.title === "string" ? job.title : "";
    const linkRaw = typeof job.url === "string" ? job.url : pageUrl;
    let vacancyUrl = pageUrl;
    try { vacancyUrl = new URL(linkRaw, pageUrl).toString(); } catch { /* use source page */ }
    const posted = dateOnly(job.datePosted);
    const deadline = dateOnly(job.validThrough);
    const today = new Date().toISOString().slice(0, 10);
    const status = posted && deadline && posted <= today && deadline >= today
      ? "current"
      : deadline && deadline < today ? "expired" : "needs_review";
    return {
      job_title: title.slice(0, 250) || "Untitled vacancy",
      vacancy_url: vacancyUrl,
      source_page_url: pageUrl,
      date_posted: posted,
      valid_through: deadline,
      vacancy_status: status,
      employment_type: Array.isArray(job.employmentType) ? job.employmentType.join(", ").slice(0, 120) : String(job.employmentType || "").slice(0, 120) || null,
      location_text: locationText(job.jobLocation),
      evidence_excerpt: "Schema.org JobPosting structured data",
    };
  });
}
function isGenericVacancyLabel(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[→←›»]/g, " ").replace(/\s+/g, " ").trim();
  const generic = new Set([
    "jobs", "job", "careers", "career", "vacancies", "vacancy",
    "job vacancies", "job opportunities", "work with us", "join our team",
    "view open roles", "view all jobs", "all jobs", "all vacancies",
    "open positions", "vacant positions", "career opportunities",
    "نور ولولی", "ټول بستونه", "ټولې دندې وګورئ", "بست های دیگر",
    "کاریابی", "کارموندنه", "فرصت های شغلی", "فرصت‌های شغلی",
    "درخواست", "دری", "more_here"
  ]);
  return generic.has(normalized) || normalized.length < 5;
}

function isExcludedVacancyPage(pathOrTitle: string): boolean {
  const s = pathOrTitle.toLowerCase().trim();
  const looksLikeUrl = /^https?:\/\//.test(s) || s.startsWith("/");
  if (looksLikeUrl) {
    return /(?:^|[\/_-])(?:privacy|policy|about|who-we-are|director(?:'s|s)?-message|executive-director-message|resources?|tenders?|news|blog|contact|career-guidance|jobs-app|register-your-interest|our-work|what-we-do|annual-report|financial-report|recruitment-privacy|cookie|terms-and-conditions)(?:[\/_.?#-]|$)/.test(s);
  }
  return /^(?:privacy policy|jobs app privacy policy|about(?: us)?|who we are|director(?:'s|s)? message|executive director message|resources?|tenders?|news|blog|contact|career guidance|register your interest|terms(?: and conditions)?|cookie policy)$/i.test(s)
    || /director(?:'s|s)?\s+message|message from.{0,20}director|privacy policy|jobs app privacy policy|register your interest/i.test(s);
}
function isStrongVacancyTitle(value: string): boolean {
  const title = plain(value).replace(/\s+/g, " ").trim();
  if (!title || title.length < 6 || title.length > 120 || isGenericVacancyLabel(title) || isExcludedVacancyPage(title)) return false;
  const englishRole = /\b(?:assistant|officer|manager|engineer|specialist|coordinator|director|accountant|teacher|driver|clerk|technician|supervisor|analyst|intern|consultant|guard|nurse|team leader|cashier|operator|advisor|adviser|enumerator|surveyor|lecturer|professor|doctor|midwife|pharmacist|hr officer|human resources officer|it support officer)\b/i;
  const localRole = /(?:^|\s)(?:انجینیر|داکتر|تکنیشن|افسر|سکرتر|معلم|استاد|نرس|قابله|فارمسست|حسابدار|مشاور)(?:\s|$)|(?:بست خالی|اعلان وظیفه|اعلان کاریابی|فرصت شغلی|کارشناس(?:ی)?|کارمند اداری)/;
  return englishRole.test(title) || localRole.test(title);
}
function parseDateToken(token: string): string | null {
  const t = token.trim().replace(/[,،]/g, "");
  if (/^20\d{2}-\d{1,2}-\d{1,2}$/.test(t)) return dateOnly(t);
  const parsed = new Date(t);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}
function labeledDate(text: string, kind: "posted" | "deadline"): string | null {
  const labels = kind === "deadline"
    ? "(?:deadline|closing date|apply before|last date|application deadline|date of closing|د پای نېټه|وروستۍ نېټه|آخرین مهلت|مهلت درخواست|تاریخ ختم|تاریخ نهایی)"
    : "(?:date posted|posted on|publication date|published on|announcement date|تاریخ نشر|تاریخ اعلان|تاریخ انتشار)";
  const date = "(20\\d{2}-\\d{1,2}-\\d{1,2}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+20\\d{2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2})";
  const match = text.match(new RegExp(labels + "[^\\n]{0,90}?" + date, "i"));
  return match ? parseDateToken(match[1]) : null;
}
function extractPageVacancy(html: string, pageUrl: string, fallbackTitle: string) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const title = plain(h1 || titleTag || fallbackTitle).replace(/\s+[|–—-]\s+.*$/, "").trim().slice(0, 250);
  if (!isStrongVacancyTitle(title)) return null;
  const body = plain(html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ")).slice(0, 50000);
  const date_posted = labeledDate(body, "posted");
  const valid_through = labeledDate(body, "deadline");
  const hasVacancyContext = /(?:job description|key responsibilities|responsibilities|requirements|qualifications|duty station|employment type|how to apply|vacancy|job opening|position summary|شرح وظایف|شرایط وظیفه|مسئولیت‌ها|مسوولیت ها|شرایط استخدام|محل وظیفه|آخرین مهلت|مهلت درخواست)/i.test(body);
  const hasApplySignal = /(?:apply now|apply for this|submit application|how to apply|send (?:your )?(?:cv|resume)|application form|درخواست|ارسال خلص سوانح|ثبت نام|ثبت‌نام|درخواست آنلاین)/i.test(body);
  if (!hasVacancyContext || (!hasApplySignal && !valid_through)) return null;
  const today = new Date().toISOString().slice(0, 10);
  const vacancy_status = date_posted && valid_through && hasApplySignal && date_posted <= today && valid_through >= today
    ? "current" : valid_through && valid_through < today ? "expired" : "needs_review";
  const locMatch = body.match(/(?:location|duty station|work location|place of work|محل وظیفه|موقعیت وظیفوی|موقعیت کاری|محل کار)\s*[:：-]?\s*([^\n.]{3,100})/i);
  return {
    job_title: title, vacancy_url: pageUrl, source_page_url: pageUrl,
    date_posted, valid_through, vacancy_status, employment_type: null,
    location_text: locMatch ? locMatch[1].trim().slice(0, 250) : null,
    evidence_excerpt: "Job title extracted from the official vacancy page; dates and location parsed only when explicitly labeled.",
  };
}
function isValidVacancyCandidate(item: any): boolean {
  const title = String(item.job_title || "");
  if (isExcludedVacancyPage(title) || isGenericVacancyLabel(title)) return false;
  if (isExcludedVacancyPage(String(item.vacancy_url || ""))) return false;
  if (item.evidence_excerpt === "Schema.org JobPosting structured data") return title.length >= 6;
  return isStrongVacancyTitle(title);
}

function sitemapLinks(xml: string, baseUrl: string, host: string): string[] {
  const found: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml)) && found.length < 60) {
    try {
      const u = safeHttps(new URL(match[1].replace(/&amp;/g, "&").trim(), baseUrl).toString());
      if (u && u.hostname === host) found.push(u.toString());
    } catch { /* ignore invalid sitemap entries */ }
  }
  return [...new Set(found)];
}
async function discoverSitemapUrls(rootUrl: string, host: string): Promise<string[]> {
  const root = new URL(rootUrl);
  const discovered: string[] = [];
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    const sitemap = new URL(path, root.origin);
    if (!(await robotsAllows(sitemap))) continue;
    const page = await fetchPage(sitemap.toString(), host).catch(() => null);
    if (!page) continue;
    for (const url of sitemapLinks(page.html, page.url, host)) {
      if (/\.xml$/i.test(new URL(url).pathname)) {
        const nested = await fetchPage(url, host).catch(() => null);
        if (nested) discovered.push(...sitemapLinks(nested.html, nested.url, host));
      } else discovered.push(url);
    }
    if (discovered.length >= 60) break;
  }
  return [...new Set(discovered)].slice(0, 60);
}
function isListingPage(pathname: string): boolean {
  const parts = pathname.toLowerCase().split("/").filter(Boolean);
  const last = (parts.at(-1) || "").replace(/\.(html?|php)$/i, "");
  return new Set([
    "jobs", "job", "careers", "career", "vacancies", "vacancy",
    "all-vacancies", "all-jobs", "open-roles", "openings",
    "employment", "work-with-us", "join-our-team", "recruitment"
  ]).has(last);
}
function extractCandidateLinks(html: string, pageUrl: string, host: string): {url:string,title:string,isPdf?:boolean}[] {
  const links: {url:string,title:string}[] = [];
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && links.length < 30) {
    const href = match[2].trim();
    const title = plain(match[3]).slice(0, 250);
    if (!href || !title || isGenericVacancyLabel(title)) continue;
    try {
      const u = safeHttps(new URL(href, pageUrl).toString());
      if (!u || u.hostname !== host || /\.(jpg|jpeg|png|zip|docx?)($|\?)/i.test(u.pathname)) continue;
      if (isListingPage(u.pathname)) continue;
      const path = u.pathname.toLowerCase();
      if (isExcludedVacancyPage(path) || isExcludedVacancyPage(title)) continue;
      const isPdf = /\.pdf($|\?)/i.test(u.pathname);
      const pdfLooksRelevant = isPdf && /job|vacan|career|position|recruit|وظیف|استخدام|بست|اعلان|کارمند/i.test(title + " " + path);
      const jobPath = /\/(?:jobs?|vacancies?|careers?|recruitment|employment)(?:\/|$)/i.test(path) ||
        /وظیفه|استخدام|کاریابی|بست-خالی/i.test(path) ||
        /\/index\/showjobsdr\/\d+/i.test(path) ||
        /\/vacancy-card\/[^/]+/i.test(path);
      const titleLooksLikePosition = isStrongVacancyTitle(title);
      if (!jobPath && !titleLooksLikePosition && !pdfLooksRelevant) continue;
      links.push({ url: u.toString(), title, isPdf });
    } catch { /* ignore invalid links */ }
  }
  return links;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publicKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const publicKey = (publicKeysRaw ? JSON.parse(publicKeysRaw).default : null) || Deno.env.get("SUPABASE_ANON_KEY");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const serviceKey = (secretKeysRaw ? JSON.parse(secretKeysRaw).default : null) || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !publicKey || !serviceKey) return json({ error: "Supabase function secrets are not configured." }, 500);
    const authClient = createClient(supabaseUrl, publicKey);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "A valid signed-in user is required." }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const offset = Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
    const limit = Math.max(1, Math.min(Number.isInteger(body.limit) ? body.limit : 20, 20));
    const { data: orgs, error: orgError, count } = await admin.from("organization_candidates")
      .select("id,organization_name,official_website,careers_url,hiring_status,last_vacancy_scan_at", { count: "exact" })
      .order("id", { ascending: true }).range(offset, offset + limit - 1);
    if (orgError) throw orgError;
    await admin.from("organization_vacancies").update({ vacancy_status: "expired", updated_at: new Date().toISOString() })
      .lt("valid_through", new Date().toISOString().slice(0, 10)).eq("vacancy_status", "current");
    await admin.from("organization_candidates").update({
      hiring_status: "unknown",
      hiring_evidence_url: null,
      notes: "Previously confirmed vacancy deadline has passed; current hiring status requires a fresh official vacancy."
    }).eq("hiring_status", "hiring").not("id", "in", `(${(await admin.from("organization_vacancies").select("organization_id").eq("vacancy_status", "current")).data?.map((x: any) => x.organization_id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    const orgList = orgs || [];
    const results: any[] = new Array(orgList.length);
    let cursor = 0;
    const cacheCutoff = Date.now() - 6 * 60 * 60 * 1000;
    const forceScan = body.force === true;
    const processOrg = async (org: any) => {
      if (!forceScan && org.last_vacancy_scan_at && new Date(org.last_vacancy_scan_at).getTime() > cacheCutoff) {
        return { organization_id: org.id, organization_name: org.organization_name, cached: true, current: 0, found: 0, expired: 0, needs_review: 0 };
      }
      const official = safeHttps(org.official_website);
      const roots = [org.careers_url, org.official_website].filter((v: unknown): v is string => typeof v === "string" && !!v);
      const rootPages: {url:string,html:string}[] = [];
      const seen = new Set<string>();
      const rootResults = await Promise.all(roots.map(async (raw) => {
        const u = safeHttps(raw);
        if (!u || seen.has(u.toString()) || !(await robotsAllows(u))) return null;
        seen.add(u.toString());
        try { return await fetchPage(u.toString(), u.hostname); } catch { return null; }
      }));
      rootPages.push(...rootResults.filter((p): p is {url:string,html:string} => !!p));
      if (!rootPages.length) {
        const now = new Date().toISOString();
        await admin.from("organization_candidates").update({
          hiring_status: org.hiring_status === "hiring" ? "hiring" : "unknown",
          last_hiring_checked_at: now,
          last_vacancy_scan_at: now,
          notes: "Official site could not be reached or was blocked; hiring status remains Unknown, not Not Hiring."
        }).eq("id", org.id);
        return { organization_id: org.id, organization_name: org.organization_name, error: "Official site/careers page could not be reached; status retained as Unknown." };
      }
      const candidates: any[] = [];
      const links: {url:string,title:string,host:string}[] = [];
      for (const page of rootPages) {
        candidates.push(...extractStructured(page.html, page.url));
        const host = new URL(page.url).hostname;
        for (const link of extractCandidateLinks(page.html, page.url, host)) {
          if (!links.some((x) => x.url === link.url)) links.push({ ...link, host });
        }
        const sitemapUrls = await discoverSitemapUrls(page.url, host).catch(() => []);
        for (const url of sitemapUrls) {
          if (!/(?:^|[\/_-])(?:job|jobs|vacan|vacancy|vacancies|recruitment|employment|وظیف|استخدام|بست)(?:[\/_-]|$)/i.test(url) || isExcludedVacancyPage(url)) continue;
          if (!links.some((x) => x.url === url)) links.push({ url, title: "Vacancy page from official sitemap", host });
          if (links.length >= 45) break;
        }
      }
      const detailPages = await Promise.all(links.slice(0, 24).map(async (link) => {
        try { const target = new URL(link.url); return { link, page: await robotsAllows(target) ? await fetchPage(link.url, link.host) : null }; } catch { return { link, page: null }; }
      }));
      for (const {link, page} of detailPages) {
        if (page) {
          const structured = extractStructured(page.html, page.url);
          if (structured.length) candidates.push(...structured);
          else {
            const extracted = extractPageVacancy(page.html, page.url, link.title);
            if (extracted) candidates.push(extracted);
          }
        }
      }
      const structuredByUrl = new Map<string, any>();
      for (const item of candidates) if (item.vacancy_status === "current" || item.vacancy_status === "expired") structuredByUrl.set(item.vacancy_url, item);
      const unique = new Map<string, any>();
      for (const item of candidates) {
        if (!item.job_title || !item.vacancy_url || !isValidVacancyCandidate(item)) continue;
        const u = safeHttps(item.vacancy_url);
        if (!u) continue;
        item.vacancy_url = u.toString();
        if (structuredByUrl.has(item.vacancy_url) && item.vacancy_status === "needs_review") continue;
        unique.set(item.vacancy_url, item);
      }
      const vacancies = [...unique.values()];
      // Reconcile old current records only after the official site was reachable and inspected.
      await admin.from("organization_vacancies").update({ vacancy_status: "needs_review", updated_at: new Date().toISOString() }).eq("organization_id", org.id).eq("vacancy_status", "current");
      if (vacancies.length) {
        const refreshedRows = vacancies.map((v) => ({ organization_id: org.id, ...v, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
        const { error: refreshError } = await admin.from("organization_vacancies").upsert(refreshedRows, { onConflict: "organization_id,vacancy_url" });
        if (refreshError) throw refreshError;
      }
      const current = vacancies.find((v) => v.vacancy_status === "current");
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        hiring_status: current ? "hiring" : org.hiring_status === "not_hiring" ? "not_hiring" : "unknown",
        last_hiring_checked_at: now,
        last_vacancy_scan_at: now,
      };
      if (current) update.hiring_evidence_url = current.vacancy_url;
      const { error: updateError } = await admin.from("organization_candidates").update(update).eq("id", org.id);
      if (updateError) throw updateError;
      return {
        organization_id: org.id,
        organization_name: org.organization_name,
        found: vacancies.length,
        current: vacancies.filter((v) => v.vacancy_status === "current").length,
        expired: vacancies.filter((v) => v.vacancy_status === "expired").length,
        needs_review: vacancies.filter((v) => v.vacancy_status === "needs_review").length,
      };

    };
    const workers = Array.from({ length: Math.min(4, orgList.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= orgList.length) return;
        try { results[index] = await processOrg(orgList[index]); }
        catch (error) {
          results[index] = { organization_id: orgList[index].id, organization_name: orgList[index].organization_name, error: (error instanceof Error ? error.message : "Scan failed").slice(0, 250) };
        }
      }
    });
    await Promise.all(workers);
    const nextOffset = offset + (orgs?.length || 0);
    return json({ scanned_organizations: orgs?.length || 0, total_organizations: count || 0, next_offset: nextOffset, done: nextOffset >= (count || 0), results });
  } catch (error) {
    return json({ error: (error instanceof Error ? error.message : "Unexpected server error").slice(0, 500) }, 500);
  }
});