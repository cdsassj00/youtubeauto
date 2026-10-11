// 루프 소리용 합성 도구 — 악보(score.mjs)가 쓰는 함수들. 실행은 sound.mjs.

export const SR = 48000;

// ── 합성 도구 ────────────────────────────────────────
export function makeCtx(len, fps) {
  const L = new Float32Array(len), R = new Float32Array(len);
  const spf = SR / fps;
  const at = (frame) => Math.round((frame + 1) * spf);           // 그림 F → 소리 F+1
  // 원형으로 더한다. pan: -1(왼) ~ 1(오), 상수 파워.
  function put(start, mono, gain = 1, pan = 0) {
    const pl = Math.cos((pan + 1) * Math.PI / 4), pr = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < mono.length; i++) {
      const k = ((start + i) % len + len) % len, v = mono[i] * gain;
      L[k] += v * pl * Math.SQRT2 * 0.7071; R[k] += v * pr * Math.SQRT2 * 0.7071;
    }
  }
  function putPan(start, mono, gain, panAt) {   // 시간에 따라 팬이 움직이는 소리
    for (let i = 0; i < mono.length; i++) {
      const p = panAt(i / SR), pl = Math.cos((p + 1) * Math.PI / 4), pr = Math.sin((p + 1) * Math.PI / 4);
      const k = ((start + i) % len + len) % len, v = mono[i] * gain;
      L[k] += v * pl; R[k] += v * pr;
    }
  }
  return { L, R, len, spf, at, put, putPan };
}

// 마루 정렬 톤: 샘플 pre 에서 첫 마루(cos=1)가 나온다. 앞쪽은 어택(raised-cosine), 뒤는 지수 감쇠.
// f 는 숫자 또는 시간(초)→Hz 함수(마루 이후 위상 적분). 반환: [배열, pre]
export function tone({ f, dur, attack = 0.0005, decay = 0.1, amp = 1, env, phase = 0 }) {
  const pre = Math.round(attack * SR), n = pre + Math.round(dur * SR), out = new Float32Array(n);
  const fAt = typeof f === 'function' ? f : () => f;
  // 마루 이전: 시작 주파수로 거꾸로
  for (let i = 0; i < pre; i++) {
    const t = (i - pre) / SR, a = 0.5 - 0.5 * Math.cos(Math.PI * i / pre);
    out[i] = amp * a * Math.cos(2 * Math.PI * fAt(0) * t + phase);
  }
  let ph = phase;   // phase=-π/2 면 사인 위상: 마루가 1/4 주기 늦게 와서 다른 부분음과 겹치지 않는다
  for (let i = pre; i < n; i++) {
    const t = (i - pre) / SR;
    const e = env ? env(t) : Math.exp(-t / decay);
    out[i] = amp * e * Math.cos(ph);
    ph += 2 * Math.PI * fAt(t) / SR;
  }
  return [out, pre];
}

// 시드 난수(무작위도 결정적으로)
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// 2차 바이쿼드(RBJ). 반환 함수의 .set(f0) 로 상태를 유지한 채 주파수를 바꾼다(스윕할 때 딸깍이 나지 않게).
export function biquad(type, f0, q = 0.707) {
  let b0, b1, b2, a1, a2;
  const set = (f) => {
    const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), a0 = 1 + a;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // bp
    b0 /= a0; b1 /= a0; b2 /= a0; a1 = -2 * c / a0; a2 = (1 - a) / a0;
  };
  set(f0);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const fn = (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  fn.set = set;
  return fn;
}
