// 차트 HTML 을 프레임 단위로 찍어 MP4 로 굽는다(소리 없음 — 비트는 업로드 단계에서 깐다).
//
//   node shorts-charts/render.mjs shorts-charts/charts/speedrun.html assets/shorts/charts/speedrun.mp4
//   node shorts-charts/render.mjs <html> <outdir> --stills 3,10,20     # 미리보기 PNG 몇 장
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';

const [html, out, ...rest] = process.argv.slice(2);
if (!html || !out) {
  console.error('사용법: node shorts-charts/render.mjs <chart.html> <out.mp4 | outdir --stills t1,t2>');
  process.exit(1);
}
const stillsArg = rest.includes('--stills') ? rest[rest.indexOf('--stills') + 1] : null;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--allow-file-access-from-files', '--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto('file://' + path.resolve(html));
await page.evaluate(() => window.READY);
const { duration, fps, hits } = await page.evaluate(() => window.CHART);
const canvas = page.locator('#c');

if (stillsArg) {
  fs.mkdirSync(out, { recursive: true });
  const name = path.basename(html, '.html');
  for (const t of stillsArg.split(',').map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    await canvas.screenshot({ path: path.join(out, `${name}_${String(t).padStart(5, '0')}.png`) });
  }
  await browser.close();
  process.exit(0);
}

const total = Math.round(duration * fps);
fs.mkdirSync(path.dirname(out), { recursive: true });
const ff = spawn(ffmpegPath, [
  '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-movflags', '+faststart', '-r', String(fps), out,
], { stdio: ['pipe', 'ignore', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.seek(t), i / fps);
  const buf = await canvas.screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 90 === 0) process.stdout.write(`\r  ${path.basename(html)} ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`\n  임팩트 시각(bgm.hits): ${JSON.stringify(hits)}`);
console.log(`✓ ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)}MB, ${duration}s)`);
