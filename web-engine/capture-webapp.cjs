/** 웹앱 라이브 제작 패널을 목(mock) API로 띄워 녹화/스크린샷 — 디자인 확인용. */
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
for (const p of ['/opt/node22/lib/node_modules']) if (fs.existsSync(p)) Module.globalPaths.push(p);
Module._initPaths();
const { chromium } = require('playwright');

const OUT = path.resolve(__dirname, '..', 'out');
const INDEX = fs.readFileSync(path.resolve(__dirname, '..', 'web', 'public', 'index.html'), 'utf8');

function mock() {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  return {
    serverTime: new Date(now).toISOString(),
    jobStartedAt: iso(5 * 60 * 1000),
    latestRunId: 123,
    runs: [
      { id: 123, status: 'in_progress', conclusion: null, html_url: '#', created_at: iso(5 * 60 * 1000), title: 'RAG가 뭐길래 다들 쓸까?', event: 'repository_dispatch' },
      { id: 122, status: 'completed', conclusion: 'success', html_url: '#', created_at: iso(3600 * 1000), title: 'LLM은 어떻게 답을 만들까', event: 'schedule' },
      { id: 121, status: 'completed', conclusion: 'cancelled', html_url: '#', created_at: iso(2 * 3600 * 1000), title: '토큰과 임베딩 쉽게', event: 'workflow_dispatch' },
    ],
    steps: [
      { name: '대본 생성', status: 'completed', conclusion: 'success', started_at: iso(5 * 60 * 1000), completed_at: iso(4 * 60 * 1000) },
      { name: '나레이션 생성', status: 'completed', conclusion: 'success', started_at: iso(4 * 60 * 1000), completed_at: iso(3.5 * 60 * 1000) },
      { name: '렌더링', status: 'in_progress', conclusion: null, started_at: iso(3.5 * 60 * 1000), completed_at: null },
      { name: '유튜브 업로드', status: 'pending', conclusion: null, started_at: null, completed_at: null },
    ],
  };
}

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/runs')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mock()));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(INDEX);
    }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const W = 760, H = 1180;
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: path.join(OUT, 'rec'), size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000); // 바 차오르는 애니메이션 관찰
  await page.screenshot({ path: path.join(OUT, 'webapp-live.png') });
  await page.waitForTimeout(2000);
  const video = page.video();
  await ctx.close();
  await browser.close();
  server.close();
  if (video) { const p = await video.path(); fs.copyFileSync(p, path.join(OUT, 'webapp-live.webm')); }
  console.log('✓ out/webapp-live.png , out/webapp-live.webm');
}
main().catch((e) => { console.error(e); process.exit(1); });
