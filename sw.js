// Lifetracker offline helper (CORE-5).
// Saves every app file on the phone so the app opens with no internet.
//
// RULE: every time a file is added, add it to FILES below AND bump CACHE_VERSION.
// Bumping the version makes phones fetch the new files and throw away the old copy.

const CACHE_VERSION = 2;
const CACHE_NAME = `lifetracker-v${CACHE_VERSION}`;

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
  './core/fonts/Nunito-Variable.ttf',

  // modules
  './water/index.js',
  './sleep/index.js',
  './weight/index.js',
  './food/index.js',
  './money/index.js',
  './tasks/index.js',
  './reading/index.js',
  './bloodtests/index.js',

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
