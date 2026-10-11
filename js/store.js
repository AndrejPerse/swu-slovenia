// Loads league data and computes every statistic shown on the site.
// The raw data mirrors the Google Sheet tabs: seasons, players, events, results, matches, calendar.
(function () {
  const store = (SWU.store = {});
  // The sandbox uses its own cache so practice data never mixes with the real data.
  const cacheKey = () => SWU.config.cacheKey || "swu-league-data";

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
    try { localStorage.setItem(cacheKey(), JSON.stringify(raw)); } catch (e) { /* storage unavailable */ }
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
    try { return JSON.parse(localStorage.getItem(cacheKey())); } catch (e) { return null; }
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

  function shiftDays(iso, days) {
    const d = SWU.ui.parseDate(iso);
    d.setDate(d.getDate() + days);
    return SWU.ui.isoDate(d);
  }

  const dayBefore = (iso) => shiftDays(iso, -1);

  // A season runs from its start date to its end date. Without an end date it runs
  // until the day before the next season starts (or forever, for the latest season).
  function withSeasonEnds(seasons) {
    const sorted = [...seasons].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.map((s, i) => ({
      ...s,
      until: s.end || (sorted[i + 1] ? dayBefore(sorted[i + 1].start) : "9999-12-31"),
    }));
  }

  // Season playoffs are stored as an event with id "playoffs-<season id>", so they belong to their
  // season even when they're played after the season's last day.
  const PLAYOFF_PREFIX = "playoffs-";
  store.playoffEventId = (seasonId) => `${PLAYOFF_PREFIX}${seasonId}`;
  store.isPlayoffs = (event) => event.type === "Playoffs";

  function seasonOf(event, seasons) {
    if (event.id.startsWith(PLAYOFF_PREFIX)) {
      const id = event.id.slice(PLAYOFF_PREFIX.length);
      if (seasons.some((s) => s.id === id)) return id;
    }
    return (seasons.find((s) => s.start <= event.date && event.date <= s.until) || {}).id || null;
  }

  function buildIndex(raw) {
    const cards = window.SWU_CARDS;
    const seasons = withSeasonEnds(raw.seasons);
    const events = [...raw.events]
      .map((e) => ({ ...e, season: seasonOf(e, seasons) }))
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
    try { localStorage.setItem(cacheKey(), JSON.stringify(raw)); } catch (e) { /* storage unavailable */ }
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

  // Events that give league points: everything except the season playoffs.
  store.leagueEventsIn = (seasonId) => store.eventsIn(seasonId).filter((e) => !store.isPlayoffs(e));

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
    const events = store.leagueEventsIn(seasonId);
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

  // ---- Season playoffs ----------------------------------------------------

  // Bracket of a season's playoffs: semifinal 1 is seed 1 vs 4, semifinal 2 is seed 2 vs 3,
  // then the final (semifinal winners) and the 3rd place match (semifinal losers).
  // Results are saved in seed order, so seeds stay as entered even if the standings change later.
  // Matches without a result yet come back as pending pairings (result "").
  store.playoffs = function (seasonId) {
    const event = store.event(store.playoffEventId(seasonId));
    if (!event) return null;
    const matches = db.matchesByEvent.get(event.id) || [];
    const find = (name) => matches.find((m) => m.roundName === name) || null;
    const results = db.resultsByEvent.get(event.id) || [];
    const byPlayer = new Map(results.map((r) => [r.player, r]));
    const sf1 = find("Semifinal 1");
    const sf2 = find("Semifinal 2");
    const order = sf1 && sf2 ? [sf1.p1, sf2.p1, sf2.p2, sf1.p2] : results.map((r) => r.player);
    const seeds = order.map((player, i) => ({ seed: i + 1, player, result: byPlayer.get(player) || {} }));
    const decided = (m) => m && (m.result === "p1" || m.result === "p2");
    const winner = (m) => (decided(m) ? (m.result === "p1" ? m.p1 : m.p2) : null);
    const loser = (m) => (decided(m) ? (m.result === "p1" ? m.p2 : m.p1) : null);
    const pending = (p1, p2) => (p1 && p2 ? { p1, p2, g1: 0, g2: 0, gd: 0, result: "" } : null);
    const semis = [sf1 || pending(order[0], order[3]), sf2 || pending(order[1], order[2])];
    const final = find("Final") || pending(winner(semis[0]), winner(semis[1]));
    // The semifinal losers play for 3rd place.
    const third = find("3rd place") || pending(loser(semis[0]), loser(semis[1]));
    return {
      event, seeds, semis, final, third, winner, loser,
      champion: winner(final),
      seedOf: (key) => (seeds.find((s) => s.player === key) || {}).seed,
    };
  };

  // The next scheduled playoffs on the calendar for a season (by id, or the first Playoffs entry after the season starts).
  store.playoffsCalendarEntry = function (seasonId) {
    const season = store.season(seasonId);
    if (!season) return null;
    const entries = db.raw.calendar.filter((c) => c.type === "Playoffs");
    const latest = season.until === "9999-12-31" ? season.until : shiftDays(season.until, 60);
    return entries.find((c) => c.id === store.playoffEventId(seasonId))
      || entries.filter((c) => c.date >= season.start && c.date <= latest).sort((a, b) => a.date.localeCompare(b.date))[0]
      || null;
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
