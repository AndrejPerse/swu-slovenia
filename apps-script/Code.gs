/**
 * SWU Slovenia League – backend for the league website.
 *
 * Lives inside the Google Sheet (Extensions → Apps Script) and is published as a web app.
 *  - GET  ?action=data    → all league data as JSON (public, read-only)
 *  - POST {action, password, ...} → editor actions (password protected)
 *
 * The editor password is stored in the script properties, never in the website code.
 * Use the "SWU League" menu in the sheet to create the tabs and set the password.
 */

const TIME_ZONE = "Europe/Ljubljana";

// Column definitions per tab. Types: s = text, n = number, b = TRUE/FALSE, d = date (yyyy-MM-dd), t = time (HH:mm)
const TABS = {
  Seasons: [["id", "s"], ["name", "s"], ["start", "d"], ["end", "d"]],
  Players: [["key", "s"], ["name", "s"], ["nickname", "s"], ["league", "b"]],
  Events: [["id", "s"], ["date", "d"], ["name", "s"], ["type", "s"], ["format", "s"], ["melee", "s"]],
  Results: [
    ["event", "s"], ["player", "s"], ["leader", "s"], ["base", "s"], ["points", "n"], ["bonus", "n"],
    ["wins", "n"], ["losses", "n"], ["draws", "n"], ["rank", "n"], ["finish", "s"], ["counted", "b"],
  ],
  Matches: [
    ["event", "s"], ["round", "n"], ["roundName", "s"], ["phase", "s"], ["p1", "s"], ["p2", "s"],
    ["g1", "n"], ["g2", "n"], ["gd", "n"], ["result", "s"],
  ],
  Calendar: [
    ["id", "s"], ["date", "d"], ["time", "t"], ["type", "s"], ["title", "s"], ["format", "s"], ["notes", "s"], ["melee", "s"],
  ],
};

// ---- Sheet menu -------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("SWU League")
    .addItem("1. Set up sheet tabs", "setupSheet")
    .addItem("2. Set editor password", "setPassword")
    .addToUi();
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach((name) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) writeTab(name, []);
    sheet.getRange(1, 1, 1, TABS[name].length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  });
  // Remove the empty default sheet ("Sheet1", or "List1" etc. in other languages).
  ss.getSheets().forEach((sheet) => {
    if (!TABS[sheet.getName()] && sheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet);
  });
  if (!readTab("Seasons").length) {
    writeTab("Seasons", [{ id: "s1", name: "Season 1", start: "2026-10-01", end: "" }]);
  }
  SpreadsheetApp.getUi().alert("The sheet is ready. Next: SWU League → 2. Set editor password.");
}

function setPassword() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt("Editor password", "Choose the password for the website editor:", ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const password = answer.getResponseText().trim();
  if (password.length < 6) {
    ui.alert("Please use at least 6 characters.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("EDITOR_PASSWORD", password);
  ui.alert("Password saved.");
}

// ---- Web app entry points ----------------------------------------------

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "data";
  if (action === "data") return json(allData());
  return json({ ok: false, error: `Unknown action "${action}"` });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "Invalid request." });
  }

  const stored = PropertiesService.getScriptProperties().getProperty("EDITOR_PASSWORD");
  if (!stored) return json({ ok: false, error: "No editor password has been set in the sheet yet." });
  if (body.password !== stored) {
    Utilities.sleep(1500); // slows down password guessing
    return json({ ok: false, error: "Wrong password.", code: "auth" });
  }

  const handler = ACTIONS[body.action];
  if (!handler) return json({ ok: false, error: `Unknown action "${body.action}".` });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return json(Object.assign({ ok: true }, handler(body) || {}));
  } catch (err) {
    return json({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

const ACTIONS = {
  check: () => ({}),

  melee: (body) => ({ melee: fetchMelee(body.url) }),

  // Saves (or replaces) one event with all of its results and matches.
  saveEvent: (body) => {
    const event = body.event;
    if (!event || !event.id) throw new Error("The event has no id.");
    upsert("Events", "id", [event]);
    replaceWhere("Results", (r) => r.event === event.id, body.results.map((r) => Object.assign({}, r, { event: event.id })));
    replaceWhere("Matches", (m) => m.event === event.id, body.matches.map((m) => Object.assign({}, m, { event: event.id })));
    upsert("Players", "key", body.players || []);
    return { data: allData() };
  },

  deleteEvent: (body) => {
    ["Events", "Results", "Matches"].forEach((tab) => {
      const field = tab === "Events" ? "id" : "event";
      replaceWhere(tab, (row) => row[field] === body.id, []);
    });
    return { data: allData() };
  },

  savePlayers: (body) => {
    upsert("Players", "key", body.players);
    return { data: allData() };
  },

  saveCalendar: (body) => {
    upsert("Calendar", "id", body.entries);
    return { data: allData() };
  },

  deleteCalendar: (body) => {
    replaceWhere("Calendar", (c) => c.id === body.id, []);
    return { data: allData() };
  },

  saveSeason: (body) => {
    upsert("Seasons", "id", [body.season]);
    return { data: allData() };
  },

  deleteSeason: (body) => {
    replaceWhere("Seasons", (s) => s.id === body.id, []);
    return { data: allData() };
  },
};

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Reading and writing tabs -----------------------------------------

function allData() {
  return {
    seasons: readTab("Seasons"),
    players: readTab("Players"),
    events: readTab("Events"),
    results: readTab("Results"),
    matches: readTab("Matches"),
    calendar: readTab("Calendar"),
  };
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// Columns are found by their header, so reordering columns in the sheet is harmless.
function readTab(name) {
  const values = getSheet(name).getDataRange().getValues();
  const headers = (values.shift() || []).map(String);
  const cols = TABS[name];
  const index = cols.map(([key]) => headers.indexOf(key));
  return values
    .filter((row) => row.some((v) => v !== "" && v !== null))
    .map((row) => {
      const obj = {};
      cols.forEach(([key, type], i) => {
        obj[key] = fromCell(index[i] >= 0 ? row[index[i]] : "", type);
      });
      return obj;
    });
}

function writeTab(name, rows) {
  const sheet = getSheet(name);
  const cols = TABS[name];
  const values = [cols.map(([key]) => key)].concat(rows.map((row) => cols.map(([key, type]) => toCell(row[key], type))));
  if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  sheet.clearContents();
  // Text, date and time columns are stored as plain text so Sheets doesn't reinterpret them.
  cols.forEach(([, type], i) => {
    if (type !== "n" && type !== "b") sheet.getRange(1, i + 1, values.length, 1).setNumberFormat("@");
  });
  sheet.getRange(1, 1, values.length, cols.length).setValues(values);
}

function fromCell(value, type) {
  if (type === "n") return value === "" || value === null ? 0 : Number(value) || 0;
  if (type === "b") return value === true || String(value).toLowerCase() === "true";
  if (value instanceof Date) return Utilities.formatDate(value, TIME_ZONE, type === "t" ? "HH:mm" : "yyyy-MM-dd");
  return value === null || value === undefined ? "" : String(value);
}

function toCell(value, type) {
  if (type === "n") return Number(value) || 0;
  if (type === "b") return value === true || String(value).toLowerCase() === "true";
  return value === null || value === undefined ? "" : String(value);
}

// Insert rows, or update the row with the same key (fields not sent are kept).
function upsert(name, keyField, rows) {
  const existing = readTab(name);
  const byKey = {};
  existing.forEach((row) => { byKey[row[keyField]] = row; });
  rows.forEach((row) => {
    if (!row[keyField]) throw new Error(`A ${name} row is missing its ${keyField}.`);
    if (byKey[row[keyField]]) Object.assign(byKey[row[keyField]], row);
    else existing.push((byKey[row[keyField]] = Object.assign({}, row)));
  });
  writeTab(name, existing);
}

function replaceWhere(name, predicate, newRows) {
  writeTab(name, readTab(name).filter((row) => !predicate(row)).concat(newRows));
}

// ---- Melee import --------------------------------------------------------

const MELEE = "https://melee.gg";

// Melee's tables only answer when these DataTables parameters are present.
const TABLE_PARAMS = {
  draw: "1",
  "columns[0][data]": "TableNumber",
  "columns[0][name]": "TableNumber",
  "order[0][column]": "0",
  "order[0][dir]": "asc",
  start: "0",
  length: "-1",
  "search[value]": "",
  "search[regex]": "false",
};

// Returns Melee's raw round matches and standings; the website turns them into league rows.
function fetchMelee(link) {
  const id = (String(link || "").match(/(\d{4,})/) || [])[1];
  if (!id) throw new Error("That doesn't look like a Melee tournament link.");

  const page = UrlFetchApp.fetch(`${MELEE}/Tournament/View/${id}`, { muteHttpExceptions: true, headers: { Accept: "text/html" } });
  if (page.getResponseCode() !== 200) throw new Error(`Melee answered with error ${page.getResponseCode()} for tournament ${id}.`);
  const html = page.getContentText();

  const title = decodeEntities(((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "").replace(/\s*\|\s*Melee\s*$/, "").trim());
  const start = (html.match(/data-toggle="datetime" data-value="([^"{]+)"/) || [])[1] || "";

  const rounds = [];
  const seen = {};
  const roundPattern = /data-id="(\d+)" data-name="([^"]+)" data-is-completed="(True|False)"/g;
  let m;
  while ((m = roundPattern.exec(html))) {
    if (seen[m[1]]) continue;
    seen[m[1]] = true;
    rounds.push({ id: m[1], name: decodeEntities(m[2]), completed: m[3] === "True" });
  }
  if (!rounds.length) throw new Error("No rounds found on Melee. Has the event started?");

  const matchResponses = UrlFetchApp.fetchAll(rounds.map((r) => meleeRequest(`${MELEE}/Match/GetRoundMatches/${r.id}`, TABLE_PARAMS)));
  rounds.forEach((r, i) => { r.matches = readTable(matchResponses[i]); });

  const played = rounds.filter((r) => r.matches.length);
  if (!played.length) throw new Error("This event has no pairings yet.");
  const swissPhase = played[0].matches[0].PhaseId;
  const lastSwiss = played.filter((r) => r.matches[0].PhaseId === swissPhase).pop();
  const lastRound = played[played.length - 1];

  const standingsUrl = `${MELEE}/Standing/GetRoundStandings`;
  const standings = UrlFetchApp.fetchAll([
    meleeRequest(standingsUrl, Object.assign({ roundId: lastSwiss.id }, TABLE_PARAMS)),
    meleeRequest(standingsUrl, Object.assign({ roundId: lastRound.id }, TABLE_PARAMS)),
  ]).map(readTable);

  return {
    id: id,
    title: title,
    start: start,
    link: `${MELEE}/Tournament/View/${id}`,
    rounds: rounds,
    swissStandings: standings[0],
    finalStandings: standings[1],
  };
}

function meleeRequest(url, payload) {
  return { url: url, method: "post", payload: payload, headers: { "X-Requested-With": "XMLHttpRequest" }, muteHttpExceptions: true };
}

function readTable(response) {
  if (response.getResponseCode() !== 200) throw new Error(`Melee answered with error ${response.getResponseCode()}.`);
  const body = JSON.parse(response.getContentText());
  if (body.Error) throw new Error(body.Message || "Melee returned an error.");
  return body.data || [];
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
