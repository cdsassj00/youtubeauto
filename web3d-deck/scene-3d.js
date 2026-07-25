/* 프리셋 기반 3D 스크롤 프레젠테이션 엔진.
   PRESET = 팔레트 + 3D오브젝트 배치 + 카메라 스크럽 경로 + 등장 모션 + 배경 을 통째로 정의.
   → 템플릿마다 색뿐 아니라 "움직임·역동성 방향·디자인"이 다르다.
   window.DECK_DATA / window.PRESET_NAME 로 주입(없으면 데모). ?p=tunnel|orbit|rise|spiral */
(function(){
'use strict';
const T=THREE, TAU=Math.PI*2;

const PALETTES={
  aurora:{grad:[[0,'#0d1030'],[.45,'#3a1c71'],[.75,'#b0417a'],[1,'#ff9a6b']],fog:0x241a4d,ink:'#fff',sub:'#cdd0f0',card:'rgba(9,11,32,.30)',cstroke:'rgba(255,255,255,.16)',a1:'#ffd166',a2:'#4cc9f0',a3:'#f72585',accHex:[0xffd166,0x4cc9f0,0xf72585]},
  blueprint:{grad:[[0,'#081a2e'],[.5,'#0e2f52'],[1,'#12507f']],fog:0x0c2740,ink:'#eaf6ff',sub:'#9fc4e0',card:'rgba(6,20,36,.42)',cstroke:'rgba(120,200,255,.30)',a1:'#4cc9f0',a2:'#3a86ff',a3:'#8be9fd',accHex:[0x4cc9f0,0x3a86ff,0x8be9fd]},
  paper:{grad:[[0,'#f7f0e2'],[.5,'#efe3cd'],[1,'#e6d5b8']],fog:0xe9dcc2,ink:'#2a2418',sub:'#6b5f45',card:'rgba(255,255,255,.62)',cstroke:'rgba(120,95,55,.28)',a1:'#e8590c',a2:'#0f9b8e',a3:'#c9184a',accHex:[0xe8590c,0x0f9b8e,0xc9184a]},
  neon:{grad:[[0,'#0a0a18'],[.5,'#1a0b2e'],[1,'#2a0e3f']],fog:0x140a24,ink:'#fff',sub:'#c8b6e2',card:'rgba(12,6,26,.45)',cstroke:'rgba(255,42,109,.30)',a1:'#ff2a6d',a2:'#05d9e8',a3:'#d1f7ff',accHex:[0xff2a6d,0x05d9e8,0xa0f0ff]},
  // 중후·프리미엄: 딥차콜 배경 + 단일 스틸블루/골드 액센트 + 무채 텍스트. 색·도형 절제.
  noir:{grad:[[0,'#05070c'],[.5,'#0a0e17'],[1,'#0e131e']],fog:0x080b12,ink:'#eef2f8',sub:'#8b95a7',card:'rgba(255,255,255,.035)',cstroke:'rgba(255,255,255,.12)',a1:'#5b8cff',a2:'#c9a24a',a3:'#9aa5b8',accHex:[0x5b8cff,0xc9a24a,0x5f6b80]},
};
// 프리셋: 팔레트+오브젝트배치+카메라+등장+배경+카드모양
const PRESETS={
  tunnel:{pal:'aurora', objects:'ring', camera:'dolly', entrance:'assemble', bg:'stars', card:'round', fov:62, sp:60, dist:40},
  orbit:{pal:'blueprint', objects:'boxes', camera:'orbit', entrance:'spin', bg:'grid', card:'bracket', fov:58, sp:66, dist:44},
  rise:{pal:'paper', objects:'calm', camera:'rise', entrance:'rise', bg:'plain', card:'soft', fov:52, sp:58, dist:38},
  spiral:{pal:'neon', objects:'shards', camera:'spiral', entrance:'explode', bg:'stars', card:'round', fov:66, sp:60, dist:40},
  // 중후·절제: 먼지 파티클, 미니멀 모노 오브젝트, 차분한 카메라, 헤어라인 카드, 낮은 fov(원근 왜곡 최소).
  editorial:{pal:'noir', objects:'mono', camera:'calm', entrance:'fade', bg:'dust', card:'hair', fov:44, sp:66, dist:48},
};
const PNAME=window.PRESET_NAME||(new URLSearchParams(location.search).get('p')||'tunnel');
const PR=PRESETS[PNAME]||PRESETS.tunnel;
const TH=PALETTES[PR.pal];
const SP=PR.sp, DIST=PR.dist, PW=46, PH=PW*9/16;

const DECK=(window.DECK_DATA&&window.DECK_DATA.length)?window.DECK_DATA:[
  {type:'title',kicker:'3D SCROLL',title:'AI 에이전트는\n어떻게 스스로 일하는가',lead:'스크롤하면 카메라가 3D 공간을 통과합니다.'},
  {type:'stat',kicker:'왜 지금인가',head:'모델은 두뇌, 하네스는 손발',stats:[['5+','내 컴퓨터의 에이전트'],['2축','로컬vs원격'],['1','공통 엔진: 루프']]},
  {type:'flow',kicker:'에이전트 루프',head:'멈추지 않고 도는 원',nodes:['목표','행동 결정','도구 실행','결과 관찰'],hot:2},
  {type:'cmp',kicker:'핵심 대비',head:'로컬이냐 원격이냐',left:['로컬','내 파일 직접','빠르고 내 환경'],right:['원격 샌드박스','복제본/가상PC','안전 격리·병렬']},
  {type:'quote',quote:'모델은 사올 수 있어도,\n하네스는 직접 지어야 합니다.'},
  {type:'title',kicker:'THE END',title:'다음은\n당신의 내용으로',lead:'DECK와 PRESET만 바꾸면 됩니다.'},
];

/* ── 슬라이드 캔버스 텍스처(카드 모양은 프리셋에 따라 변주) ── */
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function card(c,x,y,w,h){
  if(PR.card==='bracket'){ c.fillStyle=TH.card;rr(c,x,y,w,h,8);c.fill();
    c.strokeStyle=TH.a1;c.lineWidth=4;const L=46;
    [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([cx,cy,sx,sy])=>{
      c.beginPath();c.moveTo(cx,cy+sy*L);c.lineTo(cx,cy);c.lineTo(cx+sx*L,cy);c.stroke();}); return; }
  const r=PR.card==='soft'?40:PR.card==='round'?44:PR.card==='hair'?12:14;
  const lw=PR.card==='hair'?1.2:2;
  c.fillStyle=TH.card;c.strokeStyle=TH.cstroke;c.lineWidth=lw;rr(c,x,y,w,h,r);c.fill();c.stroke();
}
function gt(c,x0,y0,x1,y1,cols){const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,cols[0]);g.addColorStop(1,cols[1]);return g;}
function slideTexture(s){
  const W=1600,H=900,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  card(c,70,70,W-140,H-140); const PAD=150;c.textBaseline='top';
  const F=(w,px)=>`${w} ${px}px Pretendard,'Noto Sans KR','Nanum Gothic',sans-serif`;
  const kick=(y)=>{if(!s.kicker)return y;c.font=F(800,30);c.fillStyle=TH.a1;c.letterSpacing='8px';c.fillText(s.kicker.toUpperCase(),PAD,y);c.letterSpacing='0px';return y+58;};
  const lines=(t,x,y,px,lh,col,w)=>{c.font=F(w||900,px);c.fillStyle=col;t.split('\n').forEach((ln,i)=>c.fillText(ln,x,y+i*lh));return y+t.split('\n').length*lh;};
  if(s.type==='title'){let y=kick(150);c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=26;c.shadowOffsetY=8;y=lines(s.title,PAD,y+20,116,130,TH.ink,900);c.shadowBlur=0;c.shadowOffsetY=0;if(s.lead){c.font=F(500,40);c.fillStyle=TH.sub;c.fillText(s.lead,PAD,y+40);}}
  else if(s.type==='stat'){let y=kick(140);y=lines(s.head,PAD,y+10,72,86,TH.ink,850)+40;const gw=(W-2*PAD)/s.stats.length;s.stats.forEach((st,i)=>{const x=PAD+i*gw;c.font=F(900,118);c.fillStyle=gt(c,x,y,x+gw*.8,y,[TH.a1,TH.a2]);c.fillText(st[0],x,y);c.font=F(600,34);c.fillStyle=TH.sub;c.fillText(st[1],x,y+140);});}
  else if(s.type==='flow'){let y=kick(150);y=lines(s.head,PAD,y+10,76,90,TH.ink,850)+90;const n=s.nodes.length,gap=40,bw=(W-2*PAD-(n-1)*(gap+50))/n,bh=130;let x=PAD;s.nodes.forEach((nd,i)=>{const hot=i===s.hot;c.fillStyle=hot?gt(c,x,y,x+bw,y,[TH.a3,TH.a2]):'rgba(128,128,128,.14)';c.strokeStyle=TH.cstroke;c.lineWidth=2;rr(c,x,y,bw,bh,18);c.fill();if(!hot)c.stroke();c.font=F(800,38);c.fillStyle=hot?'#fff':TH.ink;c.textAlign='center';c.fillText(nd,x+bw/2,y+bh/2-24);c.textAlign='left';if(i<n-1){const ax=x+bw+8;c.strokeStyle=TH.a2;c.lineWidth=5;c.beginPath();c.moveTo(ax,y+bh/2);c.lineTo(ax+gap+30,y+bh/2);c.stroke();c.fillStyle=TH.a1;c.beginPath();c.moveTo(ax+gap+30,y+bh/2);c.lineTo(ax+gap+16,y+bh/2-10);c.lineTo(ax+gap+16,y+bh/2+10);c.fill();}x+=bw+gap+50;});}
  else if(s.type==='cmp'){let y=kick(140);y=lines(s.head,PAD,y+10,76,90,TH.ink,850)+40;const cw=(W-2*PAD-50)/2,ch=H-y-160;[[s.left,TH.a2,PAD],[s.right,TH.a3,PAD+cw+50]].forEach(([col,ac,x])=>{c.fillStyle='rgba(128,128,128,.10)';c.strokeStyle=TH.cstroke;c.lineWidth=2;rr(c,x,y,cw,ch,20);c.fill();c.stroke();c.font=F(850,46);c.fillStyle=ac;c.fillText(col[0],x+44,y+40);c.font=F(500,36);c.fillStyle=TH.sub;col.slice(1).forEach((t,i)=>c.fillText('· '+t,x+44,y+130+i*70));});}
  else if(s.type==='quote'){c.textAlign='center';c.shadowColor='rgba(0,0,0,.3)';c.shadowBlur=24;const arr=s.quote.split('\n');c.font=F(900,94);arr.forEach((ln,i)=>{c.fillStyle=i===arr.length-1?gt(c,W*.2,0,W*.8,0,[TH.a1,TH.a3]):TH.ink;c.fillText(ln,W/2,H/2-arr.length*58+i*126);});c.shadowBlur=0;c.textAlign='left';}
  const tex=new T.CanvasTexture(cv);tex.anisotropy=4;return tex;
}
function bgTexture(){const cv=document.createElement('canvas');cv.width=16;cv.height=256;const c=cv.getContext('2d');const g=c.createLinearGradient(0,0,0,256);TH.grad.forEach(s=>g.addColorStop(s[0],s[1]));c.fillStyle=g;c.fillRect(0,0,16,256);return new T.CanvasTexture(cv);}

/* ── 씬 ── */
const scene=new T.Scene();scene.background=bgTexture();scene.fog=new T.Fog(TH.fog,55,250);
const camera=new T.PerspectiveCamera(PR.fov,innerWidth/innerHeight,.1,2500);
const renderer=new T.WebGLRenderer({antialias:true,canvas:document.getElementById('gl')});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
scene.add(new T.AmbientLight(0xffffff,PR.pal==='paper'?1.0:.78));
const l1=new T.PointLight(TH.accHex[1],1.1,700);l1.position.set(-70,50,60);scene.add(l1);
const l2=new T.PointLight(TH.accHex[0],1.0,700);l2.position.set(70,-40,40);scene.add(l2);

// 배경 요소: 별/그리드
if(PR.bg==='stars'||PR.bg==='dust'){const dust=PR.bg==='dust';const N=dust?680:380,pos=new Float32Array(N*3);for(let i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*600;pos[i*3+1]=(Math.random()-.5)*420;pos[i*3+2]=(Math.random()*-1)*((DECK.length)*SP+200);}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));scene.add(new T.Points(g,new T.PointsMaterial({color:dust?0x9fb0d0:0xffffff,size:dust?0.7:1.1,transparent:true,opacity:dust?.35:.6,sizeAttenuation:true})));}
if(PR.bg==='grid'){for(let i=0;i<DECK.length;i++){const gh=new T.GridHelper(200,20,TH.accHex[0],0x1b3a5a);gh.position.set(0,-16,-i*SP);gh.material.opacity=.25;gh.material.transparent=true;scene.add(gh);}}

// 슬라이드 앵커 위치(카메라 스타일에 따라 축이 다르다)
function anchor(i){
  if(PR.camera==='rise') return new T.Vector3(0, i*SP*0.92, -30);
  return new T.Vector3(0,0,-i*SP);
}
function geoFor(i,k){
  if(PR.objects==='boxes') return new T.BoxGeometry(4.6,4.6,4.6);
  if(PR.objects==='calm')  return [new T.IcosahedronGeometry(5,0),new T.TorusGeometry(4,.7,16,40)][(i)%2];
  if(PR.objects==='shards')return new T.TetrahedronGeometry(2.2+((i+k)%3),0);
  if(PR.objects==='mono')  return [new T.IcosahedronGeometry(5,0),new T.TorusGeometry(4.4,.5,20,48)][(i+k)%2];
  return [new T.IcosahedronGeometry(3.4,0),new T.TorusGeometry(2.6,.8,14,36),new T.OctahedronGeometry(3.6,0)][(i+k)%3]; // ring/scatter
}
function objCount(){return PR.objects==='calm'?1:PR.objects==='mono'?2:PR.objects==='shards'?6:3;}
function basePos(i,k,n){
  const A=anchor(i);
  if(PR.objects==='ring'){const a=(k/n)*TAU+i;return new T.Vector3(A.x+Math.cos(a)*22,A.y+Math.sin(a)*13,A.z+10);}
  if(PR.objects==='boxes'){return new T.Vector3(A.x+(k-(n-1)/2)*26,A.y+(k%2?9:-9),A.z+12);}
  if(PR.objects==='shards'){const a=(k/n)*TAU;return new T.Vector3(A.x+Math.cos(a)*(20+k*3),A.y+Math.sin(a)*(14+k*2),A.z+6+k*3);}
  if(PR.objects==='calm'){return new T.Vector3(A.x+(i%2?20:-20),A.y+8,A.z+8);}
  if(PR.objects==='mono'){return new T.Vector3(A.x+(i%2?26:-26),A.y+(k?11:-9),A.z-8-k*10);}
  return new T.Vector3(A.x+(k-1)*30+(i%2?8:-8),A.y+(k%2?1:-1)*14+2,A.z+10+k*5);
}
function entranceOff(base,i,k){
  if(PR.entrance==='fade')   return new T.Vector3(0,5,-4);
  if(PR.entrance==='rise')   return new T.Vector3(0,-46,0);
  if(PR.entrance==='explode')return new T.Vector3(-(base.x-anchor(i).x),-(base.y-anchor(i).y),0); // 중앙에서 시작
  if(PR.entrance==='spin')   return new T.Vector3(0,0,0); // 위치는 유지, 회전/스케일로 등장
  return new T.Vector3((k-1)*40,(k%2?30:-30),50); // assemble: 멀리서
}

let groups=[];
function buildGroups(){groups=DECK.map((s,i)=>{
  const g=new T.Group();g.position.copy(anchor(i));
  const mat=new T.MeshBasicMaterial({map:slideTexture(s),transparent:true,depthWrite:false});
  const plane=new T.Mesh(new T.PlaneGeometry(PW,PH),mat);g.add(plane);
  const n=objCount(),shapes=[];
  for(let k=0;k<n;k++){const col=TH.accHex[(i+k)%3];
    const wire=PR.objects==='boxes'||PR.objects==='mono';
    const dim=PR.objects==='mono'?0.45:1;
    const m=new T.Mesh(geoFor(i,k),new T.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:PR.objects==='mono'?.32:(wire?.6:.3),roughness:.35,metalness:.5,transparent:true,wireframe:wire}));
    const bp=basePos(i,k,n); const local=bp.clone().sub(anchor(i));
    m.userData={local, off:entranceOff(bp,i,k), dim, spin:(0.3+Math.abs(Math.sin(i*3+k)))*(k%2?1:-1)*(PR.objects==='mono'?.4:1)};
    m.position.copy(local); g.add(m); shapes.push(m);
  }
  g.userData={mat,plane,shapes};scene.add(g);return g;
});}
const totalZ=(DECK.length-1)*SP, totalY=(DECK.length-1)*SP*0.92;

function layout(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',layout);layout();
document.body.style.height=(DECK.length*118)+'vh';

// 슬라이드별 안무: 각 슬라이드에 "머무르며(dwell)" 도착 시 줌인, 이동 중 줌아웃+좌우 스윙.
let curAlong=0;
function camFor(f){
  const c=camera, N=DECK.length, seg=f*(N-1), i=Math.min(N-1,Math.floor(seg)), tt=seg-i;
  const sm=tt<.5?4*tt*tt*tt:1-Math.pow(-2*tt+2,3)/2;   // dwell 이징(정수 근처에서 느려짐)
  const centered=1-Math.abs(2*tt-1);                    // 1=슬라이드 위, 0=중간
  const swing=Math.sin(tt*Math.PI);                     // 이동 중간에 최대(좌우 스윙)
  const side=(i%2?-1:1);
  const zoom=DIST - centered*16;                        // 도착 시 줌인(가까이), 이동 중 줌아웃
  if(PR.camera==='rise'){
    curAlong=(i+sm)*SP*0.92;
    c.up.set(0,1,0);c.rotation.z=0;
    c.position.set(side*12*swing, curAlong+DIST*0.3-centered*7, DIST-centered*8);
    c.lookAt(0,curAlong-14,-40);
  } else {
    curAlong=(i+sm)*SP;
    const z=-curAlong;
    const calm=PR.camera==='calm';
    const latAmp=calm?7:18, vyAmp=calm?2:5, zoomAmt=calm?9:16;
    c.up.set(0,1,0);
    c.position.set(side*latAmp*swing, Math.cos(tt*Math.PI)*vyAmp, z+(DIST-centered*zoomAmt));
    if(PR.camera==='spiral'){const a=f*Math.PI*4;c.position.x+=Math.cos(a)*14;c.position.y+=Math.sin(a)*14;c.rotation.z=a*.12;}
    else if(PR.camera==='orbit'){c.position.x+=Math.sin(seg*0.8)*22;c.rotation.z=0;}
    else if(calm){c.rotation.z=0;}
    else c.rotation.z=swing*side*0.04;
    c.lookAt(0,0,z);
  }
}
function onScroll(){
  const max=document.body.scrollHeight-innerHeight,f=max>0?scrollY/max:0;
  camFor(f);
  if(!groups.length)return;
  const camFwd=curAlong;
  groups.forEach((g,i)=>{
    const A=anchor(i); const along=(PR.camera==='rise')?A.y:(-A.z);
    const d=Math.abs(along-camFwd);
    const op=Math.max(0,Math.min(1,1-d/(SP*1.08)));
    g.userData.mat.opacity=op*op; g.userData.plane.scale.setScalar(.86+op*.16);
    g.userData.shapes.forEach(m=>{const u=m.userData;
      m.position.copy(u.local).addScaledVector(u.off,(1-op));
      const sc=(PR.entrance==='spin')?(.15+op*.85):(.3+op*.7);
      m.scale.setScalar(sc); m.material.opacity=Math.min(1,op*1.3)*(u.dim||1);
      if(PR.entrance==='spin')m.rotation.y=(1-op)*8;});
    g.visible=d<SP*1.7;
  });
}
addEventListener('scroll',onScroll,{passive:true});
async function init(){
  // 폰트가 로드된 뒤에 캔버스 텍스처를 그려야 Pretendard 로 나온다(안 그러면 폴백 폰트).
  try{ await Promise.all(["900 120px 'Pretendard'","850 46px 'Pretendard'","800 30px 'Pretendard'","600 34px 'Pretendard'","500 40px 'Pretendard'"].map(f=>document.fonts.load(f))); }catch(e){}
  buildGroups(); onScroll();
  (function loop(){groups.forEach(g=>{if(g.visible)g.userData.shapes.forEach(m=>{m.rotation.x+=.005*m.userData.spin*3;m.rotation.y+=.008*m.userData.spin;});});renderer.render(scene,camera);requestAnimationFrame(loop);})();
}
init();
})();
