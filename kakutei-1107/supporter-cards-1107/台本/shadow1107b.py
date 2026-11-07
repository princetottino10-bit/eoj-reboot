"""11/7 改: 見本に寄せて効果文を読みやすくする。
- 白い効果文を同じ書体(BIZ UDゴシック)の太字に。位置・大きさ・字送りは元と同じ。金の【】とアイコンは元のまま。
- 影は字の際に締めた濃い影と、少し広げた外側の影の2層(全札同じ設定)。
"""
import sys, os, numpy as np
sys.path.insert(0,'/tmp/claude-0/w')
import shadow1107 as S
from PIL import Image, ImageFilter
from fixL import fixL
D=948/558   # 札を画面で幅558pxほどで見たときの1px
def shadow_layers(text):
    A=text.getchannel('A')
    def L_(sp,sig,dy):
        s=A
        if sp: s=s.filter(ImageFilter.MaxFilter(2*sp+1))
        if dy: s=s.transform(s.size,Image.AFFINE,(1,0,0,0,1,-dy),resample=Image.BILINEAR)
        s=s.filter(ImageFilter.GaussianBlur(sig)); o=Image.new('RGBA',A.size,(0,0,0,0)); o.putalpha(s); return o
    return (L_(5,8,0),0.85),(L_(0,D,D),0.95)
S.shadow_layers=shadow_layers
N_OUT='11a_効果文の影_外側(広め・黒85%)'; N_IN='11b_効果文の影_内側(下に少し・黒95%)'; N_TX='11c_効果文_白文字_太字(影なし)'
_orig=S.replace_effect
def replace_effect(layers,text,dx=0,dy=0):
    out=_orig(layers,text,dx,dy)
    for x in out:
        if x[0].startswith('11a_'): x[0]=N_OUT
        elif x[0].startswith('11b_'): x[0]=N_IN
        elif x[0].startswith('11c_'): x[0]=N_TX
    return out
SRC=S.SRC; OUT='/tmp/claude-0/w/sh2/'
def bold(code): return Image.open(f'/tmp/claude-0/w/try/bold_{code}.png')
if __name__=='__main__':
    for d in ['01_完成_印刷用(裁ち落とし込み)','02_編集用_PSD','04_裁ち線で切った版_PNG','05_裁ち線で切った版_PSD','06_絵の枠で切った版_PNG']:
        os.makedirs(OUT+d,exist_ok=True)
    for f in sorted(os.listdir(SRC+'02_編集用_PSD')):
        stem=f[:-4]; code=stem.split('_')[1]; text=bold(code)
        size,L=S.read_layers(SRC+'02_編集用_PSD/'+f); L2=replace_effect(fixL(L),text)
        S.write_psd(size,L2,OUT+'02_編集用_PSD/'+f); full=S.flatten(size,L2)
        full.save(OUT+'01_完成_印刷用(裁ち落とし込み)/'+stem+'.png',dpi=(350,350))
        cs,CL=S.read_layers(SRC+'05_裁ち線で切った版_PSD/'+stem+'_裁ち線で切った版.psd')
        CL2=replace_effect(fixL(CL),text,41,41)
        m=np.array(Image.open(SRC+'04_裁ち線で切った版_PNG/'+stem+'_裁ち線で切った版.png').getchannel('A')).astype(float)/255
        for x in CL2:
            if x[0].startswith('11'):
                q=np.array(x[1]).astype(float); q[...,3]*=m; x[1]=Image.fromarray(q.round().astype(np.uint8))
        S.write_psd(cs,CL2,OUT+'05_裁ち線で切った版_PSD/'+stem+'_裁ち線で切った版.psd')
        S.flatten(cs,CL2).save(OUT+'04_裁ち線で切った版_PNG/'+stem+'_裁ち線で切った版.png',dpi=(350,350))
        old6=Image.open(SRC+'06_絵の枠で切った版_PNG/'+stem+'_絵の枠で切った版.png')
        c6=full.crop((69,69,69+old6.width,69+old6.height))
        a6=np.minimum(np.array(c6.getchannel('A')),np.array(old6.getchannel('A'))); c6.putalpha(Image.fromarray(a6))
        c6.save(OUT+'06_絵の枠で切った版_PNG/'+stem+'_絵の枠で切った版.png',dpi=(350,350)); print(stem)
    # 変面・姫鬼の支援者用(1106)
    os.makedirs(OUT+'1106/01',exist_ok=True); os.makedirs(OUT+'1106/02',exist_ok=True)
    for f,c in [('支援者用_変面_楽屋の絵_白文字_1106','T-003'),('支援者用_銘入れ姫鬼_白文字_1106','O-005')]:
        size,L=S.read_layers('/tmp/claude-0/w/sh1106/02/'+f+'.psd'); L2=replace_effect(fixL(L),bold(c))
        S.write_psd(size,L2,OUT+'1106/02/'+f+'.psd'); S.flatten(size,L2).save(OUT+'1106/01/'+f+'.png',dpi=(350,350)); print(f)
