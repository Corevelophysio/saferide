// SafeRide Service Worker — v3
// Caches the app shell and CDN libraries so the UI loads offline.
// Map tiles, routing and geocoding APIs are always fetched live.

const CACHE_NAME = 'saferide-v25';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

// CDN bundles we pre-cache so the app works without a network connection
const CDN_URLS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
  'https://unpkg.com/leaflet-polylinedecorator@1.6.0/dist/leaflet.polylineDecorator.js',
  'https://unpkg.com/@turf/turf@6.5.0/turf.min.js',
];

// Hostnames whose responses should never be cached (live data only)
const NETWORK_ONLY_HOSTS = [
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'router.project-osrm.org',
  'nominatim.openstreetmap.org',
  'overpass-api.de',
];

// ── Install ───────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache local app shell (must succeed)
    try { await cache.addAll(APP_SHELL); } catch (e) { console.warn('[SW] App shell cache failed', e); }

    // Cache CDN bundles with no-cors (opaque responses are fine here)
    await Promise.allSettled(
      CDN_URLS.map(url =>
        fetch(url, { mode: 'no-cors' })
          .then(r => cache.put(url, r))
          .catch(() => {/* offline during install — cached on next online visit */})
      )
    );
  })());

  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Delete caches from previous versions
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    );
    // Take control of all open clients immediately
    await self.clients.claim();
  })());
});

// ── Fetch ─────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Pass live-data hosts straight through to the network
  if (NETWORK_ONLY_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  event.respondWith((async () => {
    // 1. Cache hit — return immediately
    const cached = await caches.match(request);
    if (cached) return cached;

    // 2. Network fetch
    try {
      const response = await fetch(request);

      // Cache successful same-origin and unpkg responses for next time
      if (response.ok && (
        url.origin === self.location.origin ||
        url.hostname === 'unpkg.com'
      )) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }

      return response;
    } catch {
      // 3. Offline fallback — serve app shell for navigation requests
      if (request.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }
      return new Response('SafeRide is offline. Please check your connection.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  })());
});
