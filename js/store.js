// Loads league data and computes every statistic shown on the site.
// The raw data mirrors the Google Sheet tabs: seasons, players, events, results, matches, calendar.
(function () {
  const store = (SWU.store = {});
  const CACHE_KEY = "swu-league-data";

  let db = null;

  store.load = async function (onUpdate) {
    if (!SWU.config.apiUrl) {
      db = buildIndex(window.SWU_SAMPLE_DATA);
      return db;
    }
    const cached = readCache();
    if (cached) {
      db = buildIndex(cached);
      refresh(onUpdate);
      return db;
    }
    db = buildIndex(await fetchData());
    return db;
  };

  async function fetchData() {
    const res = await fetch(`${SWU.config.apiUrl}?action=data`);
    if (!res.ok) throw new Error(`Could not load league data (${res.status})`);
    const raw = await res.json();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch (e) { /* storage unavailable */ }
    return raw;
  }

  async function refresh(onUpdate) {
    try {
      const raw = await fetchData();
      db = buildIndex(raw);
      if (onUpdate) onUpdate();
    } catch (e) {
      console.warn(e);
    }
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }

  function groupBy(list, keyFn) {
    const map = new Map();
    for (const item of list) {
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }

  function dayBefore(iso) {
    const d = SWU.ui.parseDate(iso);
    d.setDate(d.getDate() - 1);
    return SWU.ui.isoDate(d);
  }

  // A season runs from its start date to its end date. Without an end date it runs
  // until the day before the next season starts (or forever, for the latest season).
  function withSeasonEnds(seasons) {
    const sorted = [...seasons].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.map((s, i) => ({
      ...s,
      until: s.end || (sorted[i + 1] ? dayBefore(sorted[i + 1].start) : "9999-12-31"),
    }));
  }

  function buildIndex(raw) {
    const cards = window.SWU_CARDS;
    const seasons = withSeasonEnds(raw.seasons);
    const events = [...raw.events]
      .map((e) => ({ ...e, season: (seasons.find((s) => s.start <= e.date && e.date <= s.until) || {}).id || null }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      raw,
      sample: !!raw.sample,
      leaders: new Map(cards.leaders.map((l) => [l.id, l])),
      bases: new Map(cards.bases.map((b) => [b.id, b])),
      players: new Map(raw.players.map((p) => [p.key, p])),
      seasons,
      events,
      eventsById: new Map(events.map((e) => [e.id, e])),
      resultsByEvent: groupBy(raw.results, (r) => r.event),
      result: new Map(raw.results.map((r) => [`${r.event}|${r.player}`, r])),
      matchesByEvent: groupBy(raw.matches, (m) => m.event),
    };
  }

  // ---- Lookups ---------------------------------------------------------

  store.isSample = () => db.sample;
  store.seasons = () => db.seasons;
  store.season = (id) => db.seasons.find((s) => s.id === id);
  store.player = (key) => db.players.get(key);
  store.leader = (id) => db.leaders.get(id);
  store.base = (id) => db.bases.get(id);
  store.event = (id) => db.eventsById.get(id);
  store.allLeaders = () => [...db.leaders.values()];
  store.allBases = () => [...db.bases.values()];

  // Used by the editor after a save: the response carries the fresh data.
  store.setData = function (raw) {
    db = buildIndex(raw);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch (e) { /* storage unavailable */ }
  };

  store.raw = () => db.raw;
  store.allPlayers = () => [...db.players.values()];
  store.allEvents = () => db.events;
  store.seasonFor = (date) => (db.seasons.find((s) => s.start <= date && date <= s.until) || {}).id || null;

  // How often each leader / base has been recorded, for "most used first" in the editor pickers.
  store.usage = function () {
    const leaders = new Map();
    const bases = new Map();
    for (const r of db.raw.results) {
      if (r.leader) leaders.set(r.leader, (leaders.get(r.leader) || 0) + 1);
      if (r.base) bases.set(r.base, (bases.get(r.base) || 0) + 1);
    }
    return { leaders, bases };
  };

  store.currentSeasonId = function () {
    const today = SWU.ui.today();
    const active = db.seasons.find((s) => s.start <= today && today <= s.until);
    const latest = db.seasons[db.seasons.length - 1];
    return (active || latest || {}).id;
  };

  store.eventsIn = (seasonId) => db.events.filter((e) => e.season === seasonId);

  store.formatsIn = function (seasonId) {
    return [...new Set(store.eventsIn(seasonId).map((e) => e.format))].sort((a, b) =>
      a === "Premier" ? -1 : b === "Premier" ? 1 : a.localeCompare(b)
    );
  };

  // ---- Standings -------------------------------------------------------

  // Ties are broken by whoever had more points before the latest event, then the event
  // before that, and so on. If still tied (e.g. after the first event of a season), the
  // better placement at the most recent event both players attended wins.
  store.standings = function (seasonId) {
    const events = store.eventsIn(seasonId);
    const rows = new Map();
    events.forEach((ev, i) => {
      for (const r of db.resultsByEvent.get(ev.id) || []) {
        if (!r.counted) continue;
        let row = rows.get(r.player);
        if (!row) {
          row = {
            player: r.player, points: 0, weeklies: 0, showdowns: 0, events: 0, wins: 0, losses: 0, draws: 0,
            after: new Array(events.length).fill(null), placements: new Array(events.length).fill(null),
          };
          rows.set(r.player, row);
        }
        row.placements[i] = r.rank;
        row.points += r.points + r.bonus;
        if (ev.type === "Showdown") row.showdowns++; else row.weeklies++;
        row.events++;
        row.wins += r.wins;
        row.losses += r.losses;
        row.draws += r.draws;
        row.after[i] = row.points;
      }
    });

    const list = [...rows.values()];
    for (const row of list) {
      let running = 0;
      row.after = row.after.map((v) => (v === null ? running : (running = v)));
    }

    const compare = (a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let i = events.length - 1; i >= 0; i--) {
        if (b.after[i] !== a.after[i]) return b.after[i] - a.after[i];
      }
      for (let i = events.length - 1; i >= 0; i--) {
        if (a.placements[i] !== null && b.placements[i] !== null && a.placements[i] !== b.placements[i]) {
          return a.placements[i] - b.placements[i];
        }
      }
      return 0;
    };
    list.sort((a, b) => compare(a, b) || SWU.ui.playerName(a.player).localeCompare(SWU.ui.playerName(b.player)));
    list.forEach((row, i) => {
      row.rank = i > 0 && compare(list[i - 1], row) === 0 ? list[i - 1].rank : i + 1;
    });
    return list;
  };

  // ---- Player history --------------------------------------------------

  function outcome(match, playerKey) {
    if (match.result === "bye") return "BYE";
    if (match.result === "draw") return "D";
    const iAmP1 = match.p1 === playerKey;
    return (match.result === "p1") === iAmP1 ? "W" : "L";
  }

  store.playerMatches = function (eventId, playerKey) {
    return (db.matchesByEvent.get(eventId) || [])
      .filter((m) => m.p1 === playerKey || m.p2 === playerKey)
      .sort((a, b) => a.round - b.round)
      .map((m) => {
        const iAmP1 = m.p1 === playerKey;
        const opponent = iAmP1 ? m.p2 : m.p1;
        return {
          round: m.round,
          roundName: m.roundName,
          topCut: m.phase === "top",
          opponent,
          opponentResult: opponent ? db.result.get(`${eventId}|${opponent}`) : null,
          myGames: iAmP1 ? m.g1 : m.g2,
          oppGames: iAmP1 ? m.g2 : m.g1,
          gameDraws: m.gd,
          outcome: outcome(m, playerKey),
        };
      });
  };

  store.playerEvents = function (playerKey, seasonId) {
    return store
      .eventsIn(seasonId)
      .filter((ev) => db.result.has(`${ev.id}|${playerKey}`))
      .reverse()
      .map((ev) => ({ event: ev, result: db.result.get(`${ev.id}|${playerKey}`) }));
  };

  store.eventResults = (eventId) => [...(db.resultsByEvent.get(eventId) || [])].sort((a, b) => a.rank - b.rank);

  store.playerSeasonIds = function (playerKey) {
    const ids = new Set();
    for (const ev of db.events) if (db.result.has(`${ev.id}|${playerKey}`)) ids.add(ev.season);
    return ids;
  };

  // ---- Meta ------------------------------------------------------------

  store.meta = function (seasonId, format) {
    const combos = new Map();
    for (const ev of store.eventsIn(seasonId)) {
      if (ev.format !== format) continue;
      for (const r of db.resultsByEvent.get(ev.id) || []) {
        if (!r.leader || !r.base) continue;
        const key = `${r.leader}|${r.base}`;
        let c = combos.get(key);
        if (!c) {
          c = { leader: r.leader, base: r.base, events: 0, wins: 0, losses: 0, draws: 0, points: 0 };
          combos.set(key, c);
        }
        c.events++;
        c.points += r.points;
        for (const m of store.playerMatches(ev.id, r.player)) {
          if (m.outcome === "BYE") continue;
          if (m.topCut && !SWU.config.metaIncludesTopCut) continue;
          if (m.outcome === "W") c.wins++;
          else if (m.outcome === "L") c.losses++;
          else c.draws++;
        }
      }
    }
    return [...combos.values()].map((c) => {
      const played = c.wins + c.losses + c.draws;
      return { ...c, winRate: played ? c.wins / played : 0, pointsPerEvent: c.points / c.events };
    });
  };

  // ---- Calendar --------------------------------------------------------

  // Planned calendar entries, plus played events that were never put on the calendar.
  store.calendarItems = function () {
    const items = db.raw.calendar.map((c) => ({ ...c, eventId: null }));
    for (const ev of db.events) {
      const planned = items.find((c) => c.date === ev.date && !c.eventId);
      if (planned) planned.eventId = ev.id;
      else items.push({ id: `ev-${ev.id}`, date: ev.date, time: "", type: ev.type, title: ev.name, format: ev.format, notes: "", melee: ev.melee, eventId: ev.id });
    }
    return items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  };
})();
