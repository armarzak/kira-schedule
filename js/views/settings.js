// Экран «Ещё»: кто пользуется, имена, правила подбора, данные, облако и МЭШ.

import { el, field, sheet, option, confirmSheet } from '../util.js';
import { state, patchSettings, personName, PEOPLE_ORDER, save, exportJSON, importJSON, resetAll,
  upsertPreset, removePreset } from '../store.js';

export const title = () => ({ text: 'Настройки', sub: 'люди, правила и данные' });

export function render(ctx) {
  const wrap = el('div', { class: 'stack' });
  const s = state.settings;

  // --- кто ты ---
  wrap.append(el('h3', { class: 'section-label', text: 'Это устройство' }));
  wrap.append(el('div', { class: 'card' },
    el('button', { class: 'row', onclick: () => pickViewer(ctx) },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: 'Кто пользуется' }),
        el('div', { class: 'row-sub', text: s.viewer ? personName(s.viewer) : 'не выбрано' })),
      el('div', { class: 'row-right', text: '›' }))));

  // --- имена ---
  wrap.append(el('h3', { class: 'section-label', text: 'Имена' }));
  const names = el('div', { class: 'card', style: { padding: '14px 14px 2px' } });
  for (const p of PEOPLE_ORDER) {
    const inp = el('input', { type: 'text', value: s.people[p].name });
    inp.addEventListener('change', () => { s.people[p].name = inp.value.trim() || p; save(); ctx.rerender(); });
    names.append(field(p === 'me' ? 'Ты' : p === 'wife' ? 'Жена' : p === 'grandma' ? 'Бабушка' : 'Дочь', inp));
  }
  wrap.append(names);

  // --- смены ---
  wrap.append(el('h3', { class: 'section-label', text: 'Готовые смены' }));
  const shiftsCard = el('div', { class: 'card' });
  const presets = Object.entries(s.shiftPresets)
    .sort((a, b) => (s.adults.indexOf(a[1].for?.[0]) - s.adults.indexOf(b[1].for?.[0])) ||
      a[1].start.localeCompare(b[1].start));
  if (!presets.length) shiftsCard.append(el('p', { class: 'empty', text: 'Готовых смен нет — время придётся вводить каждый раз вручную.' }));
  for (const [code, p] of presets) {
    shiftsCard.append(el('button', { class: 'row', onclick: () => presetForm(ctx, code, p) },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: `${p.start} – ${p.end}` }),
        el('div', { class: 'row-sub', text: (p.for || []).map(personName).join(', ') || 'для всех' })),
      el('div', { class: 'row-right', text: '›' })));
  }
  wrap.append(shiftsCard);
  wrap.append(el('button', { class: 'btn secondary', style: { marginTop: '10px' }, text: '+ Смена', onclick: () => presetForm(ctx, null, null) }));

  // --- правила подбора ---
  wrap.append(el('h3', { class: 'section-label', text: 'Кого ставить первым' }));
  const prio = el('div', { class: 'card' });
  s.priority.forEach((p, i) => {
    prio.append(el('div', { class: 'row' },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: `${i + 1}. ${personName(p)}` })),
      el('button', { class: 'icon-btn', text: '↑', disabled: i === 0, onclick: () => move(i, -1, ctx) }),
      el('button', { class: 'icon-btn', text: '↓', disabled: i === s.priority.length - 1, onclick: () => move(i, 1, ctx) })));
  });
  wrap.append(prio);
  wrap.append(el('p', { class: 'hint', text: `Возят Киру только эти двое: ${personName('grandma')} занята младшей. Из свободных в нужное время берётся тот, кто выше в списке, а вечером от ${personName('grandma')} идёт тот, кто раньше освободился.` }));

  const buf = el('input', { type: 'number', min: '0', max: '120', step: '5', value: s.bufferMin });
  buf.addEventListener('change', () => { patchSettings({ bufferMin: Math.max(0, +buf.value || 0) }); ctx.rerender(); });
  const gran = el('input', { type: 'checkbox', checked: s.grandmaDefaultFree });
  gran.addEventListener('change', () => { patchSettings({ grandmaDefaultFree: gran.checked }); ctx.rerender(); });
  const home = el('input', { type: 'time', value: s.homeBy || '20:00' });
  home.addEventListener('change', () => { patchSettings({ homeBy: home.value || '20:00' }); ctx.rerender(); });
  const school = el('input', { type: 'checkbox', checked: s.schoolPickupByGrandma });
  school.addEventListener('change', () => { patchSettings({ schoolPickupByGrandma: school.checked }); ctx.rerender(); });
  wrap.append(el('div', { class: 'card', style: { padding: '14px' } },
    field('Кира должна быть дома к', home),
    field('Запас до и после смены, минут', buf),
    el('label', { class: 'check' }, school, el('span', { text: `Из школы всегда забирает ${personName('grandma')}` })),
    el('label', { class: 'check' }, gran, el('span', { text: `${personName('grandma')} свободна, если день не заполнен` }))));
  wrap.append(el('p', { class: 'hint', text: `Если никто из вас не освобождается до этого времени, приложение ставит «${personName('grandma')} приведёт сама».` }));

  // --- предметы ---
  wrap.append(el('h3', { class: 'section-label', text: 'Предметы' }));
  const subj = el('textarea', { style: { minHeight: '140px' } }, s.subjects.join('\n'));
  subj.addEventListener('change', () => {
    patchSettings({ subjects: subj.value.split('\n').map(x => x.trim()).filter(Boolean) });
  });
  wrap.append(el('div', { class: 'card', style: { padding: '14px' } }, field('По одному в строке', subj)));

  // --- данные ---
  wrap.append(el('h3', { class: 'section-label', text: 'Данные' }));
  wrap.append(el('div', { class: 'card' },
    el('button', { class: 'row', onclick: doExport },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: 'Сохранить копию в файл' }),
        el('div', { class: 'row-sub', text: 'JSON со всеми занятиями, графиками и домашкой' }))),
    el('button', { class: 'row', onclick: () => doImport(ctx) },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: 'Загрузить из файла' }),
        el('div', { class: 'row-sub', text: 'заменит текущие данные на этом устройстве' }))),
    el('button', { class: 'row', onclick: () => doReset(ctx) },
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: 'Начать с нуля', style: { color: 'var(--bad)' } }),
        el('div', { class: 'row-sub', text: 'удалить всё на этом устройстве' })))));

  // --- облако и МЭШ ---
  wrap.append(el('h3', { class: 'section-label', text: 'Общий доступ' }));
  wrap.append(cloudSection(ctx));

  wrap.append(el('h3', { class: 'section-label', text: 'МЭШ (следующий этап)' }));
  wrap.append(el('div', { class: 'card', style: { padding: '14px' } },
    el('p', { class: 'hint', style: { margin: 0 }, text: 'Здесь будет кнопка «обновить расписание и домашку из дневника»: токен из браузера вставляется один раз, запросы идут через облачную функцию.' })));

  wrap.append(el('p', { class: 'hint', style: { marginTop: '20px', textAlign: 'center' }, text: 'Расписание Киры · версия 2' }));
  return wrap;
}

function presetForm(ctx, code, p) {
  const isNew = !code;
  p = p || { start: '09:00', end: '18:00', for: [state.settings.adults[0]] };
  sheet(isNew ? 'Новая смена' : `${p.start} – ${p.end}`, close => {
    const who = el('select', {}, ...state.settings.adults.map(a =>
      el('option', { value: a, text: personName(a), selected: (p.for || []).includes(a) })));
    const from = el('input', { type: 'time', value: p.start });
    const to = el('input', { type: 'time', value: p.end });
    return [
      field('Чья смена', who),
      el('div', { class: 'field-row' }, field('Начало', from), field('Конец', to)),
      el('button', {
        class: 'btn', text: 'Сохранить',
        onclick: () => {
          if (!from.value || !to.value) return;
          upsertPreset(code, { start: from.value, end: to.value, for: [who.value] });
          close(); ctx.rerender();
        },
      }),
      !isNew && el('button', {
        class: 'btn danger', style: { marginTop: '8px' }, text: 'Удалить смену',
        onclick: async () => {
          if (await confirmSheet('Удалить смену?', 'Уже проставленные дни останутся как есть.')) {
            removePreset(code); close(); ctx.rerender();
          }
        },
      }),
    ];
  });
}

let syncPromise = null;
const loadSync = () => (syncPromise ||= import('../sync.js'));

function cloudSection(ctx) {
  const cfg = state.settings.supabase;
  const card = el('div', { class: 'card', style: { padding: '14px' } });
  const line = el('p', { class: 'hint', style: { margin: '0 0 12px' }, text: 'проверяю…' });
  card.append(line);

  const url = el('input', { type: 'text', value: cfg.url || '', placeholder: 'https://xxxx.supabase.co', autocapitalize: 'off', spellcheck: 'false' });
  const key = el('input', { type: 'text', value: cfg.anonKey || '', placeholder: 'ключ anon public', autocapitalize: 'off', spellcheck: 'false' });
  const code = el('input', { type: 'text', value: cfg.familyCode || '', placeholder: 'семейный код', autocapitalize: 'off', spellcheck: 'false' });
  card.append(field('Адрес проекта', url), field('Ключ anon public', key), field('Семейный код', code));

  const connect = el('button', {
    class: 'btn', text: cfg.url ? 'Переподключить' : 'Подключить',
    onclick: async () => {
      state.settings.supabase = { url: url.value.trim(), anonKey: key.value.trim(), familyCode: code.value.trim() };
      save();
      connect.disabled = true; connect.textContent = 'подключаюсь…';
      try {
        const m = await loadSync();
        await m.start();
        ctx.toast('Облако подключено');
      } catch (e) {
        ctx.toast('Не вышло: ' + (e.message || e));
      } finally {
        connect.disabled = false; ctx.rerender();
      }
    },
  });
  card.append(connect);

  if (cfg.url) {
    card.append(el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn secondary', text: 'Синхронизировать сейчас',
        onclick: async () => { const m = await loadSync(); m.syncNow().catch(() => {}); },
      }),
      el('button', {
        class: 'btn danger', text: 'Отключить',
        onclick: async () => {
          if (!await confirmSheet('Отключить это устройство?', 'Данные останутся в облаке и на этом устройстве, но обмен прекратится.', 'Отключить')) return;
          const m = await loadSync();
          await m.disconnect();
          ctx.toast('Отключено'); ctx.rerender();
        },
      })));
  }

  card.append(el('p', { class: 'hint', text: 'Ключ anon public публичный по задумке: данные закрыты правилами доступа и семейным кодом. Инструкция и SQL — в файле supabase.sql рядом с приложением.' }));

  loadSync().then(m => {
    m.onStatus(st => {
      const mark = { ok: '🟢', busy: '🟡', error: '🔴', off: '⚪️' }[st.mode] || '';
      line.textContent = `${mark} ${st.text}`;
      line.style.color = st.mode === 'error' ? 'var(--bad)' : 'var(--muted)';
    });
  }).catch(() => { line.textContent = 'модуль синхронизации не загрузился'; });

  return card;
}

function move(i, dir, ctx) {
  const p = state.settings.priority;
  const j = i + dir;
  [p[i], p[j]] = [p[j], p[i]];
  save(); ctx.rerender();
}

function pickViewer(ctx) {
  sheet('Кто пользуется этим устройством?', close => PEOPLE_ORDER.map(p => option({
    title: personName(p),
    pressed: state.settings.viewer === p,
    onclick: () => { patchSettings({ viewer: p }); close(); ctx.rerender(); },
  })));
}

function doExport() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kira-raspisanie-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}

function doImport(ctx) {
  const inp = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0]; if (!f) return;
    try { importJSON(await f.text()); ctx.toast('Данные загружены'); ctx.rerender(); }
    catch (e) { ctx.toast('Не получилось прочитать файл'); }
    inp.remove();
  });
  document.body.append(inp); inp.click();
}

async function doReset(ctx) {
  if (await confirmSheet('Удалить все данные?', 'Занятия, графики, домашка и назначения на этом устройстве будут удалены.', 'Удалить всё')) {
    resetAll(); ctx.toast('Готово, начинаем с нуля'); ctx.rerender();
  }
}
