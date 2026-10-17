// Главный экран: неделя Киры с занятиями, сменами взрослых и логистикой.

import { el, fmtDayShort, fmtWeekRange, todayISO, weekDates, weekdayOf, mondayOf, fromMin, ofName, readyText, plural, sheet, option } from '../util.js';
import { state, personName, toggleSkip, isSkipped } from '../store.js';
import { occurrencesOn, commitmentsOn, resolveLeg, legsOf, shiftLabel, homeworkOn, lessonsOn, dayIssues, homeLeg } from '../logic.js';
import { pickShift, pickEscort, pickHome } from './pickers.js';

const LEG_WORD = { to: 'Отвезти', from: 'Забрать' };

export const title = ctx => ({
  text: 'Неделя Киры',
  sub: fmtWeekRange(ctx.monday) + (ctx.monday === weekStartOfToday() ? ' · эта неделя' : ''),
});
const weekStartOfToday = () => mondayOf(todayISO());

export function render(ctx) {
  const wrap = el('div', { class: 'stack' });
  const today = todayISO();

  for (const date of weekDates(ctx.monday)) {
    const wd = weekdayOf(date);
    const occs = occurrencesOn(date);
    const issues = dayIssues(date);
    const day = el('section', {
      class: 'day' + (date === today ? ' is-today' : '') + (wd > 5 ? ' is-weekend' : ''),
    });

    const note = issues.none ? plural(issues.none, 'нестыковка', 'нестыковки', 'нестыковок')
      : issues.unknown ? 'график не заполнен'
      : occs.length ? plural(occs.filter(o => !o.skipped).length, 'занятие', 'занятия', 'занятий')
      : 'ничего нет';
    day.append(el('header', { class: 'day-head' },
      el('h2', { text: fmtDayShort(date) + (date === today ? ' · сегодня' : '') }),
      el('span', { class: 'day-note', text: note, style: issues.none ? { color: 'var(--bad)' } : {} })));

    // смены и личные дела взрослых
    const chips = el('div', { class: 'shifts' });
    for (const p of state.settings.adults) {
      if (!state.settings.people[p]) continue;
      const lab = shiftLabel(p, date);
      chips.append(el('button', {
        class: `chip p-${p}` + (lab.kind === 'unknown' ? ' unknown' : ''),
        onclick: () => pickShift(p, date, ctx.rerender),
      }, el('b', { text: personName(p) }), ' · ', lab.text));
    }
    for (const p of state.settings.adults) {
      for (const c of commitmentsOn(p, date)) {
        chips.append(el('button', {
          class: 'chip', onclick: () => ctx.go('shifts'),
          title: `${personName(p)}: ${c.title}`,
        }, `${c.flexible ? '🤸' : '🔒'} ${personName(p)}: ${c.title} ${c.start}–${c.end}`));
      }
    }
    day.append(chips);

    if (!occs.length) {
      day.append(el('p', { class: 'empty', style: { padding: '14px', borderTop: '1px solid var(--line)' }, text: wd > 5 ? 'Выходной без занятий' : 'Занятий нет' }));
    } else {
      const list = el('ul', { class: 'occs' });
      for (const occ of occs) list.append(occRow(occ, ctx));
      const home = homeLeg(date);
      if (home && home.mode !== 'covered') list.append(homeRow(date, home, ctx));
      day.append(list);
    }
    wrap.append(day);
  }
  return wrap;
}

function occRow(occ, ctx) {
  const li = el('li', { class: 'occ' + (occ.skipped ? ' is-skipped' : '') });
  li.append(el('div', { class: 'occ-time' }, occ.start, el('span', { text: occ.end })));

  const main = el('div', { class: 'occ-main' });
  main.append(el('div', { class: 'occ-title' },
    el('span', { text: occ.act.title }),
    occ.act.type === 'school' ? el('span', { class: 'tag school', text: 'школа' }) : null,
    occ.act.date ? el('span', { class: 'tag', text: 'разово' }) : null,
    occ.act.place ? el('span', { class: 'place', text: occ.act.place }) : null));

  const legs = legsOf(occ);
  const legsBox = el('div', { class: 'legs' });
  if (!legs.length) {
    legsBox.append(el('span', { class: 'leg self', text: `${personName('kira')} сама` }));
  } else if (occ.skipped) {
    legsBox.append(el('span', { class: 'leg self', text: 'отменено' }));
  } else {
    for (const kind of legs) legsBox.append(legButton(occ, kind, ctx));
  }
  legsBox.append(el('button', { class: 'leg', text: '⋯', title: 'Ещё', onclick: () => occMenu(occ, ctx) }));
  main.append(legsBox);

  // Под школьным блоком — уроки из дневника и что сдавать в этот день.
  if (occ.act.type === 'school') {
    const lessons = lessonsOn(occ.date);
    if (lessons.length) main.append(el('div', { class: 'hw-line' },
      el('b', { text: 'Уроки:' }),
      lessons.map(l => `${shortSubject(l.subject)} ${l.start}`).join(' · ')));
  }
  const hw = homeworkOn(occ.date).filter(h => occ.act.type === 'school'
    ? true
    : (occ.act.subject && h.subject === occ.act.subject));
  for (const h of hw.slice(0, 4)) {
    main.append(el('div', { class: 'hw-line' + (h.done ? ' is-done' : '') },
      el('b', { text: shortSubject(h.subject) + ':' }), h.text));
  }
  if (hw.length > 4) main.append(el('div', { class: 'hw-line', text: `…и ещё ${hw.length - 4}` }));

  li.append(main);
  return li;
}

function legButton(occ, kind, ctx) {
  const r = resolveLeg(occ, kind);
  const word = LEG_WORD[kind];
  let cls = 'leg', body, sub = null;
  if (r.mode === 'fixed') {
    cls += ' self'; body = `Из школы: ${personName(r.person)}`; sub = 'всегда';
  } else if (r.mode === 'fixed-busy') {
    cls += ' bad'; body = `Из школы: ${personName(r.person)} занята`; sub = 'некому забрать';
  } else if (r.mode === 'manual') {
    const bad = r.avail.status === 'busy';
    cls += bad ? ' bad' : ' ok';
    body = `${word}: ${personName(r.person)}`;
    sub = bad ? `не может — ${r.avail.reason}` : 'вручную';
  } else if (r.mode === 'auto') {
    cls += ' ok'; body = `${word}: ${personName(r.person)}`; sub = 'авто';
  } else if (r.mode === 'soft') {
    cls += ' warn'; body = `${word}: ${personName(r.person)}`; sub = `сдвинуть ${r.reason.toLowerCase()}`;
  } else if (r.mode === 'unknown') {
    cls += ' warn'; body = `${word}: ?`; sub = 'заполни график';
  } else {
    cls += ' bad'; body = `${word}: никто не может`;
  }
  return el('button', { class: cls, onclick: () => pickEscort(occ, kind, ctx.rerender) },
    body, sub && el('small', { text: `· ${sub}` }));
}

/** «Русский язык» → «Рус.», чтобы строка уроков влезала на телефоне. */
function shortSubject(name) {
  const word = String(name || '').split(/[\s-]+/)[0];
  return word.length > 5 ? word.slice(0, 3) + '.' : word;
}

function homeRow(date, h, ctx) {
  const li = el('li', { class: 'occ' });
  li.append(el('div', { class: 'occ-time' }, '↩︎', el('span', { text: 'домой' })));
  const main = el('div', { class: 'occ-main' });
  main.append(el('div', { class: 'occ-title' },
    el('span', { text: `От ${ofName(personName('grandma'))} домой` }),
    el('span', { class: 'place', text: `до ${state.settings.homeBy}` })));

  let cls = 'leg wide', body, sub = null;
  if (h.mode === 'manual') {
    cls += ' ok'; body = h.person === 'grandma' ? `${personName('grandma')} приведёт сама` : `Забирает: ${personName(h.person)}`;
    sub = 'вручную';
  } else if (h.mode === 'parent') {
    cls += ' ok'; body = `Забирает: ${personName(h.person)}`; sub = readyText(h.t);
  } else if (h.mode === 'grandma') {
    cls += ' warn'; body = `${personName('grandma')} приведёт сама`;
    sub = h.late.map(c => `${personName(c.person)} ${c.t === Infinity ? 'весь день занят' : 'до ' + fromMin(c.t)}`).join(', ');
  } else {
    cls += ' warn'; body = 'Кто заберёт — не ясно'; sub = 'заполни графики';
  }
  main.append(el('div', { class: 'legs' },
    el('button', { class: cls, onclick: () => pickHome(date, ctx.rerender) }, body, sub && el('small', { text: `· ${sub}` }))));
  li.append(main);
  return li;
}

function occMenu(occ, ctx) {
  sheet(`${occ.act.title} · ${fmtDayShort(occ.date)}`, close => [
    option({
      title: isSkipped(occ.act.id, occ.date) ? 'Вернуть занятие в этот день' : 'Отменить в этот день',
      sub: 'расписание на другие дни не меняется',
      onclick: () => { toggleSkip(occ.act.id, occ.date); close(); ctx.rerender(); },
    }),
    option({
      title: 'Изменить занятие', sub: 'время, место, нужна ли помощь',
      onclick: () => { close(); ctx.go('activities', { edit: occ.act.id }); },
    }),
    option({
      title: 'Добавить домашку', sub: 'на этот день',
      onclick: () => { close(); ctx.go('homework', { add: { date: occ.date, subject: occ.act.subject || '' } }); },
    }),
  ]);
}
