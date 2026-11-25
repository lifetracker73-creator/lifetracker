// Lifetracker offline helper (CORE-5).
// Saves every app file on the phone so the app opens with no internet.
//
// RULE: every time a file is added, add it to FILES below AND bump CACHE_VERSION.
// Bumping the version makes phones fetch the new files and throw away the old copy.

const CACHE_VERSION = 27;
const CACHE_NAME = `lifetracker-v${CACHE_VERSION}`;

// Laptop testing address (not the live link). Phones and the live link keep using saved copies first.
const IS_LAPTOP = ['localhost', '127.0.0.1'].includes(self.location.hostname);

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',

  // core
  './core/styles.css',
  './core/ui.js',
  './core/storage.js',
  './core/router.js',
  './core/dates.js',
  './core/format.js',
  './core/sync.js',
  './core/settings.js',
  './core/charts.js',
  './core/xlsx.js',
  './core/notify.js',
  './core/appearance.js',
  './core/backup.js',
  './core/menu.js',
  './core/home.js',
  './core/buddy.js',
  './core/welcome.js',
  './core/refills.js',
  './core/philosophy.js',
  './core/vendor/chart.umd.min.js',
  './core/fonts/Nunito-Variable.ttf',
  './core/fonts/Quicksand-Variable.ttf',
  './core/fonts/Comfortaa-Variable.ttf',
  './core/fonts/Lexend-Variable.ttf',
  './core/fonts/Lora-Variable.ttf',

  // modules
  './water/index.js',
  './sleep/index.js',
  './weight/index.js',
  './food/index.js',
  './money/index.js',
  './money/split.js',
  './money/lent.js',
  './money/daily.js',
  './tasks/index.js',
  './reading/index.js',
  './medical/index.js',
  './gym/index.js',
  './refills/index.js',

  // icons
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

// Install: download and save all files. If any file is missing, the update is skipped safely.
// A new version then waits until the app says "go" (the "New version available" message).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

// The app sends this when you tap "New version available — tap to refresh".
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Tapping a notification (CORE-9): bring the app forward and open the right screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || '';
  const url = self.registration.scope + (path ? `#/${path}` : '');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        return open.focus().then((c) => (path && c && c.navigate ? c.navigate(url).catch(() => c) : c));
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Activate: delete older saved copies of the app.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('lifetracker-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Fetch: use the saved copy first; fall back to the internet for anything not saved.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // On the laptop (localhost), always get the newest files so every change shows on reload.
  // Falls back to the saved copy only if the laptop's local server isn't running.
  if (IS_LAPTOP) {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache' }).catch(() => (request.mode === 'navigate'
        ? caches.match('./index.html')
        : caches.match(request, { ignoreSearch: true }))),
    );
    return;
  }

  // Opening the app (any page address) always gets the saved index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((saved) => saved || fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((saved) => saved || fetch(request)),
  );
});
