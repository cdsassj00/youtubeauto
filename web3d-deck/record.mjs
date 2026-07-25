// HTML(3D 발표 + WebAudio 나레이션) → webm 녹화.
// 페이지 안에서 canvas.captureStream + WebAudio(MediaStreamDestination)를 MediaRecorder로 합쳐
// 실제 재생을 그대로 녹화한다(A/V 싱크 보장). 출력은 webm(그 뒤 ffmpeg로 mp4).
import pw from 'playwright';
const { chromium } = pw;
import fs from 'node:fs';

const HTML = process.env.HTML;
const OUT = process.env.OUT || 'out.webm';
const MAX_SECONDS = Number(process.env.MAX_SECONDS || 2400); // 하드 캡
const WAIT_FINISH = process.env.WAIT_FINISH !== '0';
const FPS = Number(process.env.FPS || 30);

const initScript = () => {
  // 앱 스크립트보다 먼저 실행 — 재생되는 모든 오디오를 공유 AudioContext로 탭.
  window.__ac = null; window.__capDest = null;
  window.__ensureAC = function () {
    if (!window.__ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      window.__ac = new AC();
      window.__capDest = window.__ac.createMediaStreamDestination();
    }
    if (window.__ac.state === 'suspended') window.__ac.resume();
    return window.__ac;
  };
  const srcMap = new WeakMap();
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      const ac = window.__ensureAC();
      if (!srcMap.has(this)) {
        const node = ac.createMediaElementSource(this);
        node.connect(ac.destination);
        node.connect(window.__capDest);
        srcMap.set(this, node);
      }
    } catch (e) { /* 이미 연결됨/불가 시 무시 */ }
    return origPlay.apply(this, arguments);
  };
};

const run = async () => {
  const outStream = fs.createWriteStream(OUT);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
      '--window-size=1920,1080',
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.text(); if (/error|warn|녹화|REC|FINISH/i.test(t)) console.log('[page]', t); });
  await page.addInitScript(initScript);

  let bytes = 0;
  await page.exposeFunction('__saveChunk', (b64) => {
    const buf = Buffer.from(b64, 'base64'); bytes += buf.length; outStream.write(buf);
  });

  console.log('로딩:', HTML);
  await page.goto('file://' + HTML, { waitUntil: 'load', timeout: 120000 });
  // 로더 사라질 때까지(무대 준비 완료)
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => {
    const l = document.getElementById('loader');
    return !l || l.offsetParent === null || getComputedStyle(l).display === 'none' || getComputedStyle(l).opacity === '0';
  }, { timeout: 60000 }).catch(() => console.log('loader 대기 타임아웃(무시)'));

  // 녹화 세팅
  await page.evaluate((fps) => {
    const canvas = document.getElementById('gl');
    window.__ensureAC();
    const vstream = canvas.captureStream(fps);
    const tracks = [...vstream.getVideoTracks(), ...window.__capDest.stream.getAudioTracks()];
    const combined = new MediaStream(tracks);
    let mime = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    const rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 128000 });
    rec.ondataavailable = async (e) => {
      if (!e.data || !e.data.size) return;
      const buf = await e.data.arrayBuffer();
      let bin = ''; const b = new Uint8Array(buf);
      const CH = 0x8000;
      for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode.apply(null, b.subarray(i, i + CH));
      window.__saveChunk(btoa(bin));
    };
    rec.start(2000);
    window.__rec = rec;
    window.__stopRec = () => new Promise((res) => { rec.onstop = res; rec.stop(); });
    console.log('REC start mime=' + mime + ' videoTracks=' + vstream.getVideoTracks().length + ' audioTracks=' + window.__capDest.stream.getAudioTracks().length);
  }, FPS);

  // 재생 시작 — 시작 버튼 클릭, 안되면 Space
  const clicked = await page.evaluate(() => {
    const b = document.getElementById('npStart');
    if (b) { b.click(); return 'npStart'; }
    return null;
  });
  if (!clicked) { await page.keyboard.press('Space'); }
  console.log('재생 시작:', clicked || 'Space');

  // 종료 감지: #npBtn 이 "다시보기"로 바뀌거나 MAX_SECONDS 도달
  const t0 = Date.now();
  let finished = false;
  while ((Date.now() - t0) / 1000 < MAX_SECONDS) {
    await page.waitForTimeout(3000);
    if (WAIT_FINISH) {
      const done = await page.evaluate(() => {
        const btn = document.getElementById('npBtn');
        return btn ? /다시보기/.test(btn.textContent || '') : false;
      }).catch(() => false);
      if (done) { finished = true; break; }
    }
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    process.stdout.write(`\r  녹화중 ${el}s, ${(bytes / 1e6).toFixed(1)}MB`);
  }
  console.log(`\n종료(${finished ? 'finish 감지' : 'MAX/캡'}). 레코더 정지…`);
  await page.evaluate(() => window.__stopRec()).catch((e) => console.log('stop err', e));
  await page.waitForTimeout(1500);
  outStream.end();
  await new Promise((r) => outStream.on('finish', r));
  await browser.close();
  console.log('저장:', OUT, (bytes / 1e6).toFixed(1) + 'MB');
};

run().catch((e) => { console.error('실패:', e); process.exit(1); });
