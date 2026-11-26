// Page renderers. Phase 1 pages are honest placeholders: they describe what arrives in which
// phase, show only real data (configuration and PWA status), and contain no buttons that do nothing.

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
export function dashboardPage() {
  const stats = [
    ['Jobs discovered', 'Phase 3'],
    ['Excellent matches', 'Phase 3'],
    ['Applications prepared', 'Phase 4'],
    ['Applications submitted', 'Phase 5'],
    ['Interviews received', 'Phase 5']
  ];
  const phases = [
    ['Phase 1', 'Foundation, PWA shell, safe Supabase configuration', 'Complete', 'ok'],
    ['Phase 2', 'Database, Row Level Security, login, editable profile', 'Current', 'primary'],
    ['Phase 3', 'Job sources, duplicate detection, AI matching', 'Planned', ''],
    ['Phase 4', 'Groq CV and cover letters, PDF export', 'Planned', ''],
    ['Phase 5', 'Gmail OAuth, approval-based sending, tracker', 'Planned', ''],
    ['Phase 6', 'Scheduled searches, notifications, security testing', 'Planned', '']
  ];
  const status = getConfigStatus();

  return el('div', {},
    pageHead('Dashboard', 'Your job-search overview for opportunities across Afghanistan. Numbers appear only when real data exists.'),
    el('div', { class: 'grid-stats' },
      stats.map(([label, phase]) => el('div', { class: 'stat' },
        el('div', { class: 'stat-label', text: label }),
        el('div', { class: 'stat-value', text: '–' }),
        el('div', { class: 'stat-note', text: `Available in ${phase}` })
      ))
    ),
    el('div', { class: 'grid-2' },
      el('section', { class: 'card' },
        el('h2', { text: 'Build progress' }),
        el('ul', { class: 'roadmap' },
          phases.map(([name, desc, state, cls]) => el('li', {},
            el('span', { class: `badge ${cls}`, text: state }),
            el('span', {}, el('strong', { text: `${name}: ` }), desc)
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
          el('dd', { text: 'None connected yet (Phase 3).' })
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
    el('h2', { text: 'Active vacancies' }),
    status,
    list
  );
  const root = el('div', {},
    pageHead('Job Search', 'Find job opportunities across Afghanistan. Every listing keeps its original source and application link.'),
    panel
  );

  getClient().then(async (client) => {
    const { data, error } = await client.from('jobs')
      .select('id,title,organization,location_text,province,deadline,source_listing_url,original_url,application_method,application_url,verification_status,posted_at,job_sources(name)')
      .eq('status', 'active')
      .order('posted_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!data?.length) {
      status.textContent = 'No active vacancies have been imported yet. The source registry is ready; automatic collection will start after permitted feeds or APIs are confirmed.';
      return;
    }
    status.textContent = data.length + ' active vacancies';
    list.replaceChildren(...data.map((job) => {
      const target = job.original_url || job.source_listing_url;
      const sourceName = job.job_sources?.name || 'Original source';
      const details = [
        job.location_text || job.province || 'Afghanistan',
        job.deadline ? 'Deadline: ' + job.deadline : '',
        'Source: ' + sourceName
      ].filter(Boolean).join(' · ');
      return el('article', { class: 'card' },
        el('h3', { text: job.title }),
        el('p', { class: 'muted', text: job.organization }),
        el('p', { class: 'detail', text: details }),
        el('span', { class: 'badge ok', text: job.verification_status === 'employer_confirmed' ? 'Employer confirmed' : 'Source confirmed' }),
        el('p', {}, el('a', { href: target, target: '_blank', rel: 'noopener noreferrer', text: 'Open original vacancy' }))
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

export function recommendedPage() {
  return el('div', {},
    pageHead('Recommended Jobs', 'See Afghan vacancies ranked against your own profile: Excellent (85–100) and Possible (70–84).'),
    emptyState({
      iconName: 'star',
      title: 'Nothing to recommend yet',
      text: 'Each job will be scored against your real profile with an explanation and a list of missing requirements. A high score never overrides a mandatory eligibility requirement.',
      phase: 'Arrives in Phase 3'
    })
  );
}

export function jobDetailsPage(param) {
  return el('div', {},
    pageHead('Job Details', 'Requirements, match explanation, eligibility, and application method.'),
    emptyState({
      iconName: 'briefcase',
      title: param ? 'Job not found' : 'No job selected',
      text: param
        ? 'There are no stored jobs yet, so this job cannot be shown.'
        : 'Open a job from Recommended Jobs or Job Search to see its details here.',
      phase: 'Arrives in Phase 3'
    })
  );
}

export function documentsPage() {
  return el('div', {},
    pageHead('CV & Cover Letter', 'Tailored documents built only from facts in your profile.'),
    emptyState({
      iconName: 'file',
      title: 'No documents yet',
      text: 'Phase 4 adds Groq-powered drafting through a secure Edge Function, editing before saving, PDF export, and private storage. Nothing will be invented: no jobs, certificates, or achievements you have not provided.',
      phase: 'Arrives in Phase 4'
    })
  );
}

export function emailPage() {
  return el('div', {},
    pageHead('Email Center', 'Recruitment emails from your connected Gmail account.'),
    emptyState({
      iconName: 'mail',
      title: 'Gmail is not connected',
      text: 'Phase 5 adds Google OAuth with minimal permissions. Emails are never sent without you reviewing the recipient, subject, full message, and attachments and approving it.',
      phase: 'Arrives in Phase 5'
    })
  );
}

export function trackerPage() {
  return el('div', {},
    pageHead('Applications', 'Track every application from saved to interview.'),
    emptyState({
      iconName: 'tracker',
      title: 'No applications tracked',
      text: 'An application is marked Submitted only after reliable confirmation, never just because you clicked something.',
      phase: 'Arrives in Phase 5'
    })
  );
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

  const cv = el('section', { class: 'card profile-section' },
    el('h2', { text: '6. CV builder' }),
    el('p', { class: 'muted', text: 'After secure profile storage is connected, the app will use your information to create a professional CV, tailor a CV for a selected vacancy, prepare a matching cover letter, flag missing information, and export a PDF.' }),
    el('span', { class: 'badge primary', text: 'Planned for Phase 4' })
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
  const hiringProgressText = el('p', { class: 'muted', text: 'Click Scan all organizations to run a complete review of every registered organization.', 'aria-live': 'polite' });
  const list = el('div', { class: 'grid-2' });
  const vacancyPanel = el('div', { class: 'grid-2 vacancy-panel' });
  let hiringFilter = 'needs_review';
  const filterButtons = [
    ['needs_review', 'Needs hiring review'],
    ['hiring', 'Scan all organizations'],
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
      el('p', { class: 'muted', text: 'Click “Scan all organizations” to review every registered official website and saved Careers page in batches. The scanner checks same-domain sitemaps and vacancy-related PDF links, reads structured JobPosting data, follows relevant vacancy links, and respects robots.txt. PDF links and posts without reliable dates are flagged for review, not counted as confirmed current jobs. Blocked or unreachable sites remain Unknown.' })
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
  let running = false;

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
    const expiredVacancies = visibleVacancies.filter((v) => v.vacancy_status === 'expired').length;
    hiringSummary.textContent = hiringCount + ' organizations currently hiring · ' + confirmedVacancies + ' date-verified current vacancies · ' + reviewVacancies + ' potential job announcements needing review · ' + expiredVacancies + ' expired job announcements · ' + reviewCount + ' organizations need evidence (' + organizations.length + ' total).';
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

  const loadVacancies = async () => {
    vacancies = await fetchAllRows(() => client.from('organization_vacancies')
      .select('organization_id,job_title,vacancy_url,source_page_url,date_posted,valid_through,vacancy_status,employment_type,location_text,last_seen_at')
      .order('last_seen_at', { ascending: false }));
  };

  const loadChecks = async () => {
    checks = await fetchAllRows(() => client.from('organization_site_checks')
      .select('organization_id,check_type,url,result_status,http_status,final_url,error_message,checked_at'));
    renderOrganizations();
  };

  const scanHiring = async () => {
    if (running || !client) return;
    running = true;
    hiringFilter = 'hiring';
    filterButtons[1].disabled = true;
    hiringProgress.hidden = false;
    hiringProgress.max = total || 1;
    hiringProgress.value = 0;
    try {
      let offset = 0;
      while (offset < total) {
        hiringProgressText.textContent = 'Scanning official careers pages: ' + (offset + 1) + '–' + Math.min(offset + 20, total) + ' of ' + total + ' organizations…';
        const { data, error } = await client.functions.invoke('scan-current-hiring', { body: { offset, limit: 20, force: true } });
        if (error) throw error;
        if (!data || data.error) throw new Error(data?.error || 'The vacancy scanner returned no result.');
        offset = data.next_offset;
        hiringProgress.value = offset;
        const found = (data.results || []).reduce((n, row) => n + (row.found || 0), 0);
        const current = (data.results || []).reduce((n, row) => n + (row.current || 0), 0);
        const cached = (data.results || []).filter((row) => row.cached).length;
        const failed = (data.results || []).filter((row) => row.error).length;
        hiringProgressText.textContent = offset + ' / ' + total + ' organizations processed · ' + found + ' vacancy links / posts discovered in this batch · ' + current + ' date-verified current · ' + cached + ' recent results reused · ' + failed + ' sites need review.';
        if (data.done) break;
        if (!data.scanned_organizations) throw new Error('The scanner made no progress.');
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
      hiringProgressText.textContent = 'Completed: ' + total + ' / ' + total + ' organizations processed. ' + confirmed + ' organizations have date-verified current vacancies. ' + possible + ' potential announcements need review. Click a vacancy to inspect the employer source. Recent scans were reused for six hours. Expired and undated announcements are not counted as hiring.';
    } catch (error) {
      hiringProgressText.textContent = 'Scan paused. ' + (error.message || 'Please try again.');
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
    status.textContent = total + ' organizations in the discovery registry';
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
