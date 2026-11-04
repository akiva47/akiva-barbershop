/* Akiva's Barbershop service worker: shows push notifications, nothing else.
   It deliberately has no fetch handler, so it never caches pages and can
   never serve an old version of the site. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "המספרה של עקיבא", {
    body: d.body || "",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    tag: d.tag || undefined,
    dir: "rtl",
    lang: "he",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.split("#")[0] === url.split("#")[0] && "focus" in w) return w.focus();
    }
    return self.clients.openWindow(url);
  })());
});
