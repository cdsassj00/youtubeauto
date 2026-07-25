/* ssjhtmlvideo 에셋 준비 — 폰트와 Three.js 를 assets/ 로 내려받는다(최초 1회).
   스킬 저장소를 가볍게 유지하려고 바이너리를 커밋하지 않고 필요할 때 받는다.
   사용: node fetch-assets.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, 'assets');
fs.mkdirSync(DIR, { recursive: true });

const ASSETS = [
  {
    file: 'pretendard.woff2',
    url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
    why: '한글 본문 폰트(가변). 없으면 환경에 따라 엉뚱한 폰트로 렌더된다.',
  },
  {
    file: 'mono.woff2',
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.woff2',
    why: '기술 라벨용 모노스페이스. SIGNAL 스타일의 신뢰감을 만든다.',
  },
  {
    file: 'three.min.js',
    url: 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
    why: 'DECK3D 엔진용(전역 THREE). signal/signal3d 만 쓸 거면 없어도 된다.',
  },
];

for (const a of ASSETS) {
  const out = path.join(DIR, a.file);
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
    console.log(`= 이미 있음: ${a.file}`);
    continue;
  }
  process.stdout.write(`↓ ${a.file} … `);
  try {
    const res = await fetch(a.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
  } catch (e) {
    console.log(`실패 — ${e.message}`);
    console.log(`  (${a.why})`);
    console.log(`  직접 받아 ${out} 에 두어도 된다: ${a.url}`);
  }
}
console.log('\n에셋 준비 완료 →', DIR);
