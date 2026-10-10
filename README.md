# SWU Slovenia League

League website for Star Wars Unlimited Slovenia: standings, player histories, meta and the event calendar.

- **Site:** plain HTML/CSS/JavaScript, hosted on GitHub Pages. It can also be opened locally by double-clicking `index.html`.
- **Data:** a Google Sheet. The script in `apps-script/Code.gs` serves the data as JSON, imports events from Melee and saves changes made in the editor (`#/editor`, password protected).
- **Cards:** leaders and bases come from the official card database (`tools/build_cards.py` → `data/cards.js`).

Setup steps are in [SETUP.md](SETUP.md).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page shell; everything else is rendered by the scripts. |
| `js/config.js` | Settings: the Apps Script URL, formats, participation points, calendar start. |
| `js/store.js` | Loads the data and computes standings, player history and meta. |
| `js/views.js` | Standings, player, meta, calendar and event pages. |
| `js/editor.js` | The editor: Melee import, deck pickers, players, calendar, seasons. |
| `js/melee.js` | Turns Melee's raw rounds and standings into league rows. |
| `apps-script/Code.gs` | Google Apps Script backend (lives inside the Google Sheet). |
| `data/cards.js` | Generated leader and base list. |
| `data/sample-data.js` | Fictional practice data for the sandbox (`tools/build_sample_data.py`). |
| `js/sandbox.js`, `sandbox/` | Sandbox mode (`?sandbox` in a preview): runs `Code.gs` in the browser on practice data. |
| `preview.cmd`, `tools/preview.py` | Local preview server for this PC and phones on the same Wi-Fi. |
| `assets/bases/` | Base icons (`<base id>.png`). |
