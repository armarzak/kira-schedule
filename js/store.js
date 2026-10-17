// Хранилище: одно состояние в localStorage + подписки на изменения.
// Каждая запись несёт updatedAt — это нужно для будущей синхронизации с облаком.

import { uid, todayISO } from './util.js';

const KEY = 'kira-schedule-v1';

export const PEOPLE_ORDER = ['me', 'wife', 'grandma', 'kira'];

// Служебные варианты дня — они есть у всех.
export const SPECIAL_SHIFTS = {
  free:   { label: 'Свободный день' },
  busy:   { label: 'Весь день занят' },
  custom: { label: 'Другое время…' },
};

// Готовые смены. У каждого свои: у тебя три, у Юли одна.
const DEFAULT_PRESETS = {
  a: { start: '08:30', end: '17:30', for: ['me'] },
  b: { start: '09:30', end: '18:30', for: ['me'] },
  c: { start: '11:30', end: '20:30', for: ['me'] },
  w: { start: '10:00', end: '19:00', for: ['wife'] },
};

const DEFAULT_SUBJECTS = [
  'Математика', 'Русский язык', 'Литература', 'Английский язык',
  'Окружающий мир', 'История', 'Биология', 'География',
  'ИЗО', 'Музыка', 'Технология', 'Физкультура', 'Информатика',
];

function defaults() {
  return {
    v: 2,
    settings: {
      people: {
        me:      { name: 'Тема',  emoji: '🧑' },
        wife:    { name: 'Юля',   emoji: '👩' },
        grandma: { name: 'Оля',   emoji: '👵' },
        kira:    { name: 'Кира',  emoji: '🎒' },
      },
      adults: ['me', 'wife', 'grandma'],   // чьи графики ведём
      priority: ['me', 'wife'],            // кто возит Киру: бабушка занята Ксюхой
      bufferMin: 0,                        // запас до/после смены, минуты
      grandmaDefaultFree: true,            // Оля свободна, если день не заполнен
      schoolPickupByGrandma: true,         // из школы Киру всегда забирает Оля
      homeBy: '20:00',                     // к этому времени Кира должна быть дома
      shiftPresets: DEFAULT_PRESETS,
      updatedAt: 0,                        // когда последний раз меняли общие настройки
      sync: { familyId: null, lastPulled: null, lastPushedAt: 0 },
      viewer: null,                        // кто пользуется этим устройством
      subjects: DEFAULT_SUBJECTS,
      supabase: { url: '', anonKey: '', familyCode: '' },
      mesh: { token: '', profileId: '', studentId: '' },
    },
    activities: {},   // занятия Киры: id -> {...}
    commitments: {},  // личные дела взрослых (спортзал и т.п.): id -> {...}
    shifts: {},       // 'person:YYYY-MM-DD' -> {code, start?, end?, updatedAt}
    assignments: {},  // 'actId@date:to' | ':from' -> {person, updatedAt}
    skips: {},        // 'actId@date' -> {updatedAt}  — занятие отменено в этот день
    homework: {},     // id -> {date, subject, text, done, updatedAt}
    tombstones: {},   // 'kind:id' -> {kind, updatedAt} — что удалили, чтобы удаление доехало до других
  };
}

function migrate(s) {
  const d = defaults();
  const out = { ...d, ...s };
  out.v = d.v;
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.settings.people = { ...d.settings.people, ...(s.settings?.people || {}) };
  out.settings.supabase = { ...d.settings.supabase, ...(s.settings?.supabase || {}) };
  out.settings.mesh = { ...d.settings.mesh, ...(s.settings?.mesh || {}) };
  out.settings.sync = { ...d.settings.sync, ...(s.settings?.sync || {}) };
  for (const k of ['activities', 'commitments', 'shifts', 'assignments', 'skips', 'homework', 'tombstones'])
    out[k] = out[k] || {};

  // Переход на вторую версию: имена по умолчанию и бабушка вне подбора.
  if ((s.v || 1) < 2) {
    const old = { me: 'Я', wife: 'Жена', grandma: 'Бабушка' };
    for (const [k, name] of Object.entries(old))
      if (out.settings.people[k]?.name === name) out.settings.people[k].name = d.settings.people[k].name;
    out.settings.priority = (out.settings.priority || []).filter(p => p !== 'grandma');
    if (!out.settings.priority.length) out.settings.priority = ['me', 'wife'];
  }
  out.settings.adults = out.settings.adults?.length ? out.settings.adults : d.settings.adults;
  if (!out.settings.shiftPresets || !Object.keys(out.settings.shiftPresets).length)
    out.settings.shiftPresets = d.settings.shiftPresets;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('Не удалось прочитать сохранённые данные', e); }
  return seed(defaults());
}

// Заготовка на первый запуск, чтобы экран не был пустым.
// id постоянный, а отметка времени нулевая: такая запись не уезжает в облако
// и уступает любой настоящей — иначе у каждого нового устройства появлялась бы
// вторая «Школа».
function seed(s) {
  s.activities.school = {
    id: 'school', title: 'Школа', type: 'school', place: '',
    days: [1, 2, 3, 4, 5], start: '08:30', end: '14:00',
    needTo: true, needFrom: true, updatedAt: 0,
  };
  return s;
}

export const state = load();

const subs = new Set();
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };

export function save() {
  // Пишем сразу: данных мало, а потерять их при закрытии вкладки нельзя.
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('Не удалось сохранить', e); }
  for (const fn of subs) fn();
}

// --- операции ---

/** Запомнить удаление, чтобы оно доехало до других устройств. */
function tomb(kind, id) {
  state.tombstones[`${kind}:${id}`] = { kind, updatedAt: Date.now() };
}
/** Отметить, что общие настройки изменились. */
export function touchSettings() { state.settings.updatedAt = Date.now(); save(); }

export function upsertActivity(a) {
  a.id = a.id || uid(); a.updatedAt = Date.now();
  state.activities[a.id] = a; save(); return a;
}
export function removeActivity(id) {
  delete state.activities[id]; tomb('activity', id);
  for (const k of Object.keys(state.assignments))
    if (k.startsWith(id + '@')) { delete state.assignments[k]; tomb('assignment', k); }
  for (const k of Object.keys(state.skips))
    if (k.startsWith(id + '@')) { delete state.skips[k]; tomb('skip', k); }
  save();
}
export function upsertCommitment(c) {
  c.id = c.id || uid(); c.updatedAt = Date.now();
  state.commitments[c.id] = c; save(); return c;
}
export function removeCommitment(id) { delete state.commitments[id]; tomb('commitment', id); save(); }

export function setShift(person, date, value) {
  const k = `${person}:${date}`;
  if (!value) { delete state.shifts[k]; tomb('shift', k); }
  else state.shifts[k] = { ...value, updatedAt: Date.now() };
  save();
}
export const getShift = (person, date) => state.shifts[`${person}:${date}`] || null;

/** Смена по коду, либо null для служебных и неизвестных. */
export const presetOf = code => state.settings.shiftPresets[code] || null;

/** Смены, предложенные этому человеку. */
export const presetsFor = person => Object.entries(state.settings.shiftPresets)
  .filter(([, p]) => !p.for || p.for.includes(person))
  .sort((a, b) => a[1].start.localeCompare(b[1].start));

export function upsertPreset(code, data) {
  code = code || 's' + uid().slice(0, 4);
  state.settings.shiftPresets[code] = data;
  state.settings.updatedAt = Date.now();
  save(); return code;
}
export function removePreset(code) {
  delete state.settings.shiftPresets[code];
  state.settings.updatedAt = Date.now();
  save();
}

export function setAssignment(actId, date, kind, person) {
  const k = `${actId}@${date}:${kind}`;
  if (!person) { delete state.assignments[k]; tomb('assignment', k); }
  else state.assignments[k] = { person, updatedAt: Date.now() };
  save();
}
export const getAssignment = (actId, date, kind) => state.assignments[`${actId}@${date}:${kind}`]?.person || null;

export function toggleSkip(actId, date) {
  const k = `${actId}@${date}`;
  if (state.skips[k]) { delete state.skips[k]; tomb('skip', k); }
  else state.skips[k] = { updatedAt: Date.now() };
  save();
}
export const isSkipped = (actId, date) => !!state.skips[`${actId}@${date}`];

export function upsertHomework(h) {
  h.id = h.id || uid(); h.updatedAt = Date.now();
  h.date = h.date || todayISO();
  state.homework[h.id] = h; save(); return h;
}
export function removeHomework(id) { delete state.homework[id]; tomb('homework', id); save(); }

export function patchSettings(patch) {
  Object.assign(state.settings, patch);
  // Общими настройки считаются, только если менялось что-то из SHARED_SETTINGS:
  // «кто за устройством» и ключи подключения — дело местное.
  if (Object.keys(patch).some(k => SHARED_SETTINGS.includes(k))) state.settings.updatedAt = Date.now();
  save();
}
/** Настройки, общие для всей семьи. Остальное (кто за устройством, ключи) — местное. */
const SHARED_SETTINGS = ['people', 'adults', 'priority', 'bufferMin', 'grandmaDefaultFree',
  'schoolPickupByGrandma', 'homeBy', 'subjects', 'shiftPresets'];
const pickShared = src => Object.fromEntries(
  SHARED_SETTINGS.filter(k => src?.[k] !== undefined).map(k => [k, src[k]]));
export const personName = id => state.settings.people[id]?.name || id;

// Какая коллекция за какой вид записи отвечает при обмене с облаком.
const COLLECTIONS = {
  activity: 'activities', commitment: 'commitments', homework: 'homework',
  shift: 'shifts', assignment: 'assignments', skip: 'skips',
};

/** Всё, что изменилось после момента ts — в виде строк для облака. */
export function rowsSince(ts) {
  const iso = ms => new Date(ms).toISOString();
  const rows = [];
  for (const [kind, map] of Object.entries(COLLECTIONS))
    for (const [id, rec] of Object.entries(state[map]))
      if ((rec.updatedAt || 0) > ts)
        rows.push({ id: `${kind}:${id}`, kind, data: rec, deleted: false, updated_at: iso(rec.updatedAt) });
  for (const [key, t] of Object.entries(state.tombstones))
    if ((t.updatedAt || 0) > ts)
      rows.push({ id: key, kind: t.kind, data: {}, deleted: true, updated_at: iso(t.updatedAt) });
  if ((state.settings.updatedAt || 0) > ts)
    rows.push({
      id: 'settings:main', kind: 'settings', data: pickShared(state.settings),
      deleted: false, updated_at: iso(state.settings.updatedAt),
    });
  return rows;
}

/** Применить строки из облака. Выигрывает тот, кто изменил позже. */
export function applyRows(rows) {
  let applied = 0, newest = 0;
  for (const r of rows) {
    const at = Date.parse(r.updated_at);
    if (!at) continue;
    newest = Math.max(newest, at);
    const sep = r.id.indexOf(':');
    const kind = r.id.slice(0, sep), id = r.id.slice(sep + 1);

    if (kind === 'settings') {
      if (at > (state.settings.updatedAt || 0)) {
        Object.assign(state.settings, pickShared(r.data));
        state.settings.updatedAt = at;
        applied++;
      }
      continue;
    }
    const map = COLLECTIONS[kind];
    if (!map) continue;
    const localAt = state[map][id]?.updatedAt || state.tombstones[r.id]?.updatedAt || 0;
    if (at <= localAt) continue;
    if (r.deleted) {
      delete state[map][id];
      state.tombstones[r.id] = { kind, updatedAt: at };
    } else {
      state[map][id] = { ...r.data, updatedAt: at };
      delete state.tombstones[r.id];
    }
    applied++;
  }
  if (applied) save();
  return { applied, newest };
}

export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const parsed = migrate(JSON.parse(text));
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, parsed);
  save();
}
export function resetAll() {
  const fresh = seed(defaults());
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
  save();
}
