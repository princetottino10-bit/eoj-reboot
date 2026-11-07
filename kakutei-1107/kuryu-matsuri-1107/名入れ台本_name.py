"""飛空船の船体に名前を描き込む。usage: name.py <text> <font> <style:paint|neon> <out_prefix>"""
import sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage as nd
txt, font, style, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
SRC='/tmp/claude-0/k/fes/t2c/m3_5.png'
base=Image.open(SRC).convert('RGB'); W,H=base.size
# 船体: 中心・傾き・半長・半幅(960x1280 の座標)
CX,CY,ANG,A,B=700,345,-26,175,52
OFF=float(__import__("os").environ.get("OFF","-0.35"))      # 字の帯の中心(-は船体の上寄り。11/7 本人「もう少し上」で横腹の中心線へ)
SPAN=0.60     # 字の帯の高さ(見えている面の割合)
LMAX=215      # 字の帯の最大の長さ(px)
S=4           # 字は4倍で描く
# 1) 平らな字の帯を描く(u=横, v=縦)。書体にない字は Noto Serif JP で補う
from fontTools.ttLib import TTFont
SZ=200*S//4
f=ImageFont.truetype('/tmp/claude-0/k/fonts/'+font, SZ); cm=TTFont('/tmp/claude-0/k/fonts/'+font).getBestCmap()
fb=ImageFont.truetype('/tmp/claude-0/k/fonts/NotoSerifJP.ttf', SZ)
missing=[c for c in txt if ord(c) not in cm and not c.isspace()]
if missing: print('補った字:',''.join(missing))
asc,desc=f.getmetrics()
xs=[];x=0
for c in txt:
    ff=f if (ord(c) in cm or c.isspace()) else fb
    xs.append((c,ff,x)); x+=ff.getlength(c)
tw=int(x); th=asc+desc
pad=int(th*.35)
flat=Image.new('L',(tw+pad*2,th+pad*2),0); dr=ImageDraw.Draw(flat)
for c,ff,xx in xs: dr.text((pad+xx,pad+asc),c,font=ff,fill=255,anchor='ls')
# 字の上下の空きを詰める
_a=np.array(flat); rows=np.nonzero(_a.max(1))[0]; cols=np.nonzero(_a.max(0))[0]
flat=flat.crop((max(0,cols[0]-pad),max(0,rows[0]-pad),min(flat.width,cols[-1]+pad),min(flat.height,rows[-1]+pad)))
tw=flat.width-2*pad; th=flat.height-2*pad
fa=np.array(flat).astype(float)/255
# 縁取り
def grow(a,px): return nd.grey_dilation(a,size=(2*px+1,2*px+1)) if px>0 else a
k=max(2,int(th*.035))
outer=np.clip(nd.gaussian_filter(grow(fa,k),1.2),0,1)
dark=np.clip(nd.gaussian_filter(grow(fa,int(k*1.6)),2.5),0,1)
fh,fw=fa.shape
# 2) 船体の上下の輪郭(絵から測った折れ線)で、遠近つきの円筒として字を巻く
#    奥(機首=右上)ほど船体が細い分、字も小さく詰まる。字の縦線は各断面の向きに傾く
from scipy.interpolate import griddata
Z=lambda pts:np.array([(480+x/2,180+y/2) for x,y in pts],float)
TOP=Z([(160,480),(240,400),(330,322),(420,255),(520,195),(620,152),(700,138),(745,160)])
BOT=Z([(170,600),(290,562),(390,522),(480,470),(560,410),(640,340),(705,265),(745,195)])
def resample(p,n):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(p,axis=0).T))]; t=np.linspace(0,d[-1],n)
    return np.c_[np.interp(t,d,p[:,0]),np.interp(t,d,p[:,1])]
NT=600; T=resample(TOP,NT); Bo=resample(BOT,NT); tt=np.linspace(0,1,NT)
N0=OFF; T0,T1=0.10,0.86          # 字を置く範囲(船体の長さの割合)
wf=lambda n:(1+np.sin(np.clip(n,-1,1)*math.pi/2))/2
dloc=np.hypot(*(Bo-T).T)
C=(T+Bo)/2; ds=np.r_[0,np.hypot(*np.diff(C,axis=0).T)]
hn=SPAN
for _ in range(40):
    bandpx=dloc*(wf(N0+hn)-wf(N0-hn))
    X=np.cumsum(ds/np.maximum(bandpx,1))*th      # 字の帯の横の座標(帯の高さ=th)
    m=(tt>=T0)&(tt<=T1); avail=X[m][-1]-X[m][0]
    Lpx=np.interp(X[m][0]+tw,X,np.cumsum(ds))-np.cumsum(ds)[m][0]
    if tw<=avail and Lpx<=LMAX*1.15: break
    hn*=0.95
xc=(X[m][0]+X[m][-1])/2; X0=xc-tw/2
# 前向きの細かい網 -> 画素ごとの (帯の横, 帯の縦) を補間で求める
nn=np.linspace(-1,1,260)
TT,NN=np.meshgrid(np.arange(NT),nn,indexing='ij')
P=T[TT]+(Bo[TT]-T[TT])*wf(NN)[...,None]
FX=(X[TT]-X0)+pad; FY=((NN-N0)/hn+1)/2*th+pad
x0,y0=int(P[...,0].min())-2,int(P[...,1].min())-2; x1,y1=int(P[...,0].max())+3,int(P[...,1].max())+3
gy,gx=np.mgrid[y0:y1,x0:x1].astype(float)
pts=P.reshape(-1,2)
fx_l=griddata(pts,FX.ravel(),(gx,gy),method='linear')
fy_l=griddata(pts,FY.ravel(),(gx,gy),method='linear')
ph_l=griddata(pts,NN.ravel(),(gx,gy),method='linear')
yy,xx=np.mgrid[0:H,0:W]
fx=np.full((H,W),-1e4); fy=np.full((H,W),-1e4); vn=np.zeros((H,W))
fx[y0:y1,x0:x1]=np.nan_to_num(fx_l,nan=-1e4); fy[y0:y1,x0:x1]=np.nan_to_num(fy_l,nan=-1e4)
ph=np.zeros((H,W)); ph[y0:y1,x0:x1]=np.nan_to_num(ph_l,nan=0)
inside=np.zeros((H,W),bool); inside[y0:y1,x0:x1]=~np.isnan(ph_l)
vn=np.sin(ph*math.pi/2)
ok=inside
def samp(a):
    o=nd.map_coordinates(a,[fy,fx],order=1,mode='constant',cval=0); return np.where(ok,o,0)
A_f=samp(fa); A_o=samp(outer); A_d=samp(dark)
# 端に行くほど面が寝るので少し暗く・薄く
edge=np.clip(np.cos(np.arcsin(vn))**.6,0,1)
# 3) 船体の陰影を字に移す
img=np.array(base).astype(float)
lum=img.mean(-1)
sm=nd.gaussian_filter(lum,1.0); big=nd.gaussian_filter(lum,18)
ref=np.percentile(lum[inside],70)
shade=np.clip(sm/ref,0.35,1.25)
detail=np.clip(sm/(big+1),0.6,1.3)
rng=np.random.default_rng(1); grain=1+nd.gaussian_filter(rng.normal(0,1,(H,W)),0.8)*0.06
out_img=img.copy()
# ドロップシャドウ: 字(縁取りこみ)を右下へずらしてぼかした影を船体に落とす
SH_DX,SH_DY,SH_BLUR,SH_OP=3.0,4.0,2.2,float(__import__("os").environ.get("SHADOW","0"))  # 船の字の影は無し(11/7 本人: 影は札の文字のほう)
sh=nd.shift(np.maximum(A_o,A_f),(SH_DY,SH_DX),order=1)
sh=nd.gaussian_filter(sh,SH_BLUR)*inside*SH_OP
out_img=out_img*(1-sh[...,None])+np.array([18,8,8.])[None,None]*sh[...,None]
if style=='paint':
    red=np.array([178,30,26.]); gold=np.array([232,182,84.]); ink=np.array([40,14,10.])
    def lay(col,alpha):
        c=col[None,None]*shade[...,None]*detail[...,None]*grain[...,None]
        return c, alpha[...,None]
    for col,a,op in ((ink,A_d,.35),(gold,A_o,.95),(red,A_f,.95)):
        c,al=lay(col,a*edge*op); out_img=out_img*(1-al)+c*al
    # 提灯の照り返し(右下からの暖色のハイライト)を少し戻す
    hi=np.clip(sm-big,0,None)[...,None]*0.6*(A_o[...,None])
    out_img=out_img+hi
elif style=='neon':
    tube=np.array([120,255,235.]); core=np.array([235,255,250.])
    # 板(暗い帯)
    plate=np.clip(nd.gaussian_filter(samp(np.ones_like(fa))*0+A_d,6)*1.4,0,1)
    out_img=out_img*(1-0.0*plate[...,None])
    glow=nd.gaussian_filter(A_f,6)*1.6+nd.gaussian_filter(A_f,2)*.8
    out_img=out_img+tube[None,None]*np.clip(glow,0,1)[...,None]*0.55
    al=(A_f*edge)[...,None]; out_img=out_img*(1-al)+tube[None,None]*al
    thin=np.clip(nd.grey_erosion(A_f,size=(3,3)),0,1)[...,None]; out_img=out_img*(1-thin*.8)+core[None,None]*thin*.8
res=Image.fromarray(np.clip(out_img,0,255).astype(np.uint8))
res.save(out+'_art.png')
# 名前だけの層(透過)
diff=np.abs(out_img-img).max(-1); a=np.clip(diff/40,0,1)
lay=np.dstack([np.clip(out_img,0,255),a*255]).astype(np.uint8)
Image.fromarray(lay,'RGBA').save(out+'_layer.png')
res.crop((480,180,920,500)).resize((880,640),Image.LANCZOS).save(out+'_zoom.png')
