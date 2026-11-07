import sys; sys.path.insert(0,'/tmp/claude-0/w')
from boldfit import *
import pickle
SEG={'O-001':{0:['隙（','）からの攻撃時、攻撃+1']},
     'O-009':{0:['【飲酒】攻撃時、追加で霊力（','）2を消費す']},
     'T-008':{3:['・この式神の攻撃は隙（','）、反撃間合（','）を無視する。']}}
def refit(code):
    s,ls,rr=pickle.load(open(f'/tmp/claude-0/w/try/fit_{code}.pkl','rb'))
    A=np.array(S.text_only(code).getchannel('A')).astype(float)/255
    out=[]
    for i,(t,x,y) in enumerate(rr):
        if i not in SEG.get(code,{}): out.append((t,x,y)); continue
        cx=x
        for j,seg in enumerate(SEG[code][i]):
            rng=np.arange(cx-8,cx+8.01,.25) if j==0 else np.arange(cx,cx+70,.5)
            best=(1e18,)
            for x2 in rng:
                R=rline2(seg,s,x2,y,400,ls); y0=int(y-s*1.1); y1=int(y+s*.4)
                # only compare within the segment's own span
                xa=int(x2)-2; xb=int(x2+ImageFont.truetype(F%400,s).getlength(seg)+len(seg)*ls)+2
                e=np.abs(A[y0:y1,xa:xb]-R[y0:y1,xa:xb]).sum()-0.0
                if e<best[0]: best=(e,x2,xb)
            out.append((seg,best[1],y)); cx=best[2]+4
            print(code,i,seg,best[1])
    pickle.dump((s,ls,out),open(f'/tmp/claude-0/w/try/fit_{code}.pkl','wb'))
for c in SEG: refit(c)
