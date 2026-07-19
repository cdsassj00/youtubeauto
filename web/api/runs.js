// 최근 GitHub Actions 실행 상태를 웹앱에 반환 (진행 상황 표시용).
export default async function handler(req, res) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const rr = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=6`,
    { headers },
  );
  if (!rr.ok) {
    return res.status(502).json({ error: `실행 목록 조회 실패 (${rr.status})` });
  }
  const data = await rr.json();
  const runs = (data.workflow_runs || []).map((w) => ({
    id: w.id,
    status: w.status,
    conclusion: w.conclusion,
    html_url: w.html_url,
    created_at: w.created_at,
    title: w.display_title,
    event: w.event,
  }));

  // 진행 중인 최신 실행의 현재 단계 이름
  let currentStep = null;
  const active = runs.find((w) => w.status !== 'completed');
  if (active) {
    const jr = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${active.id}/jobs`,
      { headers },
    );
    if (jr.ok) {
      const jd = await jr.json();
      const job = (jd.jobs || [])[0];
      const steps = job?.steps || [];
      const running = steps.find((s) => s.status === 'in_progress');
      currentStep = running ? running.name : null;
    }
  }

  return res.status(200).json({ runs, currentStep });
}
