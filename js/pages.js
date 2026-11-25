// Page renderers. Phase 1 pages are honest placeholders: they describe what arrives in which
// phase, show only real data (configuration and PWA status), and contain no buttons that do nothing.

import { el, emptyState, pageHead } from './ui.js';
import { CONFIG } from './config.js';
import { getConfigStatus, testConnection } from './supabase-client.js';
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
    ['Phase 1', 'Foundation, PWA shell, safe Supabase configuration', 'Current', 'ok'],
    ['Phase 2', 'Database, Row Level Security, login, editable profile', 'Next', 'primary'],
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
          el('dd', { text: 'Not available yet (Phase 2).' }),
          el('dt', { text: 'Job sources' }),
          el('dd', { text: 'None connected yet (Phase 3).' })
        ),
        el('p', { class: 'muted', text: 'Open Settings to run a real connection test once js/config.js is filled in.' })
      )
    )
  );
}

// ---------------------------------------------------------------- Placeholders
export function jobSearchPage() {
  return el('div', {},
    pageHead('Job Search', 'Find verified job opportunities across Afghanistan, with filters for province, city, sector, and work type.'),
    emptyState({
      iconName: 'search',
      title: 'No job sources connected',
      text: 'Phase 3 will connect permitted Afghan job sources, including government, private-sector, NGO, and organization vacancy feeds. Jobs will be limited to locations inside Afghanistan. Each listing will link to its original source.',
      phase: 'Arrives in Phase 3'
    })
  );
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

// ---------------------------------------------------------------- Profile (profile builder UI; secure saving arrives with Phase 2)
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

  const saveNotice = el('div', { class: 'card profile-save-notice' },
    el('span', { class: 'badge warn', text: 'Secure saving not connected yet' }),
    el('h2', { text: 'Your profile form is ready for Phase 2' }),
    el('p', { class: 'muted', text: 'This public version displays the profile fields and lets you add or remove repeated entries, but it does not save personal information. Secure account sign-in, private Supabase storage, and per-user access rules must be connected before saving is enabled.' }),
    el('p', { class: 'muted', text: 'Do not enter real personal details into this version yet.' })
  );

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
    saveNotice
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
