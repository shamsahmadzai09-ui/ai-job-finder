// Small DOM helpers. Everything is built with textContent / createElement, never innerHTML,
// so untrusted text (job descriptions, emails in later phases) cannot inject markup.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'style') continue; // inline styles are blocked by CSP; use classes
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  tracker: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  settings: 'M4 7h16M4 17h16M9 4v6M15 14v6',
  menu: 'M4 6h16M4 12h16M4 18h16'
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.briefcase);
  svg.append(path);
  return svg;
}

/** Shows a toast. Options: { actionLabel, onAction, timeout } (timeout 0 = stay until dismissed). */
export function toast(message, { actionLabel, onAction, timeout = 6000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = el('div', { class: 'toast', role: 'status' }, el('span', { text: message }));
  const remove = () => node.remove();
  if (actionLabel && onAction) {
    node.append(el('button', {
      class: 'btn',
      type: 'button',
      text: actionLabel,
      onclick: () => { remove(); onAction(); }
    }));
  }
  host.append(node);
  if (timeout > 0) setTimeout(remove, timeout);
}

/** Standard empty state card. No buttons: nothing is shown that does not work yet. */
export function emptyState({ iconName, title, text, phase }) {
  return el('section', { class: 'card empty' },
    icon(iconName),
    el('h2', { text: title }),
    el('p', { text }),
    phase ? el('span', { class: 'badge primary', text: phase }) : null
  );
}

export function pageHead(title, subtitle) {
  return el('div', { class: 'page-head' },
    el('h1', { text: title, tabindex: '-1', id: 'page-title' }),
    subtitle ? el('p', { text: subtitle }) : null
  );
}
