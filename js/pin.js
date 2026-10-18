// ПИН на смену человека. Это не защита данных — они лежат в браузере
// устройства, и кто взял телефон, доберётся до них мимо приложения.
// Это переключатель «кто сейчас за устройством» и замок от случайных правок.
// Храним не сам ПИН, а его отпечаток, чтобы он не читался глазами в данных.

import { state, save } from './store.js';

export const hasPin = (person) => !!state.settings.pins?.[person];

async function fingerprint(person, pin) {
  const data = new TextEncoder().encode(`kira:${person}:${String(pin).trim()}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function setPin(person, pin) {
  if (!/^\d{4,8}$/.test(String(pin).trim())) throw new Error('нужно от четырёх до восьми цифр');
  state.settings.pins = { ...(state.settings.pins || {}), [person]: await fingerprint(person, pin) };
  state.settings.updatedAt = Date.now();
  save();
}

export function clearPin(person) {
  if (!state.settings.pins) return;
  delete state.settings.pins[person];
  state.settings.updatedAt = Date.now();
  save();
}

export async function checkPin(person, pin) {
  const saved = state.settings.pins?.[person];
  if (!saved) return true;
  return saved === await fingerprint(person, pin);
}

/** Взрослые могут сбросить чужой ПИН, если его забыли. */
export const canReset = (viewer) => viewer === 'me' || viewer === 'wife';
