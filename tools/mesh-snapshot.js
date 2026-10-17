/*
 * Снимок дневника МЭШ.
 *
 * Запускается НА САЙТЕ school.mos.ru, где вы уже вошли: там запросы к API идут
 * со своего же адреса, поэтому ни прокси, ни CORS не нужны, а токен не покидает
 * браузер. Собирает уроки и домашние задания за две недели и кладёт в буфер
 * обмена — дальше это вставляется в приложении, «Ещё» → «Дневник МЭШ».
 *
 * Готовую строку-закладку делает tools/build-bookmarklet.py.
 */
(async () => {
  const say = (text) => { try { alert(text); } catch (e) { console.log(text); } };

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() + (today.getDay() === 0 ? -6 : 1 - today.getDay()));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return iso(d);
  });

  // Токен лежит в куке aupd_token; если куку не видно, пробуем хранилища.
  const fromCookie = (document.cookie.match(/(?:^|;\s*)aupd_token=([^;]+)/) || [])[1];
  const fromStore = (() => {
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        const value = store.getItem(key) || '';
        if (/token/i.test(key) && value.length > 40 && !/refresh/i.test(key)) return value.replace(/^"|"$/g, '');
      }
    }
    return null;
  })();
  const token = fromCookie || fromStore;
  if (!token) {
    say('Не нашёл токен дневника.\n\nОткройте school.mos.ru, войдите и запустите закладку на странице дневника.');
    return;
  }

  const api = async (path) => {
    const r = await fetch('https://school.mos.ru/api/' + path, {
      credentials: 'include',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json, text/plain, */*',
        'X-mes-subsystem': 'familyweb',
      },
    });
    if (!r.ok) throw new Error(path.split('?')[0] + ' вернул ' + r.status);
    return r.json();
  };

  try {
    const profile = await api('family/web/v1/profile');
    const children = profile?.children || [];
    const student = children[0] || profile?.profile || {};
    const studentId = student.id ?? profile?.profile?.id;
    if (!studentId) throw new Error('не нашёл ученика в профиле');
    const name = [student.last_name, student.first_name].filter(Boolean).join(' ') || 'ученик';

    const schedule = await api(`family/web/v1/schedule/short?student_id=${studentId}&dates=${days.join(',')}`);
    const homework = await api(`family/web/v1/homeworks?from=${days[0]}&to=${days[days.length - 1]}&student_id=${studentId}`);

    const snapshot = {
      v: 1,
      student: name,
      from: days[0],
      to: days[days.length - 1],
      taken: new Date().toISOString(),
      days: (schedule?.payload || []).map((day) => ({
        date: day.date,
        lessons: (day.lessons || []).map((l) => ({
          s: l.subject_name || '',
          b: String(l.begin_time || '').slice(0, 5),
          e: String(l.end_time || '').slice(0, 5),
        })).filter((l) => l.s && l.b),
      })),
      hw: (homework?.payload || []).map((h) => ({
        id: h.homework_entry_id ?? h.homework_id,
        date: h.date || h.date_prepared_for,
        s: h.subject_name || '',
        text: (h.homework || h.description || '').trim(),
        cdz: (h.materials || []).map((m) => m.title || m.type || 'задание').filter(Boolean),
        done: !!h.is_done,
      })).filter((h) => h.date && h.s),
    };

    const text = JSON.stringify(snapshot);
    try {
      await navigator.clipboard.writeText(text);
      say(`Готово: ${snapshot.days.length} дней и ${snapshot.hw.length} заданий скопировано.\n\nТеперь в приложении: Ещё → Дневник МЭШ → Вставить.`);
    } catch (e) {
      const box = document.createElement('textarea');
      box.value = text;
      Object.assign(box.style, { position: 'fixed', inset: '10% 5%', width: '90%', height: '70%', zIndex: 99999 });
      document.body.appendChild(box);
      box.select();
      say('Буфер обмена недоступен. Данные в текстовом поле на странице: скопируйте вручную (Cmd+C).');
    }
  } catch (err) {
    say('Не получилось собрать данные: ' + (err && err.message ? err.message : err));
  }
})();
