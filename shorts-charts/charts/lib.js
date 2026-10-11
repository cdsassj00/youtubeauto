// 모션차트 공용 도구. 각 차트 HTML 은 defineChart({duration, draw}) 하나만 부르면 되고,
// render.mjs 가 window.seek(t) 로 프레임을 하나씩 찍는다 — 실시간 재생이 아니라
// "t 초의 화면"을 그리는 순수 함수라 몇 번을 다시 찍어도 같은 영상이 나온다.
const W = 1080, H = 1920;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
  inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outQuint: (p) => 1 - Math.pow(1 - p, 5),
  outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  outElastic: (p) => (p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
const KR = "'Pret', 'Inter', sans-serif";
const NUM = "'Inter Display', 'Inter', 'Pret', sans-serif";
const f = (w, s, fam = KR) => `${w} ${s}px ${fam}`;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function txt(ctx, s, x, y, { font, color = '#fff', align = 'left', base = 'alphabetic', ls = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.letterSpacing = `${ls}px`;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function measure(ctx, s, font, ls = 0) {
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = `${ls}px`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
const comma = (n) => Math.round(n).toLocaleString('en-US');
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

// 필름 그레인(결정적)
let _grain;
function grain(ctx, alpha = 0.06, comp = 'overlay') {
  if (!_grain) {
    _grain = document.createElement('canvas');
    _grain.width = 540; _grain.height = 960;
    const g = _grain.getContext('2d');
    const img = g.createImageData(540, 960);
    let s = 1234567;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const v = (s >>> 24);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = comp;
  ctx.drawImage(_grain, 0, 0, W, H);
  ctx.restore();
}

function defineChart({ duration, fps = 30, hits = [], draw }) {
  const cv = document.getElementById('c');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  window.CHART = { duration, fps, hits: hits.map((h) => Math.round(h * 100) / 100) };
  window.seek = (t) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); draw(ctx, t); };
  window.READY = (async () => {
    const pret = new FontFace('Pret', "url('pretendard.woff2')", { weight: '100 900' });
    document.fonts.add(await pret.load());
    for (const w of [400, 600, 700, 800, 900]) {
      await document.fonts.load(`${w} 40px Pret`, '가A1');
      await document.fonts.load(`${w} 40px 'Inter Display'`, 'A1');
      await document.fonts.load(`${w} 40px Inter`, 'A1');
    }
    window.seek(0);
    return true;
  })();
  // 브라우저에서 열면 그냥 재생해 본다(?play)
  if (location.search.includes('play')) {
    window.READY.then(() => {
      const t0 = performance.now();
      const loop = () => { window.seek(((performance.now() - t0) / 1000) % duration); requestAnimationFrame(loop); };
      loop();
    });
  }
}
