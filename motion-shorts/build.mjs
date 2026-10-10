// 대본(JSON) 하나로 나레이션 모션 쇼츠(1080×1920 MP4)를 만든다.
//
//   node motion-shorts/build.mjs motion-shorts/specs/browser-motion.json            # 완성 MP4
//   node motion-shorts/build.mjs <spec> --stills 2,8,15                              # 장면 미리보기 PNG
//   node motion-shorts/build.mjs <spec> --no-voice                                   # 목소리 없이(읽기 시간으로 길이)
//
// 순서: 비트마다 TTS → 실제 음성 길이로 장면 길이 결정(MV-044) → 엔진 화면을 프레임마다 캡처
//       → 나레이션 + 비트(나레이션이 나오면 음악을 눌러 준다) 섞기 → MP4.
// 목소리: OPENAI_API_KEY 가 있으면 OpenAI TTS, 없고 ELEVENLABS_API_KEY 가 있으면 ElevenLabs,
//         둘 다 없으면 목소리 없이 자막만(읽기 시간 0.35초 + 글자 수 ÷ 10초, MV-046).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { makeTrack } from './music.mjs';

let ffmpegPath = 'ffmpeg';
try { ffmpegPath = (await import('ffmpeg-static')).default || 'ffmpeg'; } catch {}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [specPath, ...rest] = process.argv.slice(2);
if (!specPath) { console.error('사용법: node motion-shorts/build.mjs <spec.json> [--stills a,b] [--no-voice] [--out x.mp4]'); process.exit(1); }
const arg = (k) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
const STILLS = arg('--stills');
const NO_VOICE = rest.includes('--no-voice');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const id = spec.id || path.basename(specPath, '.json');
const WORK = path.resolve(arg('--work') || path.join('out', 'motion', id));
const OUT = path.resolve(arg('--out') || path.join(WORK, `${id}.mp4`));
fs.mkdirSync(path.join(WORK, 'tts'), { recursive: true });

const ff = (args) => execFileSync(ffmpegPath, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
function duration(file) {
  let err = '';
  try { execFileSync(ffmpegPath, ['-i', file], { stdio: 'pipe' }); } catch (e) { err = String(e.stderr || ''); }
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`길이를 읽지 못함: ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
const spokenOf = (b) => (b.spoken || b.say).replace(/\*/g, '');

// ── 1. 나레이션 ─────────────────────────────────────
const voice = spec.voice || {};
const provider = NO_VOICE ? 'none'
  : voice.provider || (process.env.OPENAI_API_KEY ? 'openai' : process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'none');

async function tts(textIn, file) {
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: voice.model || 'gpt-4o-mini-tts', voice: voice.voice || 'onyx', input: textIn,
        instructions: voice.instructions || '또렷하고 활기찬 한국어 강사 톤. 문장 끝을 흐리지 않는다.', response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  } else if (provider === 'elevenlabs') {
    const vid = voice.voice || process.env.ELEVENLABS_VOICE_ID;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: textIn, model_id: voice.model || 'eleven_multilingual_v2' }),
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}

const speed = voice.speed || 1.08; // 쇼츠는 살짝 빠르게
const beats = spec.beats;
for (const [i, b] of beats.entries()) {
  if (provider === 'none') { b.speech = 0; continue; }
  const key = crypto.createHash('sha1').update(JSON.stringify([provider, voice, speed, spokenOf(b)])).digest('hex').slice(0, 12);
  const raw = path.join(WORK, 'tts', `${key}.mp3`), wav = path.join(WORK, 'tts', `${key}.wav`);
  if (!fs.existsSync(wav)) {
    if (!fs.existsSync(raw)) { process.stdout.write(`  · 음성 ${i + 1}/${beats.length} `); await tts(spokenOf(b), raw); console.log('✓'); }
    // 앞뒤 무음을 깎고 속도를 맞춘다 — 장면 길이가 실제 말 길이와 딱 맞게
    ff(['-i', raw, '-af', `silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,atempo=${speed}`, '-ar', '44100', '-ac', '2', wav]);
  }
  b.audio = wav; b.speech = duration(wav);
}

// ── 2. 시간표 (실제 음성 길이 → 장면 길이) ──────────────
let t = spec.lead ?? 0.5;
for (const b of beats) {
  const chars = (b.say || '').replace(/\*/g, '').replace(/\s/g, '').length;
  const read = 0.35 + chars / 10;                           // MV-046 읽히는 최소 시간
  b.start = +t.toFixed(3);
  b.dur = +Math.max(b.speech ? b.speech + (b.gap ?? 0.45) : read, b.minDur || 0).toFixed(3);
  t += b.dur;
}
spec.duration = +(t + (spec.tail ?? 0.8)).toFixed(3);
fs.writeFileSync(path.join(WORK, 'timeline.json'), JSON.stringify(spec, null, 2));
// 자막 파일도 같이 (MV-043/044)
const srtTime = (s) => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ',');
fs.writeFileSync(path.join(WORK, `${id}.srt`), beats.map((b, i) => `${i + 1}\n${srtTime(b.start)} --> ${srtTime(b.start + b.dur)}\n${b.say.replace(/\*/g, '')}\n`).join('\n'));
console.log(`▶ ${id}: ${beats.length}비트, ${spec.duration}s, 목소리 ${provider}`);

// ── 3. 화면 렌더 ────────────────────────────────────
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[page]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto('file://' + path.join(HERE, 'engine', 'index.html'));
await page.evaluate((s) => window.load(s), JSON.parse(JSON.stringify(spec)));
const canvas = page.locator('#c');

if (STILLS) {
  const dir = path.join(WORK, 'stills'); fs.mkdirSync(dir, { recursive: true });
  const times = STILLS === 'beats' ? beats.flatMap((b) => [b.start + 0.2, b.start + b.dur * 0.6]) : STILLS.split(',').map(Number);
  for (const s of times) {
    await page.evaluate((x) => window.seek(x), s);
    await canvas.screenshot({ path: path.join(dir, `${String(s.toFixed(2)).padStart(6, '0')}.png`) });
  }
  await browser.close();
  console.log(`✓ 정지 화면 ${times.length}장 → ${dir}`);
  process.exit(0);
}

const fps = spec.fps || 30, total = Math.round(spec.duration * fps);
const silent = path.join(WORK, 'video.mp4');
const enc = spawn(ffmpegPath, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), silent], { stdio: ['pipe', 'ignore', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((x) => window.seek(x), i / fps);
  const buf = await canvas.screenshot({ type: 'png' });
  if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
  if (i % 150 === 0) process.stdout.write(`\r  · 화면 ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
enc.stdin.end(); await new Promise((r) => enc.on('close', r)); await browser.close();
console.log(`\r  · 화면 ${total}/${total} 완료 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

// ── 4. 소리: 나레이션 + 비트(말할 때 음악을 눌러 준다) ─────
const bg = spec.bgm || {};
const bgmWav = path.join(WORK, 'bgm.wav');
makeTrack(bgmWav, spec.duration, { bpm: bg.bpm || 100, key: bg.key || 0, hits: bg.hits || [], introBeats: 2 });
const voiced = beats.filter((b) => b.audio);
const inputs = ['-i', bgmWav, ...voiced.flatMap((b) => ['-i', b.audio])];
const bgVol = bg.volume ?? (voiced.length ? 0.22 : 0.6);
let filter;
if (voiced.length) {
  const parts = voiced.map((b, k) => `[${k + 1}:a]adelay=${Math.round(b.start * 1000 + 80)}:all=1[v${k}]`);
  filter = [...parts,
    `${voiced.map((_, k) => `[v${k}]`).join('')}amix=inputs=${voiced.length}:normalize=0:duration=longest[voice]`,
    `[voice]asplit=2[vo][vk]`,
    `[0:a]volume=${bgVol}[bg]`,
    `[bg][vk]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[bgd]`,
    `[vo][bgd]amix=inputs=2:normalize=0:duration=first,apad,atrim=0:${spec.duration},loudnorm=I=-14:TP=-1.5:LRA=11[out]`].join(';');
  // amix duration=first 는 [vo] 기준이라 끝의 음악 꼬리가 잘린다 — apad+atrim 으로 영상 길이에 맞춘다
} else {
  filter = `[0:a]volume=${bgVol},loudnorm=I=-15:TP=-1.5:LRA=11[out]`;
}
const mixWav = path.join(WORK, 'mix.wav');
ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-ar', '44100', mixWav]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
ff(['-i', silent, '-i', mixWav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
console.log(`✓ ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)}MB, ${spec.duration}s) · 자막 ${path.join(WORK, id + '.srt')}`);
