# 11/8 名入れ式神プランを式神ごとに9枚。見出し「名入れ式神プラン｜○○（限定1枠）」。型は compose_u.py(1108c)と同じ。
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
WK=os.path.dirname(os.path.abspath(__file__)); O=WK+'/../名入れ式神_9体_1108c/'; os.makedirs(O,exist_ok=True)
F='/mnt/project-files/cf-kv-1022/work/fonts/'
MIN=F+'ShipporiMinchoB1-ExtraBold.ttf'; GO=F+'BIZUDPGothic-Bold.ttf'
GOLD=(214,180,110); CREAM=(240,230,205); SUB=(215,205,180); RED=(235,120,110); WHITE=(248,244,234)
W,H=900,600
C='/mnt/project-files/supporter-cards-1107/04_裁ち線で切った版_PNG/支援者用_'
K=[('06','玖龍街',['T-008_玖龍街_祭りの夜']),('07','首引の姫鬼',['O-005_首引の姫鬼']),('08','影鬼',['O-001_影鬼']),('09','鎖鬼',['O-003_鎖鬼']),
   ('10','酒呑童子',['O-009_酒呑童子']),('11','茨木童子',['O-008_茨木童子_傘に縦書き']),('12','僵尸公主',['T-006_僵尸公主']),
   ('13','変面',['T-003_変面_仮面を顔に']),('14','灯籠の精',['T-001_灯籠の精_古燈籠'])]
# 卓だけの絵に、本体の絵から切り出した箱を小さくして札の左に置く。札は縦いっぱい。
BG=Image.open(f'{WK}/u_EMPTY.png').convert('RGB').resize((W,H),Image.LANCZOS)
_b=Image.open(f'{WK}/u_HONTAI.png').convert('RGB').resize((W,H),Image.LANCZOS).crop((430,48,881,527))
_k=0.62; _b=_b.resize((round(_b.width*_k),round(_b.height*_k)),Image.LANCZOS)
_m=Image.new('L',_b.size,0); ImageDraw.Draw(_m).rectangle((14,14,_b.width-14,_b.height-14),fill=255); _m=_m.filter(ImageFilter.GaussianBlur(8))
BOX=(_b,_m); BOXX,BOXY=282,298
x=np.linspace(1,0,W); a=np.zeros((H,W),np.float32); a[:]=np.clip((x-0.40)/0.60,0,1)**1.1*0.72
BG.paste(BOX[0],(BOXX,BOXY),BOX[1])
BG=Image.composite(Image.new('RGB',(W,H),(8,9,14)),BG,Image.fromarray((a*255).astype('uint8')))
def build(no,nm,cards):
    layers=[]
    def txt(label,lines,font,size,fill,xy,anchor='la',lh=1.4):
        L=Image.new('RGBA',(W,H),(0,0,0,0)); f=ImageFont.truetype(font,size)
        sh=Image.new('RGBA',(W,H),(0,0,0,0)); ds=ImageDraw.Draw(sh); d=ImageDraw.Draw(L)
        for i,t in enumerate(lines):
            yy=xy[1]+i*size*lh; ds.text((xy[0]+2,yy+2),t,font=f,fill=(0,0,0,210),anchor=anchor); d.text((xy[0],yy),t,font=f,fill=fill,anchor=anchor)
        layers.append((label,Image.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3)),L))); return len(lines)*size*lh
    Lc=Image.new('RGBA',(W,H),(0,0,0,0))
    pos=[(689,300,0,414)] if len(cards)==1 else [(600,306,-3,380),(694,300,0,410)]
    for f,(cx,cy,ang,cw) in zip(cards,pos):
        im=Image.open(C+f+'_1107_裁ち線で切った版.png').convert('RGBA'); im=im.resize((cw,round(1227*cw/866)),Image.LANCZOS)
        r=im.rotate(ang,resample=Image.BICUBIC,expand=True); x0=cx-r.width//2; y0=cy-r.height//2
        aa=Image.new('L',(W,H),0); aa.paste(r.split()[3].point(lambda q:int(q*.7)),(x0+8,y0+14)); s=Image.new('RGBA',(W,H),(0,0,0,0)); s.putalpha(aa.filter(ImageFilter.GaussianBlur(10)))
        Lc.alpha_composite(s); Lc.alpha_composite(r,(x0,y0))
    layers.append(('名入れの札(見本)',Lc))
    txt('見出し1',['名入れ式神プラン'],MIN,36,GOLD,(36,34),lh=1.2)
    tw=ImageFont.truetype(MIN,36).getlength('名入れ式神プラン'); Lb=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(Lb).rectangle((36+tw+12,40,36+tw+15,76),fill=GOLD+(255,)); layers.append(('見出し1_縦線',Lb))
    t2=f'{nm}（限定1枠）'; s2=46 if len(t2)<=10 else 42
    txt('見出し2_式神の名前',[t2],MIN,s2,GOLD,(34,82),lh=1.2)
    txt('値段',['18,000円'],MIN,40,WHITE,(39,150),lh=1.2)
    y=222
    y+=txt('本文1',['お名前入りの札が','初版の全セットに','入ります'],MIN,34,GOLD,(39,y),lh=1.3)+14
    y+=txt('本文2',['ゲーム本体一式と','ミラーデッキつき'],GO,30,CREAM,(39,y),lh=1.42)
    assert y<478,(nm,y)
    txt('赤の行',['送料込み'],MIN,36,RED,(39,480),lh=1.2)
    txt('注記_左下',['札は見本です。お名前の入る位置は式神ごとに異なります'],GO,16,SUB,(39,544),lh=1.2)
    txt('注記',['※試作のデザインです。製品版と異なる場合があります'],GO,15,(225,220,205),(39,572),'la')
    name=f'{no}_名入れ式神プラン_{nm}_限定1枠_1108c'
    comp=BG.convert('RGBA')
    for _,L in layers: comp=Image.alpha_composite(comp,L)
    comp.convert('RGB').save(f'{O}{name}.jpg',quality=93)
    psd=PSDImage.new('RGB',(W,H)); b=PixelLayer.frompil(BG.convert('RGBA'),psd,'bg',0,0); b.name='背景(文字なし)'; psd.append(b)
    for i,(lab,L) in enumerate(layers,1):
        bb=L.getchannel('A').getbbox(); pl=PixelLayer.frompil(L.crop(bb),psd,'L%d'%i,bb[1],bb[0]); pl.name=lab; psd.append(pl)
    psd.save(f'{O}{name}_レイヤー付き.psd'); print(name,int(y))
for k in K: build(*k)
