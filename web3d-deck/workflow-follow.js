/* 나레이션 동기 "도식 추적" 데모 — 워크플로 노드를 3D 공간에 배치하고,
   시간(=나레이션 타임라인)에 맞춰 카메라가 노드를 하나씩 따라가며 줌인·자막 전환.
   frame-render 가 window.__setTime(t) 를 프레임마다 호출 → 결정적·매끄러움. */
(function(){
'use strict';
const T=THREE;
// 중후(noir) 팔레트 — 딥블랙 + 스틸블루/골드 단일 액센트 + 무채 텍스트.
const TH={grad:[[0,'#05070c'],[.5,'#0a0e17'],[1,'#0e131e']],fog:0x080b12,
  ink:'#eef2f8',sub:'#8b95a7',a1:'#5b8cff',a2:'#c9a24a',a3:'#9aa5b8',accHex:[0x5b8cff,0xc9a24a,0x5f6b80]};

// 각 비트 = 나레이션 한 토막 + 도식 노드. (실제 파이프라인에선 dur 를 나레이션 오디오 길이로 채움)
const BEATS=[
  {label:'목표',      cap:'사용자가 목표를 줍니다. 에이전트가 할 일을 넘겨받죠.', dur:3.0},
  {label:'행동 결정', cap:'모델이 다음에 무엇을 할지 스스로 정합니다.',        dur:3.0},
  {label:'도구 실행', cap:'파일을 고치거나 명령을 실제로 실행합니다.',          dur:3.2},
  {label:'결과 관찰', cap:'실행 결과를 다시 읽어 상황을 파악합니다.',            dur:3.0},
  {label:'반복',      cap:'끝날 때까지 이 과정을 되돌려 반복합니다.',            dur:3.2},
];
const N=BEATS.length;
const starts=[]; let acc=0; BEATS.forEach(b=>{starts.push(acc);acc+=b.dur;});
const DURATION=acc; window.__DURATION=DURATION;

// 노드 3D 위치: x 로 퍼지고 z 로 들어가며(깊이) y 물결 — 카메라가 훑으며 공간을 통과.
const nodePos=BEATS.map((b,i)=>new T.Vector3((i-(N-1)/2)*22, Math.sin(i*0.85)*6, -i*15));

const scene=new T.Scene();
{const cv=document.createElement('canvas');cv.width=16;cv.height=256;const c=cv.getContext('2d');const g=c.createLinearGradient(0,0,0,256);TH.grad.forEach(s=>g.addColorStop(s[0],s[1]));c.fillStyle=g;c.fillRect(0,0,16,256);scene.background=new T.CanvasTexture(cv);}
scene.fog=new T.Fog(TH.fog,60,220);
const camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.1,2000);
const renderer=new T.WebGLRenderer({antialias:true,canvas:document.getElementById('gl')});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
scene.add(new T.AmbientLight(0xffffff,.8));
const pl=new T.PointLight(0x4cc9f0,1.1,700);pl.position.set(-60,50,60);scene.add(pl);
const pl2=new T.PointLight(0xf72585,1.0,700);pl2.position.set(60,-30,40);scene.add(pl2);

// 별
{const M=560,pos=new Float32Array(M*3);for(let i=0;i<M;i++){pos[i*3]=(Math.random()-.5)*520;pos[i*3+1]=(Math.random()-.5)*320;pos[i*3+2]=(Math.random()*-1)*(N*15+140);}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));scene.add(new T.Points(g,new T.PointsMaterial({color:0x9fb0d0,size:0.7,transparent:true,opacity:.32})));}

function nodeCard(b,i){
  const W=512,H=300,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  c.fillStyle='rgba(255,255,255,.045)';c.strokeStyle='rgba(255,255,255,.14)';c.lineWidth=1.4;
  const r=18;c.beginPath();c.moveTo(r,4);c.arcTo(W-4,4,W-4,H-4,r);c.arcTo(W-4,H-4,4,H-4,r);c.arcTo(4,H-4,4,4,r);c.arcTo(4,4,W-4,4,r);c.closePath();c.fill();c.stroke();
  c.fillStyle=TH.a1;c.font="800 30px Pretendard,sans-serif";c.textBaseline='top';c.letterSpacing='4px';c.fillText('STEP '+(i+1),44,46);c.letterSpacing='0px';
  c.fillStyle='#fff';c.font="900 74px Pretendard,sans-serif";c.textBaseline='middle';c.textAlign='left';c.fillText(b.label,44,H/2+10);
  const tex=new T.CanvasTexture(cv);tex.anisotropy=4;return tex;
}
const nodes=nodePos.map((p,i)=>{
  const g=new T.Group();g.position.copy(p);
  const mat=new T.MeshBasicMaterial({map:nodeCard(BEATS[i],i),transparent:true,depthWrite:false});
  const card=new T.Mesh(new T.PlaneGeometry(17,10),mat);g.add(card);
  const col=TH.accHex[i%2]; // 스틸블루/골드만
  const orb=new T.Mesh(new T.IcosahedronGeometry(2.4,0),new T.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.3,roughness:.4,metalness:.4,wireframe:true,transparent:true,opacity:.55}));
  orb.position.set(9,6,1);g.add(orb);
  g.userData={card,orb,mat,col};scene.add(g);return g;
});
// 화살표(튜브) 연결
for(let i=0;i<N-1;i++){
  const a=nodePos[i].clone().add(new T.Vector3(8,-1,0)), b=nodePos[i+1].clone().add(new T.Vector3(-8,-1,0));
  const mid=a.clone().add(b).multiplyScalar(.5).add(new T.Vector3(0,-4,4));
  const curve=new T.QuadraticBezierCurve3(a,mid,b);
  const tube=new T.Mesh(new T.TubeGeometry(curve,24,.16,8,false),new T.MeshBasicMaterial({color:0x5b8cff,transparent:true,opacity:.3}));
  scene.add(tube);
}

const capEl=document.getElementById('cap');
function lerp(a,b,t){return a+(b-a)*t;}
const smooth=x=>x<=0?0:x>=1?1:(x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2);
function camKey(i){return nodePos[i].clone().add(new T.Vector3(0,4.5,30));}

window.__setTime=function(t){
  t=Math.max(0,Math.min(DURATION-0.001,t));
  // 활성 비트
  let bi=0; for(let i=0;i<N;i++){if(t>=starts[i])bi=i;}
  const local=(t-starts[bi])/BEATS[bi].dur; // 0..1 within beat
  // 카메라: 비트 앞 40% 는 이전→현재 노드로 이동, 이후는 dwell(천천히 줌인)
  const move=Math.min(1,local/0.4);
  const from=bi>0?bi-1:0;
  const e=smooth(move);
  const cp=camKey(from).lerp(camKey(bi),e);
  const dwell=Math.max(0,(local-0.4)/0.6); // 도착 후 진행
  cp.z-=dwell*6; cp.y-=dwell*1.2;          // 천천히 밀고 들어감(줌인)
  cp.x+=Math.sin(t*0.6)*1.5;               // 미세한 손떨림/생동감
  camera.position.copy(cp);
  const la=nodePos[from].clone().lerp(nodePos[bi],e);
  camera.lookAt(la);
  // 노드 강조: 활성 크게·밝게, 나머지 흐리게
  nodes.forEach((g,i)=>{const on=i===bi?1:0;
    g.userData.mat.opacity=i===bi?1:(Math.abs(i-bi)===1?.5:.2);
    const sc=i===bi?1+dwell*0.06:0.9; g.userData.card.scale.setScalar(sc);
    g.userData.orb.material.emissiveIntensity=i===bi?.9:.25;
    g.userData.orb.scale.setScalar(i===bi?1.3:0.8);});
  // 자막(전환 순간만 살짝 페이드)
  const fade=Math.min(1,local/0.15,(1-local)/0.15+1);
  capEl.textContent=BEATS[bi].cap; capEl.style.opacity=Math.max(.15,Math.min(1,move));
};

let spin=0;
(function loop(){spin+=.02;nodes.forEach(g=>{g.userData.orb.rotation.y=spin;g.userData.orb.rotation.x=spin*.6;});renderer.render(scene,camera);requestAnimationFrame(loop);})();
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
// 폰트 로드 후 첫 프레임
(async()=>{try{await Promise.all(["900 74px 'Pretendard'","800 34px 'Pretendard'"].map(f=>document.fonts.load(f)));}catch(e){}
  nodes.forEach((g,i)=>g.userData.mat.map=nodeCard(BEATS[i],i)); nodes.forEach(g=>g.userData.mat.map.needsUpdate=true);
  window.__setTime(0);})();
})();
