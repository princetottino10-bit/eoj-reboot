#!/usr/bin/env python3
"""
Generate a Markdown card list from cards.json.
Usage: uv run generate_card_md.py [output.md]
"""

import json
import sys
from pathlib import Path

FACTION_ORDER = ["aggro", "tank", "control", "synergy", "snipe", "trick"]

# ── attack / weakness range name tables ──────────────────────────────────────

def _key(cells):
    return frozenset(tuple(c) for c in cells)

ATTACK_NAMES = {
    _key([[1, 0]]):                                    "正面1",
    _key([[1, 0], [-1, 0]]):                           "前後",
    _key([[1, 0], [2, 0]]):                            "前方2直線",
    _key([[1, -1], [1, 0], [1, 1]]):                   "前列3",
    _key([[1, 0], [-1, 0], [0, -1], [0, 1]]):          "十字",
    _key([[1, 0], [0, -1]]):                           "前+左",
    _key([[1, 0], [0, 1]]):                            "前+右",
}

WEAKNESS_NAMES = {
    _key([[-1, 0]]):                                                              "背後",
    _key([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]):               "全方向",
    frozenset():                                                                  "なし",
}

def attack_str(cells) -> str:
    if cells is None:
        return "なし"
    if cells == "all":
        return "全域"
    if isinstance(cells, str):
        return cells
    return ATTACK_NAMES.get(_key(cells), str(cells))

def weakness_str(cells) -> str:
    return WEAKNESS_NAMES.get(_key(cells), str(cells))


# ── renderers ─────────────────────────────────────────────────────────────────

def render_character(card: dict) -> str:
    out = []

    # ── heading ──
    out.append(f"### {card['name']}　`{card['id']}`　VP {card['vp']}")

    # ── stats ──
    wc = card.get("weakness_cells", [[-1, 0]])
    out.append(
        f"**C{card['cost']}** | "
        f"HP {card['hp']} | ATK {card['atk']} | 再行動 {card['reactivation_cost']} | "
        f"{card['attribute']} | {card['attack_type']} | "
        f"攻撃: {attack_str(card['attack_cells'])} | "
        f"弱点: {weakness_str(wc)}"
    )
    out.append("")

    # ── keywords ──
    if card["keywords"]:
        out.append("**KW:** " + "　".join(f"【{k}】" for k in card["keywords"]))
        out.append("")

    # ── effect ──
    if card["effect"]:
        out.append(card["effect"])
        out.append("")

    # ── ult ──
    if card["ult"]:
        u = card["ult"]
        out.append(f"> **Ult「{u['name']}」** {u['vp_cost']}VP / {u['timing']}")
        out.append(f"> {u['effect']}")
        out.append("")

    return "\n".join(out)


def render_items_by_set(items: list[dict]) -> str:
    sets: dict[str, list[dict]] = {}
    for item in items:
        for s in item["sets"]:
            sets.setdefault(s, []).append(item)

    out = []
    for set_key in sorted(sets):
        out.append(f"### セット {set_key}")
        out.append("")
        out.append("| カード | コスト | VP | 効果 |")
        out.append("|---|:---:|:---:|---|")
        for item in sets[set_key]:
            out.append(
                f"| {item['name']} `{item['id']}` "
                f"| {item['cost']} | {item['vp']} | {item['effect']} |"
            )
        out.append("")
    return "\n".join(out)


# ── main ──────────────────────────────────────────────────────────────────────

def generate(cards_path: Path, out_path: Path):
    data = json.loads(cards_path.read_text(encoding="utf-8"))
    faction_names = data.get("faction_names", {})
    characters    = data["characters"]
    items         = data.get("items", [])

    # group characters by faction, preserving FACTION_ORDER
    by_faction: dict[str, list] = {}
    for card in characters:
        by_faction.setdefault(card["faction"], []).append(card)

    lines: list[str] = []

    # ── header ──
    lines += [
        "# 異能学園総選挙 カードリスト",
        "",
        f"> キャラクター {len(characters)} 枚（6派閥 × 12枚）／アイテム {len(items)} 枚",
        "",
        "---",
        "",
    ]

    # ── characters ──
    for faction in FACTION_ORDER:
        cards = by_faction.get(faction, [])
        if not cards:
            continue
        jp = faction_names.get(faction, faction)
        lines += [f"## {jp}（{faction}）", ""]
        for card in cards:
            lines.append(render_character(card))
            lines += ["---", ""]

    # ── items ──
    if items:
        lines += ["## アイテム", ""]
        lines.append(render_items_by_set(items))

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated: {out_path}  ({len(characters)} chars, {len(items)} items)")


if __name__ == "__main__":
    root = Path(__file__).parent
    out  = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "cards.md"
    generate(root / "cards.json", out)
