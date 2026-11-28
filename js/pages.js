// Page renderers for the Afghanistan-only job platform. Pages use live Supabase data and
// clearly distinguish working features from integrations that still need external credentials.

import { el, emptyState, pageHead } from './ui.js';
import { CONFIG } from './config.js';
import { getConfigStatus, testConnection, getClient } from './supabase-client.js';
import {
  canInstall, promptInstall, onInstallAvailabilityChange, isStandalone,
  getServiceWorkerState, clearOfflineData
} from './pwa.js';
import { toast } from './ui.js';

const STATUS_PILL = {
  ready: { cls: 'ok', text: 'Config valid' },
  missing: { cls: 'warn', text: 'Not configured' },
  invalid: { cls: 'danger', text: 'Config invalid' },
  dangerous: { cls: 'danger', text: 'Unsafe key!' }
};

export function configPillInfo() {
  return STATUS_PILL[getConfigStatus().state] || STATUS_PILL.missing;
}

// ---------------------------------------------------------------- Dashboard
function kabulCalendarDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '0';
  const date = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}


async function saveJobToApplications(job, button) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Saving…';
  try {
    const client = await getClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;
    if (!user) throw new Error('Sign in from My Profile before saving jobs.');
    const { error } = await client.from('applications').upsert({
      user_id: user.id,
      job_id: job.id,
      status: 'saved',
      job_title_snapshot: job.title || 'Untitled job',
      organization_snapshot: job.organization || 'Organization not stated',
      source_url_snapshot: job.original_url || job.source_listing_url || null,
      deadline_snapshot: job.deadline || null
    }, { onConflict: 'user_id,job_id', ignoreDuplicates: true });
    if (error) throw error;
    button.textContent = 'Saved to Applications';
    toast('Job saved to your Applications tracker.');
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    toast(error.message || 'Could not save this job.');
  }
}

function saveJobButton(job) {
  const button = el('button', { class: 'btn small', type: 'button', text: 'Save to Applications' });
  button.addEventListener('click', () => saveJobToApplications(job, button));
  return button;
}

export function dashboardPage() {
  const stats = [
    ['New verified jobs shown', 'jobs'],
    ['Excellent matches', 'matches'],
    ['Saved applications', 'saved'],
    ['Submitted applications', 'submitted'],
    ['Interviews', 'interview']
  ];
  const statValues = new Map();
  const statsGrid = el('div', { class: 'grid-stats' }, stats.map(([label, key]) => {
    const value = el('div', { class: 'stat-value', text: '–' });
    statValues.set(key, value);
    return el('div', { class: 'stat' },
      el('div', { class: 'stat-label', text: label }),
      value,
      el('div', { class: 'stat-note', text: 'Live database count' })
    );
  }));
  const phases = [
    ['Foundation', 'PWA shell, routing, configuration, and authentication', 'Implemented', 'ok'],
    ['Private profile', 'Account-owned profile and repeatable profile sections', 'Implemented', 'ok'],
    ['Organization discovery', 'Registry, website checks, and social account suggestions', 'Partial', 'warn'],
    ['Job ingestion', 'Permission-gated sources; live jobs table still empty', 'Blocked by source approvals', 'warn'],
    ['Applications', 'Save jobs, status updates, notes, and history', 'Implemented beta', 'ok'],
    ['Documents and email', 'Profile-based drafts, private saving, and manual email handoff', 'Implemented beta', 'ok'],
    ['Matching and automation', 'Advanced matching, AI provider, Gmail OAuth, scheduled scans', 'Not configured', '']
  ];
  const status = getConfigStatus();
  const opportunityStatus = el('p', { class: 'muted', text: 'Loading newly verified opportunities…', 'aria-live': 'polite' });
  const opportunityList = el('div', { class: 'grid-2' });
  const opportunities = el('section', { class: 'card' },
    el('h2', { text: 'New job opportunities' }),
    el('p', { class: 'muted', text: 'Only official announcements published today or yesterday in Kabul time, with a future deadline and a verified application route, appear here.' }),
    opportunityStatus,
    opportunityList
  );

  getClient().then(async (client) => {
    const today = kabulCalendarDate();
    const yesterday = kabulCalendarDate(-1);
    const tomorrow = kabulCalendarDate(1);
    const { data, error } = await client.from('jobs')
      .select('id,title,organization,description,requirements,location_text,province,employment_type,posted_at,deadline,source_listing_url,original_url,application_method,application_email,application_url,verification_status,metadata,job_sources(name,base_url)')
      .eq('status', 'active')
      .in('verification_status', ['source_confirmed', 'employer_confirmed'])
      .gte('posted_at', yesterday + 'T00:00:00+04:30')
      .lt('posted_at', tomorrow + 'T00:00:00+04:30')
      .gte('deadline', today)
      .order('posted_at', { ascending: false })
      .limit(40);
    if (error) throw error;
    statValues.get('jobs').textContent = String(data?.length || 0);
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;
    if (user) {
      const [matchesResult, applicationsResult] = await Promise.all([
        client.from('job_matches').select('score,eligible').eq('user_id', user.id),
        client.from('applications').select('status').eq('user_id', user.id)
      ]);
      if (matchesResult.error) throw matchesResult.error;
      if (applicationsResult.error) throw applicationsResult.error;
      statValues.get('matches').textContent = String((matchesResult.data || []).filter((match) => match.eligible && Number(match.score) >= 85).length);
      const applications = applicationsResult.data || [];
      statValues.get('saved').textContent = String(applications.filter((item) => item.status === 'saved').length);
      statValues.get('submitted').textContent = String(applications.filter((item) => item.status === 'submitted').length);
      statValues.get('interview').textContent = String(applications.filter((item) => item.status === 'interview').length);
    } else {
      for (const key of ['matches','saved','submitted','interview']) statValues.get(key).textContent = '0';
    }
    if (!data?.length) {
      opportunityStatus.textContent = 'No confirmed new opportunities are stored yet. This does not prove that no jobs exist; an approved source and a successful scan are required.';
      return;
    }
    opportunityStatus.textContent = data.length + ' confirmed new opportunities';
    opportunityList.replaceChildren(...data.map((job) => {
      const postedDate = job.posted_at ? String(job.posted_at).slice(0, 10) : 'Not stated';
      const sourceName = job.job_sources?.name || 'Official employer source';
      const instructions = job.metadata?.application_instructions_excerpt || '';
      const salary = job.metadata?.salary_text || 'Not stated';
      const ageRequirement = job.metadata?.age_requirement || 'Not stated';
      const detail = el('details', { class: 'job-extra-details' },
        el('summary', { text: 'Description, requirements and application instructions' }),
        el('p', { class: 'detail', text: 'Description: ' + (job.description || 'Not stated in the structured announcement.') }),
        el('p', { class: 'detail', text: 'Requirements: ' + (job.requirements || 'Not stated in the structured announcement.') }),
        el('p', { class: 'detail', text: 'Application instructions: ' + (instructions || 'Not detected; read the original announcement carefully.') }),
        el('p', { class: 'detail', text: 'Salary: ' + salary }),
        el('p', { class: 'detail', text: 'Age / eligibility requirement: ' + ageRequirement }),
        el('p', { class: 'muted', text: 'These are concise extracted fields. The original announcement remains the authoritative source for the complete requirements and instructions.' })
      );
      const applicationAction = job.application_url
        ? el('p', {}, el('a', { href: job.application_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open application form' }))
        : job.application_email
          ? el('p', {}, el('a', { href: 'mailto:' + job.application_email, text: 'Application email: ' + job.application_email }))
          : el('p', { class: 'muted', text: 'Application route: not detected in the source.' });
      return el('article', { class: 'card vacancy-evidence' },
        el('h3', { text: job.title }),
        el('p', {}, el('a', { href: '#/job/' + job.id, text: 'View full job details' })),
        el('p', { class: 'detail', text: 'Organization: ' + (job.organization || 'Not confirmed') }),
        el('p', { class: 'detail', text: 'Location: ' + (job.location_text || job.province || 'Not stated in announcement') }),
        el('p', { class: 'detail', text: 'Published: ' + postedDate + ' · Deadline: ' + (job.deadline || 'Not stated') }),
        el('p', { class: 'detail muted', text: 'Source: ' + sourceName }),
        detail,
        applicationAction,
        saveJobButton(job),
        el('p', {}, el('a', { href: job.original_url || job.source_listing_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open original announcement' }))
      );
    }));
  }).catch((error) => {
    opportunityStatus.textContent = 'Could not load opportunities: ' + (error.message || 'Please sign in and try again.');
  });

  return el('div', {},
    pageHead('Dashboard', 'Your job-search overview for opportunities across Afghanistan. Numbers appear only when real data exists.'),
    opportunities,
    statsGrid,
    el('div', { class: 'grid-2' },
      el('section', { class: 'card' },
        el('h2', { text: 'Build progress' }),
        el('ul', { class: 'roadmap' },
          phases.map(([name, desc, state, cls]) => el('li', {},
            el('span', { class: 'badge ' + cls, text: state }),
            el('span', {}, el('strong', { text: name + ': ' }), desc)
          ))
        )
      ),
      el('section', { class: 'card' },
        el('h2', { text: 'Setup status' }),
        el('dl', { class: 'kv' },
          el('dt', { text: 'Supabase' }),
          el('dd', { text: status.message }),
          el('dt', { text: 'Sign-in' }),
          el('dd', { text: 'Email and password accounts are available on My Profile.' }),
          el('dt', { text: 'Job sources' }),
          el('dd', { text: 'Sources remain disabled until collection permission and a supported method are confirmed.' })
        ),
        el('p', { class: 'muted', text: 'Open My Profile to create an account and save your private profile.' })
      )
    )
  );
}

// ---------------------------------------------------------------- Placeholders
export function jobSearchPage() {
  const status = el('p', { class: 'muted', text: 'Loading active vacancies…', 'aria-live': 'polite' });
  const list = el('div', { class: 'grid-2' });
  const panel = el('section', { class: 'card' },
    el('h2', { text: 'Active vacancies published today or yesterday' }),
    status,
    list
  );
  const root = el('div', {},
    pageHead('Job Search', 'Find recent job opportunities across Afghanistan. Every listing keeps its original source and application link.'),
    panel
  );

  getClient().then(async (client) => {
    const today = kabulCalendarDate();
    const yesterday = kabulCalendarDate(-1);
    const tomorrow = kabulCalendarDate(1);
    const { data, error } = await client.from('jobs')
      .select('id,title,organization,description,requirements,location_text,province,deadline,source_listing_url,original_url,application_method,application_email,application_url,verification_status,posted_at,metadata,job_sources(name)')
      .eq('status', 'active')
      .in('verification_status', ['source_confirmed', 'employer_confirmed'])
      .gte('posted_at', yesterday + 'T00:00:00+04:30')
      .lt('posted_at', tomorrow + 'T00:00:00+04:30')
      .gte('deadline', today)
      .order('posted_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!data?.length) {
      status.textContent = 'No confirmed new vacancies have been imported yet. Check Organization Discovery for source approval status.';
      return;
    }
    status.textContent = data.length + ' confirmed active vacancies';
    list.replaceChildren(...data.map((job) => {
      const apply = job.application_url
        ? el('a', { href: job.application_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open application form' })
        : job.application_email
          ? el('a', { href: 'mailto:' + job.application_email, text: 'Application email: ' + job.application_email })
          : el('span', { class: 'muted', text: 'Application route not detected' });
      return el('article', { class: 'card vacancy-evidence' },
        el('h3', { text: job.title }),
        el('p', {}, el('a', { href: '#/job/' + job.id, text: 'View full job details' })),
        el('p', { class: 'muted', text: job.organization }),
        el('p', { class: 'detail', text: (job.location_text || job.province || 'Location not stated') + ' · Deadline: ' + (job.deadline || 'Not stated') }),
        el('p', { class: 'detail muted', text: 'Published: ' + (job.posted_at ? String(job.posted_at).slice(0, 10) : 'Not stated') + ' · Source: ' + (job.job_sources?.name || 'Official employer source') }),
        el('p', { class: 'detail', text: job.description || 'Description not stated.' }),
        el('p', { class: 'detail', text: 'Requirements: ' + (job.requirements || 'Not stated') }),
        el('p', {}, apply),
        saveJobButton(job),
        el('p', {}, el('a', { href: job.original_url || job.source_listing_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open original announcement' }))
      );
    }));
  }).catch((error) => {
    status.textContent = 'Could not load vacancies: ' + (error.message || 'Please sign in and try again.');
  });
  return root;
}

export function jobSourcesPage() {
  const status = el('p', { class: 'muted', text: 'Loading registered sources…', 'aria-live': 'polite' });
  const list = el('div', { class: 'grid-2' });
  const root = el('div', {},
    pageHead('Job Sources', 'Manage the trusted channels used to discover Afghan vacancies. Automatic collection stays disabled until permission and a supported feed or API are confirmed.'),
    el('section', { class: 'card' },
      el('h2', { text: 'Registered sources' }),
      status,
      list
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Collection policy' }),
      el('p', { class: 'muted', text: 'Official employer career pages are the preferred source for confirming a vacancy and its application route. Job portals help discover vacancies. We will use official APIs, RSS feeds, structured job data, or written permission; we will not bypass access controls or copy full listings without permission.' })
    )
  );

  getClient().then(async (client) => {
    const { data, error } = await client.from('job_sources')
      .select('name,source_type,jobs_url,collection_method,permission_status,is_enabled,last_checked_at,terms_checked_at,robots_checked_at,notes')
      .order('name');
    if (error) throw error;
    if (!data?.length) {
      status.textContent = 'No sources are registered yet.';
      return;
    }
    status.textContent = data.length + ' sources registered';
    list.replaceChildren(...data.map((source) => {
      const state = source.permission_status === 'allowed' && source.is_enabled
        ? 'Collection enabled'
        : source.permission_status === 'denied' ? 'Permission denied' : 'Permission review pending';
      const cls = source.permission_status === 'allowed' && source.is_enabled ? 'ok'
        : source.permission_status === 'denied' ? 'danger' : 'warn';
      return el('article', { class: 'card' },
        el('h3', { text: source.name }),
        el('span', { class: 'badge ' + cls, text: state }),
        el('p', { class: 'detail', text: source.source_type === 'employer_official' ? 'Official employer website' : 'Job portal / aggregator' }),
        el('p', { class: 'detail', text: 'Method: ' + source.collection_method }),
        el('p', {}, el('a', { href: source.jobs_url, target: '_blank', rel: 'noopener noreferrer', text: 'Visit source website' })),
        source.terms_checked_at ? el('p', { class: 'muted', text: 'Terms reviewed: ' + new Date(source.terms_checked_at).toLocaleDateString() }) : null,
        source.robots_checked_at ? el('p', { class: 'muted', text: 'Robots policy reviewed: ' + new Date(source.robots_checked_at).toLocaleDateString() }) : null,
        source.last_checked_at ? el('p', { class: 'muted', text: 'Last checked: ' + new Date(source.last_checked_at).toLocaleString() }) : null,
        source.notes ? el('p', { class: 'muted', text: source.notes }) : null
      );
    }));
  }).catch((error) => {
    status.textContent = 'Could not load sources: ' + (error.message || 'Please sign in and try again.');
  });
  return root;
}

function matchTerms(profileValues, jobText) {
  const terms = [...new Set(profileValues.flatMap((value) =>
    String(value || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter((word) => word.length >= 3)
  ))];
  if (!terms.length) return { score: 0, matched: [] };
  const matched = terms.filter((term) => jobText.includes(term));
  return { score: Math.min(1, matched.length / Math.min(3, terms.length)), matched };
}

function estimateJobMatch(job, profile, items) {
  const jobText = [job.title, job.description, job.requirements, job.location_text, job.province]
    .filter(Boolean).join(' ').toLowerCase();
  const skills = (items || []).filter((x) => x.item_type === 'skill').map((x) =>
    [x.data?.skill_name, x.data?.skill_category].filter(Boolean).join(' ')
  );
  const education = (items || []).filter((x) => x.item_type === 'education').map((x) =>
    [x.data?.education_level, x.data?.field_of_study, x.data?.faculty].filter(Boolean).join(' ')
  );
  const experience = (items || []).filter((x) => x.item_type === 'experience').map((x) =>
    [x.data?.job_title, x.data?.responsibilities].filter(Boolean).join(' ')
  );
  const languages = (items || []).filter((x) => x.item_type === 'language').map((x) => x.data?.language_name).filter(Boolean);
  const parts = {
    skills: matchTerms(skills, jobText),
    education: matchTerms(education, jobText),
    experience: matchTerms(experience, jobText),
    languages: matchTerms(languages, jobText)
  };
  const province = String(profile?.current_province || '').toLowerCase().trim();
  const locationText = String(job.location_text || job.province || '').toLowerCase();
  const locationScore = province && locationText.includes(province) ? 1 : /remote|د لیرې|له لرې/.test(locationText) ? 0.7 : 0;
  const score = Math.round(
    parts.skills.score * 35 +
    parts.education.score * 25 +
    parts.experience.score * 20 +
    parts.languages.score * 10 +
    locationScore * 10
  );
  const reasons = [
    ...parts.skills.matched.slice(0, 3).map((x) => 'Skill: ' + x),
    ...parts.education.matched.slice(0, 2).map((x) => 'Education: ' + x),
    ...parts.experience.matched.slice(0, 2).map((x) => 'Experience: ' + x),
    ...parts.languages.matched.slice(0, 2).map((x) => 'Language: ' + x),
    ...(locationScore ? ['Location preference appears compatible'] : [])
  ];
  return { score, reasons, ageRequirement: job.metadata?.age_requirement || null };
}

export function recommendedPage() {
  const status = el('p', { class: 'muted', text: 'Loading your profile and recent vacancies…', 'aria-live': 'polite' });
  const list = el('div', { class: 'grid-2' });
  const root = el('div', {},
    pageHead('Recommended Jobs', 'Profile-based keyword estimates for verified Afghan vacancies. Excellent: 85–100; Possible: 70–84.'),
    el('section', { class: 'card' },
      el('p', { class: 'muted', text: 'Scores are estimates, not proof of eligibility. Review every mandatory qualification, age requirement, location, and deadline on the employer’s original announcement before applying.' }),
      status,
      list
    )
  );
  getClient().then(async (client) => {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;
    if (!user) {
      status.textContent = 'Sign in from My Profile and complete your skills, education, languages, and experience to see recommendations.';
      return;
    }
    const [{ data: profile, error: profileError }, { data: items, error: itemsError }] = await Promise.all([
      client.from('profiles').select('current_province').eq('id', user.id).maybeSingle(),
      client.from('profile_items').select('item_type,data').eq('user_id', user.id)
    ]);
    if (profileError) throw profileError;
    if (itemsError) throw itemsError;
    if (!(items || []).length) {
      status.textContent = 'Your profile has no skills, education, language, or experience entries yet. Add them in My Profile first.';
      return;
    }
    const today = kabulCalendarDate();
    const yesterday = kabulCalendarDate(-1);
    const tomorrow = kabulCalendarDate(1);
    const { data: jobs, error: jobsError } = await client.from('jobs')
      .select('id,title,organization,description,requirements,location_text,province,deadline,source_listing_url,original_url,application_url,application_email,verification_status,posted_at,metadata')
      .eq('status', 'active')
      .in('verification_status', ['source_confirmed','employer_confirmed'])
      .gte('posted_at', yesterday + 'T00:00:00+04:30')
      .lt('posted_at', tomorrow + 'T00:00:00+04:30')
      .gte('deadline', today)
      .order('posted_at', { ascending: false }).limit(100);
    if (jobsError) throw jobsError;
    const ranked = (jobs || []).map((job) => ({ job, match: estimateJobMatch(job, profile, items) }))
      .filter((entry) => entry.match.score >= 70)
      .sort((a,b) => b.match.score - a.match.score);
    if (!ranked.length) {
      status.textContent = 'No verified recent vacancy currently reaches the Possible threshold. This does not mean no suitable job exists; complete your profile and check again after new vacancies are verified.';
      return;
    }
    status.textContent = ranked.length + ' recent vacancies meet the profile-match threshold';
    list.replaceChildren(...ranked.map(({job,match}) => el('article', { class: 'card vacancy-evidence' },
      el('span', { class: 'badge ' + (match.score >= 85 ? 'ok' : 'warn'), text: match.score + '/100 · ' + (match.score >= 85 ? 'Excellent' : 'Possible') }),
      el('h3', { text: job.title }),
      el('p', {}, el('a', { href: '#/job/' + job.id, text: 'View full job details' })),
      el('p', { class: 'muted', text: job.organization }),
      el('p', { class: 'detail', text: (job.location_text || job.province || 'Location not stated') + ' · Deadline: ' + (job.deadline || 'Not stated') }),
      el('p', { class: 'detail', text: 'Matched profile evidence: ' + (match.reasons.join('; ') || 'Limited keyword overlap') }),
      match.ageRequirement ? el('p', { class: 'detail', text: 'Employer age requirement: ' + match.ageRequirement + ' — review the original announcement carefully.' }) : null,
      el('p', { class: 'muted', text: 'This estimate does not confirm eligibility. The employer’s original requirements are authoritative.' }),
      saveJobButton(job),
      el('p', {}, el('a', { href: job.original_url || job.source_listing_url, target: '_blank', rel: 'noopener noreferrer', text: 'Review original announcement' }))
    )));
  }).catch((error) => {
    status.textContent = 'Could not build recommendations: ' + (error.message || 'Please try again.');
  });
  return root;
}

export function jobDetailsPage(param) {
  const status = el('p', { class: 'muted', text: 'Loading vacancy details…', 'aria-live': 'polite' });
  const content = el('div', {});
  const root = el('div', {},
    pageHead('Job Details', 'Review the original requirements, deadline, source, and application method.'),
    el('section', { class: 'card' }, status, content)
  );
  if (!param) {
    status.textContent = 'No job selected. Open a vacancy from Job Search or Recommended Jobs.';
    return root;
  }
  getClient().then(async (client) => {
    const { data: job, error } = await client.from('jobs')
      .select('id,title,organization,description,requirements,location_text,province,employment_type,posted_at,deadline,source_listing_url,original_url,application_method,application_email,application_url,verification_status,metadata,job_sources(name,base_url)')
      .eq('id', param).eq('status', 'active')
      .in('verification_status', ['source_confirmed','employer_confirmed'])
      .maybeSingle();
    if (error) throw error;
    if (!job) {
      status.textContent = 'This vacancy is not available as a verified active job. It may have expired, been withdrawn, or not passed review.';
      return;
    }
    status.textContent = 'Verified source · Published ' + (job.posted_at ? String(job.posted_at).slice(0,10) : 'date not stated');
    const instructions = job.metadata?.application_instructions_excerpt || 'Not detected; read the original announcement carefully.';
    const source = job.job_sources?.name || 'Official employer source';
    const application = job.application_url
      ? el('p', {}, el('a', { href: job.application_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open official application form' }))
      : job.application_email
        ? el('p', {}, el('a', { href: 'mailto:' + job.application_email, text: 'Email application: ' + job.application_email }))
        : el('p', { class: 'muted', text: 'Application method was not detected. Check the original announcement.' });
    content.replaceChildren(
      el('h2', { text: job.title }),
      el('p', { class: 'muted', text: job.organization }),
      el('p', { class: 'detail', text: 'Location: ' + (job.location_text || job.province || 'Not stated') }),
      el('p', { class: 'detail', text: 'Employment type: ' + (job.employment_type || 'Not stated') }),
      el('p', { class: 'detail', text: 'Application deadline: ' + (job.deadline || 'Not stated') }),
      el('p', { class: 'detail', text: 'Source: ' + source }),
      el('h3', { text: 'Job description' }),
      el('p', { class: 'detail', text: job.description || 'Not stated in the structured source.' }),
      el('h3', { text: 'Requirements' }),
      el('p', { class: 'detail', text: job.requirements || 'Not stated in the structured source.' }),
      el('h3', { text: 'How to apply' }),
      el('p', { class: 'detail', text: instructions }),
      application,
      saveJobButton(job),
      el('p', {}, el('a', { href: job.original_url || job.source_listing_url, target: '_blank', rel: 'noopener noreferrer', text: 'Read full original announcement' }))
    );
  }).catch((error) => { status.textContent = error.message || 'Could not load vacancy details.'; });
  return root;
}

export function documentsPage() {
  const status = el('p', { class: 'muted', text: 'Checking your account…', 'aria-live': 'polite' });
  const type = el('select', { class: 'input', 'aria-label': 'Document type' },
    el('option', { value: 'cv', text: 'CV' }),
    el('option', { value: 'cover_letter', text: 'Cover letter' })
  );
  const title = el('input', { class: 'input', type: 'text', placeholder: 'Document title' });
  const employer = el('input', { class: 'input', type: 'text', placeholder: 'Employer name (for cover letter)' });
  const position = el('input', { class: 'input', type: 'text', placeholder: 'Position title (for cover letter)' });
  const editor = el('textarea', { class: 'input', rows: 18, placeholder: 'Generate a draft from your saved profile, then edit it here.' });
  const preview = el('pre', { class: 'document-preview' });
  const savedList = el('div', { class: 'grid-2' });
  const generate = el('button', { class: 'btn primary', type: 'button', text: 'Generate from my profile' });
  const save = el('button', { class: 'btn', type: 'button', text: 'Save document' });
  const print = el('button', { class: 'btn', type: 'button', text: 'Print / Save as PDF' });
  save.disabled = print.disabled = generate.disabled = true;
  let client = null;
  let user = null;
  let activeDocumentId = null;

  const renderPreview = () => { preview.textContent = editor.value; };
  editor.addEventListener('input', renderPreview);
  type.addEventListener('change', () => {
    const isCover = type.value === 'cover_letter';
    employer.hidden = position.hidden = !isCover;
    if (!isCover) { title.value = title.value || 'Professional CV'; }
  });
  employer.hidden = position.hidden = true;

  const loadSaved = async () => {
    const { data, error } = await client.from('generated_documents')
      .select('id,document_type,title,content,generation_method,created_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(30);
    if (error) throw error;
    savedList.replaceChildren();
    if (!data?.length) {
      savedList.append(el('p', { class: 'muted', text: 'No saved documents yet.' }));
      return;
    }
    savedList.replaceChildren(...data.map((item) => {
      const open = el('button', { class: 'btn small', type: 'button', text: 'Open draft' });
      const remove = el('button', { class: 'btn small danger-text', type: 'button', text: 'Delete' });
      open.addEventListener('click', () => {
        activeDocumentId = item.id;
        type.value = item.document_type;
        type.dispatchEvent(new Event('change'));
        title.value = item.title;
        editor.value = item.content;
        renderPreview();
        save.disabled = print.disabled = false;
        save.textContent = 'Update saved document';
      });
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this saved document?')) return;
        remove.disabled = true;
        const { error: deleteError } = await client.from('generated_documents').delete()
          .eq('id', item.id).eq('user_id', user.id);
        if (deleteError) { toast(deleteError.message || 'Could not delete document.'); remove.disabled = false; return; }
        if (activeDocumentId === item.id) { activeDocumentId = null; editor.value = ''; title.value = ''; renderPreview(); }
        await loadSaved();
      });
      return el('article', { class: 'card' },
        el('h3', { text: item.title }),
        el('p', { class: 'muted', text: (item.document_type === 'cv' ? 'CV' : 'Cover letter') + ' · ' + (item.generation_method === 'template' ? 'Profile-based template' : item.generation_method) }),
        el('p', { class: 'muted', text: new Date(item.created_at).toLocaleString() }),
        el('div', { class: 'btn-row' }, open, remove)
      );
    }));
  };

  generate.addEventListener('click', async () => {
    generate.disabled = true;
    status.textContent = 'Reading your private profile…';
    try {
      const [{ data: profile, error: profileError }, { data: items, error: itemsError }] = await Promise.all([
        client.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        client.from('profile_items').select('item_type,data').eq('user_id', user.id).order('position')
      ]);
      if (profileError) throw profileError;
      if (itemsError) throw itemsError;
      const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Name not provided';
      const lines = [];
      const addSection = (heading, values) => {
        const clean = values.filter(Boolean);
        if (clean.length) lines.push('', heading.toUpperCase(), ...clean);
      };
      if (type.value === 'cv') {
        title.value = title.value || 'Professional CV — ' + fullName;
        lines.push(fullName);
        addSection('Contact', [profile?.contact_email, profile?.phone, profile?.current_province, profile?.current_address].filter(Boolean).join(' · ') ? [ [profile?.contact_email, profile?.phone, profile?.current_province, profile?.current_address].filter(Boolean).join(' · ') ] : []);
        addSection('Education', (items || []).filter((x) => x.item_type === 'education').map((x) => {
          const d=x.data||{}; return [d.education_level,d.field_of_study,d.institution,d.faculty,d.graduation_year,d.study_status].filter(Boolean).join(' — ');
        }));
        addSection('Skills', (items || []).filter((x) => x.item_type === 'skill').map((x) => {
          const d=x.data||{}; return [d.skill_name,d.skill_category,d.skill_level].filter(Boolean).join(' — ');
        }));
        addSection('Languages', (items || []).filter((x) => x.item_type === 'language').map((x) => {
          const d=x.data||{}; return [d.language_name,d.language_level].filter(Boolean).join(' — ');
        }));
        addSection('Work experience', (items || []).filter((x) => x.item_type === 'experience').map((x) => {
          const d=x.data||{}; return [d.job_title,d.employer,d.work_start,d.work_end,d.responsibilities].filter(Boolean).join(' | ');
        }));
        addSection('Certificates and training', (items || []).filter((x) => x.item_type === 'certificate').map((x) => {
          const d=x.data||{}; return [d.certificate_name,d.issuer,d.issue_date].filter(Boolean).join(' — ');
        }));
        addSection('Projects and achievements', (items || []).filter((x) => x.item_type === 'project').map((x) => {
          const d=x.data||{}; return [d.project_title,d.project_details].filter(Boolean).join(' — ');
        }));
      } else {
        const employerName = employer.value.trim() || '[Employer name]';
        const positionName = position.value.trim() || '[Position title]';
        title.value = title.value || 'Cover Letter — ' + positionName;
        const skillsList = (items || []).filter((x) => x.item_type === 'skill').map((x) => x.data?.skill_name).filter(Boolean);
        const experienceList = (items || []).filter((x) => x.item_type === 'experience').map((x) => {
          const d=x.data||{}; return [d.job_title,d.employer].filter(Boolean).join(' at ');
        }).filter(Boolean);
        lines.push('Dear Hiring Team,','', 'I am writing to express my interest in the ' + positionName + ' position at ' + employerName + '.');
        if (skillsList.length) lines.push('', 'My profile lists these relevant skills: ' + skillsList.join(', ') + '.');
        if (experienceList.length) lines.push('', 'My profile includes the following experience: ' + experienceList.join('; ') + '.');
        lines.push('', 'My education and other details are available in my profile and attached CV. I would appreciate the opportunity to be considered.','', 'Sincerely,', fullName, profile?.contact_email || '', profile?.phone || '');
        lines.push('', '[Review and personalize this draft before sending. It only uses information saved in your profile.]');
      }
      editor.value = lines.join('\n').trim();
      renderPreview();
      activeDocumentId = null;
      save.textContent = 'Save document';
      save.disabled = print.disabled = false;
      status.textContent = 'Draft generated from your saved profile. Review every detail before using it; no AI service was called.';
    } catch (error) {
      status.textContent = error.message || 'Could not generate the document.';
    } finally { generate.disabled = false; }
  });

  save.addEventListener('click', async () => {
    if (!editor.value.trim()) { status.textContent = 'Generate or write a document first.'; return; }
    save.disabled = true;
    try {
      const payload = {
        user_id: user.id,
        document_type: type.value,
        title: title.value.trim() || (type.value === 'cv' ? 'Professional CV' : 'Cover Letter'),
        content: editor.value,
        generation_method: 'template'
      };
      const result = activeDocumentId
        ? await client.from('generated_documents').update(payload).eq('id', activeDocumentId).eq('user_id', user.id)
        : await client.from('generated_documents').insert(payload);
      if (result.error) throw result.error;
      status.textContent = 'Document saved privately to your account.';
      toast('Document saved.');
      await loadSaved();
    } catch (error) { status.textContent = error.message || 'Could not save document.'; }
    finally { save.disabled = false; }
  });
  print.addEventListener('click', () => {
    renderPreview();
    window.print();
  });

  getClient().then(async (supabase) => {
    client = supabase;
    const { data: authData, error } = await client.auth.getUser();
    if (error) throw error;
    user = authData?.user;
    if (!user) {
      status.textContent = 'Sign in from My Profile to create and save private documents.';
      return;
    }
    generate.disabled = false;
    status.textContent = 'Signed in. Drafts are created from your profile facts; AI generation is not configured in this release.';
    await loadSaved();
  }).catch((error) => { status.textContent = error.message || 'Could not connect to your account.'; });

  return el('div', {},
    pageHead('CV & Cover Letter', 'Create editable CV and cover-letter drafts using only facts in your saved profile.'),
    el('section', { class: 'card' },
      el('p', { class: 'muted', text: 'These are profile-based templates, not AI-generated claims. Review and correct every field before exporting or sharing.' }),
      status,
      el('div', { class: 'profile-fields' },
        el('label', { class: 'profile-field' }, el('span', { text: 'Document type' }), type),
        el('label', { class: 'profile-field' }, el('span', { text: 'Document title' }), title),
        el('label', { class: 'profile-field' }, el('span', { text: 'Employer name' }), employer),
        el('label', { class: 'profile-field' }, el('span', { text: 'Position title' }), position)
      ),
      generate,
      el('label', { class: 'profile-field' }, el('span', { text: 'Edit your document' }), editor),
      el('div', { class: 'btn-row' }, save, print),
      el('h3', { text: 'Print preview' }),
      preview
    ),
    el('section', { class: 'card' }, el('h2', { text: 'Saved documents' }), savedList)
  );
}

export function emailPage() {
  const status = el('p', { class: 'muted', text: 'Checking account…', 'aria-live': 'polite' });
  const recipient = el('input', { class: 'input', type: 'email', placeholder: 'Recruitment email address' });
  const subject = el('input', { class: 'input', type: 'text', placeholder: 'Email subject' });
  const body = el('textarea', { class: 'input', rows: 12, placeholder: 'Write or paste your reviewed application email here.' });
  const saved = el('div', { class: 'grid-2' });
  const save = el('button', { class: 'btn primary', type: 'button', text: 'Save private draft' });
  const openMail = el('button', { class: 'btn', type: 'button', text: 'Open email app to review and send' });
  const loadLetter = el('button', { class: 'btn', type: 'button', text: 'Load a saved cover letter' });
  save.disabled = openMail.disabled = loadLetter.disabled = true;
  let client = null, user = null;

  const loadDrafts = async () => {
    const { data, error } = await client.from('generated_documents')
      .select('id,title,content,created_at').eq('user_id', user.id)
      .eq('document_type','email_draft').order('updated_at',{ascending:false}).limit(20);
    if (error) throw error;
    if (!data?.length) { saved.replaceChildren(el('p',{class:'muted',text:'No saved email drafts yet.'})); return; }
    saved.replaceChildren(...data.map((draft) => {
      const open = el('button',{class:'btn small',type:'button',text:'Open draft'});
      open.addEventListener('click',()=>{subject.value=draft.title;body.value=draft.content;});
      return el('article',{class:'card'},
        el('h3',{text:draft.title}),
        el('p',{class:'muted',text:new Date(draft.created_at).toLocaleString()}),
        open
      );
    }));
  };

  loadLetter.addEventListener('click',async()=>{
    loadLetter.disabled=true;
    try {
      const {data,error}=await client.from('generated_documents')
        .select('title,content').eq('user_id',user.id).eq('document_type','cover_letter')
        .order('updated_at',{ascending:false}).limit(1);
      if(error) throw error;
      if(!data?.length){status.textContent='No saved cover letter found. Create one in CV & Cover Letter first.';return;}
      body.value=data[0].content;
      subject.value=subject.value||data[0].title;
      status.textContent='Loaded your most recent saved cover letter. Review it and add the recipient before sending.';
    }catch(error){status.textContent=error.message||'Could not load cover letter.';}
    finally{loadLetter.disabled=false;}
  });

  save.addEventListener('click',async()=>{
    if(!subject.value.trim()||!body.value.trim()){status.textContent='Enter a subject and message before saving.';return;}
    save.disabled=true;
    try{
      const {error}=await client.from('generated_documents').insert({
        user_id:user.id,document_type:'email_draft',title:subject.value.trim(),
        content:body.value,generation_method:'manual'
      });
      if(error) throw error;
      status.textContent='Email draft saved privately. It has not been sent.';
      toast('Email draft saved.');
      await loadDrafts();
    }catch(error){status.textContent=error.message||'Could not save draft.';}
    finally{save.disabled=false;}
  });

  openMail.addEventListener('click',()=>{
    if(!recipient.value.trim()||!subject.value.trim()||!body.value.trim()){
      status.textContent='Enter the recipient, subject, and message first.';return;
    }
    if(!window.confirm('Open your device email app with this draft? Nothing will be sent until you review and press Send there.')) return;
    const mailto='mailto:'+encodeURIComponent(recipient.value.trim())+
      '?subject='+encodeURIComponent(subject.value.trim())+
      '&body='+encodeURIComponent(body.value);
    window.location.href=mailto;
  });

  getClient().then(async(supabase)=>{
    client=supabase;
    const {data,error}=await client.auth.getUser();
    if(error) throw error;
    user=data?.user;
    if(!user){status.textContent='Sign in from My Profile to save private email drafts.';return;}
    save.disabled=openMail.disabled=loadLetter.disabled=false;
    status.textContent='Manual email drafts are ready. Gmail is not connected; messages open in your device email app and are never sent automatically.';
    await loadDrafts();
  }).catch((error)=>{status.textContent=error.message||'Could not connect to your account.';});

  return el('div',{},
    pageHead('Email Center','Prepare and save recruitment emails. Review the full message before sending it yourself.'),
    el('section',{class:'card'},
      el('p',{class:'muted',text:'This release uses your device email app; direct Gmail OAuth is not configured. The app will not send messages for you.'}),
      status,
      el('div',{class:'profile-fields'},
        el('label',{class:'profile-field'},el('span',{text:'Recipient'}),recipient),
        el('label',{class:'profile-field'},el('span',{text:'Subject'}),subject),
        el('label',{class:'profile-field full'},el('span',{text:'Message'}),body)
      ),
      el('div',{class:'btn-row'},loadLetter,save,openMail)
    ),
    el('section',{class:'card'},el('h2',{text:'Saved email drafts'}),saved)
  );
}

export function trackerPage() {
  const status = el('p', { class: 'muted', text: 'Loading your applications…', 'aria-live': 'polite' });
  const list = el('div', { class: 'grid-2' });
  const root = el('div', {},
    pageHead('Applications', 'Your private application tracker. Save a vacancy from Job Search, then update its progress here.'),
    el('section', { class: 'card' }, status, list)
  );

  getClient().then(async (client) => {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;
    if (!user) {
      status.textContent = 'Sign in from My Profile to view your private application tracker.';
      return;
    }
    const { data, error } = await client.from('applications')
      .select('id,job_id,status,notes,applied_at,reminder_at,job_title_snapshot,organization_snapshot,source_url_snapshot,deadline_snapshot,created_at,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    if (!data?.length) {
      status.textContent = 'No saved applications yet. Open Job Search or Dashboard and choose “Save to Applications” on a vacancy.';
      return;
    }
    const ids = data.map((item) => item.id);
    const { data: events, error: eventError } = await client.from('application_events')
      .select('application_id,event_type,old_status,new_status,note,created_at')
      .in('application_id', ids)
      .order('created_at', { ascending: false });
    if (eventError) throw eventError;
    const byApplication = new Map();
    for (const event of (events || [])) {
      if (!byApplication.has(event.application_id)) byApplication.set(event.application_id, []);
      byApplication.get(event.application_id).push(event);
    }
    status.textContent = data.length + ' applications in your tracker';
    const labels = {
      saved: 'Saved', preparing: 'Preparing', submitted: 'Submitted',
      interview: 'Interview', rejected: 'Rejected', withdrawn: 'Withdrawn', offer: 'Offer'
    };
    list.replaceChildren(...data.map((item) => {
      const state = el('select', { class: 'input', 'aria-label': 'Application status' },
        Object.entries(labels).map(([value, label]) => el('option', { value, text: label }))
      );
      state.value = item.status;
      const notes = el('textarea', { class: 'input', rows: 3, placeholder: 'Private notes, contact details, interview dates…' });
      notes.value = item.notes || '';
      const save = el('button', { class: 'btn primary small', type: 'button', text: 'Save changes' });
      const remove = el('button', { class: 'btn small danger-text', type: 'button', text: 'Remove' });
      const feedback = el('p', { class: 'muted', 'aria-live': 'polite' });
      save.addEventListener('click', async () => {
        const nextStatus = state.value;
        if (nextStatus === 'submitted' && item.status !== 'submitted' &&
            !window.confirm('Confirm that you personally submitted this application on the employer’s official website or by email? This only updates your tracker; it does not send an application.')) return;
        save.disabled = true;
        feedback.textContent = 'Saving…';
        try {
          const update = { status: nextStatus, notes: notes.value };
          if (nextStatus === 'submitted' && item.status !== 'submitted') update.applied_at = new Date().toISOString();
          const { error: updateError } = await client.from('applications').update(update)
            .eq('id', item.id).eq('user_id', user.id);
          if (updateError) throw updateError;
          item.status = nextStatus;
          feedback.textContent = 'Saved successfully.';
          toast('Application tracker updated.');
        } catch (err) {
          feedback.textContent = err.message || 'Could not save changes.';
        } finally { save.disabled = false; }
      });
      remove.addEventListener('click', async () => {
        if (!window.confirm('Remove this application from your tracker?')) return;
        remove.disabled = true;
        const { error: deleteError } = await client.from('applications').delete()
          .eq('id', item.id).eq('user_id', user.id);
        if (deleteError) {
          remove.disabled = false;
          feedback.textContent = deleteError.message || 'Could not remove this application.';
          return;
        }
        card.remove();
        status.textContent = 'Application removed.';
      });
      const history = byApplication.get(item.id) || [];
      const historyList = el('ul', { class: 'results' },
        history.slice(0, 8).map((event) => el('li', {},
          el('span', { class: 'detail', text: (event.new_status ? labels[event.new_status] || event.new_status : event.event_type) + ' · ' + new Date(event.created_at).toLocaleString() })
        ))
      );
      const card = el('article', { class: 'card vacancy-evidence' },
        el('h3', { text: item.job_title_snapshot || 'Saved vacancy' }),
        el('p', { class: 'muted', text: item.organization_snapshot || 'Organization not stated' }),
        el('p', { class: 'detail', text: 'Deadline: ' + (item.deadline_snapshot || 'Not stated') }),
        item.source_url_snapshot ? el('p', {}, el('a', { href: item.source_url_snapshot, target: '_blank', rel: 'noopener noreferrer', text: 'Open original vacancy' })) : null,
        el('label', { class: 'profile-field' }, el('span', { text: 'Application status' }), state),
        el('label', { class: 'profile-field' }, el('span', { text: 'Private notes' }), notes),
        el('div', { class: 'btn-row' }, save, remove),
        feedback,
        el('details', {}, el('summary', { text: 'Status history' }), historyList)
      );
      return card;
    }));
  }).catch((error) => {
    status.textContent = 'Could not load applications: ' + (error.message || 'Please sign in and try again.');
  });
  return root;
}

// ---------------------------------------------------------------- Profile (private Supabase-backed profile)
function profileField(label, name, type = 'text', placeholder = '') {
  return el('label', { class: 'profile-field' },
    el('span', { text: label }),
    el('input', { name, type, placeholder, autocomplete: 'off' })
  );
}

function repeatableProfileSection(title, description, fields, addLabel = 'Add another') {
  const rows = el('div', { class: 'profile-repeat-list' });
  const addRow = () => {
    const row = el('div', { class: 'profile-repeat-row' });
    const controls = el('div', { class: 'profile-row-actions' });
    const remove = el('button', { class: 'btn small danger-text', type: 'button', text: 'Remove' });
    remove.addEventListener('click', () => {
      if (rows.children.length > 1) row.remove();
      else {
        row.querySelectorAll('input, textarea, select').forEach((input) => { input.value = ''; });
      }
    });
    controls.append(remove);
    row.append(
      el('div', { class: 'profile-fields' }, fields.map((field) =>
        field.type === 'textarea'
          ? el('label', { class: 'profile-field full' },
              el('span', { text: field.label }),
              el('textarea', { name: field.name, rows: field.rows || 2, placeholder: field.placeholder || '' }))
          : profileField(field.label, field.name, field.type || 'text', field.placeholder || '')
      )),
      controls
    );
    rows.append(row);
  };
  addRow();
  const add = el('button', { class: 'btn', type: 'button', text: '+ ' + addLabel });
  add.addEventListener('click', addRow);
  return el('section', { class: 'card profile-section' },
    el('div', { class: 'profile-section-head' },
      el('div', {}, el('h2', { text: title }), description ? el('p', { class: 'muted', text: description }) : null),
      add
    ),
    rows
  );
}

export function profilePage() {
  const personal = el('section', { class: 'card profile-section' },
    el('h2', { text: '1. Personal information' }),
    el('p', { class: 'muted', text: 'All fields are optional. Enter only information you are comfortable sharing with employers.' }),
    el('div', { class: 'profile-fields' },
      profileField('First name', 'first_name'),
      profileField('Last name / surname', 'last_name'),
      profileField("Father’s name", 'father_name'),
      profileField('Birth date (optional)', 'birth_date', 'date'),
      profileField('Province of origin', 'origin_province'),
      profileField('Current province', 'current_province'),
      profileField('Current full address', 'current_address'),
      profileField('Phone number', 'phone', 'tel'),
      profileField('Email address', 'email', 'email')
    )
  );

  const education = repeatableProfileSection('2. Education', 'Add every school, university, degree, diploma, or other study record.', [
    { label: 'Education level / degree', name: 'education_level' },
    { label: 'School / university / institute', name: 'institution' },
    { label: 'Faculty', name: 'faculty' },
    { label: 'Department / field of study', name: 'field_of_study' },
    { label: 'Graduation year', name: 'graduation_year', type: 'number' },
    { label: 'Study status (e.g. studying, graduated)', name: 'study_status' }
  ], 'Add education');

  const skills = repeatableProfileSection('3. Skills', 'Add as many skills as you have. Choose a category in the skill name, or describe it clearly.', [
    { label: 'Skill name', name: 'skill_name', placeholder: 'e.g. Excel, accounting, graphic design' },
    { label: 'Category', name: 'skill_category', placeholder: 'Computer, technical, professional, AI / digital' },
    { label: 'Level (optional)', name: 'skill_level', placeholder: 'Beginner, intermediate, advanced' }
  ], 'Add skill');

  const languages = repeatableProfileSection('Languages', 'Add each language and your level.', [
    { label: 'Language', name: 'language_name' },
    { label: 'Proficiency level', name: 'language_level', placeholder: 'Native, fluent, intermediate, basic' }
  ], 'Add language');

  const experience = repeatableProfileSection('4. Work experience', 'Add current and previous jobs, internships, and volunteer experience.', [
    { label: 'Company / organization', name: 'employer' },
    { label: 'Job title', name: 'job_title' },
    { label: 'Start date', name: 'work_start', type: 'date' },
    { label: 'End date', name: 'work_end', type: 'date' },
    { label: 'Currently working here? (write Yes or No)', name: 'currently_working' },
    { label: 'Responsibilities and achievements', name: 'responsibilities', type: 'textarea', rows: 3, placeholder: 'Describe your actual duties and achievements.' }
  ], 'Add experience');

  const certificates = repeatableProfileSection('5. Certificates and training', 'Add diplomas, professional certificates, and completed training courses.', [
    { label: 'Certificate / course name', name: 'certificate_name' },
    { label: 'Issuing organization', name: 'issuer' },
    { label: 'Issue date or year', name: 'issue_date' },
    { label: 'Certificate ID (optional)', name: 'certificate_id' }
  ], 'Add certificate');

  const projects = repeatableProfileSection('Additional projects and achievements', 'Optional: include relevant projects, volunteering, awards, or achievements.', [
    { label: 'Project / achievement title', name: 'project_title' },
    { label: 'Your role and details', name: 'project_details', type: 'textarea', rows: 3 }
  ], 'Add project');

  const accountStatus = el('p', { class: 'muted', text: 'Checking account status…', 'aria-live': 'polite' });
  const authEmail = el('input', { type: 'email', name: 'auth_email', placeholder: 'Email address', autocomplete: 'email', required: true });
  const authPassword = el('input', { type: 'password', name: 'auth_password', placeholder: 'Password (at least 8 characters)', autocomplete: 'current-password', required: true });
  const authMessage = el('p', { class: 'muted', 'aria-live': 'polite' });
  const signUpBtn = el('button', { class: 'btn', type: 'button', text: 'Create account' });
  const signInBtn = el('button', { class: 'btn primary', type: 'button', text: 'Sign in' });
  const signOutBtn = el('button', { class: 'btn', type: 'button', text: 'Sign out' });
  const saveBtn = el('button', { class: 'btn primary', type: 'button', text: 'Save my profile' });
  const accountActions = el('div', { class: 'btn-row' }, signUpBtn, signInBtn, signOutBtn);
  const saveActions = el('div', { class: 'btn-row' }, saveBtn);
  let activeUser = null;
  let supabase = null;
  const itemTypes = ['education', 'skill', 'language', 'experience', 'certificate', 'project'];
  const setAuthState = (user) => {
    activeUser = user || null;
    accountStatus.textContent = activeUser ? 'Signed in as ' + activeUser.email + '. Your profile is private to your account.' : 'Not signed in. Create an account or sign in to save your profile.';
    authEmail.hidden = !!activeUser;
    authPassword.hidden = !!activeUser;
    signUpBtn.hidden = !!activeUser;
    signInBtn.hidden = !!activeUser;
    signOutBtn.hidden = !activeUser;
    saveBtn.disabled = !activeUser;
  };
  const fillProfile = async () => {
    if (!activeUser || !supabase) return;
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', activeUser.id).maybeSingle();
    if (error) throw error;
    if (profile) {
      for (const key of ['first_name','last_name','father_name','birth_date','origin_province','current_province','current_address','phone','contact_email']) {
        const field = personal.querySelector('[name="' + key + '"]');
        if (field) field.value = profile[key] || '';
      }
      const emailField = personal.querySelector('[name="email"]');
      if (emailField && profile.contact_email) emailField.value = profile.contact_email;
    }
    const { data: items, error: itemError } = await supabase.from('profile_items').select('item_type,position,data').eq('user_id', activeUser.id).order('position');
    if (itemError) throw itemError;
    // Repeatable profile sections are restored independently below.
    for (let i = 0; i < itemTypes.length; i++) {
      const list = [education, skills, languages, experience, certificates, projects][i].querySelector('.profile-repeat-list');
      const rows = (items || []).filter((item) => item.item_type === itemTypes[i]).sort((a,b) => a.position - b.position);
      const addButton = [education, skills, languages, experience, certificates, projects][i].querySelector('.profile-section-head button');
      while (list.children.length < Math.max(1, rows.length)) addButton.click();
      Array.from(list.children).forEach((row, index) => {
        const values = rows[index]?.data || {};
        row.querySelectorAll('input,textarea,select').forEach((field) => { field.value = values[field.name] ?? ''; });
      });
    }
  };
  const authAction = async (kind) => {
    authMessage.textContent = '';
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || password.length < 8) { authMessage.textContent = 'Enter a valid email and a password with at least 8 characters.'; return; }
    signUpBtn.disabled = signInBtn.disabled = true;
    try {
      supabase ||= await getClient();
      if (kind === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
        if (error) throw error;
        authMessage.textContent = data.session ? 'Account created and signed in.' : 'Account created. Check your email to confirm it, then return here and sign in.';
        if (data.user && data.session) setAuthState(data.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthState(data.user);
        await fillProfile();
        authMessage.textContent = 'Signed in. Your saved profile has been loaded.';
      }
    } catch (error) {
      authMessage.textContent = error.message || 'Authentication failed. Please try again.';
    } finally {
      signUpBtn.disabled = signInBtn.disabled = false;
    }
  };
  signUpBtn.addEventListener('click', () => authAction('signup'));
  signInBtn.addEventListener('click', () => authAction('signin'));
  signOutBtn.addEventListener('click', async () => {
    try { supabase ||= await getClient(); const { error } = await supabase.auth.signOut(); if (error) throw error; setAuthState(null); authMessage.textContent = 'You are signed out.'; }
    catch (error) { authMessage.textContent = error.message || 'Could not sign out.'; }
  });
  saveBtn.addEventListener('click', async () => {
    if (!activeUser) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; authMessage.textContent = '';
    try {
      const profileData = {};
      for (const key of ['first_name','last_name','father_name','birth_date','origin_province','current_province','current_address','phone']) {
        profileData[key] = personal.querySelector('[name="' + key + '"]')?.value || null;
      }
      profileData.contact_email = personal.querySelector('[name="email"]')?.value.trim() || activeUser.email || null;
      const { error: profileError } = await supabase.from('profiles').upsert({ id: activeUser.id, ...profileData, updated_at: new Date().toISOString() });
      if (profileError) throw profileError;
      const payload = [];
      const sections = [education, skills, languages, experience, certificates, projects];
      sections.forEach((section, i) => {
        Array.from(section.querySelectorAll('.profile-repeat-list > .profile-repeat-row')).forEach((row, position) => {
          const data = {};
          row.querySelectorAll('input,textarea,select').forEach((field) => { if (field.value.trim()) data[field.name] = field.value.trim(); });
          if (Object.keys(data).length) payload.push({ user_id: activeUser.id, item_type: itemTypes[i], position, data });
        });
      });
      const { error: deleteError } = await supabase.from('profile_items').delete().eq('user_id', activeUser.id);
      if (deleteError) throw deleteError;
      if (payload.length) {
        const { error: insertError } = await supabase.from('profile_items').insert(payload);
        if (insertError) throw insertError;
      }
      authMessage.textContent = 'Profile saved securely to your private account.';
      toast('Profile saved.');
    } catch (error) {
      authMessage.textContent = error.message || 'Could not save profile.';
    } finally {
      saveBtn.disabled = !activeUser; saveBtn.textContent = 'Save my profile';
    }
  });
  const authCard = el('section', { class: 'card profile-save-notice' },
    el('span', { class: 'badge ok', text: 'Private account storage enabled' }),
    el('h2', { text: 'Account and secure profile saving' }),
    el('p', { class: 'muted', text: 'Create an account with your email and password, then sign in. Your personal profile is stored privately and each account can access only its own information.' }),
    accountStatus,
    el('div', { class: 'profile-fields' },
      el('label', { class: 'profile-field' }, el('span', { text: 'Email for account' }), authEmail),
      el('label', { class: 'profile-field' }, el('span', { text: 'Password' }), authPassword)
    ),
    accountActions,
    saveActions,
    authMessage
  );
  getClient().then(async (client) => {
    supabase = client;
    const { data: { user } } = await client.auth.getUser();
    setAuthState(user);
    if (user) await fillProfile();
    client.auth.onAuthStateChange((_event, session) => { setAuthState(session?.user || null); });
  }).catch((error) => { accountStatus.textContent = 'Supabase connection error: ' + (error.message || 'Unable to connect.'); });

  const cvLink = el('a', { class: 'btn primary', href: '#/documents', text: 'Open CV & Cover Letter builder' });
  const cv = el('section', { class: 'card profile-section' },
    el('h2', { text: '6. CV builder' }),
    el('p', { class: 'muted', text: 'Your saved profile can now be used to create editable CV and cover-letter drafts, save them privately, and print them as PDF. Review every detail before sharing.' }),
    cvLink
  );

  return el('div', {},
    pageHead('My Profile', 'A flexible profile for job seekers across Afghanistan. Complete sections gradually; every field is optional.'),
    personal,
    education,
    skills,
    languages,
    experience,
    certificates,
    projects,
    cv,
    authCard
  );
}

// ---------------------------------------------------------------- Settings
export function settingsPage() {
  const status = getConfigStatus();
  const pill = STATUS_PILL[status.state] || STATUS_PILL.missing;

  const results = el('ul', { class: 'results', 'aria-live': 'polite' });
  const testBtn = el('button', { class: 'btn primary', type: 'button', text: 'Test Supabase connection' });
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.textContent = 'Testing…';
    results.replaceChildren(el('li', {}, el('span', { class: 'muted', text: 'Running checks…' })));
    try {
      const steps = await testConnection();
      results.replaceChildren(...steps.map((s) => el('li', {},
        el('span', { class: `badge ${s.ok ? 'ok' : 'danger'}`, text: s.ok ? 'OK' : 'Failed' }),
        el('span', {}, el('strong', { text: `${s.label}: ` }), el('span', { class: 'detail', text: s.detail }))
      )));
    } catch {
      results.replaceChildren(el('li', {}, el('span', { class: 'badge danger', text: 'Failed' }), el('span', { text: 'Unexpected error while testing.' })));
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Supabase connection';
    }
  });

  // PWA card
  const swValue = el('dd', { text: 'Checking…' });
  getServiceWorkerState().then((s) => { swValue.textContent = s; });

  const installValue = el('dd', {});
  const installBtn = el('button', { class: 'btn', type: 'button', text: 'Install app' });
  installBtn.addEventListener('click', async () => {
    const outcome = await promptInstall();
    if (outcome === 'unavailable') toast('Install is not available right now.');
  });
  const renderInstall = () => {
    if (isStandalone()) installValue.replaceChildren('Running as an installed app.');
    else if (canInstall()) installValue.replaceChildren(installBtn);
    else installValue.replaceChildren('Not offered by this browser right now. Use the browser menu (Add to Home Screen / Install) if available.');
  };
  renderInstall();
  onInstallAvailabilityChange(renderInstall);

  const clearBtn = el('button', { class: 'btn', type: 'button', text: 'Clear offline data & reset app cache' });
  clearBtn.addEventListener('click', async () => {
    clearBtn.disabled = true;
    try {
      await clearOfflineData();
      toast('Offline data cleared. Reload the page to re-enable offline support.');
      swValue.textContent = 'not registered';
    } catch {
      toast('Could not clear offline data.');
    } finally {
      clearBtn.disabled = false;
    }
  });

  return el('div', {},
    pageHead('Settings', 'Connection status and Afghanistan job-platform information.'),
    el('div', { class: 'grid-2' },
      el('section', { class: 'card' },
        el('h2', { text: 'Supabase connection' }),
        el('p', {}, el('span', { class: `badge ${pill.cls}`, text: pill.text })),
        el('p', { class: 'muted', text: status.message }),
        el('div', { class: 'btn-row' }, testBtn),
        results,
        el('p', { class: 'muted', text: 'Only the public URL and anon key belong in js/config.js. Secrets live in Supabase Edge Function secrets, never in this app.' })
      ),
      el('section', { class: 'card' },
        el('h2', { text: 'App & offline' }),
        el('dl', { class: 'kv' },
          el('dt', { text: 'Version' }), el('dd', { text: CONFIG.APP_VERSION }),
          el('dt', { text: 'Online' }), el('dd', { text: navigator.onLine ? 'Yes' : 'No' }),
          el('dt', { text: 'Service worker' }), swValue,
          el('dt', { text: 'Install' }), installValue
        ),
        el('div', { class: 'btn-row' }, clearBtn),
        el('p', { class: 'muted', text: 'Only the static app shell is cached. Profile data, emails, tokens, and documents are never stored offline.' })
      ),
      el('section', { class: 'card' },
        el('h2', { text: 'Coming later' }),
        el('ul', { class: 'list' },
          el('li', { text: 'Match scoring weights and thresholds (Phase 3)' }),
          el('li', { text: 'Allowed locations and job-source toggles (Phase 3)' }),
          el('li', { text: 'Search frequency and notifications (Phase 6)' }),
          el('li', { text: 'Gmail connection (Phase 5)' })
        )
      )
    )
  );
}

// ---------------------------------------------------------------- 404
export function notFoundPage() {
  return el('div', {},
    pageHead('Page not found'),
    emptyState({ iconName: 'search', title: 'This page does not exist', text: 'Use the navigation to go back to a valid page.' })
  );
}


// ------------------------------------------------------ Organization discovery registry
export function organizationDiscoveryPage() {
  const status = el('p', { class: 'muted', text: 'Loading discovered organizations…', 'aria-live': 'polite' });
  const progressText = el('p', { class: 'muted', text: 'Website checks have not started yet.', 'aria-live': 'polite' });
  const progress = el('progress', { max: 100, value: 0, class: 'site-check-progress' });
  const runBtn = el('button', { class: 'btn primary', type: 'button', text: 'Check all organization websites' });
  const hiringSummary = el('p', { class: 'muted', text: 'Loading hiring review totals…', 'aria-live': 'polite' });
  const hiringProgress = el('progress', { max: 1163, value: 0, class: 'site-check-progress', hidden: true });
  const hiringProgressText = el('p', { class: 'muted', text: 'Click Find Jobs Opportunities to scan verified organizations with approved collection permission.', 'aria-live': 'polite' });
  const list = el('div', { class: 'grid-2' });
  const vacancyPanel = el('div', { class: 'grid-2 vacancy-panel' });
  let hiringFilter = 'needs_review';
  const filterButtons = [
    ['needs_review', 'Needs hiring review'],
    ['hiring', 'Find Jobs Opportunities'],
    ['all', 'All organizations']
  ].map(([value, label]) => {
    const button = el('button', { class: 'btn', type: 'button', text: label });
    button.addEventListener('click', () => {
      if (value === 'hiring') {
        hiringFilter = 'hiring';
        scanHiring();
        return;
      }
      hiringFilter = value;
      renderOrganizations();
    });
    return button;
  });
  const filterBar = el('div', { class: 'btn-row' }, ...filterButtons);
  const root = el('div', {},
    pageHead('Organization Discovery', 'A growing directory of Afghan organizations. Organization identity, website availability, current hiring, and permission to collect vacancy data are tracked separately.'),
    el('section', { class: 'card' },
      el('h2', { text: 'Website availability checker' }),
      el('p', { class: 'muted', text: 'Check the official website and any saved careers page for every organization. Results are saved so you can review HTTP status codes and the time of the last check.' }),
      el('div', { class: 'btn-row' }, runBtn),
      progress,
      progressText,
      el('p', { class: 'muted', text: 'A reachable website does not prove legal registration, active hiring, or permission to collect vacancy data. Redirects are followed safely (up to 5 HTTPS hops). Temporary DNS / connection failures are retried once. Invalid or expired TLS certificates remain flagged for safety and must be fixed by the website owner; certificate checks are never bypassed.' })
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Hiring discovery review' }),
      hiringSummary,
      filterBar,
      hiringProgress,
      hiringProgressText,
      el('h3', { text: 'Vacancy announcements found' }),
      el('p', { class: 'muted', text: 'Potential announcements are shown below even when dates or location are missing. These need review and are not automatically counted as confirmed current hiring.' }),
      vacancyPanel,
      el('p', { class: 'muted', text: 'This scan checks saved organization URLs only. Some records point to ministry registries or organization directories rather than an employer’s own website, so 1163 checked records does not mean 1163 independent employer career sites were checked. Separate job portals are listed below; they are not automatically imported until an approved API, feed, or explicit collection permission is available. The scanner respects robots.txt. Blocked or unreachable sites remain Unknown.' })
    ),
    el('section', { class: 'card job-source-directory' },
      el('h2', { text: 'Afghanistan job portals' }),
      el('p', { class: 'muted', text: 'These are separate job-announcement sources, not organization registry pages. Open the source to inspect the original listing. Automatic importing is kept disabled until the provider offers an approved API, feed, or explicit collection permission.' }),
      el('div', { class: 'grid-2' },
        el('article', { class: 'card' },
          el('h3', { text: 'ACBAR — NGO and humanitarian vacancies' }),
          el('p', { class: 'muted', text: 'Afghanistan NGO vacancy announcements. Always open the individual vacancy and verify its Published date, status, and closing date.' }),
          el('a', { href: 'https://www.acbar.org/company/jobs', target: '_blank', rel: 'noopener noreferrer', text: 'Open ACBAR job announcements' }),
          el('p', { class: 'detail muted', text: 'Automatic import: permission / approved feed pending' })
        ),
        el('article', { class: 'card' },
          el('h3', { text: 'Jobs.af — Afghanistan jobs' }),
          el('p', { class: 'muted', text: 'Job listings from Afghan employers and organizations. Check the original job page for the publication date and future deadline.' }),
          el('a', { href: 'https://www.jobs.af/', target: '_blank', rel: 'noopener noreferrer', text: 'Open Jobs.af' }),
          el('p', { class: 'detail muted', text: 'Automatic import: permission / approved feed pending' })
        ),
        el('article', { class: 'card' },
          el('h3', { text: 'Wazifaha — jobs across Afghanistan' }),
          el('p', { class: 'muted', text: 'Vacancies across NGOs, UN agencies, government bodies, and private companies. Verify every listing at its detail page.' }),
          el('a', { href: 'https://wazifaha.org/', target: '_blank', rel: 'noopener noreferrer', text: 'Open Wazifaha' }),
          el('p', { class: 'detail muted', text: 'Automatic import: permission / approved feed pending' })
        )
      ),
      el('p', { class: 'muted', text: 'Strict display rule: only announcements with a verified publication date within the last two Kabul calendar days are eligible. A future closing date is required before an announcement can be marked confirmed current. Missing dates or deadlines must remain unconfirmed; expired posts are never shown as current.' })
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Discovered organizations' }),
      status,
      list
    ),
    el('section', { class: 'card social-discovery-card' },
      el('h2', { text: 'Social media job discovery' }),
      el('p', { class: 'muted', text: 'Connect official Facebook Pages, LinkedIn organization pages, and Telegram channels to the 1,163-organization registry. New account suggestions remain pending until verified.' }),
      el('div', { class: 'profile-fields' },
        el('label', { class: 'profile-field' }, el('span', { text: 'Organization' }), el('select', { id: 'social-org-select', required: true }, el('option', { value: '', text: 'Choose an organization' }))),
        el('label', { class: 'profile-field' }, el('span', { text: 'Social network' }), el('select', { id: 'social-platform-select' },
          el('option', { value: 'facebook', text: 'Facebook Page' }),
          el('option', { value: 'linkedin', text: 'LinkedIn organization page' }),
          el('option', { value: 'telegram', text: 'Telegram channel' })
        )),
        el('label', { class: 'profile-field' }, el('span', { text: 'Official profile URL' }), el('input', { id: 'social-profile-url', type: 'url', placeholder: 'https://…', required: true })),
        el('label', { class: 'profile-field' }, el('span', { text: 'Evidence URL (official website link or proof)' }), el('input', { id: 'social-evidence-url', type: 'url', placeholder: 'https://…' }))
      ),
      el('div', { class: 'btn-row' }, el('button', { id: 'social-submit-btn', class: 'btn primary', type: 'button', text: 'Submit account for verification' })),
      el('p', { id: 'social-submit-status', class: 'muted', 'aria-live': 'polite', text: 'Only public, official organization accounts are accepted. Blue badges alone are not treated as proof.' }),
      el('h3', { text: 'Verified social accounts' }),
      el('div', { id: 'social-accounts-list', class: 'grid-2' }, el('p', { class: 'muted', text: 'Loading verified accounts…' })),
      el('h3', { text: 'Social media job announcements' }),
      el('div', { id: 'social-posts-list', class: 'grid-2' }, el('p', { class: 'muted', text: 'No social announcements have been collected yet.' })),
      el('p', { class: 'muted', text: 'Automatic collection is not active yet. Facebook and LinkedIn API access requires platform approval and credentials; Telegram channel access also needs an authorized bot or permitted public feed. No private or unauthorized accounts are accessed.' })
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Verification and collection rules' }),
      el('p', { class: 'muted', text: 'Organization identity verification does not mean the organization is currently hiring. The website availability checker only tests reachability. The separate hiring scan reads limited vacancy metadata from official employer pages, honors robots.txt, and marks a vacancy Current only when both its publication date and future deadline are present. Third-party job portals are not scanned unless their collection permission is approved. Public visibility alone is not permission.' })
    )
  );

  let client = null;
  let organizations = [];
  let checks = [];
  let socialAccounts = [];
  let socialPosts = [];
  let vacancies = [];
  let nextOffset = 0;
  let total = 0;
  let hiringTotal = 0;
  let running = false;
  const hiringScanStorageKey = 'ajf-hiring-scan-progress-v2';
  const readHiringScanState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(hiringScanStorageKey) || '{}');
      return {
        offset: Number.isInteger(saved.offset) && saved.offset >= 0 ? saved.offset : 0,
        discovered: Number.isFinite(saved.discovered) ? saved.discovered : 0,
        current: Number.isFinite(saved.current) ? saved.current : 0,
        unreachable: Number.isFinite(saved.unreachable) ? saved.unreachable : 0
      };
    } catch {
      return { offset: 0, discovered: 0, current: 0, unreachable: 0 };
    }
  };
  const saveHiringScanState = (state) => {
    try { localStorage.setItem(hiringScanStorageKey, JSON.stringify(state)); } catch { /* progress remains in this page session */ }
  };

  const checkMap = () => new Map(checks.map((item) => [item.organization_id + ':' + item.check_type, item]));
  const describeCheck = (item) => {
    if (!item) return { text: 'Not checked yet', cls: 'muted' };
    const code = item.http_status ? ' · HTTP ' + item.http_status : '';
    const labels = {
      reachable: ['Website reachable', 'ok'],
      redirected: ['Redirect found — recheck required', 'warn'],
      not_found: ['Page not found', 'danger'],
      blocked: ['Blocked / bot protection', 'warn'],
      server_error: ['Server error', 'danger'],
      timeout: ['Timed out', 'warn'],
      invalid_url: ['Invalid or unsupported URL', 'danger'],
      http_error: ['HTTP response needs review', 'warn'],
      network_error: ['Network connection error', 'warn'],
      dns_error: ['DNS lookup failed', 'warn'],
      tls_error: ['TLS certificate / handshake error', 'danger']
    };
    const value = labels[item.result_status] || ['Check completed', 'muted'];
    return { text: value[0] + code, cls: value[1], item };
  };

  const renderOrganizations = () => {
    const byKey = checkMap();
    const hiringCount = organizations.filter((org) => org.hiring_status === 'hiring').length;
    const reviewCount = organizations.filter((org) => org.hiring_status !== 'hiring' && org.hiring_status !== 'not_hiring').length;
    // Hide obvious non-vacancy pages already stored by earlier scanner versions.
    const visibleVacancies = vacancies.filter((v) => {
      const today = kabulDate();
      const posted = String(v.date_posted || '').slice(0, 10);
      const deadline = String(v.valid_through || '').slice(0, 10);
      // Never display expired records, stale announcements, or vacancies past their deadline.
      if (v.vacancy_status === 'expired' || !posted || posted < kabulDate(-1) || posted > today) return false;
      if (deadline && deadline < today) return false;
      const title = String(v.job_title || '').toLowerCase();
      const url = String(v.vacancy_url || '').toLowerCase();
      const excludedPath = /(?:^|[\/_-])(?:privacy|policy|about|who-we-are|director(?:'s|s)?-message|executive-director-message|resources?|tenders?|news|blog|contact|career-guidance|jobs-app|register-your-interest|annual-report|financial-report|cookie|terms-and-conditions)(?:[\/_.?#-]|$)/.test(url);
      const excludedTitle = /^(?:privacy policy|jobs app privacy policy|about(?: us)?|who we are|director(?:'s|s)? message|executive director message|resources?|tenders?|news|blog|contact|career guidance|register your interest|vacancy page from official sitemap|careers?|jobs?|career opportunities|job opportunities|terms(?: and conditions)?|cookie policy)$/i.test(title)
        || /director(?:'s|s)?\s+message|message from.{0,20}director|privacy policy|jobs app privacy policy|register your interest/i.test(title);
      const excluded = excludedPath || excludedTitle;
      if (excluded || /^(vacancy page from official sitemap|careers?|jobs?|career opportunities|job opportunities|resources?)$/i.test(title.trim())) return false;
      if (title.length < 6 || title.length > 120) return false;
      return /\b(assistant|officer|manager|engineer|specialist|coordinator|director|accountant|teacher|driver|clerk|technician|supervisor|analyst|intern|consultant|guard|nurse|team leader|cashier|operator|advisor|adviser|enumerator|surveyor|lecturer|professor|doctor|midwife|pharmacist|hr officer|human resources officer|it support officer)\b/i.test(title)
        || /(?:^|\s)(?:انجینیر|داکتر|تکنیشن|افسر|سکرتر|معلم|استاد|نرس|قابله|فارمسست|حسابدار|مشاور)(?:\s|$)|(?:بست خالي|اعلان وظیفه|اعلان کاریابی|فرصت شغلی|کارشناس(?:ی)?|کارمند اداری)/.test(title);
    });
    const confirmedVacancies = visibleVacancies.filter((v) => v.vacancy_status === 'current').length;
    const reviewVacancies = visibleVacancies.filter((v) => v.vacancy_status === 'needs_review').length;
    hiringSummary.textContent = hiringCount + ' organizations currently hiring · ' + confirmedVacancies + ' date-verified current vacancies · ' + reviewVacancies + ' potential job announcements needing review · ' + reviewCount + ' organizations need evidence (' + organizations.length + ' total) · ' + hiringTotal + ' approved organizations eligible for automated scanning.';
    const orgById = new Map(organizations.map((org) => [org.id, org]));
    const sortedVacancies = [...visibleVacancies].sort((a, b) => (a.vacancy_status === 'current' ? -1 : b.vacancy_status === 'current' ? 1 : 0));
    vacancyPanel.replaceChildren(...sortedVacancies.slice(0, 100).map((v) => {
      const org = orgById.get(v.organization_id);
      const state = v.vacancy_status === 'current' ? 'Confirmed current' : v.vacancy_status === 'expired' ? 'Expired' : 'Potential announcement — review dates';
      return el('article', { class: 'card vacancy-evidence' },
        el('h3', { text: v.job_title || 'Vacancy announcement' }),
        el('p', { class: 'detail', text: 'Organization: ' + (org?.organization_name || 'Unknown organization') }),
        el('p', { class: 'detail', text: 'Location: ' + (v.location_text || 'Not stated / not detected') }),
        el('p', { class: 'detail', text: 'Status: ' + state }),
        el('p', { class: 'detail', text: 'Posted: ' + (v.date_posted || 'Not stated') + ' · Deadline: ' + (v.valid_through || 'Not stated') }),
        el('a', { href: v.vacancy_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open original announcement' })
      );
    }));
    if (!visibleVacancies.length) vacancyPanel.replaceChildren(el('p', { class: 'muted', text: 'No vacancy-related links have been recorded yet. This does not prove that organizations have no vacancies; many sites publish jobs in formats this scanner cannot automatically read.' }));
    const visibleOrganizations = organizations.filter((org) => {
      if (hiringFilter === 'hiring') return org.hiring_status === 'hiring';
      if (hiringFilter === 'needs_review') return org.hiring_status !== 'hiring' && org.hiring_status !== 'not_hiring';
      return true;
    });
    list.replaceChildren(...visibleOrganizations.map((org) => {
      const verified = org.verification_status === 'verified';
      const rejected = org.verification_status === 'rejected';
      const identityState = verified ? 'Organization identity verified' : rejected ? 'Rejected candidate' : 'Candidate — identity review needed';
      const identityClass = verified ? 'ok' : rejected ? 'danger' : 'warn';
      const hiringState = org.hiring_status === 'hiring'
        ? 'Currently hiring'
        : org.hiring_status === 'not_hiring'
          ? 'No active hiring confirmed'
          : 'Hiring status unknown';
      const hiringClass = org.hiring_status === 'hiring' ? 'ok' : 'warn';
      const permission = org.collection_permission_status === 'allowed'
        ? 'Collection permission: allowed'
        : org.collection_permission_status === 'denied'
          ? 'Collection permission: denied'
          : 'Collection permission: pending';
      const orgVacancies = visibleVacancies.filter((v) => v.organization_id === org.id);
      const websiteCheck = describeCheck(byKey.get(org.id + ':official_website'));
      const careersCheck = describeCheck(byKey.get(org.id + ':careers'));
      const checkLine = (label, result) => el('p', { class: 'detail' },
        el('span', { class: 'badge ' + result.cls, text: label + ': ' + result.text }),
        result.item?.final_url ? el('span', { class: 'muted' }, ' → ', el('a', { href: result.item.final_url, target: '_blank', rel: 'noopener noreferrer', text: 'Redirect target' })) : null,
        result.item?.checked_at ? el('span', { class: 'muted', text: ' · ' + new Date(result.item.checked_at).toLocaleString() }) : null,
        result.item?.error_message ? el('span', { class: 'muted', text: ' · Details: ' + result.item.error_message.slice(0, 180) }) : null
      );
      return el('article', { class: 'card' },
        el('h3', { text: org.organization_name }),
        el('span', { class: 'badge ' + identityClass, text: identityState }),
        el('p', { class: 'detail' }, el('span', { class: 'badge ' + hiringClass, text: hiringState })),
        ...orgVacancies.map((v) => el('div', { class: 'vacancy-evidence' },
          el('strong', { text: v.job_title }),
          el('p', { class: 'detail', text: 'Status: ' + (v.vacancy_status === 'current' ? 'Current' : v.vacancy_status === 'expired' ? 'Expired' : 'Needs date review') }),
          el('p', { class: 'detail', text: 'Posted: ' + (v.date_posted || 'Not published') + ' · Deadline: ' + (v.valid_through || 'Not stated') }),
          el('a', { href: v.vacancy_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open vacancy announcement' })
        )),
        org.sector ? el('p', { class: 'detail', text: org.sector }) : null,
        el('p', { class: 'detail', text: permission }),
        checkLine('Official website', websiteCheck),
        org.careers_url ? checkLine('Careers page', careersCheck) : null,
        el('p', { class: 'muted', text: org.notes || '' }),
        el('div', { class: 'btn-row' },
          el('a', { class: 'btn', href: org.official_website, target: '_blank', rel: 'noopener noreferrer', text: 'Official website' }),
          org.careers_url ? el('a', { class: 'btn primary', href: org.careers_url, target: '_blank', rel: 'noopener noreferrer', text: 'Careers / Jobs' }) : null
        ),
        org.evidence_url ? el('p', { class: 'muted' }, el('a', { href: org.evidence_url, target: '_blank', rel: 'noopener noreferrer', text: 'Registry / discovery evidence' })) : null,
        org.verification_evidence_url ? el('p', { class: 'muted' }, el('a', { href: org.verification_evidence_url, target: '_blank', rel: 'noopener noreferrer', text: 'Organization verification evidence' })) : null,
        org.hiring_evidence_url ? el('p', { class: 'muted' }, el('a', { href: org.hiring_evidence_url, target: '_blank', rel: 'noopener noreferrer', text: 'Current hiring evidence' })) : null,
        org.verified_at ? el('p', { class: 'muted', text: 'Identity verified: ' + new Date(org.verified_at).toLocaleDateString() }) : null,
        org.last_hiring_checked_at ? el('p', { class: 'muted', text: 'Hiring last checked: ' + new Date(org.last_hiring_checked_at).toLocaleDateString() }) : null,
        org.last_reviewed_at ? el('p', { class: 'muted', text: 'Registry last reviewed: ' + new Date(org.last_reviewed_at).toLocaleDateString() }) : null
      );
    }));
  };

  const renderSocialDiscovery = () => {
    const orgSelect = root.querySelector('#social-org-select');
    const accountsHost = root.querySelector('#social-accounts-list');
    const postsHost = root.querySelector('#social-posts-list');
    if (orgSelect && orgSelect.options.length <= 1) {
      orgSelect.replaceChildren(el('option', { value: '', text: 'Choose an organization' }),
        ...organizations.map((org) => el('option', { value: org.id, text: org.organization_name })));
    }
    if (accountsHost) {
      accountsHost.replaceChildren(...socialAccounts.map((account) => {
        const org = organizations.find((item) => item.id === account.organization_id);
        const platform = account.platform === 'facebook' ? 'Facebook' : account.platform === 'linkedin' ? 'LinkedIn' : 'Telegram';
        return el('article', { class: 'card' },
          el('h4', { text: org?.organization_name || 'Organization' }),
          el('p', { class: 'detail', text: platform + ' · Verified official account' }),
          el('a', { href: account.profile_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open official account' }),
          account.evidence_url ? el('p', {}, el('a', { href: account.evidence_url, target: '_blank', rel: 'noopener noreferrer', text: 'Verification evidence' })) : null
        );
      }));
      if (!socialAccounts.length) accountsHost.replaceChildren(el('p', { class: 'muted', text: 'No verified social accounts have been registered yet. You can submit an official account above.' }));
    }
    if (postsHost) {
      postsHost.replaceChildren(...socialPosts.map((post) => {
        const org = organizations.find((item) => item.id === post.organization_id);
        return el('article', { class: 'card' },
          el('h4', { text: post.detected_job_title || 'Potential job announcement' }),
          el('p', { class: 'detail', text: (org?.organization_name || 'Organization') + ' · ' + post.platform + ' · ' + (post.review_status === 'approved' ? 'Reviewed' : 'Pending review') }),
          post.posted_at ? el('p', { class: 'muted', text: 'Posted: ' + new Date(post.posted_at).toLocaleString() }) : null,
          el('a', { href: post.post_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open original social post' }),
          post.vacancy_url ? el('p', {}, el('a', { href: post.vacancy_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open application / vacancy link' })) : null
        );
      }));
      if (!socialPosts.length) postsHost.replaceChildren(el('p', { class: 'muted', text: 'No social announcements have been collected yet. API collection will start after official platform access is approved.' }));
    }
  };

  const loadSocialDiscovery = async () => {
    const [accountsResult, postsResult] = await Promise.all([
      client.from('organization_social_accounts')
        .select('id,organization_id,platform,profile_url,evidence_url,verification_status')
        .eq('is_active', true).order('created_at', { ascending: false }),
      client.from('organization_social_posts')
        .select('id,organization_id,platform,post_url,posted_at,detected_job_title,vacancy_url,review_status')
        .in('review_status', ['pending', 'approved']).order('posted_at', { ascending: false }).limit(60)
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (postsResult.error) throw postsResult.error;
    socialAccounts = accountsResult.data || [];
    socialPosts = postsResult.data || [];
    renderSocialDiscovery();
  };

  root.querySelector('#social-submit-btn').addEventListener('click', async () => {
    const submit = root.querySelector('#social-submit-btn');
    const message = root.querySelector('#social-submit-status');
    const organizationId = root.querySelector('#social-org-select').value;
    const platform = root.querySelector('#social-platform-select').value;
    const profileUrl = root.querySelector('#social-profile-url').value.trim();
    const evidenceUrl = root.querySelector('#social-evidence-url').value.trim();
    const allowedHosts = {
      facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
      linkedin: ['linkedin.com', 'www.linkedin.com'],
      telegram: ['t.me', 'telegram.me', 'www.t.me']
    };
    const validHttpsUrl = (value, hosts) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && hosts.includes(url.hostname.toLowerCase()) && !url.username && !url.password;
      } catch { return false; }
    };
    if (!organizationId) { message.textContent = 'Choose an organization first.'; return; }
    if (!validHttpsUrl(profileUrl, allowedHosts[platform])) {
      message.textContent = 'Enter a valid HTTPS URL from the selected social network.';
      return;
    }
    if (evidenceUrl && !validHttpsUrl(evidenceUrl, ['http://invalid'])) {
      try {
        const evidence = new URL(evidenceUrl);
        if (evidence.protocol !== 'https:' || evidence.username || evidence.password) throw new Error('invalid');
      } catch { message.textContent = 'Evidence URL must be a valid HTTPS link.'; return; }
    }
    submit.disabled = true;
    message.textContent = 'Submitting account suggestion…';
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData?.user) throw new Error('Please sign in again to submit an account.');
      const { error } = await client.from('organization_social_accounts').insert({
        organization_id: organizationId, platform, profile_url: profileUrl,
        evidence_url: evidenceUrl || null, submitted_by: userData.user.id,
        verification_status: 'pending', verification_method: 'awaiting_review'
      });
      if (error) throw error;
      message.textContent = 'Submitted. This account will appear publicly only after verification.';
      root.querySelector('#social-profile-url').value = '';
      root.querySelector('#social-evidence-url').value = '';
      await loadSocialDiscovery();
    } catch (error) {
      message.textContent = error.message || 'Could not submit this account.';
    } finally { submit.disabled = false; }
  });

  const fetchAllRows = async (buildQuery) => {
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };

  const kabulDate = (offsetDays = 0) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '0';
    const date = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };

  const loadVacancies = async () => {
    const rows = await fetchAllRows(() => client.from('organization_vacancies')
      .select('organization_id,job_title,vacancy_url,source_page_url,date_posted,valid_through,vacancy_status,employment_type,location_text,last_seen_at')
      .gte('date_posted', kabulDate(-1))
      .lte('date_posted', kabulDate())
      .order('last_seen_at', { ascending: false }));
    vacancies = rows.filter((vacancy) => vacancy.date_posted && vacancy.vacancy_status !== 'expired');
  };

  const loadChecks = async () => {
    checks = await fetchAllRows(() => client.from('organization_site_checks')
      .select('organization_id,check_type,url,result_status,http_status,final_url,error_message,checked_at'));
    renderOrganizations();
  };

  const scanHiring = async () => {
    if (running || !client) return;
    if (!hiringTotal) {
      hiringProgress.hidden = false;
      hiringProgress.max = 1;
      hiringProgress.value = 0;
      hiringProgressText.textContent = 'No verified organizations with approved collection permission are available to scan. Review source permissions before enabling automated collection.';
      return;
    }
    running = true;
    hiringFilter = 'hiring';
    filterButtons[1].disabled = true;
    hiringProgress.hidden = false;
    hiringProgress.max = hiringTotal || 1;
    let state = readHiringScanState();
    if (state.offset >= hiringTotal) state = { offset: 0, discovered: 0, current: 0, unreachable: 0 };
    let offset = state.offset;
    hiringProgress.value = offset;
    if (offset > 0) {
      hiringProgressText.textContent = 'Resuming the saved scan from organization ' + (offset + 1) + ' of ' + hiringTotal + '…';
    } else {
      hiringProgressText.textContent = 'Starting the scan of ' + hiringTotal + ' registered organizations…';
    }
    try {
      while (offset < hiringTotal) {
        hiringProgressText.textContent = 'Scanning approved official careers pages: ' + (offset + 1) + '–' + Math.min(offset + 20, hiringTotal) + ' of ' + hiringTotal + ' organizations…';
        const { data, error } = await client.functions.invoke('scan-current-hiring', { body: { offset, limit: 20, force: true } });
        if (error) throw error;
        if (!data || data.error) throw new Error(data?.error || 'The vacancy scanner returned no result.');
        const nextOffset = Number(data.next_offset);
        if (!Number.isInteger(nextOffset) || nextOffset <= offset || nextOffset > hiringTotal) {
          throw new Error('The scanner did not return a valid next position. Your progress has been saved; press Find Jobs Opportunities to resume.');
        }
        const found = (data.results || []).reduce((n, row) => n + (Number(row.found) || 0), 0);
        const current = (data.results || []).reduce((n, row) => n + (Number(row.current) || 0), 0);
        const failed = (data.results || []).filter((row) => row.error).length;
        state = {
          offset: nextOffset,
          discovered: state.discovered + found,
          current: state.current + current,
          unreachable: state.unreachable + failed
        };
        offset = nextOffset;
        saveHiringScanState(state);
        hiringProgress.value = offset;
        hiringProgressText.textContent = offset + ' / ' + hiringTotal + ' organizations checked · ' + found + ' possible vacancy pages found in this batch · ' + current + ' date-verified current · ' + failed + ' sites blocked or unreachable. Progress saved.';
        if (data.done || offset >= hiringTotal) break;
        if (!data.scanned_organizations) throw new Error('The scanner made no progress. Your progress has been saved; press Find Jobs Opportunities to resume.');
      }
      organizations = await fetchAllRows(() => client.from('organization_candidates')
        .select('id,organization_name,official_website,careers_url,evidence_url,verification_status,verification_evidence_url,verified_at,hiring_status,hiring_evidence_url,last_hiring_checked_at,collection_permission_status,sector,notes,last_reviewed_at')
        .order('organization_name'));
      await loadVacancies();
      renderOrganizations();
      const confirmed = organizations.filter((org) => org.hiring_status === 'hiring').length;
      const possible = vacancies.filter((v) => {
        const title = String(v.job_title || '').toLowerCase();
        const url = String(v.vacancy_url || '').toLowerCase();
        return v.vacancy_status === 'needs_review'
          && !/(?:^|[\/_-])(?:privacy|policy|about|who-we-are|director(?:'s|s)?-message|executive-director-message|resources?|tenders?|news|blog|contact|career-guidance|jobs-app|register-your-interest|annual-report|financial-report|cookie|terms-and-conditions)(?:[\/_.?#-]|$)/.test(url)
          && !(/^(?:privacy policy|jobs app privacy policy|about(?: us)?|who we are|director(?:'s|s)? message|executive director message|resources?|tenders?|news|blog|contact|career guidance|register your interest|vacancy page from official sitemap|careers?|jobs?|career opportunities|job opportunities|terms(?: and conditions)?|cookie policy)$/i.test(title) || /director(?:'s|s)?\s+message|message from.{0,20}director|privacy policy|jobs app privacy policy|register your interest/i.test(title))
          && title.length >= 6 && title.length <= 120
          && (/\b(assistant|officer|manager|engineer|specialist|coordinator|director|accountant|teacher|driver|clerk|technician|supervisor|analyst|intern|consultant|guard|nurse|team leader|cashier|operator|advisor|adviser|enumerator|surveyor|lecturer|professor|doctor|midwife|pharmacist|hr officer|human resources officer|it support officer)\b/i.test(title)
            || /(?:^|\s)(?:انجینیر|داکتر|تکنیشن|افسر|سکرتر|معلم|استاد|نرس|قابله|فارمسست|حسابدار|مشاور)(?:\s|$)|(?:بست خالي|اعلان وظیفه|اعلان کاریابی|فرصت شغلی|کارشناس(?:ی)?|کارمند اداری)/.test(title));
      }).length;
      localStorage.removeItem(hiringScanStorageKey);
      hiringProgressText.textContent = 'Approved organization scan completed: ' + hiringTotal + ' / ' + hiringTotal + ' eligible organizations checked. This is not proof that every employer’s own careers site was inspected. ' + confirmed + ' organizations have date-verified current vacancies. ' + state.discovered + ' vacancy pages/posts were found during this scan; ' + state.current + ' were date-verified current. ' + possible + ' saved announcements still need review. ' + state.unreachable + ' websites could not be reached or blocked automated access. Open each result to inspect its official source. Expired and undated announcements are not counted as current hiring.';
    } catch (error) {
      saveHiringScanState(state);
      hiringProgress.value = offset;
      hiringProgressText.textContent = 'Scan paused at ' + offset + ' / ' + hiringTotal + '. ' + (error.message || 'Please try again.') + ' Your progress is saved; press Find Jobs Opportunities to continue from here.';
    } finally {
      running = false;
      filterButtons[1].disabled = false;
    }
  };

  runBtn.addEventListener('click', async () => {
    if (running || !client) return;
    if (nextOffset >= total) {
      nextOffset = 0;
      progress.value = 0;
    }
    running = true;
    runBtn.disabled = true;
    try {
      while (nextOffset < total) {
        progressText.textContent = 'Checking organizations ' + (nextOffset + 1) + '–' + Math.min(nextOffset + 15, total) + ' of ' + total + '…';
        const { data, error } = await client.functions.invoke('check-organization-sites', {
          body: { offset: nextOffset, limit: 15 }
        });
        if (error) throw error;
        if (!data || data.error) throw new Error(data?.error || 'The site-check service returned no result.');
        nextOffset = data.next_offset;
        progress.max = total || 1;
        progress.value = nextOffset;
        progressText.textContent = nextOffset + ' / ' + total + ' organizations checked · ' + data.checked_urls + ' URLs in this batch.';
        if (data.done) break;
        if (!data.checked_organizations) throw new Error('The checker made no progress. Please retry.');
      }
      await loadChecks();
      progressText.textContent = 'Completed: ' + nextOffset + ' / ' + total + ' organizations checked. Results are saved.';
      runBtn.textContent = 'Check all websites again';
    } catch (error) {
      progressText.textContent = 'Paused at ' + nextOffset + ' / ' + total + '. ' + (error.message || 'Please try again.');
      runBtn.textContent = 'Continue checking';
    } finally {
      running = false;
      runBtn.disabled = false;
    }
  });

  getClient().then(async (supabaseClient) => {
    client = supabaseClient;
    const [{ count, error: countError }] = await Promise.all([
      client.from('organization_candidates').select('id', { count: 'exact', head: true })
    ]);
    if (countError) throw countError;
    organizations = await fetchAllRows(() => client.from('organization_candidates')
      .select('id,organization_name,official_website,careers_url,evidence_url,verification_status,verification_evidence_url,verified_at,hiring_status,hiring_evidence_url,last_hiring_checked_at,collection_permission_status,sector,notes,last_reviewed_at')
      .order('organization_name'));
    total = count || organizations.length;
    const { count: eligibleCount, error: eligibleError } = await client.from('organization_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'verified')
      .eq('collection_permission_status', 'allowed')
      .or('official_website.not.is.null,careers_url.not.is.null');
    if (eligibleError) throw eligibleError;
    hiringTotal = eligibleCount || 0;
    status.textContent = total + ' organizations in the discovery registry · ' + hiringTotal + ' approved for job scanning';
    progress.max = total || 1;
    await loadChecks();
    await loadVacancies();
    renderOrganizations();
    await loadSocialDiscovery();
    const checkedCount = checks.filter((item) => item.check_type === 'official_website').length;
    progress.value = checkedCount;
    if (checkedCount >= total) {
      progressText.textContent = 'Completed: ' + checkedCount + ' / ' + total + ' official websites checked. Results are saved.';
      runBtn.textContent = 'Check all websites again';
    } else {
      progressText.textContent = checkedCount + ' / ' + total + ' official websites have a saved check. Press the button to check all organizations.';
    }
  }).catch((error) => {
    status.textContent = 'Could not load the organization registry: ' + (error.message || 'Please sign in and try again.');
    runBtn.disabled = true;
  });

  return root;
}
