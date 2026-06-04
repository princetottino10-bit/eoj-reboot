#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Oricard テストキット 印刷キット PDF
  4陣営（顕現/猛攻/守護/詠唱）のキャラ・アイテム・ウルトをスタンダードサイズ(63.5x88mm)で印刷。
  A4縦・3×3配置・ファクション見出しで区切り。
"""
import json
from fpdf import FPDF

import os as _os
DATA = _os.path.join(_os.path.dirname(__file__), "..", "data", "cards-testkit.json")
OUT  = _os.path.join(_os.path.dirname(__file__), "..", "oricard-testkit-printkit.pdf")
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"

d             = json.load(open(DATA, encoding="utf-8"))
FACTION_NAMES = d["faction_names"]
KEYWORDS      = d["keyword_effects"]
chars         = d["characters"]
items         = d["items"]
ults          = d["faction_ults"]

FACTION_ORDER = ["cip", "aggro", "defense", "spell"]
ATTR_ORDER    = ["火", "水", "土", "木", "無"]

FACTION_COLORS = {
    "cip":     ( 52, 152, 219),
    "aggro":   (180,  30,  30),
    "defense": ( 41, 128, 185),
    "spell":   (142,  68, 173),
}
ATTR_COLORS = {
    "火": (220, 70, 50), "水": (50, 130, 210),
    "土": (150, 110, 50), "木": (39, 155, 80), "無": (130, 135, 140),
}
ULT_COLOR  = (108, 60, 148)   # ウルトカード紫
ULT_DARK   = ( 78, 40, 108)

C_ATK_BG     = (235, 110, 110);  C_ATK_SYM   = (110,  15,  15)
C_WEAK_BG    = (248, 205,  70);  C_WEAK_SYM  = (140,  85,   0)
C_CTR_BORDER = ( 40,  80, 200);  C_SELF_BG   = ( 60, 110, 200)
C_EMPTY      = (225, 228, 236);  C_GRIDLINE  = (170, 175, 185)
C_INK        = ( 22,  25,  33);  C_SUB       = ( 95, 100, 112)
C_WHITE      = (255, 255, 255)

CW, CH     = 63.5, 88.0
COLS, ROWS = 3, 3
LM = (210 - COLS * CW) / 2
TM = (297 - ROWS * CH) / 2
CS = 6.8

# ── ユーティリティ ────────────────────────────────────────────────
def effective_counter(ch):
    if ch["attack_type"] == "魔道": return []
    atk = ch["attack_cells"]; cnt = ch["counter_cells"]
    if not cnt: return []
    if atk in ("all", None): return []
    return [c for c in cnt if c in atk]

def cell_in(cells, f, l):
    if cells == "all": return not (f == 0 and l == 0)
    if not cells: return False
    return [f, l] in cells

def _fit_size(text, avail_w, avail_h, base=10, min_pt=6.5):
    for size in [base, base-1, base-1.5, base-2, base-2.5, base-3, min_pt]:
        char_mm = size * 0.36; lh = size * 0.44
        cpl = max(1, avail_w / char_mm)
        lines = sum(max(1, -(-len(p) // int(cpl))) if p else 1 for p in text.split('\n'))
        if lines * lh <= avail_h: return size
    return min_pt

# ── グリッド描画 ─────────────────────────────────────────────────
def draw_grid(pdf, gx, gy, ch):
    atk = ch["attack_cells"]; cnt = effective_counter(ch); wk = ch.get("weakness_cells") or []
    has_f2 = isinstance(atk, list) and any(a[0] == 2 for a in atk)
    rows = [2, 1, 0, -1] if has_f2 else [1, 0, -1]
    for ri, f in enumerate(rows):
        for ci, l in enumerate([-1, 0, 1]):
            x = gx + ci * CS; y = gy + ri * CS
            is_center = (f == 0 and l == 0)
            is_atk = not is_center and cell_in(atk, f, l)
            is_wk  = cell_in(wk, f, l)
            is_cnt = not is_center and [f, l] in cnt
            if is_center:   pdf.set_fill_color(*C_SELF_BG)
            elif is_atk:    pdf.set_fill_color(*C_ATK_BG)
            elif is_wk:     pdf.set_fill_color(*C_WEAK_BG)
            else:           pdf.set_fill_color(*C_EMPTY)
            pdf.set_draw_color(*C_GRIDLINE); pdf.set_line_width(0.2)
            pdf.rect(x, y, CS, CS, style="FD")
            if is_cnt:
                pdf.set_draw_color(*C_CTR_BORDER); pdf.set_line_width(0.8)
                pdf.rect(x+0.7, y+0.7, CS-1.4, CS-1.4, style="D")
            sym, scol = None, C_INK
            if is_center:  sym, scol = "自", C_WHITE
            elif is_atk:   sym, scol = "●", C_ATK_SYM
            elif is_wk:    sym, scol = "★", C_WEAK_SYM
            if sym:
                pdf.set_font("ipa", "", 7); pdf.set_text_color(*scol)
                pdf.set_xy(x, y + (CS - 5) / 2); pdf.cell(CS, 5, sym, align="C")
    pdf.set_font("ipa", "", 5.5); pdf.set_text_color(*C_SUB)
    pdf.set_xy(gx, gy - 3.8); pdf.cell(CS*3, 3.5, "▲前方", align="C")

def mode_label(ch):
    if ch["attack_type"] == "魔道": return ""
    atk = ch["attack_cells"]
    if atk is None or atk == "all" or len(atk) <= 1: return ""
    return "選択" if ch["attack_mode"] == "choice" else "同時"

# ── キャラクターカード ────────────────────────────────────────────
def draw_card(pdf, ix, iy, ch, seq_no):
    fac = ch["faction"]; fcol = FACTION_COLORS.get(fac, (80,80,80))
    acol = ATTR_COLORS.get(ch["attribute"], (120,120,120))
    ult  = ch.get("ult")

    pdf.set_draw_color(160,160,160); pdf.set_line_width(0.15)
    pdf.set_fill_color(255,255,255); pdf.rect(ix, iy, CW, CH, style="FD")

    BAR = 10.5
    pdf.set_fill_color(*fcol); pdf.rect(ix, iy, CW, BAR, style="F")
    NUM_W = 7.5
    pdf.set_fill_color(*(max(c-30,0) for c in fcol)); pdf.rect(ix, iy, NUM_W, BAR, style="F")
    pdf.set_font("ipa","",8); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix, iy+1.5); pdf.cell(NUM_W, 7, str(seq_no), align="C")

    pdf.set_font("ipa","",11.5); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix+NUM_W+1, iy+1.8); pdf.cell(CW-NUM_W-14, 7, ch["name"])

    CRX = ix+CW-12
    pdf.set_fill_color(*C_WHITE); pdf.set_draw_color(*C_WHITE)
    pdf.ellipse(CRX, iy+1, 11, BAR-2, style="F")
    pdf.set_font("ipa","",12); pdf.set_text_color(*fcol)
    pdf.set_xy(CRX, iy+2); pdf.cell(11, BAR-4, str(ch["cost"]), align="C")

    y = iy + BAR + 1.5
    pdf.set_fill_color(*acol); pdf.rect(ix+2, y, 8, 5.5, style="F")
    pdf.set_font("ipa","",8); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix+2, y+0.7); pdf.cell(8, 4, ch["attribute"], align="C")
    parts = [FACTION_NAMES.get(fac, fac)]
    if ch["attack_type"] == "魔道": parts.append("魔道")
    ml = mode_label(ch)
    if ml: parts.append(ml)
    if ch.get("has_overlay"): parts.append("重ね")
    pdf.set_font("ipa","",7.5); pdf.set_text_color(*C_SUB)
    pdf.set_xy(ix+11, y+0.8); pdf.cell(CW-13, 4.5, "・".join(parts))
    y += 7

    pdf.set_font("ipa","",11); pdf.set_text_color(*C_INK)
    pdf.set_xy(ix+2, y)
    pdf.cell(CW-4, 6.5, f"HP {ch['hp']}  ATK {ch['atk']}  VP {ch['vp']}  再 {ch['reactivation_cost']}")
    y += 8

    GX = ix+3; GY = y+4.5
    atk_cells = ch["attack_cells"]
    has_f2 = isinstance(atk_cells, list) and any(a[0]==2 for a in atk_cells)
    grid_rows = 4 if has_f2 else 3
    draw_grid(pdf, GX, GY, ch)
    grid_bottom = GY + CS * grid_rows

    KX = GX + CS*3 + 3; KW = CW - (KX-ix) - 2.5; ky = GY
    display_kws = list(ch.get("keywords") or [])
    if ch.get("has_overlay") and "重ね召喚" not in display_kws:
        display_kws.insert(0, "重ね召喚")
    for kw in display_kws:
        pdf.set_fill_color(242,244,250); pdf.set_text_color(*fcol)
        pdf.set_font("ipa","",9.5)
        tw = min(pdf.get_string_width(kw)+4, KW)
        pdf.set_xy(KX, ky); pdf.cell(tw, 6.5, kw, border=0, align="C", fill=True)
        ky += 7.5
    if ch["attack_cells"] == "all":
        pdf.set_font("ipa","",7.5); pdf.set_text_color(*C_SUB)
        pdf.set_xy(KX, ky+1); pdf.multi_cell(KW, 3.5, "魔道\n全域")

    y = grid_bottom + 3.5
    ULT_H = 16 if ult else 0
    eff = (ch.get("effect") or "").strip()
    if ch.get("has_overlay"):
        od = KEYWORDS.get("重ね召喚","")
        if od: eff += ("\n" if eff else "") + "【重ね召喚】" + od
    if eff:
        avail_h = (iy + CH - 2 - ULT_H) - y
        eff_pt = _fit_size(eff, CW-5, avail_h, base=8.5 if ult else 10)
        pdf.set_font("ipa","",eff_pt); pdf.set_text_color(*C_INK)
        pdf.set_xy(ix+2.5, y); pdf.multi_cell(CW-5, eff_pt*0.43, eff)

    if ult:
        by = iy + CH - 1.5 - ULT_H
        pdf.set_fill_color(255,248,228); pdf.set_draw_color(200,120,0)
        pdf.set_line_width(0.35); pdf.rect(ix+1.5, by, CW-3, ULT_H, style="FD")
        pdf.set_font("ipa","",8.5); pdf.set_text_color(175,85,0)
        pdf.set_xy(ix+2.5, by+0.8); pdf.cell(CW-5, 5, f"必殺：{ult['name']}")
        pdf.set_font("ipa","",7.5); pdf.set_text_color(*C_INK)
        pdf.set_xy(ix+2.5, by+6); pdf.multi_cell(CW-5, 3.2, f"[{ult['condition']}] {ult['effect']}")

# ── アイテムカード ────────────────────────────────────────────────
def draw_item_card(pdf, ix, iy, it, seq_no):
    acol = ATTR_COLORS.get(it["attribute"], (120,120,120)); hcol = (65,70,82)
    pdf.set_draw_color(160,160,160); pdf.set_line_width(0.15)
    pdf.set_fill_color(255,255,255); pdf.rect(ix, iy, CW, CH, style="FD")
    BAR = 10.5
    pdf.set_fill_color(*hcol); pdf.rect(ix, iy, CW, BAR, style="F")
    NUM_W = 7.5
    pdf.set_fill_color(45,48,58); pdf.rect(ix, iy, NUM_W, BAR, style="F")
    pdf.set_font("ipa","",8); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix, iy+1.5); pdf.cell(NUM_W, 7, str(seq_no), align="C")
    pdf.set_font("ipa","",11.5); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix+NUM_W+1, iy+1.8); pdf.cell(CW-NUM_W-14, 7, it["name"])
    CRX = ix+CW-12
    pdf.set_fill_color(*C_WHITE); pdf.set_draw_color(*C_WHITE)
    pdf.ellipse(CRX, iy+1, 11, BAR-2, style="F")
    pdf.set_font("ipa","",12); pdf.set_text_color(*hcol)
    pdf.set_xy(CRX, iy+2); pdf.cell(11, BAR-4, str(it["cost"]), align="C")
    y = iy + BAR + 1.5
    pdf.set_fill_color(*acol); pdf.rect(ix+2, y, 8, 5.5, style="F")
    pdf.set_font("ipa","",8); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix+2, y+0.7); pdf.cell(8, 4, it["attribute"], align="C")
    fac_name = FACTION_NAMES.get(it.get("faction",""), "")
    pdf.set_font("ipa","",7.5); pdf.set_text_color(*C_SUB)
    pdf.set_xy(ix+11, y+0.8); pdf.cell(CW-13, 4.5, f"アイテム・{fac_name}" if fac_name else "アイテム")
    y += 8
    pdf.set_font("ipa","",22); pdf.set_text_color(215,218,228)
    pdf.set_xy(ix+2, y+1); pdf.cell(CW-4, 11, "☆", align="C")
    y += 14
    eff = it["effect"]; avail_h = CH-(y-iy)-2.5
    size = _fit_size(eff, CW-5, avail_h)
    pdf.set_font("ipa","",size); pdf.set_text_color(*C_INK)
    pdf.set_xy(ix+2.5, y); pdf.multi_cell(CW-5, size*0.44, eff)

# ── ウルトカード ──────────────────────────────────────────────────
def draw_ult_card(pdf, ix, iy, u, seq_no):
    fcol = FACTION_COLORS.get(u["faction"], ULT_COLOR)
    # 背景は陣営色を薄く
    r,g,b = fcol
    pdf.set_draw_color(*(max(c-40,0) for c in fcol)); pdf.set_line_width(0.5)
    pdf.set_fill_color(*[int(255-(255-v)*0.12) for v in fcol])
    pdf.rect(ix, iy, CW, CH, style="FD")

    # ヘッダ
    BAR = 10.5
    pdf.set_fill_color(*fcol); pdf.rect(ix, iy, CW, BAR, style="F")
    NUM_W = 7.5
    pdf.set_fill_color(*(max(c-40,0) for c in fcol)); pdf.rect(ix, iy, NUM_W, BAR, style="F")
    pdf.set_font("ipa","",8); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix, iy+1.5); pdf.cell(NUM_W, 7, str(seq_no), align="C")
    pdf.set_font("ipa","",11); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix+NUM_W+1, iy+1.8); pdf.cell(CW-NUM_W-2, 7, u["name"])

    y = iy + BAR + 2

    # ウルトバッジ
    pdf.set_fill_color(*fcol); pdf.set_draw_color(*fcol)
    pdf.rect(ix+2, y, 14, 5.5, style="F")
    pdf.set_font("ipa","",8); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(ix+2, y+0.7); pdf.cell(14, 4, "ウルト", align="C")
    fac_name = FACTION_NAMES.get(u["faction"], u["faction"])
    pdf.set_font("ipa","",7.5); pdf.set_text_color(*C_SUB)
    pdf.set_xy(ix+17, y+0.8); pdf.cell(CW-19, 4.5, f"{fac_name}  デッキ外1枚")
    y += 8

    # 大きな「U」装飾
    pdf.set_font("ipa","",32); pdf.set_text_color(*[int(255-(255-v)*0.25) for v in fcol])
    pdf.set_xy(ix+2, y); pdf.cell(CW-4, 16, "U", align="C")
    y += 18

    # 条件ボックス
    pdf.set_fill_color(245,245,252); pdf.set_draw_color(*fcol); pdf.set_line_width(0.4)
    cond_text = u["condition"]
    cond_pt = _fit_size(cond_text, CW-7, 22, base=7.5, min_pt=6)
    cond_lines = sum(max(1,-(-len(p)//max(1,int((CW-7)/(cond_pt*0.36))))) if p else 1
                     for p in cond_text.split('\n'))
    cond_h = cond_lines * cond_pt * 0.44 + 5
    pdf.rect(ix+2, y, CW-4, cond_h, style="FD")
    pdf.set_font("ipa","",cond_pt); pdf.set_text_color(*C_INK)
    pdf.set_xy(ix+3.5, y+2.5); pdf.multi_cell(CW-7, cond_pt*0.44, cond_text)
    y += cond_h + 3

    # 効果テキスト
    eff = u["effect"]; avail_h = iy+CH-2-y
    eff_pt = _fit_size(eff, CW-5, avail_h, base=9)
    pdf.set_font("ipa","",eff_pt); pdf.set_text_color(*C_INK)
    pdf.set_xy(ix+2.5, y); pdf.multi_cell(CW-5, eff_pt*0.44, eff)

# ── ファクション見出し ────────────────────────────────────────────
def draw_faction_header(pdf, faction):
    """現在ページのヘッダ帯にファクション名を描く（ページ上端）"""
    fcol = FACTION_COLORS.get(faction, (80,80,80))
    fname = FACTION_NAMES.get(faction, faction)
    pdf.set_fill_color(*fcol)
    pdf.rect(0, 0, 210, 8, style="F")
    pdf.set_font("ipa","",9); pdf.set_text_color(*C_WHITE)
    pdf.set_xy(LM, 1.5); pdf.cell(COLS*CW, 5, f"■ {fname}", align="L")

# ── ページ配置 ────────────────────────────────────────────────────
class PDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.add_font("ipa","",FONT)
        self.set_auto_page_break(False); self.set_margins(0,0,0)

def main():
    pdf = PDF()
    slot = 9   # 強制的に最初のカードで新ページ
    cur_faction = None

    def next_slot(faction=None):
        nonlocal slot, cur_faction
        # ファクション切り替え or ページ満→改ページ
        if faction and faction != cur_faction:
            # 残スロットをスキップして新ページへ
            slot = 9
            cur_faction = faction
        if slot >= 9:
            pdf.add_page()
            slot = 0
            if cur_faction:
                draw_faction_header(pdf, cur_faction)
        col = slot % COLS; row = slot // COLS
        ix = LM + col*CW; iy = TM + row*CH
        slot += 1
        return ix, iy

    seq = 1

    # ── キャラクター（ファクション順）
    sorted_chars = sorted(chars, key=lambda c: (
        FACTION_ORDER.index(c["faction"]) if c["faction"] in FACTION_ORDER else 99,
        ATTR_ORDER.index(c["attribute"]) if c["attribute"] in ATTR_ORDER else 9,
        c["id"]
    ))
    for c in sorted_chars:
        ix, iy = next_slot(c["faction"])
        draw_card(pdf, ix, iy, c, seq); seq += 1

    # ── アイテム（ファクション順）
    sorted_items = sorted(items, key=lambda i: (
        FACTION_ORDER.index(i.get("faction","")) if i.get("faction") in FACTION_ORDER else 99,
        ATTR_ORDER.index(i["attribute"]) if i["attribute"] in ATTR_ORDER else 9,
        i["id"]
    ))
    for it in sorted_items:
        ix, iy = next_slot(it.get("faction"))
        draw_item_card(pdf, ix, iy, it, seq); seq += 1

    # ── ウルト（ファクション順）
    sorted_ults = sorted(ults, key=lambda u: (
        FACTION_ORDER.index(u["faction"]) if u["faction"] in FACTION_ORDER else 99,
        u["id"]
    ))
    cur_faction = None   # ウルトセクションはリセット
    for u in sorted_ults:
        ix, iy = next_slot(u["faction"])
        draw_ult_card(pdf, ix, iy, u, seq); seq += 1

    pdf.output(OUT)
    print(f"OK -> {OUT}")
    print(f"  pages: {pdf.page_no()}  キャラ {len(chars)}  アイテム {len(items)}  ウルト {len(ults)}  合計 {seq-1}枚")

if __name__ == "__main__":
    main()
