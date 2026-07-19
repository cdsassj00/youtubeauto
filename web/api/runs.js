// 최근 GitHub Actions 실행 상태 + 최신 실행의 단계별 진행도를 웹앱에 반환.
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

  // 최신 실행의 단계별 상태 (진행바용). 파이프라인 4단계 스텝을 그대로 노출.
  let steps = [];
  if (runs[0]) {
    const jr = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${runs[0].id}/jobs`,
      { headers },
    );
    if (jr.ok) {
      const jd = await jr.json();
      const job = (jd.jobs || [])[0];
      steps = (job?.steps || []).map((s) => ({
        name: s.name,
        status: s.status, // queued | in_progress | completed
        conclusion: s.conclusion, // success | failure | skipped | null
      }));
    }
  }

  return res.status(200).json({ runs, steps, latestRunId: runs[0]?.id ?? null });
}
