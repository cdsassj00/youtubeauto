// 주식 쇼츠 — video-studio 모션 ainews 프리셋 위에 얹는 장면 틀. scripts/stock-studio.mjs 가 맨 위 D 를 채워 넣는다.
// 숫자는 전부 D(= stockontology.cc horizons 응답) 에서만 온다. 빨강 = 목표(오름), 파랑 = 손절(내림) — 한국 시세 관례.
// 시간 지정('w12' 등)도 생성기가 대본 단어 번호로 계산해 D.T 에 넣는다 — 여기서 단어를 찾지 않는다.
/*__DATA__*/
const { C, E, prog, lerp, clamp, txt, f, NUM, drawPoly, ping, stamp, comma, typewriter, scramble, measure, K } = MS;
const TABS = ['단타', '스윙', '중기', '장기'];
const TX = [180, 420, 660, 900];                       // four column centres on the 1080 stage
// light paper styles (whiteboard, scrapbook): dark ink, white cards, deeper yellow — the kit defaults are for dark stages
const LIGHT = D.theme === 'light';
if (LIGHT) Object.assign(C, { line: '#1d2433', dim: '#5b6474', yel: '#e8a400' });
const CARD = LIGHT ? 'rgba(255,255,255,0.9)' : '#0b1220';
const INK_ON_YEL = '#111';
const TG = LIGHT ? '#1688c7' : '#2aabee';   // Telegram blue, darker on paper
const money = (v) => (D.market === 'US' ? '$' + Number(v).toFixed(2) : comma(v) + '원');

// a label that must fit maxW: one line, else split in two (at a space near the middle for Latin names), else shrink
const fitText = (g, s, x, y, maxW, size, opts = {}) => {
  const fnt = (sz) => f(opts.weight || 900, sz);
  if (measure(g, s, fnt(size)) <= maxW) return txt(g, s, x, y, { ...opts, font: fnt(size) });
  let a, b; const sp = [...s.matchAll(/ /g)].map((m) => m.index);
  if (sp.length) { const mid = s.length / 2; const i = sp.reduce((p, q) => (Math.abs(q - mid) < Math.abs(p - mid) ? q : p)); a = s.slice(0, i); b = s.slice(i + 1); }
  else { const ch = [...s]; const h = Math.ceil(ch.length / 2); a = ch.slice(0, h).join(''); b = ch.slice(h).join(''); }
  let sz = size * 0.9; while (sz > 14 && Math.max(measure(g, a, fnt(sz)), measure(g, b, fnt(sz))) > maxW) sz -= 1;
  txt(g, a, x, y - sz * 0.6, { ...opts, font: fnt(sz) }); txt(g, b, x, y + sz * 0.6, { ...opts, font: fnt(sz) });
};

// tab row: pops one tab per time in `ts` (scene-relative); the active one glows yellow
const tabRow = (g, lt, ts, y = 90, hot = -1) => TABS.forEach((name, i) => {
  const a = E.outBack(prog(lt, ts[i] - 0.15, ts[i] + 0.2)); if (a <= 0) return;
  const on = hot === i || (hot < 0 && lt >= ts[i] && (i === 3 || lt < ts[i + 1]));
  g.save(); g.translate(TX[i], y); g.scale(a, a);
  K.panel(g, -100, -38, 200, 76, { fill: on ? C.yel : CARD, stroke: on ? C.yel : C.dim, r: 38 });
  txt(g, name, 0, 2, { font: f(900, 40), color: on ? '#111' : C.line }); g.restore();
  if (lt > ts[i]) ping(g, TX[i], y, lt - ts[i], { r1: 120 });
});

// 1. four horizon tabs land on the four spoken words
const tabsPop = (g, lt, o) => {
  tabRow(g, lt, [o.tW0, o.tW1, o.tW2, o.tW3], 200);
  txt(g, typewriter('보유 기간 네 구간', prog(lt, 0.2, 1.2)), 540, 330, { font: f(700, 34), color: C.dim });
};

// 2. a "1위 ?" card under every tab scrambles, then resolves to each bucket's #1 at tSame
const sameTop = (g, lt, o) => {
  tabRow(g, lt, [0, 0.08, 0.16, 0.24], 70, 9);
  TABS.forEach((_, i) => {
    const a = prog(lt, 0.2 + i * 0.1, 0.5 + i * 0.1); const done = lt > o.tSame;
    K.panel(g, TX[i] - 105, 140, 210, 200, { fill: CARD, stroke: done && D.same ? C.yel : C.dim, lw: done ? 5 : 3, a });
    txt(g, '1위', TX[i], 180, { font: f(800, 30), color: C.dim, alpha: a });
    if (!done) txt(g, scramble('??????', 0, lt + i), TX[i], 260, { font: f(900, 32), color: C.line, alpha: a });
    else fitText(g, D.tops[i], TX[i], 262, 190, 34, { color: D.same ? C.yel : C.line });
  });
  if (lt > o.tSame) { drawPoly(g, [[75, 370], [1005, 370]], prog(lt, o.tSame, o.tSame + 0.35), { width: 6, color: D.same ? C.yel : C.dim, glow: 16 });
    stamp(g, D.same ? '같은 종목' : '제각각', 540, 420, lt - o.tSame - 0.25, { color: C.red, size: 56, rot: -0.05 }); }
};

// 3. next-session calendar card + site browser
const sessionCard = (g, lt, o) => {
  const a = E.outBack(prog(lt, 0, 0.35));
  g.save(); g.translate(260, 230); g.scale(a, a);
  K.panel(g, -150, -150, 300, 300, { fill: CARD, stroke: C.red, lw: 4 });
  g.fillStyle = C.red; g.beginPath(); g.roundRect(-150, -150, 300, 70, [14, 14, 0, 0]); g.fill();
  txt(g, D.month, 0, -112, { font: f(900, 38), color: '#fff' });
  txt(g, D.day, 0, 10, { font: f(900, 130, NUM), color: C.line });
  txt(g, D.dayLabel, 0, 105, { font: f(800, 30), color: C.dim }); g.restore();
  K.browser(g, 480, 90, 520, 280, 'stockontology.cc', prog(lt, o.tSite - 0.4, o.tSite));
  if (lt > o.tSite) { txt(g, typewriter('오늘의 추천', prog(lt, o.tSite, o.tSite + 0.5)), 740, 200, { font: f(900, 48), color: C.line });
    txt(g, '단타 · 스윙 · 중기 · 장기', 740, 275, { font: f(700, 30), color: C.yel, alpha: prog(lt, o.tSite + 0.4, o.tSite + 0.7) });
    ping(g, 740, 230, lt - o.tSite, { r1: 220 }); }
};

// 4. #1 reveal: sector + price scramble in, then the name pops
const topReveal = (g, lt, o) => {
  K.panel(g, 170, 70, 740, 320, { fill: CARD, stroke: lt > o.tB ? C.blue : C.dim, lw: 4 });
  txt(g, '1위 · ' + D.top.sector, 540, 120, { font: f(700, 30), color: C.dim, alpha: prog(lt, 0, 0.3) });
  txt(g, scramble(D.top.price, prog(lt, 0.1, o.tA), lt), 540, 195, { font: f(900, 56, NUM), color: C.line });
  if (lt > o.tB) { const e = E.outBack(prog(lt, o.tB - 0.1, o.tB + 0.2)); g.save(); g.translate(540, 300); g.scale(e, e);
    fitText(g, D.top.name, 0, 0, 680, 64, { color: C.blue }); g.restore(); ping(g, 540, 300, lt - o.tB, { color: C.blue, r1: 300 }); }
};

// 5. the site's reason: macro move counts up, arrow into the sector sensitivity bar
const reason = (g, lt, o) => {
  const R = D.reason;
  K.panel(g, 70, 110, 380, 230, { fill: CARD, stroke: C.dim, a: prog(lt, 0, 0.3) });
  fitText(g, R.label, 260, 160, 340, 34, { weight: 800, color: C.dim });
  const p = E.outCubic(prog(lt, o.tMove - 0.6, o.tMove));
  txt(g, (R.pct >= 0 ? '+' : '−') + (Math.abs(R.pct) * p).toFixed(2) + '%', 260, 255, { font: f(900, 80, NUM), color: p >= 1 ? (R.pct >= 0 ? C.red : C.blue) : C.line });
  if (lt > o.tMove) ping(g, 260, 240, lt - o.tMove, { color: R.pct >= 0 ? C.red : C.blue, r1: 200 });
  drawPoly(g, [[470, 225], [600, 225]], prog(lt, o.tMove, o.tMove + 0.4), { width: 8, color: C.yel, glow: 12 });
  K.panel(g, 620, 110, 400, 230, { fill: CARD, stroke: lt > o.tFill ? C.yel : C.dim, lw: 4, a: prog(lt, o.tMove, o.tMove + 0.3) });
  fitText(g, R.sector + ' 민감도', 820, 160, 360, 34, { weight: 800, color: C.dim, alpha: prog(lt, o.tMove, o.tMove + 0.3) });
  const q = E.outCubic(prog(lt, o.tFill - 0.5, o.tFill + 0.2)); const w = Math.min(1, Math.abs(R.sens));
  g.fillStyle = 'rgba(93,107,128,0.35)'; g.fillRect(660, 240, 320, 30);
  g.fillStyle = R.sens >= 0 ? C.red : C.blue; g.fillRect(660, 240, 320 * w * q, 30);
  txt(g, (R.sens >= 0 ? '+' : '−') + (Math.abs(R.sens) * q).toFixed(2), 820, 305, { font: f(900, 46, NUM), color: q >= 1 ? C.yel : C.line });
};

// 6. second row lights up across the buckets it appears in
const secondRow = (g, lt, o) => {
  tabRow(g, lt, [0, 0.06, 0.12, 0.18], 70, 9);
  TABS.forEach((_, i) => {
    K.panel(g, TX[i] - 105, 130, 210, 90, { fill: CARD, stroke: C.dim, a: 0.6 });
    fitText(g, '1 ' + D.tops[i], TX[i], 175, 190, 24, { weight: 700, color: C.dim });
    const has = D.second.in[i]; const on = has ? prog(lt, o.tRow + i * 0.12, o.tRow + i * 0.12 + 0.25) : 0;
    K.panel(g, TX[i] - 105, 240, 210, 100, { fill: on > 0.5 ? 'rgba(255,214,40,0.18)' : CARD, stroke: on > 0.5 ? C.yel : C.dim, lw: 4 });
    fitText(g, has ? D.second.name : '—', TX[i], 292, 190, 36, { color: on > 0.5 ? C.yel : C.dim });
    if (on > 0) ping(g, TX[i], 290, lt - o.tRow - i * 0.12, { r1: 110 });
  });
  if (lt > o.tCommon && D.second.count >= 2) stamp(g, D.second.count + '구간 공통', 540, 410, lt - o.tCommon, { color: C.red, size: 50, rot: -0.04 });
};

// 7-8. price ladder: current price, target line climbs (red) at tTarget, stop drops (blue) at tStop
const ladder = (g, lt, o) => {
  const L = D.ladders[o.i]; const { now, target, tp, stop, sp, sup, res } = L;
  // scale to stop..target (a far-away level would squash the lines together); a level beyond the edge is pinned there
  const lo = Math.min(stop, sup ? Math.max(sup.price, stop * 0.9) : stop) * 0.97, hi = Math.max(target, res ? Math.min(res.price, target * 1.06) : target) * 1.03;
  const Y = (v) => clamp(lerp(420, 40, (v - lo) / (hi - lo)), 40, 420);
  K.panel(g, 40, 32, 180, 76, { fill: C.yel, stroke: C.yel, r: 38 }); txt(g, L.tab, 130, 72, { font: f(900, 44), color: '#111' });
  fitText(g, L.name, 130, 150, 230, 24, { weight: 800, color: C.dim });
  drawPoly(g, [[300, 430], [300, 30]], prog(lt, 0, 0.3), { width: 3, color: C.dim });
  const yn = Y(now); drawPoly(g, [[290, yn], [980, yn]], prog(lt, 0.1, 0.45), { width: 4, color: C.line, dash: [10, 10] });
  txt(g, '현재 ' + money(now), 320, yn - 24, { align: 'left', font: f(800, 30), color: C.line, alpha: prog(lt, 0.2, 0.5) });
  const p = E.outCubic(prog(lt, o.tTarget - 0.45, o.tTarget)); const yt = lerp(yn, Y(target), p);
  drawPoly(g, [[290, yt], [980, yt]], clamp(p * 3), { width: 8, color: C.red, glow: 18 });
  txt(g, '목표 ' + money(lerp(now, target, p)), 700, yt - 34, { font: f(900, 40, NUM), color: C.red, alpha: clamp(p * 3) });
  if (lt > o.tTarget) { K.pill(g, 900, yt - 34, '+' + tp + '%', { color: C.red, w: 150, h: 52, size: 32 }); ping(g, 300, yt, lt - o.tTarget, { color: C.red, r1: 120 }); }
  const q = E.outCubic(prog(lt, o.tStop - 0.45, o.tStop)); const ys = lerp(yn, Y(stop), q);
  drawPoly(g, [[290, ys], [980, ys]], clamp(q * 3), { width: 8, color: C.blue, glow: 18 });
  txt(g, '손절 ' + money(lerp(now, stop, q)), 700, ys + 40, { font: f(900, 40, NUM), color: C.blue, alpha: clamp(q * 3) });
  if (lt > o.tStop) { K.pill(g, 900, ys + 40, '−' + Math.abs(sp) + '%', { color: C.blue, w: 150, h: 52, size: 32 }); ping(g, 300, ys, lt - o.tStop, { color: C.blue, r1: 120 }); }
  // support / resistance from the site (plan.nearestSupport / nearestResistance): dashed lines drawn on when spoken
  [[sup, o.tSup, C.green, '지지'], [res, o.tRes, '#ff9f43', '저항']].forEach(([lv, t, col, word]) => {
    if (!lv || t == null) return; const yl = Y(lv.price); const p = prog(lt, t - 0.1, t + 0.35); if (p <= 0) return;
    drawPoly(g, [[300, yl], [980, yl]], p, { width: 5, color: col, dash: [16, 10], glow: 10 });
    // label on the side away from its neighbour line (support vs stop, resistance vs target) so the two never overlap
    const above = word === '지지' ? lv.price >= stop : !(target && lv.price < target);
    const off = (word === '저항' && Y(lv.price) <= 40) || (word === '지지' && Y(lv.price) >= 420) ? (word === '저항' ? ' ↑' : ' ↓') : '';
    txt(g, word + ' ' + money(lv.price) + off + ' · ' + lv.label, 320, yl + (above ? -22 : 30), { align: 'left', font: f(800, 28), color: col, alpha: clamp(p * 2) });
    if (lt > t) ping(g, 300, yl, lt - t, { color: col, r1: 100 }); });
};

// 9. long: the target slot is struck out, stamp "목표 없음"
const noTarget = (g, lt, o) => {
  K.panel(g, 40, 32, 180, 76, { fill: C.yel, stroke: C.yel, r: 38 }); txt(g, '장기', 130, 72, { font: f(900, 44), color: '#111' });
  K.panel(g, 280, 110, 520, 130, { fill: CARD, stroke: C.dim, a: prog(lt, 0, 0.3) });
  txt(g, '목표가', 400, 175, { font: f(800, 40), color: C.dim, alpha: prog(lt, 0, 0.3) });
  txt(g, lt > o.tNone ? '—' : scramble(money(D.ladders[1].target), 0.3, lt), 640, 175, { font: f(900, 44, NUM), color: C.line });
  if (lt > o.tNone) { drawPoly(g, [[300, 175], [780, 175]], prog(lt, o.tNone, o.tNone + 0.25), { width: 10, color: C.red });
    stamp(g, '목표 없음', 540, 340, lt - o.tNone - 0.15, { color: C.red, size: 64, rot: -0.07 }); }
};

// 10. trailing stop: price climbs to a peak, the −N% line follows it up, then the price falls onto it at tHit
const trailing = (g, lt, o) => {
  const N = 60, pts = []; const peakI = 38; const k = 1 - D.longStop / 100;
  for (let i = 0; i <= N; i++) { const x = lerp(120, 980, i / N);
    const v = i <= peakI ? 1 + 0.55 * (i / peakI) + 0.04 * Math.sin(i * 1.3) : 1.55 - 1.55 * (1 - k) * 1.05 * ((i - peakI) / (N - peakI)) ** 1.4 + 0.03 * Math.sin(i * 1.7);
    pts.push([x, v]); }
  const Y = (v) => lerp(420, 50, (v - 0.75) / 0.9);
  const p = prog(lt, 0.1, o.tHit); const shown = Math.max(2, Math.floor(p * N) + 1);
  let peak = 0; const trail = [];
  pts.slice(0, shown).forEach(([x, v]) => { peak = Math.max(peak, v); trail.push([x, Y(peak * k)]); });
  drawPoly(g, pts.slice(0, shown).map(([x, v]) => [x, Y(v)]), 1, { width: 6, color: C.line, glow: 8 });
  drawPoly(g, trail, 1, { width: 5, color: C.blue, dash: [14, 10] });
  const last = trail[trail.length - 1]; txt(g, '고점 −' + D.longStop + '%', last[0] - 10, last[1] + 34, { font: f(900, 32), color: C.blue, align: 'right' });
  if (shown > peakI) { const [px, pv] = pts[peakI]; txt(g, '고점', px, Y(pv) - 30, { font: f(800, 30), color: C.yel }); }
  if (lt > o.tHit) { ping(g, last[0], last[1], lt - o.tHit, { color: C.blue, r1: 140 }); stamp(g, '정리', 330, 110, lt - o.tHit, { color: C.blue, size: 60, rot: 0.08 }); }
};

// 11. two more picks slide in, one per spoken name
const morePicks = (g, lt, o) => [[o.tA, D.extras[0], 270], [o.tB, D.extras[1], 810]].forEach(([t, x, cx], i) => {
  const e = E.outBack(prog(lt, t - 0.3, t + 0.1)); if (e <= 0) return;
  g.save(); g.translate(cx + (1 - e) * (i ? 500 : -500), 230);
  K.panel(g, -240, -150, 480, 300, { fill: CARD, stroke: C.yel, lw: 4 });
  txt(g, x.tab + ' ' + x.rank + '위', -150, -110, { font: f(800, 30), color: C.dim });
  fitText(g, x.name, 0, -10, 440, 56, { color: C.line });
  fitText(g, x.line, 0, 80, 440, 26, { weight: 700, color: C.yel }); g.restore();
  if (lt > t) ping(g, cx, 230, lt - t, { r1: 260 });
});

// 12. regime gauge: needle swings toward the site's regime at tNeedle, then a stamp with the advice
const regime = (g, lt, o) => {
  const cx = 540, cy = 390, R = 200;
  drawPoly(g, MS.arcPts(cx, cy, R, Math.PI, 1.5 * Math.PI), prog(lt, 0, 0.4), { width: 26, color: C.red, cap: 'butt' });
  drawPoly(g, MS.arcPts(cx, cy, R, 1.5 * Math.PI, 2 * Math.PI), prog(lt, 0.15, 0.55), { width: 26, color: C.blue, cap: 'butt' });
  txt(g, '위험선호', cx - R, cy + 40, { font: f(800, 30), color: D.regime.dir < 0 && lt > o.tNeedle ? C.red : C.dim });
  txt(g, '위험회피', cx + R, cy + 40, { font: f(900, 34), color: D.regime.dir > 0 && lt > o.tNeedle ? C.blue : C.dim });
  const s = E.outBack(prog(lt, o.tNeedle - 0.5, o.tNeedle));
  const a = lerp(1.5 * Math.PI, 1.5 * Math.PI + D.regime.dir * 0.35 * Math.PI, s);
  drawPoly(g, [[cx, cy], [cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40)]], 1, { width: 10, color: C.line, glow: 10 });
  g.fillStyle = C.line; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill();
  if (lt > o.tAdvice && D.regime.stamp) stamp(g, D.regime.stamp, cx, 90, lt - o.tAdvice, { color: C.yel, size: 52, rot: -0.05 });
};

// 13. a profile-link button is tapped, then the two destinations drop in: site + Telegram
const linkCard = (g, lt, o) => {
  const tap = o.tLink ?? 0.4;
  const e = E.outBack(prog(lt, 0, 0.35)); const press = K.pressScale(lt, tap + 0.25);
  g.save(); g.translate(540, 70); g.scale(e * press, e * press);
  K.panel(g, -200, -40, 400, 80, { fill: C.yel, stroke: C.yel, r: 40 }); txt(g, '프로필 링크', 0, 2, { font: f(900, 40), color: INK_ON_YEL }); g.restore();
  K.cursor(g, lerp(760, 600, clamp((lt - 0.1) / Math.max(0.2, tap + 0.15))), lerp(220, 95, clamp((lt - 0.1) / Math.max(0.2, tap + 0.15))), 1.2, C.line);
  [['stockontology.cc', '종목별 근거 · 지지/저항 · 8종목 전체', C.blue], ['t.me/stockontologist', '텔레그램 · 매일 알림', TG]].forEach(([url, sub, col], i) => {
    const t0 = tap + 0.35 + i * 0.35; const a = E.outBack(prog(lt, t0, t0 + 0.35)); if (a <= 0) return;
    g.save(); g.translate(540, 200 + i * 125); g.scale(a, a);
    K.panel(g, -420, -52, 840, 104, { fill: CARD, stroke: col, lw: 4 });
    txt(g, url, 0, -12, { font: f(900, 46, NUM), color: col }); txt(g, sub, 0, 30, { font: f(700, 24), color: C.dim }); g.restore();
    if (lt > t0 + 0.2) ping(g, 540, 200 + i * 125, lt - t0 - 0.2, { color: col, r1: 300 });
  });
};

// 14. sign-off: "AI 전문가가 만듭니다" stamps over the site address
const signOff = (g, lt) => {
  txt(g, 'stockontology.cc', 540, 150, { font: f(900, 72, NUM), color: C.line, alpha: prog(lt, 0, 0.3) });
  txt(g, 't.me/stockontologist', 540, 230, { font: f(800, 40, NUM), color: TG, alpha: prog(lt, 0.1, 0.4) });
  stamp(g, 'AI 전문가가 만듭니다', 540, 350, lt - 0.25, { color: C.yel, size: 50, rot: -0.04 });
};

const reasonOrTop = (g, lt, o) => (D.reason ? reason(g, lt, o) : topReveal(g, lt, o));
Object.assign(K, { linkCard, signOff, reasonOrTop, tabsPop, sameTop, sessionCard, topReveal, reason, secondRow, ladder, noTarget, trailing, morePicks, regime });
const T = D.T; const S = D.S; const sS = (k, off = '') => 's' + S[k] + off; const eS = (k) => 'e' + S[k]; const mS = (k) => 'm' + S[k];
const PLAN = [
  { id: 1, kind: 'tabsPop', start: 0, tr: 'cut', label: '보유 기간별 추천 4구간', opts: { tW0: T.w0, tW1: T.w1, tW2: T.w2, tW3: T.w3 }, key: T.w0, flash: true },
  { id: 2, kind: 'sameTop', start: sS('hook'), tr: 'push', label: '구간마다 1위는?', opts: { tSame: T.same }, shake: [0.35, 7] },
  { id: 3, kind: 'sessionCard', start: sS('site'), tr: 'iris', label: D.dataLabel + ' · 다음 장 추천', opts: { tSite: T.site }, hit: true },
  { id: 4, kind: 'topReveal', start: sS('top'), tr: 'cut', label: D.topLabel, opts: { tA: sS('top', '+0.3'), tB: eS('top') }, key: eS('top'), flash: true },
  { id: 5, kind: 'reasonOrTop', start: sS('reason'), tr: 'fade', label: '사이트 근거', opts: D.reason ? { tMove: T.move, tFill: T.fill } : { tA: sS('reason'), tB: sS('reason') }, hit: true },
  { id: 6, kind: 'secondRow', start: sS('second'), tr: 'push', label: D.secondLabel, opts: { tRow: T.second, tCommon: eS('second') }, hit: true },
  { id: 7, kind: 'ladder', start: sS('day'), tr: 'wipe', label: D.ladders[0].name + ' · ' + D.ladders[0].tab, opts: { i: 0, tTarget: T.t0, tStop: T.s0, tSup: T.sup, tRes: T.res }, hit: true },
  { id: 8, kind: 'ladder', start: sS('mid'), tr: 'push', label: D.ladders[1].name + ' · ' + D.ladders[1].tab, opts: { i: 1, tTarget: T.t1, tStop: T.s1 }, hit: true },
  { id: 9, kind: 'noTarget', start: sS('longNo'), tr: 'cut', label: '장기는 익절 없이 끌고 간다', opts: { tNone: eS('longNo') }, shake: [0.3, 6] },
  { id: 10, kind: 'trailing', start: sS('trail'), tr: 'fade', label: '추적손절: 고점 대비 −' + D.longStop + '%', opts: { tHit: eS('trail') }, hit: true },
  { id: 11, kind: 'morePicks', start: sS('extras'), tr: 'iris', label: '구간별 다른 종목', opts: { tA: T.ex0, tB: T.ex1 }, hit: true },
  { id: 12, kind: 'regime', start: sS('regime'), tr: 'fade', label: '시장 국면 (사이트 판정)', opts: { tNeedle: T.regime, tAdvice: mS('regime') }, shake: [0.35, 6] },
  { id: 13, kind: 'linkCard', start: sS('ask'), tr: 'iris', label: '더 자세한 분석은 프로필 링크', opts: { tLink: T.link }, hit: true },
  { id: 14, kind: 'signOff', start: sS('end'), tr: 'fade', label: 'AI 전문가가 만듭니다', key: sS('end', '+0.25'), hit: true },
];
MS.episode({
  tail: 0.6,
  glow: 'rgba(90,120,200,0.22)',
  flashes: (M) => M.planFlashes(PLAN),
  shakes: (M) => M.planShakes(PLAN),
  hits: (M) => M.planHits(PLAN),
  scenes: (M) => M.planScenes(PLAN),
});
