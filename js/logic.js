// Вся расчётная часть: какие занятия в этот день, кто в это время свободен,
// кто везёт и кто забирает.

import { state, presetOf, getShift, getAssignment, isSkipped } from './store.js';
import { weekdayOf, toMin, fromMin, weekDates } from './util.js';

const inRange = (date, a, b) => (!a || date >= a) && (!b || date <= b);
const byStart = (x, y) => toMin(x.start) - toMin(y.start) || String(x.title).localeCompare(y.title, 'ru');

/** Занятия Киры в конкретный день (с учётом разовых и периода действия). */
export function activitiesOn(date) {
  const wd = weekdayOf(date);
  return Object.values(state.activities)
    .filter(a => {
      if (!inRange(date, a.from, a.to)) return false;
      if (a.date) return a.date === date;
      return (a.days || []).includes(wd);
    })
    .sort(byStart);
}

/** То же плюс отметка «отменено в этот день». */
export function occurrencesOn(date) {
  return activitiesOn(date).map(act => ({
    act, date, start: act.start, end: act.end, skipped: isSkipped(act.id, date),
  }));
}

/** Личные дела взрослого (спортзал и прочее) в этот день. */
export function commitmentsOn(person, date) {
  const wd = weekdayOf(date);
  return Object.values(state.commitments)
    .filter(c => c.person === person && inRange(date, c.from, c.to) &&
      (c.date ? c.date === date : (c.days || []).includes(wd)))
    .sort(byStart);
}

/** Рабочий интервал смены в минутах, либо null (свободно) / undefined (не заполнено). */
export function workInterval(person, date) {
  if (person === 'kira') return null;
  const s = getShift(person, date);
  if (!s) {
    if (person === 'grandma' && state.settings.grandmaDefaultFree) return null;
    return undefined;
  }
  if (s.code === 'free') return null;
  if (s.code === 'busy') return { start: 0, end: 1440, whole: true };
  const p = s.code === 'custom' ? s : presetOf(s.code);
  if (!p || !p.start) return null;
  return { start: toMin(p.start), end: toMin(p.end) };
}

/** Короткая подпись смены для чипа/таблицы. */
export function shiftLabel(person, date) {
  const s = getShift(person, date);
  if (!s) {
    if (person === 'grandma' && state.settings.grandmaDefaultFree) return { text: 'свободна', kind: 'free' };
    return { text: '?', kind: 'unknown' };
  }
  if (s.code === 'free') return { text: 'свободно', kind: 'free' };
  if (s.code === 'busy') return { text: 'занято', kind: 'busy' };
  const p = s.code === 'custom' ? s : presetOf(s.code);
  if (!p || !p.start) return { text: '?', kind: 'unknown' };
  return { text: `${p.start}–${p.end}`, kind: 'work' };
}

/**
 * Доступность человека в момент времени.
 * free — точно может; soft — может, но придётся сдвинуть личное дело;
 * busy — не может; unknown — график не заполнен.
 */
export function availability(person, date, min) {
  const iv = workInterval(person, date);
  if (iv === undefined) return { status: 'unknown', reason: 'график не заполнен' };
  const buf = state.settings.bufferMin || 0;
  if (iv && min > iv.start - buf && min < iv.end + buf) {
    return { status: 'busy', reason: iv.whole ? 'весь день занят' : `смена ${fromMin(iv.start)}–${fromMin(iv.end)}` };
  }
  let soft = null;
  for (const c of commitmentsOn(person, date)) {
    const a = toMin(c.start) - buf, b = toMin(c.end) + buf;
    if (min > a && min < b) {
      if (!c.flexible) return { status: 'busy', reason: c.title };
      soft = soft || { status: 'soft', reason: c.title };
    }
  }
  return soft || { status: 'free', reason: '' };
}

const candidates = () => (state.settings.priority || []).filter(p => state.settings.people[p]);

/**
 * Кто везёт (kind='to') или забирает (kind='from') на этом занятии.
 * mode: manual | auto | soft | unknown | none
 */
export function resolveLeg(occ, kind) {
  const min = toMin(kind === 'to' ? occ.start : occ.end);
  const manual = getAssignment(occ.act.id, occ.date, kind);
  if (manual) return { mode: 'manual', person: manual, avail: availability(manual, occ.date, min), min };

  const list = candidates().map(p => ({ person: p, a: availability(p, occ.date, min) }));
  const free = list.filter(c => c.a.status === 'free');
  if (free.length) return { mode: 'auto', person: free[0].person, options: free.map(c => c.person), min };
  const soft = list.filter(c => c.a.status === 'soft');
  if (soft.length) return { mode: 'soft', person: soft[0].person, reason: soft[0].a.reason, options: soft.map(c => c.person), min };
  const unknown = list.filter(c => c.a.status === 'unknown');
  if (unknown.length) return { mode: 'unknown', people: unknown.map(c => c.person), min };
  return { mode: 'none', min };
}

/** Школа идёт по уговору: утром отводим вместе, из школы забирает бабушка. */
export const isSchoolByRule = (act) =>
  act.type === 'school' && state.settings.schoolPickupByGrandma;

/** Нужные «плечи» занятия: отвезти и/или забрать. У школы их нет. */
export function legsOf(occ) {
  if (isSchoolByRule(occ.act)) return [];
  const out = [];
  if (occ.act.needTo) out.push('to');
  if (occ.act.needFrom) out.push('from');
  return out;
}

/**
 * Со скольки человек реально свободен вечером: конец смены, сдвинутый личными делами,
 * которые попадают на этот момент. null — график не заполнен, Infinity — занят весь день.
 */
export function readyTime(person, date) {
  const iv = workInterval(person, date);
  if (iv === undefined) return null;
  if (iv && iv.whole) return Infinity;
  let t = iv ? iv.end : 0;
  for (const c of commitmentsOn(person, date)) {
    const a = toMin(c.start), b = toMin(c.end);
    if (a <= t && t < b) t = b;
  }
  return t;
}

/**
 * Вечерний переезд от Оли домой.
 * covered — в этот день Киру и так забирает родитель на допзанятие;
 * parent — идёт тот, кто раньше освободился; grandma — Оля приводит сама.
 */
export function homeLeg(date) {
  if (!state.settings.schoolPickupByGrandma) return null;
  const occs = occurrencesOn(date).filter(o => !o.skipped);
  const school = occs.find(o => o.act.type === 'school');
  if (!school) return null;

  const after = occs.find(o => o.act.id !== school.act.id && o.act.needTo && toMin(o.start) >= toMin(school.end));
  if (after) return { mode: 'covered', occ: after };

  const manual = getAssignment('home', date, 'home');
  const deadline = toMin(state.settings.homeBy || '20:00');
  const list = (state.settings.priority || []).map(p => ({ person: p, t: readyTime(p, date) }));
  if (manual) return { mode: 'manual', person: manual, t: list.find(c => c.person === manual)?.t ?? null, deadline };

  const known = list.filter(c => c.t !== null);
  if (!known.length) return { mode: 'unknown', deadline };

  const able = known.filter(c => c.t <= deadline).sort((a, b) => a.t - b.t);
  if (able.length) return { mode: 'parent', person: able[0].person, t: able[0].t, options: able, deadline };
  return { mode: 'grandma', late: known, deadline };
}

/** Сводка по дню и по неделе — для подписей и красной точки на вкладке. */
export function dayIssues(date) {
  let none = 0, unknown = 0, soft = 0;
  for (const occ of occurrencesOn(date)) {
    if (occ.skipped) continue;
    for (const kind of legsOf(occ)) {
      const r = resolveLeg(occ, kind);
      if (r.mode === 'none') none++;
      else if (r.mode === 'unknown') unknown++;
      else if (r.mode === 'soft') soft++;
    }
  }
  const h = homeLeg(date);
  if (h && h.mode === 'unknown') unknown++;
  return { none, unknown, soft };
}

export function weekIssues(monday) {
  return weekDates(monday).reduce((acc, d) => {
    const i = dayIssues(d);
    acc.none += i.none; acc.unknown += i.unknown; acc.soft += i.soft; return acc;
  }, { none: 0, unknown: 0, soft: 0 });
}

/** Уроки из дневника на эту дату, по времени. */
export function lessonsOn(date) {
  return Object.values(state.lessons)
    .filter((l) => l.date === date)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function homeworkOn(date) {
  return Object.values(state.homework).filter(h => h.date === date)
    .sort((a, b) => String(a.subject).localeCompare(String(b.subject), 'ru'));
}
export function homeworkInWeek(monday) {
  const days = weekDates(monday);
  return Object.values(state.homework).filter(h => days.includes(h.date))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.subject).localeCompare(String(b.subject), 'ru'));
}
