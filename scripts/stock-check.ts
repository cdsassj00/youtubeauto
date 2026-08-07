/**
 * Pexels 키 점검 — 돈이 들지 않는 확인용.
 *
 * 왜 필요한가: 파이프라인은 키가 없거나 틀려도 조용히 B롤을 건너뛴다(있으면 좋고 없어도
 * 영상은 나와야 하므로 그렇게 설계했다). 그래서 키가 잘못돼 있으면 유료 영상을 한 편 다
 * 뽑고 나서야 "B롤이 왜 없지?" 하고 알게 된다. 그걸 30초 만에 미리 알자는 것이다.
 *
 * 여기서는 검색만 한다 — 파일을 내려받지 않고 AI 도 부르지 않는다. Pexels 무료 키의
 * 시간당 200회 한도에서 6회만 쓴다.
 */
import { fetchClip, fetchPhoto } from '../src/lib/stock.js';
import { config } from '../src/config.js';

// 실제 대본이 만들어 내는 것과 비슷한 결로 고른 질의들.
// 마지막 둘은 일부러 구체적으로 잡았다 — 영상이 안 잡히고 사진으로 떨어지는 경로가
// 실제로 동작하는지 확인하는 것이 이 점검의 핵심이기 때문이다.
const QUERIES = [
  'data center servers',
  'semiconductor cleanroom worker',
  'high bandwidth memory chip stack',
];

async function main() {
  if (!config.pexelsApiKey) {
    console.error('✗ PEXELS_API_KEY 가 비어 있습니다. GitHub Secrets 에 등록됐는지 확인하세요.');
    process.exit(1);
  }
  console.log(`· 키 확인됨 (${config.pexelsApiKey.length}자)`);

  let videoHits = 0;
  let photoHits = 0;
  let fail = 0;

  for (const [i, q] of QUERIES.entries()) {
    const v = await fetchClip(q, i);
    const p = await fetchPhoto(q, i);
    if (v) videoHits++;
    if (p) photoHits++;
    if (!v && !p) fail++;
    const mark = v ? '영상' : p ? '사진(영상 없음 → 대체 동작)' : '없음';
    console.log(`  · "${q}" → ${mark}`);
  }

  console.log(`\n결과: 영상 ${videoHits}/${QUERIES.length} · 사진 ${photoHits}/${QUERIES.length}`);

  if (photoHits === 0) {
    // 사진은 어떤 키워드로도 거의 항상 잡힌다. 전부 0이면 키가 거절됐다는 뜻이다
    // (fetchPhoto 는 401/429 를 경고만 찍고 null 을 돌려주므로 위 로그를 함께 봐야 한다).
    console.error('✗ 사진이 한 건도 안 잡혔습니다 — 키가 거절됐거나(401) 한도 초과(429)일 가능성이 큽니다.');
    process.exit(1);
  }
  if (fail) {
    console.warn(`△ ${fail}개 질의는 영상·사진 모두 실패했습니다. 키는 살아 있지만 그 씬은 B롤 없이 갑니다.`);
  }
  console.log('✓ Pexels 연결 정상. B롤이 실제 영상에 들어갑니다.');
}

main().catch((e) => {
  console.error('✗ 점검 실패:', (e as Error).message);
  process.exit(1);
});
