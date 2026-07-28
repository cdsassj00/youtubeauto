/* mem-diagrams.html 의 도식들을 1920x1080 PNG 로 뽑는다.
   사용: node web3d-deck/shot-diagrams.mjs [출력디렉터리]
   폰트를 base64 로 심어 넣으므로 환경(폰트 설치 여부)과 무관하게 같은 결과가 나온다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(HERE, '..', 'out', 'diagrams');
fs.mkdirSync(OUT, { recursive: true });
// 샌드박스에는 Playwright 기본 캐시에 브라우저가 없어 경로를 직접 준다(CI 에선 기본 경로 사용).
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.CHROME_BIN || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : '');
// 폰트를 base64 로 심어 넣어 환경과 무관하게 같은 글꼴로 렌더한다.
const b64 = fs.readFileSync(path.join(HERE, 'pretendard.woff2')).toString('base64');
const m64 = fs.readFileSync(path.join(HERE, 'mono.woff2')).toString('base64');
const ff = `<style>
@font-face{font-family:'Pretendard';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:500 700;font-display:block;src:url(data:font/woff2;base64,${m64}) format('woff2')}
</style>`;
let html = fs.readFileSync(path.join(HERE, 'mem-diagrams.html'), 'utf8').replace('</head>', ff + '</head>');
const tmp = path.join(OUT, '_rendered.html');
fs.writeFileSync(tmp, html);

const browser = await chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}) });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + tmp, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const names = ['ram','poweroff','ddr','ai','hbm','cost','price'];
for (let i = 1; i <= names.length; i++) {
  await page.evaluate(n => window.__show(n), i);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `d${i}-${names[i - 1]}.png`) });
}
console.log('렌더 완료 —', names.length, '장 →', OUT, '/ 페이지 에러:', errs.length ? errs : '없음');
await browser.close();
