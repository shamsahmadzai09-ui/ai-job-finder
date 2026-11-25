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
      .select('name,source_type,jobs_url,collection_method,permission_status,is_enabled,last_checked_at,notes')
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
        source.last_checked_at ? el('p', { class: 'muted', text: 'Last checked: ' + new Date(source.last_checked_at).toLocaleString() }) : null
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
  const list = el('div', { class: 'grid-2' });
  const root = el('div', {},
    pageHead('Organization Discovery', 'A growing directory of Afghan organizations. Organization identity, website availability, current hiring, and permission to collect vacancy data are tracked separately.'),
    el('section', { class: 'card' },
      el('h2', { text: 'Website availability checker' }),
      el('p', { class: 'muted', text: 'Check the official website and any saved careers page for every organization. Results are saved so you can review HTTP status codes and the time of the last check.' }),
      el('div', { class: 'btn-row' }, runBtn),
      progress,
      progressText,
      el('p', { class: 'muted', text: 'A reachable website does not prove legal registration, active hiring, or permission to collect vacancy data. Redirects, bot protection, and temporary server errors are reported separately.' })
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Discovered organizations' }),
      status,
      list
    ),
    el('section', { class: 'card' },
      el('h2', { text: 'Verification and collection rules' }),
      el('p', { class: 'muted', text: 'Organization identity verification does not mean the organization is currently hiring. Hiring is marked active only when supported by current vacancy evidence. Collection permission is a separate status and remains pending unless an approved feed, API, structured-data method, site terms, or written permission allows collection. Public visibility alone is not permission. This checker only tests website availability; it does not scrape or collect job listings.' })
    )
  );

  let client = null;
  let organizations = [];
  let checks = [];
  let nextOffset = 0;
  let total = 0;
  let running = false;

  const checkMap = () => new Map(checks.map((item) => [item.organization_id + ':' + item.check_type, item]));
  const describeCheck = (item) => {
    if (!item) return { text: 'Not checked yet', cls: 'muted' };
    const code = item.http_status ? ' · HTTP ' + item.http_status : '';
    const labels = {
      reachable: ['Website reachable', 'ok'],
      redirected: ['Redirect detected', 'warn'],
      not_found: ['Page not found', 'danger'],
      blocked: ['Blocked / bot protection', 'warn'],
      server_error: ['Server error', 'danger'],
      timeout: ['Timed out', 'warn'],
      invalid_url: ['Invalid or unsupported URL', 'danger'],
      http_error: ['HTTP response needs review', 'warn'],
      network_error: ['Network / TLS error', 'warn']
    };
    const value = labels[item.result_status] || ['Check completed', 'muted'];
    return { text: value[0] + code, cls: value[1], item };
  };

  const renderOrganizations = () => {
    const byKey = checkMap();
    list.replaceChildren(...organizations.map((org) => {
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
      const websiteCheck = describeCheck(byKey.get(org.id + ':official_website'));
      const careersCheck = describeCheck(byKey.get(org.id + ':careers'));
      const checkLine = (label, result) => el('p', { class: 'detail' },
        el('span', { class: 'badge ' + result.cls, text: label + ': ' + result.text }),
        result.item?.final_url ? el('span', { class: 'muted' }, ' → ', el('a', { href: result.item.final_url, target: '_blank', rel: 'noopener noreferrer', text: 'Redirect target' })) : null,
        result.item?.checked_at ? el('span', { class: 'muted', text: ' · ' + new Date(result.item.checked_at).toLocaleString() }) : null
      );
      return el('article', { class: 'card' },
        el('h3', { text: org.organization_name }),
        el('span', { class: 'badge ' + identityClass, text: identityState }),
        el('p', { class: 'detail' }, el('span', { class: 'badge ' + hiringClass, text: hiringState })),
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

  const loadChecks = async () => {
    const { data, error } = await client.from('organization_site_checks')
      .select('organization_id,check_type,url,result_status,http_status,final_url,error_message,checked_at');
    if (error) throw error;
    checks = data || [];
    renderOrganizations();
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
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      client.from('organization_candidates')
        .select('id,organization_name,official_website,careers_url,evidence_url,verification_status,verification_evidence_url,verified_at,hiring_status,hiring_evidence_url,last_hiring_checked_at,collection_permission_status,sector,notes,last_reviewed_at')
        .order('organization_name'),
      client.from('organization_candidates').select('id', { count: 'exact', head: true })
    ]);
    if (error) throw error;
    if (countError) throw countError;
    organizations = data || [];
    total = count || organizations.length;
    status.textContent = total + ' organizations in the discovery registry';
    progress.max = total || 1;
    await loadChecks();
    const checkedCount = checks.filter((item) => item.check_type === 'official_website').length;
    progress.value = checkedCount;
    progressText.textContent = checkedCount + ' / ' + total + ' official websites have a saved check. Press the button to check all organizations.';
  }).catch((error) => {
    status.textContent = 'Could not load the organization registry: ' + (error.message || 'Please sign in and try again.');
    runBtn.disabled = true;
  });

  return root;
}
