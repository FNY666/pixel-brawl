// 像素乱斗 Service Worker：安装后可离线游玩
'use strict';

const VERSION = 'pixel-brawl-v5';
const CACHE_NAME = VERSION;
// 注意：必须与 index.html 中的资源版本号一致
const ASSETS = [
  './',
  './index.html',
  './style.css?v=11',
  './src/00-foundation-audio.js?v=1',
  './src/01-input.js?v=1',
  './src/02-content.js?v=1',
  './src/03-fighter.js?v=1',
  './src/04-effects.js?v=1',
  './src/05-match-flow.js?v=1',
  './src/06-scenes.js?v=1',
  './src/07-rendering.js?v=1',
  './src/08-game-loop.js?v=1',
  './src/09-ui-bootstrap.js?v=1',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 仅接管本站请求；其余透传
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  // 页面导航：网络优先（保证拿到最新版），离线退回缓存
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return resp;
      }).catch(() =>
        caches.match(e.request).then((r) => r || caches.match('./index.html'))
      )
    );
    return;
  }

  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      });
    }).catch(() => caches.match('./index.html'))
  );
});