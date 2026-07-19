/**
 * 3D 웹녹화 렌더러 — 씬마다 3D 웹페이지(scene.html)를 자동 재생·녹화한 뒤,
 * 나레이션 오디오를 붙이고 전부 이어붙여 최종 mp4 를 만든다. 마지막에 BGM 을 깐다.
 *
 *   node web-engine/render3d.cjs <manifest.json> <out/video.mp4> <publicDir>
 *
 * - Playwright: 전역 설치(/opt/node22) 또는 프로젝트 의존성 어느 쪽이든 해석.
 * - ffmpeg: @ffmpeg-installer/ffmpeg (npm 번들 바이너리, apt 불필요 → 로컬·CI 동일).
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');

// Playwright 를 전역 경로에서도 찾도록 보강.
for (const p of ['/opt/node22/lib/node_modules', '/usr/lib/node_modules']) {
  if (fs.existsSync(p) && !Module.globalPaths.includes(p)) Module.globalPaths.push(p);
}
Module._initPaths();
const { chromium } = require('playwright');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;

const W = 1280, H = 720, FPS = 24;
const SCENE_HTML = 'file://' + path.resolve(__dirname, 'scene.html');
const ACCENTS = ['#e8590c', '#4dabf7', '#2f9e44', '#9c36b5', '#0c8599', '#e64980'];
const NODE_COLORS = ['#4dabf7', '#e8590c', '#2f9e44', '#9c36b5', '#0c8599', '#e64980'];

function ff(args) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

function firstSentence(text, max = 34) {
  const s = String(text || '').replace(/\s+/g, ' ').split(/(?<=[.?!…。])\s/)[0].trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function trimLabel(s, max = 12) {
  s = String(s || '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** manifest 의 Scene → scene.html 의 __DATA 로 변환. */
function sceneToData(scene, i) {
  const accent = ACCENTS[i % ACCENTS.length];
  let nodes = [];
  if (scene.diagram && scene.diagram.nodes && scene.diagram.nodes.length) {
    nodes = scene.diagram.nodes.map((n, k) => ({ label: trimLabel(n.label), color: NODE_COLORS[k % NODE_COLORS.length] }));
  } else if (scene.comparison) {
    const c = scene.comparison;
    nodes = [
      { label: trimLabel(c.leftTitle), color: '#4dabf7' },
      ...(c.leftItems || []).slice(0, 2).map((x) => ({ label: trimLabel(x), color: '#4dabf7' })),
      { label: trimLabel(c.rightTitle), color: '#e8590c' },
      ...(c.rightItems || []).slice(0, 2).map((x) => ({ label: trimLabel(x), color: '#e8590c' })),
    ].slice(0, 6);
  } else if (scene.bullets && scene.bullets.length) {
    nodes = scene.bullets.slice(0, 6).map((b, k) => ({ label: trimLabel(b), color: NODE_COLORS[k % NODE_COLORS.length] }));
  }
  const kickerMap = { title: 'INTRO', diagram: 'FLOW', comparison: 'VS', quote: 'QUOTE', outro: 'SUMMARY', bullets: 'KEY' };
  return {
    kicker: kickerMap[scene.visual] || 'AI',
    title: scene.heading || '',
    caption: scene.bullets && scene.bullets[0] ? scene.bullets[0] : firstSentence(scene.narration),
    accent,
    nodes,
  };
}

async function recordScene(browser, data, durationSec, outWebmDir) {
  const ctxStart = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: outWebmDir, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('  [scene page-error]', e.message));
  await page.addInitScript((d) => { window.__DATA = d.data; window.__duration = d.dur; }, { data, durationSec });
  await page.goto(SCENE_HTML, { waitUntil: 'load' });
  // 재생 시작 직전까지의 리드타임(녹화 시작~애니메이션 시작)을 측정해 나중에 -ss 로 잘라낸다.
  const lead = (Date.now() - ctxStart) / 1000;
  await page.evaluate(() => window.__play());
  const deadline = Date.now() + (durationSec + 3) * 1000;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => window.__done === true)) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  const video = page.video();
  await ctx.close();
  const p = await video.path();
  return { path: p, lead };
}

async function main() {
  const manifestPath = process.argv[2];
  const outPath = process.argv[3];
  const publicDir = process.argv[4] || path.resolve(__dirname, '..', 'public');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r3d-'));
  const recDir = path.join(tmp, 'rec');
  fs.mkdirSync(recDir, { recursive: true });

  console.log(`▶ 3D 렌더: ${manifest.scenes.length}개 씬`);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });

  const sceneMp4s = [];
  for (let i = 0; i < manifest.scenes.length; i++) {
    const scene = manifest.scenes[i];
    const dur = Math.max(1, scene.durationSec || scene.durationInFrames / FPS || 4);
    const data = sceneToData(scene, i);
    process.stdout.write(`  · (${i + 1}/${manifest.scenes.length}) ${scene.id} 녹화… `);
    const { path: webm, lead } = await recordScene(browser, data, dur, recDir);

    const audio = path.join(publicDir, scene.audioPath); // 예: public/audio/s1.mp3
    const sceneMp4 = path.join(tmp, `scene${i}.mp4`);
    const hasAudio = fs.existsSync(audio);
    // 리드타임(-ss)만큼 앞을 잘라 애니메이션 시작을 나레이션 시작과 맞춘다.
    const args = ['-y', '-ss', lead.toFixed(3), '-i', webm];
    if (hasAudio) args.push('-i', audio);
    // 영상: 정확히 dur 로 트림, 마지막 프레임 부족 시 복제 패딩.
    args.push(
      '-filter_complex',
      `[0:v]scale=${W}:${H},fps=${FPS},tpad=stop_mode=clone:stop_duration=2,format=yuv420p,trim=duration=${dur},setpts=PTS-STARTPTS[v]`,
      '-map', '[v]',
    );
    if (hasAudio) args.push('-map', '1:a');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21');
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '160k');
    args.push('-t', String(dur), '-movflags', '+faststart', sceneMp4);
    ff(args);
    sceneMp4s.push(sceneMp4);
    console.log('ok');
  }
  await browser.close();

  // 이어붙이기.
  console.log('  · 씬 이어붙이기');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, sceneMp4s.map((p) => `file '${p}'`).join('\n'));
  const body = path.join(tmp, 'body.mp4');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', body]);

  // BGM 믹스 (있으면).
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const bgmPath = manifest.bgm ? path.join(publicDir, manifest.bgm) : null;
  if (bgmPath && fs.existsSync(bgmPath)) {
    console.log('  · 배경음악 믹스');
    ff([
      '-y', '-i', body, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', '[1:a]volume=0.14[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', outPath,
    ]);
  } else {
    fs.copyFileSync(body, outPath);
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('✓ 3D 영상 저장:', outPath);
}

main().catch((e) => { console.error('3D 렌더 실패:', e); process.exit(1); });
