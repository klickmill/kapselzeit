// Prüft den Rechenkern: node test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const K = createRequire(import.meta.url)("./kapsel.js");

const d3 = { id: "vitd01", t: 1, name: "Vitamin D", menge: "1 Kapsel", einheiten: 1, zeiten: ["morgens"], vorrat: 30, vorratAm: "2026-09-29", packung: 60, pausiert: false, notiz: "" };
const mg = { ...d3, id: "magn01", name: "Magnesium", einheiten: 2, zeiten: ["morgens", "abends"], vorrat: 10, packung: null };
assert.deepEqual(K.saeubern(d3), d3);
assert.deepEqual(K.saeubern({ ...mg, zeiten: ["abends", "morgens"] }).zeiten, ["morgens", "abends"]); // feste Reihenfolge
assert.equal(K.saeubern({ ...d3, name: " " }), null);
assert.equal(K.saeubern({ ...d3, id: "<x>" }), null);
assert.equal(K.saeubern({ ...d3, einheiten: 0 }).einheiten, 1);
assert.equal(K.saeubern({ ...d3, vorrat: -3 }).vorrat, null);
assert.equal(K.saeubern({ ...d3, t: 1e17 }).t, 0);
assert.equal(K.saeubern({ ...d3, zeiten: ["morgens", "quatsch"] }).zeiten.length, 1);

// Vorrat: 30 Stück, 1 je Tag, gezählt am 29.9. morgens
assert.deepEqual(K.vorrat(d3, "2026-09-29"), { rest: 30, tage: 30, letzterTag: "2026-10-28" });
assert.deepEqual(K.vorrat(d3, "2026-10-09"), { rest: 20, tage: 20, letzterTag: "2026-10-28" });
assert.deepEqual(K.vorrat(d3, "2026-12-01"), { rest: 0, tage: 0, letzterTag: "2026-11-30" });
// Magnesium: 2 Stück, morgens und abends = 4 je Tag, 10 Stück reichen 2 volle Tage
assert.deepEqual(K.vorrat(mg, "2026-09-29"), { rest: 10, tage: 2, letzterTag: "2026-09-30" });
assert.equal(K.vorrat({ ...d3, vorrat: null }, "2026-09-29"), null);
assert.equal(K.vorrat({ ...d3, pausiert: true }, "2026-10-09").rest, 30); // pausiert verbraucht nichts
assert.equal(K.vorrat({ ...d3, pausiert: true }, "2026-10-09").tage, null);
assert.equal(K.vorrat(d3, "2026-03-29").rest, 30); // Datum vor der Zählung: nichts abziehen

// Nachkaufen: Magnesium zuerst
assert.deepEqual(K.nachkaufen([d3, mg], "2026-09-29", 7).map((x) => x.e.id), ["magn01"]);
assert.deepEqual(K.nachkaufen([d3, mg], "2026-10-25", 7).map((x) => x.e.id), ["magn01", "vitd01"]);
const neu = K.nachfuellen(d3, "2026-10-09", 60);
assert.equal(neu.vorrat, 80);
assert.equal(neu.vorratAm, "2026-10-09");

// Tagesliste und Quote
const tl = K.tagesliste([d3, mg, { ...d3, id: "pause1", name: "Zink", pausiert: true }]);
assert.deepEqual(tl.map((g) => [g.zeit, g.eintraege.map((e) => e.name)]), [["morgens", ["Vitamin D", "Magnesium"]], ["abends", ["Magnesium"]]]);
const log = {
  "2026-09-28": { "vitd01|morgens": true, "magn01|morgens": true, "magn01|abends": true },
  "2026-09-27": { "vitd01|morgens": true },
  "2026-09-29": { "vitd01|morgens": true, "magn01|morgens": true, "magn01|abends": true }, // heute zählt nicht
};
assert.deepEqual(K.quote([d3, mg], log, "2026-09-29", 7), { voll: 1, tage: 7 });
assert.deepEqual(K.quote([], log, "2026-09-29", 7), { voll: 0, tage: 7 });

// Protokoll aufräumen: alt, unbekannt, kaputt fliegt raus
const auf = K.logAufraeumen({ ...log, "2026-06-01": { "vitd01|morgens": true }, "quatsch": {}, "2026-09-26": { "weg999|morgens": true, "vitd01|mittag": true } }, [d3, mg], "2026-09-29");
assert.deepEqual(Object.keys(auf).sort(), ["2026-09-27", "2026-09-28", "2026-09-29"]);

// Einkaufstext
assert.equal(K.einkaufText(K.nachkaufen([d3, mg], "2026-10-25", 7)), "- Magnesium (1 Kapsel)\n- Vitamin D (1 Kapsel), Packung 60");

// Kalender: je Zeit ein täglicher Termin mit Alarm, Zeilen höchstens 75 Bytes, Escape
const ics = K.kalender([d3, { ...mg, name: "Magnesium; Citrat, 🔥".repeat(3) }], { morgens: "07:15", abends: "25:00" }, new Date("2026-09-29T10:00:00Z"), "2026-09-29");
assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
assert.ok(ics.includes("DTSTART:20260929T071500\r\nDURATION:PT5M\r\nRRULE:FREQ=DAILY"));
assert.ok(ics.includes("DTSTART:20260929T190000")); // ungültige Uhrzeit fällt auf den Standard
assert.equal(ics.split("BEGIN:VEVENT").length - 1, 2);
assert.equal(ics.split("BEGIN:VALARM").length - 1, 2);
for (const z of ics.split("\r\n")) assert.ok(Buffer.byteLength(z) <= 75, z);
assert.ok(ics.replace(/\r\n /g, "").includes("Magnesium\\; Citrat\\, 🔥"));

// Sicherung hin und zurück, Zusammenführen
const s = K.sicherungLesen(K.sicherung([d3, mg], log));
assert.equal(s.kaputt, 0);
assert.deepEqual(s.liste, [d3, mg]);
assert.equal(K.sicherungLesen("{}"), null);
assert.equal(K.sicherungLesen("nein"), null);
const m = K.zusammenfuehren([d3], [{ ...d3, t: 5, name: "Vitamin D3" }, mg], { "2026-09-27": { "vitd01|morgens": true } }, { "2026-09-28": { "vitd01|morgens": true } });
assert.equal(m.dazu, 1);
assert.equal(m.aktualisiert, 1);
assert.equal(m.liste.find((e) => e.id === "vitd01").name, "Vitamin D3");
assert.deepEqual(Object.keys(m.log).sort(), ["2026-09-27", "2026-09-28"]);

// Vorrat ohne gültiges Zähldatum wird verworfen (sonst stürzen Bearbeiten und Pausieren ab).
assert.equal(K.saeubern({ ...d3, vorratAm: "" }).vorrat, null);
assert.equal(K.saeubern({ ...d3, vorratAm: "2026-02-30" }).vorratAm, "");

// Planwechsel: neu gezählt ab heute mit dem heutigen Rest bleibt der Rest heute gleich.
const altRest = K.vorrat(d3, "2026-10-09").rest;
const umgestellt = K.saeubern({ ...d3, einheiten: 2, vorrat: altRest, vorratAm: "2026-10-09" });
assert.equal(K.vorrat(umgestellt, "2026-10-09").rest, altRest);

// Präparierte Sicherung darf keine Prototyp-Felder setzen.
const boese = K.sicherungLesen('{"app":"kapselzeit","liste":[],"log":{"__proto__":{"polluted":true},"2026-09-28":{"__proto__":true,"constructor|morgens":true,"vitd01|morgens":true}}}');
const mb = K.zusammenfuehren([d3], boese.liste, {}, boese.log);
assert.equal(({}).polluted, undefined);
assert.equal(Object.getPrototypeOf(mb.log), Object.prototype); // auch das Protokoll selbst bleibt unverändert
assert.deepEqual(Object.keys(mb.log), ["2026-09-28"]);
assert.ok(!Object.prototype.hasOwnProperty.call(mb.log["2026-09-28"], "__proto__"));
// Die App räumt nach dem Einspielen gegen die echten Mittel auf; dann bleibt nur der echte Eintrag.
assert.deepEqual(Object.keys(K.logAufraeumen(mb.log, mb.liste, "2026-09-29")["2026-09-28"]), ["vitd01|morgens"]);
assert.deepEqual(K.logAufraeumen({ "2026-09-28": { "constructor|morgens": true } }, [d3], "2026-09-29"), {});

console.log("kapsel.js: alle Prüfungen bestanden");
