"use strict";

// Bei jeder Änderung an den Dateien hochzählen. Der neue Name legt einen neuen
// Cache an, und beim activate fliegen alle Caches mit anderem Namen raus.
var VERSION = "kapselzeit-v5";

var DATEIEN = [
  "./",
  "./index.html",
  "./kapsel.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./impressum.html",
  "./datenschutz.html",
  "./aenderungen.html"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION)
      // cache: "reload" holt frisch vom Server, sonst könnte eine neue Version
      // die alte Seite aus dem HTTP-Zwischenspeicher des Browsers übernehmen.
      .then(function (cache) {
        return cache.addAll(DATEIEN.map(function (u) { return new Request(u, { cache: "reload" }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (namen) {
        // Nur eigene Caches aufräumen: die App teilt sich die Adresse mit anderen Seiten.
        return Promise.all(namen.map(function (name) {
          return name.indexOf("kapselzeit-") === 0 && name !== VERSION ? caches.delete(name) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var anfrage = e.request;
  if (anfrage.method !== "GET") return;
  var url = new URL(anfrage.url);
  // Nur Dateien aus dem eigenen Ordner, fremde Server und /api gehen den Service Worker nichts an.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(new URL("./", self.location).pathname) !== 0) return;

  e.respondWith(
    caches.match(anfrage, { ignoreSearch: true }).then(function (treffer) {
      if (treffer) return treffer;
      return fetch(anfrage).then(function (antwort) {
        if (antwort && antwort.ok && antwort.type === "basic") {
          var kopie = antwort.clone();
          caches.open(VERSION).then(function (cache) { cache.put(anfrage, kopie); });
        }
        return antwort;
      }).catch(function () {
        if (anfrage.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
