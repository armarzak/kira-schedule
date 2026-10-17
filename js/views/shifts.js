// Экран «Графики»: смены взрослых на неделю + личные дела (спортзал и т.п.).

import { el, field, fmtWeekRange, fmtDayShort, todayISO, weekDates, weekdayOf, addDays, DOW_SHORT, sheet, confirmSheet } from '../util.js';
import { state, personName, setShift, presetsFor, upsertCommitment, removeCommitment } from '../store.js';
import { shiftLabel } from '../logic.js';
import { pickShift } from './pickers.js';
import { dowPicker, timeRow, checkbox } from './formbits.js';

export const title = ctx => ({ text: 'Графики', sub: fmtWeekRange(ctx.monday) });

export function render(ctx) {
  const wrap = el('div', { class: 'stack' });
  const dates = weekDates(ctx.monday);
  const today = todayISO();

  // --- таблица смен ---
  const table = el('table', { class: 'grid' });
  const head = el('tr', {}, el('th', { class: 'person', text: '' }));
  for (const d of dates) head.append(el('th', { text: `${DOW_SHORT[weekdayOf(d)]} ${Number(d.slice(8))}` }));
  table.append(el('thead', {}, head));

  const tb = el('tbody');
  for (const p of state.settings.adults) {
    if (!state.settings.people[p]) continue;
    const tr = el('tr', {}, el('th', { class: 'person', text: personName(p) }));
    for (const d of dates) {
      const lab = shiftLabel(p, d);
      const btn = el('button', { type: 'button', onclick: () => pickShift(p, d, ctx.rerender) },
        el('span', { class: 'cell-code' + (lab.kind === 'unknown' ? ' cell-unknown' : ''), text: cellCode(lab) }),
        lab.kind === 'work' ? el('span', { class: 'cell-time', text: lab.text.split('–')[1] }) : null);
      tr.append(el('td', { class: d === today ? 'is-today' : '' }, btn));
    }
    tb.append(tr);
  }
  table.append(tb);
  wrap.append(el('div', { class: 'card grid-wrap' }, table));
  wrap.append(el('p', { class: 'hint', text: `Нажми на клетку, чтобы поставить смену. «?» — день не заполнен. ${personName('grandma')} забирает Киру из школы: если отметить ей «весь день занят», приложение покажет, что забирать некому.` }));

  wrap.append(el('div', { class: 'btn-row' },
    el('button', { class: 'btn secondary', text: 'Заполнить неделю…', onclick: () => fillWeek(ctx) }),
    el('button', { class: 'btn secondary', text: 'Копировать прошлую', onclick: () => copyPrevWeek(ctx) })));

  // --- личные дела ---
  wrap.append(el('h3', { class: 'section-label', text: 'Личные дела взрослых' }));
  const list = el('div', { class: 'card' });
  const all = Object.values(state.commitments).sort((a, b) =>
    state.settings.adults.indexOf(a.person) - state.settings.adults.indexOf(b.person) ||
    String(a.title).localeCompare(b.title, 'ru'));
  if (!all.length) {
    list.append(el('p', { class: 'empty', text: 'Пока ничего. Добавь, например, спортзал — приложение не будет ставить тебя на это время.' }));
  } else {
    for (const c of all) {
      list.append(el('button', { class: 'row', onclick: () => commitmentForm(ctx, c) },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-title', text: `${c.flexible ? '🤸' : '🔒'} ${c.title}` }),
          el('div', { class: 'row-sub', text: `${personName(c.person)} · ${whenText(c)} · ${c.start}–${c.end}${c.flexible ? ' · можно сдвинуть' : ''}` })),
        el('div', { class: 'row-right', text: '›' })));
    }
  }
  wrap.append(list);
  wrap.append(el('button', { class: 'btn', style: { marginTop: '10px' }, text: '+ Личное дело', onclick: () => commitmentForm(ctx, null) }));
  return wrap;
}

const cellCode = lab => lab.kind === 'work' ? lab.text.split('–')[0]
  : lab.kind === 'free' ? '✓' : lab.kind === 'busy' ? '✕' : '?';

const whenText = c => c.date ? fmtDayShort(c.date)
  : (c.days || []).map(d => DOW_SHORT[d]).join(', ') || 'без дней';

function fillWeek(ctx) {
  sheet('Заполнить неделю', close => {
    const who = el('select', {}, ...state.settings.adults.map(p =>
      el('option', { value: p, text: personName(p) })));
    const code = el('select');
    const fillOptions = () => {
      code.textContent = '';
      for (const [c, p] of presetsFor(who.value))
        code.append(el('option', { value: c, text: `${p.start} – ${p.end}` }));
      code.append(el('option', { value: 'free', text: 'Свободный день' }),
                  el('option', { value: 'busy', text: 'Весь день занят' }));
    };
    who.addEventListener('change', fillOptions);
    fillOptions();
    const weekend = checkbox('Включая субботу и воскресенье', false);
    return [
      field('Кому', who), field('Смена', code), weekend.node,
      el('button', {
        class: 'btn', text: 'Поставить на всю неделю',
        onclick: () => {
          for (const d of weekDates(ctx.monday)) {
            if (!weekend.input.checked && weekdayOf(d) > 5) continue;
            setShift(who.value, d, { code: code.value });
          }
          close(); ctx.rerender();
        },
      }),
    ];
  });
}

function copyPrevWeek(ctx) {
  const prev = weekDates(ctx.monday).map(d => addDays(d, -7));
  let n = 0;
  weekDates(ctx.monday).forEach((d, i) => {
    for (const p of state.settings.adults) {
      const src = state.shifts[`${p}:${prev[i]}`];
      if (src) { setShift(p, d, { code: src.code, start: src.start, end: src.end }); n++; }
    }
  });
  ctx.rerender();
  ctx.toast(n ? `Скопировано ${n} смен с прошлой недели` : 'На прошлой неделе смен не было');
}

export function commitmentForm(ctx, c) {
  const isNew = !c;
  c = c || { person: state.settings.adults[0], title: 'Спортзал', days: [3, 6], start: '19:00', end: '20:30', flexible: true };
  sheet(isNew ? 'Личное дело' : c.title, close => {
    const who = el('select', {}, ...state.settings.adults
      .map(p => el('option', { value: p, text: personName(p), selected: p === c.person })));
    const name = el('input', { type: 'text', value: c.title, placeholder: 'Спортзал' });
    const days = dowPicker(c.days || []);
    const once = checkbox('Один раз, а не каждую неделю', !!c.date);
    const date = el('input', { type: 'date', value: c.date || todayISO() });
    const dateField = field('Дата', date);
    dateField.style.display = c.date ? 'block' : 'none';
    const daysField = field('Дни недели', days);
    daysField.style.display = c.date ? 'none' : 'block';
    once.input.addEventListener('change', () => {
      dateField.style.display = once.input.checked ? 'block' : 'none';
      daysField.style.display = once.input.checked ? 'none' : 'block';
    });
    const times = timeRow(c.start, c.end);
    const flex = checkbox('Можно сдвинуть, если надо везти Киру', c.flexible !== false);

    return [
      field('Кто', who), field('Что', name), once.node, daysField, dateField, times.node, flex.node,
      el('button', {
        class: 'btn', text: 'Сохранить',
        onclick: () => {
          upsertCommitment({
            ...c, person: who.value, title: name.value.trim() || 'Личное дело',
            days: once.input.checked ? [] : days.value(),
            date: once.input.checked ? date.value : null,
            start: times.start.value, end: times.end.value,
            flexible: flex.input.checked,
          });
          close(); ctx.rerender();
        },
      }),
      !isNew && el('button', {
        class: 'btn danger', style: { marginTop: '8px' }, text: 'Удалить',
        onclick: async () => {
          if (await confirmSheet('Удалить?', `«${c.title}» исчезнет из расчётов.`)) { removeCommitment(c.id); close(); ctx.rerender(); }
        },
      }),
    ];
  });
}
