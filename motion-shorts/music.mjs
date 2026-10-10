// 차트 쇼츠용 배경 비트 — 외부 음원 없이 순수 Node 로 합성한다(저작권 걱정 없음).
//
// src/lib/bgm.ts 의 lo-fi 는 나레이션 밑에 까는 용도라 잔잔하다. 차트 레이스는 말이 없고
// 화면만 달리므로 음악이 템포를 끌어야 한다 — 그래서 4온더플로어 킥, 사이드체인 베이스,
// 단조 진행(Am–F–C–G)으로 "경주" 느낌을 낸다. hits 로 넘긴 시각에는 임팩트(쿵)를 얹어
// 화면의 순위 교체·마일스톤과 소리를 맞춘다. 결정적(LCG 노이즈)이라 다시 만들어도 같다.
import fs from 'node:fs';

const SR = 44100;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s / 0x7fffffff) * 2 - 1;
  };
}

// 단조 진행. 키는 key(반음)로 옮긴다.
const PROG = [
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [57, 60, 65] }, // F
  { root: 48, chord: [55, 60, 64] }, // C
  { root: 43, chord: [55, 59, 62] }, // G
];

/**
 * @param {string} outWav
 * @param {number} seconds
 * @param {{bpm?:number, key?:number, hits?:number[], seed?:number, introBeats?:number}} opt
 */
export function makeTrack(outWav, seconds, opt = {}) {
  const bpm = opt.bpm ?? 118;
  const key = opt.key ?? 0;
  const hits = opt.hits ?? [];
  const introBeats = opt.introBeats ?? 2;
  const n = Math.ceil(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = lcg(opt.seed ?? 7);
  const beat = 60 / bpm;
  const add = (i, l, r = l) => {
    if (i >= 0 && i < n) { L[i] += l; R[i] += r; }
  };

  // 사이드체인 엔벨로프(킥마다 눌렀다 풀림)
  const duck = new Float32Array(n).fill(1);

  const totalBeats = Math.floor(seconds / beat);
  for (let b = 0; b < totalBeats; b++) {
    const t0 = b * beat;
    const i0 = Math.floor(t0 * SR);
    const bar = Math.floor(b / 4);
    const pc = PROG[bar % PROG.length];
    const full = b >= introBeats;

    // 킥
    if (full) {
      const len = Math.floor(0.32 * SR);
      let ph = 0;
      for (let k = 0; k < len; k++) {
        const tt = k / SR;
        const f = 45 + 95 * Math.exp(-tt * 28);
        ph += (2 * Math.PI * f) / SR;
        add(i0 + k, Math.sin(ph) * Math.exp(-tt * 9) * 0.9);
      }
      const dl = Math.floor(beat * SR);
      for (let k = 0; k < dl && i0 + k < n; k++) {
        const tt = k / SR;
        duck[i0 + k] = Math.min(duck[i0 + k], 1 - 0.75 * Math.exp(-tt * 9));
      }
    }

    // 스네어/클랩 (2, 4박)
    if (full && b % 2 === 1) {
      const len = Math.floor(0.18 * SR);
      let lp = 0;
      for (let k = 0; k < len; k++) {
        const tt = k / SR;
        const x = noise();
        lp += 0.35 * (x - lp);
        const v = (x - lp) * Math.exp(-tt * 22) * 0.38 + Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 30) * 0.2;
        add(i0 + k, v * 0.95, v);
      }
    }

    // 하이햇 (8분/16분)
    const hatSteps = full ? 4 : 2;
    for (let s = 0; s < hatSteps; s++) {
      if (full && s === 0) continue;
      const ih = i0 + Math.floor((s * beat * SR) / hatSteps);
      const len = Math.floor(0.04 * SR);
      let prev = 0;
      const amp = s === 2 ? 0.16 : 0.08;
      for (let k = 0; k < len; k++) {
        const x = noise();
        const hp = x - prev;
        prev = x;
        const v = hp * Math.exp((-k / SR) * 90) * amp;
        add(ih + k, v * (s % 2 ? 0.7 : 1), v * (s % 2 ? 1 : 0.7));
      }
    }

    // 베이스: 8분 펄스, 루트-옥타브
    if (full) {
      for (let s = 0; s < 2; s++) {
        const ib = i0 + Math.floor((s * beat * SR) / 2);
        const f = mtof(pc.root + key + (s === 1 ? 12 : 0) - 12);
        const len = Math.floor((beat / 2) * SR * 0.95);
        for (let k = 0; k < len; k++) {
          const tt = k / SR;
          const ph = 2 * Math.PI * f * tt;
          const v = (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph)) * Math.min(1, tt * 200) * Math.exp(-tt * 3) * 0.32;
          add(ib + k, v);
        }
      }
    }

    // 코드 스탭: 각 박의 뒷박(&)에 짧게
    {
      const is = i0 + Math.floor((beat / 2) * SR);
      const len = Math.floor(0.22 * SR);
      for (const m of pc.chord) {
        const f = mtof(m + key);
        for (let k = 0; k < len; k++) {
          const tt = k / SR;
          const ph = 2 * Math.PI * f * tt;
          const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
          const v = (0.6 * tri + 0.4 * Math.sin(ph * 2.003)) * Math.exp(-tt * 14) * (full ? 0.07 : 0.05);
          add(is + k, v * 1.1, v * 0.9);
        }
      }
    }

    // 리드 아르페지오: 16분, 4마디마다 한 번씩 쉼
    if (full && bar % 4 !== 3) {
      for (let s = 0; s < 4; s++) {
        const ia = i0 + Math.floor((s * beat * SR) / 4);
        const m = pc.chord[(b * 4 + s) % 3] + 12 + key;
        const f = mtof(m);
        const len = Math.floor(0.11 * SR);
        for (let k = 0; k < len; k++) {
          const tt = k / SR;
          const v = Math.sign(Math.sin(2 * Math.PI * f * tt)) * Math.exp(-tt * 30) * 0.025;
          add(ia + k, v * (s % 2 ? 0.6 : 1), v * (s % 2 ? 1 : 0.6));
        }
      }
    }
  }

  // 덕킹 적용(킥 자체는 이미 들어가 있으므로 전체에 약하게)
  for (let i = 0; i < n; i++) {
    const d = 0.55 + 0.45 * duck[i];
    L[i] *= d;
    R[i] *= d;
  }

  // 인트로 라이저
  {
    const len = Math.floor(introBeats * beat * SR);
    let lp = 0;
    for (let k = 0; k < len; k++) {
      const p = k / len;
      const x = noise();
      lp += (0.02 + 0.5 * p) * (x - lp);
      add(k, lp * p * p * 0.35);
    }
  }

  // 임팩트
  for (const h of hits) {
    const i0 = Math.floor(h * SR);
    const len = Math.floor(1.2 * SR);
    let ph = 0;
    let lp = 0;
    for (let k = 0; k < len; k++) {
      const tt = k / SR;
      const f = 38 + 70 * Math.exp(-tt * 12);
      ph += (2 * Math.PI * f) / SR;
      const x = noise();
      lp += 0.08 * (x - lp);
      const v = Math.sin(ph) * Math.exp(-tt * 3.2) * 0.7 + lp * Math.exp(-tt * 6) * 0.5;
      add(i0 + k, v);
    }
    // 직전 리버스 스윕
    const pre = Math.floor(0.35 * SR);
    let lp2 = 0;
    for (let k = 0; k < pre; k++) {
      const p = k / pre;
      const x = noise();
      lp2 += (0.05 + 0.6 * p) * (x - lp2);
      add(i0 - pre + k, lp2 * p * p * 0.3);
    }
  }

  // 페이드아웃 + 소프트 클립 + 정규화
  const fade = Math.floor(1.6 * SR);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = i > n - fade ? (n - i) / fade : 1;
    L[i] = Math.tanh(L[i] * 1.2) * g;
    R[i] = Math.tanh(R[i] * 1.2) * g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = peak > 0 ? 0.89 / peak : 1;

  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(outWav, buf);
  return outWav;
}
