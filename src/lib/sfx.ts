/**
 * 효과음 합성 — 음원을 사거나 내려받지 않고 코드로 직접 만든다.
 *
 * ★왜 합성인가★
 * 배경음악(bgm.ts)을 이미 이렇게 만들고 있다. 같은 이유로 효과음도 합성한다.
 *  - 라이선스가 없다. 무료 효과음 사이트도 출처 표기·상업적 사용 조건이 제각각인데,
 *    영상이 매일 자동으로 나가는 구조에서 그걸 사람이 확인할 수가 없다.
 *  - 내려받을 게 없다. 외부 사이트가 죽어도 파이프라인은 돈다.
 *  - 저장소에 바이너리를 넣지 않아도 된다.
 *
 * ★소리는 작아야 한다★
 * 효과음의 목적은 "장면이 바뀌었다"는 신호지 존재감이 아니다. 나레이션을 덮으면
 * 그 순간 말이 안 들린다. 그래서 여기서 만드는 파형의 최대치를 낮게 잡고,
 * 화면에 얹을 때 볼륨을 한 번 더 낮춘다.
 */
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;

export type SfxName = 'whoosh' | 'tick' | 'chime';

/** 파일명은 고정 — Remotion staticFile 경로가 이 이름을 그대로 쓴다. */
export const SFX_FILES: Record<SfxName, string> = {
  whoosh: 'audio/sfx/whoosh.wav',
  tick: 'audio/sfx/tick.wav',
  chime: 'audio/sfx/chime.wav',
};

/** 재현 가능한 잡음 — Math.random 을 쓰면 회차마다 효과음이 미세하게 달라진다. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/**
 * 장면 전환음 — 짧게 '휙'.
 * 대역을 좁힌 잡음에 세로로 솟았다 꺼지는 포락선을 씌운다. 중심 주파수를 위에서
 * 아래로 훑어 "지나간다"는 느낌을 만든다.
 */
function synthWhoosh(): Float32Array {
  const dur = 0.34;
  const n = Math.floor(SR * dur);
  const buf = new Float32Array(n);
  const noise = makeNoise(0x9e3779b9);
  let bp = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / dur;
    // 포락선: 빠르게 차오르고 천천히 빠진다.
    const env = Math.pow(Math.sin(Math.PI * p), 1.6);
    // 중심 주파수를 2200Hz → 400Hz 로 훑는다(계수를 크게→작게).
    const coef = 0.55 * (1 - p) + 0.06;
    const x = noise();
    lp += coef * (x - lp);
    bp = lp - bp * 0.35; // 저역을 덜어 '쉭' 소리에 가깝게
    buf[i] = bp * env;
  }
  return buf;
}

/** 항목 등장음 — 아주 짧은 '딸깍'. 목록이 한 줄씩 나타날 때. */
function synthTick(): Float32Array {
  const dur = 0.055;
  const n = Math.floor(SR * dur);
  const buf = new Float32Array(n);
  const noise = makeNoise(0x85ebca6b);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 150); // 순간적으로 꺼진다
    // 잡음 + 고음 하나를 섞어 '딱' 하는 자음 느낌
    buf[i] = (noise() * 0.5 + Math.sin(2 * Math.PI * 2400 * t) * 0.5) * env;
  }
  return buf;
}

/** 숫자 강조음 — 맑은 '띵'. 큰 수치가 화면에 박힐 때 한 번. */
function synthChime(): Float32Array {
  const dur = 0.9;
  const n = Math.floor(SR * dur);
  const buf = new Float32Array(n);
  // 완전5도(880 / 1320) — 화음이라 어떤 배경음악 위에 얹혀도 부딪히지 않는다.
  const partials: Array<[number, number, number]> = [
    [880, 1.0, 4.0],
    [1320, 0.55, 5.0],
    [2640, 0.18, 9.0],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, amp, decay] of partials) v += Math.sin(2 * Math.PI * f * t) * amp * Math.exp(-t * decay);
    // 시작 0.004초는 살짝 열어줘 '툭' 하는 클릭을 없앤다.
    buf[i] = v * Math.min(1, t / 0.004);
  }
  return buf;
}

const SYNTH: Record<SfxName, () => Float32Array> = {
  whoosh: synthWhoosh,
  tick: synthTick,
  chime: synthChime,
};

/** 최대치를 맞추고 앞뒤에 짧은 페이드를 넣어 딸깍거림을 없앤다. */
function normalize(buf: Float32Array, peakTarget: number): Int16Array {
  let peak = 0;
  for (const v of buf) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const norm = peak > 0 ? peakTarget / peak : 1;
  const fade = Math.min(64, Math.floor(buf.length / 8)); // 샘플 단위 페이드
  const pcm = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * norm;
    if (i < fade) v *= i / fade;
    const tail = buf.length - 1 - i;
    if (tail < fade) v *= tail / fade;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    pcm[i] = Math.round(v * 32767);
  }
  return pcm;
}

/** Int16 PCM(mono) → WAV 버퍼. bgm.ts 의 것과 같은 포맷(44.1kHz 16bit mono). */
function encodeWavMono(pcm: Int16Array): Buffer {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

/** 효과음 세 개를 audioDir 아래 sfx/ 에 만든다. 실패해도 영상은 나가야 하므로 던지지 않는다. */
export function generateSfx(audioDir: string): SfxName[] {
  const made: SfxName[] = [];
  for (const name of Object.keys(SYNTH) as SfxName[]) {
    try {
      // 효과음별 최대치 — 나레이션을 덮지 않도록 낮게. '딸깍'은 짧아서 더 낮춰야 튀지 않는다.
      const peak = name === 'tick' ? 0.32 : name === 'whoosh' ? 0.45 : 0.5;
      const pcm = normalize(SYNTH[name](), peak);
      const out = path.join(audioDir, 'sfx', `${name}.wav`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, encodeWavMono(pcm));
      made.push(name);
    } catch {
      /* 한 개가 실패해도 나머지는 만든다 */
    }
  }
  return made;
}
