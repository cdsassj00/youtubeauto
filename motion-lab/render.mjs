// 모션 랩 렌더러 — HTML 한 장을 프레임 0..N-1 로 찍는다(N 은 찍지 않는다: N = 0 프레임이라 이음매가 튄다).
//
//   node motion-lab/render.mjs <page.html> --secs 8 --fps 30 --w 1080 --h 680 --frames 0,45,105   # 정지 화면
//   node motion-lab/render.mjs <page.html> --secs 8 --fps 30 --w 1080 --h 680 --video out.mp4     # 전체 → MP4
//   node motion-lab/render.mjs <page.html> ... --contact out.png [--every 12]                      # 밀착 인화지(프레임 번호 표시)
//   node motion-lab/render.mjs <page.html> ... --onion 41-49 --out onion.png                       # 잔상 겹치기
//
// 페이지 약속(렌더 계약): window.renderAt(t) 가 정확히 t 초의 화면을 그린다. 준비되면 window.__ready = true.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

let ffmpegPath = 'ffmpeg';
try { ffmpegPath = (await import('ffmpeg-static')).default || 'ffmpeg'; } catch {}

const [file, ...rest] = process.argv.slice(2);
const arg = (k, d) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : d);
const W = +arg('--w', 1080), H = +arg('--h', 1080), FPS = +arg('--fps', 30), SECS = +arg('--secs', 6);
const N = Math.round(SECS * FPS);
const OUT = arg('--out', path.join('out', 'lab', path.basename(file, '.html')));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[page]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto(pathToFileURL(path.resolve(file)).href);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.evaluate(async () => { await document.fonts.ready; });

async function shot(i, label = false) {
  await page.evaluate(([t, lab]) => {
    if (window.renderAt) window.renderAt(t);
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t * 1000; });
    let el = document.getElementById('__lab_f');
    if (lab && !el) {
      el = document.createElement('div'); el.id = '__lab_f';
      el.style.cssText = 'position:fixed;left:10px;top:8px;z-index:99999;font:700 44px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 10px;border-radius:6px';
      document.body.appendChild(el);
    }
    if (el) { el.textContent = lab || ''; el.style.display = lab ? 'block' : 'none'; }
  }, [i / FPS, label ? `f${i}` : '']);
  return page.screenshot({ type: 'png' });
}
const ff = (args) => new Promise((res, rej) => {
  const p = spawn(ffmpegPath, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
  p.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res()));
});

const frames = arg('--frames'), video = arg('--video'), contact = arg('--contact'), onion = arg('--onion');

if (frames) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of frames.split(',').map(Number)) {
    fs.writeFileSync(path.join(OUT, `f${String(f).padStart(4, '0')}.png`), await shot(f));
  }
  console.log(`✓ 정지 화면 ${frames} → ${OUT}`);
}

if (contact) {
  // 밀착 인화지: every 프레임마다 한 칸, 칸마다 프레임 번호를 박는다(노트에 프레임 번호로 적을 수 있게).
  const every = +arg('--every', 12), dir = fs.mkdtempSync(path.join(path.dirname(path.resolve(contact)), '.cs-'));
  const list = []; for (let f = 0; f < N; f += every) list.push(f);
  for (const [k, f] of list.entries()) fs.writeFileSync(path.join(dir, `${String(k).padStart(4, '0')}.png`), await shot(f, true));
  const cols = +arg('--cols', 4), rows = Math.ceil(list.length / cols);
  await ff(['-framerate', '1', '-i', path.join(dir, '%04d.png'), '-vf',
    `scale=${Math.round(W / 3)}:-1,tile=${cols}x${rows}:padding=4:color=gray`,
    '-frames:v', '1', path.resolve(contact)]);
  fs.rmSync(dir, { recursive: true });
  console.log(`✓ 밀착 인화지 ${list.length}칸(${every}프레임 간격) → ${contact}`);
}

if (onion) {
  // 잔상: a..b 프레임을 25% 불투명도로 겹친다. 간격이 키 근처에서 좁아지면 이징이 살아 있는 것.
  const [a, b] = onion.split('-').map(Number), dir = fs.mkdtempSync(path.join(OUT, '.on-'));
  for (let f = a; f <= b; f++) fs.writeFileSync(path.join(dir, `${f}.png`), await shot(f));
  const ins = []; for (let f = a; f <= b; f++) ins.push('-i', path.join(dir, `${f}.png`));
  const n = b - a + 1;
  await ff([...ins, '-filter_complex', `${Array.from({ length: n }, (_, k) => `[${k}:v]`).join('')}mix=inputs=${n}`, '-frames:v', '1', path.join(OUT, `onion_${a}-${b}.png`)]);
  fs.rmSync(dir, { recursive: true });
  console.log(`✓ 잔상 ${a}~${b} → ${path.join(OUT, `onion_${a}-${b}.png`)}`);
}

if (video) {
  fs.mkdirSync(path.dirname(path.resolve(video)), { recursive: true });
  const enc = spawn(ffmpegPath, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), path.resolve(video)],
  { stdio: ['pipe', 'ignore', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {           // 0..N-1
    const buf = await shot(i);
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if (i % 30 === 0) process.stdout.write(`\r  · ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  enc.stdin.end(); await new Promise((r) => enc.on('close', r));
  console.log(`\r✓ ${N}프레임 → ${video} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await browser.close();
