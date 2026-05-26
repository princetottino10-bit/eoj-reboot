#!/usr/bin/env python3
"""
Generate printable card PDF from cards.json.
Usage:  uv run generate_cards.py [output.pdf]
Font:   sudo apt install fonts-noto-cjk
"""

import json
import sys
from pathlib import Path

from fpdf import FPDF

# ── dimensions (mm) ──────────────────────────────────────────────────────────
CARD_W, CARD_H = 63, 88
A4_W, A4_H = 210, 297
COLS, ROWS = 3, 3

H_GAP = (A4_W - COLS * CARD_W) / (COLS + 1)  # ~5.25 mm
V_GAP = (A4_H - ROWS * CARD_H) / (ROWS + 1)  # ~8.25 mm

HEADER_H = 8
GRAPHIC_H = 36
CELL = 3.0  # range-grid cell size (mm)
GRID_COLS = 3  # grids are always 3 columns wide
GRID_W = GRID_COLS * CELL  # 9 mm
GRID_GAP = 4  # gap between side-by-side grids (mm)
GRID_BOTTOM_PAD = 3  # breathing room below grids (mm)

# Characters forbidden at line beginning / end (行頭・行末禁則)
KINSOKU_START = frozenset("、。，．・：；？！）］｝」』】〉》〕～…‥ヽヾゝゞ々ー")
KINSOKU_END = frozenset("「『（【〈《〔")

# ── font candidates (regular, bold) ──────────────────────────────────────────
FONT_REGULAR = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansJP-Regular.otf",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
]
FONT_BOLD = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansJP-Bold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansJP-Bold.otf",
]


def find_font(candidates: list[str]) -> str:
    for p in candidates:
        if Path(p).exists():
            return p
    return ""  # caller handles missing bold gracefully


def card_pos(idx: int) -> tuple[float, float]:
    col, row = idx % COLS, idx // COLS
    return H_GAP + col * (CARD_W + H_GAP), V_GAP + row * (CARD_H + V_GAP)


# ── PDF class ─────────────────────────────────────────────────────────────────
class CardPDF(FPDF):
    def init_font(self, regular: str, bold: str):
        if not regular:
            sys.exit(
                "Error: Japanese font not found.\n  Linux/WSL: sudo apt install fonts-noto-cjk"
            )
        self.add_font("jp", fname=regular)
        self.add_font("jp", style="B", fname=bold if bold else regular)
        self.set_font("jp", size=8)

    def jp(self, size: float, bold: bool = False):
        self.set_font("jp", style="B" if bold else "", size=size)

    # ── public entry ─────────────────────────────────────────────────────
    def draw_card(self, card: dict, x: float, y: float):
        self.set_draw_color(0, 0, 0)
        self.rect(x, y, CARD_W, CARD_H)
        self._header(card, x, y)
        self._graphic(x, y)
        self._lower(card, x, y)

    # ── header (attribute ○ | name  faction / cost | reactivation) ─────
    def _header(self, card, x, y):
        # Attribute circle (top-left)
        self.set_draw_color(0, 0, 0)
        self.ellipse(x + 1, y + 1, 6, 6)
        self.jp(8, bold=True)
        self.set_xy(x + 1, y + 1)
        self.cell(6, 6, card["attribute"], align="C")

        # Name (right of attribute circle)
        self.jp(8, bold=True)
        if self.get_string_width(card["name"]) > 27:
            print(f"[warn] name may truncate: {card.get('id', card['name'])!r}", file=sys.stderr)
        self.set_xy(x + 8, y + 1.5)
        self.cell(27, 4.5, card["name"])

        # Faction (right of name, smaller)
        self.jp(5.5)
        self.set_xy(x + 36, y + 2)
        self.cell(11, 4, self.faction_names.get(card["faction"], card["faction"]))

        # cost (left) | reactivation (right) — side by side box, 2 mm from card edge
        self.jp(10, bold=True)
        self.set_xy(x + CARD_W - 15, y + 1.5)
        self.cell(8, 5, str(card["cost"]), border="LTB", align="C")

        self.jp(6)
        self.set_xy(x + CARD_W - 7, y + 1.5)
        self.cell(5, 5, f"再{card['reactivation_cost']}", border="RTB", align="C")

    # ── graphic placeholder ───────────────────────────────────────────────
    def _graphic(self, x, y):
        top = y + HEADER_H
        self.set_fill_color(245, 245, 245)
        self.rect(x + 1, top, CARD_W - 2, GRAPHIC_H, "FD")

    # ── lower half ────────────────────────────────────────────────────────
    def _lower(self, card, x, y):
        top = y + HEADER_H + GRAPHIC_H
        tw = CARD_W - 3  # full text width

        # ── grid geometry (anchored to bottom) ──
        attack_rows = self._attack_rows(card)
        grid_pair_h = 3 + max(attack_rows, 3) * CELL
        grid_y = y + CARD_H - GRID_BOTTOM_PAD - grid_pair_h
        max_y = grid_y - 1  # text must stay above grids

        total_gw = 2 * GRID_W + GRID_GAP
        attack_gx = x + (CARD_W - total_gw) / 2
        weakness_gx = attack_gx + GRID_W + GRID_GAP

        # grid start positions: bottom-aligned, except magic (全域) which uses top-align
        grid_bottom = grid_y + grid_pair_h
        if card.get("attack_cells") == "all":
            attack_start_y = grid_y
            weakness_start_y = grid_y
        else:
            attack_start_y = grid_bottom - (3 + attack_rows * CELL)
            weakness_start_y = grid_bottom - (3 + 3 * CELL)

        # ── stats ──
        self.jp(7.5, bold=True)
        self.set_xy(x + 1.5, top + 1)
        self.cell(tw, 4, f"HP {card['hp']}  ATK {card['atk']}  {card['attack_type']}")

        # ── keywords / effect / ult ──
        text_y = top + 6

        for kw in card["keywords"]:
            if text_y >= max_y:
                break
            desc = self.keyword_effects.get(kw, "")
            self.jp(5.5, bold=True)
            self.set_xy(x + 1.5, text_y)
            self.cell(tw, 3.5, f"【{kw}】{desc}")
            text_y += 3.5
        if card["keywords"]:
            text_y += 0.5  # gap after keywords block

        self.set_draw_color(180, 180, 180)
        self.line(x + 1, text_y - 0.5, x + CARD_W - 1, text_y - 0.5)
        self.set_draw_color(0, 0, 0)

        if card["effect"] and text_y < max_y:
            self.jp(5.8)
            self.set_xy(x + 1.5, text_y)
            if not self._multi_cell_j(tw, 3.2, card["effect"], max_y=max_y):
                print(f"[warn] effect clipped: {card.get('id', card['name'])!r}", file=sys.stderr)
            text_y = min(self.get_y(), max_y)

        if card["ult"] and text_y + 4 < max_y:
            ult = card["ult"]
            self.set_draw_color(200, 160, 0)
            self.line(x + 1, text_y + 0.3, x + CARD_W - 1, text_y + 0.3)
            self.set_draw_color(0, 0, 0)

            self.jp(6, bold=True)
            self.set_xy(x + 1.5, text_y + 1)
            self.cell(tw, 3.2, f"Ult: {ult['name']}  {ult['vp_cost']}VP / {ult['timing']}")
            text_y += 1 + 3.2  # cell() は y を進めないので手動で加算

            if text_y < max_y:
                self.jp(5.5)
                self.set_xy(x + 1.5, text_y)
                if not self._multi_cell_j(tw, 3.0, ult["effect"], max_y=max_y):
                    print(f"[warn] ult clipped: {card.get('id', card['name'])!r}", file=sys.stderr)

        # ── grids (bottom, side by side) ──
        self.set_draw_color(180, 180, 180)
        self.line(x + 1, grid_y - 0.5, x + CARD_W - 1, grid_y - 0.5)
        self.set_draw_color(0, 0, 0)

        self.jp(5, bold=True)
        self.set_xy(attack_gx, attack_start_y)
        self.cell(GRID_W, 3, "攻撃", align="C")
        self._draw_grid(
            card.get("attack_cells"), is_attack=True, gx=attack_gx, gy=attack_start_y + 3
        )

        self.jp(5, bold=True)
        self.set_xy(weakness_gx, weakness_start_y)
        self.cell(GRID_W, 3, "弱点", align="C")
        self._draw_grid(
            card.get("weakness_cells", [[-1, 0]]),
            is_attack=False,
            gx=weakness_gx,
            gy=weakness_start_y + 3,
        )

        self._vp_box(card, x, y)

    # ── VP box (bottom-right corner, shared by character and item) ───────
    def _vp_box(self, card: dict, x: float, y: float):
        """Draw a compact VP box anchored to the card bottom-right."""
        self.jp(5)
        vp_x = x + CARD_W - 12
        vp_y = y + CARD_H - GRID_BOTTOM_PAD - 5
        self.set_xy(vp_x, vp_y)
        self.cell(10, 4, f"VP {card['vp']}", border=1, align="C")

    # ── item card ─────────────────────────────────────────────────────────
    def draw_item_card(self, card: dict, x: float, y: float):
        self.set_draw_color(0, 0, 0)
        self.rect(x, y, CARD_W, CARD_H)
        self._item_header(card, x, y)
        self._graphic(x, y)
        self._item_body(card, x, y)

    def _item_header(self, card, x, y):
        self.jp(5)
        self.set_xy(x + 1.5, y + 1.5)
        self.cell(CARD_W - 16, 3, "アイテム")

        self.jp(8, bold=True)
        self.set_xy(x + 1.5, y + 4.5)
        self.cell(CARD_W - 16, 4, card["name"])

        self.jp(10, bold=True)
        self.set_xy(x + CARD_W - 13, y + 1.5)
        self.cell(11, 5, str(card["cost"]), border=1, align="C")

    def _item_body(self, card, x, y):
        top = y + HEADER_H + GRAPHIC_H
        tw = CARD_W - 3
        max_y = y + CARD_H - 2

        # Sets
        self.jp(5.5)
        self.set_xy(x + 1.5, top + 1)
        sets_str = "  ".join(f"[{s}]" for s in card["sets"])
        self.cell(tw, 3.5, f"セット: {sets_str}")

        text_y = top + 5
        self.set_draw_color(180, 180, 180)
        self.line(x + 1, text_y - 0.5, x + CARD_W - 1, text_y - 0.5)
        self.set_draw_color(0, 0, 0)

        if card["effect"] and text_y < max_y:
            self.jp(5.8)
            self.set_xy(x + 1.5, text_y)
            if not self._multi_cell_j(tw, 3.2, card["effect"], max_y=max_y):
                print(
                    f"[warn] item effect clipped: {card.get('id', card['name'])!r}", file=sys.stderr
                )

        self._vp_box(card, x, y)

    # ── kinsoku-aware text rendering ─────────────────────────────────────
    def _wrap_kinsoku(self, text: str, width: float) -> list[str]:
        """Line-wrap with Japanese 追い出し kinsoku.
        行頭禁則: a start-prohibited char pulls the previous char to the next line.
        行末禁則: an end-prohibited char at line end is pushed to the next line."""
        lines = []
        for para in text.split("\n"):
            if not para:
                lines.append("")
                continue
            line = ""
            for ch in para:
                if self.get_string_width(line + ch) <= width:
                    line += ch
                else:
                    if ch in KINSOKU_START and len(line) > 1:
                        # 行頭禁則: pull last char + prohibited char to next line
                        lines.append(line[:-1])
                        line = line[-1] + ch
                    elif line and line[-1] in KINSOKU_END and len(line) > 1:
                        # 行末禁則: push end-prohibited char to next line
                        lines.append(line[:-1])
                        line = line[-1] + ch
                    else:
                        if line:
                            lines.append(line)
                        line = ch
            if line:
                lines.append(line)
        return lines

    def _multi_cell_j(
        self, tw: float, line_h: float, text: str, max_y: float | None = None
    ) -> bool:
        """Drop-in for multi_cell with kinsoku line-breaking.
        Returns False and appends … if text was clipped by max_y."""
        x = self.get_x()
        for line in self._wrap_kinsoku(text, tw):
            if max_y is not None and self.get_y() + line_h > max_y:
                truncated = line
                while truncated and self.get_string_width(truncated + "…") > tw:
                    truncated = truncated[:-1]
                self.set_xy(x, self.get_y())
                self.cell(tw, line_h, truncated + "…")
                self.set_y(self.get_y() + line_h)
                return False
            self.set_xy(x, self.get_y())
            self.cell(tw, line_h, line)
            self.set_y(self.get_y() + line_h)
        return True

    # ── range grids ───────────────────────────────────────────────────────
    def _attack_rows(self, card) -> int:
        """Number of rows needed for the attack grid."""
        attack = card.get("attack_cells")
        if attack == "all":
            return 1  # 全域 draws as a single cell
        if attack is None:
            return 3
        rows = [r for r, _ in attack] + [0]
        return max(1, max(rows)) - min(-1, min(rows)) + 1

    def _draw_grid(self, cells, *, is_attack: bool, gx: float, gy: float):
        """Draw one 3-column grid for either attack or weakness cells."""
        if is_attack and cells == "all":
            self.set_fill_color(255, 210, 210)
            self.jp(6)
            self.set_xy(gx, gy)
            self.cell(GRID_W, CELL, "全域", border=1, fill=True, align="C")
            return

        if is_attack:
            active_set = {tuple(c) for c in (cells or [])}
            coords = list(cells or []) + [[0, 0]]
            min_r = min(-1, min(r for r, _ in coords))
            max_r = max(1, max(r for r, _ in coords))
        else:
            active_set = {tuple(c) for c in (cells or [])}
            min_r, max_r = -1, 1

        for row in range(max_r, min_r - 1, -1):
            for col in range(-1, 2):
                cx = gx + (col + 1) * CELL
                cy = gy + (max_r - row) * CELL

                if (row, col) == (0, 0):
                    label, rgb = "^", (180, 180, 180)
                elif (row, col) in active_set:
                    label, rgb = ("A", (255, 180, 180)) if is_attack else ("B", (180, 200, 255))
                else:
                    label, rgb = "", (255, 255, 255)

                self.set_fill_color(*rgb)
                self.jp(5.5)
                self.set_xy(cx, cy)
                self.cell(CELL, CELL, label, border=1, fill=True, align="C")


# ── main ──────────────────────────────────────────────────────────────────────
def generate(cards_path: Path, out_path: Path):
    data = json.loads(cards_path.read_text(encoding="utf-8"))
    characters = data["characters"]
    items = data.get("items", [])

    pdf = CardPDF(unit="mm", format="A4")
    pdf.set_auto_page_break(False)
    pdf.init_font(find_font(FONT_REGULAR), find_font(FONT_BOLD))
    pdf.faction_names = data.get("faction_names", {})
    pdf.keyword_effects = data.get("keyword_effects", {})

    per_page = COLS * ROWS
    for start in range(0, len(characters), per_page):
        pdf.add_page()
        for i, card in enumerate(characters[start : start + per_page]):
            pdf.draw_card(card, *card_pos(i))

    for start in range(0, len(items), per_page):
        pdf.add_page()
        for i, card in enumerate(items[start : start + per_page]):
            pdf.draw_item_card(card, *card_pos(i))

    pdf.output(str(out_path))
    char_pages = (len(characters) + per_page - 1) // per_page
    item_pages = (len(items) + per_page - 1) // per_page
    print(
        f"Generated: {out_path}  "
        f"({len(characters)} chars/{char_pages}p, "
        f"{len(items)} items/{item_pages}p)"
    )


if __name__ == "__main__":
    root = Path(__file__).parent
    data = root.parent / "data"
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "cards.pdf"
    generate(data / "cards.json", out)
