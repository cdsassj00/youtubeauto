/* 시간(나레이션) 기반 통합 3D 엔진 — 자동재생.
   - 일반 씬(title/stat/cmp/quote): 카드로 프레이밍, dwell+줌인.
   - flow 씬: 노드를 3D로 펼치고 카메라가 노드를 하나씩 따라가며(도식 추적) 줌인·강조.
   각 비트 길이(dur, 초)는 window.DECK_DATA 에 주입(없으면 텍스트 길이로 추정).
   window.__setTime(t) 를 프레임마다 호출 → 결정적 렌더. window.__DURATION 제공.
   window.PALETTE_NAME 로 팔레트 선택(기본 noir=중후). */
(function(){
'use strict';
const T=THREE;
const PAL={
  noir:{grad:[[0,'#05070c'],[.5,'#0a0e17'],[1,'#0e131e']],fog:0x080b12,ink:'#eef2f8',sub:'#8b95a7',card:'rgba(255,255,255,.045)',cstroke:'rgba(255,255,255,.13)',a1:'#5b8cff',a2:'#c9a24a',a3:'#9aa5b8',accHex:[0x5b8cff,0xc9a24a,0x5f6b80]},
  aurora:{grad:[[0,'#0d1030'],[.45,'#3a1c71'],[.75,'#b0417a'],[1,'#ff9a6b']],fog:0x241a4d,ink:'#fff',sub:'#cdd0f0',card:'rgba(9,11,32,.34)',cstroke:'rgba(255,255,255,.16)',a1:'#ffd166',a2:'#4cc9f0',a3:'#f72585',accHex:[0xffd166,0x4cc9f0,0xf72585]},
  blueprint:{grad:[[0,'#081a2e'],[.5,'#0e2f52'],[1,'#12507f']],fog:0x0c2740,ink:'#eaf6ff',sub:'#9fc4e0',card:'rgba(6,20,36,.42)',cstroke:'rgba(120,200,255,.28)',a1:'#4cc9f0',a2:'#3a86ff',a3:'#8be9fd',accHex:[0x4cc9f0,0x3a86ff,0x8be9fd]},
  paper:{grad:[[0,'#f7f0e2'],[.5,'#efe3cd'],[1,'#e6d5b8']],fog:0xe9dcc2,ink:'#2a2418',sub:'#6b5f45',card:'rgba(255,255,255,.6)',cstroke:'rgba(120,95,55,.26)',a1:'#e8590c',a2:'#0f9b8e',a3:'#c9184a',accHex:[0xe8590c,0x0f9b8e,0xc9184a]},
};
const TH=PAL[window.PALETTE_NAME]||PAL.noir;
const DECK=(window.DECK_DATA&&window.DECK_DATA.length)?window.DECK_DATA:[
  {type:'title',kicker:'DEMO',title:'통합 타임라인\n엔진 데모',lead:'나레이션에 맞춰 자동재생됩니다.',say:'통합 타임라인 엔진 데모입니다. 나레이션에 맞춰 자동으로 재생됩니다.'},
  {type:'flow',kicker:'에이전트 루프',head:'멈추지 않고 도는 원',nodes:[
    {label:'목표',say:'사용자가 목표를 줍니다.'},{label:'행동 결정',say:'모델이 다음 행동을 정합니다.'},
    {label:'도구 실행',say:'도구를 실제로 실행합니다.'},{label:'결과 관찰',say:'결과를 다시 읽습니다.'}]},
  {type:'quote',quote:'모델은 사올 수 있어도,\n하네스는 직접 지어야 합니다.',say:'모델은 사올 수 있어도, 하네스는 직접 지어야 합니다.'},
];
const SP=66, NODE_DX=27, NODE_DZ=8, CW=44, CH=CW*9/16, NW=18, NH=10;
const clamp=(a,b,x)=>Math.max(a,Math.min(b,x)), smooth=x=>x<=0?0:x>=1?1:(x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2);
function estDur(t){return Math.max(2.4,(String(t||'').length)/6.6+0.9);}
// 자막을 짧은 청크(한 줄)로 분할 — 문장/절 단위로 끊고 28자 넘으면 공백에서 추가 분할.
function splitCap(s){
  s=String(s||'').trim(); if(!s)return[];
  const parts=s.replace(/([.!?])\s+/g,'$1').replace(/(,)\s*/g,'$1').split('').map(x=>x.trim()).filter(Boolean);
  const out=[];
  parts.forEach(p=>{ while(p.length>28){let cut=p.lastIndexOf(' ',28); if(cut<14)cut=28; out.push(p.slice(0,cut).trim()); p=p.slice(cut).trim();} if(p)out.push(p); });
  return out;
}

// ── 비트 타임라인 ──
DECK.forEach(s=>{if(s.type==='flow')s._nodes=s.nodes.map(n=>typeof n==='string'?{label:n}:n);});
const beats=[];
DECK.forEach((s,si)=>{
  if(s.type==='flow')s._nodes.forEach((n,ni)=>beats.push({si,ni,kind:'node',dur:n.dur||estDur(n.say||n.label)}));
  else beats.push({si,ni:-1,kind:'slide',dur:s.dur||estDur(s.say||s.title||s.head||s.quote)});
});
let acc=0;beats.forEach(b=>{b.t0=acc;acc+=b.dur;b.t1=acc;});
const DURATION=acc; window.__DURATION=DURATION;

// ── 캔버스 텍스처 ──
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function gt(c,x0,y0,x1,y1,cols){const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,cols[0]);g.addColorStop(1,cols[1]);return g;}
const F=(w,px)=>`${w} ${px}px Pretendard,'Noto Sans KR',sans-serif`;
function baseCard(c,W,H){c.fillStyle=TH.card;c.strokeStyle=TH.cstroke;c.lineWidth=1.4;rr(c,60,60,W-120,H-120,20);c.fill();c.stroke();}
function tex(cv){const t=new T.CanvasTexture(cv);t.anisotropy=4;return t;}
function slideTexture(s){
  const W=1600,H=900,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');baseCard(c,W,H);
  const PAD=150;c.textBaseline='top';
  const kick=y=>{if(!s.kicker)return y;c.font=F(800,30);c.fillStyle=TH.a1;c.letterSpacing='6px';c.fillText(s.kicker.toUpperCase(),PAD,y);c.letterSpacing='0px';return y+56;};
  const lines=(t,x,y,px,lh,col,w)=>{c.font=F(w||900,px);c.fillStyle=col;String(t).split('\n').forEach((ln,i)=>c.fillText(ln,x,y+i*lh));return y+String(t).split('\n').length*lh;};
  if(s.type==='title'){let y=kick(160);c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=24;y=lines(s.title,PAD,y+18,116,130,TH.ink,900);c.shadowBlur=0;if(s.lead){c.font=F(500,40);c.fillStyle=TH.sub;c.fillText(s.lead,PAD,y+38);}}
  else if(s.type==='stat'){let y=kick(150);y=lines(s.head,PAD,y+8,72,86,TH.ink,850)+40;const gw=(W-2*PAD)/s.stats.length;s.stats.forEach((st,i)=>{const x=PAD+i*gw;c.font=F(900,116);c.fillStyle=gt(c,x,y,x+gw*.8,y,[TH.a1,TH.a2]);c.fillText(st[0],x,y);c.font=F(600,34);c.fillStyle=TH.sub;c.fillText(st[1],x,y+138);});}
  else if(s.type==='cmp'){let y=kick(150);y=lines(s.head,PAD,y+8,74,88,TH.ink,850)+36;const cw=(W-2*PAD-50)/2,ch=H-y-150;[[s.left,TH.a1,PAD],[s.right,TH.a3,PAD+cw+50]].forEach(([col,ac,x])=>{c.fillStyle='rgba(128,128,128,.10)';c.strokeStyle=TH.cstroke;c.lineWidth=1.4;rr(c,x,y,cw,ch,18);c.fill();c.stroke();c.font=F(850,44);c.fillStyle=ac;c.fillText(col[0],x+40,y+36);c.font=F(500,34);c.fillStyle=TH.sub;col.slice(1).forEach((t,i)=>c.fillText('· '+t,x+40,y+120+i*66));});}
  else if(s.type==='quote'){c.textAlign='center';c.shadowColor='rgba(0,0,0,.3)';c.shadowBlur=22;const arr=String(s.quote).split('\n');c.font=F(900,92);arr.forEach((ln,i)=>{c.fillStyle=i===arr.length-1?gt(c,W*.2,0,W*.8,0,[TH.a1,TH.a3]):TH.ink;c.fillText(ln,W/2,H/2-arr.length*56+i*122);});c.shadowBlur=0;c.textAlign='left';}
  return tex(cv);
}
function headingTexture(s){const W=1200,H=460,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');baseCard(c,W,H);c.textBaseline='top';
  if(s.kicker){c.font=F(800,30);c.fillStyle=TH.a1;c.letterSpacing='6px';c.fillText(s.kicker.toUpperCase(),130,150);c.letterSpacing='0px';}
  c.font=F(850,86);c.fillStyle=TH.ink;c.fillText(s.head||'',130,210);return tex(cv);}
function nodeTexture(nd,ni){const W=560,H=320,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');baseCard(c,W,H);c.textBaseline='top';
  c.font=F(800,30);c.fillStyle=TH.a1;c.letterSpacing='4px';c.fillText('STEP '+(ni+1),96,86);c.letterSpacing='0px';
  c.font=F(900,72);c.fillStyle=TH.ink;c.textBaseline='middle';c.fillText(nd.label,96,H/2+18);return tex(cv);}

// ── 씬 ──
const scene=new T.Scene();
{const cv=document.createElement('canvas');cv.width=16;cv.height=256;const c=cv.getContext('2d');const g=c.createLinearGradient(0,0,0,256);TH.grad.forEach(s=>g.addColorStop(s[0],s[1]));c.fillStyle=g;c.fillRect(0,0,16,256);scene.background=new T.CanvasTexture(cv);}
scene.fog=new T.Fog(TH.fog,70,260);
const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.1,2000);
const renderer=new T.WebGLRenderer({antialias:true,canvas:document.getElementById('gl')});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
scene.add(new T.AmbientLight(0xffffff,(window.PALETTE_NAME==='paper')?1.0:.8));
const l1=new T.PointLight(TH.accHex[0],1.0,700);l1.position.set(-70,50,60);scene.add(l1);
const l2=new T.PointLight(TH.accHex[1],0.9,700);l2.position.set(70,-30,40);scene.add(l2);
{const M=560,pos=new Float32Array(M*3);for(let i=0;i<M;i++){pos[i*3]=(Math.random()-.5)*560;pos[i*3+1]=(Math.random()-.5)*340;pos[i*3+2]=(Math.random()*-1)*(DECK.length*SP+160);}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));scene.add(new T.Points(g,new T.PointsMaterial({color:0x9fb0d0,size:0.7,transparent:true,opacity:.3})));}

function cardMesh(texture,w,h){return new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));}
function slidePos(si){return new T.Vector3(0,0,-si*SP);}
function nodePos(si,ni,n){const p=slidePos(si);return new T.Vector3(p.x+(ni-(n-1)/2)*NODE_DX,p.y+0,p.z-ni*NODE_DZ);}

const cards=[]; // {mesh, kind, si, ni, focus}
DECK.forEach((s,si)=>{
  if(s.type==='flow'){
    const nodes=s._nodes,n=nodes.length,P0=slidePos(si);
    const hm=cardMesh(headingTexture(s),NW*1.25,NW*1.25*460/1200);hm.position.set(P0.x-2,P0.y+9.5,P0.z+6);scene.add(hm);cards.push({mesh:hm,kind:'head',si,ni:-1});
    nodes.forEach((nd,ni)=>{const np=nodePos(si,ni,n);
      const cm=cardMesh(nodeTexture(nd,ni),NW,NH);cm.position.copy(np);scene.add(cm);cards.push({mesh:cm,kind:'node',si,ni,focus:np.clone()});
      const col=TH.accHex[ni%2];const orb=new T.Mesh(new T.IcosahedronGeometry(2.4,0),new T.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.3,roughness:.4,metalness:.4,wireframe:true,transparent:true,opacity:.5}));orb.position.set(np.x+9.5,np.y+6.5,np.z+1);scene.add(orb);nd._orb=orb;
      if(ni<n-1){const a=np.clone().add(new T.Vector3(8.5,-1,0)),b=nodePos(si,ni+1,n).add(new T.Vector3(-8.5,-1,0));const mid=a.clone().add(b).multiplyScalar(.5).add(new T.Vector3(0,-3.5,3));const tube=new T.Mesh(new T.TubeGeometry(new T.QuadraticBezierCurve3(a,mid,b),20,.14,8,false),new T.MeshBasicMaterial({color:TH.accHex[0],transparent:true,opacity:.28}));scene.add(tube);}
    });
  } else {
    const cm=cardMesh(slideTexture(s),CW,CH);cm.position.copy(slidePos(si));scene.add(cm);cards.push({mesh:cm,kind:'slide',si,ni:-1,focus:slidePos(si)});
  }
});

function beatFocus(b){return b.kind==='node'?nodePos(b.si,b.ni,DECK[b.si]._nodes.length):slidePos(b.si);}
const capEl=document.getElementById('cap');

window.__setTime=function(t){
  t=clamp(0,DURATION-.001,t);
  let bi=0;for(let i=0;i<beats.length;i++)if(t>=beats[i].t0)bi=i;
  const b=beats[bi],u=(t-b.t0)/b.dur;
  const focus=beatFocus(b), prev=bi>0?beatFocus(beats[bi-1]):focus.clone();
  // 비트 시작 직후(앞 32%)에 현재 포커스에 도착하도록 당김 → 문장을 말하는 동안 대상이 화면에 있다.
  // (이후는 dwell: 천천히 밀고 들어가며 머문다.)
  const e=smooth(clamp(0,1,u/0.32)), dwell=clamp(0,1,(u-0.32)/0.68);
  const look=prev.clone().lerp(focus,e);
  const back=(b.kind==='node')?30:42, up=(b.kind==='node')?3:3.5;
  // 카메라를 포커스 대상 "정면"에 둬서 대상이 화면 중앙에 오게 한다(감쇠 금지). 미세 흔들림만.
  const cam=new T.Vector3(look.x+Math.sin(t*0.45)*1.4, look.y+up, look.z+back-dwell*4);
  camera.position.copy(cam);
  camera.lookAt(look.x, look.y, look.z);
  // 강조/투명
  cards.forEach(cd=>{
    const on=(cd.si===b.si)&&(cd.kind!=='node'||cd.ni===b.ni);
    const near=(cd.si===b.si);
    const d=cd.mesh.position.distanceTo(look);
    let op=near?(on?1:(cd.kind==='node'?0.28:0.6)):clamp(0,1,1-d/(SP*1.15));
    cd.mesh.material.opacity=op; cd.mesh.scale.setScalar(on?1+dwell*0.05:0.94);
  });
  DECK.forEach(s=>{if(s._nodes)s._nodes.forEach((nd,ni)=>{const on=(DECK.indexOf(s)===b.si&&ni===b.ni);nd._orb.material.emissiveIntensity=on?.85:.25;nd._orb.material.opacity=on?.8:.4;nd._orb.scale.setScalar(on?1.3:0.85);});});
  if(capEl){
    const say=b.kind==='node'?(DECK[b.si]._nodes[b.ni].say||''):(DECK[b.si].say||'');
    if(b._caps===undefined)b._caps=splitCap(say);
    const caps=b._caps;
    if(!caps.length){capEl.textContent='';capEl.style.opacity='0';}
    else{
      const tot=caps.reduce((a,c)=>a+c.length,0)||1; let acc2=0,idx=caps.length-1;
      for(let k=0;k<caps.length;k++){const fr=caps[k].length/tot; if(u<acc2+fr){idx=k;break;} acc2+=fr;}
      capEl.textContent=caps[idx]; capEl.style.opacity='1';
    }
  }
};

let sp=0;(function loop(){sp+=.02;DECK.forEach(s=>{if(s._nodes)s._nodes.forEach(nd=>{nd._orb.rotation.y=sp;nd._orb.rotation.x=sp*.6;});});renderer.render(scene,camera);requestAnimationFrame(loop);})();
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
(async()=>{try{await Promise.all(["900 116px 'Pretendard'","800 30px 'Pretendard'","500 40px 'Pretendard'"].map(f=>document.fonts.load(f)));}catch(e){}
  // 폰트 로드 후 텍스처 재생성
  cards.forEach(cd=>{const s=DECK[cd.si];if(cd.kind==='slide')cd.mesh.material.map=slideTexture(s);else if(cd.kind==='head')cd.mesh.material.map=headingTexture(s);else if(cd.kind==='node')cd.mesh.material.map=nodeTexture(s._nodes[cd.ni],cd.ni);cd.mesh.material.map.needsUpdate=true;});
  window.__setTime(0);})();
})();
