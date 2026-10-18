// Приглашение: ссылка и QR, по которым устройство настраивается само —
// адрес проекта, ключ и семейный код вводить не нужно.
// В ссылке лежит семейный код, то есть пароль от данных: её отправляют
// своим и в личной переписке, а не выкладывают.

import { state, save } from './store.js';

const toBase64Url = (text) => btoa(unescape(encodeURIComponent(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => decodeURIComponent(escape(
  atob(text.replace(/-/g, '+').replace(/_/g, '/'))));

/** Ссылка, по которой настроится любое устройство семьи. */
export function inviteLink() {
  const c = state.settings.supabase;
  if (!c.url || !c.anonKey || !c.familyCode) throw new Error('сначала подключите общий доступ');
  const payload = toBase64Url(JSON.stringify({ u: c.url, k: c.anonKey, c: c.familyCode }));
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  return `${base}#join=${payload}`;
}

/**
 * Если приложение открыли по такой ссылке — забрать настройки из адреса
 * и сразу его почистить, чтобы код не остался в истории браузера.
 */
export function takeInviteFromUrl() {
  const match = location.hash.match(/^#join=([A-Za-z0-9\-_]+)$/);
  if (!match) return false;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const data = JSON.parse(fromBase64Url(match[1]));
    if (!data.u || !data.k || !data.c) return false;
    state.settings.supabase = { url: data.u, anonKey: data.k, familyCode: data.c };
    save();
    return true;
  } catch (e) {
    console.warn('Ссылка приглашения не разобралась', e);
    return false;
  }
}

/** QR с этой же ссылкой — чтобы навести камерой телефона. */
export async function inviteQr(text, size = 232) {
  if (!window.qrcode) {
    await new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = 'js/vendor/qrcode.js';
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('не загрузилась библиотека QR'));
      document.head.append(tag);
    });
  }
  // Типоразмер 0 — подобрать автоматически, коррекция ошибок средняя.
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(size / (count + 8)));
  const pad = cell * 4;
  const side = count * cell + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  canvas.style.width = canvas.style.height = side + 'px';
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(pad + c * cell, pad + r * cell, cell, cell);
    }
  }
  return canvas;
}
