// A·B 두 영상을 세로 쇼츠 한 장(1080×1920)으로 합친다: 고정 제목 + 위 A + 아래 B + 이름표 + 소리.
//
//   node motion-lab/compose.mjs <config.json>
//
// config: { a, b, audio, out, loops, fps, kicker, title, labelA, labelB, foot }
//   loops: 루프를 몇 번 이어 붙일지(쇼츠는 끝나면 처음부터 다시 돈다 — 이음매 없는 루프면 끝없이 이어진다).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

let ffmpegPath = 'ffmpeg';
try { ffmpegPath = (await import('ffmpeg-static')).default || 'ffmpeg'; } catch {}

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = path.dirname(path.resolve(process.argv[2]));
const P = (p) => path.resolve(base, p);
const PANELS = [[24, 268, 1032, 650], [24, 936, 1032, 650]];
const loops = cfg.loops || 2, fps = cfg.fps || 30;

// 1) 틀(제목·이름표·종이)을 투명 PNG 로
const framePng = P(cfg.out.replace(/\.mp4$/, '_frame.png'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const c = { kicker: cfg.kicker, title: cfg.title, a: cfg.labelA, b: cfg.labelB, foot: cfg.foot, panels: PANELS, r: 28 };
await page.goto(pathToFileURL(path.resolve('motion-lab/frame.html')).href + '?c=' + encodeURIComponent(JSON.stringify(c)));
await page.waitForFunction(() => window.__ready === true);
await page.screenshot({ path: framePng, omitBackground: true });
await browser.close();

// 2) 합성: 종이 바탕 → A·B → 틀. 루프는 -stream_loop 로 이어 붙인다(프레임 0..N-1 이라 이음매가 없다).
const [[ax, ay, aw, ah], [bx, by, bw, bh]] = PANELS;
const args = ['-y', '-v', 'error',
  '-f', 'lavfi', '-i', `color=c=0xEAE6DF:s=1080x1920:r=${fps}`,
  '-stream_loop', String(loops - 1), '-i', P(cfg.a),
  '-stream_loop', String(loops - 1), '-i', P(cfg.b),
  '-loop', '1', '-i', framePng];
let amap = [];
if (cfg.audio) { args.push('-stream_loop', String(loops - 1), '-i', P(cfg.audio)); amap = ['-map', '4:a', '-c:a', 'aac', '-b:a', '192k']; }
args.push('-filter_complex',
  `[1:v]scale=${aw}:${ah}:flags=lanczos[a];[2:v]scale=${bw}:${bh}:flags=lanczos[b];` +
  `[0:v][a]overlay=${ax}:${ay}:shortest=1[t1];[t1][b]overlay=${bx}:${by}:shortest=1[t2];[t2][3:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
  '-map', '[v]', ...amap, '-c:v', 'libx264', '-profile:v', 'high', '-crf', '17', '-r', String(fps), '-shortest', '-movflags', '+faststart', P(cfg.out));
execFileSync(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`✓ ${P(cfg.out)} (${loops}루프)`);
