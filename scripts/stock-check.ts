/**
 * 스톡 소스 점검 — 돈이 들지 않는 확인용.
 *
 * 왜 필요한가: 파이프라인은 키가 없거나 틀려도 조용히 넘어간다(B롤은 있으면 좋고 없어도
 * 영상은 나와야 하므로 그렇게 설계했다). 그래서 키가 잘못돼 있으면 유료 영상을 한 편 다
 * 뽑고 나서야 알게 된다. 그걸 30초 만에 미리 알자는 것이다.
 *
 * 여기서는 검색만 한다 — 파일을 내려받지 않고 AI 도 부르지 않는다.
 */
import { config } from '../src/config.js';
import { availableProviders, type StockProvider } from '../src/lib/stockProviders.js';

// 실제 대본이 만들어 내는 것과 비슷한 결로 고른 질의들.
// 뒤로 갈수록 구체적이다 — 소스별로 어디서부터 결과가 마르는지 보려는 것이다.
const QUERIES = [
  'data center servers',
  'semiconductor cleanroom worker',
  'high bandwidth memory chip stack',
];

/** 검색만 한다(내려받지 않는다). 결과 개수만 돌려준다. */
async function countHits(p: StockProvider, q: string): Promise<{ video: number; photo: number } | null> {
  const enc = encodeURIComponent(q);
  try {
    if (p === 'pexels') {
      const [v, ph] = await Promise.all([
        fetch(`https://api.pexels.com/videos/search?query=${enc}&per_page=15&orientation=landscape`, {
          headers: { Authorization: config.pexelsApiKey },
        }),
        fetch(`https://api.pexels.com/v1/search?query=${enc}&per_page=15&orientation=landscape`, {
          headers: { Authorization: config.pexelsApiKey },
        }),
      ]);
      if (!v.ok && !ph.ok) return null;
      const vj = v.ok ? ((await v.json()) as { videos?: unknown[] }).videos || [] : [];
      const pj = ph.ok ? ((await ph.json()) as { photos?: unknown[] }).photos || [] : [];
      return { video: vj.length, photo: pj.length };
    }
    if (p === 'pixabay') {
      const k = encodeURIComponent(config.pixabayApiKey);
      const [v, ph] = await Promise.all([
        fetch(`https://pixabay.com/api/videos/?key=${k}&q=${enc}&per_page=20&safesearch=true`),
        fetch(`https://pixabay.com/api/?key=${k}&q=${enc}&image_type=photo&orientation=horizontal&per_page=20&safesearch=true`),
      ]);
      if (!v.ok && !ph.ok) return null;
      const vj = v.ok ? ((await v.json()) as { hits?: unknown[] }).hits || [] : [];
      const pj = ph.ok ? ((await ph.json()) as { hits?: unknown[] }).hits || [] : [];
      return { video: vj.length, photo: pj.length };
    }
    // Unsplash 는 영상 API 가 없다 — 사진만 센다.
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${enc}&per_page=20&orientation=landscape`, {
      headers: { Authorization: `Client-ID ${config.unsplashAccessKey}`, 'Accept-Version': 'v1' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: unknown[] };
    return { video: 0, photo: (j.results || []).length };
  } catch {
    return null;
  }
}

async function main() {
  const providers = availableProviders();
  if (!providers.length) {
    console.error(
      '✗ 스톡 키가 하나도 없습니다. GitHub Secrets 에 아래 중 최소 하나를 등록하세요:\n' +
        '    PEXELS_API_KEY / PIXABAY_API_KEY / UNSPLASH_ACCESS_KEY',
    );
    process.exit(1);
  }
  console.log(`· 사용 가능한 소스: ${providers.join(', ')}`);
  for (const p of ['pexels', 'pixabay', 'unsplash'] as StockProvider[]) {
    if (!providers.includes(p)) console.log(`  · ${p.padEnd(9)} 키 없음 (건너뜀)`);
  }
  console.log('');

  let anyHit = false;
  const dead: StockProvider[] = [];

  for (const p of providers) {
    let hits = 0;
    let failed = 0;
    for (const q of QUERIES) {
      const c = await countHits(p, q);
      if (!c) {
        failed++;
        console.log(`  · ${p.padEnd(9)} "${q}" → 요청 실패(키 거절 또는 한도 초과)`);
        continue;
      }
      hits += c.video + c.photo;
      const label = p === 'unsplash' ? `사진 ${c.photo}` : `영상 ${c.video} · 사진 ${c.photo}`;
      console.log(`  · ${p.padEnd(9)} "${q}" → ${label}`);
    }
    if (failed === QUERIES.length || hits === 0) dead.push(p);
    if (hits > 0) anyHit = true;
  }

  console.log('');
  if (dead.length) {
    console.error(`✗ 결과가 하나도 없는 소스: ${dead.join(', ')} — 키가 거절됐거나(401) 한도 초과(429)일 수 있습니다.`);
  }
  if (!anyHit) {
    console.error('✗ 어떤 소스에서도 결과를 못 받았습니다.');
    process.exit(1);
  }
  console.log('✓ 스톡 연결 정상. B롤·실사 푸티지가 실제 영상에 들어갑니다.');
  if (dead.length) process.exit(1);
}

main().catch((e) => {
  console.error('✗ 점검 실패:', (e as Error).message);
  process.exit(1);
});
