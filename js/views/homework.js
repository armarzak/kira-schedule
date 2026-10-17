// Экран «Домашка»: задания по предметам на неделю.

import { el, field, fmtDayShort, fmtWeekRange, todayISO, weekDates, sheet, confirmSheet } from '../util.js';
import { state, upsertHomework, removeHomework } from '../store.js';
import { homeworkInWeek } from '../logic.js';
import { checkbox } from './formbits.js';

let onlyOpen = false;

export const title = ctx => ({ text: 'Домашка', sub: fmtWeekRange(ctx.monday) });

export function render(ctx) {
  const wrap = el('div', { class: 'stack' });
  const items = homeworkInWeek(ctx.monday).filter(h => !onlyOpen || !h.done);

  const filter = checkbox('Только невыполненное', onlyOpen);
  filter.input.addEventListener('change', () => { onlyOpen = filter.input.checked; ctx.rerender(); });
  wrap.append(filter.node);

  if (!items.length) {
    wrap.append(el('div', { class: 'card' }, el('p', { class: 'empty', text: onlyOpen ? 'Всё сделано 🎉' : 'На этой неделе заданий не записано.' })));
  } else {
    const byDate = new Map();
    for (const h of items) { if (!byDate.has(h.date)) byDate.set(h.date, []); byDate.get(h.date).push(h); }
    for (const [date, list] of byDate) {
      wrap.append(el('h3', { class: 'section-label', text: fmtDayShort(date) + (date === todayISO() ? ' · сегодня' : '') }));
      const card = el('div', { class: 'card' });
      for (const h of list) {
        const cb = el('input', { type: 'checkbox', checked: !!h.done, style: { width: '22px', height: '22px', accentColor: 'var(--accent)' } });
        cb.addEventListener('click', e => { e.stopPropagation(); upsertHomework({ ...h, done: cb.checked }); ctx.rerender(); });
        card.append(el('div', { class: 'row' + (h.done ? ' done' : '') },
          cb,
          el('div', { class: 'row-main', onclick: () => form(ctx, h) },
            el('div', { class: 'row-title', text: h.subject || 'Без предмета' }),
            el('div', { class: 'row-sub', text: h.text || '—' }))));
      }
      wrap.append(card);
    }
  }

  wrap.append(el('button', { class: 'btn', style: { marginTop: '14px' }, text: '+ Задание', onclick: () => form(ctx, null) }));
  wrap.append(el('p', { class: 'hint', text: 'Пока задания вводятся руками. Когда подключим МЭШ, они будут подтягиваться сами, а эти останутся как заметки.' }));
  return wrap;
}

export function form(ctx, h) {
  const isNew = !h;
  h = h || { date: ctx.pending?.date || todayISO(), subject: ctx.pending?.subject || '', text: '', done: false };
  sheet(isNew ? 'Задание' : h.subject || 'Задание', close => {
    const date = el('input', { type: 'date', value: h.date });
    const subject = el('input', { type: 'text', value: h.subject || '', placeholder: 'Математика', list: 'subject-list' });
    const dl = el('datalist', { id: 'subject-list' }, ...state.settings.subjects.map(s => el('option', { value: s })));
    const text = el('textarea', { placeholder: '№ 12–14, выучить стих…' }, h.text || '');
    const done = checkbox('Сделано', h.done);
    return [
      el('div', { class: 'field-row' }, field('Дата', date), field('Предмет', subject)), dl,
      field('Что задано', text), done.node,
      el('button', {
        class: 'btn', text: 'Сохранить',
        onclick: () => {
          upsertHomework({ ...h, date: date.value, subject: subject.value.trim(), text: text.value.trim(), done: done.input.checked });
          close(); ctx.rerender();
        },
      }),
      !isNew && el('button', {
        class: 'btn danger', style: { marginTop: '8px' }, text: 'Удалить',
        onclick: async () => { if (await confirmSheet('Удалить задание?')) { removeHomework(h.id); close(); ctx.rerender(); } },
      }),
    ];
  });
}
