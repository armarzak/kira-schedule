// Офлайн-кэш: приложение открывается без сети, данные лежат в localStorage.
const CACHE = 'kira-v4';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/logic.js',
  'js/views/week.js', 'js/views/homework.js', 'js/views/activities.js',
  'js/views/shifts.js', 'js/views/settings.js', 'js/views/pickers.js', 'js/views/formbits.js',
  'js/sync.js', 'js/mesh.js', 'js/vendor/supabase.umd.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Сначала сеть, причём мимо обычного кэша браузера: GitHub Pages отдаёт файлы
  // с запасом на десять минут, и без этого обновление доезжало бы с опозданием.
  // Кэш остаётся запасом на случай, когда сети нет.
  e.respondWith(
    fetch(req.url, { cache: 'reload', credentials: 'same-origin' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req))
  );
});
