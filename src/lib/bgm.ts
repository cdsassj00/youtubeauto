import fs from 'node:fs';
import path from 'node:path';

/**
 * 배경음악(BGM) 생성기 — 외부 파일/저작권 없이 순수 Node 로 합성.
 *
 * v3: 이전 버전은 드럼이 전혀 없는 뮤직박스 아르페지오라 "명상·자장가 음악"처럼 들려서
 * 영상이 졸리다는 피드백("명상영상 같다")을 받았다. 이번엔 킥·스네어·하이햇으로 또렷한
 * 비트를 깔아 "경쾌한 lo-fi 스터디 비트"로 바꿨다 — 리듬이 있어야 듣는 사람이 깨어 있는다.
 * 밝은 코드 진행(C–G–Am–F) 위에 짧은 플럭 코드 스탭과 가벼운 아르페지오를 얹되, 예전처럼
 * 촘촘하게 몽롱하지 않게 절제한다. 낮은 볼륨이라 나레이션을 방해하지 않는다.
 */

const SR = 44100;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** 결정적 노이즈(퍼커션용). Math.random 대신 LCG 로 재렌더 시 동일. */
function makeNoise(seed = 22222): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s / 0x7fffffff) * 2 - 1;
  };
}

// I–V–vi–IV (C–G–Am–F) 밝고 편안한 진행.
const PROG = [
  { chord: [60, 64, 67], bass: 36 }, // C
  { chord: [59, 62, 67], bass: 31 }, // G/B
  { chord: [57, 60, 64], bass: 33 }, // Am
  { chord: [57, 60, 65], bass: 29 }, // F/A
];

const BPM = 92;
const BEAT = 60 / BPM; // 초/비트 ≈ 0.652
const BEATS_PER_BAR = 4;
const BAR = BEAT * BEATS_PER_BAR; // 초/코드
const LOOP_LEN = PROG.length * BAR; // ≈ 10.4초 루프

/** 킥 드럼 — 피치가 뚝 떨어지는 사인 + 빠른 감쇠. */
function addKick(buf: Float32Array, startSec: number, amp: number) {
  const start = Math.floor(startSec * SR);
  const len = Math.floor(0.3 * SR);
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length;
    const t = i / SR;
    const f = 120 * Math.exp(-t / 0.03) + 45; // 130→45Hz
    const env = Math.exp(-t / 0.16) * (1 - Math.exp(-t / 0.002));
    buf[idx] += Math.sin(2 * Math.PI * f * t) * env * amp;
  }
}

/** 스네어/클랩 — 노이즈 버스트 + 약한 톤. */
function addSnare(buf: Float32Array, startSec: number, amp: number, noise: () => number) {
  const start = Math.floor(startSec * SR);
  const len = Math.floor(0.18 * SR);
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length;
    const t = i / SR;
    const env = Math.exp(-t / 0.055);
    const tone = 0.25 * Math.sin(2 * Math.PI * 190 * t);
    buf[idx] += (noise() * 0.9 + tone) * env * amp;
  }
}

/** 하이햇 — 아주 짧은 고역 노이즈(차이분으로 고역 강조). */
function addHat(buf: Float32Array, startSec: number, amp: number, noise: () => number) {
  const start = Math.floor(startSec * SR);
  const len = Math.floor(0.05 * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length;
    const t = i / SR;
    const nz = noise();
    const hp = nz - prev; // 1차 하이패스(고역만)
    prev = nz;
    const env = Math.exp(-t / 0.018);
    buf[idx] += hp * env * amp;
  }
}

/** 짧은 플럭(코드 스탭/아르페지오). */
function addPluck(buf: Float32Array, freqMidi: number, startSec: number, amp: number, decay: number) {
  const f = midiToFreq(freqMidi);
  const start = Math.floor(startSec * SR);
  const len = Math.floor(decay * 4 * SR);
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length;
    const t = i / SR;
    const env = Math.exp(-t / decay) * (1 - Math.exp(-t / 0.003));
    const s = Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * 2 * f * t) + 0.15 * Math.sin(2 * Math.PI * 3 * f * t);
    buf[idx] += (s / 1.55) * env * amp;
  }
}

/** 부드러운 서브 베이스. */
function addBass(buf: Float32Array, freqMidi: number, startSec: number, durSec: number, amp: number) {
  const f = midiToFreq(freqMidi);
  const start = Math.floor(startSec * SR);
  const len = Math.floor(durSec * SR);
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length;
    const t = i / SR;
    const env = (1 - Math.exp(-t / 0.02)) * Math.exp(-t / (durSec * 0.8));
    buf[idx] += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t)) * env * amp;
  }
}

/** 경쾌한 lo-fi 비트 BGM 루프를 WAV(16-bit PCM mono)로 생성해 저장. */
export function generateBgm(outPath: string): string {
  const n = Math.floor(LOOP_LEN * SR);
  const buf = new Float32Array(n);
  const noise = makeNoise();

  PROG.forEach((step, ci) => {
    const barStart = ci * BAR;
    addBass(buf, step.bass, barStart, BAR, 0.5);
    // 코드 스탭(강박에 짧게) — 몽롱한 촘촘 아르페지오 대신 절제.
    addPluck(buf, step.chord[0] + 12, barStart, 0.28, 0.18);
    addPluck(buf, step.chord[1] + 12, barStart, 0.24, 0.18);
    addPluck(buf, step.chord[2] + 12, barStart, 0.22, 0.18);
    // 가벼운 아르페지오 한두 방울(뒷박에만).
    addPluck(buf, step.chord[2] + 12, barStart + BEAT * 2.5, 0.2, 0.22);
    addPluck(buf, step.chord[1] + 12, barStart + BEAT * 3.5, 0.18, 0.22);

    // 드럼 그리드: 킥(0,2박) + 스네어(1,3박) + 하이햇(8분음표).
    for (let b = 0; b < BEATS_PER_BAR; b++) {
      const beatStart = barStart + b * BEAT;
      if (b === 0 || b === 2) addKick(buf, beatStart, 0.9);
      if (b === 1 || b === 3) addSnare(buf, beatStart, 0.5, noise);
      addHat(buf, beatStart, 0.28, noise);
      addHat(buf, beatStart + BEAT / 2, 0.2, noise); // 오프비트 하이햇
    }
  });

  // 아주 약한 로우패스(딱딱함만 완화, 하이햇은 살림) + 정규화.
  let lp = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.82 * (buf[i] - lp);
    buf[i] = lp;
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  const norm = peak > 0 ? 0.78 / peak : 1;

  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let v = buf[i] * norm;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    pcm[i] = Math.round(v * 32767);
  }

  const wav = encodeWavMono(pcm, SR);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, wav);
  return outPath;
}

/** Int16 PCM(mono) → WAV 파일 버퍼. */
function encodeWavMono(pcm: Int16Array, sampleRate: number): Buffer {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}
