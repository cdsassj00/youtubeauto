// Enter 키 루프의 악보 — prompt-sound.md 를 그대로 옮긴 것. 숫자는 전부 프레임(30fps) 기준.
import { SR, tone, rng, biquad } from '../synth.mjs';

const FPS = 30, BAR = 60;                       // 120 BPM: 1박 15프레임, 마디 60프레임
const hz = (m) => 440 * 2 ** ((m - 69) / 12);   // MIDI → Hz
const D2 = 38, BB1 = 34, F2 = 41, C2 = 36;

// 딸깍: 3.2kHz 클릭 + 900Hz 몸통 + 140Hz 둥 — 셋 다 같은 샘플에서 마루
function clack(ctx, frame, { gain = 1, body = 900, thock = 140, len = 0.12 } = {}) {
  const s = ctx.at(frame);
  // 클릭과 몸통은 코사인 위상(마루가 프레임+1), 배음·둥은 사인 위상 — 마루가 한 샘플에 몰려 리미터에 걸리지 않게
  for (const [f, decay, a, phase] of [[3200, 0.0012, 0.2, 0], [body, 0.035, 0.6, 0], [body * 2.01, 0.018, 0.25, -Math.PI / 2], [thock, 0.06, 0.2, -Math.PI / 2]]) {
    const [x, pre] = tone({ f, dur: len, decay, amp: a, phase }); ctx.put(s - pre, x, gain);
  }
}

// 노이즈 한 줄기: 대역 통과 중심이 시간에 따라 움직이고 크기는 env(u) 를 따른다(u: 0→1)
function noise(ctx, f0, f1, d0, d1, env, { gain = 1, seed = 1, q = 1.2, pan } = {}) {
  const n = Math.round((d1 - d0) / FPS * SR), x = new Float32Array(n), r = rng(seed);
  const bp = biquad('bp', f0, q);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 64 === 0) bp.set(f0 * (f1 / f0) ** u);
    x[i] = bp(r() * 2 - 1) * env(u);
  }
  // 끝 2ms 페이드(뚝 끊는 곳에서 딸깍이 나지 않게)
  const fd = Math.round(0.002 * SR); for (let i = 0; i < fd; i++) { x[i] *= i / fd; x[n - 1 - i] *= i / fd; }
  const start = Math.round((d0 + 1) * SR / FPS);
  if (pan) ctx.putPan(start, x, gain, pan); else ctx.put(start, x, gain);
}

export default {
  fps: FPS, secs: 8, hitOverBed: 3.5, lufs: -14, ceil: -2.2,

  bed(ctx) {
    const chords = [[62, 65, 69, 72, 76], [58, 62, 65, 69], [53, 57, 60, 64], [48, 55, 57, 64]]; // Dm9 B♭maj7 Fmaj7 C6
    const roots = [D2, BB1, F2, C2];
    for (let b = 0; b < 4; b++) {
      const s = ctx.at(b * BAR), n = Math.round(2.2 * SR);
      // 패드: 디튠 톱니 두 개 → 1400Hz 로우패스, 느린 어택·긴 릴리스(다음 마디와 겹쳐 이어진다)
      const pad = new Float32Array(n), lp = biquad('lp', 2200, 0.6), lp2 = biquad('lp', 2200, 0.6);
      for (let i = 0; i < n; i++) {
        const t = i / SR; let v = 0;
        for (const m of chords[b]) for (const det of [-0.06, 0.06]) { const f = hz(m + det); v += ((t * f) % 1) * 2 - 1; }
        const env = Math.min(1, t / 0.35) * (t < 1.9 ? 1 : Math.max(0, 1 - (t - 1.9) / 0.3));
        pad[i] = lp2(lp(v)) * env * 0.11;
      }
      ctx.put(s, pad, 1);
      // 베이스: 마디 첫 박, 250ms
      const [bass, bp] = tone({ f: hz(roots[b] + 12), dur: 0.25, attack: 0.004, env: (t) => Math.exp(-t / 0.12), amp: 0.22 });
      const blp = biquad('lp', 900, 0.7); for (let i = 0; i < bass.length; i++) bass[i] = blp(bass[i] + 0.3 * Math.sign(bass[i]) * bass[i] * bass[i]);
      ctx.put(s - bp, bass, 1);
      // 킥: 80ms, 120→50Hz + 190Hz 노크
      const [k1, p1] = tone({ f: (t) => 50 + 70 * Math.exp(-t / 0.02), dur: 0.08, decay: 0.035, amp: 0.09 });
      const [k2, p2] = tone({ f: 190, dur: 0.02, decay: 0.004, amp: 0.06 });
      ctx.put(s - p1, k1); ctx.put(s - p2, k2);
    }
    // 셰이커 8분음표 — 타격(45·60·105·150·165)과 겹치는 자리는 쉰다
    const hits = [45, 60, 105, 150, 165, 81];
    for (let k = 0; k < 32; k++) {
      const frame = k * 7.5; if (hits.some((h) => Math.abs(h - frame) < 4)) continue;
      const n = Math.round(0.05 * SR), x = new Float32Array(n), r = rng(100 + k), bp = biquad('bp', 6000, 1.4);
      for (let i = 0; i < n; i++) x[i] = bp(r() * 2 - 1) * Math.exp(-i / SR / 0.012) * (k % 2 ? 0.07 : 0.1);
      ctx.put(Math.round((frame + 1) * SR / FPS), x, 1, k % 2 ? 0.25 : -0.25);
    }
  },

  duck: [{ frame: 45, db: 3, hold: 0.1 }, { frame: 60, db: 3, hold: 0.2 }, { frame: 105, db: 3, hold: 0.15 }],

  events: [
    { frame: 0, name: '광택 반짝임', calibrate: false, make(ctx) {
      // 225 → (루프) → 24: 고음 부분음, 왼 → 오
      const d = 39, n = Math.round(d / FPS * SR), x = new Float32Array(n), parts = [1175, 1760, 2349, 2794, 3520, 4699];
      for (let i = 0; i < n; i++) {
        const t = i / SR, u = i / n, env = Math.sin(Math.PI * u) ** 2;
        let v = 0; parts.forEach((f, j) => { v += Math.cos(2 * Math.PI * f * t) * (0.5 + 0.5 * Math.cos(2 * Math.PI * (7 + j * 1.3) * t + j)) / (j + 1); });
        x[i] = v * env * 0.05;
      }
      ctx.putPan(Math.round((225 + 1) * SR / FPS), x, 1, (t) => -0.8 + 1.6 * Math.min(1, t / (d / FPS)));
    } },
    { frame: 41, name: '예비 들숨', calibrate: false, make(ctx) {
      noise(ctx, 600, 3000, 30, 41, (u) => u ** 2, { gain: 0.35, seed: 7 });
    } },
    { frame: 45, name: '바닥 딸깍', make(ctx) { clack(ctx, 45); } },
    { frame: 60, name: '발사 스프링', make(ctx) {
      const s = ctx.at(60);
      const [chirp, p1] = tone({ f: (t) => 300 * 4 ** Math.min(1, t / 0.09), dur: 0.12, decay: 0.05, amp: 0.5 });
      const [boing, p2] = tone({ f: (t) => 220 * (1 + 0.06 * Math.sin(2 * Math.PI * 4 * t) * Math.exp(-t / 0.3)), dur: 0.7, decay: 0.22, amp: 0.45, phase: -Math.PI / 2 });
      ctx.put(s - p1, chirp); ctx.put(s - p2, boing);
    } },
    { frame: 82, name: '공중제비 바람', calibrate: false, make(ctx) {
      noise(ctx, 300, 1500, 60, 104, (u) => Math.exp(-((u - 0.5) ** 2) / 0.04), { gain: 0.5, seed: 11, q: 0.8 });
    } },
    { frame: 81, name: '소켓 종소리', trim: -1.5, make(ctx) {
      const s = ctx.at(81);
      for (const [f, a, dc] of [[hz(86), 0.5, 0.5], [hz(86) * 2.76, 0.18, 0.25], [hz(86) * 5.4, 0.06, 0.12]]) { const [x, p] = tone({ f, dur: 0.9, decay: dc, amp: a }); ctx.put(s - p, x); }
    } },
    { frame: 105, name: '착지 딸깍', trim: 0.5, make(ctx) {
      clack(ctx, 105, { gain: 1.26 });
      const s = ctx.at(105);
      const [th, p1] = tone({ f: 70, dur: 0.18, decay: 0.07, amp: 0.35 }); ctx.put(s - p1, th);
      const [ting, p2] = tone({ f: hz(81), dur: 0.3, decay: 0.09, amp: 0.25 }); ctx.put(s - p2, ting);
    } },
    { frame: 150, name: '탭 1', trim: -1, make(ctx) { clack(ctx, 150, { gain: 0.7 }); } },
    { frame: 165, name: '탭 2', trim: -1, make(ctx) { clack(ctx, 165, { gain: 0.7, body: 900 * 2 ** (1 / 12) }); } },
  ],
};
