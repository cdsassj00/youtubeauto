// 이미 렌더까지 끝난 실행의 산출물을 그대로 유튜브에 올린다 (repository_dispatch: upload-existing).
// 렌더가 성공했는데 업로드만 빠진 경우, 20분짜리 재렌더 없이 업로드 단계만 다시 실행하기 위한 경로.
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

  const sourceRunId = String(body.runId || body.source_run_id || '').trim();
  if (!/^\d+$/.test(sourceRunId)) {
    return res.status(400).json({ error: '영상이 들어 있는 실행 ID(runId)가 필요합니다' });
  }

  const client_payload = {
    source_run_id: sourceRunId,
    privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : 'unlisted',
    // 메타를 script.json 에서 읽을지 deck-meta.json 에서 읽을지 가르므로 원래 엔진과 맞춰야 한다.
    engine: ['illustrated', 'deck3d', 'signal', 'signal3d'].includes(body.engine) ? body.engine : 'signal3d',
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
    body: JSON.stringify({ event_type: 'upload-existing', client_payload }),
  });

  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({ ok: true, applied: client_payload });
}
