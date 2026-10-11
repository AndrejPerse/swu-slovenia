// In-browser stand-ins for the Google services used by apps-script/Code.gs, so the real backend code
// runs in the browser against practice data. Used by the sandbox (?sandbox in the preview) and by tests.
// The practice "sheet" is kept in this browser's localStorage (unless window.SANDBOX_NO_PERSIST is set).
(function () {
  const STORE_KEY = "swu-sandbox-sheet";
  const persist = !window.SANDBOX_NO_PERSIST;
  const sheets = new Map();
  const props = {};

  class FakeRange {
    constructor(sheet, r, c, nr, nc) {
      if (r + nr - 1 > sheet.maxRows) throw new Error(`Range out of bounds: rows ${r}..${r + nr - 1} > ${sheet.maxRows}`);
      Object.assign(this, { sheet, r, c, nr, nc });
    }
    setValues(values) {
      if (values.length !== this.nr || values[0].length !== this.nc) throw new Error("setValues size mismatch");
      values.forEach((row, i) => {
        const target = (this.sheet.rows[this.r - 1 + i] = this.sheet.rows[this.r - 1 + i] || []);
        row.forEach((v, j) => { target[this.c - 1 + j] = v; });
      });
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
  }

  class FakeSheet {
    constructor(name, rows = [], maxRows = 1000) { Object.assign(this, { name, rows, maxRows }); }
    getName() { return this.name; }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(after, n) { this.maxRows += n; }
    clearContents() { this.rows = []; }
    setFrozenRows() {}
    getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
    getDataRange() {
      const width = Math.max(1, ...this.rows.map((r) => r.length));
      const values = this.rows.length
        ? this.rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? "" : r[i])))
        : [[""]];
      return { getValues: () => values.map((r) => r.slice()) };
    }
  }

  const ss = {
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet: (name) => { const s = new FakeSheet(name); sheets.set(name, s); return s; },
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name),
  };

  function save() {
    if (!persist) return;
    const dump = {};
    sheets.forEach((s, name) => { dump[name] = { rows: s.rows, maxRows: s.maxRows }; });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(dump)); } catch (e) { /* storage unavailable */ }
  }

  function reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ }
  }

  let loaded = false;
  if (persist) {
    try {
      const dump = JSON.parse(localStorage.getItem(STORE_KEY));
      if (dump) {
        Object.entries(dump).forEach(([name, s]) => sheets.set(name, new FakeSheet(name, s.rows, s.maxRows)));
        loaded = sheets.size > 0;
      }
    } catch (e) { /* start fresh */ }
  }
  if (!loaded) ss.insertSheet("Sheet1");

  window.FAKE = { sheets, props, log: [], loaded, save, reset };

  window.SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    getUi: () => ({
      createMenu() { return { addItem() { return this; }, addToUi() {} }; },
      alert: (msg) => FAKE.log.push(`alert: ${msg}`),
      prompt: () => ({ getSelectedButton: () => "OK", getResponseText: () => window.SANDBOX_PASSWORD || "sandbox" }),
      ButtonSet: { OK_CANCEL: 1 },
      Button: { OK: "OK" },
    }),
  };
  window.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
  window.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  window.Utilities = {
    sleep() {},
    formatDate: (d, tz, fmt) => (fmt === "HH:mm" ? d.toTimeString().slice(0, 5) : d.toISOString().slice(0, 10)),
  };
  window.ContentService = {
    MimeType: { JSON: "json" },
    createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
  };

  // Melee can't be reached from the browser. Tests provide recorded responses in window.SANDBOX_FIXTURES.
  function fakeResponse(code, text) {
    return { getResponseCode: () => code, getContentText: () => text };
  }
  function serve(req) {
    const fixtures = window.SANDBOX_FIXTURES;
    if (!fixtures) throw new Error("Melee import isn't available in the sandbox. Practise with Events → Edit or the Playoffs tab instead.");
    const url = req.url;
    FAKE.log.push(`melee ${url}`);
    let m;
    if ((m = url.match(/Tournament\/View\/(\d+)/))) {
      return fixtures[`page:${m[1]}`] ? fakeResponse(200, fixtures[`page:${m[1]}`]) : fakeResponse(404, "");
    }
    if ((m = url.match(/GetRoundMatches\/(\d+)/))) {
      if (!req.payload || !req.payload["columns[0][data]"]) return fakeResponse(500, '{"Error":true}');
      return fixtures[`matches:${m[1]}`] ? fakeResponse(200, fixtures[`matches:${m[1]}`]) : fakeResponse(503, "");
    }
    if (url.includes("GetRoundStandings")) return fakeResponse(200, fixtures[`standings:${req.payload.roundId}`]);
    return fakeResponse(404, "");
  }
  window.UrlFetchApp = { fetch: (url, opts) => serve({ url, ...(opts || {}) }), fetchAll: (reqs) => reqs.map(serve) };

  // The site's API calls are answered by doGet / doPost from Code.gs instead of Google.
  window.FAKE_API = "https://sandbox.invalid/exec";
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    if (!String(url).startsWith(FAKE_API)) return realFetch(url, opts);
    await new Promise((r) => setTimeout(r, 30));
    const method = (opts.method || "GET").toUpperCase();
    if (method === "POST") FAKE.log.push(`api ${JSON.parse(opts.body).action}`);
    const out = method === "POST"
      ? doPost({ postData: { contents: opts.body } })
      : doGet({ parameter: Object.fromEntries(new URL(url).searchParams) });
    if (method === "POST") save();
    return new Response(out.getContent(), { status: 200, headers: { "Content-Type": "application/json" } });
  };
})();
