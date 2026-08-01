// 화풍 견본 시트 생성 트리거 (repository_dispatch: style-sheet).
// 영상을 만들지 않고 이미지 몇 장만 뽑으므로 빠르고 저렴하다 —
// 어떤 화풍으로 갈지 고르기 전에 눈으로 확인하는 용도.
const ART_STYLES = ['isometric', 'comic', 'watercolor', 'cinematic', 'retro', 'clay', 'pixar'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 만 허용됩니다' });
  }
  const { GITHUB_TOKEN, GITHUB_REPO, APP_PASSWORD } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (APP_PASSWORD && body.password !== APP_PASSWORD) {
    return res.status(401).json({ error: '앱 비밀번호가 올바르지 않습니다' });
  }

  // 목록 밖 값은 조용히 버린다(오타로 엉뚱한 인자가 워크플로로 넘어가지 않게).
  const requested = String(body.styles || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ART_STYLES.includes(s));

  const client_payload = {
    styles: requested.join(','), // 비면 전체
    provider: ['openai', 'gemini'].includes(body.provider) ? body.provider : '',
  };

  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'style-sheet', client_payload }),
  });

  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({
    ok: true,
    applied: {
      styles: client_payload.styles || '(전체)',
      provider: client_payload.provider || '(저장소 기본값)',
    },
  });
}
