import sys; sys.path.insert(0,'/tmp/claude-0/w')
import numpy as np, shadow1107 as S, time
from PIL import Image, ImageDraw, ImageFont
SMIN,SMAX=30,38.01
F='/tmp/claude-0/w/fonts2/BIZUDGothic-%d.ttf'
exec(open('/tmp/claude-0/w/lines.py').read())
def rline(t,size,x,y,w,W=948,H=1309,band=None):
    im=Image.new('L',(W,H),0); d=ImageDraw.Draw(im)
    d.text((x,y),t,font=ImageFont.truetype(F%w,size),fill=255,anchor='ls')
    return np.array(im).astype(float)/255
def segs_of(A):
    rows=np.where(A.max(1)>0.3)[0]; segs=[]; s0=rows[0]; pv=rows[0]
    for r in rows[1:]:
        if r-pv>3: segs.append((s0,pv)); s0=r
        pv=r
    segs.append((s0,pv)); return segs
def err(A,t,size,x,y):
    R=rline(t,size,x,y,400); y0=int(y-size*1.1); y1=int(y+size*0.4)
    return np.abs(A[y0:y1]-R[y0:y1]).sum()
def fit(code):
    t=S.text_only(code); A=np.array(t.getchannel('A')).astype(float)/255
    L=LINES[code]; segs=segs_of(A); assert len(segs)==len(L),(code,segs)
    # size from first line
    t0=L[0]; (a,b)=segs[0]
    best=(1e18,)
    for size in np.arange(SMIN,SMAX,0.5):
        for x in np.arange(98,108.01,1):
            for y in np.arange(b-8,b+4.01,1):
                e=err(A,t0,size,x,y)
                if e<best[0]: best=(e,size,x,y)
    e,size,x,y=best
    for s2 in np.arange(size-.5,size+.51,.125):
      for x2 in np.arange(x-1,x+1.01,.25):
        for y2 in np.arange(y-1,y+1.01,.25):
            e2=err(A,t0,s2,x2,y2)
            if e2<best[0]: best=(e2,s2,x2,y2)
    _,size,x,y=best; res=[(L[0],x,y,best[0])]
    for t_,(a,b) in zip(L[1:],segs[1:]):
        bb=(1e18,)
        for x2 in np.arange(x-3,x+3.01,.25):
            for y2 in np.arange(b-8,b+4.01,.25):
                e2=err(A,t_,size,x2,y2)
                if e2<bb[0]: bb=(e2,x2,y2)
        res.append((t_,bb[1],bb[2],bb[0]))
    return A,size,res
if __name__=='__main__':
    for c in sys.argv[1:]:
        A,size,res=fit(c); print(c,size,[(round(x,2),round(y,2),round(e)) for _,x,y,e in res], 'ink',round(A.sum()))

def rline2(t,size,x,y,w,ls=0.0,W=948,H=1309):
    im=Image.new('L',(W,H),0); d=ImageDraw.Draw(im); f=ImageFont.truetype(F%w,size)
    cx=x
    for ch in t:
        d.text((cx,y),ch,font=f,fill=255,anchor='ls'); cx+=f.getlength(ch)+ls
    return np.array(im).astype(float)/255
def fit2(code, grid=True):
    A,size,res=fit(code)
    best=None
    for s2 in np.arange(size-.75,size+.76,.125):
        for ls in np.arange(-0.5,1.01,0.125):
            e=0; rr=[]
            for t,x,y,_ in res:
                bx=(1e18,)
                for x2 in np.arange(x-1.5,x+1.51,.5):
                    R=rline2(t,s2,x2,y,400,ls); y0=int(y-s2*1.1); y1=int(y+s2*.4)
                    ee=np.abs(A[y0:y1]-R[y0:y1]).sum()
                    if ee<bx[0]: bx=(ee,x2)
                e+=bx[0]; rr.append((t,bx[1],y))
            if best is None or e<best[0]: best=(e,s2,ls,rr)
    return A,best
