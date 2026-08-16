/* ssjsignal — deck.json → 단일 HTML 슬라이드.
   ssjhtmlvideo 의 SIGNAL 디자인에서 나레이션·TTS·프레임렌더를 걷어낸 판.
   의존성 없음(node 만). 사용: node build.mjs deck.json out.html [--embed] [--accent "#4da3ff"]

   ★CSS 는 engines/deck-signal.js 에서 그대로 옮겨 왔다★ 디자인이 어긋나면 영상판과
   슬라이드판이 따로 놀게 되므로, 값을 손볼 일이 있으면 양쪽을 같이 고쳐야 한다.
   여기서 뺀 것은 자막(#cap)과 3D 깊이 카메라뿐이다 — 둘 다 나레이션 타임라인에 매인 기능이다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--') && !a.startsWith('#'));
const accentFlagIdx = argv.indexOf('--accent');
const [inPath, outPath = 'out.html'] = positional;

if (!inPath) {
  console.error('사용: node build.mjs deck.json out.html [--embed] [--accent "#4da3ff"]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
// 배열만 줘도 되고 { header, accent, slides } 로 줘도 된다.
const deck = Array.isArray(raw) ? { slides: raw } : raw;
const slides = deck.slides || [];
if (!slides.length) {
  console.error('슬라이드가 하나도 없습니다. slides 배열을 확인하세요.');
  process.exit(1);
}
const AC = (accentFlagIdx >= 0 && argv[accentFlagIdx + 1]) || deck.accent || '#2ee87a';
const HEADER = deck.header || '';

/** HTML 특수문자 이스케이프. claim 과 header 는 <em>/<b> 를 허용하므로 이 함수를 통과시키지 않는다. */
const esc = (x) =>
  String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 폰트 ────────────────────────────────────────────────────────────────
// 기본은 CDN(파일이 20KB 안팎으로 가볍다). --embed 면 base64 로 심어 완전 오프라인.
function fontCss() {
  const assets = path.join(HERE, '..', 'ssjhtmlvideo', 'assets');
  if (flags.has('--embed')) {
    const read = (f) => {
      const p = path.join(assets, f);
      if (!fs.existsSync(p)) {
        console.error(`--embed 에 필요한 ${p} 가 없습니다. ssjhtmlvideo 폴더에서 'node fetch-assets.mjs' 를 먼저 돌리세요.`);
        process.exit(1);
      }
      return fs.readFileSync(p).toString('base64');
    };
    const pre = read('pretendard.woff2');
    const mono = read('mono.woff2');
    console.log('  · 폰트를 파일 안에 심습니다(오프라인 가능, 용량 증가)');
    return `@font-face{font-family:'Pretendard';font-weight:45 920;font-display:swap;src:url(data:font/woff2;base64,${pre}) format('woff2-variations')}
@font-face{font-family:'JetBrains Mono';font-weight:500;font-display:swap;src:url(data:font/woff2;base64,${mono}) format('woff2')}`;
  }
  return `@font-face{font-family:'Pretendard';font-weight:45 920;font-display:swap;src:url(https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2) format('woff2-variations')}
@font-face{font-family:'JetBrains Mono';font-weight:500;font-display:swap;src:url(https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.woff2) format('woff2')}`;
}

// ── 슬라이드 조립 ────────────────────────────────────────────────────────
function scene(s) {
  const kick = s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : '';
  const lead = s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : '';
  if (s.type === 'big') {
    return `${kick}<div class="cardwrap el"><div class="big"><span class="v">${esc(s.value)}</span>` +
      `<span class="u">${esc(s.unit || '')}</span><span class="sub mono">${esc(s.sub || '')}</span></div></div>${lead}`;
  }
  if (s.type === 'convert') {
    return `${kick}<div class="conv"><div class="box el"><div class="n">${esc(s.from)}</div>` +
      `<div class="l mono">${esc(s.fromLabel || '')}</div></div><div class="ar el mono">&rarr;</div>` +
      `<div class="box hi el"><div class="n">${esc(s.to)}</div><div class="l mono">${esc(s.toLabel || '')}</div></div></div>${lead}`;
  }
  if (s.type === 'metrics') {
    const items = (s.items || [])
      .map((m) => `<div class="m el"><div class="k">${esc(m[0])}</div><div class="v">${esc(m[1])}</div><div class="d mono">${esc(m[2] || '')}</div></div>`)
      .join('');
    return `${kick}<div class="metrics">${items}</div>${lead}`;
  }
  if (s.type === 'nodes') {
    const pts = s.points || [];
    const hi = new Set(s.hi || []);
    const lines = (s.links || [])
      .map(([a, b]) => {
        const p1 = pts[a];
        const p2 = pts[b];
        if (!p1 || !p2) return '';
        return `<line x1="${p1.x}%" y1="${p1.y}%" x2="${p2.x}%" y2="${p2.y}%"/>`;
      })
      .join('');
    const dots = pts
      .map((p, i) => `<div class="nd el${hi.has(i) ? ' hi' : ''}" style="left:${p.x}%;top:${p.y}%">${esc(p.label)}</div>`)
      .join('');
    return `${kick}<div class="nodes"><svg>${lines}</svg>${dots}</div>${lead}`;
  }
  // claim / title — claim 만 <em> 을 허용한다(액센트 강조용).
  return `${kick}<div class="claim el">${s.claim || esc(s.title)}</div>${lead}`;
}

const sections = slides.map((s, i) => `<section class="scene" data-i="${i}">${scene(s)}</section>`).join('\n');

// ── CSS ─────────────────────────────────────────────────────────────────
// deck-signal.js 원본과 같은 값. 다른 점: 화면 전환이 실시간이라 CSS 트랜지션을 쓴다.
const css = `
${fontCss()}
:root{--bg:#0a0a0a;--ink:#e8ecf2;--dim:#8a8f98;--faint:#5a5f68;--ac:${AC};--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.025)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--ink);
 font-family:'Pretendard',system-ui,-apple-system,'Malgun Gothic',sans-serif;-webkit-font-smoothing:antialiased}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:1;
 background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(0,0,0,.55) 100%)}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-ligatures:none}

#hdr{position:fixed;top:38px;left:48px;z-index:6;display:flex;align-items:center;gap:12px}
#hdr .no{font-size:12px;letter-spacing:.12em;padding:5px 9px;border:1px solid var(--line);border-radius:6px;color:var(--dim);background:var(--card)}
#hdr .tx{font-size:15px;color:var(--dim);font-weight:600;letter-spacing:-.01em}
#hdr .tx b{color:var(--ink);font-weight:700}

#stage{position:fixed;inset:0;z-index:2}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
 padding:0 9vw;opacity:0;visibility:hidden;transform:translateY(16px);
 transition:opacity .45s cubic-bezier(.65,0,.35,1),transform .45s cubic-bezier(.65,0,.35,1),visibility 0s .45s}
.scene.on{opacity:1;visibility:visible;transform:none;transition:opacity .45s cubic-bezier(.65,0,.35,1),transform .45s cubic-bezier(.65,0,.35,1),visibility 0s}

/* 요소 계단식 등장 — 영상판은 t 로 직접 계산했지만 여기서는 실시간이라 트랜지션이 맞다. */
.el{opacity:0;transform:translateY(16px);transition:opacity .5s cubic-bezier(.65,0,.35,1),transform .5s cubic-bezier(.65,0,.35,1)}
.scene.on .el{opacity:1;transform:none}
.scene.on .el:nth-child(1){transition-delay:.10s}
.scene.on .el:nth-child(2){transition-delay:.23s}
.scene.on .el:nth-child(3){transition-delay:.36s}
.scene.on .el:nth-child(4){transition-delay:.49s}
.scene.on .el:nth-child(5){transition-delay:.62s}
.scene.on .el:nth-child(6){transition-delay:.75s}

.big{display:flex;align-items:baseline;gap:22px}
.big .v{font-size:172px;font-weight:800;letter-spacing:-.045em;color:var(--ac);line-height:.92;text-shadow:0 0 60px ${AC}22}
.big .u{font-size:34px;font-weight:700;color:var(--ink);opacity:.9}
.big .sub{font-size:15px;color:var(--faint);margin-left:6px}
.cardwrap{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:30px 40px}

.conv{display:flex;align-items:center;gap:34px}
.conv .box{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:22px 34px;text-align:center;min-width:230px}
.conv .box .n{font-size:72px;font-weight:800;letter-spacing:-.03em}
.conv .box .l{font-size:13px;color:var(--faint);margin-top:8px}
.conv .box.hi .n{color:var(--ac)}
.conv .ar{font-size:30px;color:var(--faint)}

.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;width:100%;max-width:1180px}
.metrics .m{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:20px 22px}
.metrics .m .k{font-size:12px;color:var(--faint);letter-spacing:.04em}
.metrics .m .v{font-size:52px;font-weight:800;color:var(--ac);letter-spacing:-.03em;margin:8px 0 6px;line-height:1}
.metrics .m .d{font-size:11px;color:var(--faint);opacity:.8}

.nodes{position:relative;width:100%;max-width:940px;height:400px}
.nodes .nd{position:absolute;transform:translate(-50%,-50%) translateY(16px);border:1px solid var(--line);background:#0f0f0f;
 border-radius:999px;padding:12px 24px;font-size:18px;font-weight:600;white-space:nowrap}
.scene.on .nodes .nd{transform:translate(-50%,-50%)}
.nodes .nd.hi{border-color:${AC}66;color:var(--ac);box-shadow:0 0 24px ${AC}22}
.nodes svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.nodes line{stroke:rgba(255,255,255,.13);stroke-width:1}

/* ★word-break:keep-all★ 원본(영상판)에는 없는 한 줄이다. 영상에서는 claim 이 짧아
   드러나지 않았지만, 20자짜리 문장에서 "조건이다"의 '다' 한 글자만 다음 줄로 떨어졌다.
   한국어는 어절 단위로 끊어야 읽힌다. */
.claim{font-size:78px;font-weight:800;letter-spacing:-.035em;line-height:1.18;text-align:center;max-width:1100px;word-break:keep-all}
.claim em{font-style:normal;color:var(--ac)}
.kick{font-size:13px;letter-spacing:.22em;color:var(--ac);font-weight:700;margin-bottom:22px}
.lead{font-size:20px;color:var(--dim);margin-top:22px;text-align:center;word-break:keep-all;max-width:900px}

/* 진행 표시 — 영상판에는 없다. 사람이 넘기는 자료에는 "어디쯤인지"가 필요하다. */
#bar{position:fixed;left:0;bottom:0;height:2px;background:var(--ac);z-index:8;transition:width .45s cubic-bezier(.65,0,.35,1);opacity:.75}
#pg{position:fixed;right:44px;bottom:34px;z-index:8;font-size:13px;color:var(--faint);letter-spacing:.06em}
#pg b{color:var(--ink);font-weight:700}
#hint{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:8;font-size:12px;color:var(--faint);
 opacity:.55;transition:opacity .6s}
#hint.hide{opacity:0}

/* 인쇄 / P 키 — 모든 슬라이드를 한 장씩 펼친다. 그대로 Ctrl+P 하면 PDF 가 된다. */
@media print{
  html,body{overflow:visible;height:auto}
  body::after,#hdr,#bar,#pg,#hint{display:none}
  #stage{position:static}
  .scene{position:relative;inset:auto;opacity:1!important;visibility:visible!important;transform:none!important;
   height:100vh;page-break-after:always;break-after:page}
  .scene .el{opacity:1!important;transform:none!important}
  .nodes .nd{transform:translate(-50%,-50%)!important}
}
body.paper{overflow:auto;height:auto}
body.paper::after,body.paper #hdr,body.paper #bar,body.paper #pg,body.paper #hint{display:none}
body.paper #stage{position:static}
body.paper .scene{position:relative;inset:auto;opacity:1;visibility:visible;transform:none;height:100vh;border-bottom:1px solid var(--line)}
body.paper .scene .el{opacity:1;transform:none;transition:none}
body.paper .nodes .nd{transform:translate(-50%,-50%)}
`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deck.title || (slides[0] && (slides[0].claim || slides[0].title)) || 'SIGNAL')}</title>
<style>${css}</style>
</head>
<body>
<div id="hdr"><span class="no mono">01</span><span class="tx">${HEADER}</span></div>
<div id="stage">
${sections}
</div>
<div id="bar"></div>
<div id="pg"><b>1</b> / ${slides.length}</div>
<div id="hint">← → 넘기기 · F 전체화면 · P 인쇄 보기</div>
<script>
(function(){
  var scenes=[].slice.call(document.querySelectorAll('.scene'));
  var N=scenes.length, i=0;
  var no=document.querySelector('#hdr .no'), bar=document.getElementById('bar'),
      pg=document.getElementById('pg'), hint=document.getElementById('hint');
  function show(n){
    i=Math.max(0,Math.min(N-1,n));
    scenes.forEach(function(s,k){ s.classList.toggle('on',k===i); });
    no.textContent=String(i+1).padStart(2,'0');
    bar.style.width=((i+1)/N*100)+'%';
    pg.innerHTML='<b>'+(i+1)+'</b> / '+N;
    // file:// 에서는 replaceState 가 막힐 수 있다 — 실패해도 넘기기는 계속돼야 한다.
    try{ if(location.hash!=='#'+(i+1)) history.replaceState(null,'','#'+(i+1)); }catch(err){}
  }
  // ★해시 변경을 듣는다★ 없으면 #4 를 단 링크로 열어도, 뒤로가기를 눌러도 화면이 안 바뀐다.
  // (같은 문서 안의 이동이라 스크립트가 다시 돌지 않는다.)
  window.addEventListener('hashchange',function(){
    var n=parseInt((location.hash||'#1').slice(1),10);
    if(n>=1&&n<=N&&n-1!==i) show(n-1);
  });
  document.addEventListener('keydown',function(e){
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    var k=e.key;
    if(k==='ArrowRight'||k==='ArrowDown'||k===' '||k==='PageDown'){ e.preventDefault(); show(i+1); }
    else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'){ e.preventDefault(); show(i-1); }
    else if(k==='Home'){ show(0); } else if(k==='End'){ show(N-1); }
    else if(k==='f'||k==='F'){ document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(); }
    else if(k==='p'||k==='P'){ document.body.classList.toggle('paper'); }
    else if(/^[1-9]$/.test(k)){ show(parseInt(k,10)-1); }
    hint.classList.add('hide');
  });
  document.addEventListener('click',function(e){
    if(document.body.classList.contains('paper')) return;
    show(e.clientX < innerWidth*0.25 ? i-1 : i+1);
    hint.classList.add('hide');
  });
  // 터치 스와이프
  var x0=null;
  document.addEventListener('touchstart',function(e){ x0=e.touches[0].clientX; },{passive:true});
  document.addEventListener('touchend',function(e){
    if(x0===null) return; var dx=e.changedTouches[0].clientX-x0;
    if(Math.abs(dx)>44) show(i+(dx<0?1:-1)); x0=null;
  },{passive:true});
  setTimeout(function(){ hint.classList.add('hide'); },6000);
  show(parseInt((location.hash||'#1').slice(1),10)-1 || 0);
})();
</script>
</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf8');
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`  · ${outPath} — 슬라이드 ${slides.length}장, ${kb}KB, 액센트 ${AC}`);
