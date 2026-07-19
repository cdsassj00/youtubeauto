/** scene.html 을 커스텀 __DATA 로 띄워 스크린샷 — 데이터 주입 검증용. */
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
for (const p of ['/opt/node22/lib/node_modules']) if (fs.existsSync(p)) Module.globalPaths.push(p);
Module._initPaths();
const { chromium } = require('playwright');

const HTML = 'file://' + path.resolve(__dirname, 'scene.html');
const OUT = path.resolve(__dirname, '..', 'out');

const DATA = {
  kicker: 'AI 기초',
  title: 'LLM은 어떻게 답을 만들까',
  caption: '토큰을 하나씩 예측한다',
  accent: '#4dabf7',
  nodes: [
    { label: '입력 문장', color: '#e8590c' },
    { label: '토큰화', color: '#2f9e44' },
    { label: '확률 계산', color: '#9c36b5' },
    { label: '다음 토큰', color: '#e64980' },
    { label: '반복 생성', color: '#0c8599' },
  ],
};

async function main() {
  const W = 1280, H = 720;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[page-error]', e.message));
  await page.addInitScript((d) => { window.__DATA = d; window.__duration = 8; }, DATA);
  await page.goto(HTML, { waitUntil: 'load' });
  // 애니메이션 중반 지점으로 seek (노드/라벨 등장 상태 확인)
  await page.evaluate(() => window.__seek(0.6));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'scene-test.png') });
  await browser.close();
  console.log('✓ out/scene-test.png');
}
main().catch((e) => { console.error(e); process.exit(1); });
