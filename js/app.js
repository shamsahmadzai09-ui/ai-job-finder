// App shell with separate sign-up, sign-in, password recovery, and onboarding.
import { el, icon, toast } from './ui.js';
import { CONFIG } from './config.js';
import { initPwa } from './pwa.js';
import { getClient } from './supabase-client.js';
import * as pages from './pages.js';

const routes = [
  { path: '/', title: 'Dashboard', icon: 'dashboard', nav: true, render: pages.dashboardPage },
  { path: '/search', title: 'Job Search', icon: 'search', nav: true, render: pages.jobSearchPage },
  { path: '/recommended', title: 'Recommended', icon: 'star', nav: true, render: pages.recommendedPage },
  { path: '/job', title: 'Job Details', icon: 'briefcase', nav: false, render: pages.jobDetailsPage },
  { path: '/profile', title: 'My Profile', icon: 'user', nav: true, render: pages.profilePage },
  { path: '/documents', title: 'CV & Cover Letter', icon: 'file', nav: true, render: pages.documentsPage },
  { path: '/email', title: 'Email Center', icon: 'mail', nav: true, render: pages.emailPage },
  { path: '/tracker', title: 'Applications', icon: 'tracker', nav: true, render: pages.trackerPage },
  { path: '/settings', title: 'Settings', icon: 'settings', nav: true, render: pages.settingsPage }
];

const $ = (id) => document.getElementById(id);
let supabase = null;
let currentUser = null;
let authReady = false;
let recoveryMode = false;
let profileReminderTimer = null;
let profileCheckRunning = false;
let profileReminderVisible = false;

function parseHash() {
  const raw = (location.hash || '#/').slice(1) || '/';
  const [pathPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const base = '/' + (segments[0] || '');
  return { base: base === '/' ? '/' : base, param: segments[1] ? decodeURIComponent(segments[1]) : null };
}
function buildSidebar() {
  const sidebar = $('sidebar');
  const nav = el('ul', { class: 'nav' }, routes.filter((r) => r.nav).map((r) => el('li', {},
    el('a', { href: `#${r.path}`, 'data-path': r.path }, icon(r.icon), el('span', { text: r.title }))
  )));
  sidebar.replaceChildren(
    el('div', { class: 'brand' }, el('img', { class: 'brand-logo', src: './icons/icon-192.png', alt: '', width: '34', height: '34' }),
      el('div', {}, el('div', { class: 'brand-name', text: CONFIG.APP_NAME }), el('div', { class: 'brand-sub', text: 'Jobs across Afghanistan' }))),
    el('nav', { 'aria-label': 'Main' }, nav),
    el('div', { class: 'sidebar-foot', text: `v${CONFIG.APP_VERSION}` })
  );
}
function setNavOpen(open) {
  document.body.classList.toggle('nav-open', open);
  $('backdrop').hidden = !open;
  $('menu-btn').setAttribute('aria-expanded', String(open));
  $('menu-btn').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}
function updatePill() {
  const info = pages.configPillInfo();
  $('config-pill').className = `pill ${info.cls}`;
  $('config-pill').textContent = `Supabase: ${info.text}`;
}
function authCard(title, description, fields, buttons, footer) {
  $('main').replaceChildren(el('section', { class: 'card auth-card' },
    el('div', { class: 'brand-name', text: CONFIG.APP_NAME }),
    el('h1', { text: title }),
    el('p', { class: 'muted', text: description }),
    el('div', { class: 'profile-fields' }, ...fields),
    el('div', { class: 'btn-row' }, ...buttons),
    footer
  ));
  $('topbar-title').textContent = title;
  document.title = title + ' · ' + CONFIG.APP_NAME;
}
function authField(label, type, placeholder, autocomplete) {
  const input = el('input', { type, placeholder, autocomplete, required: true });
  return { input, node: el('label', { class: 'profile-field' }, el('span', { text: label }), input) };
}
function showLoginPage() {
  const message = el('p', { class: 'muted', 'aria-live': 'polite' });
  const login = el('button', { class: 'btn primary', type: 'button', text: 'Continue with Google' });
  login.addEventListener('click', async () => {
    message.textContent = '';
    login.disabled = true;
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
    } catch (error) {
      message.textContent = error.message || 'Google sign-in could not be started.';
      login.disabled = false;
    }
  });
  authCard('Sign in with Google', 'Use your Google account to create an account or securely sign in to AI Job Finder.', [],
    [login],
    el('div', { class: 'auth-links' },
      el('p', { class: 'muted', text: 'The first Google sign-in creates your account automatically. No email confirmation code is needed.' }),
      message));
}
function showSignupPage() {
  const email = authField('Email address', 'email', 'Enter your email', 'email');
  const password = authField('Create password', 'password', 'At least 8 characters', 'new-password');
  const confirm = authField('Confirm password', 'password', 'Enter the password again', 'new-password');
  const message = el('p', { class: 'muted', 'aria-live': 'polite' });
  const create = el('button', { class: 'btn primary', type: 'button', text: 'Create account' });
  create.addEventListener('click', async () => {
    message.textContent = '';
    if (!email.input.value.trim() || password.input.value.length < 8) { message.textContent = 'Enter a valid email and a password with at least 8 characters.'; return; }
    if (password.input.value !== confirm.input.value) { message.textContent = 'The passwords do not match.'; return; }
    create.disabled = true;
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.input.value.trim(), password: password.input.value,
        options: { emailRedirectTo: window.location.origin + window.location.pathname } });
      if (error) throw error;
      if (data.session && data.user) {
        currentUser = data.user;
        localStorage.setItem('ajf-onboarding-' + currentUser.id, 'pending');
        location.hash = '#/welcome';
        render();
      } else {
        message.textContent = 'Account created. Check your email to confirm it, then use the Log in page.';
      }
    } catch (error) { message.textContent = error.message || 'Could not create account.'; }
    finally { create.disabled = false; }
  });
  authCard('Create account', 'Register a new account to start finding suitable jobs in Afghanistan.', [email.node, password.node, confirm.node], [create],
    el('div', { class: 'auth-links' }, el('a', { href: '#/login', text: 'Already have an account? Log in' }), message));
}
function showForgotPasswordPage() {
  const email = authField('Account email address', 'email', 'Enter the email used for your account', 'email');
  const message = el('p', { class: 'muted', 'aria-live': 'polite' });
  const send = el('button', { class: 'btn primary', type: 'button', text: 'Send password reset link' });
  send.addEventListener('click', async () => {
    message.textContent = '';
    if (!email.input.value.trim()) { message.textContent = 'Enter your account email address.'; return; }
    send.disabled = true;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.input.value.trim(), {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      message.textContent = 'If an account exists for this email, a password reset link has been sent. Check your inbox.';
    } catch (error) { message.textContent = error.message || 'Could not send the reset email.'; }
    finally { send.disabled = false; }
  });
  authCard('Reset password', 'Enter your account email. We will send you a secure password reset link.', [email.node], [send],
    el('div', { class: 'auth-links' }, el('a', { href: '#/login', text: 'Back to Log in' }), message));
}
function showNewPasswordPage() {
  const password = authField('New password', 'password', 'At least 8 characters', 'new-password');
  const confirm = authField('Confirm new password', 'password', 'Enter the new password again', 'new-password');
  const message = el('p', { class: 'muted', 'aria-live': 'polite' });
  const save = el('button', { class: 'btn primary', type: 'button', text: 'Save new password' });
  save.addEventListener('click', async () => {
    message.textContent = '';
    if (password.input.value.length < 8) { message.textContent = 'Password must be at least 8 characters.'; return; }
    if (password.input.value !== confirm.input.value) { message.textContent = 'The passwords do not match.'; return; }
    save.disabled = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: password.input.value });
      if (error) throw error;
      recoveryMode = false;
      message.textContent = 'Your password has been updated. You can now continue to your account.';
      setTimeout(() => { location.hash = '#/'; render(); }, 900);
    } catch (error) { message.textContent = error.message || 'Could not update password. Request a new reset link.'; }
    finally { save.disabled = false; }
  });
  authCard('Choose a new password', 'Create a new password for your account.', [password.node, confirm.node], [save],
    el('div', { class: 'auth-links' }, message));
}
async function hasMeaningfulProfile(user) {
  if (!user || !supabase) return false;
  const { data: profile, error } = await supabase.from('profiles')
    .select('first_name,last_name,father_name,birth_date,origin_province,current_province,current_address,phone,contact_email')
    .eq('id', user.id).maybeSingle();
  if (error) throw error;
  const profileHasData = !!profile && Object.values(profile).some((value) =>
    value !== null && value !== undefined && String(value).trim() !== ''
  );
  if (profileHasData) return true;
  const { count, error: itemsError } = await supabase.from('profile_items')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if (itemsError) throw itemsError;
  return (count || 0) > 0;
}

async function checkProfileAndRemind() {
  if (!currentUser || profileCheckRunning) return;
  profileCheckRunning = true;
  try {
    const complete = await hasMeaningfulProfile(currentUser);
    if (complete) {
      localStorage.setItem('ajf-onboarding-' + currentUser.id, 'complete');
      return;
    }
    showProfileReminder();
  } catch (error) {
    console.warn('Profile completion check failed:', error?.message);
  } finally {
    profileCheckRunning = false;
  }
}

function showProfileReminder() {
  if (profileReminderVisible) return;
  profileReminderVisible = true;
  const overlay = el('div', { class: 'profile-reminder-overlay' });
  const close = () => { overlay.remove(); profileReminderVisible = false; };
  const closeButton = el('button', { class: 'profile-reminder-close', type: 'button', 'aria-label': 'Close reminder', text: '×' });
  closeButton.addEventListener('click', close);

  const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  art.setAttribute('viewBox', '0 0 320 190');
  art.setAttribute('class', 'profile-reminder-art');
  art.setAttribute('role', 'img');
  art.setAttribute('aria-label', 'Arrow pointing toward the profile');
  const shapes = [
    ['circle', { cx: '160', cy: '92', r: '76', fill: '#dbeafe' }],
    ['rect', { x: '108', y: '34', width: '104', height: '128', rx: '18', fill: '#ffffff', stroke: '#a5b4fc', 'stroke-width': '2' }],
    ['circle', { cx: '160', cy: '76', r: '22', fill: '#4f46e5' }],
    ['path', { d: 'M124 134c4-22 18-33 36-33s32 11 36 33', fill: '#bfdbfe' }],
    ['path', { d: 'M24 105h63c19 0 25-16 25-31V58m-17 17 17-18 17 18', fill: 'none', stroke: '#4f46e5', 'stroke-width': '7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['path', { d: 'M228 116h54m-15-17 18 17-18 17', fill: 'none', stroke: '#16a34a', 'stroke-width': '6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['circle', { cx: '45', cy: '45', r: '7', fill: '#fbbf24' }],
    ['circle', { cx: '262', cy: '48', r: '5', fill: '#60a5fa' }]
  ];
  for (const [tag, attrs] of shapes) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
    art.append(shape);
  }

  const go = el('button', { class: 'btn primary profile-reminder-action', type: 'button', text: 'زما پروفایل ته لاړ شه  ←' });
  go.addEventListener('click', () => {
    close();
    location.hash = '#/profile';
    render();
  });
  const card = el('section', { class: 'profile-reminder-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'profile-reminder-title' },
    closeButton, art,
    el('span', { class: 'badge primary', text: 'AI JOB FINDER · ښه راغلاست' }),
    el('h2', { id: 'profile-reminder-title', text: 'خپل پروفایل بشپړ کړئ!' }),
    el('p', { class: 'profile-reminder-message', text: 'ستاسو پروفایل لا تر اوسه بشپړ شوی نه دی. مهرباني وکړئ ژر تر ژره خپل شخصي معلومات، زده کړې، مهارتونه او کاري تجربې ثبتې کړئ، ترڅو موږ ستاسو د مهارتونو او تحصیلي مخینې پر بنسټ درته مسلکي CV چمتو کړو او ستاسو له وړتیاوو سره سم د مناسبو دندو لپاره د غوښتنلیک په چمتو کولو کې مرسته وکړو.' }),
    el('p', { class: 'profile-reminder-note', text: 'د پروفایل تر ثبتېدو پورې به دا یادونه هر ۱۰ ثانیې وروسته بیا ښکاره کېږي.' }),
    go
  );
  overlay.append(card);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.body.append(overlay);
  go.focus();
}

function startProfileReminder(user) {
  if (profileReminderTimer) clearInterval(profileReminderTimer);
  if (!user) return;
  checkProfileAndRemind();
  profileReminderTimer = setInterval(checkProfileAndRemind, 10000);
}

function showWelcomePage() {
  const goProfile = el('button', { class: 'btn primary', type: 'button', text: 'Complete my profile now' });
  const signOut = el('button', { class: 'btn', type: 'button', text: 'Sign out' });
  goProfile.addEventListener('click', () => { localStorage.setItem('ajf-onboarding-' + currentUser.id, 'started'); location.hash = '#/profile'; render(); });
  signOut.addEventListener('click', async () => { const { error } = await supabase.auth.signOut(); if (error) toast(error.message); });
  $('main').replaceChildren(el('section', { class: 'card welcome-card' },
    el('span', { class: 'badge ok', text: 'Welcome' }),
    el('h1', { text: 'Welcome to AI Job Finder!' }),
    el('p', { text: 'ښه راغلاست! ستاسو پروفایل لا تر اوسه بشپړ شوی نه دی. مهرباني وکړئ خپل شخصي معلومات، زده کړې، مهارتونه او کاري تجربې ژر تر ژره ثبتې کړئ، ترڅو موږ ستاسو د مهارتونو او تحصیلي مخینې پر بنسټ مسلکي CV درته چمتو کړو او د مناسبو دندو لپاره د غوښتنلیک په چمتو کولو کې مرسته وکړو.' }),
    el('p', { class: 'muted', text: 'Please add your personal information, education, skills, languages, and work experience. Complete and accurate details help us identify suitable vacancies and prepare a professional CV based on your real information.' }),
    el('p', { class: 'muted', text: 'You can update your profile whenever you learn a new skill, complete a course, or gain new experience. You will review and approve application materials before anything is submitted.' }),
    el('div', { class: 'btn-row' }, goProfile, signOut)));
  $('topbar-title').textContent = 'Getting started';
  document.title = 'Getting started · ' + CONFIG.APP_NAME;
}
function mainReplace(node, route, base) {
  $('main').replaceChildren(node);
  $('topbar-title').textContent = route ? route.title : 'Not found';
  document.title = (route ? route.title : 'Not found') + ' · ' + CONFIG.APP_NAME;
  document.querySelectorAll('.nav a').forEach((a) => {
    const active = a.dataset.path === base || (base === '/job' && a.dataset.path === '/recommended');
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  setNavOpen(false);
  window.scrollTo(0, 0);
}
function render() {
  if (!authReady) { $('main').replaceChildren(el('p', { class: 'muted pad', text: 'Checking your account…' })); return; }
  if (!currentUser) {
    document.body.classList.add('auth-mode');
    $('sidebar').hidden = true; $('config-pill').hidden = true;
    const { base } = parseHash();
    showLoginPage();
    return;
  }
  document.body.classList.remove('auth-mode');
  $('sidebar').hidden = false; $('config-pill').hidden = false;
  const { base, param } = parseHash();
  if (recoveryMode || base === '/reset-password') { showNewPasswordPage(); return; }
  const onboarding = localStorage.getItem('ajf-onboarding-' + currentUser.id);
  if (onboarding === 'pending' && base !== '/profile' && base !== '/welcome') { location.hash = '#/welcome'; showWelcomePage(); return; }
  if (base === '/welcome') { showWelcomePage(); return; }
  if (base === '/profile' && onboarding === 'pending') localStorage.setItem('ajf-onboarding-' + currentUser.id, 'started');
  const route = routes.find((r) => r.path === base);
  let node;
  try { node = route ? route.render(param) : pages.notFoundPage(); }
  catch (err) { console.error('Page render failed:', err?.message); node = el('section', { class: 'card empty' }, el('h2', { text: 'Something went wrong' }), el('p', { text: 'This page failed to load. Reload the app and try again.' })); }
  mainReplace(node, route, base);
}
async function init() {
  buildSidebar();
  $('menu-btn').replaceChildren(icon('menu'));
  $('menu-btn').addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  $('backdrop').addEventListener('click', () => setNavOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNavOpen(false); });
  updatePill();
  initPwa({ onOnlineChange: (online) => { $('offline-banner').hidden = online; } });
  window.addEventListener('hashchange', render);
  window.addEventListener('unhandledrejection', () => toast('Something went wrong. Please try again.'));
  try {
    supabase = await getClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
    authReady = true;
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveryMode = true;
      if (event === 'SIGNED_OUT') {
        currentUser = null; recoveryMode = false;
        if (profileReminderTimer) clearInterval(profileReminderTimer);
        profileReminderTimer = null;
      } else currentUser = session?.user || null;
      authReady = true;
      render();
      if (currentUser) startProfileReminder(currentUser);
    });
    render();
    if (currentUser) startProfileReminder(currentUser);
  } catch (error) {
    authReady = true;
    $('main').replaceChildren(el('section', { class: 'card empty' },
      el('h2', { text: 'Connection unavailable' }),
      el('p', { text: 'The account service could not be reached. Please check your internet connection and try again.' }),
      el('p', { class: 'muted', text: error.message || '' })));
  }
}
init();
