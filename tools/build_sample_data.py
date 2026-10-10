"""Generate data/sample-data.js: fictional players and results for the sandbox.

Two practice seasons: the first finished, with its playoffs played; the second ongoing,
with its playoffs on the calendar, ready to be entered in the editor.
    python tools/build_sample_data.py
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sample-data.js"
rng = random.Random(7)

PLAYERS = [
    ("KyberKnight", "Kyle"), ("RancorRider", ""), ("HoloQueen", "Hana"), ("BespinBob", ""),
    ("TwinSunsTom", ""), ("EchoBase7", ""), ("MynockMike", ""), ("ZetaSquad", ""),
    ("Lothcat", ""), ("PorgPilot", ""), ("NerfHerder", "Ned"), ("KesselRun", ""),
]
GUESTS = {"KesselRun"}  # plays showdowns, not part of the league
SKILL = {p: rng.uniform(0.6, 1.6) for p, _ in PLAYERS}

LEADERS = [
    "darth-vader-dark-lord-of-the-sith", "sabine-wren-galvanized-revolutionary", "han-solo-worth-the-risk",
    "iden-versio-inferno-squad-commander", "boba-fett-daimyo", "grand-admiral-thrawn-patient-and-insightful",
    "luke-skywalker-faithful-friend", "qira-i-alone-survived", "cad-bane-he-who-needs-no-introduction",
    "asajj-ventress-no-time-for-regret", "maz-kanata-eclectic-pirate-queen", "general-grievous-general-of-the-droid-armies",
]
BASES = ["green-force28", "red-30", "blue-30", "yellow-splash", "tarkintown", "data-vault", "red-force28", "blue-force28", "yellow-30"]


def check_ids():
    text = (ROOT / "data" / "cards.js").read_text(encoding="utf-8")
    cards = json.loads(text[text.index("{"):text.rindex("}") + 1])
    leaders = {l["id"] for l in cards["leaders"]}
    bases = {b["id"] for b in cards["bases"]}
    missing = [x for x in LEADERS if x not in leaders] + [x for x in BASES if x not in bases]
    if missing:
        raise SystemExit(f"Unknown card ids: {missing}")


MAIN_DECK = {p: (rng.choice(LEADERS), rng.choice(BASES)) for p, _ in PLAYERS}


def deck(player):
    if rng.random() < 0.25:
        return rng.choice(LEADERS), rng.choice(BASES)
    return MAIN_DECK[player]


def play(a, b):
    """Best-of-three result: (games a, games b, game draws)."""
    if rng.random() < 0.06:
        return 1, 1, 1
    a_wins = rng.random() < SKILL[a] / (SKILL[a] + SKILL[b])
    loser_games = 0 if rng.random() < 0.55 else 1
    return (2, loser_games, 0) if a_wins else (loser_games, 2, 0)


def run_event(event_id, players, rounds, top_cut=False, unknown_decks=0):
    pts = {p: 0 for p in players}
    record = {p: [0, 0, 0] for p in players}
    met = {p: set() for p in players}
    had_bye = set()
    matches = []

    def add(rnd, name, phase, p1, p2, g1, g2, gd):
        result = "bye" if not p2 else "p1" if g1 > g2 else "p2" if g2 > g1 else "draw"
        matches.append({"event": event_id, "round": rnd, "roundName": name, "phase": phase,
                        "p1": p1, "p2": p2 or "", "g1": g1, "g2": g2, "gd": gd, "result": result})
        return result

    for rnd in range(1, rounds + 1):
        order = sorted(players, key=lambda p: (-pts[p], rng.random()))
        if len(order) % 2:
            bye = next(p for p in reversed(order) if p not in had_bye)
            order.remove(bye)
            had_bye.add(bye)
            add(rnd, f"Round {rnd}", "swiss", bye, None, 0, 0, 0)
            pts[bye] += 3
            record[bye][0] += 1
        while order:
            a = order.pop(0)
            i = next((i for i, b in enumerate(order) if b not in met[a]), 0)
            b = order.pop(i)
            met[a].add(b)
            met[b].add(a)
            g1, g2, gd = play(a, b)
            result = add(rnd, f"Round {rnd}", "swiss", a, b, g1, g2, gd)
            if result == "draw":
                for p in (a, b):
                    pts[p] += 1
                    record[p][2] += 1
            else:
                w, l = (a, b) if result == "p1" else (b, a)
                pts[w] += 3
                record[w][0] += 1
                record[l][1] += 1

    swiss_rank = sorted(players, key=lambda p: (-pts[p], -record[p][0], rng.random()))
    final_order, finish = list(swiss_rank), {}
    if top_cut:
        top = swiss_rank[:4]

        def single(rnd, name, a, b):
            g1, g2, _ = play(a, b)
            if g1 == g2:
                g1, g2 = 2, 1
            add(rnd, name, "top", a, b, g1, g2, 0)
            return (a, b) if g1 > g2 else (b, a)

        w1, l1 = single(rounds + 1, "Semifinals", top[0], top[3])
        w2, l2 = single(rounds + 1, "Semifinals", top[1], top[2])
        champ, runner = single(rounds + 2, "Finals", w1, w2)
        finish = {champ: "Winner", runner: "Finalist", l1: "Top 4", l2: "Top 4"}
        semis_out = sorted([l1, l2], key=swiss_rank.index)
        final_order = [champ, runner, *semis_out] + swiss_rank[4:]

    results = []
    for i, p in enumerate(final_order):
        leader, base = deck(p)
        unknown = i >= len(final_order) - unknown_decks
        results.append({
            "event": event_id, "player": p, "leader": "" if unknown else leader, "base": "" if unknown else base,
            "points": pts[p], "bonus": 1, "wins": record[p][0], "losses": record[p][1], "draws": record[p][2],
            "rank": i + 1, "finish": finish.get(p, ""), "counted": p not in GUESTS,
        })
    return results, matches


def standings(events, results):
    """Same ordering as the site: points, then points before each earlier event, then placement."""
    order = [e["id"] for e in sorted(events, key=lambda e: e["date"])]
    totals, after, placed = {}, {}, {}
    for idx, ev in enumerate(order):
        for r in (r for r in results if r["event"] == ev and r["counted"]):
            totals[r["player"]] = totals.get(r["player"], 0) + r["points"] + r["bonus"]
            after.setdefault(r["player"], [None] * len(order))[idx] = totals[r["player"]]
            placed.setdefault(r["player"], [None] * len(order))[idx] = r["rank"]
    for p, hist in after.items():
        running = 0
        after[p] = [running := (v if v is not None else running) for v in hist]

    def key(p):
        history = tuple(-v for v in reversed(after[p]))
        placements = tuple(v if v is not None else 99 for v in reversed(placed[p]))
        return (-totals[p], history, placements, p.lower())

    return sorted(totals, key=key)


def main():
    check_ids()
    league = [p for p, _ in PLAYERS if p not in GUESTS]
    seasons = [
        {"id": "s1", "name": "Practice Season 1", "start": "2026-06-01", "end": "2026-08-31"},
        {"id": "s2", "name": "Practice Season 2", "start": "2026-09-01", "end": ""},
    ]
    plan = {
        "s1": [("2026-06-01", "Weekly", "Premier"), ("2026-06-15", "Weekly", "Premier"), ("2026-06-29", "Weekly", "Premier"),
               ("2026-07-13", "Weekly", "Premier"), ("2026-07-27", "Weekly", "Premier"), ("2026-08-10", "Weekly", "Premier"),
               ("2026-08-15", "Showdown", "Premier"), ("2026-08-24", "Weekly", "Premier")],
        "s2": [("2026-09-07", "Weekly", "Premier"), ("2026-09-14", "Weekly", "Premier"), ("2026-09-21", "Weekly", "Eternal"),
               ("2026-09-26", "Showdown", "Premier"), ("2026-09-28", "Weekly", "Premier"), ("2026-10-05", "Weekly", "Premier")],
    }
    events, results, matches = [], [], []
    for season, items in plan.items():
        for n, (date, kind, fmt) in enumerate(items, 1):
            event_id = f"{season}-{'sd' if kind == 'Showdown' else 'w'}{n}"
            if kind == "Showdown":
                field = league + ["KesselRun"]
            else:
                field = rng.sample(league, rng.randint(6, 9))
            last = season == "s2" and n == len(items)
            res, mts = run_event(event_id, field, 4 if kind == "Showdown" else 3, top_cut=kind == "Showdown", unknown_decks=2 if last else 0)
            name = "Store Showdown" if kind == "Showdown" else ("Eternal Weekly" if fmt == "Eternal" else "Weekly Play")
            events.append({"id": event_id, "date": date, "name": name, "type": kind, "format": fmt, "melee": ""})
            results += res
            matches += mts

    # Practice Season 1 playoffs, already played: seed 3 takes the title.
    s1_events = [e for e in events if e["id"].startswith("s1-")]
    seeds = standings(s1_events, results)[:4]
    po = "playoffs-s1"
    events.append({"id": po, "date": "2026-09-05", "name": "Practice Season 1 Playoffs", "type": "Playoffs", "format": "Premier", "melee": ""})
    games = [(seeds[0], seeds[3], 2, 0, "Semifinal 1", 1), (seeds[1], seeds[2], 1, 2, "Semifinal 2", 1), (seeds[0], seeds[2], 1, 2, "Final", 2)]
    for p1, p2, g1, g2, name, rnd in games:
        matches.append({"event": po, "round": rnd, "roundName": name, "phase": "top", "p1": p1, "p2": p2,
                        "g1": g1, "g2": g2, "gd": 0, "result": "p1" if g1 > g2 else "p2"})
    po_finish = {seeds[2]: ("Champion", 1, 2, 0), seeds[0]: ("Finalist", 2, 1, 1),
                 seeds[3]: ("Semifinalist", 3, 0, 1), seeds[1]: ("Semifinalist", 3, 0, 1)}
    for p in seeds:
        label, rank, w, l = po_finish[p]
        leader, base = MAIN_DECK[p]
        results.append({"event": po, "player": p, "leader": leader, "base": base, "points": 0, "bonus": 0,
                        "wins": w, "losses": l, "draws": 0, "rank": rank, "finish": label, "counted": True})

    calendar = [{"id": "playoffs-s1", "date": "2026-09-05", "time": "10:00", "type": "Playoffs",
                 "title": "Practice Season 1 Playoffs", "format": "Premier", "notes": "", "melee": ""}]
    for i, date in enumerate(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16",
                              "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"]):
        calendar.append({"id": f"cal-w{i}", "date": date, "time": "17:30", "type": "Weekly", "title": "Weekly Play",
                         "format": "Premier", "notes": "", "melee": ""})
    calendar.append({"id": "cal-sd", "date": "2026-11-21", "time": "10:00", "type": "Showdown", "title": "Store Showdown",
                     "format": "Premier", "notes": "Registration from 9:30", "melee": ""})
    calendar.append({"id": "playoffs-s2", "date": "2026-12-19", "time": "10:00", "type": "Playoffs",
                     "title": "Practice Season 2 Playoffs", "format": "Premier", "notes": "Top 4 of the season", "melee": ""})

    data = {
        "sample": True,
        "seasons": seasons,
        "players": [{"key": p, "name": p, "nickname": nick, "league": p not in GUESTS} for p, nick in PLAYERS],
        "events": events, "results": results, "matches": matches, "calendar": calendar,
    }
    OUT.write_text("// SAMPLE DATA - fictional players and results, used by the sandbox. Generated by tools/build_sample_data.py.\n"
                   f"window.SWU_SAMPLE_DATA = {json.dumps(data, ensure_ascii=False, indent=1)};\n", encoding="utf-8")
    print(f"{len(events)} events, {len(results)} results, {len(matches)} matches. Season 1 seeds: {seeds}")


if __name__ == "__main__":
    main()
