# 11/8 りるさんのKVを直す: 盤面をはっきり見せる・読めない小さな字を外す・「箱ひとつで遊べる」を大きく・新ロゴへ。
import os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
WK=os.path.dirname(os.path.abspath(__file__)); O=WK+'/../'
F='/mnt/project-files/cf-kv-1022/work/fonts/'
MIN=F+'ShipporiMinchoB1-ExtraBold.ttf'; GO=F+'BIZUDPGothic-Bold.ttf'
GOLD=(226,192,120); CREAM=(246,236,212)
SRC=Image.open(O+'src/りるさんKV_元_旧ロゴ.png').convert('RGBA'); W,H=SRC.size
BOARD=Image.open('/mnt/project-files/board-cards-1108/九宮盤_札を置いた様子_1108.png').convert('RGBA').crop((35,297,1225,1485))
LOGO=Image.open('/mnt/project-files/logo-1108/src/式神白ロゴ初稿透過.png').convert('RGBA').crop((102,135,3344,2322))
def coeffs(dst,src):
    A=[];B=[]
    for (x,y),(u,v) in zip(dst,src):
        A+= [[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]; B+=[u,v]
    return np.linalg.solve(np.array(A,float),np.array(B,float)).tolist()
def lay(): return Image.new('RGBA',(W,H),(0,0,0,0))
def font(p,s): return ImageFont.truetype(p,s)
layers=[]
# 1 左下の暗がり(旧ロゴ・旧肩書き・小さな字を消す)
yy,xx=np.mgrid[0:H,0:W].astype(float)
a=np.clip((yy-572)/30,0,1)*np.clip((830-xx)/130,0,1)
L=np.zeros((H,W,4),np.uint8); L[...,0:3]=(10,10,15); L[...,3]=(a*255).astype(np.uint8)
layers.append(('左下の暗がり(旧ロゴと小さな字を消す)',Image.fromarray(L)))
# 2 九宮盤(本物の盤と札を斜めから)
TL,TR,BR,BL=(700,700),(1418,700),(1600,1140),(560,1140)
bw,bh=BOARD.size
big=BOARD.resize((bw*2,bh*2),Image.LANCZOS)
c=coeffs([TL,TR,BR,BL],[(0,0),(bw*2,0),(bw*2,bh*2),(0,bh*2)])
pb=big.transform((W,H),Image.PERSPECTIVE,c,Image.BICUBIC)
m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon([TL,TR,BR,BL],fill=255); pb.putalpha(Image.fromarray(np.minimum(np.asarray(pb)[...,3],np.asarray(m))))
glow=lay(); g=Image.new('L',(W,H),0); ImageDraw.Draw(g).polygon([TL,TR,BR,BL],outline=255,width=6)
g=g.filter(ImageFilter.GaussianBlur(10)); glow.putalpha(g.point(lambda v:min(255,v*2))); glow=Image.composite(Image.new('RGBA',(W,H),(90,230,220,255)),glow,g.point(lambda v:min(255,v*2)))
sh=Image.new('L',(W,H),0); ImageDraw.Draw(sh).polygon([(x-14,y+18) for x,y in [TL,TR,BR,BL]],fill=200); sh=sh.filter(ImageFilter.GaussianBlur(18))
S=lay(); S.putalpha(sh)
layers.append(('盤の影',S)); layers.append(('盤のふちの光',glow)); layers.append(('九宮盤と札(本物)',pb))
# 3 新ロゴ
lh=200; lg=LOGO.resize((round(LOGO.width*lh/LOGO.height),lh),Image.LANCZOS)
Lg=lay(); Lg.alpha_composite(lg,(52,590)); layers.append(('題字ロゴ(新ロゴ)',Lg))
def text_layer(items):
    T=lay(); d=ImageDraw.Draw(T)
    for x,y,s,f,col,anc in items:
        sw=lay(); ImageDraw.Draw(sw).text((x,y),s,font=f,fill=(0,0,0,230),anchor=anc,stroke_width=4,stroke_fill=(0,0,0,230))
        T.alpha_composite(sw.filter(ImageFilter.GaussianBlur(3)))
        d=ImageDraw.Draw(T); d.text((x,y),s,font=f,fill=col,anchor=anc)
    return T
cx=300
layers.append(('肩書き',text_layer([(cx,812,'式神召喚タクティカルカードゲーム',font(GO,30),CREAM,'mm')])))
# 4 「箱ひとつで遊べる」の札
B=lay(); d=ImageDraw.Draw(B)
box=(40,856,560,1030)
d.rounded_rectangle(box,18,fill=(12,12,18,235),outline=GOLD+(255,),width=3)
d.rounded_rectangle((box[0]+8,box[1]+8,box[2]-8,box[3]-8),12,outline=GOLD+(110,),width=1)
B.alpha_composite(text_layer([(cx,918,'箱ひとつで遊べる',font(MIN,64),GOLD,'mm'),
                              (cx,985,'カードの買い足しなし｜2人対戦｜30〜40分',font(GO,25),CREAM,'mm')]))
layers.append(('箱ひとつで遊べる',B))
layers.append(('注記',text_layer([(W-24,H-20,'※試作のデザインです。製品版と異なる場合があります',font(GO,20),(235,230,220),'rs')])))
comp=SRC.copy()
for _,l in layers: comp.alpha_composite(l)
name='KV_りるさん_盤と箱ひとつ_新ロゴ_1108'
comp.convert('RGB').save(O+name+'.jpg',quality=93)
ld=O+name+'_層'; os.makedirs(ld,exist_ok=True); SRC.save(ld+'/00_元の絵(りるさん).png')
psd=PSDImage.new('RGB',(W,H)); p=PixelLayer.frompil(SRC,psd,'bg',0,0); p.name='元の絵(りるさん)'; psd.append(p)
for i,(nm,l) in enumerate(layers,1):
    l.save(f'{ld}/{i:02d}_{nm}.png'); b=l.getbbox(); p=PixelLayer.frompil(l.crop(b),psd,'x',b[1],b[0]); p.name=nm; psd.append(p)
psd.save(O+name+'_レイヤー付き.psd'); print('ok')
