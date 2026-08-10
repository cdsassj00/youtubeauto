/**
 * ElevenLabs 목소리 목록 — 돈이 들지 않는 조회용.
 *
 * 왜 필요한가:
 *   나레이션 목소리는 ELEVENLABS_VOICE_ID 하나로 정해지는데, 그 ID 는 ElevenLabs 계정
 *   안에만 있다. 목소리를 새로 만들거나 바꾸고 싶을 때마다 웹 콘솔을 뒤져 ID 를 찾아
 *   옮겨 적어야 했고, 이름만 알고 ID 를 모르면 거기서 막힌다.
 *   이 스크립트는 계정의 목소리를 전부 뽑아 이름과 ID 를 나란히 보여준다.
 *
 * 조회만 한다 — 음성을 합성하지 않으므로 문자 사용량이 들지 않는다.
 */
import { config } from '../src/config.js';

type Voice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

async function main() {
  const key = config.elevenLabsApiKey();
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  if (!r.ok) {
    console.error(`❌ 조회 실패 (${r.status}) ${await r.text().catch(() => '')}`.slice(0, 400));
    process.exit(1);
  }
  const data = (await r.json()) as { voices?: Voice[] };
  const voices = data.voices || [];
  if (!voices.length) {
    console.error('❌ 목소리가 하나도 없습니다.');
    process.exit(1);
  }

  // 직접 만든 목소리(cloned/generated)를 위로 올린다 — 찾으려는 건 대개 그쪽이다.
  const rank = (v: Voice) => (v.category && v.category !== 'premade' ? 0 : 1);
  voices.sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''));

  const current = (process.env.ELEVENLABS_VOICE_ID || '').trim();
  console.log('────────────────────────────────────────────────────────────');
  console.log(`계정의 목소리 ${voices.length}개`);
  console.log('────────────────────────────────────────────────────────────');
  for (const v of voices) {
    const mine = v.category && v.category !== 'premade' ? '★' : ' ';
    const now = current && v.voice_id === current ? '  ← 지금 쓰는 목소리' : '';
    console.log(`${mine} ${(v.name || '(이름 없음)').padEnd(24)} ${v.voice_id}  [${v.category || '-'}]${now}`);
  }
  console.log('────────────────────────────────────────────────────────────');
  console.log('★ = 직접 만든/복제한 목소리');
  if (!current) {
    console.log('지금 ELEVENLABS_VOICE_ID 가 비어 있습니다.');
  } else if (!voices.some((v) => v.voice_id === current)) {
    console.log(`⚠ 지금 설정된 ID(${current.slice(0, 8)}…)가 이 계정 목록에 없습니다. 잘못된 값일 수 있습니다.`);
  }
  console.log('쓰려는 목소리의 ID 를 GitHub Variables 의 ELEVENLABS_VOICE_ID 에 넣으면 다음 영상부터 적용됩니다.');
}

main().catch((e) => {
  console.error('❌ 오류:', e?.message || e);
  process.exit(1);
});
