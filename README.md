# Kapselzeit

Nahrungsergänzung abhaken, Vorrat sehen, Nachkauf-Termin. Keine Empfehlungen zu Dosis, Kombination oder Wirkung.

Läuft unter https://klickmill.app/kapselzeit/ kostenlos im Browser, auf Handy und Rechner, nach dem ersten Laden auch offline. Kein Konto, keine KI in der App, keine Werbung.

## Was nach außen geht

Die Einträge bleiben im Browser auf dem eigenen Gerät (localStorage). Nach außen gehen genau zwei Dinge, beide an klickmill.app: ein anonymer Nutzungszähler (App-Start und gedrückte Knöpfe, ohne Kennung, ohne Cookie; in der App abschaltbar) und Feedback, das man selbst abschickt. Sonst nichts. Einzelheiten in `datenschutz.html`.

## Aufbau

- `index.html`: Oberfläche und Ablauf, ohne Abhängigkeiten.
- `kapsel.js`: Rechenkern, läuft im Browser und in Node.
- `test.mjs`: Prüfungen für den Rechenkern, `node test.mjs`.
- `sw.js`: Service Worker für den Offline-Betrieb. Bei jeder Dateiänderung die VERSION hochzählen.
- `aenderungen.html`: Was sich je Version geändert hat.

## Selbst betreiben

Alle Dateien in einen Ordner auf einen Webserver legen, fertig. Der Zähler ruft nur dann klickmill.app, wenn die Seite von dort geladen wurde; lokal geöffnete Kopien zählen nicht.

## Quellcode und Lizenz

https://github.com/klickmill/kapselzeit


MIT, siehe `LICENSE`. Impressum und Datenschutz gelten für den Betrieb unter klickmill.app.
