/* Salle d'analyse — fonctionne hors connexion (sauf l'import des parties) */
const VERSION = "sa-v1.0.3";
const SHELL = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/chess.js", "js/core.js", "js/api.js", "js/engine.js", "js/board.js", "js/views.js",
  "engine/stockfish-19-lite-single.js", "engine/stockfish-19-lite-single.wasm",
  "assets/pieces.svg", "icons/icon-192.png", "icons/icon-512.png"
];
self.addEventListener("install", e => { /* cache: "reload" : on télécharge toujours les fichiers neufs, sans passer par le cache HTTP du navigateur
     (GitHub Pages autorise 10 min de cache, ce qui mélangeait ancienne et nouvelle version) */
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(VERSION + "-fonts").then(async c => {
      const hit = await c.match(e.request); if (hit) return hit;
      const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r;
    }).catch(() => fetch(e.request)));
  }
});
