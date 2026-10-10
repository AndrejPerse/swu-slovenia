// One render function per page. Each returns an HTML string for <main id="app">.
(function () {
  const views = (SWU.views = {});
  const { esc } = SWU.ui;
  const ui = SWU.ui;
  const store = SWU.store;

  function pageHead(title, subtitle) {
    return `<section class="page-head"><h1>${esc(title)}</h1>${subtitle ? `<p class="page-sub">${subtitle}</p>` : ""}</section>`;
  }

  function seasonLabel(seasonId) {
    const s = store.season(seasonId);
    if (!s) return "";
    const current = seasonId === store.currentSeasonId();
    return `${esc(s.name)}${current ? ` <span class="pill">Current season</span>` : ` <span class="pill pill--muted">Past season</span>`}`;
  }

  // ---- Standings -------------------------------------------------------

  views.standings = function () {
    const seasonId = SWU.state.season;
    const rows = store.standings(seasonId);
    const events = store.eventsIn(seasonId);
    const head = pageHead("Standings", `${seasonLabel(seasonId)} · ${events.length} event${events.length === 1 ? "" : "s"} · ${rows.length} players`);
    if (!rows.length) return head + ui.empty("No results yet", "Standings appear after the first event of the season is entered.");

    const body = rows
      .map((r) => {
        const matchPoints = r.points - r.events;
        return `<tr class="row-link${r.rank <= 3 ? ` podium podium--${r.rank}` : ""}" data-href="#/player/${encodeURIComponent(r.player)}">
          <td class="rank"><span>${r.rank}</span></td>
          <td class="player-cell">${ui.playerLink(r.player)}<span class="sub-record">${ui.record(r.wins, r.losses, r.draws)}</span></td>
          <td class="num points" title="${matchPoints} from matches + ${r.events} for participation">${r.points}</td>
          <td class="num">${r.weeklies}</td>
          <td class="num">${r.showdowns}</td>
          <td class="num">${r.events}</td>
        </tr>`;
      })
      .join("");

    return `${head}
      <div class="table-wrap">
        <table class="table standings">
          <thead><tr>
            <th class="rank">#</th><th>Player</th><th class="num">Points</th>
            <th class="num"><span class="long">Weeklies</span><span class="short" title="Weeklies">Wkl</span></th>
            <th class="num"><span class="long">Showdowns</span><span class="short" title="Showdowns">Shd</span></th>
            <th class="num"><span class="long">Total events</span><span class="short" title="Total events">Tot</span></th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="footnote">Points = match points from Melee (win 3, draw 1, loss 0) + 1 per event attended. Top-cut matches don't add points.
      Ties go to whoever had more points before the most recent event.</p>`;
  };

  // ---- Player ----------------------------------------------------------

  views.player = function ([playerKey, eventId]) {
    const player = store.player(playerKey);
    if (!player) return pageHead("Player not found") + ui.empty("Unknown player", "This player isn't in the league data.");

    // A link to an event from another season switches the whole site to that season.
    const linked = eventId && store.event(eventId);
    if (linked && linked.season !== SWU.state.season) SWU.setSeason(linked.season, { silent: true });
    const seasonId = SWU.state.season;
    const history = store.playerEvents(playerKey, seasonId);
    const standing = store.standings(seasonId).find((r) => r.player === playerKey);
    const selected = history.find((h) => h.event.id === eventId) || history[0];

    const otherSeasons = [...store.playerSeasonIds(playerKey)].filter((id) => id !== seasonId);
    const seasonSwitch = otherSeasons.length
      ? `<p class="page-sub">Also played in: ${otherSeasons.map((id) => `<button class="link-btn" data-season="${esc(id)}">${esc(store.season(id).name)}</button>`).join(", ")}</p>`
      : "";

    const stats = standing
      ? `<div class="stat-row">
          ${stat("Rank", `#${standing.rank}`)}${stat("Points", standing.points)}
          ${stat("Events", standing.events)}${stat("Record", ui.record(standing.wins, standing.losses, standing.draws))}
        </div>`
      : history.length
        ? `<p class="page-sub">Not counted in this season's league standings.</p>`
        : "";

    const header = `<section class="page-head player-head">
        <a class="back" href="#/standings">← Standings</a>
        <h1>${esc(player.name)}${player.nickname ? ` <span class="nick">“${esc(player.nickname)}”</span>` : ""}</h1>
        <p class="page-sub">${seasonLabel(seasonId)}</p>
        ${seasonSwitch}
        ${stats}
      </section>`;

    if (!history.length) return header + ui.empty("No events this season", "Pick another season to see this player's history.");

    const list = history
      .map(({ event, result }) => {
        const active = selected && event.id === selected.event.id;
        return `<a class="event-item${active ? " active" : ""}" href="#/player/${encodeURIComponent(playerKey)}/${encodeURIComponent(event.id)}">
          <div class="event-item-top">
            <span class="event-date">${ui.formatDate(event.date)}</span>
            ${ui.typeBadge(event.type)}
          </div>
          <div class="event-item-name">${esc(event.name)} <span class="muted">· ${esc(event.format)}</span></div>
          <div class="event-item-deck">${ui.leader(result.leader, { compact: true })}${ui.base(result.base)}</div>
          <div class="event-item-score">
            <span>${ui.record(result.wins, result.losses, result.draws)}</span>
            <span><b>${result.points + result.bonus}</b> pts</span>
          </div>
        </a>`;
      })
      .join("");

    return `${header}<div class="split">
        <aside class="split-list">${list}</aside>
        <section class="split-detail" id="event-detail">${eventDetail(playerKey, selected)}</section>
      </div>`;
  };

  function stat(label, value) {
    return `<div class="stat"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`;
  }

  function finishText(result) {
    if (result.finish === "Winner") return "🏆 Winner";
    if (result.finish) return `${result.finish} · ${ordinal(result.rank)} place`;
    return `${ordinal(result.rank)} place`;
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function eventDetail(playerKey, entry) {
    const { event, result } = entry;
    const leader = store.leader(result.leader);
    const matches = store.playerMatches(event.id, playerKey);

    const rounds = matches
      .map((m) => {
        if (m.outcome === "BYE") {
          return `<tr><td class="round-name">${esc(m.roundName)}</td><td colspan="3" class="muted">Bye</td><td class="num score">—</td><td>${ui.outcomeBadge("BYE")}</td></tr>`;
        }
        const opp = m.opponentResult || {};
        const draws = m.gameDraws ? `-${m.gameDraws}` : "";
        return `<tr${m.topCut ? ' class="topcut"' : ""}>
          <td class="round-name">${esc(m.roundName)}</td>
          <td>${ui.playerLink(m.opponent)}</td>
          <td>${ui.leader(opp.leader, { compact: true })}</td>
          <td>${ui.base(opp.base)}</td>
          <td class="num score">${m.myGames}-${m.oppGames}${draws}</td>
          <td>${ui.outcomeBadge(m.outcome)}</td>
        </tr>`;
      })
      .join("");

    const hasTopCut = matches.some((m) => m.topCut);
    return `<div class="detail-head">
        <div>
          <h2>${esc(event.name)}</h2>
          <p class="page-sub">${ui.formatDate(event.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${esc(event.type)} · ${esc(event.format)}</p>
        </div>
        ${event.melee ? `<a class="btn btn--ghost" href="${esc(event.melee)}" target="_blank" rel="noopener">View on Melee ↗</a>` : ""}
      </div>
      <div class="deck">
        ${leader ? `<img class="deck-art" src="${esc(leader.art)}" alt="${esc(leader.name)}">` : `<div class="deck-art deck-art--empty">No leader recorded</div>`}
        <div class="deck-info">
          ${leader ? `<h3>${esc(leader.name)}</h3><p class="leader-sub">${esc(leader.subtitle)}</p>${ui.aspectDots(leader.aspects)}` : ""}
          <div class="deck-base">${ui.base(result.base, { large: true })}</div>
          <div class="deck-result">
            <span class="finish">${finishText(result)}</span>
            <span>${ui.record(result.wins, result.losses, result.draws)} in Swiss · <b>${result.points + result.bonus}</b> league pts${result.counted ? "" : " (not counted)"}</span>
          </div>
        </div>
      </div>
      <h3 class="section-title">Matches</h3>
      <div class="table-wrap">
        <table class="table rounds">
          <thead><tr><th>Round</th><th>Opponent</th><th>Leader</th><th>Base</th><th class="num">Games</th><th></th></tr></thead>
          <tbody>${rounds}</tbody>
        </table>
      </div>
      ${hasTopCut ? `<p class="footnote">Highlighted rows are top-cut matches; they don't add league points.</p>` : ""}`;
  }

  // ---- Meta ------------------------------------------------------------

  const META_COLUMNS = [
    { key: "leader", label: "Leader", text: true, value: (r) => (store.leader(r.leader) || {}).name || "" },
    { key: "base", label: "Base", text: true, value: (r) => (store.base(r.base) || {}).name || "" },
    { key: "events", label: "Events", value: (r) => r.events },
    { key: "wins", label: "W", title: "Match wins", value: (r) => r.wins },
    { key: "losses", label: "L", title: "Match losses", value: (r) => r.losses },
    { key: "draws", label: "D", title: "Match draws", value: (r) => r.draws },
    { key: "winRate", label: "Win %", value: (r) => r.winRate },
    { key: "pointsPerEvent", label: "Pts/Event", title: "Average Melee match points per event (without the participation point)", value: (r) => r.pointsPerEvent },
  ];

  views.meta = function () {
    const seasonId = SWU.state.season;
    const formats = store.formatsIn(seasonId);
    if (!formats.includes(SWU.state.metaFormat)) SWU.state.metaFormat = formats[0];
    const format = SWU.state.metaFormat;
    const head = pageHead("Meta", `${seasonLabel(seasonId)} · Leader + base combinations`);
    if (!formats.length) return head + ui.empty("No events yet", "The meta table fills up as events are entered.");

    const tabs = `<div class="tabs" role="tablist">${formats
      .map((f) => `<button class="tab${f === format ? " active" : ""}" data-format="${esc(f)}" role="tab">${esc(f)}</button>`)
      .join("")}</div>`;

    const sort = SWU.state.metaSort;
    const column = META_COLUMNS.find((c) => c.key === sort.col);
    const rows = store.meta(seasonId, format).sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      const primary = column.text ? va.localeCompare(vb) : va - vb;
      return (sort.dir === "asc" ? primary : -primary) || b.events - a.events;
    });

    const thead = META_COLUMNS.map((c) => {
      const active = c.key === sort.col;
      const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "";
      return `<th class="${c.text ? "" : "num "}sortable${active ? " sorted" : ""}" data-sort="${c.key}" ${c.title ? `title="${esc(c.title)}"` : ""} aria-sort="${active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}">
        <button>${esc(c.label)}<span class="arrow">${arrow}</span></button></th>`;
    }).join("");

    const tbody = rows
      .map((r) => `<tr>
        <td>${ui.leader(r.leader)}</td>
        <td>${ui.base(r.base)}</td>
        <td class="num">${r.events}</td>
        <td class="num">${r.wins}</td>
        <td class="num">${r.losses}</td>
        <td class="num">${r.draws}</td>
        <td class="num"><span class="winrate"><span class="winrate-bar" style="width:${Math.round(r.winRate * 100)}%"></span><span>${ui.percent(r.winRate)}</span></span></td>
        <td class="num">${r.pointsPerEvent.toFixed(1)}</td>
      </tr>`)
      .join("");

    return `${head}${tabs}
      ${rows.length
        ? `<div class="table-wrap"><table class="table meta"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`
        : ui.empty("No decks recorded", `No leaders and bases have been entered for ${format} events yet.`)}
      <p class="footnote">W / L / D count matches${SWU.config.metaIncludesTopCut ? ", including top cut" : " in Swiss rounds only"}; byes are left out.
      Pts/Event is the average Melee match points, without the participation point. Click a column title to sort.</p>`;
  };

  views.metaToggleSort = function (col) {
    const sort = SWU.state.metaSort;
    const column = META_COLUMNS.find((c) => c.key === col);
    if (sort.col === col) sort.dir = sort.dir === "desc" ? "asc" : "desc";
    else SWU.state.metaSort = { col, dir: column.text ? "asc" : "desc" };
  };

  // ---- Calendar --------------------------------------------------------

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  views.shiftMonth = function (delta) {
    const [y, m] = SWU.state.calMonth.split("-").map(Number);
    const next = monthKey(new Date(y, m - 1 + delta, 1));
    if (next >= SWU.config.calendarStart) SWU.state.calMonth = next;
  };

  views.calendar = function () {
    const items = store.calendarItems();
    const today = ui.today();
    const [year, month] = SWU.state.calMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const upcoming = items.filter((i) => i.date >= today && !i.eventId);
    const nextId = upcoming[0] && upcoming[0].id;

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<div class="cal-cell cal-cell--blank"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${SWU.state.calMonth}-${String(d).padStart(2, "0")}`;
      const dayItems = items.filter((i) => i.date === iso);
      cells.push(`<div class="cal-cell${iso === today ? " cal-cell--today" : ""}${iso < today ? " cal-cell--past" : ""}">
        <span class="cal-day">${d}</span>
        ${dayItems.map((i) => calendarChip(i, i.id === nextId)).join("")}
      </div>`);
    }

    const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const canGoBack = SWU.state.calMonth > SWU.config.calendarStart;

    const upcomingList = upcoming.length
      ? upcoming.slice(0, 6).map((i) => calendarCard(i, i.id === nextId)).join("")
      : `<p class="muted">Nothing scheduled yet.</p>`;

    return `${pageHead("Calendar", "Weeklies are usually on Mondays, showdowns on weekends.")}
      <div class="calendar-layout">
        <section class="calendar">
          <div class="cal-nav">
            <button class="icon-btn" data-month="-1" ${canGoBack ? "" : "disabled"} aria-label="Previous month">‹</button>
            <h2>${esc(title)}</h2>
            <button class="icon-btn" data-month="1" aria-label="Next month">›</button>
          </div>
          <div class="cal-grid">
            ${WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join("")}
            ${cells.join("")}
          </div>
        </section>
        <aside class="upcoming">
          <h3 class="section-title">Upcoming</h3>
          ${upcomingList}
        </aside>
      </div>`;
  };

  function calendarChip(item, isNext) {
    const cls = `cal-chip cal-chip--${item.type === "Showdown" ? "showdown" : "weekly"}${isNext ? " cal-chip--next" : ""}`;
    const href = item.eventId ? `#/event/${encodeURIComponent(item.eventId)}` : `#/calendar/${encodeURIComponent(item.id)}`;
    const tooltip = `${item.time ? `${item.time} ` : ""}${item.title} · ${item.format}`;
    return `<a class="${cls}" href="${href}" title="${esc(tooltip)}">${item.time ? `<span class="cal-chip-time">${esc(item.time)}</span>` : ""}${esc(item.title)}</a>`;
  }

  function calendarCard(item, isNext) {
    return `<div class="cal-card${isNext ? " cal-card--next" : ""}" id="cal-${esc(item.id)}">
      ${isNext ? `<span class="pill">Next event</span>` : ""}
      <div class="cal-card-date">${ui.formatDate(item.date, { weekday: "long", day: "numeric", month: "long" })}${item.time ? ` · ${esc(item.time)}` : ""}</div>
      <div class="cal-card-title">${esc(item.title)} ${ui.typeBadge(item.type)}</div>
      <div class="muted">${esc(item.format)}</div>
      ${item.notes ? `<p class="cal-card-notes">${esc(item.notes)}</p>` : ""}
      ${item.melee ? `<a href="${esc(item.melee)}" target="_blank" rel="noopener">Melee page ↗</a>` : ""}
    </div>`;
  }

  // A played event: everyone's finish, deck and points in one table.
  views.event = function ([eventId]) {
    const event = store.event(eventId);
    if (!event) return pageHead("Event not found") + ui.empty("Unknown event", "This event isn't in the league data.");
    const results = store.eventResults(eventId);
    const rows = results
      .map((r) => `<tr class="row-link" data-href="#/player/${encodeURIComponent(r.player)}/${encodeURIComponent(eventId)}">
        <td class="rank"><span>${r.rank}</span></td>
        <td class="player-cell">${ui.playerLink(r.player)}${r.finish ? `<span class="sub-record">${esc(r.finish)}</span>` : ""}</td>
        <td>${ui.leader(r.leader, { compact: true })}</td>
        <td>${ui.base(r.base)}</td>
        <td class="num">${ui.record(r.wins, r.losses, r.draws)}</td>
        <td class="num points">${r.counted ? r.points + r.bonus : `<span class="muted" title="Not in the league">–</span>`}</td>
      </tr>`)
      .join("");
    return `${pageHead(event.name, `${ui.formatDate(event.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${ui.typeBadge(event.type)} · ${esc(event.format)} · ${results.length} players`)}
      ${event.melee ? `<p><a class="btn btn--ghost" href="${esc(event.melee)}" target="_blank" rel="noopener">View on Melee ↗</a></p>` : ""}
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="rank">#</th><th>Player</th><th>Leader</th><th>Base</th><th class="num">Swiss</th><th class="num">League pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  };

  views.calendarEntry = function ([id]) {
    const item = store.calendarItems().find((i) => i.id === id);
    if (!item) return pageHead("Not found") + ui.empty("Unknown calendar entry", "");
    return `${pageHead("Calendar")}<a class="back" href="#/calendar">← Calendar</a><div class="cal-detail">${calendarCard(item, false)}</div>`;
  };
})();
