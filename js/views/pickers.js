// Общие шиты выбора: смена на день и «кто везёт/забирает».

import { el, sheet, option, field, fmtDayLong, fmtDayShort, toMin, fromMin, ofName, readyText } from '../util.js';
import { state, SPECIAL_SHIFTS, presetsFor, setShift, getShift, setAssignment, getAssignment, personName } from '../store.js';
import { availability, readyTime } from '../logic.js';

export function pickShift(person, date, done = () => {}) {
  const cur = getShift(person, date);
  sheet(`${personName(person)} — ${fmtDayLong(date)}`, close => {
    const opts = presetsFor(person).map(([code, p]) => option({
      title: `${p.start} – ${p.end}`,
      sub: p.title || null,
      pressed: cur?.code === code,
      onclick: () => { setShift(person, date, { code }); close(); done(); },
    }));
    for (const [code, p] of Object.entries(SPECIAL_SHIFTS)) opts.push(option({
      title: p.label,
      sub: code === 'custom' && cur?.code === 'custom' ? `сейчас ${cur.start}–${cur.end}` : null,
      pressed: cur?.code === code,
      onclick: () => {
        if (code === 'custom') { close(); customSheet(person, date, cur, done); return; }
        setShift(person, date, { code });
        close(); done();
      },
    }));
    if (cur) opts.push(option({
      title: 'Очистить', sub: 'день станет «не заполнен»',
      onclick: () => { setShift(person, date, null); close(); done(); },
    }));
    return opts;
  });
}

function customSheet(person, date, cur, done) {
  sheet('Своё время', close => {
    const from = el('input', { type: 'time', value: cur?.start || '09:00' });
    const to = el('input', { type: 'time', value: cur?.end || '18:00' });
    return [
      el('div', { class: 'field-row' }, field('С', from), field('До', to)),
      el('button', {
        class: 'btn', text: 'Сохранить',
        onclick: () => {
          if (!from.value || !to.value) return;
          setShift(person, date, { code: 'custom', start: from.value, end: to.value });
          close(); done();
        },
      }),
    ];
  });
}

const STATUS_SUB = {
  free: 'свободен в это время',
  soft: r => `свободен, но ${r.toLowerCase()} придётся сдвинуть`,
  busy: r => `не может: ${r}`,
  unknown: 'график не заполнен',
};

export function pickEscort(occ, kind, done = () => {}) {
  const min = toMin(kind === 'to' ? occ.start : occ.end);
  const title = `${kind === 'to' ? 'Кто отвезёт' : 'Кто заберёт'} — ${occ.act.title}`;
  const cur = getAssignment(occ.act.id, occ.date, kind);
  sheet(title, close => {
    const ids = [...(state.settings.priority || []), 'grandma', 'kira']
      .filter((p, i, arr) => arr.indexOf(p) === i && state.settings.people[p]);
    const opts = ids.map(p => {
      const a = p === 'kira' ? { status: 'free', reason: '' } : availability(p, occ.date, min);
      const subTpl = STATUS_SUB[a.status];
      return option({
        title: p === 'kira' ? `${personName('kira')} сама` : personName(p),
        sub: p === 'kira' ? 'идёт сама, помощь не нужна' : (typeof subTpl === 'function' ? subTpl(a.reason) : subTpl),
        pressed: cur === p,
        bad: a.status === 'busy',
        onclick: () => { setAssignment(occ.act.id, occ.date, kind, p); close(); done(); },
      });
    });
    if (cur) opts.push(option({
      title: 'Сбросить', sub: 'вернуть автоматический подбор',
      onclick: () => { setAssignment(occ.act.id, occ.date, kind, null); close(); done(); },
    }));
    opts.push(el('p', { class: 'hint', text: 'Выбор сохраняется только для этого дня.' }));
    return opts;
  });
}

export function pickHome(date, done = () => {}) {
  const cur = getAssignment('home', date, 'home');
  sheet(`Кто заберёт от ${ofName(personName('grandma'))} — ${fmtDayShort(date)}`, close => {
    const opts = (state.settings.priority || []).map(p => {
      const t = readyTime(p, date);
      const sub = readyText(t);
      return option({
        title: personName(p), sub, pressed: cur === p,
        bad: t === Infinity,
        onclick: () => { setAssignment('home', date, 'home', p); close(); done(); },
      });
    });
    opts.push(option({
      title: `${personName('grandma')} приведёт сама`,
      sub: 'Кира остаётся у неё до вечера и приходит с ней',
      pressed: cur === 'grandma',
      onclick: () => { setAssignment('home', date, 'home', 'grandma'); close(); done(); },
    }));
    if (cur) opts.push(option({
      title: 'Сбросить', sub: 'вернуть автоматический подбор',
      onclick: () => { setAssignment('home', date, 'home', null); close(); done(); },
    }));
    return opts;
  });
}
