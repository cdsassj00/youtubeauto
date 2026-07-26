/* SIGNAL 엔진 — 데이터가 주인공인 미니멀 다크 UI (레퍼런스: 딥블랙 + 단일 민트 액센트 + 모노 라벨).
   3D 캔버스가 아니라 실제 DOM/CSS 로 렌더 → 텍스트가 칼같이 선명하고 제품 UI 질감이 난다.
   window.__setTime(t) 로 결정적 렌더, window.__DURATION 제공.
   장식 금지: 떠다니는 도형·그라디언트 남발 없음. 여백과 데이터로 승부. */
(function () {
'use strict';
const AC = window.ACCENT || '#2ee87a';
const SPACE3D = !!window.SPACE3D;   // SIGNAL 디자인 + 3D 깊이 카메라(텍스트는 DOM 이라 선명)
const css = `
:root{--bg:#0a0a0a;--ink:#e8ecf2;--dim:#8a8f98;--faint:#5a5f68;--ac:${AC};--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.025)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--ink);
 font-family:'Pretendard',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:1;
 background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(0,0,0,.55) 100%)}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-ligatures:none}

/* 상단 고정 챕터 배지 */
#hdr{position:fixed;top:38px;left:48px;z-index:6;display:flex;align-items:center;gap:12px}
#hdr .no{font-size:12px;letter-spacing:.12em;padding:5px 9px;border:1px solid var(--line);border-radius:6px;color:var(--dim);background:var(--card)}
#hdr .tx{font-size:15px;color:var(--dim);font-weight:600;letter-spacing:-.01em}
#hdr .tx b{color:var(--ink);font-weight:700}

/* 스테이지 */
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:2}
#stage.space3d{perspective:1500px;perspective-origin:50% 46%;transform-style:preserve-3d}
#stage.space3d .scene{transform-style:preserve-3d;will-change:opacity,transform}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
 padding:0 9vw;opacity:0;will-change:opacity,transform}

/* 요소 등장 */
.el{opacity:0;will-change:opacity,transform}

/* 거대 숫자 */
.big{display:flex;align-items:baseline;gap:22px}
.big .v{font-size:172px;font-weight:800;letter-spacing:-.045em;color:var(--ac);line-height:.92;
 text-shadow:0 0 60px ${AC}22}
.big .u{font-size:34px;font-weight:700;color:var(--ink);opacity:.9}
.big .sub{font-size:15px;color:var(--faint);margin-left:6px}
.cardwrap{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:30px 40px}

/* 변환 A → B */
.conv{display:flex;align-items:center;gap:34px}
.conv .box{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:22px 34px;text-align:center;min-width:230px}
.conv .box .n{font-size:72px;font-weight:800;letter-spacing:-.03em}
.conv .box .l{font-size:13px;color:var(--faint);margin-top:8px}
.conv .box.hi .n{color:var(--ac)}
.conv .ar{font-size:30px;color:var(--faint)}

/* 지표 카드 4개 */
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;width:100%;max-width:1180px}
.metrics .m{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:20px 22px}
.metrics .m .k{font-size:12px;color:var(--faint);letter-spacing:.04em}
.metrics .m .v{font-size:52px;font-weight:800;color:var(--ac);letter-spacing:-.03em;margin:8px 0 6px;line-height:1}
.metrics .m .d{font-size:11px;color:var(--faint);opacity:.8}

/* 관계 노드 */
.nodes{position:relative;width:100%;max-width:940px;height:400px}
.nodes .nd{position:absolute;transform:translate(-50%,-50%);border:1px solid var(--line);background:#0f0f0f;
 border-radius:999px;padding:12px 24px;font-size:18px;font-weight:600;white-space:nowrap}
.nodes .nd.hi{border-color:${AC}66;color:var(--ac);box-shadow:0 0 24px ${AC}22}
.nodes svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.nodes line{stroke:rgba(255,255,255,.13);stroke-width:1}

/* ── 도식(설명형) ── SIGNAL 은 원래 숫자 슬라이드만 있어서 "구조를 그려 설명"하는 장면이 없었다.
   장식은 그대로 금지하고, 선·박스·화살표만으로 구조를 보여주는 네 가지를 추가한다. */

/* 파이프라인: 좌 → 우 단계 흐름 */
.pipe{display:flex;align-items:stretch;justify-content:center;width:100%;max-width:1620px}
.pipe .pn{border:1px solid var(--line);background:#0f0f0f;border-radius:16px;padding:34px 30px;
 min-width:250px;text-align:center;display:flex;flex-direction:column;justify-content:center}
.pipe .pn .t{font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1.22}
.pipe .pn .s{font-size:17px;color:var(--faint);margin-top:14px;letter-spacing:.03em}
.pipe .ar{display:flex;align-items:center;color:var(--faint);font-size:32px;padding:0 22px}

/* 계층 스택: 아래에서 위로 쌓인 구조 */
.stack{display:flex;flex-direction:column;gap:18px;width:100%;max-width:1180px}
.stack .sl{border:1px solid var(--line);background:var(--card);border-radius:16px;
 padding:30px 40px;display:flex;align-items:baseline;gap:26px}
.stack .sl .n{font-size:17px;color:var(--faint);letter-spacing:.1em;min-width:40px}
.stack .sl .t{font-size:44px;font-weight:700;letter-spacing:-.025em}
.stack .sl .s{font-size:22px;color:var(--dim);margin-left:auto;text-align:right}

/* 좌우 비교 */
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:38px;width:100%;max-width:1500px}
.cmp .col{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:40px 44px}
.cmp .col .h{font-size:19px;letter-spacing:.16em;color:var(--faint);font-weight:700;margin-bottom:28px}
.cmp .col.hi{border-color:${AC}33}
.cmp .col.hi .h{color:var(--ac)}
.cmp .col .li{font-size:33px;line-height:1.75;color:var(--ink);display:flex;gap:16px}
.cmp .col .li::before{content:'—';color:var(--faint)}
.cmp .col.hi .li::before{color:var(--ac)}

/* 격자(분류/요소 나열) */
.grid{display:grid;gap:24px;width:100%;max-width:1560px}
.grid .c{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:32px 34px}
.grid .c .n{font-size:16px;color:var(--ac);letter-spacing:.12em;font-weight:700}
.grid .c .t{font-size:36px;font-weight:700;margin-top:14px;letter-spacing:-.02em}
.grid .c .s{font-size:22px;color:var(--dim);margin-top:14px;line-height:1.55}

/* 진술/타이틀 */
.claim{font-size:78px;font-weight:800;letter-spacing:-.035em;line-height:1.18;text-align:center;max-width:1100px}
.claim em{font-style:normal;color:var(--ac)}
.kick{font-size:13px;letter-spacing:.22em;color:var(--ac);font-weight:700;margin-bottom:22px}
.lead{font-size:20px;color:var(--dim);margin-top:22px;text-align:center}

/* 하단 나레이션 자막 — 박스 없이 굵게 */
#cap{position:fixed;left:50%;bottom:8.5%;transform:translateX(-50%);z-index:7;
 font-size:26px;font-weight:700;color:var(--ink);text-align:center;max-width:72vw;
 letter-spacing:-.01em;text-shadow:0 2px 18px rgba(0,0,0,.9);white-space:nowrap}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

const DECK = (window.DECK_DATA && window.DECK_DATA.length) ? window.DECK_DATA : [
  { type: 'claim', kicker: 'DEMO', claim: '데이터가 <em>주인공</em>이다', say: '데모입니다.' },
];
const clamp = (a, b, x) => Math.max(a, Math.min(b, x));
const estDur = t => Math.max(2.4, String(t || '').length / 6.6 + 0.9);
function splitCap(s) {
  s = String(s || '').trim(); if (!s) return [];
  const D = '';
  const parts = s.replace(/([.!?])\s+/g, '$1' + D).replace(/(,)\s*/g, '$1' + D).split(D).map(x => x.trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => { while (p.length > 30) { let cut = p.lastIndexOf(' ', 30); if (cut < 15) cut = 30; out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim(); } if (p) out.push(p); });
  return out;
}

// 단계별로 하나씩 짚어가며 설명하는 도식들 — 타입마다 강조할 요소의 셀렉터가 다르다.
// (steps 가 있으면 각 단계가 독립된 나레이션 비트가 되고, 카메라 대신 강조가 옮겨간다.)
const STEPPED = { nodes: '.nd', pipeline: '.pn', stack: '.sl' };
const isStepped = s => !!STEPPED[s.type] && Array.isArray(s.steps) && s.steps.length > 0;

// ── 비트 타임라인 ──
const beats = [];
DECK.forEach((s, si) => {
  if (isStepped(s)) s.steps.forEach((st2, ni) => beats.push({ si, ni, dur: st2.dur || estDur(st2.say) }));
  else beats.push({ si, ni: -1, dur: s.dur || estDur(s.say) });
});
let acc = 0; beats.forEach(b => { b.t0 = acc; acc += b.dur; b.t1 = acc; });
window.__DURATION = acc;

// ── DOM 구성 ──
const hdr = document.createElement('div'); hdr.id = 'hdr';
hdr.innerHTML = `<span class="no mono">00</span><span class="tx"></span>`;
document.body.appendChild(hdr);
const stage = document.createElement('div'); stage.id = 'stage'; if (SPACE3D) stage.classList.add('space3d'); document.body.appendChild(stage);
const capEl = document.createElement('div'); capEl.id = 'cap'; document.body.appendChild(capEl);

function esc(x) { return String(x == null ? '' : x); }
function buildScene(s) {
  const d = document.createElement('div'); d.className = 'scene';
  if (s.type === 'big') {
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="cardwrap el"><div class="big"><span class="v" data-count="${esc(s.value)}">${esc(s.value)}</span>
      <span class="u">${esc(s.unit || '')}</span><span class="sub mono">${esc(s.sub || '')}</span></div></div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'convert') {
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="conv"><div class="box el"><div class="n">${esc(s.from)}</div><div class="l mono">${esc(s.fromLabel || '')}</div></div>
      <div class="ar el mono">&rarr;</div>
      <div class="box hi el"><div class="n">${esc(s.to)}</div><div class="l mono">${esc(s.toLabel || '')}</div></div></div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'metrics') {
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="metrics">${(s.items || []).map(m => `<div class="m el"><div class="k">${esc(m[0])}</div><div class="v">${esc(m[1])}</div><div class="d mono">${esc(m[2] || '')}</div></div>`).join('')}</div>`;
  } else if (s.type === 'nodes') {
    const pts = s.points || [];
    const lines = (s.links || []).map(([a, b2]) => {
      const p1 = pts[a], p2 = pts[b2];
      return `<line x1="${p1.x}%" y1="${p1.y}%" x2="${p2.x}%" y2="${p2.y}%"/>`;
    }).join('');
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="nodes"><svg>${lines}</svg>
      ${pts.map((p, i) => `<div class="nd el" data-i="${i}" style="left:${p.x}%;top:${p.y}%">${esc(p.label)}</div>`).join('')}</div>`;
  } else if (s.type === 'pipeline') {
    const ns = s.nodes || [];
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="pipe">${ns.map((n, i) => `${i ? '<div class="ar el mono">&rarr;</div>' : ''}
        <div class="pn el" data-i="${i}"><div class="t">${esc(n.label)}</div>${n.sub ? `<div class="s mono">${esc(n.sub)}</div>` : ''}</div>`).join('')}</div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'stack') {
    const ls = s.layers || [];
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="stack">${ls.map((l, i) => `<div class="sl el" data-i="${i}">
        <span class="n mono">${String(ls.length - i).padStart(2, '0')}</span>
        <span class="t">${esc(l.label)}</span>${l.sub ? `<span class="s">${esc(l.sub)}</span>` : ''}</div>`).join('')}</div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'cmp') {
    const col = (c, hi) => `<div class="col el${hi ? ' hi' : ''}"><div class="h mono">${esc((c || [])[0])}</div>
      ${(c || []).slice(1).map(x => `<div class="li">${esc(x)}</div>`).join('')}</div>`;
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="cmp">${col(s.left, false)}${col(s.right, true)}</div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  } else if (s.type === 'grid') {
    const cs = s.cells || [];
    const cols = Math.min(4, Math.max(2, Number(s.cols) || (cs.length > 4 ? 3 : 2)));
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="grid" style="grid-template-columns:repeat(${cols},1fr)">${cs.map((c, i) => `<div class="c el">
        <div class="n mono">${String(i + 1).padStart(2, '0')}</div><div class="t">${esc(c.label)}</div>
        ${c.sub ? `<div class="s">${esc(c.sub)}</div>` : ''}</div>`).join('')}</div>`;
  } else { // claim / title
    d.innerHTML = `${s.kicker ? `<div class="kick el">${esc(s.kicker)}</div>` : ''}
      <div class="claim el">${s.claim || esc(s.title)}</div>
      ${s.lead ? `<div class="lead el">${esc(s.lead)}</div>` : ''}`;
  }
  stage.appendChild(d); return d;
}
const scenes = DECK.map(buildScene);

// 씬 경계(크로스페이드용)
const sceneT0 = DECK.map((_, i) => beats.find(b => b.si === i).t0);
const sceneT1 = DECK.map((_, i) => { const bs = beats.filter(b => b.si === i); return bs[bs.length - 1].t1; });
const XF = 0.45;                                  // 크로스페이드 길이(초)
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// 프레임 단위 결정적 렌더 — CSS 트랜지션에 기대지 않고 모든 값을 t 로 직접 계산한다.
// (트랜지션은 실시간 기준이라 프레임을 점프시키면 전환이 잘려 "툭툭 끊기는" 원인이 된다.)
window.__setTime = function (t) {
  t = clamp(0, window.__DURATION - 0.001, t);
  let bi = 0; for (let i = 0; i < beats.length; i++) if (t >= beats[i].t0) bi = i;
  const b = beats[bi], s = DECK[b.si], u = (t - b.t0) / b.dur;

  hdr.querySelector('.no').textContent = String(b.si + 1).padStart(2, '0');
  hdr.querySelector('.tx').innerHTML = window.HEADER || '';

  // 연속 카메라 위치(씬 인덱스 공간) — 크로스페이드 구간에서 다음 씬으로 부드럽게 이동.
  let camIdx = b.si;
  { const e1 = sceneT1[b.si]; if (t > e1 - XF) camIdx = b.si + ease((t - (e1 - XF)) / XF); }

  scenes.forEach((sc, i) => {
    const s0 = sceneT0[i], s1 = sceneT1[i];
    let a = 0, entering = false;
    if (t > s0 - XF && t < s1) {
      if (t < s0) { a = ease((t - (s0 - XF)) / XF); entering = true; }        // 이전 씬 꼬리와 겹쳐 페이드인
      else if (t < s1 - XF) a = 1;
      else a = 1 - ease((t - (s1 - XF)) / XF);                                 // 페이드아웃
    }
    sc.style.opacity = a.toFixed(4);
    if (a <= 0.001) { sc.style.visibility = 'hidden'; return; }
    sc.style.visibility = 'visible';
    const p = clamp(0, 1, (t - s0) / Math.max(0.001, s1 - s0));
    if (SPACE3D) {
      // 카메라가 깊이 방향으로 이동 — 현재 씬은 z=0, 다음 씬은 뒤(멀리), 지난 씬은 앞으로 스쳐 지나간다.
      const dz = -(i - camIdx) * 900;
      const lx = (i % 2 ? 1 : -1) * 70 * (i - camIdx);                          // 좌우로 살짝 어긋나게 배치
      const ry = (i - camIdx) * -7;                                             // 살짝 비스듬히
      const yy = entering ? (1 - a) * 10 : 0;
      sc.style.transform = `translate3d(${lx.toFixed(1)}px, ${yy.toFixed(1)}px, ${dz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg)`;
    } else {
      const y = entering ? (1 - a) * 16 : -(1 - a) * 10;                        // 들어올 땐 아래→제자리, 나갈 땐 위로
      sc.style.transform = `translateY(${y.toFixed(2)}px) scale(${(0.996 + a * 0.004 + p * 0.010).toFixed(4)})`;
    }

    // 요소 스태거 등장
    const local = t - s0;
    sc.querySelectorAll('.el').forEach((el, k) => {
      const ea = ease(clamp(0, 1, (local - (0.10 + k * 0.13)) / 0.5));
      el.style.opacity = ea.toFixed(4);
      const ty = (1 - ea) * 16;
      el.style.transform = el.classList.contains('nd')
        ? `translate(-50%,-50%) translateY(${ty.toFixed(2)}px)`
        : `translateY(${ty.toFixed(2)}px)`;
    });
  });

  // 단계형 도식(nodes/pipeline/stack): 현재 단계 요소만 점등하고 나머지는 가라앉힌다.
  if (isStepped(s) && b.ni >= 0) {
    const step = s.steps[b.ni] || {};
    const hi = step.node != null ? step.node : b.ni;                            // node 를 안 주면 단계 순서대로
    const g = ease(clamp(0, 1, u / 0.25));                                      // 비트 시작 후 0.25초에 걸쳐 점등
    scenes[b.si].querySelectorAll(STEPPED[s.type]).forEach((n, i2) => {
      const on = i2 === hi ? g : 0;
      n.style.borderColor = `rgba(46,232,122,${(0.08 + on * 0.45).toFixed(3)})`;
      n.style.color = on > 0.5 ? AC : '';
      n.style.boxShadow = on > 0.02 ? `0 0 ${(26 * on).toFixed(0)}px rgba(46,232,122,${(0.18 * on).toFixed(3)})` : 'none';
      // 지나간/아직 안 온 단계는 살짝 흐려 현재 단계가 눈에 먼저 들어오게.
      const dim = i2 === hi ? 1 : 1 - 0.42 * g;
      n.style.filter = dim < 0.999 ? `opacity(${dim.toFixed(3)})` : '';
    });
  }

  // 자막(청크 한 줄) — 청크 전환도 짧게 페이드
  const say = (isStepped(s) && b.ni >= 0) ? (s.steps[b.ni].say || '') : (s.say || '');
  if (b._caps === undefined) b._caps = splitCap(say);
  const caps = b._caps;
  if (!caps.length) { capEl.textContent = ''; capEl.style.opacity = '0'; }
  else {
    const tot = caps.reduce((a2, c) => a2 + c.length, 0) || 1;
    let a3 = 0, idx = caps.length - 1, f0 = 0, f1 = 1;
    for (let k = 0; k < caps.length; k++) {
      const fr = caps[k].length / tot;
      if (u < a3 + fr) { idx = k; f0 = a3; f1 = a3 + fr; break; }
      a3 += fr;
    }
    capEl.textContent = caps[idx];
    const cu = (u - f0) / Math.max(0.001, f1 - f0);
    capEl.style.opacity = Math.min(1, ease(clamp(0, 1, cu / 0.12)), ease(clamp(0, 1, (1 - cu) / 0.10))).toFixed(3);
  }
};
(async () => {
  try { await Promise.all(["800 150px 'Pretendard'", "500 13px 'JetBrains Mono'"].map(f => document.fonts.load(f))); } catch (e) {}
  window.__setTime(0);
})();
})();
