/**
 * 3D 웹페이지 녹화 캡처기 (프로토타입)
 *
 * 아이디어(사용자 제안): "웹페이지로 해서 스크롤/애니메이션을 자동으로 움직이는 것을
 * 녹화한 다음에 나레이션만 붙이는 방식".
 *
 * demo.html 은 Three.js 3D 씬을 그리고, window.__play() 로 실시간 자동 재생한다.
 * Playwright 의 recordVideo 로 캔버스를 그대로 녹화해 webm 을 만든 뒤,
 * (설치돼 있으면) ffmpeg 로 mp4 로 변환한다. 이후 파이프라인에서 나레이션을 얹으면 된다.
 *
 * 실행:
 *   node web-engine/capture.cjs [demo.html] [outDir]
 * playwright 가 전역(/opt/node22)만 있을 수 있어 require 경로를 보강한다.
 */
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');

// 전역 설치 경로를 require 검색 경로에 추가 (프로젝트에 없을 때 대비).
for (const p of ['/opt/node22/lib/node_modules', '/usr/lib/node_modules']) {
  if (fs.existsSync(p) && !Module.globalPaths.includes(p)) Module.globalPaths.push(p);
}
process.env.NODE_PATH = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

const { chromium } = require('playwright');

const PW_FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

async function main() {
  const demo = path.resolve(process.argv[2] || path.join(__dirname, 'demo.html'));
  const outDir = path.resolve(process.argv[3] || path.join(__dirname, '..', 'out'));
  fs.mkdirSync(outDir, { recursive: true });
  const recDir = path.join(outDir, 'rec');
  fs.mkdirSync(recDir, { recursive: true });

  const W = 1280, H = 720;
  console.log('· 브라우저 실행 (headless chromium, software WebGL)');
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: recDir, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  page.on('console', (m) => console.log('  [page]', m.text()));
  page.on('pageerror', (e) => console.log('  [page-error]', e.message));

  console.log('· demo 로드:', demo);
  await page.goto('file://' + demo, { waitUntil: 'load' });

  // 3D 초기화 대기.
  const dur = await page.evaluate(() => window.__duration || 6);
  console.log(`· 자동 재생 시작 (${dur}s)`);
  await page.evaluate(() => window.__play());

  // __done 플래그를 폴링 (여유 1초).
  const deadline = Date.now() + (dur + 3) * 1000;
  while (Date.now() < deadline) {
    const done = await page.evaluate(() => window.__done === true);
    if (done) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);

  console.log('· 녹화 종료');
  const video = page.video();
  await context.close(); // 컨텍스트를 닫아야 webm 이 확정 저장됨.
  await browser.close();

  const webmPath = video ? await video.path() : null;
  if (!webmPath || !fs.existsSync(webmPath)) {
    throw new Error('녹화 파일을 찾지 못했습니다.');
  }
  const finalWebm = path.join(outDir, '3d-demo.webm');
  fs.copyFileSync(webmPath, finalWebm);
  const kb = (fs.statSync(finalWebm).size / 1024).toFixed(0);
  console.log(`✓ webm 저장: ${finalWebm} (${kb} KB)`);

  // mp4 변환(선택). Playwright 번들 ffmpeg 사용.
  const ffmpeg = fs.existsSync(PW_FFMPEG) ? PW_FFMPEG : 'ffmpeg';
  const mp4Path = path.join(outDir, '3d-demo.mp4');
  const r = spawnSync(
    ffmpeg,
    ['-y', '-i', finalWebm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path],
    { stdio: 'inherit' },
  );
  if (r.status === 0 && fs.existsSync(mp4Path)) {
    console.log(`✓ mp4 저장: ${mp4Path}`);
  } else {
    console.log('· mp4 변환 생략(ffmpeg 미가용) — webm 만 생성됨');
  }
}

main().catch((e) => {
  console.error('실패:', e);
  process.exit(1);
});
