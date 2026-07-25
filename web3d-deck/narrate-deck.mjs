/* deck.json(각 비트에 say 포함) → 나레이션 입힌 3D mp4.
   각 비트 ElevenLabs TTS → 오디오 길이로 dwell 결정 → deck-timed 프레임렌더(디스크에 안 쌓고
   ffmpeg 로 바로 파이프) → 나레이션 mux. 긴 영상도 디스크 부담 없이 매끄럽게.
   사용: ELEVENLABS_API_KEY=.. ELEVENLABS_VOICE_ID=.. node narrate-deck.mjs deck.json out.mp4 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const FFMPEG = require('ffmpeg-static');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = Number(process.env.FPS || 24), W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const PAD = 0.5;
const MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const KEY = process.env.ELEVENLABS_API_KEY, VOICE = process.env.ELEVENLABS_VOICE_ID;

const [deckPath, outPath] = process.argv.slice(2);
if (!deckPath || !outPath) { console.error('사용: node narrate-deck.mjs deck.json out.mp4'); process.exit(1); }
if (!KEY || !VOICE) { console.error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID 필요'); process.exit(1); }

const work = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'narr-'));
const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
const palette = deck.palette || 'noir';
const slides = deck.slides || [];

// deck-timed 와 동일한 비트 순서로 flatten
// say = 화면 자막(영어·숫자 그대로), spoken = 발음용(있으면 TTS 는 이걸 읽음).
// 엔진에 따라 비트 순서가 다르다: signal 은 nodes.steps, timed 는 flow.nodes 가 비트가 된다.
const ENGINE = deck.engine === 'signal' ? 'signal' : 'timed';
const beats = [];
slides.forEach((s) => {
  if (ENGINE === 'signal') {
    if (s.type === 'nodes' && s.steps) s.steps.forEach((st) => beats.push({ obj: st, say: st.say || '', spoken: st.spoken }));
    else beats.push({ obj: s, say: s.say || s.claim || s.title || '', spoken: s.spoken });
  } else if (s.type === 'flow') {
    (s.nodes || []).forEach((n) => { if (typeof n === 'string') n = { label: n }; beats.push({ obj: n, say: n.say || n.label, spoken: n.spoken }); });
  } else beats.push({ obj: s, say: s.say || s.title || s.head || s.quote || '', spoken: s.spoken });
});
console.log(`비트 ${beats.length}개 · TTS(${VOICE})…`);

function ffDuration(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

// 1) 비트별 TTS + 길이 → dur 주입
const clips = [];
for (let i = 0; i < beats.length; i++) {
  const b = beats[i];
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: b.spoken || b.say, model_id: MODEL }),
  });
  if (!res.ok) { console.error('TTS 실패', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
  const clip = path.join(work, `c${String(i).padStart(3, '0')}.mp3`);
  fs.writeFileSync(clip, Buffer.from(await res.arrayBuffer()));
  const d = ffDuration(clip) || Math.max(2, b.say.length / 6.6);
  b.obj.dur = d + PAD;
  clips.push({ clip, dur: d });
  process.stdout.write(`\r  ${i + 1}/${beats.length} (${d.toFixed(1)}s)`);
}
console.log('');

// 2) 나레이션 트랙(클립 + PAD 무음) → narr.m4a
const inputs = []; clips.forEach((c) => inputs.push('-i', c.clip));
const silIdx = clips.length; inputs.push('-f', 'lavfi', '-t', String(PAD), '-i', 'anullsrc=r=44100:cl=stereo');
const seq = []; clips.forEach((_, i) => { seq.push(`[${i}:a]`); seq.push(`[${silIdx}:a]`); });
const narr = path.join(work, 'narr.m4a');
let r = spawnSync(FFMPEG, ['-hide_banner', '-y', ...inputs, '-filter_complex', `${seq.join('')}concat=n=${seq.length}:v=0:a=1[a]`, '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', narr], { encoding: 'utf8' });
if (r.status !== 0) { console.error('나레이션 합성 실패:', (r.stderr || '').slice(-400)); process.exit(1); }
const TOTAL = ffDuration(narr) || beats.reduce((a, b) => a + b.obj.dur, 0);
console.log('총 길이', TOTAL.toFixed(1), 's');

// 3) HTML 조립 (엔진별)
const b64 = fs.readFileSync(path.join(HERE, 'pretendard.woff2')).toString('base64');
let ff = `@font-face{font-family:'Pretendard';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
const hdrTxt = String(deck.header || '');
let html;
if (ENGINE === 'signal') {
  const engine = fs.readFileSync(path.join(HERE, 'deck-signal.js'), 'utf8');
  const monoPath = path.join(HERE, 'mono.woff2');
  if (fs.existsSync(monoPath)) {
    const m64 = fs.readFileSync(monoPath).toString('base64');
    ff += `@font-face{font-family:'JetBrains Mono';font-weight:500;font-display:block;src:url(data:font/woff2;base64,${m64}) format('woff2')}`;
  }
  const inj = `window.DECK_DATA=${JSON.stringify(slides)};window.HEADER=${JSON.stringify(hdrTxt)};window.ACCENT=${JSON.stringify(deck.accent || '#2ee87a')};window.SPACE3D=${deck.space3d ? 'true' : 'false'};`;
  html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${ff}</style></head>
<body><script>${inj}</script><script>${engine}</script></body></html>`;
} else {
  const lib = fs.readFileSync(path.join(HERE, 'three-lib.js'), 'utf8');
  const engine = fs.readFileSync(path.join(HERE, 'deck-timed.js'), 'utf8');
  const inject = `window.PALETTE_NAME=${JSON.stringify(palette)};window.DECK_DATA=${JSON.stringify(slides)};`;
  const hdr = hdrTxt.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${ff}
*{margin:0;padding:0}html,body{overflow:hidden;font-family:'Pretendard',sans-serif}#gl{position:fixed;inset:0;width:100vw;height:100vh}
#hdr{position:fixed;top:4.5%;left:4.2%;z-index:6;color:#cbd3e6;font-weight:700;font-size:23px;display:flex;align-items:center;gap:9px;opacity:.92}
#hdr b{width:9px;height:9px;border-radius:50%;background:#5b8cff;box-shadow:0 0 10px #5b8cff}
#cap{position:fixed;left:50%;bottom:7.5%;transform:translateX(-50%);z-index:5;color:#eef2f8;font-weight:600;font-size:30px;line-height:1.3;text-align:center;max-width:66vw;white-space:nowrap;text-shadow:0 3px 16px rgba(0,0,0,.75);background:rgba(10,12,20,.42);padding:10px 24px;border-radius:12px;border:1px solid rgba(255,255,255,.10)}</style></head>
<body><canvas id="gl"></canvas>${hdr ? `<div id="hdr"><b></b>${hdr}</div>` : ''}<div id="cap"></div><script>${lib}</script><script>${inject}</script><script>${engine}</script></body></html>`;
}
const htmlPath = path.join(work, 'deck.html'); fs.writeFileSync(htmlPath, html);

// 4) 프레임을 디스크에 안 쌓고 ffmpeg stdin 으로 스트리밍 + 나레이션 mux
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const D = await page.evaluate(() => window.__DURATION);
const N = Math.round(D * FPS);
console.log(`프레임 렌더 ${N}장 → ffmpeg 파이프, ${W}x${H} @ ${FPS}fps`);

const ff2 = spawn(FFMPEG, ['-hide_banner', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0', '-i', narr,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', outPath],
  { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = 0; i < N; i++) {
  await page.evaluate(t => window.__setTime(t), i / FPS);
  const buf = await page.screenshot({ type: 'png' });
  if (!ff2.stdin.write(buf)) await new Promise(res => ff2.stdin.once('drain', res));
  if (i % 48 === 0) process.stdout.write(`\r  ${i}/${N}`);
}
ff2.stdin.end();
await new Promise((res, rej) => { ff2.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))); });
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
console.log('\n완료:', outPath);
