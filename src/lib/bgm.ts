import fs from 'node:fs';
import path from 'node:path';

/**
 * 배경음악(BGM) 생성기 — 외부 파일/저작권 없이 순수 Node 로 합성.
 *
 * v2: 이전 버전은 낮은 음역의 지속음(드론)이라 "공포영화 배경음"처럼 들렸다.
 * 이번엔 밝은 장조(C major) 진행 위에 또랑또랑한 뮤직박스/플럭 아르페지오를 얹어
 * "잔잔한 배경음악"처럼 들리게 했다. 각 음은 빠른 어택 + 지수 감쇠(플럭),
 * 벨 배음으로 맑게. 낮은 볼륨이라 나레이션을 방해하지 않는다.
 */

const SR = 44100;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// I–V–vi–IV (C–G–Am–F) 밝고 편안한 진행. 부드러운 보이싱(중음역).
const PROG = [
  { chord: [60, 64, 67], bass: 48 }, // C major  (C4 E4 G4), bass C3
  { chord: [59, 62, 67], bass: 43 }, // G/B      (B3 D4 G4), bass G2
  { chord: [57, 60, 64], bass: 45 }, // A minor  (A3 C4 E4), bass A2
  { chord: [57, 60, 65], bass: 41 }, // F/A      (A3 C4 F4), bass F2
];

const BAR = 4; // 초/코드
const NOTE = 0.5; // 아르페지오 음 간격(초)
const LOOP_LEN = PROG.length * BAR; // 16초 루프

/** 플럭(뮤직박스/벨) 한 음을 버퍼에 더한다. */
function addPluck(buf: Float32Array, freqMidi: number, startSec: number, amp: number, decay: number) {
  const f = midiToFreq(freqMidi);
  const start = Math.floor(startSec * SR);
  const len = Math.floor(decay * 4 * SR); // 감쇠 꼬리까지
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length; // 루프 경계에서 자연스럽게 감김
    const t = i / SR;
    const env = Math.exp(-t / decay) * (1 - Math.exp(-t / 0.004)); // 빠른 어택 + 지수 감쇠
    // 벨 배음: 기음 + 옥타브 + 12도(맑고 반짝이게)
    const s =
      Math.sin(2 * Math.PI * f * t) +
      0.5 * Math.sin(2 * Math.PI * 2 * f * t) +
      0.22 * Math.sin(2 * Math.PI * 3 * f * t);
    buf[idx] += (s / 1.72) * env * amp;
  }
}

/** 부드러운 베이스(사인) 한 음. */
function addBass(buf: Float32Array, freqMidi: number, startSec: number, durSec: number, amp: number) {
  const f = midiToFreq(freqMidi);
  const start = Math.floor(startSec * SR);
  const len = Math.floor(durSec * SR);
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % buf.length;
    const t = i / SR;
    const env = (1 - Math.exp(-t / 0.05)) * Math.exp(-t / (durSec * 0.7)); // 부드러운 스웰
    buf[idx] += Math.sin(2 * Math.PI * f * t) * env * amp;
  }
}

/** 밝은 뮤직박스 BGM 루프를 WAV(16-bit PCM mono)로 생성해 저장. */
export function generateBgm(outPath: string): string {
  const n = Math.floor(LOOP_LEN * SR);
  const buf = new Float32Array(n);

  PROG.forEach((step, ci) => {
    const barStart = ci * BAR;
    // 베이스: 코드마다 한 음
    addBass(buf, step.bass, barStart, BAR, 0.18);
    // 아르페지오: 코드 톤 상행→하행 패턴을 8분음표 간격으로
    const pattern = [step.chord[0], step.chord[1], step.chord[2], step.chord[1] + 12, step.chord[2], step.chord[1], step.chord[0] + 12, step.chord[1]];
    const count = Math.floor(BAR / NOTE);
    for (let k = 0; k < count; k++) {
      const note = pattern[k % pattern.length];
      const amp = k % 2 === 0 ? 0.5 : 0.34; // 강박 살짝 강조
      addPluck(buf, note, barStart + k * NOTE, amp, 0.32);
    }
  });

  // 원폴 로우패스로 딱딱함 살짝 완화 + 정규화.
  let lp = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.45 * (buf[i] - lp);
    buf[i] = lp;
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  const norm = peak > 0 ? 0.72 / peak : 1; // 여유 헤드룸(최종 볼륨은 Remotion 에서 더 낮춤)

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
