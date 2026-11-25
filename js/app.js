// App shell: sidebar, topbar, hash router, mobile drawer, online/offline banner.

import { el, icon, toast } from './ui.js';
import { CONFIG } from './config.js';
import { initPwa } from './pwa.js';
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
      el('div', {},
        el('div', { class: 'brand-name', text: CONFIG.APP_NAME }),
        el('div', { class: 'brand-sub', text: 'Jobs across Afghanistan' })
      )
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

function render() {
  const { base, param } = parseHash();
  const route = routes.find((r) => r.path === base);
  const main = $('main');

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

  const title = route ? route.title : 'Not found';
  main.replaceChildren(node);
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

function init() {
  buildSidebar();
  $('menu-btn').replaceChildren(icon('menu'));
  $('menu-btn').addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  $('backdrop').addEventListener('click', () => setNavOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNavOpen(false); });

  updatePill();
  initPwa({ onOnlineChange: (online) => { $('offline-banner').hidden = online; } });

  window.addEventListener('hashchange', render);
  window.addEventListener('unhandledrejection', () => toast('Something went wrong. Please try again.'));
  render();
}

init();
