import sharp from 'sharp';
const F = "'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif";
const BG='#070d1a', BG2='#0c1730', CORAL='#e8564a', GOLD='#d9a441', BLUE='#5b8ae0', DIM='#8fa0c0', WHITE='#f2f6ff';

// 안전영역: 모든 기기에서 보이는 1546x423 (2560x1440 중앙)
const W=2560,H=1440, SW=1546,SH=423, SX=(W-SW)/2, SY=(H-SH)/2;

// 바깥 장식 노드(안전영역 밖) — 데스크톱에서만 보인다
const deco = [
  [180,300],[380,220],[300,560],[120,760],[420,880],[240,1120],[520,1230],
  [2380,300],[2180,230],[2280,570],[2440,780],[2140,900],[2340,1130],[2040,1240],
].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5" fill="${BLUE}" opacity=".5"/>`).join('');
const lines = [
  [180,300,380,220],[380,220,300,560],[300,560,120,760],[300,560,420,880],[420,880,240,1120],[240,1120,520,1230],
  [2380,300,2180,230],[2180,230,2280,570],[2280,570,2440,780],[2280,570,2140,900],[2140,900,2340,1130],[2340,1130,2040,1240],
].map(([a,b,c,d])=>`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${BLUE}" stroke-width="2" opacity=".22"/>`).join('');

// 안전영역 안: 워드마크 + 한 줄 약속 + 인과 사슬
const cx = W/2;
const chainY = SY+330;
const chain = (() => {
  const items=[['유가',CORAL],['정유화학',GOLD],['SK이노베이션',WHITE]];
  const bw=[150,210,290], gap=88; const total=bw.reduce((a,b)=>a+b,0)+gap*2;
  let x=cx-total/2; let out='';
  items.forEach(([t,c],i)=>{
    out+=`<rect x="${x}" y="${chainY-31}" width="${bw[i]}" height="62" rx="10" fill="none" stroke="${c}" stroke-width="2" opacity=".85"/>`;
    out+=`<text x="${x+bw[i]/2}" y="${chainY+10}" font-family="${F}" font-size="30" fill="${c}" text-anchor="middle">${t}</text>`;
    if(i<2){ const ax=x+bw[i]+14, bx=x+bw[i]+gap-14;
      out+=`<line x1="${ax}" y1="${chainY}" x2="${bx}" y2="${chainY}" stroke="${CORAL}" stroke-width="3" opacity=".8"/>`;
      out+=`<polygon points="${bx},${chainY} ${bx-13},${chainY-8} ${bx-13},${chainY+8}" fill="${CORAL}" opacity=".9"/>`; }
    x+=bw[i]+gap;
  });
  return out;
})();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${BG}"/><stop offset=".55" stop-color="${BG2}"/><stop offset="1" stop-color="${BG}"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="45%" r="42%">
<stop offset="0" stop-color="#16305e" stop-opacity=".55"/><stop offset="1" stop-color="#16305e" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${lines}${deco}
<text x="${cx}" y="${SY+92}" font-family="${F}" font-size="34" letter-spacing="15" fill="${GOLD}" text-anchor="middle">S T O C K O N T O L O G Y</text>
<text x="${cx}" y="${SY+196}" font-family="${F}" font-size="104" font-weight="bold" fill="${WHITE}" text-anchor="middle">주식온톨로지</text>
<text x="${cx}" y="${SY+262}" font-family="${F}" font-size="38" fill="${DIM}" text-anchor="middle">거시가 움직이면 어느 종목이 며칠 뒤에 움직이는가</text>
${chain}
<text x="${cx}" y="${SY+402}" font-family="${F}" font-size="30" fill="${DIM}" text-anchor="middle">매일 아침 계산해서 공개합니다 · 무료·비수익 · stockontology.cc</text>
</svg>`;

await sharp(Buffer.from(svg),{density:72}).png().toFile('public/brand/stockontology/banner.png');

// 워터마크 150x150 — 인과 화살표 마크
const wm = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">
<circle cx="75" cy="75" r="72" fill="#070d1a" fill-opacity=".82" stroke="${GOLD}" stroke-width="3"/>
<circle cx="42" cy="52" r="9" fill="${CORAL}"/><circle cx="75" cy="75" r="9" fill="${GOLD}"/><circle cx="108" cy="98" r="9" fill="${WHITE}"/>
<line x1="50" y1="58" x2="67" y2="69" stroke="${CORAL}" stroke-width="4"/>
<line x1="83" y1="81" x2="100" y2="92" stroke="${GOLD}" stroke-width="4"/>
</svg>`;
await sharp(Buffer.from(wm),{density:72}).png().toFile('public/brand/stockontology/watermark.png');

// 프로필 800x800 (API 미지원 — 스튜디오에서 수동 업로드)
//
// ★48px 에서 읽히는 것만 넣는다★ 유튜브는 아바타를 대부분 48px 로 보여준다. 800px 에서
// 72pt 로 넣은 "주식온톨로지"는 48px 로 줄면 4px 높이가 되어 글자가 아니라 얼룩이 된다.
// 실제로 축소해 눈으로 확인했다. 그래서 글자를 넣은 판과 마크만 있는 판을 둘 다 만든다.
const mark = (scale, cx, cy) => {
  const r = 34*scale, w = 14*scale;
  const P=[[-150,-114],[0,0],[150,114]].map(([dx,dy])=>[cx+dx*scale, cy+dy*scale]);
  return `<circle cx="${P[0][0]}" cy="${P[0][1]}" r="${r}" fill="${CORAL}"/>
<circle cx="${P[1][0]}" cy="${P[1][1]}" r="${r}" fill="${GOLD}"/>
<circle cx="${P[2][0]}" cy="${P[2][1]}" r="${r}" fill="${WHITE}"/>
<line x1="${P[0][0]+r*0.8}" y1="${P[0][1]+r*0.62}" x2="${P[1][0]-r*0.8}" y2="${P[1][1]-r*0.62}" stroke="${CORAL}" stroke-width="${w}"/>
<line x1="${P[1][0]+r*0.8}" y1="${P[1][1]+r*0.62}" x2="${P[2][0]-r*0.8}" y2="${P[2][1]-r*0.62}" stroke="${GOLD}" stroke-width="${w}"/>`;
};

// (A) 요청안 — 이름 글자를 넣은 판
const pf = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
<rect width="800" height="800" fill="${BG}"/>
<circle cx="400" cy="400" r="392" fill="none" stroke="#16305e" stroke-width="4"/>
${mark(1, 400, 356)}
<text x="400" y="672" font-family="${F}" font-size="96" font-weight="bold" fill="${WHITE}" text-anchor="middle">주식온톨로지</text>
</svg>`;
await sharp(Buffer.from(pf),{density:72}).png().toFile('public/brand/stockontology/profile.png');

// (B) 대안 — 마크만. 48px 에서도 형태가 그대로 남는다.
const pfm = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
<rect width="800" height="800" fill="${BG}"/>
<circle cx="400" cy="400" r="392" fill="none" stroke="#16305e" stroke-width="4"/>
${mark(1.55, 400, 400)}
</svg>`;
await sharp(Buffer.from(pfm),{density:72}).png().toFile('public/brand/stockontology/profile-mark.png');

for (const f of ['banner','watermark','profile','profile-mark']) {
  const m = await sharp(`public/brand/stockontology/${f}.png`).metadata();
  console.log(f, m.width+'x'+m.height, (m.size/1024|0)+'KB');
}
