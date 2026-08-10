// 채널 브랜딩 적용 트리거 (repository_dispatch: branding).
//
// 배너·워터마크·채널 설명은 YouTube Data API 로 올릴 수 있다(프로필 사진만 불가).
// 이미지는 저장소 public/brand/ 에 있으므로, 여기서는 "어느 채널에" "설명까지 적용할지"만 정한다.
//
// ★채널 기본값을 default 로 두지 않는다★
// 브랜딩은 덮어쓰기라 실수로 본 채널을 덮으면 되돌리기가 번거롭다. 값을 안 보내면
// 아무 채널도 고르지 않은 것으로 보고 400 으로 거절한다 — 조용히 기본 채널에
// 적용되는 것보다 낫다.
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

  const channel = String(body.channel || '').trim();
  if (!['default', 'ch2'].includes(channel)) {
    return res.status(400).json({ error: "channel 을 'default' 또는 'ch2' 로 명시해야 합니다" });
  }
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';
  const client_payload = {
    channel,
    apply_description: truthy(body.apply_description ?? body.description) ? 'true' : 'false',
  };

  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'branding', client_payload }),
  });
  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  // 무엇이 전달됐는지 되돌려준다 — 채널을 잘못 보냈는지 응답만 보고 알 수 있게.
  return res.status(200).json({ ok: true, applied: client_payload });
}
