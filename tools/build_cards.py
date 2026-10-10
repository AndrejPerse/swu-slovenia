"""Download leaders and bases from the official SWU card database and write data/cards.js.

Run again whenever a new set is released:
    python tools/build_cards.py
"""
import json
import re
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

API = "https://admin.starwarsunlimited.com/api/card-list"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
OUT = Path(__file__).resolve().parent.parent / "data" / "cards.js"

COLORS = {"Aggression": "Red", "Command": "Green", "Cunning": "Yellow", "Vigilance": "Blue"}
# Promo / special products; when a leader is reprinted we prefer the main-set printing.
SPECIAL_SETS = {"IBH", "MV26", "P25", "P26", "TS26"}

FORCE_TEXT = "When a friendly Force unit attacks: The Force is with you"
SPLASH_TEXT = "Epic Action: Play a card from your hand, ignoring 1 of its"


def fetch_all(card_type):
    cards, page = [], 1
    while True:
        query = urllib.parse.urlencode({
            "locale": "en",
            "filters[type][value][$eq]": card_type,
            "filters[variantOf][id][$null]": "true",
            "pagination[page]": page,
            "pagination[pageSize]": 100,
        })
        req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req) as resp:
            body = json.load(resp)
        cards += [c["attributes"] for c in body["data"]]
        if page >= body["meta"]["pagination"]["pageCount"]:
            return cards
        page += 1


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"['’]", "", text.lower().replace("é", "e"))).strip("-")


def media_url(attr, field, size=None):
    data = (attr.get(field) or {}).get("data")
    if not data:
        return None
    media = data["attributes"]
    if size and size in (media.get("formats") or {}):
        return media["formats"][size]["url"]
    return media["url"]


def names(attr, field):
    data = (attr.get(field) or {}).get("data") or []
    return [x["attributes"]["name"] for x in data]


def set_code(attr):
    return attr["expansion"]["data"]["attributes"]["code"]


def build_leaders(raw):
    by_key = {}
    for a in raw:
        key = (a["title"], a["subtitle"])
        current = by_key.get(key)
        if current is None or (set_code(current) in SPECIAL_SETS and set_code(a) not in SPECIAL_SETS):
            by_key[key] = a
    leaders = []
    for (title, subtitle), a in by_key.items():
        leaders.append({
            "id": slug(f"{title} {subtitle}"),
            "name": title,
            "subtitle": subtitle,
            "aspects": names(a, "aspects"),
            "set": set_code(a),
            "thumb": media_url(a, "artThumbnail") or media_url(a, "artFront", "xxsmall"),
            "art": media_url(a, "artFront", "xsmall"),
        })
    return sorted(leaders, key=lambda l: (l["name"], l["subtitle"]))


def build_bases(raw):
    """Common bases that share HP + ability are one category (e.g. 'Green Force28');
    every other base is tracked by its own name (e.g. 'Tarkintown')."""
    groups = defaultdict(list)
    named = {}
    for a in raw:
        aspects = names(a, "aspects")
        color = COLORS.get(aspects[0]) if len(aspects) == 1 else None
        text = (a.get("text") or "").strip()
        rarity = (a["rarity"]["data"] or {}).get("attributes", {}).get("name")
        if color and rarity == "Common":
            if not text:
                groups[(color, f"{color} {a['hp']}", a["hp"])].append(a)
                continue
            if text.startswith(FORCE_TEXT):
                groups[(color, f"{color} Force{a['hp']}", a["hp"])].append(a)
                continue
            if text.startswith(SPLASH_TEXT):
                groups[(color, f"{color} Splash", a["hp"])].append(a)
                continue
        named.setdefault(a["title"], (a, color))

    bases = []
    for (color, name, hp), cards in groups.items():
        bases.append({
            "id": slug(name),
            "name": name,
            "color": color,
            "hp": hp,
            "kind": "common",
            "cards": sorted({c["title"] for c in cards}),
            "art": media_url(cards[0], "artFront", "xxsmall"),
        })
    for title, (a, color) in named.items():
        bases.append({
            "id": slug(title),
            "name": title,
            "color": color,
            "hp": a["hp"],
            "kind": "unique",
            "cards": [title],
            "art": media_url(a, "artFront", "xxsmall"),
        })
    color_order = {"Blue": 0, "Green": 1, "Red": 2, "Yellow": 3, None: 4}
    return sorted(bases, key=lambda b: (b["kind"] != "common", color_order[b["color"]], b["name"]))


def main():
    leaders = build_leaders(fetch_all("Leader"))
    bases = build_bases(fetch_all("Base"))
    payload = {"generated": date.today().isoformat(), "leaders": leaders, "bases": bases}
    OUT.write_text(
        "// Generated by tools/build_cards.py - do not edit by hand.\n"
        f"window.SWU_CARDS = {json.dumps(payload, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(leaders)} leaders and {len(bases)} bases to {OUT}")


if __name__ == "__main__":
    main()
