/* deck.json → mp4 (한 방에). build-deck.py 로 HTML 조립 → 프레임 단위 렌더 → ffmpeg 합성.
   사용: node render-deck.mjs deck.json out.mp4 [durationSec]
   프레임 렌더라 GPU 속도와 무관하게 매끄럽다(버벅임 없음). 나레이션은 별도 mux(추후). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');   // playwright 는 CommonJS
const FFMPEG = require('ffmpeg-static');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = Number(process.env.FPS || 30);
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);

const [deckPath, outPath, durArg] = process.argv.slice(2);
if (!deckPath || !outPath) { console.error('사용: node render-deck.mjs deck.json out.mp4 [durationSec]'); process.exit(1); }

const work = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'deck3d-'));
const htmlPath = path.join(work, 'deck.html');
const framesDir = path.join(work, 'frames'); fs.mkdirSync(framesDir);

// 1) deck.json → HTML
const r = spawnSync('python3', [path.join(HERE, 'build-deck.py'), deckPath, htmlPath], { encoding: 'utf8' });
if (r.status !== 0) { console.error('build-deck 실패:', r.stderr || r.stdout); process.exit(1); }
console.log(r.stdout.trim());

// 슬라이드 수로 기본 길이 추정(2.8초/슬라이드), 인자 있으면 우선.
const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
const nSlides = (deck.slides || []).length || 6;
const DUR = Number(durArg) || Math.max(8, Math.round(nSlides * 2.8));
const N = FPS * DUR;
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// 2) 프레임 렌더
const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--force-color-profile=srgb'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.waitForTimeout(2000); // 폰트+씬 준비
const maxScroll = await page.evaluate(() => document.body.scrollHeight - innerHeight);
console.log(`렌더: ${N}프레임 (${DUR}s @ ${FPS}fps), ${W}x${H}`);
for (let i = 0; i < N; i++) {
  const f = ease(i / (N - 1));
  await page.evaluate(y => window.scrollTo(0, y), Math.round(maxScroll * f));
  await page.waitForTimeout(38);
  await page.screenshot({ path: path.join(framesDir, 'f' + String(i).padStart(5, '0') + '.png') });
  if (i % 30 === 0) process.stdout.write(`\r  ${i}/${N}`);
}
await browser.close();
console.log('\n프레임 완료. ffmpeg 합성…');

// 3) ffmpeg → mp4
const ff = spawnSync(FFMPEG, ['-hide_banner','-y','-framerate', String(FPS),
  '-i', path.join(framesDir, 'f%05d.png'),
  '-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','19','-movflags','+faststart', outPath], { stdio: 'inherit' });
fs.rmSync(work, { recursive: true, force: true });
if (ff.status !== 0) { console.error('ffmpeg 실패'); process.exit(1); }
console.log('완료:', outPath);
