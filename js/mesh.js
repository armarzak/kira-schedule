// Дневник МЭШ: разбор снимка, снятого закладкой на сайте school.mos.ru,
// и слияние с данными приложения. Прямой запрос из приложения здесь тоже есть,
// но он работает, только если дневник отдаёт CORS-заголовки.

import { state, save, upsertHomework, removeHomeworkKey, replaceLessons } from './store.js';
import { weekDates, mondayOf, todayISO } from './util.js';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

/** Нужен ли нам этот предмет (сравнение по куску слова из настроек). */
export function wanted(subject) {
  const keys = state.settings.mesh.keywords || [];
  const n = norm(subject);
  return keys.some((k) => n.includes(norm(k)));
}

/** Домашка одной записи: текст плюс ЦДЗ, если оно есть. */
function homeworkText(item) {
  const parts = [];
  if (item.text) parts.push(item.text);
  const cdz = (item.cdz || []).map((t) => String(t).replace(/^\s*ЦДЗ\s*:?\s*/i, '').trim()).filter(Boolean);
  if (cdz.length) parts.push('ЦДЗ: ' + cdz.join(', '));
  return parts.join(' · ');
}

/**
 * Разобрать снимок и влить его в данные.
 * Ручные записи не трогаются: у пришедших из дневника свой источник.
 */
export function applySnapshot(snapshot) {
  if (!snapshot || snapshot.v !== 1 || !Array.isArray(snapshot.days)) {
    throw new Error('это не похоже на снимок дневника');
  }
  const stats = { days: 0, lessons: 0, homework: 0, removed: 0, skipped: 0 };
  const dates = new Set();

  for (const day of snapshot.days) {
    if (!day?.date) continue;
    dates.add(day.date);
    const lessons = (day.lessons || [])
      .filter((l) => { if (wanted(l.s)) return true; stats.skipped++; return false; })
      .map((l) => ({ subject: l.s, start: l.b, end: l.e || l.b }));
    replaceLessons(day.date, lessons);
    stats.days++; stats.lessons += lessons.length;
  }

  const seen = new Set();
  for (const item of snapshot.hw || []) {
    if (!item?.date || !wanted(item.s)) { if (item?.s) stats.skipped++; continue; }
    const key = `mesh:${item.id ?? item.date + ':' + item.s}`;
    seen.add(key);
    const text = homeworkText(item);
    if (!text) continue;
    const old = state.homework[key];
    if (old && old.text === text && old.done === !!item.done && old.date === item.date) continue;
    upsertHomework({
      id: key, date: item.date, subject: item.s, text,
      done: old?.done ?? !!item.done, source: 'mesh', cdz: item.cdz || [],
    });
    stats.homework++;
  }

  // Задание, снятое в дневнике, убираем и у нас — но только из того же периода
  // и только то, что пришло оттуда же.
  for (const [key, h] of Object.entries(state.homework)) {
    if (h.source !== 'mesh' || seen.has(key)) continue;
    if (snapshot.from && snapshot.to && h.date >= snapshot.from && h.date <= snapshot.to) {
      removeHomeworkKey(key); stats.removed++;
    }
  }

  state.settings.mesh.lastImport = new Date().toISOString();
  if (snapshot.student) state.settings.mesh.student = snapshot.student;
  save();
  return stats;
}

/** Разобрать то, что вставили в поле: JSON целиком или с лишними пробелами. */
export function applyText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('пусто — скопируйте снимок закладкой на сайте дневника');
  let parsed;
  try { parsed = JSON.parse(trimmed); }
  catch (e) { throw new Error('не разобрать: это должен быть текст, который кладёт в буфер закладка'); }
  return applySnapshot(parsed);
}

/** Текст закладки: исходник лежит рядом, чтобы не расходился с приложением. */
export async function bookmarkletText() {
  const res = await fetch('tools/mesh-snapshot.js', { cache: 'no-store' });
  if (!res.ok) throw new Error('не нашёл tools/mesh-snapshot.js');
  return 'javascript:' + encodeURIComponent(await res.text());
}

/**
 * Прямой запрос в дневник из приложения. Сработает, только если МЭШ отдаёт
 * CORS-заголовки на наш адрес; иначе браузер не покажет нам ответ.
 */
export async function fetchDirect(token, studentId, from = mondayOf(todayISO())) {
  const dates = weekDates(from);
  const call = async (path) => {
    const r = await fetch('https://school.mos.ru/api/' + path, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json, text/plain, */*',
        'X-mes-subsystem': 'familyweb',
      },
    });
    if (!r.ok) throw new Error(path.split('?')[0] + ' вернул ' + r.status);
    return r.json();
  };
  const schedule = await call(`family/web/v1/schedule/short?student_id=${studentId}&dates=${dates.join(',')}`);
  const homework = await call(`family/web/v1/homeworks?from=${dates[0]}&to=${dates[dates.length - 1]}&student_id=${studentId}`);
  return applySnapshot({
    v: 1, from: dates[0], to: dates[dates.length - 1],
    days: (schedule?.payload || []).map((d) => ({
      date: d.date,
      lessons: (d.lessons || []).map((l) => ({
        s: l.subject_name || '', b: String(l.begin_time || '').slice(0, 5), e: String(l.end_time || '').slice(0, 5),
      })),
    })),
    hw: (homework?.payload || []).map((h) => ({
      id: h.homework_entry_id ?? h.homework_id, date: h.date || h.date_prepared_for,
      s: h.subject_name || '', text: (h.homework || h.description || '').trim(),
      cdz: (h.materials || []).map((m) => m.title || m.type).filter(Boolean), done: !!h.is_done,
    })),
  });
}
