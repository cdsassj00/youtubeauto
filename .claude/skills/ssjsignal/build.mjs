/* ssjsignal — deck.json → 단일 HTML 슬라이드.
   ssjhtmlvideo 의 SIGNAL 디자인에서 나레이션·TTS·프레임렌더를 걷어낸 판.
   의존성 없음(node 만). 사용: node build.mjs deck.json out.html [--embed] [--accent "#4da3ff"]

   ★슬라이드는 두 갈래다★
   - 임팩트형(claim/big/convert/metrics/nodes): 영상판에서 그대로 가져온 화면. 요소 1~3개에
     여백이 넓다. 전환점·표지·핵심 수치에 쓴다.
   - 밀도형(points/split/table/steps/agenda/code/quote): 발표·강의용으로 새로 만든 화면.
     제목 줄이 위에 서고 본문이 화면을 채운다. 임팩트형만으로 40장짜리 강의안을 만들면
     내용이 안 들어가고 계속 비어 보인다.

   ★색·서체 값은 engines/deck-signal.js 에서 그대로 옮겼다★ 같은 내용을 영상으로도
   슬라이드로도 낼 때 결이 어긋나면 안 되므로, 값을 손볼 일이 있으면 양쪽을 같이 고친다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const accentFlagIdx = argv.indexOf('--accent');
// --accent 의 값은 위치인자로 세면 안 된다.
const accentValue = accentFlagIdx >= 0 ? argv[accentFlagIdx + 1] : undefined;
const args = positional.filter((a) => a !== accentValue);
const [inPath, outPath = 'out.html'] = args;

if (!inPath) {
  console.error('사용: node build.mjs deck.json out.html [--embed] [--accent "#4da3ff"]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const deck = Array.isArray(raw) ? { slides: raw } : raw;
const slides = deck.slides || [];
if (!slides.length) {
  console.error('슬라이드가 하나도 없습니다. slides 배열을 확인하세요.');
  process.exit(1);
}
const AC = accentValue || deck.accent || '#2ee87a';
const HEADER = deck.header || '';

/** HTML 특수문자 이스케이프. claim·header 는 <em>/<b> 를 허용하므로 통과시키지 않는다. */
const esc = (x) =>
  String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 폰트 ────────────────────────────────────────────────────────────────
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
/** 밀도형 슬라이드의 제목 줄. 위에 서고 아래 액센트 밑줄이 붙는다. */
const head = (s) =>
  `<div class="shead el">${s.kicker ? `<span class="skick mono">${esc(s.kicker)}</span>` : ''}` +
  `<h2>${s.heading ? esc(s.heading) : ''}</h2>` +
  (s.sub ? `<p class="ssub">${esc(s.sub)}</p>` : '') + `</div>`;

/** [본문 html, 슬라이드에 붙일 클래스] */
function scene(s) {
  const kick = s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : '';
  const lead = s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : '';

  // ── 임팩트형 (영상판에서 그대로) ───────────────────────────────────
  if (s.type === 'big') {
    return [`${kick}<div class="cardwrap el"><div class="big"><span class="v">${esc(s.value)}</span>` +
      `<span class="u">${esc(s.unit || '')}</span><span class="sub mono">${esc(s.sub || '')}</span></div></div>${lead}`, ''];
  }
  if (s.type === 'convert') {
    return [`${kick}<div class="conv"><div class="box el"><div class="n">${esc(s.from)}</div>` +
      `<div class="l mono">${esc(s.fromLabel || '')}</div></div><div class="ar el mono">&rarr;</div>` +
      `<div class="box hi el"><div class="n">${esc(s.to)}</div><div class="l mono">${esc(s.toLabel || '')}</div></div></div>${lead}`, ''];
  }
  if (s.type === 'metrics') {
    const items = (s.items || [])
      .map((m) => `<div class="m el"><div class="k">${esc(m[0])}</div><div class="v">${esc(m[1])}</div><div class="d mono">${esc(m[2] || '')}</div></div>`)
      .join('');
    return [`${kick}<div class="metrics">${items}</div>${lead}`, ''];
  }
  if (s.type === 'nodes') {
    const pts = s.points || [];
    const hi = new Set(s.hi || []);
    const lines = (s.links || [])
      .map(([a, b]) => {
        const p1 = pts[a];
        const p2 = pts[b];
        return p1 && p2 ? `<line x1="${p1.x}%" y1="${p1.y}%" x2="${p2.x}%" y2="${p2.y}%"/>` : '';
      })
      .join('');
    const dots = pts
      .map((p, i) => `<div class="nd el${hi.has(i) ? ' hi' : ''}" style="left:${p.x}%;top:${p.y}%">${esc(p.label)}</div>`)
      .join('');
    return [`${kick}<div class="nodes"><svg>${lines}</svg>${dots}</div>${lead}`, ''];
  }

  // ── 밀도형 (발표·강의용) ────────────────────────────────────────────
  // 항목은 문자열이거나 [제목, 설명] 이다. 설명을 붙이면 한 줄짜리 키워드 나열을 면한다.
  const item = (it, i, cls) => {
    const [t, d] = Array.isArray(it) ? it : [it, ''];
    return `<li class="el ${cls}"><span class="num mono">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="txt"><b>${esc(t)}</b>${d ? `<i>${esc(d)}</i>` : ''}</span></li>`;
  };

  if (s.type === 'points') {
    const list = (s.items || []).map((it, i) => item(it, i, 'pt')).join('');
    return [`${head(s)}<ul class="points">${list}</ul>${s.note ? `<div class="note el mono">${esc(s.note)}</div>` : ''}`, 'dense'];
  }
  if (s.type === 'split') {
    const col = (c) =>
      `<div class="col el"><div class="ctitle">${esc(c.title || '')}</div>` +
      `<ul>${(c.items || []).map((it) => { const [t, d] = Array.isArray(it) ? it : [it, '']; return `<li><b>${esc(t)}</b>${d ? `<i>${esc(d)}</i>` : ''}</li>`; }).join('')}</ul></div>`;
    const l = s.left || {};
    const r = s.right || {};
    return [`${head(s)}<div class="split">${col(l)}<div class="vs el mono">${esc(s.vs || 'VS')}</div>${col(r)}</div>` +
      `${s.note ? `<div class="note el mono">${esc(s.note)}</div>` : ''}`, 'dense'];
  }
  if (s.type === 'table') {
    const cols = s.columns || [];
    const rows = s.rows || [];
    const th = cols.map((c, i) => `<th${i === 0 ? ' class="first"' : ''}>${esc(c)}</th>`).join('');
    const tb = rows
      .map((r) => `<tr class="el">${r.map((c, i) => `<td${i === 0 ? ' class="first"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
      .join('');
    return [`${head(s)}<table class="tbl"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>` +
      `${s.note ? `<div class="note el mono">${esc(s.note)}</div>` : ''}`, 'dense'];
  }
  if (s.type === 'steps') {
    const st = (s.items || [])
      .map((it, i) => {
        const [t, d] = Array.isArray(it) ? it : [it, ''];
        return `<div class="step el"><div class="sn mono">${String(i + 1).padStart(2, '0')}</div>` +
          `<div class="st"><b>${esc(t)}</b>${d ? `<i>${esc(d)}</i>` : ''}</div></div>`;
      })
      .join('<div class="sar el mono">&rarr;</div>');
    return [`${head(s)}<div class="steps">${st}</div>${s.note ? `<div class="note el mono">${esc(s.note)}</div>` : ''}`, 'dense'];
  }
  if (s.type === 'agenda') {
    const list = (s.items || [])
      .map((it, i) => {
        const [t, d] = Array.isArray(it) ? it : [it, ''];
        return `<li class="el${s.current === i ? ' on' : ''}"><span class="num mono">${String(i + 1).padStart(2, '0')}</span>` +
          `<span class="txt"><b>${esc(t)}</b>${d ? `<i>${esc(d)}</i>` : ''}</span></li>`;
      })
      .join('');
    return [`${head(s)}<ul class="agenda">${list}</ul>`, 'dense'];
  }
  if (s.type === 'code') {
    const body = esc(s.code || '');
    return [`${head(s)}<div class="codewrap el">${s.filename ? `<div class="fname mono">${esc(s.filename)}</div>` : ''}` +
      `<pre class="mono">${body}</pre></div>${s.note ? `<div class="note el mono">${esc(s.note)}</div>` : ''}`, 'dense'];
  }
  if (s.type === 'quote') {
    return [`${kick}<blockquote class="quote el">${esc(s.quote)}</blockquote>` +
      `${s.by ? `<div class="by el mono">— ${esc(s.by)}</div>` : ''}`, ''];
  }

  // claim / title (기본)
  return [`${kick}<div class="claim el">${s.claim || esc(s.title)}</div>${lead}`, ''];
}

const sections = slides
  .map((s, i) => {
    const [html, cls] = scene(s);
    return `<section class="scene ${cls}" data-i="${i}">${html}</section>`;
  })
  .join('\n');

// ── CSS ─────────────────────────────────────────────────────────────────
const css = `
${fontCss()}
:root{--bg:#0a0a0a;--ink:#e8ecf2;--dim:#8a8f98;--faint:#5a5f68;--ac:${AC};--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.025)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:#000;color:var(--ink);
 font-family:'Pretendard',system-ui,-apple-system,'Malgun Gothic',sans-serif;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-ligatures:none}

/* ★1920x1080 고정 스테이지를 화면에 맞춰 축소한다★
   창 크기에 따라 글자 크기가 제각각이 되면 발표 때 어디서 줄이 바뀔지 예측할 수 없다.
   슬라이드 도구처럼 캔버스를 고정하고 통째로 배율만 조정한다. */
#wrap{position:fixed;inset:0;display:grid;place-items:center;overflow:hidden;background:#000}
#stage{position:relative;width:1920px;height:1080px;background:var(--bg);flex:none;
 transform-origin:center center;overflow:hidden}
#stage::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;
 background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(0,0,0,.55) 100%)}

#hdr{position:absolute;top:38px;left:48px;z-index:6;display:flex;align-items:center;gap:12px}
#hdr .no{font-size:12px;letter-spacing:.12em;padding:5px 9px;border:1px solid var(--line);border-radius:6px;color:var(--dim);background:var(--card)}
#hdr .tx{font-size:15px;color:var(--dim);font-weight:600;letter-spacing:-.01em}
#hdr .tx b{color:var(--ink);font-weight:700}

.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
 padding:0 9vw;opacity:0;visibility:hidden;transform:translateY(16px);z-index:2;
 transition:opacity .4s cubic-bezier(.65,0,.35,1),transform .4s cubic-bezier(.65,0,.35,1),visibility 0s .4s}
.scene.on{opacity:1;visibility:visible;transform:none;transition:opacity .4s cubic-bezier(.65,0,.35,1),transform .4s cubic-bezier(.65,0,.35,1),visibility 0s}
/* 밀도형 — 제목이 위에 서고 본문이 캔버스를 채운다. 여백을 줄여 내용이 들어갈 자리를 만든다. */
.scene.dense{align-items:stretch;justify-content:flex-start;padding:132px 96px 84px}

.el{opacity:0;transform:translateY(14px);transition:opacity .42s cubic-bezier(.65,0,.35,1),transform .42s cubic-bezier(.65,0,.35,1)}
.scene.on .el{opacity:1;transform:none}
.scene.on .el:nth-child(1){transition-delay:.06s}
.scene.on .el:nth-child(2){transition-delay:.14s}
.scene.on .el:nth-child(3){transition-delay:.22s}
.scene.on .el:nth-child(4){transition-delay:.30s}
.scene.on .el:nth-child(5){transition-delay:.38s}
.scene.on .el:nth-child(6){transition-delay:.46s}
.scene.on .el:nth-child(7){transition-delay:.54s}
.scene.on .el:nth-child(8){transition-delay:.62s}

/* ── 밀도형 공통 ── */
.shead{margin-bottom:32px;flex:none}
.shead .skick{display:inline-block;font-size:13px;letter-spacing:.18em;color:var(--ac);font-weight:700;margin-bottom:14px}
.shead h2{font-size:50px;font-weight:800;letter-spacing:-.035em;line-height:1.2;word-break:keep-all}
.shead h2::after{content:'';display:block;width:76px;height:3px;background:var(--ac);margin-top:14px;border-radius:2px}
.shead .ssub{font-size:22px;color:var(--dim);margin-top:13px;word-break:keep-all;max-width:1500px;line-height:1.5}
.note{margin-top:auto;padding-top:18px;font-size:15px;color:var(--faint);letter-spacing:.02em}

/* points — 번호 + 굵은 요지 + 설명 한 줄. 키워드만 던지지 않게 설명을 붙일 수 있다. */
.points{list-style:none;display:flex;flex-direction:column;gap:16px;flex:1;justify-content:center;min-height:0}
.points li{display:flex;gap:22px;align-items:baseline;border-left:2px solid var(--line);padding:4px 0 4px 24px}
.points .num{font-size:15px;color:var(--ac);font-weight:700;flex:none;letter-spacing:.06em}
.points .txt{display:block}
.points b{font-size:30px;font-weight:700;letter-spacing:-.02em;word-break:keep-all;line-height:1.35}
.points i{display:block;font-style:normal;font-size:21px;color:var(--dim);margin-top:7px;line-height:1.55;word-break:keep-all;max-width:1450px}

/* split — 둘을 맞세운다. 각 칸이 목록을 가진다. */
.split{display:grid;grid-template-columns:1fr auto 1fr;gap:34px;align-items:stretch;flex:1;min-height:0}
.split .col{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:30px 34px}
.split .ctitle{font-size:27px;font-weight:800;letter-spacing:-.02em;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.split .col:last-of-type .ctitle{color:var(--ac)}
.split ul{list-style:none;display:flex;flex-direction:column;gap:15px}
.split li{position:relative;padding-left:19px;word-break:keep-all}
.split li::before{content:'';position:absolute;left:0;top:12px;width:7px;height:7px;border-radius:50%;background:var(--faint)}
.split .col:last-of-type li::before{background:var(--ac)}
.split b{font-size:22px;font-weight:700;line-height:1.45}
.split i{display:block;font-style:normal;font-size:18px;color:var(--dim);margin-top:5px;line-height:1.5}
.split .vs{align-self:center;font-size:19px;color:var(--faint);letter-spacing:.1em;white-space:nowrap}

/* table — 강의안에서 가장 자주 필요한 화면. */
.tbl{width:100%;border-collapse:collapse}
.tbl th,.tbl td{text-align:left;padding:14px 20px;border-bottom:1px solid var(--line);word-break:keep-all;vertical-align:top}
.tbl th{font-size:15px;letter-spacing:.08em;color:var(--faint);font-weight:700;text-transform:uppercase;
 border-bottom:1px solid rgba(255,255,255,.2)}
.tbl td{font-size:22px;line-height:1.45}
.tbl td.first{font-weight:700}
.tbl tbody tr:nth-child(even){background:rgba(255,255,255,.018)}
.tbl th:not(.first),.tbl td:not(.first){color:var(--dim)}
.tbl td.first{color:var(--ink)}

/* steps — 절차. 가로로 늘어놓고 화살표로 잇는다. */
.steps{display:flex;align-items:stretch;gap:16px;flex:1;min-height:0}
.steps .step{flex:1;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:24px 22px;
 display:flex;flex-direction:column;justify-content:center}
.steps .sn{font-size:13px;color:var(--ac);font-weight:700;letter-spacing:.1em;margin-bottom:14px}
.steps b{display:block;font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.35;word-break:keep-all}
.steps i{display:block;font-style:normal;font-size:18px;color:var(--dim);margin-top:10px;line-height:1.5;word-break:keep-all}
.steps .sar{align-self:center;color:var(--faint);font-size:22px;flex:none}

/* agenda — 목차. current 로 지금 어디인지 표시한다. */
.agenda{list-style:none;display:flex;flex-direction:column;gap:16px;flex:1;justify-content:center;min-height:0}
.agenda li{display:flex;gap:24px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line);opacity:.5}
.agenda li.on{opacity:1}
.agenda li.on .num{color:var(--ac)}
.agenda .num{font-size:16px;color:var(--faint);font-weight:700;flex:none}
.agenda b{font-size:34px;font-weight:700;letter-spacing:-.025em}
.agenda i{display:block;font-style:normal;font-size:19px;color:var(--dim);margin-top:6px}

/* code */
.codewrap{border:1px solid var(--line);background:#0e0e0e;border-radius:12px;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column}
.codewrap .fname{font-size:14px;color:var(--faint);padding:13px 22px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.02)}
.codewrap pre{padding:24px;font-size:20px;line-height:1.6;color:var(--ink);overflow:auto;white-space:pre;flex:1}

/* quote */
.quote{font-size:52px;font-weight:700;line-height:1.42;text-align:center;max-width:1300px;word-break:keep-all;
 border-left:3px solid var(--ac);padding-left:40px;text-align:left}
.by{margin-top:26px;font-size:17px;color:var(--faint);align-self:flex-start;padding-left:43px}

/* ── 임팩트형 (영상판 값 그대로) ── */
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
.nodes .nd{position:absolute;transform:translate(-50%,-50%) translateY(14px);border:1px solid var(--line);background:#0f0f0f;
 border-radius:999px;padding:12px 24px;font-size:18px;font-weight:600;white-space:nowrap}
.scene.on .nodes .nd{transform:translate(-50%,-50%)}
.nodes .nd.hi{border-color:${AC}66;color:var(--ac);box-shadow:0 0 24px ${AC}22}
.nodes svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.nodes line{stroke:rgba(255,255,255,.13);stroke-width:1}
/* word-break:keep-all — 원본에는 없다. 한 글자만 다음 줄로 떨어지는 것을 막는다. */
.claim{font-size:78px;font-weight:800;letter-spacing:-.035em;line-height:1.18;text-align:center;max-width:1100px;word-break:keep-all}
.claim em{font-style:normal;color:var(--ac)}
.kick{font-size:13px;letter-spacing:.22em;color:var(--ac);font-weight:700;margin-bottom:22px}
.lead{font-size:20px;color:var(--dim);margin-top:22px;text-align:center;word-break:keep-all;max-width:900px;line-height:1.55}

#bar{position:absolute;left:0;bottom:0;height:3px;background:var(--ac);z-index:8;transition:width .4s cubic-bezier(.65,0,.35,1);opacity:.8}
#pg{position:absolute;right:44px;bottom:30px;z-index:8;font-size:14px;color:var(--faint);letter-spacing:.06em}
#pg b{color:var(--ink);font-weight:700}
#hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:9;font-size:12px;color:#666;
 opacity:.7;transition:opacity .6s}
#hint.hide{opacity:0}

/* 인쇄 / P 키 — 모든 슬라이드를 한 장씩 펼친다. 그대로 Ctrl+P 하면 PDF 가 된다. */
@page{size:1920px 1080px;margin:0}
body.paper{overflow:auto;height:auto;background:#000}
body.paper #wrap{position:static;display:block;overflow:visible}
body.paper #stage{width:1920px;height:auto;transform:none!important;margin:0 auto}
body.paper #hdr,body.paper #bar,body.paper #pg,body.paper #hint{display:none}
body.paper #stage::after{display:none}
body.paper .scene{position:relative;inset:auto;height:1080px;opacity:1;visibility:visible;transform:none;
 border-bottom:1px solid var(--line);page-break-after:always;break-after:page}
body.paper .scene .el{opacity:1;transform:none;transition:none}
body.paper .nodes .nd{transform:translate(-50%,-50%)}
@media print{ body{background:#0a0a0a} body.paper .scene{border-bottom:none} }
`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deck.title || (slides[0] && (slides[0].claim || slides[0].heading || slides[0].title)) || 'SIGNAL')}</title>
<style>${css}</style>
</head>
<body>
<div id="wrap"><div id="stage">
<div id="hdr"><span class="no mono">01</span><span class="tx">${HEADER}</span></div>
${sections}
<div id="bar"></div>
<div id="pg"><b>1</b> / ${slides.length}</div>
</div></div>
<div id="hint">← → 넘기기 · F 전체화면 · P 인쇄 보기</div>
<script>
(function(){
  var wrap=document.getElementById('wrap'), stage=document.getElementById('stage');
  var scenes=[].slice.call(document.querySelectorAll('.scene'));
  var N=scenes.length, i=0;
  var no=document.querySelector('#hdr .no'), bar=document.getElementById('bar'),
      pg=document.getElementById('pg'), hint=document.getElementById('hint');
  // 고정 캔버스를 창에 맞춰 축소 — 어느 화면에서도 줄바꿈이 같다.
  function fit(){
    if(document.body.classList.contains('paper')){ stage.style.transform=''; return; }
    var s=Math.min(wrap.clientWidth/1920, wrap.clientHeight/1080);
    stage.style.transform='scale('+s+')';
  }
  function show(n){
    i=Math.max(0,Math.min(N-1,n));
    scenes.forEach(function(s,k){ s.classList.toggle('on',k===i); });
    no.textContent=String(i+1).padStart(2,'0');
    bar.style.width=((i+1)/N*100)+'%';
    pg.innerHTML='<b>'+(i+1)+'</b> / '+N;
    try{ if(location.hash!=='#'+(i+1)) history.replaceState(null,'','#'+(i+1)); }catch(err){}
  }
  // 해시 변경을 듣는다 — 없으면 #4 링크로 열거나 뒤로가기를 눌러도 화면이 안 바뀐다.
  window.addEventListener('hashchange',function(){
    var n=parseInt((location.hash||'#1').slice(1),10);
    if(n>=1&&n<=N&&n-1!==i) show(n-1);
  });
  window.addEventListener('resize',fit);
  document.addEventListener('keydown',function(e){
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    var k=e.key;
    if(k==='ArrowRight'||k==='ArrowDown'||k===' '||k==='PageDown'){ e.preventDefault(); show(i+1); }
    else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'){ e.preventDefault(); show(i-1); }
    else if(k==='Home'){ show(0); } else if(k==='End'){ show(N-1); }
    else if(k==='f'||k==='F'){ document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(); }
    else if(k==='p'||k==='P'){ document.body.classList.toggle('paper'); fit(); }
    else if(/^[1-9]$/.test(k)){ show(parseInt(k,10)-1); }
    hint.classList.add('hide');
  });
  document.addEventListener('click',function(e){
    if(document.body.classList.contains('paper')) return;
    show(e.clientX < innerWidth*0.25 ? i-1 : i+1);
    hint.classList.add('hide');
  });
  var x0=null;
  document.addEventListener('touchstart',function(e){ x0=e.touches[0].clientX; },{passive:true});
  document.addEventListener('touchend',function(e){
    if(x0===null) return; var dx=e.changedTouches[0].clientX-x0;
    if(Math.abs(dx)>44) show(i+(dx<0?1:-1)); x0=null;
  },{passive:true});
  setTimeout(function(){ hint.classList.add('hide'); },6000);
  fit();
  show(parseInt((location.hash||'#1').slice(1),10)-1 || 0);
})();
</script>
</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf8');
const dense = slides.filter((s) => ['points', 'split', 'table', 'steps', 'agenda', 'code'].includes(s.type)).length;
console.log(`  · ${outPath} — 슬라이드 ${slides.length}장(밀도형 ${dense}), ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB, 액센트 ${AC}`);
