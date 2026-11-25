// App shell with authentication-first onboarding and hash routing.
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

function parseHash() {
  const raw = (location.hash || '#/').slice(1) || '/';
  const [pathPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const base = '/' + (segments[0] || '');
  return { base: base === '/' ? '/' : base, param: segments[1] ? decodeURIComponent(segments[1]) : null };
}

function buildSidebar() {
  const sidebar = $('sidebar');
  const nav = el('ul', { class: 'nav' },
    routes.filter((r) => r.nav).map((r) => el('li', {}, 
      el('a', { href: `#${r.path}`, 'data-path': r.path }, icon(r.icon), el('span', { text: r.title }))
    ))
  );
  sidebar.replaceChildren(
    el('div', { class: 'brand' },
      el('img', { class: 'brand-logo', src: './icons/icon-192.png', alt: '', width: '34', height: '34' }),
      el('div', {}, el('div', { class: 'brand-name', text: CONFIG.APP_NAME }), el('div', { class: 'brand-sub', text: 'Jobs across Afghanistan' }))
    ),
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
  const pill = $('config-pill');
  pill.className = `pill ${info.cls}`;
  pill.textContent = `Supabase: ${info.text}`;
}

function showAuthPage() {
  const main = $('main');
  const email = el('input', { type: 'email', placeholder: 'Email address', autocomplete: 'email', required: true });
  const password = el('input', { type: 'password', placeholder: 'Password (at least 8 characters)', autocomplete: 'current-password', required: true });
  const message = el('p', { class: 'muted', 'aria-live': 'polite' });
  const create = el('button', { class: 'btn primary', type: 'button', text: 'Create account' });
  const login = el('button', { class: 'btn', type: 'button', text: 'Sign in' });
  const actions = el('div', { class: 'btn-row' }, create, login);
  const runAuth = async (mode) => {
    message.textContent = '';
    if (!email.value.trim() || password.value.length < 8) {
      message.textContent = 'Please enter a valid email and a password with at least 8 characters.';
      return;
    }
    create.disabled = login.disabled = true;
    try {
      const credentials = { email: email.value.trim(), password: password.value };
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
        if (data.session && data.user) {
          currentUser = data.user;
          localStorage.setItem('ajf-onboarding-' + currentUser.id, 'pending');
          location.hash = '#/welcome';
          render();
        } else {
          message.textContent = 'Your account has been created. Please check your email, confirm your address, then sign in here.';
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword(credentials);
        if (error) throw error;
        currentUser = data.user;
        if (!localStorage.getItem('ajf-onboarding-' + currentUser.id)) {
          localStorage.setItem('ajf-onboarding-' + currentUser.id, 'pending');
        }
        location.hash = localStorage.getItem('ajf-onboarding-' + currentUser.id) === 'pending' ? '#/welcome' : '#/';
        render();
      }
    } catch (error) {
      message.textContent = error.message || 'Could not complete account action. Please try again.';
    } finally {
      create.disabled = login.disabled = false;
    }
  };
  create.addEventListener('click', () => runAuth('signup'));
  login.addEventListener('click', () => runAuth('signin'));
  main.replaceChildren(
    el('section', { class: 'card auth-card' },
      el('div', { class: 'brand-name', text: CONFIG.APP_NAME }),
      el('h1', { text: 'Welcome to AI Job Finder' }),
      el('p', { class: 'muted', text: 'Create your account or sign in to find suitable job opportunities across Afghanistan and build your professional CV.' }),
      el('div', { class: 'profile-fields' },
        el('label', { class: 'profile-field' }, el('span', { text: 'Email address' }), email),
        el('label', { class: 'profile-field' }, el('span', { text: 'Password' }), password)
      ),
      actions,
      message
    )
  );
  document.title = 'Sign in · ' + CONFIG.APP_NAME;
  $('topbar-title').textContent = 'Welcome';
}

function showWelcomePage() {
  const main = $('main');
  const goProfile = el('button', { class: 'btn primary', type: 'button', text: 'Complete my profile now' });
  const signOut = el('button', { class: 'btn', type: 'button', text: 'Sign out' });
  goProfile.addEventListener('click', () => {
    localStorage.setItem('ajf-onboarding-' + currentUser.id, 'started');
    location.hash = '#/profile';
    render();
  });
  signOut.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast(error.message);
  });
  main.replaceChildren(
    el('section', { class: 'card welcome-card' },
      el('span', { class: 'badge ok', text: 'Welcome' }),
      el('h1', { text: 'Welcome to AI Job Finder!' }),
      el('p', { text: 'To get started, please complete your profile as soon as possible.' }),
      el('p', { class: 'muted', text: 'Add your personal information, education, skills, languages, and work experience. The more complete and accurate your profile is, the better the app can identify suitable vacancies and prepare a professional CV based on your real information.' }),
      el('p', { class: 'muted', text: 'You can update your profile whenever you learn a new skill, complete a course, or gain new experience.' }),
      el('div', { class: 'btn-row' }, goProfile, signOut)
    )
  );
  document.title = 'Getting started · ' + CONFIG.APP_NAME;
  $('topbar-title').textContent = 'Getting started';
}

function render() {
  if (!authReady) {
    $('main').replaceChildren(el('p', { class: 'muted pad', text: 'Checking your account…' }));
    return;
  }
  if (!currentUser) {
    document.body.classList.add('auth-mode');
    $('sidebar').hidden = true;
    $('topbar-title').textContent = 'Welcome';
    $('config-pill').hidden = true;
    showAuthPage();
    return;
  }
  $('sidebar').hidden = false;
  $('config-pill').hidden = false;
  const { base, param } = parseHash();
  const onboarding = localStorage.getItem('ajf-onboarding-' + currentUser.id);
  if (onboarding === 'pending' && base !== '/profile' && base !== '/welcome') {
    location.hash = '#/welcome';
    showWelcomePage();
    return;
  }
  if (base === '/welcome') {
    showWelcomePage();
    return;
  }
  if (base === '/profile' && onboarding === 'pending') {
    localStorage.setItem('ajf-onboarding-' + currentUser.id, 'started');
  }
  const route = routes.find((r) => r.path === base);
  let node;
  try {
    node = route ? route.render(param) : pages.notFoundPage();
  } catch (err) {
    console.error('Page render failed:', err?.message);
    node = el('section', { class: 'card empty' },
      el('h2', { text: 'Something went wrong' }),
      el('p', { text: 'This page failed to load. Reload the app and try again.' })
    );
  }
  mainReplace(node, route, base);
}

function mainReplace(node, route, base) {
  $('main').replaceChildren(node);
  const title = route ? route.title : 'Not found';
  document.title = `${title} · ${CONFIG.APP_NAME}`;
  $('topbar-title').textContent = title;
  document.querySelectorAll('.nav a').forEach((a) => {
    const active = a.dataset.path === base || (base === '/job' && a.dataset.path === '/recommended');
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  setNavOpen(false);
  window.scrollTo(0, 0);
  document.getElementById('page-title')?.focus({ preventScroll: true });
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
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      authReady = true;
      render();
    });
    render();
  } catch (error) {
    authReady = true;
    $('main').replaceChildren(el('section', { class: 'card empty' },
      el('h2', { text: 'Connection unavailable' }),
      el('p', { text: 'The account service could not be reached. Please check your internet connection and try again.' }),
      el('p', { class: 'muted', text: error.message || '' })
    ));
  }
}
init();
