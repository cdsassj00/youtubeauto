// 컷아웃 판화 견본 생성 트리거 (repository_dispatch: cutout-sheet).
// VOX 스타일 엔진을 만들기 전에 그림이 쓸 만한지부터 싸게 확인하는 용도.
const SUBJECTS = ['datacenter', 'wafer', 'factory', 'engineer', 'robotarm', 'ship'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 허용됩니다' });
  const { GITHUB_TOKEN, GITHUB_REPO, APP_PASSWORD } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (APP_PASSWORD && body.password !== APP_PASSWORD) {
    return res.status(401).json({ error: '앱 비밀번호가 올바르지 않습니다' });
  }
  const want = String(body.subjects || '').split(',').map((s) => s.trim()).filter((s) => SUBJECTS.includes(s));
  const client_payload = {
    styles: want.join(','), // 워크플로가 읽는 인자 이름을 그대로 쓴다
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
    body: JSON.stringify({ event_type: 'cutout-sheet', client_payload }),
  });
  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({ ok: true, applied: { subjects: client_payload.styles || '(전체)', provider: client_payload.provider || '(기본값)' } });
}
