// 실행 중인 워크플로를 중단한다.
// 잘못 시작한 실행을 그대로 두면 대본·이미지·TTS 비용이 끝까지 나가는데,
// 중단할 수단이 없어 손 놓고 지켜봐야 했던 적이 있어서 만들었다.
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

  // runId 를 안 주면 "지금 돌고 있는 가장 최근 실행"을 중단한다.
  let runId = String(body.runId || '').trim();
  if (!runId) {
    const lr = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=10`,
      { headers: gh(GITHUB_TOKEN) },
    );
    if (!lr.ok) return res.status(502).json({ error: `실행 목록 조회 실패 (${lr.status})` });
    const { workflow_runs = [] } = await lr.json();
    const active = workflow_runs.find((r) => r.status !== 'completed');
    if (!active) return res.status(200).json({ ok: true, note: '중단할 실행이 없습니다' });
    runId = String(active.id);
  }

  const r = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${runId}/cancel`,
    { method: 'POST', headers: gh(GITHUB_TOKEN) },
  );
  // 202 = 중단 요청 접수. 409 는 이미 끝났거나 중단 중이라는 뜻이라 실패로 보지 않는다.
  if (r.status !== 202 && r.status !== 409) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `중단 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({ ok: true, runId, status: r.status });
}

const gh = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});
