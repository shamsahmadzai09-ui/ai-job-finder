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
  const email = authField('Email address', 'email', 'Enter your email', 'email');
  const password = authField('Password', 'password', 'Enter your password', 'current-password');
  const message = el('p', { class: 'muted', 'aria-live': 'polite' });
  const login = el('button', { class: 'btn primary', type: 'button', text: 'Log in' });
  login.addEventListener('click', async () => {
    message.textContent = '';
    if (!email.input.value.trim() || !password.input.value) { message.textContent = 'Enter your email and password.'; return; }
    login.disabled = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.input.value.trim(), password: password.input.value });
      if (error) throw error;
      currentUser = data.user;
      if (!localStorage.getItem('ajf-onboarding-' + currentUser.id)) localStorage.setItem('ajf-onboarding-' + currentUser.id, 'pending');
      location.hash = localStorage.getItem('ajf-onboarding-' + currentUser.id) === 'pending' ? '#/welcome' : '#/';
      render();
    } catch (error) { message.textContent = error.message || 'Login failed. Check your email and password.'; }
    finally { login.disabled = false; }
  });
  const signupLink = el('a', { href: '#/signup', text: 'Create a new account' });
  const forgotLink = el('a', { href: '#/forgot-password', text: 'Forgot your password?' });
  authCard('Log in', 'Sign in to continue to your AI Job Finder account.', [email.node, password.node], [login],
    el('div', { class: 'auth-links' }, forgotLink, signupLink, message));
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
function showWelcomePage() {
  const goProfile = el('button', { class: 'btn primary', type: 'button', text: 'Complete my profile now' });
  const signOut = el('button', { class: 'btn', type: 'button', text: 'Sign out' });
  goProfile.addEventListener('click', () => { localStorage.setItem('ajf-onboarding-' + currentUser.id, 'started'); location.hash = '#/profile'; render(); });
  signOut.addEventListener('click', async () => { const { error } = await supabase.auth.signOut(); if (error) toast(error.message); });
  $('main').replaceChildren(el('section', { class: 'card welcome-card' },
    el('span', { class: 'badge ok', text: 'Welcome' }),
    el('h1', { text: 'Welcome to AI Job Finder!' }),
    el('p', { text: 'To get started, please complete your profile as soon as possible.' }),
    el('p', { class: 'muted', text: 'Add your personal information, education, skills, languages, and work experience. The more complete and accurate your profile is, the better the app can identify suitable vacancies and prepare a professional CV based on your real information.' }),
    el('p', { class: 'muted', text: 'You can update your profile whenever you learn a new skill, complete a course, or gain new experience.' }),
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
    if (base === '/signup') showSignupPage();
    else if (base === '/forgot-password') showForgotPasswordPage();
    else showLoginPage();
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
      if (event === 'SIGNED_OUT') { currentUser = null; recoveryMode = false; }
      else currentUser = session?.user || null;
      authReady = true;
      render();
    });
    render();
  } catch (error) {
    authReady = true;
    $('main').replaceChildren(el('section', { class: 'card empty' },
      el('h2', { text: 'Connection unavailable' }),
      el('p', { text: 'The account service could not be reached. Please check your internet connection and try again.' }),
      el('p', { class: 'muted', text: error.message || '' })));
  }
}
init();
