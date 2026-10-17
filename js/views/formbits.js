// Мелкие части форм, общие для нескольких экранов.

import { el, field, DOW_SHORT } from '../util.js';

/** Выбор дней недели. Возвращает узел с методом .value() */
export function dowPicker(selected = []) {
  const set = new Set(selected);
  const box = el('div', { class: 'dow-pick' });
  for (let d = 1; d <= 7; d++) {
    const b = el('button', { type: 'button', 'aria-pressed': set.has(d) ? 'true' : 'false', text: DOW_SHORT[d] });
    b.addEventListener('click', () => {
      if (set.has(d)) set.delete(d); else set.add(d);
      b.setAttribute('aria-pressed', set.has(d) ? 'true' : 'false');
    });
    box.append(b);
  }
  box.value = () => [...set].sort();
  return box;
}

export function timeRow(start, end) {
  const a = el('input', { type: 'time', value: start });
  const b = el('input', { type: 'time', value: end });
  return { node: el('div', { class: 'field-row' }, field('Начало', a), field('Конец', b)), start: a, end: b };
}

export function checkbox(label, checked) {
  const input = el('input', { type: 'checkbox', checked: !!checked });
  return { node: el('label', { class: 'check' }, input, el('span', { text: label })), input };
}
