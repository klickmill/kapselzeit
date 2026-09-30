// Rechenkern von Kapselzeit: Tagesliste, Vorrat und Nachkauf, Wochenquote,
// Kalender-Erinnerungen, Sicherung. Keine Empfehlungen zu Dosis, Kombination
// oder Wirkung: die App rechnet nur mit dem, was der Nutzer selbst einträgt.
// Läuft im Browser (window.Kapsel) und in Node (require) für test.mjs.
(function (wurzel) {
  "use strict";

  var ZEITEN = [["morgens", "Morgens"], ["mittags", "Mittags"], ["abends", "Abends"], ["nacht", "Zur Nacht"]];
  var ZEIT_NAME = {};
  ZEITEN.forEach(function (z) { ZEIT_NAME[z[0]] = z[1]; });
  var UHR_STANDARD = { morgens: "08:00", mittags: "12:30", abends: "19:00", nacht: "22:00" };

  function datumOk(t) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(t))) return false;
    return new Date(t + "T12:00:00Z").toISOString().slice(0, 10) === t;
  }
  function tageBis(von, bis) {
    return Math.round((Date.parse(bis + "T12:00:00Z") - Date.parse(von + "T12:00:00Z")) / 86400000);
  }
  function plusTage(datum, n) {
    return new Date(Date.parse(datum + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  }
  function ganz(v, min, max) {
    var n = typeof v === "number" ? v : parseInt(String(v == null ? "" : v).trim(), 10);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  }

  // Bringt einen Eintrag aus Formular oder Sicherung in sichere Form; null, wenn unbrauchbar.
  function saeubern(x) {
    if (!x || typeof x !== "object") return null;
    var name = String(x.name || "").trim().slice(0, 60);
    var id = /^[a-z0-9]{6,40}$/.test(String(x.id || "")) ? String(x.id) : null;
    if (!name || !id) return null;
    var zeiten = Array.isArray(x.zeiten) ? ZEITEN.map(function (z) { return z[0]; }).filter(function (z) { return x.zeiten.indexOf(z) >= 0; }) : [];
    return {
      id: id,
      // t höchstens bis zur Grenze des Date-Bereichs.
      t: Number.isFinite(x.t) && Math.abs(x.t) <= 8.64e15 ? x.t : 0,
      name: name,
      menge: String(x.menge == null ? "" : x.menge).trim().slice(0, 40),
      einheiten: ganz(x.einheiten, 1, 20) || 1,
      zeiten: zeiten,
      // Vorrat nur mit gültigem Zähldatum, sonst lässt sich nichts rechnen.
      vorrat: datumOk(x.vorratAm) ? ganz(x.vorrat, 0, 100000) : null,
      vorratAm: datumOk(x.vorratAm) && ganz(x.vorrat, 0, 100000) !== null ? x.vorratAm : "",
      packung: ganz(x.packung, 1, 100000),
      pausiert: x.pausiert === true,
      notiz: String(x.notiz == null ? "" : x.notiz).trim().slice(0, 300)
    };
  }

  function proTag(e) { return e.pausiert ? 0 : e.einheiten * e.zeiten.length; }

  // Vorrat: gezählt am Morgen von vorratAm, danach Verbrauch nach Plan.
  // letzterTag ist der letzte Tag, für den der Vorrat vollständig reicht.
  function vorrat(e, heute) {
    if (e.vorrat === null || !e.vorratAm) return null;
    var p = proTag(e);
    var vergangen = Math.max(0, tageBis(e.vorratAm, heute));
    var rest = Math.max(0, e.vorrat - p * vergangen);
    if (!p) return { rest: rest, tage: null, letzterTag: "" };
    var tage = Math.floor(rest / p);
    return { rest: rest, tage: tage, letzterTag: plusTage(heute, tage - 1) };
  }

  // Was in den nächsten `frist` Tagen ausgeht, knappstes zuerst.
  function nachkaufen(liste, heute, frist) {
    return liste.map(function (e) { return { e: e, v: vorrat(e, heute) }; })
      .filter(function (x) { return x.v && x.v.tage !== null && x.v.tage <= frist; })
      .sort(function (a, b) { return a.v.tage - b.v.tage; });
  }

  // Neue Packung: Rest von heute plus Packungsgröße, gezählt ab heute.
  function nachfuellen(e, heute, menge) {
    var v = vorrat(e, heute);
    var basis = v ? v.rest : 0;
    return Object.assign({}, e, { vorrat: Math.min(100000, basis + menge), vorratAm: heute, t: Date.now() });
  }

  // Tagesliste: je Zeit die nicht pausierten Einträge.
  function tagesliste(liste) {
    return ZEITEN.map(function (z) {
      return { zeit: z[0], name: z[1], eintraege: liste.filter(function (e) { return !e.pausiert && e.zeiten.indexOf(z[0]) >= 0; }) };
    }).filter(function (g) { return g.eintraege.length; });
  }

  function schluessel(id, zeit) { return id + "|" + zeit; }
  var SCHLUESSEL = /^[a-z0-9]{6,40}\|(morgens|mittags|abends|nacht)$/;
  function eigen(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // An wie vielen der letzten `tage` Tage (bis gestern) war alles abgehakt, was heute geplant ist.
  function quote(liste, log, heute, tage) {
    var geplant = [];
    tagesliste(liste).forEach(function (g) { g.eintraege.forEach(function (e) { geplant.push(schluessel(e.id, g.zeit)); }); });
    if (!geplant.length) return { voll: 0, tage: tage };
    var voll = 0;
    for (var i = 1; i <= tage; i++) {
      var tag = log[plusTage(heute, -i)] || {};
      if (geplant.every(function (k) { return tag[k] === true; })) voll++;
    }
    return { voll: voll, tage: tage };
  }

  // Protokoll auf die letzten 60 Tage und bekannte Einträge kürzen.
  function logAufraeumen(log, liste, heute) {
    var ids = {}, neu = {};
    liste.forEach(function (e) { ids[e.id] = true; });
    Object.keys(log || {}).forEach(function (tag) {
      if (!datumOk(tag) || tageBis(tag, heute) > 60 || tageBis(tag, heute) < 0) return;
      var t = {};
      Object.keys(log[tag] || {}).forEach(function (k) {
        if (SCHLUESSEL.test(k) && log[tag][k] === true && eigen(ids, k.split("|")[0])) t[k] = true;
      });
      if (Object.keys(t).length) neu[tag] = t;
    });
    return neu;
  }

  // Einkaufsliste als Text zum Teilen.
  function einkaufText(treffer) {
    return treffer.map(function (x) {
      return "- " + x.e.name + (x.e.menge ? " (" + x.e.menge + ")" : "") + (x.e.packung ? ", Packung " + x.e.packung : "");
    }).join("\n");
  }

  // Tägliche Kalender-Erinnerungen je Zeit mit Einträgen (iCalendar, lokale Uhrzeit, mit Alarm).
  function kalender(liste, uhr, jetzt, heute) {
    function esc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
    function falten(zeile) {
      var out = [], teil = "", bytes = 0;
      Array.from(zeile).forEach(function (c) {
        var b = unescape(encodeURIComponent(c)).length;
        if (bytes + b > (out.length ? 74 : 75)) { out.push(teil); teil = ""; bytes = 0; }
        teil += c; bytes += b;
      });
      out.push(teil);
      return out.join("\r\n ");
    }
    var stempel = jetzt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var z = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//klickmill//Kapselzeit//DE", "CALSCALE:GREGORIAN"];
    tagesliste(liste).forEach(function (g) {
      var u = /^([01]\d|2[0-3]):[0-5]\d$/.test(uhr[g.zeit] || "") ? uhr[g.zeit] : UHR_STANDARD[g.zeit];
      var namen = g.eintraege.map(function (e) { return e.name; }).join(", ");
      z.push("BEGIN:VEVENT", "UID:kapselzeit-" + g.zeit + "@klickmill.app", "DTSTAMP:" + stempel,
        "DTSTART:" + heute.replace(/-/g, "") + "T" + u.replace(":", "") + "00", "DURATION:PT5M", "RRULE:FREQ=DAILY",
        falten("SUMMARY:" + esc("Kapselzeit " + g.name.toLowerCase() + ": " + namen)),
        "BEGIN:VALARM", "ACTION:DISPLAY", falten("DESCRIPTION:" + esc("Kapselzeit: " + namen)), "TRIGGER:PT0M", "END:VALARM",
        "END:VEVENT");
    });
    z.push("END:VCALENDAR");
    return z.join("\r\n") + "\r\n";
  }

  function sicherung(liste, log) { return JSON.stringify({ app: "kapselzeit", v: 1, liste: liste, log: log }, null, 1); }
  function sicherungLesen(text) {
    var d;
    try { d = JSON.parse(String(text || "")); } catch (e) { return null; }
    if (!d || d.app !== "kapselzeit" || !Array.isArray(d.liste)) return null;
    var gut = [], kaputt = 0;
    d.liste.forEach(function (x) { var s = saeubern(x); if (s) gut.push(s); else kaputt++; });
    return { liste: gut, log: d.log && typeof d.log === "object" ? d.log : {}, kaputt: kaputt };
  }
  // Gleiche id: neuere Fassung (t) gewinnt. Protokolle werden vereinigt.
  function zusammenfuehren(alt, neu, logAlt, logNeu) {
    var nachId = {}, dazu = 0, aktualisiert = 0;
    alt.forEach(function (e) { nachId[e.id] = e; });
    neu.forEach(function (e) {
      if (!nachId[e.id]) { nachId[e.id] = e; dazu++; }
      else if (e.t > nachId[e.id].t) { nachId[e.id] = e; aktualisiert++; }
    });
    var log = JSON.parse(JSON.stringify(logAlt || {}));
    // Nur echte Tage und gültige Schlüssel: eine fremde Datei darf keine Felder wie __proto__ setzen.
    Object.keys(logNeu || {}).forEach(function (tag) {
      if (!datumOk(tag) || !logNeu[tag] || typeof logNeu[tag] !== "object") return;
      if (!eigen(log, tag)) log[tag] = {};
      Object.keys(logNeu[tag]).forEach(function (k) { if (SCHLUESSEL.test(k) && logNeu[tag][k] === true) log[tag][k] = true; });
    });
    return { liste: Object.keys(nachId).map(function (k) { return nachId[k]; }), log: log, dazu: dazu, aktualisiert: aktualisiert };
  }

  var api = { ZEITEN: ZEITEN, ZEIT_NAME: ZEIT_NAME, UHR_STANDARD: UHR_STANDARD, datumOk: datumOk, tageBis: tageBis,
    plusTage: plusTage, saeubern: saeubern, proTag: proTag, vorrat: vorrat, nachkaufen: nachkaufen, nachfuellen: nachfuellen,
    tagesliste: tagesliste, schluessel: schluessel, quote: quote, logAufraeumen: logAufraeumen, einkaufText: einkaufText,
    kalender: kalender, sicherung: sicherung, sicherungLesen: sicherungLesen, zusammenfuehren: zusammenfuehren };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else wurzel.Kapsel = api;
})(this);
