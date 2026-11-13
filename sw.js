/* Service worker: funciona sin cobertura y vigila el tiempo en segundo plano (Android, app instalada) */
importScripts("score.js");
const CACHE = "setas-cdg-v5";
const TILES = "setas-tiles";
const TILE_HOSTS = /tile\.opentopomap\.org|tile\.openstreetmap\.org|arcgisonline\.com|waymarkedtrails\.org|elevation-tiles-prod|upload\.wikimedia\.org/;
const LIB_HOSTS = /unpkg\.com/;
const CONF = "setas-config";
const FILES = ["./", "./index.html", "./score.js", "./minimap.js", "./map3d.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== CONF && k !== TILES).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Red primero (para recibir las actualizaciones de la app); si no hay cobertura, la copia guardada.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // teselas del mapa: se guardan las que ves, para usarlas sin cobertura
  if (TILE_HOSTS.test(url.hostname + url.pathname)) {
    e.respondWith(caches.open(TILES).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) { c.put(req, res.clone()); trimTiles(c); }
      return res;
    }).catch(() => new Response("", { status: 504 })))));
    return;
  }
  // librería del mapa 3D: se guarda la primera vez
  if (LIB_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return; // el tiempo va directo a la red
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});

let trimming = false;
async function trimTiles(c) {
  if (trimming) return; trimming = true;
  try { const ks = await c.keys(); if (ks.length > 4000) for (const k of ks.slice(0, ks.length - 3500)) await c.delete(k); } catch (e) {}
  trimming = false;
}
async function getConf() {
  try { const c = await caches.open(CONF); const r = await c.match("conf"); return r ? await r.json() : null; } catch (e) { return null; }
}
async function setConf(obj) {
  const c = await caches.open(CONF);
  await c.put("conf", new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } }));
}

async function checkWeather() {
  const conf = await getConf();
  if (!conf || !conf.notif || !conf.lat) return;
  const M = self.SetasModel;
  const r = await fetch(M.weatherURL(conf.lat, conf.lon, true));
  if (!r.ok) return;
  const D = M.buildData(await r.json(), conf.label);
  const i0 = M.todayIndex(D);
  const { best, bestI } = M.bestAhead(D, i0, 8);
  const threshold = conf.threshold || 65;
  if (best < threshold) return;
  const key = conf.label + D.time[bestI];
  if (conf.lastNotified === key) return;
  conf.lastNotified = key; await setConf(conf);
  const d = new Date(D.time[bestI] + "T12:00:00");
  const when = bestI === i0 ? "hoy" : d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" });
  await self.registration.showNotification("🍄 Buen día para setas", {
    body: "Índice " + best + "/100 " + when + " en " + conf.label + ".",
    icon: "icon-192.png", badge: "icon-192.png", tag: "setas-aviso"
  });
}

self.addEventListener("periodicsync", e => { if (e.tag === "check-setas") e.waitUntil(checkWeather().catch(() => {})); });
self.addEventListener("message", e => {
  if (e.data && e.data.type === "conf") { const p = setConf(e.data.conf); if (e.waitUntil) e.waitUntil(p); }
  if (e.data && e.data.type === "check") checkWeather().catch(() => {});
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow("./index.html")));
});
