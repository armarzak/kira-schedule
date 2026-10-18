// Сборка приложения: верхняя панель, переключение экранов, нижние вкладки.

import { el, svgIcon, todayISO, mondayOf, addDays } from './util.js';
import { state, subscribe } from './store.js';
import { weekIssues } from './logic.js';
import { takeInviteFromUrl } from './invite.js';
import { chooseViewer } from './views/pickers.js';
import * as week from './views/week.js';
import * as homework from './views/homework.js';
import * as activities from './views/activities.js';
import * as shifts from './views/shifts.js';
import * as settings from './views/settings.js';

const ICONS = {
  week: 'M4 8h16M7 3v3m10-3v3M5 21h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z',
  homework: 'M5 4a1 1 0 0 1 1-1h12v18H6a1 1 0 0 1-1-1V4Zm4 4h7M9 12h7',
  activities: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  shifts: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  settings: 'M4 6h16M4 12h16M4 18h16',
};
const TABS = [
  { id: 'week', label: 'Неделя', view: week, nav: true },
  { id: 'homework', label: 'Домашка', view: homework, nav: true },
  { id: 'shifts', label: 'Графики', view: shifts, nav: true },
  { id: 'activities', label: 'Занятия', view: activities, nav: false },
  { id: 'settings', label: 'Ещё', view: settings, nav: false },
];

const ui = { tab: 'week', monday: mondayOf(todayISO()), pending: null };

const ctx = {
  get monday() { return ui.monday; },
  get pending() { return ui.pending; },
  rerender: () => render(),
  go, toast,
};

function go(tab, extra) {
  ui.tab = tab;
  ui.pending = extra?.add || null;
  render();
  if (tab === 'activities' && extra?.edit) activities.form(ctx, state.activities[extra.edit]);
  if (tab === 'homework' && extra?.add) homework.form(ctx, null);
  ui.pending = null;
}

function shiftWeek(n) {
  ui.monday = n === 0 ? mondayOf(todayISO()) : addDays(ui.monday, n * 7);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  const tab = TABS.find(t => t.id === ui.tab) || TABS[0];
  const t = tab.view.title(ctx);

  const top = document.getElementById('topbar');
  top.textContent = '';
  const row = el('div', { class: 'topbar-row' },
    el('div', { class: 'topbar-title' }, t.text, t.sub ? el('small', { text: t.sub }) : null));
  if (tab.nav) {
    row.append(
      el('button', { class: 'icon-btn', text: '‹', title: 'Прошлая неделя', onclick: () => shiftWeek(-1) }),
      el('button', { class: 'icon-btn wide', text: 'Сегодня', onclick: () => shiftWeek(0) }),
      el('button', { class: 'icon-btn', text: '›', title: 'Следующая неделя', onclick: () => shiftWeek(1) }));
  }
  top.append(row);

  const app = document.getElementById('app');
  app.textContent = '';
  app.append(tab.view.render(ctx));

  const bar = document.getElementById('tabbar');
  bar.textContent = '';
  const issues = weekIssues(ui.monday);
  for (const tb of TABS) {
    const btn = el('button', {
      onclick: () => { if (ui.tab !== tb.id) { ui.tab = tb.id; render(); window.scrollTo({ top: 0 }); } },
      'aria-current': ui.tab === tb.id ? 'page' : null,
    }, svgIcon(ICONS[tb.id]), el('span', { text: tb.label }));
    if (tb.id === 'week' && issues.none) btn.append(el('i', { class: 'badge-dot' }));
    bar.append(btn);
  }
}

let toastTimer = null;
function toast(text) {
  let box = document.querySelector('.toast');
  if (!box) { box = el('div', { class: 'toast' }); document.body.append(box); }
  box.textContent = text;
  box.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('in'), 2400);
}


render();
if (!state.settings.viewer) setTimeout(() => chooseViewer(render), 400);

// Перерисовываем экран, когда данные меняются — в том числе после обмена с облаком.
let renderQueued = false;
subscribe(() => {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; render(); });
});

// Открыли по ссылке-приглашению — забираем настройки из адреса.
const invited = takeInviteFromUrl();

// Ссылку могли открыть, когда приложение уже открыто: тогда меняется только
// адресная строка, без перезагрузки, и приглашение нужно подхватить руками.
window.addEventListener('hashchange', async () => {
  if (!takeInviteFromUrl()) return;
  try {
    const m = await import('./sync.js');
    await m.start();
    toast('Устройство подключено к семье');
  } catch (e) {
    toast('Не удалось подключиться: ' + (e.message || e));
  }
  render();
});

// Облако подключается само, если настроено. Без него приложение работает как раньше.
const cloud = state.settings.supabase;
if (cloud.url && cloud.anonKey && cloud.familyCode) {
  import('./sync.js')
    .then(m => m.start())
    .then(() => { if (invited) toast('Устройство подключено к семье'); })
    .catch(e => {
      console.warn('Синхронизация не стартовала:', e.message || e);
      if (invited) toast('Не удалось подключиться: ' + (e.message || e));
    });
}

// На localhost офлайн-кэш только мешает разработке — там он не нужен.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !isLocal) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
