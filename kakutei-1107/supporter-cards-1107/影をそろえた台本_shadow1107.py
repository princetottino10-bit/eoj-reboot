"""効果文の影を指定仕様(2層)に統一する。
CSS: 0 1px 2px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,.6)
350dpiの札で 1 CSS px = 350/96 px。ぼかし半径 r は sigma = r/2。
"""
import numpy as np, sys, os
from PIL import Image, ImageFilter
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from psd_tools.psd.tagged_blocks import TaggedBlocks
from psd_tools.constants import Tag
sys.path.insert(0, '/tmp/claude-0/w')
import build as B

K = 350/96
W, H = 948, 1309
SRC = '/mnt/project-files/supporter-cards-1107/'
OUT = '/tmp/claude-0/w/sh/'
E = '/tmp/claude-0/w/support-text-1106/03_効果文だけ_透明PNG/'
KU = '/mnt/project-files/kuryu-matsuri-1105/納品_祭り_1106/部品_11_効果文_白文字と影.png'
OVR = {'T-003': E+'T-003_変面_11_効果文_白文字と影_1106.png',
       'O-005': E+'O-005_首引の姫鬼_11_効果文_白文字と影_1106.png',
       'T-008': KU}
PART = {'O-001': 'O-001_影鬼', 'O-008': 'O-008_茨木童子', 'O-009': 'O-009_酒呑童子',
        'T-001': 'T-001_灯籠の精', 'T-006': 'T-006_僵尸公主'}


def unmix(path):
    """白文字(+金の【】)と黒い影が焼き込まれた層から、文字だけを取り出す。アイコンは元のまま。"""
    q = np.array(Image.open(path).convert('RGBA')).astype(float)
    a = q[..., 3]/255; rgb = q[..., :3]
    sat = rgb.max(2)-rgb.min(2); maxc = rgb.max(2)
    # アイコン: 彩度が高く金色でない画素のかたまり(金 F2C46B の色相を除く)
    hue_gold = (np.abs(rgb[..., 0]-242) < 40) & (np.abs(rgb[..., 1]-196) < 45) & (np.abs(rgb[..., 2]-107) < 60)
    ic = (sat > 60) & (a > .5) & ~hue_gold
    keep = np.zeros_like(ic)
    ys, xs = np.where(ic)
    if len(ys):
        # 列方向でまとまりに分け、それぞれの外接箱を元のまま残す
        lab = np.zeros_like(ic, int); boxes = []
        pts = sorted(zip(xs, ys))
        for x, y in pts:
            for b in boxes:
                if b[0]-6 <= x <= b[2]+6 and b[1]-30 <= y <= b[3]+30:
                    b[0] = min(b[0], x); b[1] = min(b[1], y); b[2] = max(b[2], x); b[3] = max(b[3], y); break
            else:
                boxes.append([x, y, x, y])
        for b in boxes:
            if (b[2]-b[0]) >= 12 and (b[3]-b[1]) >= 12:
                keep[b[1]-2:b[3]+3, b[0]-2:b[2]+3] = True
    tmax = np.where(sat > 60, 242.0, 255.0)
    ta = np.clip(a*maxc/tmax, 0, 1)
    col = np.where(ta[..., None] > 0, np.clip(rgb*a[..., None]/np.maximum(ta[..., None], 1e-6), 0, 255), 0)
    out = np.zeros_like(q)
    out[..., :3] = col; out[..., 3] = ta*255
    out[keep] = q[keep]
    return Image.fromarray(out.round().astype(np.uint8), 'RGBA')


def text_only(code):
    if code in OVR:
        return unmix(OVR[code])
    # build.white_effect は影付きを返すので、影を付ける前の層を作り直す
    orig = B.shadowed
    B.shadowed = lambda rgba, **k: rgba
    try:
        t, _, _ = B.white_effect(PART[code])
    finally:
        B.shadowed = orig
    return t


def shadow_layers(text):
    A = text.getchannel('A')
    def sh(dy, r_css, op):
        s = A
        if dy:
            s = A.transform(A.size, Image.AFFINE, (1, 0, 0, 0, 1, -dy*K), resample=Image.BILINEAR)
        s = s.filter(ImageFilter.GaussianBlur(r_css*K/2))
        L = Image.new('RGBA', A.size, (0, 0, 0, 0)); L.putalpha(s)
        return L, op
    return sh(0, 4, 0.60), sh(1, 2, 0.90)


def read_layers(path):
    p = PSDImage.open(path)
    out = []
    for l in p:
        im = Image.new('RGBA', p.size, (0, 0, 0, 0))
        im.alpha_composite(l.topil().convert('RGBA'), (l.left, l.top))
        out.append([l.name, im, l.visible, 1.0])
    return p.size, out


def flatten(size, layers):
    c = np.zeros((size[1], size[0], 4))
    for n, L, v, op in layers:
        if not v: continue
        s = np.array(L).astype(float)/255; sa = s[..., 3:]*op
        da = c[..., 3:]
        oa = sa+da*(1-sa)
        c[..., :3] = np.where(oa > 0, (s[..., :3]*sa+c[..., :3]*da*(1-sa))/np.maximum(oa, 1e-9), 0)
        c[..., 3:] = oa
    return Image.fromarray((c*255).round().astype(np.uint8), 'RGBA')


def write_psd(size, layers, path):
    psd = PSDImage.new('RGBA', size)
    for name, L, vis, op in layers:
        bb = L.getbbox()
        if not bb: continue
        pl = PixelLayer.frompil(L.crop(bb), psd, name, bb[1], bb[0])
        pl.visible = vis; pl.opacity = round(op*255)
        rec = pl._record
        if rec.tagged_blocks is None: rec.tagged_blocks = TaggedBlocks()
        rec.tagged_blocks.set_data(Tag.UNICODE_LAYER_NAME, name)
        psd.append(pl)
    for i, l in enumerate(psd): l._record.name = 'L%02d' % i
    psd.save(path)


def replace_effect(layers, text, dx=0, dy=0):
    (s2, o2), (s1, o1) = shadow_layers(text)
    def sh(im):
        if dx or dy:
            c = Image.new('RGBA', layers[0][1].size, (0, 0, 0, 0)); c.alpha_composite(im.crop((dx, dy, dx+c.width, dy+c.height))); return c
        return im
    out = []
    for n, L, v, op in layers:
        if n.startswith('11_効果文'):
            out += [['11a_効果文の影_外側(0 0 4px 黒60%)', sh(s2), True, o2],
                    ['11b_効果文の影_内側(0 1px 2px 黒90%)', sh(s1), True, o1],
                    ['11c_効果文_白文字(影なし)', sh(text), True, 1.0]]
        else:
            out.append([n, L, v, op])
    return out


if __name__ == '__main__':
    for d in ['01_完成_印刷用(裁ち落とし込み)', '02_編集用_PSD', '04_裁ち線で切った版_PNG', '05_裁ち線で切った版_PSD', '06_絵の枠で切った版_PNG']:
        os.makedirs(OUT+d, exist_ok=True)
    for f in sorted(os.listdir(SRC+'02_編集用_PSD')):
        stem = f[:-4]; code = stem.split('_')[1]
        text = text_only(code)
        # 印刷用(裁ち落とし込み)
        size, L = read_layers(SRC+'02_編集用_PSD/'+f)
        L2 = replace_effect(L, text)
        write_psd(size, L2, OUT+'02_編集用_PSD/'+f)
        full = flatten(size, L2)
        full.save(OUT+'01_完成_印刷用(裁ち落とし込み)/'+stem+'.png', dpi=(350, 350))
        # 裁ち線で切った版(元の角丸の形をそのまま使う)
        cs, CL = read_layers(SRC+'05_裁ち線で切った版_PSD/'+stem+'_裁ち線で切った版.psd')
        CL2 = replace_effect(CL, text, 41, 41)
        # 角丸は各層に掛かっているので、効果文の層にも掛ける
        m = np.array(Image.open(SRC+'04_裁ち線で切った版_PNG/'+stem+'_裁ち線で切った版.png').getchannel('A')).astype(float)/255
        for x in CL2:
            if x[0].startswith('11'):
                q = np.array(x[1]).astype(float); q[..., 3] *= m; x[1] = Image.fromarray(q.round().astype(np.uint8))
        write_psd(cs, CL2, OUT+'05_裁ち線で切った版_PSD/'+stem+'_裁ち線で切った版.psd')
        flatten(cs, CL2).save(OUT+'04_裁ち線で切った版_PNG/'+stem+'_裁ち線で切った版.png', dpi=(350, 350))
        # 絵の枠で切った版
        old6 = Image.open(SRC+'06_絵の枠で切った版_PNG/'+stem+'_絵の枠で切った版.png')
        c6 = full.crop((69, 69, 69+old6.width, 69+old6.height))
        a6 = np.minimum(np.array(c6.getchannel('A')), np.array(old6.getchannel('A')))
        c6.putalpha(Image.fromarray(a6)); c6.save(OUT+'06_絵の枠で切った版_PNG/'+stem+'_絵の枠で切った版.png', dpi=(350, 350))
        print(stem)
