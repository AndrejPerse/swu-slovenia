// Turns the raw Melee data returned by the Apps Script into league rows.
(function () {
  const melee = (SWU.melee = {});

  function playerOf(competitor) {
    const p = competitor.Team.Players[0];
    return { key: p.Username || `guest:${p.DisplayName}`, name: p.DisplayName || p.Username };
  }

  function localDate(iso) {
    if (!iso) return SWU.ui.today();
    // Melee sends 7 decimal places on the seconds, which not every browser can parse.
    const d = new Date(iso.replace(/\.\d+/, "").replace(/Z?$/, "Z"));
    return isNaN(d) ? SWU.ui.today() : SWU.ui.isoDate(d);
  }

  function knownFormat(name) {
    const match = SWU.config.formats.find((f) => String(name || "").toLowerCase().includes(f.toLowerCase()));
    return match || name || SWU.config.formats[0];
  }

  // Top-cut finish for the player who lost in a given top-cut round.
  // roundsFromEnd: 0 = final, 1 = semifinal, 2 = quarterfinal, ...
  function topCutLabel(roundsFromEnd) {
    return roundsFromEnd === 0 ? "Finalist" : `Top ${2 ** (roundsFromEnd + 1)}`;
  }

  melee.normalize = function (raw) {
    const played = raw.rounds.filter((r) => r.matches.length);
    const swissPhase = played.length ? played[0].matches[0].PhaseId : null;
    const topRounds = played.filter((r) => r.matches[0].PhaseId !== swissPhase);

    const names = new Map();
    const finish = new Map();
    const matches = [];
    let unfinished = 0;

    for (const round of played) {
      const topIndex = topRounds.indexOf(round);
      for (const m of round.matches) {
        const comps = m.Competitors.filter((c) => c.Team && c.Team.Players && c.Team.Players.length);
        if (!comps.length) continue;
        const a = playerOf(comps[0]);
        names.set(a.key, a.name);
        const row = {
          round: m.RoundNumber,
          roundName: m.RoundDescription || round.name,
          phase: topIndex >= 0 ? "top" : "swiss",
          p1: a.key, p2: "", g1: 0, g2: 0, gd: 0, result: "bye",
        };
        if (comps.length > 1) {
          const b = playerOf(comps[1]);
          names.set(b.key, b.name);
          if (!m.HasResult) {
            unfinished++;
            continue;
          }
          const g1 = comps[0].GameWins || 0;
          const g2 = comps[1].GameWins || 0;
          Object.assign(row, { p2: b.key, g1, g2, gd: m.GameDraws || 0, result: g1 > g2 ? "p1" : g2 > g1 ? "p2" : "draw" });
          if (topIndex >= 0 && row.result !== "draw") {
            const fromEnd = topRounds.length - 1 - topIndex;
            const [winner, loser] = row.result === "p1" ? [a.key, b.key] : [b.key, a.key];
            finish.set(loser, topCutLabel(fromEnd));
            if (fromEnd === 0) finish.set(winner, "Winner");
          }
        }
        matches.push(row);
      }
    }

    const finalRank = new Map(raw.finalStandings.map((s) => [playerOf(s).key, s.Rank]));
    const players = raw.swissStandings.map((s) => {
      const { key, name } = playerOf(s);
      return {
        key,
        name: names.get(key) || name,
        points: s.Points,
        wins: s.MatchWins,
        losses: s.MatchLosses,
        draws: s.MatchDraws,
        rank: finalRank.get(key) || s.Rank,
        finish: finish.get(key) || "",
      };
    }).sort((x, y) => x.rank - y.rank);

    const formatName = (played[0] && played[0].matches[0].Format) || "";
    return {
      event: {
        id: String(raw.id),
        name: raw.title,
        date: localDate(raw.start),
        type: topRounds.length || /showdown/i.test(raw.title) ? "Showdown" : "Weekly",
        format: knownFormat(formatName),
        melee: raw.link,
      },
      players,
      matches,
      info: {
        swissRounds: played.length - topRounds.length,
        topCutRounds: topRounds.length,
        topCutSize: topRounds.length ? 2 ** topRounds.length : 0,
        unfinished,
        incompleteRounds: raw.rounds.filter((r) => !r.completed).length,
      },
    };
  };
})();
