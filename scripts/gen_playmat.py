# -*- coding: utf-8 -*-
"""異能学園総選挙 テストキット プレイマット生成 (A4タイル分割・固定属性)"""
import json
from fpdf import FPDF

FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
import os
DATA = os.path.join(os.path.dirname(__file__), '..', 'data', 'cards-testkit.json')
OUT  = os.path.join(os.path.dirname(__file__), '..', 'oricard-playmat.pdf')

d = json.load(open(DATA))
KW = d['keyword_effects']

# 属性カラー
COL = {
    '火': (232, 88, 74),
    '水': (74, 144, 232),
    '土': (176, 134, 58),
    '木': (90, 168, 74),
    '無': (150, 150, 150),
}
# 固定盤面 (ユーザー指定 / 中央=無 / 各属性2マス)
ATTR = [['水', '火', '木'],
        ['土', '無', '水'],
        ['火', '木', '土']]

CELL_W, CELL_H = 90.0, 90.0           # 正方形マス (カード63.5x88が90°回転しても収まる)
BOARD_W, BOARD_H = CELL_W*3, CELL_H*3  # 270 x 270

pdf = FPDF(unit='mm', format='A4')
pdf.add_font('ipa', '', FONT)
pdf.set_auto_page_break(False)

def set_fill(c): pdf.set_fill_color(*c)
def set_draw(c): pdf.set_draw_color(*c)
def set_text(c): pdf.set_text_color(*c)

def lighten(c, f=0.82):
    return tuple(int(v + (255 - v) * f) for v in c)

# ---------------------------------------------------------------
# 盤面を board-space に描く関数 (offset でタイルの窓をずらす)
# ---------------------------------------------------------------
def draw_board(ox, oy):
    """board-space原点を (ox,oy) に置いて 3x3 を描画 (ページ外はクリップ)"""
    # 外枠
    set_draw((40, 40, 40)); pdf.set_line_width(0.8)
    for r in range(3):
        for c in range(3):
            x = ox + c*CELL_W
            y = oy + r*CELL_H
            attr = ATTR[r][c]
            col = COL[attr]
            # マス背景 (淡色)
            set_fill(lighten(col, 0.86))
            set_draw((60, 60, 60)); pdf.set_line_width(0.6)
            pdf.rect(x, y, CELL_W, CELL_H, style='DF')
            # カード配置ガイド (中央の点線正方形 / 90°回転しても収まる 80x80)
            gs = 80.0
            gx = x + (CELL_W - gs)/2
            gy = y + (CELL_H - gs)/2
            set_draw((150, 150, 150)); pdf.set_line_width(0.2)
            _dashed_rect(gx, gy, gs, gs)
            # 回転自由のヒント (中央に薄い十字)
            set_draw((205, 205, 205)); pdf.set_line_width(0.2)
            cxp, cyp = x + CELL_W/2, y + CELL_H/2
            pdf.line(cxp-5, cyp, cxp+5, cyp)
            pdf.line(cxp, cyp-5, cxp, cyp+5)
            # 右上 属性バッジ
            bw, bh = 18, 16
            bx = x + CELL_W - bw - 3
            by = y + 3
            set_fill(col); set_draw((30, 30, 30)); pdf.set_line_width(0.4)
            pdf.rect(bx, by, bw, bh, style='DF')
            set_text((255, 255, 255)); pdf.set_font('ipa', '', 18)
            pdf.set_xy(bx, by + 1.5)
            pdf.cell(bw, bh-3, attr, align='C')
            # 左上 マス番号 (1..9)
            num = r*3 + c + 1
            set_text((90, 90, 90)); pdf.set_font('ipa', '', 9)
            pdf.set_xy(x + 2, y + 2)
            pdf.cell(10, 5, str(num))

def _dashed_rect(x, y, w, h, dash=2.5, gap=1.8):
    # 4辺を破線で
    def seg(x1, y1, x2, y2):
        import math
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy)
        if ln == 0: return
        ux, uy = dx/ln, dy/ln
        pos = 0
        while pos < ln:
            a = pos; b = min(pos + dash, ln)
            pdf.line(x1+ux*a, y1+uy*a, x1+ux*b, y1+uy*b)
            pos += dash + gap
    seg(x, y, x+w, y); seg(x+w, y, x+w, y+h)
    seg(x+w, y+h, x, y+h); seg(x, y+h, x, y)

def reg_marks(corners):
    """ページ合わせ用の十字レジストレーションマーク"""
    set_draw((0, 0, 0)); pdf.set_line_width(0.3)
    for (x, y) in corners:
        pdf.line(x-4, y, x+4, y)
        pdf.line(x, y-4, x, y+4)

# ---------------------------------------------------------------
# 盤面を A4 タイルに分割 (分割線はマス境界に合わせ、各マスは必ず1枚に収める)
#   列を [0,1]|[2]、行を [0,1]|[2] で分割
#   タイル: 左上=160x210(4マス) / 右上=80x210 / 左下=160x105 / 右下=80x105
# ---------------------------------------------------------------
COL_GROUPS = [(0, 2), (2, 3)]   # col index ranges
ROW_GROUPS = [(0, 2), (2, 3)]
MARGIN_Y = 22
TILE_LABELS = [['左上', '右上'], ['左下', '右下']]

for tr, (r0, r1) in enumerate(ROW_GROUPS):
    for tc, (c0, c1) in enumerate(COL_GROUPS):
        pdf.add_page()
        win_x0, win_x1 = c0 * CELL_W, c1 * CELL_W
        win_y0, win_y1 = r0 * CELL_H, r1 * CELL_H
        tile_w, tile_h = win_x1 - win_x0, win_y1 - win_y0
        margin_x = (210 - tile_w) / 2
        ox = margin_x - win_x0
        oy = MARGIN_Y - win_y0
        # 見出し
        set_text((20, 20, 20)); pdf.set_font('ipa', '', 11)
        pdf.set_xy(10, 9)
        pdf.cell(190, 6, f'盤面タイル [{TILE_LABELS[tr][tc]}]  ※4枚を貼り合わせ＝3×3盤面', align='C')
        # 9マス描画 (タイルオフセット)
        draw_board(ox, oy)
        # 窓外を白でマスク (隣マスのはみ出しを消す)
        set_fill((255, 255, 255))
        wl, wt = margin_x, MARGIN_Y
        wr, wb = margin_x + tile_w, MARGIN_Y + tile_h
        pdf.rect(0, 0, 210, wt, 'F')
        pdf.rect(0, wb, 210, 297 - wb, 'F')
        pdf.rect(0, 0, wl, 297, 'F')
        pdf.rect(wr, 0, 210 - wr, 297, 'F')
        # 窓枠 + レジマーク
        set_draw((0, 0, 0)); pdf.set_line_width(0.4)
        pdf.rect(wl, wt, tile_w, tile_h)
        reg_marks([(wl, wt), (wr, wt), (wl, wb), (wr, wb)])
        # 貼り合わせ案内
        set_text((120, 120, 120)); pdf.set_font('ipa', '', 8)
        pdf.set_xy(10, wb + 3)
        pdf.cell(190, 4, '枠線で切り、十字マークを合わせて隣のタイルと貼り合わせてください', align='C')

# ---------------------------------------------------------------
# プレイヤーボード (A4横, 2枚印刷想定)
# ---------------------------------------------------------------
def player_board():
    pdf.add_page(orientation='L')   # 297 x 210
    W, H = 297, 210
    set_text((20, 20, 20)); pdf.set_font('ipa', '', 13)
    pdf.set_xy(10, 6); pdf.cell(W-20, 7, 'プレイヤーボード  ※各プレイヤー1枚（計2枚印刷）', align='C')

    def zone(x, y, w, h, title, sub='', col=(70, 70, 70)):
        set_draw(col); pdf.set_line_width(0.6); set_fill((248, 248, 248))
        pdf.rect(x, y, w, h, 'DF')
        set_text(col); pdf.set_font('ipa', '', 10)
        pdf.set_xy(x+2, y+1.5); pdf.cell(w-4, 5, title)
        if sub:
            set_text((150, 150, 150)); pdf.set_font('ipa', '', 7)
            pdf.set_xy(x+2, y+h-5); pdf.cell(w-4, 4, sub)

    cw, ch = 63.5, 88   # スタンダードカードスロット
    top = 17

    def card_slot(x, y, title, sub, accent=(70,70,70)):
        set_draw(accent); pdf.set_line_width(0.8); set_fill((250,250,250))
        pdf.rect(x, y, cw, ch, 'DF')
        set_text(accent); pdf.set_font('ipa','',11)
        pdf.set_xy(x+2, y+3); pdf.cell(cw-4, 6, title, align='C')
        if sub:
            set_text((150,150,150)); pdf.set_font('ipa','',7)
            nlines = sub.count('\n') + 1
            pdf.set_xy(x+2, y+ch-3.6*nlines-3); pdf.multi_cell(cw-4, 3.5, sub, align='C')

    def track(x, y, w, title, hint, n, hi_idx, hi_col):
        h = 30
        zone(x, y, w, h, title, '')
        set_text((150,150,150)); pdf.set_font('ipa','',7.5)
        pdf.set_xy(x, y+1.5); pdf.cell(w-3, 5, hint, align='R')
        cellw = (w-8)/n
        gy = y + 12
        for i in range(n):
            gx = x + 4 + i*cellw
            set_draw((180,180,180)); pdf.set_line_width(0.3)
            if i in hi_idx:
                set_fill(hi_col); tcol=(255,255,255)
            else:
                set_fill((255,255,255)); tcol=(60,60,60)
            pdf.rect(gx, gy, cellw-1, 14, 'DF')
            set_text(tcol); pdf.set_font('ipa','',9)
            pdf.set_xy(gx, gy+4); pdf.cell(cellw-1, 6, str(i), align='C')

    # --- 上段: マナ / VP トラック (横一列16マス) ---
    track(10, top, 277, 'マナプール', '毎ターン+2 / 撃破で+1 / 上限なし', 16, set(), None)
    track(10, top+36, 277, 'VPトラック', '15点で勝利！ / 撃破・マス制圧で獲得', 16,
          {15}, (232,88,74))
    # --- 下段左: ターンの流れ ---
    fx = 10
    bt = top + 76   # 下段トップ
    zone(fx, bt, 70, 114, 'ターンの流れ')
    set_text((60,60,60)); pdf.set_font('ipa','',8)
    flow = ['① ドロー',
            '   1枚＋マナ2',
            '   (先攻1T目はなし)',
            '② アクション',
            '   マナの続く限り:',
            '   ・スペル使用',
            '   ・攻撃(コスト消費)',
            '   ・回転90°(1体1回)',
            '③ 召喚',
            '   →ターン強制終了',
            '   初回:任意/以降:隣接',
            '   召喚ロック=4体以上',
            '④ リゾルブ',
            '   手札7チェック',
            '   勝利判定']
    yy = bt+9
    for ln in flow:
        pdf.set_xy(fx+2, yy); pdf.cell(66, 4, ln); yy += 4.6
    # --- 下段右: ウルト / 墓地 / デッキ (デッキ右側) ---
    cy = bt + 12
    card_slot(88, cy, 'ウルト', 'デッキ外1枚\n各陣営2枚から選択\nF6体以上・1G1回で解禁', (170,80,80))
    card_slot(156, cy, '墓地', '撃破/使用済み', (110,110,110))
    card_slot(224, cy, 'デッキ', '30枚 / 山札\n切れたら切り直して継続', (60,90,150))

player_board()

# ---------------------------------------------------------------
# 早見表 (A4縦)
# ---------------------------------------------------------------
pdf.add_page()
W = 210
set_text((20,20,20)); pdf.set_font('ipa','',15)
pdf.set_xy(10,10); pdf.cell(W-20,8,'クイックリファレンス', align='C')

def section(y, title):
    set_fill((40,40,40)); set_text((255,255,255)); pdf.set_font('ipa','',11)
    pdf.set_xy(12,y); pdf.cell(W-24,7,'  '+title,'',0,'L',fill=True)
    return y+9

# 属性相性
y = section(22, '属性と地形ボーナス')
set_text((40,40,40)); pdf.set_font('ipa','',10)
pdf.set_xy(14,y)
pdf.multi_cell(W-28, 5,
    '対立: 火 ⇔ 水 ／ 土 ⇔ 木 ／ 無=中立。\n'
    '同属性マスに召喚: HP +2 ／ 対立属性マスに召喚: HP -2（HP0以下で即死）／ 無は変動なし。')
# 属性バッジ列
yy = y+13
for i,a in enumerate(['火','水','土','木','無']):
    bx = 14 + i*22
    set_fill(COL[a]); set_draw((30,30,30)); pdf.set_line_width(0.4)
    pdf.rect(bx, yy, 18, 12, 'DF')
    set_text((255,255,255)); pdf.set_font('ipa','',14)
    pdf.set_xy(bx, yy+1.5); pdf.cell(18,9,a,align='C')

# 勝利条件 / マナ / VP
y = section(yy+18, '勝敗・マナ・VP')
set_text((40,40,40)); pdf.set_font('ipa','',10)
pdf.set_xy(14,y)
pdf.multi_cell(W-28,5,
    '勝利: ①9マス中5マスを支配（過半数）／ ②VP15点に到達 のいずれか。4マス支配=チェック。\n'
    'デッキ切れによる敗北は無し（山札が尽きたら切り直して継続）。\n'
    'VP: クリーチャー撃破で獲得（コスト≤2→1点 / ≤4→2点 / 5以上→3点）。自滅でもVP・マナは入る。\n'
    'マナ: 毎ターン+2、撃破でオーナー+1、上限なし。召喚/攻撃/回転/スペルに使用。')

# ターンの流れ
y = section(y+24, 'ターンの流れ')
set_text((40,40,40)); pdf.set_font('ipa','',10)
pdf.set_xy(14,y)
pdf.multi_cell(W-28,5,
    '① ドロー: カード1枚＋マナ2（先攻1ターン目はドローなし）。\n'
    '② アクション（マナの続く限り任意の順）: スペル / 攻撃（コスト消費）/ 回転90°（各1体1回）。\n'
    '③ 召喚: 1体配置→ターン強制終了。初回は任意マス、以降は隣接。召喚ロック=盤面4体以上で可。\n'
    '④ リゾリューション: 手札7枚チェック → 勝利判定。', align='L')

# 攻撃グリッドの読み方
y = section(y+34, '攻撃グリッドの読み方（カード）')
set_text((40,40,40)); pdf.set_font('ipa','',10)
pdf.set_xy(14,y)
pdf.multi_cell(W-28,5,
    '座標 [前方, 左右]。中央=自機（上向き）。赤●=攻撃 / 青枠=反撃 / 黄★=弱点。\n'
    '魔道攻撃=全域（位置無視）。弱点(死角)からの攻撃はダメージ+1・反撃不可。\n'
    '回避は無し。攻撃範囲に入れば必ず当たる＝向きと位置取りが「回避」。\n'
    '味方は通常狙えないが、複数同時攻撃で攻撃範囲に味方が入ると味方にも当たる（巻き込み）。', align='L')

# ウルト
y = section(y+27, 'ウルト（デッキ外カード）')
set_text((40,40,40)); pdf.set_font('ipa','',10)
pdf.set_xy(14,y)
pdf.multi_cell(W-28,5,
    '各陣営2枚のうち1枚をデッキビルド時に選択（デッキ外）。\n'
    '共通解禁: フィールドのクリーチャー合計6体以上・1ゲーム1回。\n'
    '解禁後は自分のターンの任意タイミングで発動。陣営固有コストを支払う。')

# キーワード一覧
y = section(y+24, 'キーワード')
set_text((40,40,40)); pdf.set_font('ipa','',9)
yy = y
for k, v in KW.items():
    pdf.set_xy(14, yy)
    pdf.set_font('ipa','',9.5); set_text((20,20,20))
    pdf.cell(26, 5, '■'+k)
    pdf.set_font('ipa','',8.5); set_text((70,70,70))
    pdf.set_xy(40, yy)
    pdf.multi_cell(W-54, 4.2, v)
    yy = pdf.get_y() + 1.5

pdf.output(OUT)
print('written', OUT)
import os
print('pages?', 'size', os.path.getsize(OUT))
