// 웹앱 → GitHub Actions 트리거 (repository_dispatch).
// GITHUB_TOKEN 은 서버(함수)에만 있고 브라우저에 노출되지 않는다.
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

  const client_payload = {
    // 뉴스 스크립트급 긴 브리핑(타임코드별 섹션 + 참고자료 링크 포함)도 안 잘리게 넉넉히 허용
    // (200자 제한이 "충실 반영" 기능을 무력화시켰던 전례가 있음). GitHub repository_dispatch
    // client_payload 한도(256KB)에 비하면 여전히 작아 안전하다.
    topic: String(body.topic || '').slice(0, 20000),
    content_mode: ['auto', 'trend', 'basics'].includes(body.mode) ? body.mode : 'auto',
    content_level: ['basic', 'intermediate', 'expert'].includes(body.level) ? body.level : 'expert',
    do_upload: body.upload ? 'true' : 'false',
    target_minutes: String(Math.max(2, Math.min(20, Number(body.minutes) || 10))),
    // 업로드 대상 채널 (default | ch2). 알 수 없는 값은 default 로 안전 처리.
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
    body: JSON.stringify({ event_type: 'publish-video', client_payload }),
  });

  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({ ok: true });
}
