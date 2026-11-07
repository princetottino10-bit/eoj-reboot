import sys; sys.path.insert(0,'/tmp/claude-0/w')
from boldfit import *
import pickle, os
def boxes(T):
    q=np.array(T).astype(float); a=q[...,3]/255; rgb=q[...,:3]
    sat=rgb.max(2)-rgb.min(2); m=(sat>50)&(a>0.25)
    ys,xs=np.where(m); bx=[]
    for x,y in sorted(zip(xs,ys)):
        for b in bx:
            if b[0]-8<=x<=b[2]+8 and b[1]-20<=y<=b[3]+20:
                b[0]=min(b[0],x);b[1]=min(b[1],y);b[2]=max(b[2],x);b[3]=max(b[3],y);break
        else: bx.append([x,y,x,y])
    return [b for b in bx if b[2]-b[0]>=6]
def bold_text(code, cache='/tmp/claude-0/w/try/fit_%s.pkl'):
    T=S.text_only(code)
    p=cache%code
    if os.path.exists(p): s,ls,rr=pickle.load(open(p,'rb'))
    else:
        A,b=fit2(code); e,s,ls,rr=b; pickle.dump((s,ls,rr),open(p,'wb')); print(code,'fit',round(e),s,ls)
    R=np.clip(sum(rline2(t,s,x,y,700,ls) for t,x,y in rr),0,1)
    out=np.zeros((T.height,T.width,4)); out[...,:3]=255; out[...,3]=R*255
    q=np.array(T).astype(float)
    ic=[]
    for b in boxes(T):
        x0,y0,x1,y1=b[0]-3,b[1]-3,b[2]+4,b[3]+4
        if (b[2]-b[0])>2.2*(b[3]-b[1]): out[y0:y1,x0:x1]=q[y0:y1,x0:x1]   # 金の【】はそのまま
        else: ic.append((x0,y0,x1,y1))
    im=Image.fromarray(out.round().astype(np.uint8),'RGBA')
    for x0,y0,x1,y1 in ic:   # アイコンは元の画素を上に重ねる
        im.alpha_composite(T.crop((x0,y0,x1,y1)),(x0,y0))
    return im
if __name__=='__main__':
    for c in sys.argv[1:]:
        bold_text(c).save(f'/tmp/claude-0/w/try/bold_{c}.png')
