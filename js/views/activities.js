// Экран «Занятия»: постоянное расписание Киры и разовые события.

import { el, field, fmtDayShort, todayISO, DOW_SHORT, sheet, confirmSheet } from '../util.js';
import { state, upsertActivity, removeActivity, personName } from '../store.js';
import { dowPicker, timeRow, checkbox } from './formbits.js';

export const title = () => ({ text: 'Занятия', sub: 'школа, допы и разовые события' });

export function render(ctx) {
  const wrap = el('div', { class: 'stack' });
  const all = Object.values(state.activities);
  const regular = all.filter(a => !a.date).sort(cmp);
  const once = all.filter(a => a.date).sort((a, b) => a.date.localeCompare(b.date));

  wrap.append(el('h3', { class: 'section-label', text: 'Каждую неделю' }));
  wrap.append(listCard(regular, ctx, 'Пока ничего. Добавь школу и допзанятия.'));

  wrap.append(el('h3', { class: 'section-label', text: 'Разовые' }));
  wrap.append(listCard(once, ctx, 'Разовых событий нет.'));

  wrap.append(el('button', { class: 'btn', style: { marginTop: '14px' }, text: '+ Занятие', onclick: () => form(ctx, null) }));
  return wrap;
}

const cmp = (a, b) => (Math.min(...(a.days || [9])) - Math.min(...(b.days || [9]))) || a.start.localeCompare(b.start);

function listCard(items, ctx, emptyText) {
  const card = el('div', { class: 'card' });
  if (!items.length) { card.append(el('p', { class: 'empty', text: emptyText })); return card; }
  for (const a of items) {
    const when = a.date ? fmtDayShort(a.date) : (a.days || []).map(d => DOW_SHORT[d]).join(', ');
    const byRule = a.type === 'school' && state.settings.schoolPickupByGrandma;
    const help = byRule ? `вместе · забирает ${personName('grandma')}`
      : !a.needTo && !a.needFrom ? `${personName('kira')} сама`
      : [a.needTo && 'отвезти', a.needFrom && 'забрать'].filter(Boolean).join(' и ');
    card.append(el('button', { class: 'row', onclick: () => form(ctx, a) },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: a.title }),
        el('div', { class: 'row-sub', text: `${when} · ${a.start}–${a.end}${a.place ? ' · ' + a.place : ''} · ${help}` })),
      el('div', { class: 'row-right', text: '›' })));
  }
  return card;
}

export function form(ctx, a) {
  const isNew = !a;
  a = a || { title: '', type: 'extra', place: '', days: [], start: '16:00', end: '17:00', needTo: true, needFrom: true };
  sheet(isNew ? 'Новое занятие' : a.title, close => {
    const name = el('input', { type: 'text', value: a.title, placeholder: 'Плавание' });
    const type = el('select', {},
      el('option', { value: 'school', text: 'Школа', selected: a.type === 'school' }),
      el('option', { value: 'extra', text: 'Допзанятие', selected: a.type !== 'school' }));
    const place = el('input', { type: 'text', value: a.place || '', placeholder: 'Бассейн, ДК, онлайн…' });
    const subject = el('select', {}, el('option', { value: '', text: '— не привязано —' }),
      ...state.settings.subjects.map(s => el('option', { value: s, text: s, selected: a.subject === s })));

    const days = dowPicker(a.days || []);
    const daysField = field('Дни недели', days);
    const once = checkbox('Разовое занятие', !!a.date);
    const date = el('input', { type: 'date', value: a.date || todayISO() });
    const dateField = field('Дата', date);
    const sync = () => {
      dateField.style.display = once.input.checked ? 'block' : 'none';
      daysField.style.display = once.input.checked ? 'none' : 'block';
    };
    once.input.addEventListener('change', sync); sync();

    const times = timeRow(a.start, a.end);
    const needTo = checkbox('Нужно отвезти', a.needTo);
    const needFrom = checkbox('Нужно забрать', a.needFrom);
    const helpNote = el('p', { class: 'hint', text: 'Школа идёт по уговору: утром отводите вместе, из школы забирает бабушка. Расчёт для неё не нужен.' });
    const syncType = () => {
      const school = type.value === 'school' && state.settings.schoolPickupByGrandma;
      needTo.node.style.display = school ? 'none' : 'flex';
      needFrom.node.style.display = school ? 'none' : 'flex';
      helpNote.style.display = school ? 'block' : 'none';
    };
    type.addEventListener('change', syncType); syncType();
    const from = el('input', { type: 'date', value: a.from || '' });
    const to = el('input', { type: 'date', value: a.to || '' });

    return [
      field('Название', name),
      el('div', { class: 'field-row' }, field('Тип', type), field('Предмет (для ДЗ)', subject)),
      field('Место', place),
      once.node, daysField, dateField, times.node,
      needTo.node, needFrom.node, helpNote,
      el('p', { class: 'hint', text: 'Если оба выключены — Кира ходит сама, логистика не считается.' }),
      el('div', { class: 'field-row', style: { marginTop: '12px' } }, field('Действует с', from), field('по', to)),
      el('button', {
        class: 'btn', text: 'Сохранить',
        onclick: () => {
          if (!name.value.trim()) { name.focus(); return; }
          upsertActivity({
            ...a, title: name.value.trim(), type: type.value, place: place.value.trim(),
            subject: subject.value || null,
            days: once.input.checked ? [] : days.value(),
            date: once.input.checked ? date.value : null,
            start: times.start.value, end: times.end.value,
            needTo: needTo.input.checked, needFrom: needFrom.input.checked,
            from: from.value || null, to: to.value || null,
          });
          close(); ctx.rerender();
        },
      }),
      !isNew && el('button', {
        class: 'btn danger', style: { marginTop: '8px' }, text: 'Удалить занятие',
        onclick: async () => {
          if (await confirmSheet('Удалить занятие?', `«${a.title}» исчезнет из всех недель.`)) {
            removeActivity(a.id); close(); ctx.rerender();
          }
        },
      }),
    ];
  });
}
