import fs from 'node:fs';
import path from 'node:path';

/**
 * 배경음악(BGM) 생성기 — 외부 파일/저작권 없이, 순수 Node 로 부드러운 앰비언트 패드를
 * 합성해 WAV 로 저장한다. Remotion 이 loop 로 재생하므로 짧은(약 32초) 심리스 루프만 만든다.
 *
 * 나레이션을 방해하지 않도록 낮은 음역의 화음 패드 + 느린 숨쉬기(LFO) + 원폴 로우패스로
 * 부드럽게 만들었다. 실제 최종 볼륨은 Remotion 쪽에서 0.14 로 더 낮춘다.
 */

const SR = 44100;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// 잔잔한 진행: Am – F – C – G (저음역). 각 화음 8초, 앞 2초는 이전 화음과 크로스페이드(=심리스 루프).
const CHORDS = [
  [45, 48, 52], // Am (A2 C3 E3)
  [41, 45, 48], // F  (F2 A2 C3)
  [48, 52, 55], // C  (C3 E3 G3)
  [43, 47, 50], // G  (G2 B2 D3)
];

const CHORD_LEN = 8; // 초
const XFADE = 2; // 초
const LOOP_LEN = CHORDS.length * CHORD_LEN; // 32초

function chordSample(chord: number[], t: number): number {
  let s = 0;
  for (const m of chord) {
    const f = midiToFreq(m);
    // 기음 + 약한 2배음으로 따뜻하게. 아주 느린 비브라토.
    const vib = 1 + 0.0015 * Math.sin(2 * Math.PI * 4.5 * t);
    s += Math.sin(2 * Math.PI * f * vib * t) + 0.28 * Math.sin(2 * Math.PI * 2 * f * t);
  }
  return s / (chord.length * 1.28);
}

/** 앰비언트 패드 루프를 WAV(16-bit PCM mono)로 생성해 저장. 반환: 저장 경로. */
export function generateBgm(outPath: string): string {
  const n = Math.floor(LOOP_LEN * SR);
  const pcm = new Int16Array(n);

  let lp = 0; // 원폴 로우패스 상태
  const lpA = 0.15; // 낮을수록 더 부드러움
  const master = 0.3;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / CHORD_LEN;
    const base = Math.floor(p) % CHORDS.length;
    const frac = (p - Math.floor(p)) * CHORD_LEN; // 0..CHORD_LEN

    let v: number;
    if (frac < XFADE) {
      // 앞 XFADE 초: 이전 화음 → 현재 화음 등파워 크로스페이드 (루프 이음새도 매끈)
      const x = frac / XFADE; // 0..1
      const wPrev = Math.cos((x * Math.PI) / 2);
      const wCur = Math.sin((x * Math.PI) / 2);
      const prev = CHORDS[(base - 1 + CHORDS.length) % CHORDS.length];
      v = chordSample(prev, t) * wPrev + chordSample(CHORDS[base], t) * wCur;
    } else {
      v = chordSample(CHORDS[base], t);
    }

    // 느린 숨쉬기(진폭 LFO)
    const breath = 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.05 * t);
    v *= breath * master;

    // 원폴 로우패스로 고역 거칠음 제거
    lp += lpA * (v - lp);
    let out = lp;
    if (out > 1) out = 1;
    else if (out < -1) out = -1;
    pcm[i] = Math.round(out * 32767);
  }

  const buf = encodeWavMono(pcm, SR);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
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
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}
