// 업로드 결과 조회 — 워크플로가 남긴 "result__vid-<id>__pv-<privacy>" 아티팩트 이름을 파싱해
// videoId·공개상태를 돌려준다. zip 다운로드 없이 목록 조회만으로 미리보기(임베드)·발행 UI 구성.
// ?run=<id> 주면 그 실행의 아티팩트만, 없으면 저장소 전체에서 가장 최근 result 아티팩트.
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
  const run = String((req.query && req.query.run) || '').trim();
  const url = run
    ? `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${run}/artifacts?per_page=50`
    : `https://api.github.com/repos/${GITHUB_REPO}/actions/artifacts?per_page=50`;

  const rr = await fetch(url, { headers });
  if (!rr.ok) return res.status(502).json({ error: `아티팩트 조회 실패 (${rr.status})` });
  const data = await rr.json();
  const arts = (data.artifacts || [])
    .filter((a) => !a.expired && /^result__vid-.+__pv-.+$/.test(a.name))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!arts.length) return res.status(200).json({ found: false });

  const m = arts[0].name.match(/^result__vid-(.+)__pv-(.+)$/);
  const videoId = m[1];
  const privacyStatus = m[2];
  return res.status(200).json({
    found: true,
    videoId,
    privacyStatus,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    artifactCreatedAt: arts[0].created_at,
  });
}
