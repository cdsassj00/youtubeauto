// 루프 소리 합성기 — 사건 목록(프레임 번호)으로 베드와 타격을 코드로 만들고, 재고, 맞춘다.
//
//   node motion-lab/sound.mjs <score.mjs> <out.wav>
//
// score.mjs 는 { fps, secs, bpm, bed(ctx), events: [{ frame, name, make(ctx) }] } 를 내보낸다.
// 규칙(아티클의 사운드 규칙 그대로):
//   · 프레임 F 의 사건은 샘플 (F+1)·SR/fps 에서 첫 마루가 나온다 — 소리는 그림보다 1프레임 뒤.
//   · 원형 버퍼: 끝을 넘는 꼬리는 처음으로 감긴다 → 루프 이음매 없음.
//   · 타격은 베드보다 3~6dB 위(첫 60ms, K 가중) — 재서 사건별 이득을 자동으로 맞춘다.
//   · 약 −14 LUFS, WAV 진피크 −2.2 dBTP(AAC 인코딩 뒤 −1 dBTP 이하), 직류 제거.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

let ffmpegPath = 'ffmpeg';
try { ffmpegPath = (await import('ffmpeg-static')).default || 'ffmpeg'; } catch {}

import { SR, makeCtx } from './synth.mjs';

// ── 측정 ────────────────────────────────────────────
function kWeight(x) { // ITU BS.1770 48kHz 계수
  const st = (b, a) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; return (v) => { const y = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; return y; }; };
  const s1 = st([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  const s2 = st([1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  // 원형 신호라 한 바퀴 돌려 필터 상태를 데운 뒤 두 번째 바퀴를 쓴다
  const out = new Float32Array(x.length);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < x.length; i++) out[i] = s2(s1(x[i]));
  return out;
}
function windowDb(kL, kR, start, n) {
  let s = 0; for (let i = 0; i < n; i++) { const k = (start + i) % kL.length; s += kL[k] * kL[k] + kR[k] * kR[k]; }
  return 10 * Math.log10(s / n + 1e-12);
}
export function ffmeasure(file) {
  // ebur128 요약은 stderr 로 나온다
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary'));
  return { I: +(tail.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1], TP: +(tail.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1] };
}
function runFF(args) {
  try { return execFileSync(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return Buffer.concat([e.stdout || Buffer.alloc(0), e.stderr || Buffer.alloc(0)]); }
}

export function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(R[i], 48 + i * 8); }
  fs.writeFileSync(file, buf);
}
function readWavF32(file) {   // ffmpeg 로 디코딩해 float32 스테레오로
  const raw = execFileSync(ffmpegPath, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = f.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R };
}

// 룩어헤드 리미터(원형): 천장을 넘는 곳만 부드럽게 깎는다
function limit(L, R, ceilDb) {
  const c = 10 ** (ceilDb / 20), n = L.length, look = Math.round(0.0015 * SR), rel = Math.exp(-1 / (0.08 * SR));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = p > c ? c / p : 1; }
  // 앞쪽으로 최소값을 퍼뜨린 뒤(룩어헤드) 풀림을 지수로
  const g = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) if (need[i] < 1) for (let j = -look; j <= 0; j++) { const k = (i + j + n) % n; g[k] = Math.min(g[k], need[i] + (1 - need[i]) * (-j / look) ** 2); }
  let cur = 1, maxRed = 0; const byFrame = {};
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    cur = g[i] < cur ? g[i] : 1 - (1 - cur) * rel;
    if (pass) {
      L[i] *= cur; R[i] *= cur; const red = -20 * Math.log10(cur); maxRed = Math.max(maxRed, red);
      const f = Math.floor(i / SR * 30); if (red > 1) byFrame[f] = Math.max(byFrame[f] || 0, +red.toFixed(1));
    }
  }
  limit.byFrame = byFrame;
  return maxRed;
}

// ── 실행 ────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [scorePath, outWav] = process.argv.slice(2);
  const score = (await import(pathToFileURL(path.resolve(scorePath)).href)).default;
  const len = Math.round(score.secs * SR);
  const target = score.hitOverBed ?? 4.5;

  // 1) 베드
  const bed = makeCtx(len, score.fps); score.bed(bed);
  // 덕킹: 표시된 사건 앞뒤로 베드를 누른다
  for (const d of score.duck || []) {
    const c = bed.at(d.frame), a = Math.round(0.03 * SR), h = Math.round(d.hold * SR), r = Math.round(0.12 * SR), g = 10 ** (-d.db / 20);
    for (let i = -a; i < h + r; i++) {
      const k = ((c + i) % len + len) % len;
      const w = i < 0 ? (1 + i / a) : i < h ? 1 : 1 - (i - h) / r;
      const gain = 1 - (1 - g) * Math.max(0, Math.min(1, w));
      bed.L[k] *= gain; bed.R[k] *= gain;
    }
  }
  const kbL = kWeight(bed.L), kbR = kWeight(bed.R);

  // 2) 타격: 사건마다 따로 만들어 재고, 베드 위 target dB 로 이득을 맞춘다
  const hits = makeCtx(len, score.fps), report = [];
  for (const ev of score.events) {
    const one = makeCtx(len, score.fps); ev.make(one);
    if (ev.calibrate === false) { for (let i = 0; i < len; i++) { hits.L[i] += one.L[i]; hits.R[i] += one.R[i]; } report.push({ frame: ev.frame, name: ev.name, overBed: '-' }); continue; }
    const s = one.at(ev.frame), n = Math.round(0.06 * SR);
    const kL = kWeight(one.L), kR = kWeight(one.R);
    const diff = windowDb(kL, kR, s, n) - windowDb(kbL, kbR, s, n);
    const want = target + (ev.trim || 0), g = 10 ** ((want - diff) / 20);
    for (let i = 0; i < len; i++) { hits.L[i] += one.L[i] * g; hits.R[i] += one.R[i] * g; }
    report.push({ frame: ev.frame, name: ev.name, before: +diff.toFixed(1), overBed: +want.toFixed(1), gainDb: +(20 * Math.log10(g)).toFixed(1) });
  }

  // 3) 믹스 → 직류 제거 → −14 LUFS → 리미터(−2.2 dBTP) 를 맞을 때까지
  const L = new Float32Array(len), R = new Float32Array(len);
  for (let i = 0; i < len; i++) { L[i] = bed.L[i] + hits.L[i]; R[i] = bed.R[i] + hits.R[i]; }
  for (const x of [L, R]) { let m = 0; for (const v of x) m += v; m /= len; for (let i = 0; i < len; i++) x[i] -= m; }
  const tmp = outWav.replace(/\.wav$/, '.tmp.wav');
  let gain = 1, last;
  for (let it = 0; it < 6; it++) {
    const l = Float32Array.from(L, (v) => v * gain), r = Float32Array.from(R, (v) => v * gain);
    const red = limit(l, r, (score.ceil ?? -2.2) - 0.6);
    writeWav(tmp, l, r);
    // 루프 두 바퀴로 재야 처음 400ms 게이트 공백이 없다
    const two = tmp.replace(/\.wav$/, '.x2.wav'); writeWav(two, Float32Array.from({ length: len * 2 }, (_, i) => l[i % len]), Float32Array.from({ length: len * 2 }, (_, i) => r[i % len]));
    const m = ffmeasure(two); fs.rmSync(two);
    last = { ...m, limiterDb: +red.toFixed(1), limitedFrames: limit.byFrame };
    if (Math.abs(m.I - (score.lufs ?? -14)) < 0.15) { fs.renameSync(tmp, outWav); break; }
    gain *= 10 ** (((score.lufs ?? -14) - m.I) / 20);
    if (it === 5) fs.renameSync(tmp, outWav);
  }
  // 4) AAC 왕복: 전체 믹스의 음량·진피크, 그리고 타격마다 자기 줄기만 인코딩→디코딩해 첫 마루 위치를 잰다
  const m4a = outWav.replace(/\.wav$/, '.m4a');
  runFF(['-y', '-v', 'error', '-i', outWav, '-c:a', 'aac', '-b:a', '192k', m4a]);
  const aac = ffmeasure(m4a);
  const probe = outWav.replace(/\.wav$/, '.probe.wav'), pm4a = probe.replace(/\.wav$/, '.m4a');
  for (const [k, ev] of score.events.entries()) {
    if (ev.calibrate === false) continue;
    const one = makeCtx(len, score.fps); ev.make(one); writeWav(probe, one.L, one.R);
    runFF(['-y', '-v', 'error', '-i', probe, '-c:a', 'aac', '-b:a', '192k', pm4a]);
    const dec = readWavF32(pm4a), s = one.at(ev.frame), w0 = s - Math.round(0.01 * SR), w1 = s + Math.round(0.03 * SR);
    const a = (i) => Math.abs(dec.L[(i + len) % len] + dec.R[(i + len) % len]);
    let mx = 0; for (let i = w0; i < w1; i++) mx = Math.max(mx, a(i));
    let first = -1; for (let i = w0 + 1; i < w1 - 1; i++) if (a(i) > 0.5 * mx && a(i) >= a(i - 1) && a(i) >= a(i + 1)) { first = i; break; }
    report[k].peakMsAfterFramePlus1 = first < 0 ? null : +((first - s) / SR * 1000).toFixed(2);
  }
  fs.rmSync(probe); fs.rmSync(pm4a);
  console.table(report);
  console.log('리미터가 1dB 넘게 깎은 프레임:', JSON.stringify(last.limitedFrames));
  console.log(`WAV: ${last.I} LUFS, 진피크 ${last.TP} dBTP, 리미터 최대 ${last.limiterDb} dB  ·  AAC 왕복: ${aac.I} LUFS, 진피크 ${aac.TP} dBTP`);
  fs.writeFileSync(outWav.replace(/\.wav$/, '_report.json'), JSON.stringify({ wav: last, aac, hits: report }, null, 2));
}
