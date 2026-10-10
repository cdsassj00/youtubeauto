// 렌더한 무음 차트 MP4 에 합성 비트를 깔아 완성본을 만든다.
//
//   node shorts-charts/finish.mjs <in.mp4> <out.mp4> [--hits 13.75,16.3] [--bpm 118] [--key 0]
//
// hits 는 render.mjs 가 마지막에 찍어 주는 "임팩트 시각" 을 그대로 넣으면 된다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { makeTrack } from './music.mjs';

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('사용법: node shorts-charts/finish.mjs <in.mp4> <out.mp4> [--hits a,b] [--bpm n] [--key n]');
  process.exit(1);
}
const opt = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const hits = (opt('--hits') || '').split(',').filter(Boolean).map(Number);
const bpm = Number(opt('--bpm') || 118);
const key = Number(opt('--key') || 0);

// ffprobe 가 없을 수도 있어 ffmpeg 의 stderr 에서 길이를 읽는다.
let err = '';
try { execFileSync(ffmpegPath, ['-i', input], { stdio: 'pipe' }); } catch (e) { err = String(e.stderr || ''); }
const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
if (!m) throw new Error(`길이를 읽지 못함: ${input}`);
const dur = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);

const wav = path.join(path.dirname(path.resolve(output)), `.${path.basename(output, '.mp4')}.bgm.wav`);
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
makeTrack(wav, dur, { bpm, key, hits });
execFileSync(ffmpegPath, ['-y', '-v', 'error', '-i', input, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest',
  '-movflags', '+faststart', output], { stdio: 'inherit' });
fs.rmSync(wav, { force: true });
console.log(`✓ ${output} (${(fs.statSync(output).size / 1e6).toFixed(1)}MB, ${dur.toFixed(1)}s, 비트 ${bpm}bpm, 임팩트 ${hits.length}개)`);
