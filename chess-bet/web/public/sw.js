// HiMeet сервис-воркер: установка приложения, push-уведомления и офлайн-доступ к гостевому чату (/i/).
// Кэшируется только страница приглашения и неизменяемые файлы /_next/static/; остальное сайт берёт из сети, чтобы не залипали старые версии.
const CACHE = "hm-offline-v1";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, ""); // "" на himeet.online

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith("hm-offline-") && k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API и чужие домены не трогаем

  // Файлы сборки с хэшем в имени не меняются: берём из кэша, иначе из сети и запоминаем
  if (url.pathname.startsWith(BASE + "/_next/static/")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  // Страница приглашения: сначала сеть (свежая версия), без сети отдаём сохранённую копию
  if (req.mode === "navigate" && url.pathname.startsWith(BASE + "/i")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = BASE + "/i/";
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const hit = await cache.match(key);
        if (hit) return hit;
        throw err;
      }
    })());
  }
});

// HiMeet push: показ уведомлений о звонках и сообщениях
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { /* пустое уведомление */ }
  e.waitUntil(self.registration.showNotification(d.title || "HiMeet", {
    body: d.body || "", tag: d.tag || "hm", renotify: true, icon: "/icon-192.png", badge: "/icon-192.png",
    data: { url: d.url || "/" }, requireInteraction: !!d.call, vibrate: d.call ? [300, 200, 300, 200, 300] : [100],
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of cs) {
      try { await c.focus(); if ("navigate" in c) await c.navigate(url); return; } catch (_) { /* пробуем следующее окно */ }
    }
    await self.clients.openWindow(url);
  })());
});
