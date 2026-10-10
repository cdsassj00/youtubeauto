// 모션 쇼츠 엔진 — 고정 제목 · 가운데 모션 무대 · 나레이션 자막 · 배경 · 고정 꼬리말.
//
// build.mjs 가 window.load(spec) 으로 대본(비트마다 start·dur 가 채워진 것)을 넘기고,
// window.seek(t) 로 프레임을 하나씩 찍는다. 화면은 전부 "t 초의 그림"을 그리는 순수 함수다 —
// Math.random·Date.now·CSS 애니메이션을 쓰지 않으므로 몇 번을 다시 찍어도 같은 영상이 나온다.
// 모션 기법은 CDSA "브라우저의 재발견 2 · 모션·영상 능력 사전"(MV-0xx)에서 골랐다.
const W = 1080, H = 1920;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// ── 도구 ──────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
  inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outQuint: (p) => 1 - Math.pow(1 - p, 5),
  outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inCubic: (p) => p * p * p,
  outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  outElastic: (p) => (p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
// 시간·번호로 계산하는 난수(MV-001: 무작위도 결정적으로)
const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const KR = "'Pret', sans-serif";
const MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace";
const font = (w, s, fam = KR) => `${w} ${s}px ${fam}`;
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function text(s, x, y, { f, color = '#fff', align = 'left', base = 'alphabetic', ls = 0, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = f; ctx.fillStyle = color;
  ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = `${ls}px`;
  ctx.fillText(s, x, y); ctx.restore();
}
function measure(s, f, ls = 0) { ctx.save(); ctx.font = f; ctx.letterSpacing = `${ls}px`; const w = ctx.measureText(s).width; ctx.restore(); return w; }
// "*강조*" 를 조각으로
const parseEm = (s) => s.split(/(\*[^*]+\*)/).filter(Boolean).map((p) => (p.startsWith('*') ? { t: p.slice(1, -1), em: true } : { t: p, em: false }));
const plain = (s) => s.replace(/\*/g, '');
// 글자 수에 맞춰 가장 큰 폰트
function fitSize(lines, maxW, maxS, weight = 900, fam = KR) {
  let s = maxS;
  while (s > 24 && Math.max(...lines.map((l) => measure(plain(l), font(weight, s, fam), -s * 0.03))) > maxW) s -= 2;
  return s;
}

// ── 테마 ──────────────────────────────────────────────
const THEMES = {
  midnight: { bg1: '#060914', bg2: '#0E1B3D', orb1: '#2F6BFF', orb2: '#9B4DFF', ink: '#F4F6FB', mut: '#8E98B3', accent: '#FFD60A', accent2: '#5ED5EA', stage: 'rgba(255,255,255,0.045)', stageLine: 'rgba(255,255,255,0.12)', hot: '#FF453A', grainOp: 'screen', grain: 0.05 },
  paper:    { bg1: '#F3EDE1', bg2: '#E7DDCB', orb1: '#F2B8A0', orb2: '#C9D8E8', ink: '#1C2433', mut: '#7D7666', accent: '#E2492F', accent2: '#2B6CB0', stage: 'rgba(255,255,255,0.55)', stageLine: 'rgba(28,36,51,0.15)', hot: '#E2492F', grainOp: 'multiply', grain: 0.08 },
  neon:     { bg1: '#05010A', bg2: '#1A0630', orb1: '#FF2E88', orb2: '#00E5FF', ink: '#FFFFFF', mut: '#9C8FB0', accent: '#00F5D4', accent2: '#FF2E88', stage: 'rgba(255,255,255,0.04)', stageLine: 'rgba(0,245,212,0.25)', hot: '#FF2E88', grainOp: 'screen', grain: 0.05 },
};

// ── 레이아웃 (책 쇼츠 판을 따른다) ─────────────────────
const L = {
  kickerY: 150, titleY: 250, titleLH: 96,           // 고정 제목
  stage: { x: 60, y: 450, w: 960, h: 800, r: 40 },  // 모션 무대(가운데 띠)
  capY: 1350, capW: 940,                            // 나레이션 자막
  footY: 1585,                                       // 고정 꼬리말 (쇼츠 UI 위)
};

let SPEC = null, TH = THEMES.midnight;
const CACHE = {};

// ── 배경 ──────────────────────────────────────────────
let grainCv;
function grain() {
  if (!grainCv) {
    grainCv = document.createElement('canvas'); grainCv.width = 540; grainCv.height = 960;
    const g = grainCv.getContext('2d'); const img = g.createImageData(540, 960);
    let s = 7;
    for (let i = 0; i < img.data.length; i += 4) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = s >>> 24; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  ctx.save(); ctx.globalAlpha = TH.grain; ctx.globalCompositeOperation = TH.grainOp; ctx.drawImage(grainCv, 0, 0, W, H); ctx.restore();
}
function background(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, TH.bg1); g.addColorStop(1, TH.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 천천히 떠도는 빛 덩어리 두 개
  const orb = (cx, cy, r, c, a) => {
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, c + 'AA'); rg.addColorStop(1, c + '00');
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = rg; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); ctx.restore();
  };
  orb(260 + 120 * Math.sin(t * 0.21), 700 + 160 * Math.cos(t * 0.17), 620, TH.orb1, 0.35);
  orb(830 + 110 * Math.cos(t * 0.19), 1250 + 140 * Math.sin(t * 0.23), 680, TH.orb2, 0.3);
}

// ── 고정 제목 · 꼬리말 ───────────────────────────────
function header(t) {
  const a = E.outCubic(prog(t, 0, 0.6));
  text(SPEC.kicker || '', 540, L.kickerY, { f: font(800, 30), color: TH.accent, align: 'center', ls: 8, alpha: a });
  const lines = SPEC.title;
  const s = CACHE.titleSize ||= fitSize(lines, 960, 84, 900);
  lines.forEach((ln, i) => {
    const y = L.titleY + i * L.titleLH + (1 - a) * 30;
    richLine(ln, 540, y, font(900, s), TH.ink, TH.accent, 'center', -s * 0.03, a);
  });
}
function footer(t) {
  const a = prog(t, 0.3, 0.9);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = TH.stageLine; ctx.fillRect(390, L.footY - 52, 300, 2);
  text(SPEC.footer || '', 540, L.footY, { f: font(700, 32), color: TH.mut, align: 'center', ls: 2 });
  ctx.restore();
}
function richLine(s, x, y, f, color, em, align = 'left', ls = 0, alpha = 1) {
  const parts = parseEm(s); const total = measure(plain(s), f, ls);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const p of parts) { text(p.t, cx, y, { f, color: p.em ? em : color, ls, alpha }); cx += measure(p.t, f, ls); }
}

// ── 나레이션 자막 (MV-013 노래방식: 읽는 만큼 단어가 칠해진다) ──
function wrapWords(words, f, maxW) {
  const lines = [[]]; let w = 0; const sp = measure(' ', f);
  for (const wd of words) {
    const ww = measure(wd.t, f);
    if (lines.at(-1).length && w + sp + ww > maxW) { lines.push([]); w = 0; }
    lines.at(-1).push(wd); w += (lines.at(-1).length > 1 ? sp : 0) + ww;
  }
  return lines;
}
// 공백으로 단어를 나누고, 단어 안의 *강조* 조각은 따로 색을 준다 — "*스크램블*." 의 마침표가 떨어지지 않게
function capWords(say) {
  return say.split(/\s+/).filter(Boolean).map((tok) => ({ t: plain(tok), segs: parseEm(tok) }));
}
function caption(beat, lt) {
  const key = 'cap' + beat.i;
  if (!CACHE[key]) {
    const words = capWords(beat.say);
    let size = 56, lines;
    for (; size >= 40; size -= 2) { lines = wrapWords(words, font(800, size), L.capW); if (lines.length <= 2) break; }
    const total = words.reduce((a, w) => a + w.t.length, 0);
    let acc = 0; for (const w of words) { w.c0 = acc / total; acc += w.t.length; w.c1 = acc / total; }
    CACHE[key] = { lines, size };
  }
  const { lines, size } = CACHE[key];
  const f = font(800, size), lh = size * 1.32;
  const inA = E.outCubic(prog(lt, 0, 0.25)), outA = 1 - prog(lt, beat.dur - 0.12, beat.dur);
  const p = clamp((lt - 0.05) / Math.max(0.5, beat.speech || beat.dur - 0.4)); // 말한 비율
  const y0 = L.capY - ((lines.length - 1) * lh) / 2 + (1 - inA) * 18;
  const sp = measure(' ', f);
  lines.forEach((ln, li) => {
    const lw = ln.reduce((a, w, i) => a + measure(w.t, f) + (i ? sp : 0), 0);
    let x = 540 - lw / 2;
    for (const w of ln) {
      const said = p >= w.c0;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14;
      let sx = x;
      for (const sg of w.segs) {
        const col = sg.em ? TH.accent : said ? TH.ink : TH.mut;
        text(sg.t, sx, y0 + li * lh, { f, color: col, alpha: inA * outA * (said || sg.em ? 1 : 0.75) });
        sx += measure(sg.t, f);
      }
      ctx.restore();
      x += measure(w.t, f) + sp;
    }
  });
}

// ── 무대 ─────────────────────────────────────────────
function stageFrame() {
  const s = L.stage;
  ctx.save(); rr(s.x, s.y, s.w, s.h, s.r); ctx.fillStyle = TH.stage; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = TH.stageLine; ctx.stroke(); ctx.restore();
}
function withStage(fn) {
  const s = L.stage; ctx.save(); rr(s.x, s.y, s.w, s.h, s.r); ctx.clip(); ctx.translate(s.x, s.y); fn(s.w, s.h); ctx.restore();
}

// ── 모션들 (w,h = 무대 크기, lt = 비트 안 시간, d = 비트 길이, p = 매개변수) ──
const M = {};

// MV-014 키네틱 타이포: 단어가 흐릿하게 올라오고, *강조* 단어에 하이라이트 바가 쓸고 간다
M.kinetic = (w, h, lt, d, p) => {
  const lines = p.text.split('\n');
  const s = fitSize(lines, w - 120, p.size || 108);
  const lh = s * 1.25; const y0 = h / 2 - ((lines.length - 1) * lh) / 2 + s * 0.35;
  let k = 0; const step = 0.11;
  const n = lines.reduce((a, l) => a + l.split(/\s+/).length, 0);
  const barT = step * n + 0.35;
  lines.forEach((ln, li) => {
    const f = font(900, s); const total = measure(plain(ln), f, -s * 0.03);
    let x = w / 2 - total / 2; const y = y0 + li * lh;
    for (const part of parseEm(ln)) {
      for (const [wi, wd] of part.t.split(/(\s+)/).entries()) {
        if (!wd) continue;
        const ww = measure(wd, f, -s * 0.03);
        if (/\s/.test(wd)) { x += ww; continue; }
        const q = E.outCubic(prog(lt, k * step, k * step + 0.45)); k++;
        if (part.em) {
          const b = E.inOutCubic(prog(lt, barT, barT + 0.45));
          ctx.fillStyle = TH.accent; ctx.fillRect(x - 10, y - s * 0.82, (ww + 20) * b, s * 1.02);
        }
        ctx.save(); ctx.filter = `blur(${(1 - q) * 10}px)`;
        const em = part.em && prog(lt, barT + 0.2, barT + 0.3) > 0;
        text(wd, x, y + (1 - q) * 50, { f, color: em ? TH.bg1 : TH.ink, alpha: q, ls: -s * 0.03 });
        ctx.restore();
        x += ww;
      }
    }
  });
};

// MV-011 스크램블 디코드: 무작위 한글 음절이 앞에서부터 제자리를 찾는다
M.scramble = (w, h, lt, d, p) => {
  const chars = [...p.text];
  const s = fitSize([p.text], w - 100, 100, 900);
  const f = font(900, s);
  const per = Math.min(0.09, 1.4 / chars.length);
  text(p.label || 'DECODING', w / 2, h / 2 - s - 40, { f: font(700, 26, MONO), color: TH.accent2, align: 'center', ls: 10, alpha: 0.9 });
  let x = w / 2 - measure(p.text, f) / 2;
  chars.forEach((c, i) => {
    const done = lt > 0.25 + i * per;
    const frame = Math.floor(lt * 18);
    const ch = c === ' ' ? ' ' : done ? c : String.fromCharCode(0xac00 + Math.floor(hash(i, frame) * 11172));
    const cw = measure(c, f);
    text(ch, x + cw / 2, h / 2 + s * 0.35, { f, color: done ? TH.ink : TH.accent2, align: 'center', alpha: done ? 1 : 0.55 });
    x += cw;
  });
  // 스캔라인
  const sy = (lt * 380) % h;
  ctx.fillStyle = TH.accent2 + '22'; ctx.fillRect(0, sy, w, 3);
  const doneAll = 0.25 + chars.length * per;
  const ok = E.outBack(prog(lt, doneAll + 0.1, doneAll + 0.45));
  if (ok > 0) text('✓ COMPLETE', w / 2, h / 2 + s + 70, { f: font(800, 28, MONO), color: TH.accent, align: 'center', ls: 6, alpha: clamp(ok) });
};

// MV-012 타이핑 커서: 프롬프트가 한 글자씩, AI 는 점 세 개 뒤에 답한다
M.typing = (w, h, lt, d, p) => {
  const pad = 56, bw = w - pad * 2;
  const f = font(600, 46), lh = 62;
  const bubble = (x, y, txt, me, a) => {
    const lines = wrap(txt, f, bw - 140);
    const tw = Math.max(...lines.map((l) => measure(l, f)), 80) + 64, th = lines.length * lh + 44;
    const bx = me ? x + bw - tw : x;
    ctx.save(); ctx.globalAlpha = a; rr(bx, y, tw, th, 30);
    ctx.fillStyle = me ? TH.accent2 : 'rgba(255,255,255,0.10)'; ctx.fill();
    lines.forEach((l, i) => text(l, bx + 32, y + 22 + lh * (i + 0.72), { f, color: me ? TH.bg1 : TH.ink }));
    ctx.restore(); return th;
  };
  const pc = [...p.prompt]; const tPer = 0.075;
  const typed = Math.min(pc.length, Math.floor(lt / tPer));
  const cursor = Math.floor(lt * 2.2) % 2 === 0 && typed < pc.length + 6 ? '▍' : '';
  text(p.app || 'AI 채팅', pad, 86, { f: font(800, 30), color: TH.mut, ls: 4 });
  const h1 = bubble(pad, 140, pc.slice(0, typed).join('') + cursor, true, prog(lt, 0, 0.15));
  const t2 = pc.length * tPer + 0.4;
  if (lt > t2) {
    const y2 = 140 + h1 + 36;
    if (lt < t2 + 0.9) {
      ctx.save(); rr(pad, y2, 170, 92, 30); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = TH.ink; ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(lt * 8 - i * 0.9)); ctx.beginPath(); ctx.arc(pad + 50 + i * 36, y2 + 46, 9, 0, 7); ctx.fill(); }
      ctx.restore();
    } else {
      const rc = [...p.reply]; const n = Math.min(rc.length, Math.floor((lt - t2 - 0.9) / 0.035));
      bubble(pad, y2, rc.slice(0, n).join(''), false, 1);
    }
  }
};
function wrap(s, f, maxW) {
  const out = ['']; for (const ch of [...s]) { if (ch === '\n') { out.push(''); continue; } if (measure(out.at(-1) + ch, f) > maxW && out.at(-1)) out.push(ch); else out[out.length - 1] += ch; }
  return out;
}

// MV-016 + MV-017 선이 그려지는 손그림 도식: 상자와 화살표가 펜으로 차례차례 그려진다
function roughPts(pts, seed, amp = 3) { // 꼭짓점 사이를 잘게 나눠 흔들어 손맛을 낸다
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const n = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 18));
    for (let k = 0; k < n; k++) { const q = k / n; out.push([lerp(x1, x2, q) + (hash(seed, i * 50 + k) - 0.5) * amp, lerp(y1, y2, q) + (hash(seed + 9, i * 50 + k) - 0.5) * amp]); }
  }
  out.push(pts.at(-1)); return out;
}
function drawPartial(pts, q) {
  if (q <= 0) return; const len = []; let L0 = 0;
  for (let i = 1; i < pts.length; i++) { L0 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(L0); }
  const lim = L0 * q; ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    if (len[i - 1] <= lim) ctx.lineTo(...pts[i]);
    else { const prev = i > 1 ? len[i - 2] : 0; const r = (lim - prev) / (len[i - 1] - prev); ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], r), lerp(pts[i - 1][1], pts[i][1], r)); break; }
  }
  ctx.stroke();
}
M.flow = (w, h, lt, d, p) => {
  const n = p.nodes.length;
  const pos = n <= 3 ? p.nodes.map((_, i) => [w / 2, 150 + i * ((h - 300) / Math.max(1, n - 1))])
    : p.nodes.map((_, i) => [i % 2 ? w - 250 : 250, 150 + Math.floor(i / 2) * ((h - 300) / Math.max(1, Math.ceil(n / 2) - 1)) + (i % 2 ? 0 : 0)]);
  // 지그재그(4개면 ㄹ자): 0→1→3→2 가 아니라 0→1, 1→2(아래로), 2→3 순서가 보이게 배치
  if (n === 4) { pos[0] = [230, 200]; pos[1] = [w - 230, 200]; pos[2] = [w - 230, h - 200]; pos[3] = [230, h - 200]; }
  const bw = 330, bh = 130, seg = Math.min(0.6, (d - 0.8) / (n * 1.15));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  p.nodes.forEach((label, i) => {
    const t0 = 0.1 + i * seg * 1.15; const [cx, cy] = pos[i];
    const box = [[cx - bw / 2, cy - bh / 2], [cx + bw / 2, cy - bh / 2], [cx + bw / 2, cy + bh / 2], [cx - bw / 2, cy + bh / 2], [cx - bw / 2, cy - bh / 2]];
    const q = E.inOutCubic(prog(lt, t0, t0 + seg));
    const fillA = prog(lt, t0 + seg * 0.8, t0 + seg + 0.2);
    if (fillA > 0) { ctx.save(); ctx.globalAlpha = fillA * 0.9; ctx.fillStyle = i === n - 1 ? TH.accent : TH.accent2 + '33'; rr(cx - bw / 2, cy - bh / 2, bw, bh, 18); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = TH.ink; ctx.lineWidth = 5; drawPartial(roughPts(box, i * 7 + 1), q);
    ctx.lineWidth = 2; ctx.globalAlpha = 0.6; drawPartial(roughPts(box, i * 7 + 3, 5), q); ctx.globalAlpha = 1;
    text(label, cx, cy + 16, { f: font(800, 46), color: i === n - 1 && fillA > 0.5 ? TH.bg1 : TH.ink, align: 'center', alpha: fillA });
    if (i < n - 1) { // 다음 상자로 가는 화살표
      const [nx, ny] = pos[i + 1]; const ta = t0 + seg; const qa = E.inOutCubic(prog(lt, ta, ta + seg * 0.5));
      let a, b;
      if (Math.abs(nx - cx) > Math.abs(ny - cy)) { const sx = Math.sign(nx - cx); a = [cx + sx * (bw / 2 + 20), cy]; b = [nx - sx * (bw / 2 + 20), ny]; }
      else { const sy = Math.sign(ny - cy); a = [cx, cy + sy * (bh / 2 + 20)]; b = [nx, ny - sy * (bh / 2 + 20)]; }
      ctx.strokeStyle = TH.accent; ctx.lineWidth = 6; drawPartial(roughPts([a, b], 40 + i), qa);
      if (qa >= 1) { const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); ctx.beginPath(); ctx.moveTo(b[0] - 26 * Math.cos(ang - 0.5), b[1] - 26 * Math.sin(ang - 0.5)); ctx.lineTo(...b); ctx.lineTo(b[0] - 26 * Math.cos(ang + 0.5), b[1] - 26 * Math.sin(ang + 0.5)); ctx.stroke(); }
    }
  });
};

// MV-024 입자: 흩어진 점들이 글자 모양으로 모인다
function particleTargets(key, str, w, h) {
  if (CACHE[key]) return CACHE[key];
  const off = document.createElement('canvas'); off.width = w; off.height = h; const g = off.getContext('2d');
  let s = 420; g.font = font(900, s); while (g.measureText(str).width > w - 120 && s > 80) { s -= 10; g.font = font(900, s); }
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, w / 2, h / 2 + s * 0.05);
  const data = g.getImageData(0, 0, w, h).data; const pts = []; const step = 9;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 128) pts.push([x, y]);
  return (CACHE[key] = pts);
}
M.particles = (w, h, lt, d, p) => {
  const pts = particleTargets('pt' + p.text, p.text, w, h);
  const out = p.scatterEnd ? E.inCubic(prog(lt, d - 0.7, d)) : 0;
  pts.forEach(([tx, ty], i) => {
    const sx = hash(i, 1) * w, sy = hash(i, 2) * h;
    const q = E.outQuint(prog(lt, 0.1 + hash(i, 3) * 0.6, 1.3 + hash(i, 3) * 0.6));
    const wob = Math.sin(lt * 2 + i) * 1.5 * q;
    const ex = (tx - w / 2) * out * 1.6, ey = (ty - h / 2) * out * 1.6;
    const x = lerp(sx, tx, q) + wob + ex, y = lerp(sy, ty, q) + wob + ey;
    ctx.fillStyle = tx / w + q * 0.2 > 0.6 ? TH.accent : TH.accent2;
    ctx.globalAlpha = 0.35 + 0.65 * q; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;
  if (p.label) text(p.label, w / 2, h - 70, { f: font(700, 34), color: TH.mut, align: 'center', alpha: prog(lt, 1.6, 2.1) });
};

// MV-019 카운터: 숫자가 올라가며 점 격자가 하나씩 켜진다
M.counter = (w, h, lt, d, p) => {
  const q = E.outExpo(prog(lt, 0.2, 0.2 + (p.dur || 1.8)));
  const v = Math.round(lerp(p.from || 0, p.to, q));
  text(p.label || '', w / 2, 120, { f: font(700, 38), color: TH.mut, align: 'center' });
  const big = font(900, 230); const unit = p.unit || '';
  const nw = measure(String(v), big, -8), uw = measure(unit, font(800, 80));
  text(String(v), w / 2 - (uw + 12) / 2, 370, { f: big, color: TH.ink, align: 'center', ls: -8 });
  text(unit, w / 2 + nw / 2 - (uw + 12) / 2 + 12, 370, { f: font(800, 80), color: TH.accent });
  if (p.grid) { // 1칸 = 1개
    const cols = 13, n = p.to, gs = 52, gx = w / 2 - (cols * gs) / 2, gy = 450;
    for (let i = 0; i < n; i++) {
      const on = i < v; const x = gx + (i % cols) * gs + gs / 2, y = gy + Math.floor(i / cols) * gs + gs / 2;
      const pop = on ? 1 + 0.4 * Math.max(0, 1 - (q * n - i) / 3) : 1;
      ctx.fillStyle = on ? (i % 7 === 0 ? TH.accent : TH.accent2) : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(x, y, 15 * Math.min(pop, 1.3), 0, 7); ctx.fill();
    }
  }
};

// MV-010 글자 속 영상: 흰 글자로 먼저 읽히고, 안에 흐르는 그라데이션이 차오른 뒤 글자 속으로 뚫고 들어간다
M.textclip = (w, h, lt, d, p) => {
  // 글자를 따로 그린 캔버스 안에서만 색을 채운다 — 무대 전체에 번지지 않게
  const off = (CACHE.tcCv ||= document.createElement('canvas')); off.width = w; off.height = h;
  const g = off.getContext('2d');
  const s = fitSize([p.word], w - 80, 360, 900);
  g.font = font(900, s); g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = `${-s * 0.04}px`;
  const fill = prog(lt, 0.5, 1.1);
  g.fillStyle = TH.ink; g.fillText(p.word, w / 2, h / 2);                 // 먼저 글자로 읽힌다
  g.globalCompositeOperation = 'source-atop';
  const sh = (lt * 300) % w;
  const gr = g.createLinearGradient(sh - w, 0, sh + w, h);
  gr.addColorStop(0, TH.accent2); gr.addColorStop(0.35, TH.orb2); gr.addColorStop(0.6, TH.accent); gr.addColorStop(1, TH.accent2);
  g.globalAlpha = fill; g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.globalAlpha = fill * 0.28; g.fillStyle = '#fff';
  for (let k = 0; k < 4; k++) g.fillRect(0, h / 2 - s / 2 + ((lt * 140 + k * s / 4) % s), w, 12);   // 흐르는 물결
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const zoom = E.inCubic(prog(lt, d - 0.9, d));
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1 + zoom * 9, 1 + zoom * 9); ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 24; ctx.drawImage(off, 0, 0);
  ctx.restore();
  if (zoom > 0) { ctx.fillStyle = TH.accent; ctx.globalAlpha = E.inCubic(prog(lt, d - 0.3, d)); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
};

// MV-025 물리: 블록이 떨어져 튕기며 쌓인다(한 번 계산한 궤적을 재생 — 매번 같다)
M.physics = (w, h, lt, d, p) => {
  const items = p.items; const bh = 96, floor = h - 60, g = 3200;
  const cols = 3, colW = (w - 120) / cols; const heights = [0, 0, 0];
  items.forEach((label, i) => {
    const c = i % cols; const t0 = 0.15 + i * (p.gap || 0.32);
    const restY = floor - bh * (heights[c] + 1); heights[c]++;
    const startY = -bh - 40; const fallT = Math.sqrt((2 * (restY - startY)) / g);
    let y;
    if (lt < t0) return;
    const tt = lt - t0;
    if (tt < fallT) y = startY + 0.5 * g * tt * tt;
    else { const b = tt - fallT; y = restY - Math.abs(Math.sin(b * 14)) * 60 * Math.exp(-b * 7); }
    const x = 60 + c * colW + 10; const bw = colW - 20;
    const tilt = (hash(i, 5) - 0.5) * 0.08 * Math.exp(-Math.max(0, tt - fallT) * 6);
    ctx.save(); ctx.translate(x + bw / 2, y + bh / 2); ctx.rotate(tilt);
    rr(-bw / 2, -bh / 2, bw, bh - 8, 18); ctx.fillStyle = [TH.accent, TH.accent2, TH.hot][i % 3]; ctx.fill();
    text(label, 0, 14, { f: font(800, 38), color: TH.bg1, align: 'center' });
    ctx.restore();
  });
  ctx.fillStyle = TH.stageLine; ctx.fillRect(40, floor, w - 80, 4);
};

// MV-037 프리즈 + 도장: 화면이 멈추며 빨간 도장이 쾅
M.stamp = (w, h, lt, d, p) => {
  const t0 = p.at || 0.9;
  const shake = lt > t0 && lt < t0 + 0.22 ? (hash(Math.floor(lt * 60), 1) - 0.5) * 22 : 0;
  ctx.save(); ctx.translate(shake, shake * 0.6);
  const s = fitSize([p.text], w - 120, 150, 800, p.mono ? MONO : KR);
  const freeze = lt > t0;
  text(p.text, w / 2, h / 2 - 20, { f: font(800, s, p.mono ? MONO : KR), color: freeze ? TH.mut : TH.ink, align: 'center', alpha: prog(lt, 0, 0.3) });
  if (p.sub) text(p.sub, w / 2, h / 2 + s * 0.6, { f: font(600, 38), color: TH.mut, align: 'center', alpha: prog(lt, 0.2, 0.5) });
  ctx.restore();
  if (lt > t0) {
    const q = E.outBack(prog(lt, t0, t0 + 0.28), 2.2); const sc = lerp(2.4, 1, clamp(q, 0, 1.2));
    ctx.save(); ctx.translate(w / 2 + 120, h / 2 + 160); ctx.rotate(-0.21); ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(prog(lt, t0, t0 + 0.08));
    const sw = measure(p.stamp, font(900, 76)) + 80;
    ctx.strokeStyle = TH.hot; ctx.lineWidth = 9; rr(-sw / 2, -70, sw, 128, 14); ctx.stroke();
    ctx.lineWidth = 3; rr(-sw / 2 + 12, -58, sw - 24, 104, 8); ctx.stroke();
    text(p.stamp, 0, 22, { f: font(900, 76), color: TH.hot, align: 'center' });
    ctx.restore();
    const fl = 1 - prog(lt, t0, t0 + 0.18); if (fl > 0) { ctx.fillStyle = '#fff'; ctx.globalAlpha = fl * 0.35; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  }
};

// MV-026 입체 카드: 카드가 한 장씩 뒤집히며 나타난다
M.cards = (w, h, lt, d, p) => {
  const n = p.items.length, cw = (w - 80 - (n - 1) * 24) / n, ch = h - 260;
  p.items.forEach((it, i) => {
    const q = E.outBack(prog(lt, 0.2 + i * 0.35, 0.8 + i * 0.35), 1.2);
    const sx = Math.cos((1 - clamp(q)) * Math.PI / 2); if (sx <= 0.01) return;
    const x = 40 + i * (cw + 24) + cw / 2, y = h / 2;
    ctx.save(); ctx.translate(x, y + (1 - clamp(q)) * 60); ctx.scale(sx, 1);
    rr(-cw / 2, -ch / 2, cw, ch, 28); ctx.fillStyle = i === n - 1 ? TH.accent : 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = TH.stageLine; ctx.stroke();
    const dark = i === n - 1;
    text(it.big || String(i + 1), 0, -50, { f: font(900, 140), color: dark ? TH.bg1 : TH.accent, align: 'center' });
    wrap(it.text, font(800, 42), cw - 40).forEach((l, k) => text(l, 0, 80 + k * 54, { f: font(800, 42), color: dark ? TH.bg1 : TH.ink, align: 'center' }));
    ctx.restore();
  });
};

// ── 장면 전환 (MV-020 원형 조리개) ─────────────────────
function drawBeat(b, t) {
  const lt = t - b.start; const fn = M[b.motion] || M.kinetic;
  withStage((w, h) => fn(w, h, Math.max(0, lt), b.dur, b.p || {}));
}

window.load = async (spec) => {
  SPEC = spec; TH = THEMES[spec.theme] || THEMES.midnight;
  for (const k of Object.keys(CACHE)) delete CACHE[k];
  const pret = new FontFace('Pret', "url('pretendard.woff2')", { weight: '100 900' });
  document.fonts.add(await pret.load());
  for (const w of [500, 600, 700, 800, 900]) await document.fonts.load(`${w} 40px Pret`, '가A1');
  spec.beats.forEach((b, i) => (b.i = i));
  window.seek(0);
  return { duration: spec.duration };
};

window.seek = (t) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  background(t);
  stageFrame();
  const beats = SPEC.beats;
  let cur = beats.findIndex((b) => t >= b.start && t < b.start + b.dur);
  if (cur < 0) cur = t < beats[0].start ? 0 : beats.length - 1;
  const b = beats[cur]; const lt = t - b.start;
  const tr = 0.4;
  if (cur > 0 && lt < tr) { // 이전 장면 위로 새 장면이 원형으로 열린다
    const prev = beats[cur - 1]; drawBeat(prev, prev.start + prev.dur - 0.001);
    const s = L.stage; const R = Math.hypot(s.w, s.h) * E.inOutCubic(lt / tr);
    ctx.save(); ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, R, 0, 7); ctx.clip(); stageFrameFill(); drawBeat(b, t); ctx.restore();
  } else drawBeat(b, t);
  if (t >= b.start) caption(b, lt);
  header(t);
  footer(t);
  grain();
};
function stageFrameFill() { const s = L.stage; ctx.save(); rr(s.x, s.y, s.w, s.h, s.r); ctx.fillStyle = TH.bg2; ctx.fill(); ctx.fillStyle = TH.stage; ctx.fill(); ctx.restore(); }
