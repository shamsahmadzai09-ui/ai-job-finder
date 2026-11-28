// App shell with separate sign-up, sign-in, password recovery, and onboarding.
import { el, icon, toast } from './ui.js';
import { CONFIG } from './config.js';
import { initPwa } from './pwa.js';
import { getClient } from './supabase-client.js';
import * as pages from './pages.js?v=20261128-documents-v1';

const routes = [
  { path: '/', title: 'Dashboard', icon: 'dashboard', nav: true, render: pages.dashboardPage },
  { path: '/search', title: 'Job Search', icon: 'search', nav: true, render: pages.jobSearchPage },
  { path: '/sources', title: 'Job Sources', icon: 'briefcase', nav: true, render: pages.jobSourcesPage },
  { path: '/organizations', title: 'Organization Discovery', icon: 'building-2', nav: true, render: pages.organizationDiscoveryPage },
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

const translations = {
  ps: {
    "Dashboard":"ډشبورډ","Job Search":"د دندو لټون","Job Sources":"د دندو سرچینې","Organization Discovery":"د موسسو موندنه","Social media job discovery":"د ټولنیزو رسنیو له لارې د دندو موندنه","Connect official Facebook Pages, LinkedIn organization pages, and Telegram channels to the 1,163-organization registry. New account suggestions remain pending until verified.":"د ۱۱۶۳ سازمانونو له نوملړ سره د فېسبوک، لینکډاېن او ټیلیګرام رسمي حسابونه ونښلوئ. نوي وړاندیز شوي حسابونه تر تایید پورې په انتظار کې وي.","Organization":"سازمان","Social network":"ټولنیزه شبکه","Official profile URL":"د رسمي حساب لینک","Evidence URL (official website link or proof)":"د ثبوت لینک (رسمي وېب‌پاڼه یا بل ثبوت)","Submit account for verification":"حساب د تایید لپاره ولېږئ","Verified social accounts":"تایید شوي ټولنیز حسابونه","Social media job announcements":"په ټولنیزو رسنیو کې د دندو اعلانونه","Choose an organization":"یو سازمان وټاکئ","Facebook Page":"فېسبوک پاڼه","LinkedIn organization page":"د لینکډاېن سازماني پاڼه","Telegram channel":"د ټیلیګرام چینل","Only public, official organization accounts are accepted. Blue badges alone are not treated as proof.":"یوازې د سازمانونو عامه او رسمي حسابونه منل کېږي. یوازې شین نښان د ثبوت په توګه نه منل کېږي.","Automatic collection is not active yet. Facebook and LinkedIn API access requires platform approval and credentials; Telegram channel access also needs an authorized bot or permitted public feed. No private or unauthorized accounts are accessed.":"اتومات راټولول لا فعال نه دي. د فېسبوک او لینکډاېن API لپاره د شبکو اجازه او کیلي اړینې دي؛ د ټیلیګرام لپاره هم مجاز بوټ یا اجازه لرونکی عامه فیډ پکار دی. خصوصي یا غیرمجاز حسابونه نه کتل کېږي.","Website availability checker":"د وېب‌پاڼو د شتون کتنه","Check all organization websites":"د ټولو ادارو وېب‌پاڼې وازمویئ","Scan all organizations":"ټولې ادارې وپلټئ","Find Jobs Opportunities":"د کار فرصتونه ومومئ","New job opportunities":"د کار نوي فرصتونه","Loading newly verified opportunities…":"د تایید شویو نویو فرصتونو د بارولو په حال کې…","Open application form":"د غوښتنلیک فورمه پرانیزئ","Open original announcement":"اصلي اعلان پرانیزئ","Description, requirements and application instructions":"دندې تشریح، شرایط او د غوښتنلیک لارښوونې","Check all websites again":"ټولې وېب‌پاڼې بیا وازمویئ","Continue checking":"ازموینه روانه کړئ","Discovered organizations":"موندل شوې موسسې","Official website":"رسمي وېب‌پاڼه","Careers page":"د دندو پاڼه","Not checked yet":"لا نه دی ازمویل شوی","Website reachable":"وېب‌پاڼه فعاله ده","Redirect detected":"بل ادرس ته اړول","Page not found":"پاڼه ونه موندل شوه","Blocked / bot protection":"بنده شوې / د بوټ مخنیوی","Server error":"د سرور تېروتنه","Timed out":"وخت پای ته ورسېد","Invalid or unsupported URL":"ناسم یا نه ملاتړ کېدونکی لینک","HTTP response needs review":"د HTTP ځواب بیاکتنې ته اړتیا لري","Network / TLS error":"د شبکې / TLS تېروتنه","Recommended":"وړاندیز شوې دندې","My Profile":"زما پروفایل","CV & Cover Letter":"سي وي او غوښتنلیک لیک","Email Center":"د برېښنالیک مرکز","Applications":"غوښتنلیکونه","Settings":"تنظیمات",
    "Jobs across Afghanistan":"په افغانستان کې دندې","Dashboard":"ډشبورډ","Your job-search overview for opportunities across Afghanistan. Numbers appear only when real data exists.":"په افغانستان کې د کاري فرصتونو لنډیز. شمېرې یوازې د واقعي معلوماتو پر بنسټ ښودل کېږي.",
    "Jobs discovered":"موندل شوې دندې","Excellent matches":"غوره برابرې دندې","Applications prepared":"چمتو شوي غوښتنلیکونه","Applications submitted":"لېږل شوي غوښتنلیکونه","Interviews received":"ترلاسه شوې مرکې","Build progress":"د جوړولو پرمختګ","Setup status":"د تنظیم حالت",
    "Complete":"بشپړ","Current":"اوسنی پړاو","Planned":"پلان شوی","Supabase":"سوپابېس","Sign-in":"ننوتل","Job sources":"د دندو سرچینې","Configuration looks valid.":"تنظیمات سم دي.","None connected yet (Phase 3).":"تر اوسه هېڅ سرچینه نه ده نښلول شوې (درېیم پړاو).",
    "Personal information":"شخصي معلومات","Education":"زده کړې","Skills":"مهارتونه","Languages":"ژبې","Work experience":"کاري تجربه","Certificates and training":"سندونه او روزنه","Additional projects and achievements":"نورې پروژې او لاسته راوړنې",
    "First name":"نوم","Last name / surname":"تخلص","Father’s name":"د پلار نوم","Birth date (optional)":"د زېږېدو نېټه (اختیاري)","Province of origin":"اصلي ولایت","Current province":"اوسنی ولایت","Current full address":"اوسنی بشپړ ادرس","Phone number":"د تلیفون شمېره","Email address":"برېښنالیک",
    "Save my profile":"زما پروفایل ثبت کړئ","Add education":"زده کړې زیاتې کړئ","Add skill":"مهارت زیات کړئ","Add language":"ژبه زیاته کړئ","Add experience":"کاري تجربه زیاته کړئ","Add certificate":"سند زیات کړئ","Add project":"پروژه زیاته کړئ",
    "Language":"ژبه","Notifications":"خبرتیاوې","No new notifications":"اوس مهال نوې خبرتیا نشته","Profile incomplete":"پروفایل نیمګړی دی","Please complete your profile to prepare your CV.":"د سي وي د چمتو کولو لپاره خپل پروفایل بشپړ کړئ.",
    "Welcome":"ښه راغلاست","Not found":" ونه موندل شو","Checking…":"د کتنې په حال کې…","Getting started":"پیل"
  },
  fa: {
    "Dashboard":"داشبورد","Job Search":"جستجوی وظایف","Job Sources":"منابع وظایف","Organization Discovery":"کشف سازمان‌ها","Social media job discovery":"کشف وظایف از شبکه‌های اجتماعی","Connect official Facebook Pages, LinkedIn organization pages, and Telegram channels to the 1,163-organization registry. New account suggestions remain pending until verified.":"صفحات رسمی فیسبوک، لینکدین و کانال‌های تلگرام را به فهرست ۱۱۶۳ سازمان وصل کنید. حساب‌های پیشنهادی تا زمان تأیید در حالت انتظار می‌مانند.","Organization":"سازمان","Social network":"شبکه اجتماعی","Official profile URL":"پیوند حساب رسمی","Evidence URL (official website link or proof)":"پیوند مدرک (وب‌سایت رسمی یا سند دیگر)","Submit account for verification":"ارسال حساب برای تأیید","Verified social accounts":"حساب‌های اجتماعی تأییدشده","Social media job announcements":"اعلان‌های کاری در شبکه‌های اجتماعی","Choose an organization":"یک سازمان انتخاب کنید","Facebook Page":"صفحه فیسبوک","LinkedIn organization page":"صفحه سازمانی لینکدین","Telegram channel":"کانال تلگرام","Only public, official organization accounts are accepted. Blue badges alone are not treated as proof.":"فقط حساب‌های عمومی و رسمی سازمان‌ها پذیرفته می‌شوند. نشان آبی به‌تنهایی مدرک محسوب نمی‌شود.","Automatic collection is not active yet. Facebook and LinkedIn API access requires platform approval and credentials; Telegram channel access also needs an authorized bot or permitted public feed. No private or unauthorized accounts are accessed.":"جمع‌آوری خودکار هنوز فعال نیست. دسترسی API فیسبوک و لینکدین به تأیید و کلیدهای رسمی نیاز دارد؛ برای تلگرام نیز ربات مجاز یا فید عمومی مجاز لازم است. به حساب‌های خصوصی یا غیرمجاز دسترسی نمی‌شود.","Website availability checker":"بررسی دسترسی وب‌سایت‌ها","Check all organization websites":"بررسی وب‌سایت تمام سازمان‌ها","Scan all organizations":"بررسی همه سازمان‌ها","Find Jobs Opportunities":"یافتن فرصت‌های شغلی","New job opportunities":"فرصت‌های شغلی جدید","Loading newly verified opportunities…":"در حال بارگذاری فرصت‌های تازه تأییدشده…","Open application form":"باز کردن فورم درخواست","Open original announcement":"باز کردن اعلان اصلی","Description, requirements and application instructions":"شرح وظیفه، شرایط و رهنمود درخواست","Check all websites again":"بررسی دوباره همه وب‌سایت‌ها","Continue checking":"ادامه بررسی","Discovered organizations":"سازمان‌های کشف‌شده","Official website":"وب‌سایت رسمی","Careers page":"صفحه فرصت‌های کاری","Not checked yet":"هنوز بررسی نشده","Website reachable":"وب‌سایت در دسترس است","Redirect detected":"تغییر مسیر شناسایی شد","Page not found":"صفحه پیدا نشد","Blocked / bot protection":"مسدود / محافظت ضدربات","Server error":"خطای سرور","Timed out":"زمان درخواست پایان یافت","Invalid or unsupported URL":"نشانی نامعتبر یا پشتیبانی‌نشده","HTTP response needs review":"پاسخ HTTP نیاز به بررسی دارد","Network / TLS error":"خطای شبکه / TLS","Recommended":"وظایف پیشنهادی","My Profile":"پروفایل من","CV & Cover Letter":"سی‌وی و نامه درخواست","Email Center":"مرکز ایمیل","Applications":"درخواست‌ها","Settings":"تنظیمات",
    "Jobs across Afghanistan":"فرصت‌های کاری در افغانستان","Your job-search overview for opportunities across Afghanistan. Numbers appear only when real data exists.":"خلاصه جستجوی فرصت‌های کاری در افغانستان. ارقام تنها بر اساس اطلاعات واقعی نمایش داده می‌شوند.",
    "Jobs discovered":"وظایف پیدا شده","Excellent matches":"مطابقت‌های عالی","Applications prepared":"درخواست‌های آماده‌شده","Applications submitted":"درخواست‌های ارسال‌شده","Interviews received":"مصاحبه‌های دریافت‌شده","Build progress":"پیشرفت ساخت","Setup status":"وضعیت تنظیمات",
    "Complete":"تکمیل","Current":"فعلی","Planned":"برنامه‌ریزی‌شده","Supabase":"سوپابیس","Sign-in":"ورود","Job sources":"منابع کاری","Configuration looks valid.":"تنظیمات معتبر است.","None connected yet (Phase 3).":"هنوز منبعی وصل نشده است (مرحله سوم).",
    "Personal information":"اطلاعات شخصی","Education":"تحصیلات","Skills":"مهارت‌ها","Languages":"زبان‌ها","Work experience":"تجربه کاری","Certificates and training":"اسناد و آموزش‌ها","Additional projects and achievements":"پروژه‌ها و دستاوردهای بیشتر",
    "First name":"نام","Last name / surname":"تخلص","Father’s name":"نام پدر","Birth date (optional)":"تاریخ تولد (اختیاری)","Province of origin":"ولایت اصلی","Current province":"ولایت فعلی","Current full address":"آدرس فعلی","Phone number":"شماره تماس","Email address":"آدرس ایمیل",
    "Save my profile":"ذخیره پروفایل من","Add education":"افزودن تحصیلات","Add skill":"افزودن مهارت","Add language":"افزودن زبان","Add experience":"افزودن تجربه کاری","Add certificate":"افزودن سند","Add project":"افزودن پروژه",
    "Language":"زبان","Notifications":"اعلان‌ها","No new notifications":"در حال حاضر اعلان جدیدی وجود ندارد","Profile incomplete":"پروفایل تکمیل نیست","Please complete your profile to prepare your CV.":"برای آماده‌سازی سی‌وی، لطفاً پروفایل خود را تکمیل کنید.",
    "Welcome":"خوش آمدید","Not found":"پیدا نشد","Checking…":"در حال بررسی…","Getting started":"شروع"
  }
};
let currentLanguage = localStorage.getItem('ajf-language') || 'en';
let notificationPanel = null;

function applyLanguage() {
  const dict = translations[currentLanguage] || {};
  document.documentElement.lang = currentLanguage === 'ps' ? 'ps-AF' : currentLanguage === 'fa' ? 'fa-AF' : 'en';
  document.documentElement.dir = currentLanguage === 'en' ? 'ltr' : 'rtl';
  document.body.classList.toggle('rtl-mode', currentLanguage !== 'en');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!node.__ajfOriginal) node.__ajfOriginal = node.nodeValue;
    const original = node.__ajfOriginal.trim();
    if (!original) continue;
    const translated = dict[original];
    if (translated) node.nodeValue = node.__ajfOriginal.replace(original, translated);
    else if (currentLanguage === 'en') node.nodeValue = node.__ajfOriginal;
  }
  document.querySelectorAll('[placeholder]').forEach((node) => {
    if (!node.dataset.ajfOriginalPlaceholder) node.dataset.ajfOriginalPlaceholder = node.getAttribute('placeholder');
    node.setAttribute('placeholder', dict[node.dataset.ajfOriginalPlaceholder] || node.dataset.ajfOriginalPlaceholder);
  });
  document.querySelectorAll('.nav a').forEach((a) => {
    const route = routes.find((r) => r.path === a.dataset.path);
    const span = a.querySelector('span');
    if (span && route) span.textContent = dict[route.title] || route.title;
  });
  const title = routes.find((r) => r.path === parseHash().base);
  if (title) $('topbar-title').textContent = dict[title.title] || title.title;
  const selector = $('language-select');
  if (selector) selector.value = currentLanguage;
}

function addHeaderActions() {
  const host = $('topbar-actions');
  if (!host || $('language-select')) return;
  const select = el('select', { id: 'language-select', class: 'language-select', 'aria-label': 'Change language' },
    el('option', { value: 'en', text: 'English' }),
    el('option', { value: 'ps', text: 'پښتو' }),
    el('option', { value: 'fa', text: 'دری' })
  );
  select.value = currentLanguage;
  select.addEventListener('change', () => {
    currentLanguage = select.value;
    localStorage.setItem('ajf-language', currentLanguage);
    applyLanguage();
  });
  const bell = el('button', { class: 'icon-btn notification-btn', id: 'notification-btn', type: 'button', 'aria-label': 'Notifications', title: 'Notifications' }, '♧');
  bell.textContent = '🔔';
  bell.addEventListener('click', () => {
    if (notificationPanel) { notificationPanel.remove(); notificationPanel = null; return; }
    const incomplete = !!currentUser && !localStorage.getItem('ajf-onboarding-' + currentUser.id)?.includes('complete');
    const dict = translations[currentLanguage] || {};
    const title = dict.Notifications || 'Notifications';
    const message = incomplete ? (dict['Please complete your profile to prepare your CV.'] || 'Please complete your profile to prepare your CV.') : (dict['No new notifications'] || 'No new notifications');
    notificationPanel = el('section', { class: 'notification-panel', role: 'dialog', 'aria-label': title },
      el('h3', { text: title }),
      incomplete ? el('button', { class: 'notification-item', type: 'button', text: (dict['Profile incomplete'] || 'Profile incomplete') + ' — ' + message }) : el('p', { class: 'muted', text: message })
    );
    const item = notificationPanel.querySelector('button');
    if (item) item.addEventListener('click', () => { notificationPanel.remove(); notificationPanel = null; location.hash = '#/profile'; });
    host.append(notificationPanel);
  });
  host.append(select, bell);
  applyLanguage();
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
  applyLanguage();
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
  if (parseHash().base === '/profile') {
    document.querySelector('.profile-reminder-overlay')?.remove();
    profileReminderVisible = false;
    return;
  }
  profileCheckRunning = true;
  try {
    const complete = await hasMeaningfulProfile(currentUser);
    // The user may have opened My Profile while the database check was running.
    // Re-check the route after the await so an old check cannot show the modal there.
    if (parseHash().base === '/profile') {
      document.querySelector('.profile-reminder-overlay')?.remove();
      profileReminderVisible = false;
      return;
    }
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
  const card = el('section', { class: 'profile-reminder-card', dir: 'rtl', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'profile-reminder-title' },
    closeButton, art,
    el('span', { class: 'badge primary profile-reminder-brand', text: 'AI JOB FINDER · ښه راغلاست' }),
    el('h2', { id: 'profile-reminder-title', text: 'خپل پروفایل بشپړ کړئ!' }),
    el('p', { class: 'profile-reminder-message', text: 'ستاسو پروفایل لا تر اوسه بشپړ شوی نه دی. مهرباني وکړئ ژر تر ژره خپل شخصي معلومات، زده کړې، مهارتونه او کاري تجربې ثبت کړئ، ترڅو موږ ستاسو د مهارتونو او تحصیلي مخینې پر بنسټ درته مسلکي سي وي جوړه کړو او ستاسو له وړتیاوو سره سم د مناسبو دندو لپاره د غوښتنلیک په چمتو کولو کې مرسته وکړو.' }),
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
  applyLanguage();
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
  applyLanguage();
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
  addHeaderActions();
  $('menu-btn').replaceChildren(icon('menu'));
  $('menu-btn').addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  $('backdrop').addEventListener('click', () => setNavOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNavOpen(false); });
  updatePill();
  initPwa({ onOnlineChange: (online) => { $('offline-banner').hidden = online; } });
  window.addEventListener('hashchange', () => {
    if (parseHash().base === '/profile') {
      document.querySelector('.profile-reminder-overlay')?.remove();
      profileReminderVisible = false;
    }
    render();
    if (currentUser) checkProfileAndRemind();
  });
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
