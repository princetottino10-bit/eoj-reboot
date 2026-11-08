# 11/8 CFメイン画像(3:2)を今のCFと同じ要領で: 箱絵の2人の絵の上に、直したKVの小窓と札1枚を重ねる。
import os
from PIL import Image, ImageDraw, ImageFilter
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
O='/mnt/project-files/kv-rill-1108/main/'
W,H=1500,1000
art=Image.open('/mnt/project-files/cf-final-1105/式神符陣_CF素材_1105/03_編集用_層PNG/仮の箱絵_A5横_新ロゴ_1108/00_背景_文字なし.png').convert('RGB')
bg=art.crop((230,190,230+1731,190+1154)).resize((W,H),Image.LANCZOS).convert('RGBA')
def lay(): return Image.new('RGBA',(W,H),(0,0,0,0))
def shadow(alpha,dx,dy,blur,op):
    s=lay(); a=Image.new('L',(W,H),0); a.paste(alpha.point(lambda q:int(q*op)),(dx,dy)); s.putalpha(a.filter(ImageFilter.GaussianBlur(blur))); return s
layers=[]
# KVの小窓(白い縁・角丸)
kv=Image.open('/mnt/project-files/kv-rill-1108/KV_りるさん_盤と箱ひとつ_新ロゴ_1108.jpg').convert('RGBA')
kw=446; kh=round(kv.height*kw/kv.width); kv=kv.resize((kw,kh),Image.LANCZOS); b=9; r=16; Q=4
fr=Image.new('RGBA',(kw+2*b,kh+2*b),(0,0,0,0))
m=Image.new('L',(fr.width*Q,fr.height*Q),0); ImageDraw.Draw(m).rounded_rectangle((0,0,fr.width*Q-1,fr.height*Q-1),r*Q,fill=255); m=m.resize(fr.size,Image.LANCZOS)
fr.paste((250,247,240,255),(0,0),m)
mi=Image.new('L',(kw*Q,kh*Q),0); ImageDraw.Draw(mi).rounded_rectangle((0,0,kw*Q-1,kh*Q-1),(r-5)*Q,fill=255); fr.paste(kv,(b,b),mi.resize((kw,kh),Image.LANCZOS))
x0,y0=46,H-fr.height-30
L=lay(); a=Image.new('L',(W,H),0); a.paste(fr.split()[3],(x0,y0))
L.alpha_composite(shadow(a,6,12,14,.75)); L.alpha_composite(fr,(x0,y0)); layers.append(('KVの小窓',L))
# 札1枚(首引の姫鬼・裁ち線で切った版)
c=Image.open('/mnt/project-files/support-text-1106/01_完成_印刷用(裁ち落とし込み)/札_首引の姫鬼_効果文1106.png').convert('RGBA').crop((41,41,907,1268))
m=Image.new('L',(866*Q,1227*Q),0); ImageDraw.Draw(m).rounded_rectangle((0,0,866*Q-1,1227*Q-1),41*Q,fill=255); c.putalpha(m.resize((866,1227),Image.LANCZOS))
cw=196; c=c.resize((cw,round(1227*cw/866)),Image.LANCZOS).rotate(-8,resample=Image.BICUBIC,expand=True)
cx,cy=x0+fr.width-42,H-c.height-26
L=lay(); a=Image.new('L',(W,H),0); a.paste(c.split()[3],(cx,cy))
L.alpha_composite(shadow(a,8,14,14,.75)); L.alpha_composite(c,(cx,cy)); layers.append(('札_首引の姫鬼',L))
comp=bg.copy()
for _,l in layers: comp.alpha_composite(l)
name='CFメイン画像_KV小窓_新ロゴ_1108'
comp.convert('RGB').save(O+name+'.jpg',quality=93)
psd=PSDImage.new('RGB',(W,H)); p=PixelLayer.frompil(bg,psd,'bg',0,0); p.name='背景(箱絵の2人)'; psd.append(p)
for nm,l in layers:
    bb=l.getbbox(); p=PixelLayer.frompil(l.crop(bb),psd,'x',bb[1],bb[0]); p.name=nm; psd.append(p)
psd.save(O+name+'_レイヤー付き.psd'); print('ok',cx,cy,fr.size)
