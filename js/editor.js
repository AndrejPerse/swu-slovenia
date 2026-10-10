// The editor: import events from Melee, pick decks, manage players, calendar and seasons.
(function () {
  const ed = (SWU.editor = {});
  const ui = SWU.ui;
  const { esc } = ui;
  const store = SWU.store;
  const api = SWU.api;

  const TABS = [
    ["import", "Add event"],
    ["events", "Events"],
    ["players", "Players"],
    ["calendar", "Calendar"],
    ["seasons", "Seasons"],
  ];

  const state = {
    tab: "import",
    busy: "",
    notice: null,
    draft: null,
    playerEdits: new Map(),
    playerFilter: "",
    calEdit: null,
    seasonEdit: null,
  };
  let root = null;

  ed.render = () => `<div id="editor" class="editor"></div>`;

  ed.mount = function (container) {
    root = container.querySelector("#editor");
    root.addEventListener("submit", onSubmit);
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("input", onInput);
    draw();
  };

  function draw() {
    if (!root || !root.isConnected) return;
    closePicker();
    root.innerHTML = view();
  }

  function notify(type, text) {
    state.notice = { type, text };
  }

  // Runs an API call with a busy message, then redraws with a success or error notice.
  async function run(message, task, success) {
    state.busy = message;
    state.notice = null;
    draw();
    try {
      await task();
      if (success) notify("ok", success);
    } catch (err) {
      notify("error", err.message);
    } finally {
      state.busy = "";
      draw();
    }
  }

  // ---- Layout ----------------------------------------------------------

  function view() {
    const head = `<section class="page-head"><h1>Editor</h1><p class="page-sub">Add events from Melee and manage the league data.</p></section>`;
    if (!SWU.config.apiUrl) {
      return head + ui.empty("The Google Sheet isn't connected yet", "Follow the setup steps, then paste the web app link into js/config.js (apiUrl).");
    }
    if (!api.loggedIn()) return head + loginView();

    const tabs = TABS.map(([id, label]) =>
      `<button class="tab${state.tab === id ? " active" : ""}" data-tab="${id}">${label}</button>`).join("");
    const notice = state.notice
      ? `<div class="notice notice--${state.notice.type}">${esc(state.notice.text)}</div>`
      : "";
    const busy = state.busy ? `<div class="busy"><span class="spinner"></span>${esc(state.busy)}</div>` : "";
    const body = { import: importView, events: eventsView, players: playersView, calendar: calendarView, seasons: seasonsView }[state.tab]();

    return `${head}
      <div class="ed-top"><div class="tabs">${tabs}</div><button class="link-btn" data-action="logout">Log out</button></div>
      ${busy}${notice}
      <fieldset class="ed-body" ${state.busy ? "disabled" : ""}>${body}</fieldset>`;
  }

  function loginView() {
    return `<form class="ed-card ed-login" data-form="login">
      <label class="field"><span>Editor password</span><input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn btn--primary" ${state.busy ? "disabled" : ""}>${state.busy ? "Checking…" : "Log in"}</button>
      ${state.notice ? `<p class="notice notice--error">${esc(state.notice.text)}</p>` : ""}
    </form>`;
  }

  function select(name, options, value, attrs = "") {
    return `<select name="${name}" ${attrs}>${options.map((o) => `<option${o === value ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  }

  // ---- Add / edit event --------------------------------------------------

  function importView() {
    const fetchForm = `<form class="ed-card ed-fetch" data-form="fetch">
      <label class="field field--grow"><span>Melee link</span>
        <input name="url" type="url" placeholder="https://melee.gg/Tournament/View/473931" required></label>
      <button class="btn btn--primary">Fetch from Melee</button>
    </form>`;
    return fetchForm + (state.draft ? draftView() : `<p class="footnote">Paste the link of a finished Melee event. You'll then pick each player's leader and base.</p>`);
  }

  function draftView() {
    const { event, players, info } = state.draft;
    const season = store.season(store.seasonFor(event.date));
    const warnings = [];
    if (state.draft.existing) warnings.push("This event is already saved. Saving again replaces it.");
    if (info.unfinished || info.incompleteRounds) warnings.push("Some rounds on Melee aren't finished yet. Unreported matches are left out.");
    if (!season) warnings.push("This date isn't inside any season, so it won't count in standings. Add a season first.");

    const cut = info.topCutRounds ? ` · Top ${info.topCutSize} cut` : "";
    const rows = players.map((p, i) => playerRow(p, i)).join("");

    return `<section class="ed-card">
        <div class="ed-draft-head">
          <div>
            <h2>${esc(event.name)}</h2>
            <p class="page-sub">${players.length} players · ${info.swissRounds} Swiss rounds${cut}${season ? ` · ${esc(season.name)}` : ""}</p>
          </div>
          ${event.melee ? `<a class="btn btn--ghost" href="${esc(event.melee)}" target="_blank" rel="noopener">Melee ↗</a>` : ""}
        </div>
        ${warnings.map((w) => `<p class="notice notice--warn">${esc(w)}</p>`).join("")}
        <div class="ed-fields">
          <label class="field field--grow"><span>Name</span><input data-field="name" value="${esc(event.name)}"></label>
          <label class="field"><span>Date</span><input type="date" data-field="date" value="${esc(event.date)}"></label>
          <label class="field"><span>Type</span>${select("type", SWU.config.eventTypes, event.type, 'data-field="type"')}</label>
          <label class="field"><span>Format</span>${select("format", SWU.config.formats, event.format, 'data-field="format"')}</label>
        </div>
      </section>
      <section class="ed-card">
        <div class="ed-section-head">
          <h3>Players and decks</h3>
          <span class="muted" id="deck-count">${deckCount()}</span>
        </div>
        <p class="footnote">League points = Melee points + ${SWU.config.participationPoints}. Untick "League" for players who aren't part of the league.
          New players start ticked at weeklies and unticked at showdowns.</p>
        <div class="ed-players">
          <div class="ed-player ed-player--head"><span>Player</span><span>Leader</span><span>Base</span><span>League</span></div>
          ${rows}
        </div>
      </section>
      <div class="ed-savebar">
        <button class="btn btn--ghost" data-action="discard">Discard</button>
        <button class="btn btn--primary" data-action="save-event">Save event</button>
      </div>`;
  }

  function playerRow(p, i) {
    const record = ui.record(p.wins, p.losses, p.draws);
    const finish = p.finish ? ` · ${esc(p.finish)}` : "";
    return `<div class="ed-player" data-i="${i}">
      <div class="ed-player-main">
        <span class="ed-rank">${p.rank}</span>
        <div>
          <b>${esc(p.name)}</b>${p.isNew ? ` <span class="pill">New</span>` : ""}
          <small class="muted">${record} · ${p.points} pts${finish}</small>
        </div>
      </div>
      <button type="button" class="picker-btn${p.leader ? " aspect-tint" : ""}" style="${leaderStyle(p.leader)}" data-pick="leader" data-i="${i}">${leaderButton(p.leader)}</button>
      <button type="button" class="picker-btn" data-pick="base" data-i="${i}">${baseButton(p.base)}</button>
      <label class="ed-check"><input type="checkbox" data-league="${i}" ${p.counted ? "checked" : ""}><span>League</span></label>
    </div>`;
  }

  function leaderStyle(id) {
    const l = id && store.leader(id);
    return l ? ui.leaderStyle(l) : "";
  }

  function leaderButton(id) {
    const l = id && store.leader(id);
    if (!l) return `<span class="picker-placeholder">Choose leader…</span>`;
    return `<img class="leader-thumb" src="${esc(l.thumb)}" alt=""><span class="picker-text"><b>${esc(l.name)}</b><small>${esc(l.subtitle)}</small></span>`;
  }

  function baseButton(id) {
    const b = id && store.base(id);
    if (!b) return `<span class="picker-placeholder">Choose base…</span>`;
    return `${ui.baseIcon(b.id, "picker-icon")}<span class="picker-text"><b>${esc(b.name)}</b><small>${b.hp} HP</small></span>`;
  }

  function deckCount() {
    const players = state.draft.players;
    const done = players.filter((p) => p.leader && p.base).length;
    return `Decks entered: ${done} / ${players.length}`;
  }

  function draftFromMelee(normalized) {
    const existing = store.event(normalized.event.id);
    const previous = new Map(existing ? store.eventResults(existing.id).map((r) => [r.player, r]) : []);
    const event = existing
      ? { ...normalized.event, name: existing.name, date: existing.date, type: existing.type, format: existing.format }
      : normalized.event;
    const players = normalized.players.map((p) => {
      const known = store.player(p.key);
      const prev = previous.get(p.key);
      const counted = prev ? prev.counted : known ? known.league : event.type === "Weekly";
      return { ...p, leader: prev ? prev.leader : "", base: prev ? prev.base : "", counted, isNew: !known };
    });
    return { event, players, matches: normalized.matches, info: normalized.info, existing: !!existing };
  }

  function draftFromStored(eventId) {
    const event = store.event(eventId);
    const matches = store.raw().matches.filter((m) => m.event === eventId).map(({ event: _e, ...m }) => m);
    const swiss = new Set(matches.filter((m) => m.phase !== "top").map((m) => m.round));
    const top = new Set(matches.filter((m) => m.phase === "top").map((m) => m.round));
    const players = store.eventResults(eventId).map((r) => ({
      key: r.player,
      name: ui.playerName(r.player),
      points: r.points, wins: r.wins, losses: r.losses, draws: r.draws, rank: r.rank, finish: r.finish,
      leader: r.leader, base: r.base, counted: r.counted, isNew: false,
    }));
    return {
      event: { id: event.id, date: event.date, name: event.name, type: event.type, format: event.format, melee: event.melee },
      players,
      matches,
      info: { swissRounds: swiss.size, topCutRounds: top.size, topCutSize: top.size ? 2 ** top.size : 0, unfinished: 0, incompleteRounds: 0 },
      existing: true,
    };
  }

  async function fetchFromMelee(url) {
    await run("Fetching the event from Melee… this can take 10–20 seconds.", async () => {
      const out = await api.call("melee", { url });
      state.draft = draftFromMelee(SWU.melee.normalize(out.melee));
    });
  }

  async function saveDraft() {
    const { event, players, matches } = state.draft;
    const missing = players.filter((p) => !p.leader || !p.base).length;
    if (missing && !confirm(`${missing} player${missing === 1 ? " has" : "s have"} no leader or base yet. Save anyway? You can fill them in later under Events.`)) return;
    const payload = {
      event,
      results: players.map((p) => ({
        player: p.key, leader: p.leader, base: p.base, points: p.points, bonus: SWU.config.participationPoints,
        wins: p.wins, losses: p.losses, draws: p.draws, rank: p.rank, finish: p.finish, counted: p.counted,
      })),
      matches,
      players: players.map((p) => ({ key: p.key, name: p.name, league: p.counted })),
    };
    await run("Saving the event…", async () => {
      await api.call("saveEvent", payload);
      state.draft = null;
    }, `Saved "${event.name}". It's now on the standings, player pages and meta.`);
  }

  // ---- Events list -----------------------------------------------------

  function eventsView() {
    const events = [...store.allEvents()].reverse();
    if (!events.length) return ui.empty("No events yet", "Use \"Add event\" to import your first Melee event.");
    const rows = events.map((ev) => {
      const results = store.eventResults(ev.id);
      const decks = results.filter((r) => r.leader && r.base).length;
      const season = store.season(ev.season);
      return `<tr>
        <td class="nowrap">${ui.formatDate(ev.date)}</td>
        <td><a href="#/event/${encodeURIComponent(ev.id)}">${esc(ev.name)}</a><span class="sub-record">${season ? esc(season.name) : "No season"}</span></td>
        <td>${ui.typeBadge(ev.type)}</td>
        <td>${esc(ev.format)}</td>
        <td class="num${decks < results.length ? " warn-text" : ""}">${decks}/${results.length}</td>
        <td class="ed-actions">
          <button class="btn btn--small" data-action="edit-event" data-id="${esc(ev.id)}">Edit</button>
          <button class="btn btn--small btn--danger" data-action="delete-event" data-id="${esc(ev.id)}">Delete</button>
        </td>
      </tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Format</th><th class="num">Decks</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ---- Players ---------------------------------------------------------

  function playersView() {
    const counts = new Map();
    for (const r of store.raw().results) counts.set(r.player, (counts.get(r.player) || 0) + 1);
    const filter = state.playerFilter.toLowerCase();
    const players = store.allPlayers()
      .filter((p) => !filter || `${p.name} ${p.key} ${p.nickname}`.toLowerCase().includes(filter))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rows = players.map((p) => {
      const edit = state.playerEdits.get(p.key) || {};
      const nickname = edit.nickname ?? p.nickname;
      const league = edit.league ?? p.league;
      return `<tr>
        <td><b>${esc(p.name)}</b><span class="sub-record">${esc(p.key)}</span></td>
        <td><input class="input-sm" data-nick="${esc(p.key)}" value="${esc(nickname)}" placeholder="—"></td>
        <td><label class="ed-check"><input type="checkbox" data-pleague="${esc(p.key)}" ${league ? "checked" : ""}><span>League</span></label></td>
        <td class="num">${counts.get(p.key) || 0}</td>
      </tr>`;
    }).join("");

    return `<div class="ed-toolbar">
        <input class="input-sm" data-action-input="player-filter" placeholder="Search players…" value="${esc(state.playerFilter)}">
        <button class="btn btn--primary" data-action="save-players" ${state.playerEdits.size ? "" : "disabled"}>Save changes${state.playerEdits.size ? ` (${state.playerEdits.size})` : ""}</button>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Melee name</th><th>Nickname</th><th>League</th><th class="num">Events</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No players yet. They are added automatically when you import an event.</td></tr>`}</tbody>
      </table></div>
      <p class="footnote">"League" decides whether a player is ticked by default the next time you import an event.
        Changing it here doesn't change events that are already saved.</p>`;
  }

  // ---- Calendar ----------------------------------------------------------

  function calendarView() {
    const entry = state.calEdit || { id: "", date: "", time: SWU.config.weeklyTime, type: "Weekly", title: "Weekly Play", format: "Premier", notes: "", melee: "" };
    const today = ui.today();
    const entries = [...store.raw().calendar].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const upcoming = entries.filter((c) => c.date >= today);
    const past = entries.filter((c) => c.date < today).reverse();

    const months = [];
    const d = ui.parseDate(today);
    d.setDate(1);
    for (let i = 0; i < 6; i++) {
      months.push(`<option value="${ui.isoDate(d).slice(0, 7)}">${d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</option>`);
      d.setMonth(d.getMonth() + 1);
    }

    const row = (c) => `<tr>
      <td class="nowrap">${ui.formatDate(c.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
      <td>${esc(c.time)}</td>
      <td>${esc(c.title)}<span class="sub-record">${esc(c.format)}${c.notes ? ` · ${esc(c.notes)}` : ""}</span></td>
      <td>${ui.typeBadge(c.type)}</td>
      <td class="ed-actions">
        <button class="btn btn--small" data-action="edit-cal" data-id="${esc(c.id)}">Edit</button>
        <button class="btn btn--small btn--danger" data-action="delete-cal" data-id="${esc(c.id)}">Delete</button>
      </td>
    </tr>`;
    const table = (list) => `<div class="table-wrap"><table class="table"><tbody>${list.map(row).join("")}</tbody></table></div>`;

    return `<form class="ed-card" data-form="calendar">
        <h3>${entry.id ? "Edit calendar entry" : "New calendar entry"}</h3>
        <div class="ed-fields">
          <label class="field"><span>Date</span><input type="date" name="date" value="${esc(entry.date)}" required></label>
          <label class="field"><span>Time</span><input type="time" name="time" value="${esc(entry.time)}"></label>
          <label class="field"><span>Type</span>${select("type", SWU.config.eventTypes, entry.type)}</label>
          <label class="field"><span>Format</span>${select("format", SWU.config.formats, entry.format)}</label>
          <label class="field field--grow"><span>Title</span><input name="title" value="${esc(entry.title)}" required></label>
          <label class="field field--grow"><span>Notes</span><input name="notes" value="${esc(entry.notes)}" placeholder="Optional"></label>
          <label class="field field--grow"><span>Melee link</span><input type="url" name="melee" value="${esc(entry.melee)}" placeholder="Optional"></label>
        </div>
        <div class="ed-form-actions">
          ${entry.id ? `<button type="button" class="btn btn--ghost" data-action="cancel-cal">Cancel</button>` : ""}
          <button class="btn btn--primary">${entry.id ? "Save changes" : "Add to calendar"}</button>
        </div>
      </form>
      <div class="ed-card ed-quick">
        <span>Add a weekly on every Monday of</span>
        <select data-quick-month>${months.join("")}</select>
        <button class="btn btn--ghost" data-action="add-mondays">Add Mondays</button>
        <span class="muted">(${esc(SWU.config.weeklyTime)}, Premier; existing dates are skipped)</span>
      </div>
      <h3 class="section-title">Upcoming</h3>
      ${upcoming.length ? table(upcoming) : `<p class="muted">Nothing planned yet.</p>`}
      ${past.length ? `<h3 class="section-title">Past</h3>${table(past)}` : ""}`;
  }

  function newId(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function mondaysOf(month) {
    const [y, m] = month.split("-").map(Number);
    const days = [];
    const d = new Date(y, m - 1, 1);
    while (d.getMonth() === m - 1) {
      if (d.getDay() === 1) days.push(ui.isoDate(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  // ---- Seasons -----------------------------------------------------------

  function seasonsView() {
    const seasons = [...store.seasons()].reverse();
    const count = (id) => store.eventsIn(id).length;
    const edit = state.seasonEdit;
    const form = edit
      ? `<form class="ed-card" data-form="season">
          <h3>${edit.id ? "Edit season" : "New season"}</h3>
          <div class="ed-fields">
            <label class="field field--grow"><span>Name</span><input name="name" value="${esc(edit.name)}" required></label>
            <label class="field"><span>Start</span><input type="date" name="start" value="${esc(edit.start)}" required></label>
            <label class="field"><span>End (optional)</span><input type="date" name="end" value="${esc(edit.end)}"></label>
          </div>
          <p class="footnote">Without an end date, a season lasts until the next season starts.</p>
          <div class="ed-form-actions">
            <button type="button" class="btn btn--ghost" data-action="cancel-season">Cancel</button>
            <button class="btn btn--primary">Save season</button>
          </div>
        </form>`
      : `<div class="ed-toolbar"><button class="btn btn--primary" data-action="new-season">New season</button></div>`;

    const rows = seasons.map((s) => `<tr>
      <td><b>${esc(s.name)}</b>${s.id === store.currentSeasonId() ? ` <span class="pill">Current</span>` : ""}</td>
      <td class="nowrap">${ui.formatDate(s.start)}</td>
      <td class="nowrap">${s.end ? ui.formatDate(s.end) : s.until === "9999-12-31" ? "Ongoing" : `${ui.formatDate(s.until)} <span class="muted">(next season starts)</span>`}</td>
      <td class="num">${count(s.id)}</td>
      <td class="ed-actions">
        <button class="btn btn--small" data-action="edit-season" data-id="${esc(s.id)}">Edit</button>
        <button class="btn btn--small btn--danger" data-action="delete-season" data-id="${esc(s.id)}">Delete</button>
      </td>
    </tr>`).join("");

    return `${form}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Season</th><th>Start</th><th>End</th><th class="num">Events</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">No seasons yet.</td></tr>`}</tbody>
      </table></div>
      <p class="footnote">Events belong to whichever season their date falls in, so changing dates here moves events between seasons automatically.</p>`;
  }

  // ---- Event handlers ----------------------------------------------------

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function onSubmit(e) {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const data = formData(form);

    if (form.dataset.form === "login") {
      run("Checking password…", () => api.login(data.password));
    } else if (form.dataset.form === "fetch") {
      fetchFromMelee(data.url.trim());
    } else if (form.dataset.form === "calendar") {
      const entry = { ...data, id: (state.calEdit && state.calEdit.id) || newId("c") };
      run("Saving calendar…", async () => {
        await api.call("saveCalendar", { entries: [entry] });
        state.calEdit = null;
      }, "Calendar saved.");
    } else if (form.dataset.form === "season") {
      const season = { ...data, id: state.seasonEdit.id || newId("s") };
      run("Saving season…", async () => {
        await api.call("saveSeason", { season });
        state.seasonEdit = null;
      }, `Saved ${season.name}.`);
    }
  }

  function onClick(e) {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      state.notice = null;
      return draw();
    }
    const pick = e.target.closest("[data-pick]");
    if (pick) return openPicker(pick);

    const btn = e.target.closest("[data-action]");
    if (!btn || btn.tagName === "INPUT") return;
    const id = btn.dataset.id;
    const raw = store.raw();

    switch (btn.dataset.action) {
      case "logout":
        api.logout();
        state.notice = null;
        return draw();
      case "discard":
        if (confirm("Discard this event without saving?")) {
          state.draft = null;
          draw();
        }
        return;
      case "save-event":
        return saveDraft();
      case "edit-event":
        state.draft = draftFromStored(id);
        state.tab = "import";
        state.notice = null;
        draw();
        return window.scrollTo(0, 0);
      case "delete-event": {
        const ev = store.event(id);
        if (!confirm(`Delete "${ev.name}" (${ui.formatDate(ev.date)}) with all its results and matches?`)) return;
        return run("Deleting event…", () => api.call("deleteEvent", { id }), "Event deleted.");
      }
      case "save-players": {
        const players = [...state.playerEdits.entries()].map(([key, edit]) => ({ key, ...edit }));
        return run("Saving players…", async () => {
          await api.call("savePlayers", { players });
          state.playerEdits.clear();
        }, "Players saved.");
      }
      case "edit-cal":
        state.calEdit = raw.calendar.find((c) => c.id === id);
        draw();
        return window.scrollTo(0, 0);
      case "cancel-cal":
        state.calEdit = null;
        return draw();
      case "delete-cal": {
        const c = raw.calendar.find((x) => x.id === id);
        if (!confirm(`Delete "${c.title}" on ${ui.formatDate(c.date)} from the calendar?`)) return;
        return run("Deleting…", () => api.call("deleteCalendar", { id }), "Calendar entry deleted.");
      }
      case "add-mondays": {
        const month = root.querySelector("[data-quick-month]").value;
        const taken = new Set(raw.calendar.map((c) => c.date));
        const entries = mondaysOf(month).filter((d) => !taken.has(d)).map((date) => ({
          id: newId("c"), date, time: SWU.config.weeklyTime, type: "Weekly", title: "Weekly Play", format: "Premier", notes: "", melee: "",
        }));
        if (!entries.length) {
          notify("ok", "Every Monday of that month is already on the calendar.");
          return draw();
        }
        return run("Adding Mondays…", () => api.call("saveCalendar", { entries }), `Added ${entries.length} weekly event${entries.length === 1 ? "" : "s"}.`);
      }
      case "new-season":
        state.seasonEdit = { id: "", name: `Season ${store.seasons().length + 1}`, start: ui.today(), end: "" };
        return draw();
      case "edit-season": {
        const s = raw.seasons.find((x) => x.id === id);
        state.seasonEdit = { ...s };
        return draw();
      }
      case "cancel-season":
        state.seasonEdit = null;
        return draw();
      case "delete-season": {
        const s = store.season(id);
        if (!confirm(`Delete ${s.name}? Its events are kept, but they won't belong to any season until you add one that covers their dates.`)) return;
        return run("Deleting season…", () => api.call("deleteSeason", { id }), "Season deleted.");
      }
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.field && state.draft) {
      state.draft.event[t.dataset.field] = t.value;
      if (t.dataset.field === "date") draw(); // season info depends on the date
      return;
    }
    if (t.dataset.league !== undefined && state.draft) {
      state.draft.players[Number(t.dataset.league)].counted = t.checked;
      return;
    }
    if (t.dataset.pleague !== undefined) return editPlayer(t.dataset.pleague, { league: t.checked });
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.field === "name" && state.draft) state.draft.event.name = t.value;
    if (t.dataset.nick !== undefined) editPlayer(t.dataset.nick, { nickname: t.value });
    if (t.dataset.actionInput === "player-filter") {
      state.playerFilter = t.value;
      draw();
      const input = root.querySelector('[data-action-input="player-filter"]');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // Edits are collected and sent together with "Save changes"; no redraw so typing keeps focus.
  function editPlayer(key, change) {
    state.playerEdits.set(key, { ...(state.playerEdits.get(key) || {}), ...change });
    const btn = root.querySelector('[data-action="save-players"]');
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Save changes (${state.playerEdits.size})`;
    }
  }

  // ---- Searchable picker -------------------------------------------------

  let picker = null;

  function normalizeText(text) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function pickerOptions(kind) {
    const usage = store.usage()[kind === "leader" ? "leaders" : "bases"];
    const items = kind === "leader" ? store.allLeaders() : store.allBases();
    return items
      .map((item, order) => ({
        item,
        order,
        used: usage.get(item.id) || 0,
        search: normalizeText(kind === "leader"
          ? `${item.name} ${item.subtitle} ${item.set} ${item.aspects.join(" ")}`
          : `${item.name} ${item.cards.join(" ")} ${item.color || ""}`),
      }))
      .sort((a, b) => b.used - a.used || a.order - b.order);
  }

  function optionHtml(kind, { item, used }, active) {
    const usedText = used ? `<span class="picker-used">${used}×</span>` : "";
    if (kind === "leader") {
      return `<li role="option" class="picker-option${active ? " active" : ""}" data-value="${esc(item.id)}">
        <span class="leader aspect-tint" style="${ui.leaderStyle(item)}">
          <img class="leader-thumb" src="${esc(item.thumb)}" alt="" loading="lazy">
          <span class="picker-text"><b>${esc(item.name)}</b><small>${esc(item.subtitle)} · ${esc(item.set)}</small></span>
        </span>${usedText}
      </li>`;
    }
    const detail = item.kind === "common" ? `${item.hp} HP · ${item.cards.slice(0, 3).join(", ")}${item.cards.length > 3 ? "…" : ""}` : `${item.hp} HP`;
    return `<li role="option" class="picker-option${active ? " active" : ""}" data-value="${esc(item.id)}">
      ${ui.baseIcon(item.id, "picker-icon")}
      <span class="picker-text"><b>${esc(item.name)}</b><small>${esc(detail)}</small></span>${usedText}
    </li>`;
  }

  function openPicker(btn) {
    closePicker();
    const kind = btn.dataset.pick;
    const index = Number(btn.dataset.i);
    const pop = document.createElement("div");
    pop.className = "picker-pop";
    pop.innerHTML = `<input class="picker-search" placeholder="Search ${kind === "leader" ? "leaders" : "bases or base cards"}…" autocomplete="off" spellcheck="false">
      <ul class="picker-list" role="listbox"></ul>
      <button type="button" class="picker-clear">Clear</button>`;
    document.body.appendChild(pop);

    const rect = btn.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 340), window.innerWidth - 16);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - width - 8) + window.scrollX}px`;
    pop.style.top = `${rect.bottom + window.scrollY + 4}px`;

    const options = pickerOptions(kind);
    picker = { pop, btn, kind, index, options, visible: options, active: 0 };

    const input = pop.querySelector(".picker-search");
    input.addEventListener("input", () => filterPicker(input.value));
    input.addEventListener("keydown", pickerKeys);
    pop.querySelector(".picker-list").addEventListener("mousedown", (e) => {
      const li = e.target.closest("[data-value]");
      if (li) {
        e.preventDefault();
        choose(li.dataset.value);
      }
    });
    pop.querySelector(".picker-clear").addEventListener("click", () => choose(""));
    filterPicker("");
    input.focus();
    setTimeout(() => document.addEventListener("mousedown", outsideClick), 0);
  }

  function filterPicker(text) {
    const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
    picker.visible = picker.options.filter((o) => tokens.every((t) => o.search.includes(t)));
    picker.active = 0;
    renderPickerList();
  }

  function renderPickerList() {
    const list = picker.pop.querySelector(".picker-list");
    list.innerHTML = picker.visible.length
      ? picker.visible.map((o, i) => optionHtml(picker.kind, o, i === picker.active)).join("")
      : `<li class="picker-empty">No matches</li>`;
    const active = list.querySelector(".active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function pickerKeys(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      picker.active = Math.max(0, Math.min(picker.visible.length - 1, picker.active + step));
      renderPickerList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = picker.visible[picker.active];
      if (option) choose(option.item.id);
    } else if (e.key === "Escape") {
      const btn = picker.btn;
      closePicker();
      btn.focus();
    }
  }

  function choose(value) {
    const { kind, index, btn } = picker;
    const player = state.draft.players[index];
    player[kind] = value;
    btn.innerHTML = kind === "leader" ? leaderButton(value) : baseButton(value);
    if (kind === "leader") {
      btn.setAttribute("style", leaderStyle(value));
      btn.classList.toggle("aspect-tint", !!value);
    }
    const counter = root.querySelector("#deck-count");
    if (counter) counter.textContent = deckCount();
    closePicker();
    // Move straight on to the next empty choice to speed up data entry.
    const next = kind === "leader" ? root.querySelector(`[data-pick="base"][data-i="${index}"]`) : null;
    if (next && value && !player.base) openPicker(next);
    else btn.focus();
  }

  function outsideClick(e) {
    if (picker && !picker.pop.contains(e.target) && !picker.btn.contains(e.target)) closePicker();
  }

  function closePicker() {
    if (!picker) return;
    picker.pop.remove();
    document.removeEventListener("mousedown", outsideClick);
    picker = null;
  }
})();
