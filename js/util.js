// Небольшие помощники: даты, время, DOM, нижние шиты.

export const pad = n => String(n).padStart(2, '0');
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const weekdayOf = iso => { const w = fromISO(iso).getDay(); return w === 0 ? 7 : w; };
export const mondayOf = iso => addDays(iso, 1 - weekdayOf(iso));
export const weekDates = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const DOW_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DOW_LONG = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function fmtDayShort(iso) {
  const d = fromISO(iso);
  return `${DOW_SHORT[weekdayOf(iso)]}, ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
}
export function fmtDayLong(iso) {
  const d = fromISO(iso);
  return `${DOW_LONG[weekdayOf(iso)]}, ${d.getDate()} ${MON_GEN[d.getMonth()]}`;
}
export function fmtWeekRange(monday) {
  const a = fromISO(monday), b = fromISO(addDays(monday, 6));
  const sameMonth = a.getMonth() === b.getMonth();
  return sameMonth
    ? `${a.getDate()}–${b.getDate()} ${MON_GEN[b.getMonth()]}`
    : `${a.getDate()} ${MON_SHORT[a.getMonth()]} – ${b.getDate()} ${MON_SHORT[b.getMonth()]}`;
}
/** Родительный падеж женского имени: Оля → Оли, Ольга → Ольги, Марина → Марины. */
export function ofName(name) {
  if (!name) return name;
  const last = name.slice(-1), prev = name.slice(-2, -1);
  if (last === 'я') return name.slice(0, -1) + 'и';
  if (last === 'а') return name.slice(0, -1) + ('гкхжчшщ'.includes(prev) ? 'и' : 'ы');
  return name;
}

/** Со скольки человек свободен — одной строкой, без рода. */
export function readyText(t) {
  if (t === null || t === undefined) return 'график не заполнен';
  if (t === Infinity) return 'день занят';
  if (t === 0) return 'день свободен';
  return `освобождается в ${fromMin(t)}`;
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

// --- DOM ---
export function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}
export const svgIcon = d => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.append(p);
  return s;
};

// --- нижний шит ---
let openSheets = 0;
export function sheet(title, build) {
  const root = document.getElementById('sheet-root');
  const back = el('div', { class: 'sheet-back' });
  const box = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const close = () => {
    back.classList.remove('in'); box.classList.remove('in');
    setTimeout(() => { back.remove(); box.remove(); if (--openSheets === 0) document.body.style.overflow = ''; }, 200);
  };
  box.append(el('div', { class: 'sheet-grip' }));
  if (title) box.append(el('h3', { text: title }));
  const body = el('div');
  box.append(body);
  body.append(...[build(close)].flat().filter(Boolean));
  back.addEventListener('click', close);
  root.append(back, box);
  openSheets++; document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { back.classList.add('in'); box.classList.add('in'); });
  return close;
}
export function option({ title, sub, pressed, bad, onclick }) {
  return el('button', { class: 'opt' + (bad ? ' bad' : ''), 'aria-pressed': pressed ? 'true' : 'false', onclick },
    el('div', { class: 'opt-main' },
      el('div', { class: 'opt-title', text: title }),
      sub && el('div', { class: 'opt-sub', text: sub })));
}
export function confirmSheet(title, text, okText = 'Удалить') {
  return new Promise(resolve => {
    sheet(title, close => [
      text && el('p', { class: 'hint', text, style: { marginBottom: '14px' } }),
      el('button', { class: 'btn danger', text: okText, onclick: () => { close(); resolve(true); } }),
      el('button', { class: 'btn secondary', text: 'Отмена', style: { marginTop: '8px' }, onclick: () => { close(); resolve(false); } }),
    ]);
  });
}
export function field(label, input) {
  return el('label', { class: 'field' }, el('span', { text: label }), input);
}
