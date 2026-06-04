# -*- coding: utf-8 -*-
"""異能学園総選挙 テストキット プレイマット生成 (A4タイル分割・固定属性)"""
import json
from fpdf import FPDF

FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
import os
DATA = os.path.join(os.path.dirname(__file__),'..','data','cards-testkit.json')
OUT  = os.path.join(os.path.dirname(__file__),'..','oricard-playmat.pdf')

d = json.load(open(DATA))
KW = d['keyword_effects']  # 早見表はJSONから直読みするため自動反映

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
# 盤面を A4横2枚に分割 (切らずに上下を突き合わせ＝3×3盤面)
#   盤面270x270 を水平中央(board y=135)で上下半分に分け、
#   継ぎ目を紙端へ寄せる。2枚を突き合わせる(または継ぎ目を数mm重ねる)と盤面完成。
# ---------------------------------------------------------------
PW, PH = 297, 210                  # A4 landscape
bmx = (PW - BOARD_W) / 2           # 13.5  水平センタリング
SEAM = 7                           # 継ぎ目側の余白(プリンタ非印刷域ぶん)
HALF_Y = BOARD_H / 2               # 135  分割位置(board座標)

def seam_ticks(seam_py, point_down):
    """継ぎ目の整列ガイド(列境界に三角マーク)"""
    set_fill((0, 0, 0)); set_draw((0, 0, 0)); pdf.set_line_width(0.4)
    d = 2.6 if point_down else -2.6
    for k in range(4):
        xv = bmx + k*CELL_W
        pdf.line(xv, seam_py, xv, seam_py + d)
        # 小三角
        pdf.polygon([(xv-1.4, seam_py + d), (xv+1.4, seam_py + d), (xv, seam_py)], style='F')

def board_half(is_top):
    pdf.add_page(orientation='L')
    if is_top:
        seam_py = PH - SEAM            # 継ぎ目=紙の下端付近
        oy = seam_py - HALF_Y          # board原点y
        title = '盤面（上半分）'
        # 見出し(上の余白)
        set_text((20,20,20)); pdf.set_font('ipa','',12)
        pdf.set_xy(bmx, 14); pdf.cell(BOARD_W, 7,
            '盤面（上半分）  ※下端で「盤面（下半分）」と突き合わせ', align='C')
    else:
        seam_py = SEAM                 # 継ぎ目=紙の上端付近
        oy = seam_py - HALF_Y
        # 見出し(下の余白)
        set_text((20,20,20)); pdf.set_font('ipa','',12)
        pdf.set_xy(bmx, PH-22); pdf.cell(BOARD_W, 7,
            '盤面（下半分）  ※上端で「盤面（上半分）」と突き合わせ', align='C')
    # 9マス描画
    draw_board(bmx, oy)
    # 不要側を白でマスク
    set_fill((255,255,255))
    if is_top:
        pdf.rect(0, seam_py, PW, PH-seam_py, 'F')   # 継ぎ目より下(下半分ぶん)を消す
        pdf.rect(0, 0, PW, oy, 'F')                 # board上端より上
    else:
        pdf.rect(0, 0, PW, seam_py, 'F')            # 継ぎ目より上(上半分ぶん)を消す
        pdf.rect(0, oy+BOARD_H, PW, PH-(oy+BOARD_H), 'F')  # board下端より下
    pdf.rect(0, 0, bmx, PH, 'F')                     # 左帯
    pdf.rect(bmx+BOARD_W, 0, PW-(bmx+BOARD_W), PH, 'F')  # 右帯
    # 継ぎ目ライン + 整列三角
    set_draw((150,150,150)); pdf.set_line_width(0.3)
    pdf.line(bmx, seam_py, bmx+BOARD_W, seam_py)
    seam_ticks(seam_py, point_down=is_top)
    # 案内文
    set_text((120,120,120)); pdf.set_font('ipa','',8)
    note = '切らずに、▲印を合わせて2枚を突き合わせ（または継ぎ目を数mm重ねて）裏からテープ留め'
    if is_top:
        pdf.set_xy(bmx, 22); pdf.cell(BOARD_W, 5, note, align='C')
    else:
        pdf.set_xy(bmx, PH-16); pdf.cell(BOARD_W, 5, note, align='C')

board_half(is_top=True)
board_half(is_top=False)

# ---------------------------------------------------------------
# プレイヤーボード (A4横, 2枚印刷想定)
# ---------------------------------------------------------------
def player_board():
    pdf.add_page(orientation='L')   # 297 x 210
    W, H = 297, 210

    # パレット
    INK   = (44, 48, 62)
    SUB   = (132, 138, 152)
    LINE  = (224, 227, 234)
    PANEL = (249, 250, 252)
    MANA  = (58, 118, 196);  MANA_BG = (236, 243, 251)
    VP    = (196, 146, 40);  VP_BG   = (252, 247, 233);  VP_WIN = (214, 76, 72)
    ULT   = (150, 82, 140)
    GRAVE = (108, 112, 124)
    DECK  = (52, 96, 150)
    FLOW  = (52, 140, 128)

    def shadow(x, y, w, h, r=2.4):
        set_fill((228, 230, 236))
        pdf.rect(x+1.3, y+1.4, w, h, 'F', round_corners=True, corner_radius=r)

    def panel(x, y, w, h, r=2.4, fill=PANEL, draw=LINE, lw=0.5):
        set_fill(fill); set_draw(draw); pdf.set_line_width(lw)
        pdf.rect(x, y, w, h, 'DF', round_corners=True, corner_radius=r)

    def header_strip(x, y, w, title, accent, h=8.5, hint='', tcol=(255,255,255)):
        """角丸パネル上部のアクセント見出し帯"""
        set_fill(accent)
        pdf.rect(x, y, w, h+2.4, 'F', round_corners=True, corner_radius=2.4)
        set_fill(accent)
        pdf.rect(x, y+2.4, w, h, 'F')  # 下側を四角く戻して帯に
        set_text(tcol); pdf.set_font('ipa', '', 10)
        pdf.set_xy(x+4, y+1.3); pdf.cell(w*0.6, 6, title)
        if hint:
            set_text((255,255,255)); pdf.set_font('ipa', '', 7)
            pdf.set_xy(x, y+2); pdf.cell(w-4, 5, hint, align='R')

    cw, ch = 63.5, 88
    top = 23

    # ===== 外枠フレーム =====
    panel(6, 6, W-12, H-12, r=3, fill=(255,255,255), draw=(236,238,243), lw=0.6)

    # ===== タイトル帯 =====
    set_fill(INK)
    pdf.rect(10, 9, W-20, 11, 'F', round_corners=True, corner_radius=2.6)
    set_text((255,255,255)); pdf.set_font('ipa','',12)
    pdf.set_xy(14, 10.5); pdf.cell(120, 8, 'プレイヤーボード')
    set_text((176,182,196)); pdf.set_font('ipa','',8)
    pdf.set_xy(W-120, 11.5); pdf.cell(106, 6, '異能学園総選挙 TESTKIT  /  各プレイヤー1枚（計2枚印刷）', align='R')

    # ===== トラック =====
    def track(x, y, w, title, hint, n, accent, cell_bg, hi_idx, hi_col):
        h = 30
        shadow(x, y, w, h)
        panel(x, y, w, h)
        header_strip(x, y, w, title, accent, h=8, hint=hint)
        cellw = (w-8)/n
        gy = y + 13.5
        for i in range(n):
            gx = x + 4 + i*cellw
            if i in hi_idx:
                set_fill(hi_col); set_draw(hi_col); tcol=(255,255,255)
            else:
                set_fill(cell_bg); set_draw((215,219,226)); tcol=(96,102,116)
            pdf.set_line_width(0.4)
            pdf.rect(gx, gy, cellw-1.4, 13, 'DF', round_corners=True, corner_radius=1.4)
            set_text(tcol); pdf.set_font('ipa','',9)
            pdf.set_xy(gx, gy+3.6); pdf.cell(cellw-1.4, 6, str(i), align='C')

    track(10, top, 277, 'マナプール', '毎ターン +2  /  撃破で +1  /  上限なし',
          16, MANA, MANA_BG, set(), None)
    track(10, top+36, 277, 'VPトラック', '15点で勝利！ /  撃破・マス制圧で獲得',
          16, VP, VP_BG, {15}, VP_WIN)

    # ===== 下段 =====
    bt = top + 74
    # --- ターンの流れ ---
    fx, fw, fh = 10, 70, 113
    shadow(fx, bt, fw, fh)
    panel(fx, bt, fw, fh)
    header_strip(fx, bt, fw, 'ターンの流れ', FLOW, h=8)
    groups = [
        ('① ドロー', ['1枚＋マナ2', '先攻1T目はドローのみ無', '（マナ2は得る）']),
        ('② アクション', ['マナの続く限り任意:', '・スペル使用', '・攻撃（コスト消費）', '・回転90°（1体1回）']),
        ('③ 召喚', ['1体配置→ターン終了', '初回:任意 / 以降:隣接', '召喚ロック=4体以上']),
        ('④ リゾルブ', ['手札7チェック', '勝利判定']),
    ]
    yy = bt + 12
    for gt, subs in groups:
        set_text(FLOW); pdf.set_font('ipa','',8.5)
        pdf.set_xy(fx+3, yy); pdf.cell(fw-6, 4.5, gt); yy += 4.8
        set_text((96,100,112)); pdf.set_font('ipa','',7.5)
        for s in subs:
            pdf.set_xy(fx+6, yy); pdf.cell(fw-9, 4, s); yy += 4.0
        yy += 1.2

    # --- カードスロット (ウルト / 墓地 / デッキ) ---
    def card_slot(x, y, title, sub, accent):
        shadow(x, y, cw, ch)
        panel(x, y, cw, ch, fill=(255,255,255), draw=(226,229,236))
        header_strip(x, y, cw, title, accent, h=8)
        # 中央のカード配置ガイド
        set_draw((222,225,232)); pdf.set_line_width(0.3)
        gm = 6
        _dashed_rect(x+gm, y+16, cw-2*gm, ch-16-14)
        set_text((188,192,202)); pdf.set_font('ipa','',7)
        pdf.set_xy(x, y+ (ch+16-14)/2 +2); pdf.cell(cw, 5, 'カードを置く', align='C')
        if sub:
            set_text(SUB); pdf.set_font('ipa','',6.8)
            nlines = sub.count('\n') + 1
            pdf.set_xy(x+2, y+ch-3.4*nlines-2.5); pdf.multi_cell(cw-4, 3.4, sub, align='C')

    cy = bt
    card_slot(88,  cy, 'ウルト', 'デッキ外1枚 / 各陣営2枚から選択\nF6体以上・1ゲーム1回で解禁', ULT)
    card_slot(156, cy, '墓地', '撃破・使用済みカード', GRAVE)
    card_slot(224, cy, 'デッキ', '30枚 / 山札\n切れたら切り直して継続', DECK)

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
    'VP: クリーチャー撃破で獲得（コスト2以下→1点 / 3〜4→2点 / 5以上→3点）。自滅でもVP・マナは入る。\n'
    'マナ: 毎ターン+2、撃破でオーナー+1、上限なし。召喚/攻撃/回転/スペルに使用。')

# ターンの流れ
y = section(y+24, 'ターンの流れ')
set_text((40,40,40)); pdf.set_font('ipa','',10)
pdf.set_xy(14,y)
pdf.multi_cell(W-28,5,
    '① ドロー: カード1枚＋マナ2（先攻1ターン目はドローのみ無し＝マナ2は獲得）。\n'
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
