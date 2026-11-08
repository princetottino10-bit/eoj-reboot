# 11/8 リターン6プランを1つの型にそろえた版(1108b)。背景・文字の位置と大きさ・絵の置き場を全部同じにした。
# 絵は scene_u.html(どのプランも同じ光・同じカメラの向き・同じ置き場)で描いた u_{v}.png。値段・中身はCFページのまま。
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
WK=os.path.dirname(os.path.abspath(__file__)); O=WK+'/../'
F='/mnt/project-files/cf-kv-1022/work/fonts/'
MIN=F+'ShipporiMinchoB1-ExtraBold.ttf'; GO=F+'BIZUDPGothic-Bold.ttf'
GOLD=(214,180,110); CREAM=(240,230,205); SUB=(215,205,180); RED=(235,120,110); WHITE=(248,244,234)
W,H=900,600
# (ファイル名, 見出し, 値段, [(種類, 行)], 赤の行, 左下の注記)
P={'OUEN':('応援','応援プラン','2,000円',[('main',['お名前を説明書の','スペシャルサンクスに']),('gold',['調整機能付きの','ブラウザ版で遊べます']),('main',['2027年6月末まで'])],'ゲーム本体は含みません','お名前は見本、画面は開発中の調整版です'),
 'KAIJO':('会場受取_本体','会場受取プラン','5,500円',[('gold',['ゲーム本体一式を']),('main',['ゲームマーケット','2027春の会場で','お渡しします'])],'送料なし(500円引き)','当日来場できない場合は、着払いでお送りします'),
 'KAIJO2':('会場受取_本体とミラー','会場受取プラン','7,500円',[('gold',['ゲーム本体一式と','ミラーデッキを']),('main',['ゲームマーケット','2027春の会場で','お渡しします'])],'送料なし(500円引き)','当日来場できない場合は、着払いでお送りします'),
 'HONTAI':('本体','本体プラン','6,000円',[('gold',['ゲーム本体一式']),('main',['一門デッキ×4・九宮盤','コマ・説明書']),('main',['ご自宅にお届け'])],'送料込み',None),
 'MDECK':('ミラーデッキ','ミラーデッキ','2,000円',[('gold',['2P用の一門デッキ×4']),('main',['本体と合わせて','同じ一門どうしでも','対戦できます']),('main',['ゲーム本体は含みません'])],'送料込み',None),
 'MIRROR':('ミラー対戦','ミラー対戦プラン','8,000円',[('main',['ゲーム本体一式に']),('gold',['ミラーデッキつき']),('main',['2P用の一門デッキ×4で','同じ一門どうしでも','対戦できます'])],'送料込み',None),
 'B3':('2セット','2セットプラン','11,000円',[('main',['自分の分と、','ご友人の分を。']),('gold',['ゲーム本体一式を','計2セット']),('main',['まとめてお届け'])],'送料込み・1,000円引き',None),
 'MEIIRE':('名入れ式神','名入れ式神プラン','18,000円',[('gold',['お名前入りの札が','初版の全セットに','入ります']),('main',['ゲーム本体一式と','ミラーデッキつき'])],'送料込み・各1枠','札は見本です。お名前が入るのは、選んだリターンの式神です')}
LABEL={'OUEN':'応援プラン','KAIJO':'会場受取プラン(本体)','KAIJO2':'会場受取プラン(本体+ミラーデッキ)','HONTAI':'本体プラン','MDECK':'ミラーデッキ','MIRROR':'ミラー対戦プラン(本体+ミラーデッキ)','B3':'2セットプラン','MEIIRE':'名入れ式神プラン(本体+ミラーデッキ)'}
RENDER={'KAIJO':'HONTAI','KAIJO2':'MIRROR','MDECK':'EMPTY'}
STY={'main':(GO,30,CREAM,1.42),'gold':(MIN,34,GOLD,1.3)}
def build(v,naiyou=False):
    fn,title,price,blocks,red,foot=P[v]
    bg=Image.open(f'{WK}/u_{RENDER.get(v,v)}.png').convert('RGB').resize((W,H),Image.LANCZOS)
    x=np.linspace(1,0,W); a=np.zeros((H,W),np.float32); a[:]=np.clip((x-0.45)/0.55,0,1)**1.2*0.65
    bg=Image.composite(Image.new('RGB',(W,H),(8,9,14)),bg,Image.fromarray((a*255).astype('uint8')))
    layers=[]; listing=[]
    def txt(label,lines,font,size,fill,xy,anchor='la',lh=1.4):
        L=Image.new('RGBA',(W,H),(0,0,0,0)); f=ImageFont.truetype(font,size)
        sh=Image.new('RGBA',(W,H),(0,0,0,0)); ds=ImageDraw.Draw(sh); d=ImageDraw.Draw(L)
        for i,t in enumerate(lines):
            yy=xy[1]+i*size*lh; ds.text((xy[0]+2,yy+2),t,font=f,fill=(0,0,0,210),anchor=anchor); d.text((xy[0],yy),t,font=f,fill=fill,anchor=anchor)
        L=Image.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3)),L); layers.append((label,L))
        bb=L.getchannel('A').getbbox(); fnm='しっぽり明朝 B1 太字' if font==MIN else 'BIZ UDPゴシック 太字'
        listing.append(f'{len(listing)+1:02d} 層「{label}」  範囲 左上({bb[0]},{bb[1]})〜右下({bb[2]},{bb[3]})\n    書体 {fnm} / 大きさ {size}px / 色 #{fill[0]:02X}{fill[1]:02X}{fill[2]:02X}\n    文字: '+' | '.join(lines))
        return len(lines)*size*lh
    # 絵の上に足す物(スマホ・札)
    if v=='OUEN':
        SC=Image.open('/mnt/project-files/cf-2set-1107/work/tex/phone_adj.jpg').convert('RGB')
        sc=SC.crop((0,918,1170,2532)); sw=196; sh_=round(sc.height*sw/sc.width); Q=3; bez=7
        PW,PH=sw+bez*2,sh_+bez*2; bx0,by0=668,170
        ph=Image.new('RGBA',(PW*Q,PH*Q),(0,0,0,0)); dp=ImageDraw.Draw(ph)
        dp.rounded_rectangle((0,0,PW*Q-1,PH*Q-1),radius=22*Q,fill=(14,14,18,255),outline=(70,66,60,255),width=2*Q)
        scr=sc.resize((sw*Q,sh_*Q),Image.LANCZOS); m=Image.new('L',scr.size,0); ImageDraw.Draw(m).rounded_rectangle((0,0,scr.width-1,scr.height-1),radius=15*Q,fill=255)
        ph.paste(scr,(bez*Q,bez*Q),m); ph=ph.resize((PW,PH),Image.LANCZOS)
        shd=Image.new('RGBA',(W,H),(0,0,0,0)); a=Image.new('L',(W,H),0); ImageDraw.Draw(a).rounded_rectangle((bx0+10,by0+16,bx0+PW+10,by0+PH+16),radius=22,fill=200)
        shd.putalpha(a.filter(ImageFilter.GaussianBlur(14)))
        Lp=Image.new('RGBA',(W,H),(0,0,0,0)); Lp.alpha_composite(shd); Lp.alpha_composite(ph,(bx0,by0))
        layers.append(('スマホの画面(調整版)',Lp)); listing.append('層「スマホの画面(調整版)」 テスト卓の「部屋のルールとカード」画面')
    if v=='MDECK':
        Vd='/mnt/project-files/visuals-1030/札_最新_1030/表/'; Sd='/mnt/project-files/support-text-1106/01_完成_印刷用(裁ち落とし込み)/'
        Lc=Image.new('RGBA',(W,H),(0,0,0,0))
        for fs,cx,cy in [([Vd+'O-003_鎖鬼.png',Vd+'O-001_影鬼.png',Vd+'O-008_茨木童子.png',Vd+'O-009_酒呑童子.png'],600,300),([Vd+'T-001_灯籠の精.png',Sd+'札_変面_効果文1106.png',Vd+'T-008_玖龍街.png',Vd+'T-006_僵尸公主.png'],780,330)]:
            for k,f in enumerate(fs):
                im=Image.open(f).convert('RGBA').crop((41,41,907,1268)); Q=4
                m=Image.new('L',(866*Q,1227*Q),0); ImageDraw.Draw(m).rounded_rectangle((0,0,866*Q-1,1227*Q-1),radius=41*Q,fill=255); im.putalpha(m.resize((866,1227),Image.LANCZOS))
                cw=128; ch=round(1227*cw/866); im=im.resize((cw,ch),Image.LANCZOS)
                ang=(-1.5+k)*10; pad=Image.new('RGBA',(cw,ch*2),(0,0,0,0)); pad.alpha_composite(im,(0,0))  # 下端を軸に回す
                r=pad.rotate(-ang,resample=Image.BICUBIC,expand=True); x0=cx-r.width//2; y0=cy-r.height//2+ch//2
                sa=Image.new('L',(W,H),0); sa.paste(r.split()[3].point(lambda q:int(q*.6)),(x0+6,y0+10)); s_=Image.new('RGBA',(W,H),(0,0,0,0)); s_.putalpha(sa.filter(ImageFilter.GaussianBlur(8)))
                Lc.alpha_composite(s_); Lc.alpha_composite(r,(x0,y0))
        layers.append(('ミラーデッキの札(見本)',Lc)); listing.append('層「ミラーデッキの札(見本)」 酒呑一門・玖龍一門の札4枚ずつ(裁ち線で切った版)')
    if v=='MEIIRE':
        C='/mnt/project-files/supporter-cards-1107/04_裁ち線で切った版_PNG/支援者用_'
        Lc=Image.new('RGBA',(W,H),(0,0,0,0))
        for f,cx,cy,ang in [('O-001_影鬼',648,372,5),('T-006_僵尸公主',790,362,-4)]:
            im=Image.open(C+f+'_1107_裁ち線で切った版.png').convert('RGBA'); cw=178; im=im.resize((cw,round(1227*cw/866)),Image.LANCZOS)
            r=im.rotate(ang,resample=Image.BICUBIC,expand=True); x0=cx-r.width//2; y0=cy-r.height//2
            a=Image.new('L',(W,H),0); a.paste(r.split()[3].point(lambda q:int(q*.7)),(x0+8,y0+14)); s=Image.new('RGBA',(W,H),(0,0,0,0)); s.putalpha(a.filter(ImageFilter.GaussianBlur(10)))
            Lc.alpha_composite(s); Lc.alpha_composite(r,(x0,y0))
        layers.append(('名入れの札(見本)',Lc)); listing.append('層「名入れの札(見本)」 影鬼・僵尸公主の名入れ用の札(裁ち線で切った版)')
    # 文字(どのプランも同じ位置・大きさ)
    if not naiyou:
        txt(title,[title],MIN,52,GOLD,(36,40),lh=1.2)
        txt('値段',[price],MIN,40,WHITE,(39,108),lh=1.2)
        y=176
    else:  # 内容物だけの版: プラン名・値段・赤の行(送料・割引)を外し、本文を縦の真ん中に
        tot=sum(len(l)*STY[k][1]*STY[k][3]+14 for k,l in blocks)-14; y=round((H-30-tot)/2)
    for i,(k,lines) in enumerate(blocks):
        font,size,col,lh=STY[k]; y+=txt(f'本文{i+1}',lines,font,size,col,(39,y),lh=lh)+14
    assert y<470+(80 if naiyou else 0),(v,y)
    if not naiyou: txt('赤の行',[red],MIN,36,RED,(39,470),lh=1.2)
    if foot: txt('注記_左下',[foot],GO,16,SUB,(39,544),lh=1.2)
    txt('注記',['※試作のデザインです。製品版と異なる場合があります'],GO,15,(225,220,205),(884,569),'ra')
    name=f'リターン_{fn}_1108c' if not naiyou else f'内容物_{fn}_プラン名なし_1108c'
    comp=bg.convert('RGBA')
    for _,L in layers: comp=Image.alpha_composite(comp,L)
    comp.convert('RGB').save(f'{O}{name}.jpg',quality=93)
    psd=PSDImage.new('RGB',(W,H)); b=PixelLayer.frompil(bg.convert('RGBA'),psd,'bg',0,0); b.name='背景(文字なし)'; psd.append(b)
    ld=f'{O}{name}_層'; os.makedirs(ld,exist_ok=True); bg.save(f'{ld}/00_背景(文字なし).png')
    for i,(lab,L) in enumerate(layers,1):
        bb=L.getchannel('A').getbbox(); pl=PixelLayer.frompil(L.crop(bb),psd,'L%d'%i,bb[1],bb[0]); pl.name=lab; psd.append(pl); L.save(f'{ld}/{i:02d}_{lab}.png')
    psd.save(f'{O}{name}_レイヤー付き.psd')
    open(f'{O}{name}_文字の一覧.txt','w').write(f'「{name}」の文字の一覧\n\n原寸 900×600。6プランとも同じ型(見出し y40・値段 y108・本文 y176から・赤の行 y470・左下の注記 y544)。\n\n'+'\n\n'.join(listing)+'\n')
    print(name,int(y))
for v in P: build(v)
for v in P: build(v,True)
# 一覧(2列×4段)
Mf=ImageFont.truetype(MIN,56); Gf=ImageFont.truetype(GO,32)
order=['KAIJO','KAIJO2','OUEN','HONTAI','MDECK','MIRROR','B3','MEIIRE']
Wl=1920; Hl=110+4*696; c=Image.new('RGB',(Wl,Hl),(19,19,26)); d=ImageDraw.Draw(c)
d.text((Wl/2,62),'式神符陣 リターン一覧',font=Mf,fill=GOLD,anchor='mm')
for i,v in enumerate(order):
    fn,title,price=P[v][:3]; x=40+(i%2)*940; y=110+(i//2)*696
    d.text((x,y+18),f'{LABEL[v]} {price}',font=Gf,fill=(236,230,214),anchor='lm')
    c.paste(Image.open(f'{O}リターン_{fn}_1108c.jpg').convert('RGB'),(x,y+56))
c.save(O+'リターン_8プラン一覧_1108c.jpg',quality=92); print('ichiran',c.size)
