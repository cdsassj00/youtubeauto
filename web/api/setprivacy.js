// "발행" 버튼: 미리보기(unlisted)로 올라간 영상을 public 등으로 전환 (repository_dispatch: set-privacy).
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
  const videoId = String(body.videoId || '').trim();
  if (!videoId) return res.status(400).json({ error: 'videoId 가 필요합니다' });

  const client_payload = {
    video_id: videoId,
    status: ['public', 'unlisted', 'private'].includes(body.status) ? body.status : 'public',
    channel: ['default', 'ch2'].includes(body.channel) ? body.channel : 'default',
  };

  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'set-privacy', client_payload }),
  });
  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({ ok: true });
}
