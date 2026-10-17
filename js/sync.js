// Синхронизация с облаком Supabase: анонимный вход, семейный код, обмен строками.
// Приложение работает и без неё — модуль подключается, только если заполнены настройки.

import { state, save, subscribe, rowsSince, applyRows } from './store.js';

const PULL_EVERY = 45_000;
const PUSH_DELAY = 1500;

let client = null;
let familyId = null;
let pushTimer = null;
let pullTimer = null;
let running = false;
let unsubscribe = null;
let seenSettings = false;

let status = { mode: 'off', text: 'выключено' };
const listeners = new Set();
export const getStatus = () => status;
export function onStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); }
function setStatus(mode, text) {
  status = { mode, text, at: Date.now() };
  for (const fn of listeners) fn(status);
}

export const configured = () => {
  const c = state.settings.supabase;
  return !!(c.url && c.anonKey && c.familyCode);
};

function loadLibrary() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'js/vendor/supabase.umd.js';
    tag.onload = () => window.supabase?.createClient
      ? resolve(window.supabase)
      : reject(new Error('библиотека загрузилась, но пустая'));
    tag.onerror = () => reject(new Error('не удалось загрузить библиотеку'));
    document.head.append(tag);
  });
}

/** Подключиться и сразу обменяться данными. Бросает ошибку, если что-то не так. */
export async function start() {
  if (!configured()) { stop(); setStatus('off', 'выключено'); return; }
  setStatus('busy', 'подключаюсь…');
  try {
    const lib = await loadLibrary();
    const cfg = state.settings.supabase;
    client = lib.createClient(cfg.url.replace(/\/+$/, ''), cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kira-auth' },
    });

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw new Error(error.message);
    }

    const { data, error } = await client.rpc('join_family', { code: cfg.familyCode });
    if (error) throw new Error(error.message);
    familyId = data;
    state.settings.sync.familyId = familyId;
    save();

    running = true;
    await syncNow();

    // Первое устройство в семье отдаёт общие настройки (имена, смены, правила) в облако.
    if (!state.settings.updatedAt && !seenSettings) {
      state.settings.updatedAt = Date.now();
      save();
      await syncNow();
    }

    clearInterval(pullTimer);
    pullTimer = setInterval(() => { if (!document.hidden) syncNow().catch(() => {}); }, PULL_EVERY);
    if (!unsubscribe) unsubscribe = subscribe(schedulePush);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
  } catch (e) {
    const text = prettify(e.message || String(e));
    stop();
    setStatus('error', text);
    throw new Error(text);
  }
}

export function stop() {
  running = false;
  clearInterval(pullTimer); clearTimeout(pushTimer);
  unsubscribe?.(); unsubscribe = null;
  window.removeEventListener('focus', onFocus);
  document.removeEventListener('visibilitychange', onFocus);
  client = null; familyId = null; seenSettings = false;
}

/** Отключить это устройство от облака и забыть ключи. */
export async function disconnect() {
  try { await client?.auth.signOut(); } catch (e) { /* и так отключаемся */ }
  stop();
  state.settings.supabase = { url: '', anonKey: '', familyCode: '' };
  state.settings.sync = { familyId: null, lastPulled: null, lastPushedAt: 0 };
  save();
  setStatus('off', 'выключено');
}

const onFocus = () => { if (running && !document.hidden) syncNow().catch(() => {}); };

function schedulePush() {
  if (!running) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow().catch(() => {}), PUSH_DELAY);
}

let inFlight = null;
export function syncNow() {
  if (!client || !familyId) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const got = await pull();
      const sent = await push();
      setStatus('ok', summary(got, sent));
    } catch (e) {
      setStatus('error', prettify(e.message || String(e)));
      throw e;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function pull() {
  const since = state.settings.sync.lastPulled || '1970-01-01T00:00:00Z';
  const { data, error } = await client
    .from('items').select('id,kind,data,deleted,updated_at')
    .eq('family_id', familyId).gt('updated_at', since)
    .order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (!data?.length) return 0;
  if (data.some(r => r.kind === 'settings')) seenSettings = true;

  const { applied, newest } = applyRows(data);
  state.settings.sync.lastPulled = data[data.length - 1].updated_at;
  // Пришедшее чужое не отправляем обратно.
  state.settings.sync.lastPushedAt = Math.max(state.settings.sync.lastPushedAt || 0, newest);
  save();
  return applied;
}

async function push() {
  const since = state.settings.sync.lastPushedAt || 0;
  const rows = rowsSince(since);
  if (!rows.length) return 0;

  const { error } = await client.from('items')
    .upsert(rows.map(r => ({ family_id: familyId, ...r })), { onConflict: 'family_id,id' });
  if (error) throw new Error(error.message);

  state.settings.sync.lastPushedAt = rows.reduce((m, r) => Math.max(m, Date.parse(r.updated_at)), since);
  save();
  return rows.length;
}

function summary(got, sent) {
  const time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (got && sent) return `обновлено в ${time}: получено ${got}, отправлено ${sent}`;
  if (got) return `обновлено в ${time}: получено ${got}`;
  if (sent) return `обновлено в ${time}: отправлено ${sent}`;
  return `всё совпадает, проверено в ${time}`;
}

function prettify(msg = '') {
  if (/Неизвестный семейный код/i.test(msg)) return 'неизвестный семейный код';
  if (/Anonymous sign-ins are disabled/i.test(msg)) return 'в проекте не включён анонимный вход';
  if (/Could not find the function/i.test(msg)) return 'в базе не выполнен supabase.sql';
  if (/Failed to fetch|NetworkError|ENOTFOUND/i.test(msg)) return 'нет связи с облаком — проверь адрес проекта';
  if (/Invalid API key|JWT/i.test(msg)) return 'неверный ключ проекта';
  return msg;
}
