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
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// CI(GitHub Actions)는 Playwright 기본 캐시에 설치되므로 executablePath 를 강제하면 안 된다.
const CHROME = process.env.CHROME_BIN || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : '');
const FPS = Number(process.env.FPS || 24), W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const PAD = 0.5;
const SPEED = Math.max(0.5, Math.min(2, Number(process.env.NARRATION_SPEED || 1)));  // 나레이션 속도 배속
const MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const KEY = process.env.ELEVENLABS_API_KEY, VOICE = process.env.ELEVENLABS_VOICE_ID;

const [deckPath, outPath] = process.argv.slice(2);
if (!deckPath || !outPath) { console.error('사용: node narrate-deck.mjs deck.json out.mp4'); process.exit(1); }
// 나레이션을 미리 받아오면(CLIPS_JSON) TTS 를 안 하므로 키가 필요 없다.
// 예전엔 무조건 요구해서, 쓰지도 않을 키가 없다고 시작도 못 하는 상황이 생겼다.
if (!process.env.CLIPS_JSON && (!KEY || !VOICE)) {
  console.error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID 필요 (CLIPS_JSON 을 주면 불필요)');
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'narr-'));
const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
const palette = deck.palette || 'noir';
const slides = deck.slides || [];

// deck-timed 와 동일한 비트 순서로 flatten
// say = 화면 자막(영어·숫자 그대로), spoken = 발음용(있으면 TTS 는 이걸 읽음).
// 엔진에 따라 비트 순서가 다르다: signal 은 nodes.steps, timed 는 flow.nodes 가 비트가 된다.
const ENGINE = deck.engine === 'signal' ? 'signal' : 'timed';
// ★이 목록은 deck-signal.js 의 STEPPED 와 반드시 같아야 한다★
// 엔진은 steps 하나하나를 비트로 세는데 여기서 슬라이드 하나로 세면, 화면 타임라인이
// 오디오보다 길어진다. 실제로 nodes 만 여기 있고 pipeline/stack 이 빠져 있어서
// 화면이 오디오보다 1분 28초 길어졌고, 렌더가 끝까지 못 가고 멈춘 적이 있다.
const STEPPED_SIGNAL = new Set(['nodes', 'pipeline', 'stack']);
const beats = [];
slides.forEach((s) => {
  if (ENGINE === 'signal') {
    if (STEPPED_SIGNAL.has(s.type) && Array.isArray(s.steps) && s.steps.length) {
      s.steps.forEach((st) => beats.push({ obj: st, say: st.say || '', spoken: st.spoken }));
    } else beats.push({ obj: s, say: s.say || s.claim || s.title || '', spoken: s.spoken });
  } else if (s.type === 'flow') {
    (s.nodes || []).forEach((n) => { if (typeof n === 'string') n = { label: n }; beats.push({ obj: n, say: n.say || n.label, spoken: n.spoken }); });
  } else beats.push({ obj: s, say: s.say || s.title || s.head || s.quote || '', spoken: s.spoken });
});
// CLIPS_JSON 이면 TTS 를 안 하는데도 "TTS(undefined)" 라고 찍혀 오해를 샀다.
console.log(
  process.env.CLIPS_JSON
    ? `비트 ${beats.length}개 · 나레이션 재사용…`
    : `비트 ${beats.length}개 · TTS(${VOICE})…`,
);

// 사용량 장부 — TS 쪽 recordUsage 와 같은 파일에 이어 쓴다(여긴 .mjs 라 import 불가).
const USAGE_PATH = process.env.USAGE_PATH || '';
function recordUsage(entry) {
  if (!USAGE_PATH) return;
  try {
    const list = fs.existsSync(USAGE_PATH) ? JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8')) : [];
    list.push(entry);
    fs.writeFileSync(USAGE_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) { console.warn('사용량 기록 실패(무시):', e.message); }
}

function ffDuration(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

// 1) 비트별 나레이션 확보 + 길이 → dur 주입
//
// ★CLIPS_JSON 이 있으면 TTS 를 돌리지 않는다★
// 예전에는 이 렌더러가 자기 손으로 ElevenLabs 를 다시 호출했다. 파이프라인 2단계가
// 이미 같은 일을 하고 있었으므로 같은 코드가 두 벌이었고, 배속·사용량 집계·목소리 설정을
// 양쪽에 따로 넣어야 했다. 표준 대본으로 통일한 뒤로는 2단계가 만든 mp3 를 그대로 받는다.
// (형식: [{ "file": "/abs/path.mp3", "dur": 8.4 }, ...] — 비트 순서와 1:1)
const clips = [];
const CLIPS_JSON = (process.env.CLIPS_JSON || '').trim();
if (CLIPS_JSON) {
  const pre = JSON.parse(fs.readFileSync(CLIPS_JSON, 'utf8'));
  // 개수가 어긋나면 화면 타임라인이 오디오와 안 맞아 렌더가 중간에 멈춘다.
  // 조용히 진행하지 말고 여기서 끊는다 — 20분 렌더를 마친 뒤 발견하면 늦다.
  if (pre.length !== beats.length) {
    console.error(`나레이션 클립 ${pre.length}개 / 비트 ${beats.length}개 — 개수가 다릅니다`);
    process.exit(1);
  }
  pre.forEach((p, i) => {
    if (!fs.existsSync(p.file)) { console.error('클립 없음:', p.file); process.exit(1); }
    beats[i].obj.dur = p.dur + PAD;
    clips.push({ clip: p.file, dur: p.dur });
  });
  console.log(`  나레이션 ${clips.length}개 재사용(2단계 산출물, TTS 건너뜀)`);
}
for (let i = 0; CLIPS_JSON ? false : i < beats.length; i++) {
  const b = beats[i];
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: b.spoken || b.say, model_id: MODEL }),
  });
  if (!res.ok) { console.error('TTS 실패', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
  let clip = path.join(work, `c${String(i).padStart(3, '0')}.mp3`);
  fs.writeFileSync(clip, Buffer.from(await res.arrayBuffer()));
  if (SPEED !== 1) {
    // atempo 는 피치를 유지한 채 속도만 바꾼다. 가속 후 길이를 다시 재서 화면 타이밍에 쓴다.
    const fast = path.join(work, `f${String(i).padStart(3, '0')}.mp3`);
    const rr = spawnSync(FFMPEG, ['-hide_banner', '-y', '-i', clip, '-filter:a', `atempo=${SPEED}`, fast], { encoding: 'utf8' });
    if (rr.status === 0) clip = fast;
  }
  recordUsage({ kind: 'elevenlabs', step: 'narration', model: MODEL, chars: (b.spoken || b.say || '').length });
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
let TOTAL = ffDuration(narr) || beats.reduce((a, b) => a + b.obj.dur, 0);

// 2-b) 배경음악을 나레이션 아래에 은은하게 깐다 (BGM_PATH 가 있을 때만).
//      루프 재생 → 나레이션 길이에 맞춰 자르고, 앞뒤로 페이드. 볼륨은 말소리를 덮지 않게 낮게.
const BGM_PATH = (process.env.BGM_PATH || '').trim();
const BGM_VOLUME = Number(process.env.BGM_VOLUME || '0.085');
let audioTrack = narr;
if (BGM_PATH && fs.existsSync(BGM_PATH)) {
  const mixed = path.join(work, 'narr-bgm.m4a');
  const fadeOut = Math.max(0, TOTAL - 3);
  const filter =
    `[1:a]volume=${BGM_VOLUME},atrim=0:${TOTAL.toFixed(3)},asetpts=N/SR/TB,` +
    `afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut.toFixed(3)}:d=3[bg];` +
    `[0:a][bg]amix=inputs=2:duration=first:normalize=0[a]`;
  const rb = spawnSync(FFMPEG, ['-hide_banner', '-y', '-i', narr, '-stream_loop', '-1', '-i', BGM_PATH,
    '-filter_complex', filter, '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', mixed], { encoding: 'utf8' });
  if (rb.status === 0 && fs.existsSync(mixed)) {
    audioTrack = mixed;
    TOTAL = ffDuration(mixed) || TOTAL;
    console.log(`배경음악 믹스 완료 (volume ${BGM_VOLUME})`);
  } else {
    console.warn('배경음악 믹스 실패 — 나레이션만 사용:', (rb.stderr || '').slice(-300));
  }
} else if (BGM_PATH) {
  console.warn('배경음악 파일이 없어 건너뜀:', BGM_PATH);
}
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
const browser = await chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const D = await page.evaluate(() => window.__DURATION);
// 화면 타임라인(D)과 오디오 길이(TOTAL)가 어긋나면 -shortest 로 인해 ffmpeg 이 먼저 끝난다.
// 어긋남 자체가 비트 계산 불일치라는 신호이므로 눈에 띄게 남기고, 프레임은 짧은 쪽에 맞춘다.
const gap = D - TOTAL;
if (Math.abs(gap) > 2) {
  console.warn(`⚠ 화면 ${D.toFixed(1)}s vs 오디오 ${TOTAL.toFixed(1)}s — ${gap.toFixed(1)}s 어긋남. 비트 계산이 엔진과 다를 수 있다.`);
}
const N = Math.round(Math.min(D, TOTAL) * FPS);
console.log(`프레임 렌더 ${N}장 → ffmpeg 파이프, ${W}x${H} @ ${FPS}fps`);

const ff2 = spawn(FFMPEG, ['-hide_banner', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0', '-i', audioTrack,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', outPath],
  { stdio: ['pipe', 'inherit', 'inherit'] });
// ffmpeg 이 먼저 끝나면 파이프가 닫힌다. 그 뒤로 쓰면 drain 이벤트가 영원히 오지 않아
// 프로세스가 그대로 멈춘다(실제로 95분을 서 있다가 제한시간에 잘린 적이 있다).
// 종료를 감지해 루프를 빠져나가고, 기다림에는 반드시 시간 제한을 둔다.
let ffAlive = true, ffCode = null;
ff2.on('close', (c) => { ffAlive = false; ffCode = c; });
ff2.stdin.on('error', () => { ffAlive = false; });
for (let i = 0; i < N; i++) {
  if (!ffAlive) { console.log(`\n  ffmpeg 이 ${i}프레임에서 먼저 종료 — 프레임 공급 중단`); break; }
  await page.evaluate(t => window.__setTime(t), i / FPS);
  const buf = await page.screenshot({ type: 'png' });
  if (!ff2.stdin.write(buf)) {
    await Promise.race([
      new Promise(res => ff2.stdin.once('drain', res)),
      new Promise(res => setTimeout(res, 15000)),
    ]);
  }
  if (i % 48 === 0) process.stdout.write(`\r  ${i}/${N}`);
}
try { ff2.stdin.end(); } catch {}
// 마무리도 무한정 기다리지 않는다 — 안 끝나면 강제 종료하고 실패로 알린다.
await new Promise((res, rej) => {
  if (!ffAlive) return ffCode === 0 ? res() : rej(new Error('ffmpeg exit ' + ffCode));
  const timer = setTimeout(() => { try { ff2.kill('SIGKILL'); } catch {} rej(new Error('ffmpeg 마무리 시간 초과(5분)')); }, 300000);
  ff2.on('close', (c) => { clearTimeout(timer); c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)); });
});
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
console.log('\n완료:', outPath);
