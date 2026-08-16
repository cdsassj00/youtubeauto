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

  // ★두 가지 출처를 받는다★
  //  (1) 파이프라인이 만든 영상  — source_run_id (기존)
  //  (2) 직접 만든 강의 영상     — 드라이브 파일 ID (course-upload)
  // 둘 다 "이미 완성된 영상을 유튜브에 올린다"는 같은 일이고, 둘 다 돈이 들고 되돌리기가
  // 번거롭다. 그래서 무료 점검용 범용 트리거(dispatch.js)가 아니라 이 전용 엔드포인트에 둔다.
  // (dispatch.js 쪽 course-upload 는 예행 모드로 못박혀 있어 실제 업로드가 안 된다.)
  const driveSrtId = String(body.driveSrtId || body.drive_srt_id || '').trim();
  if (driveSrtId) {
    const driveVideoId = String(body.driveVideoId || body.drive_video_id || '').trim();
    if (!driveVideoId) return res.status(400).json({ error: '영상 파일 ID(driveVideoId)가 필요합니다' });
    const coursePayload = {
      drive_srt_id: driveSrtId,
      drive_video_id: driveVideoId,
      module_label: String(body.moduleLabel || body.module_label || '').slice(0, 60),
      course_topic: String(body.topic || body.course_topic || '').slice(0, 200),
      course_order: String(body.order || body.course_order || '').replace(/[^0-9]/g, '').slice(0, 3),
      // 값이 있으면 새로 올리지 않고 그 영상의 제목·설명·썸네일만 교체한다.
      update_video_id: String(body.updateVideoId || body.update_video_id || '').slice(0, 20),
      // 썸네일 큰 글씨를 이 회차만 직접 정할 때. 비우면 자막을 읽고 회차마다 새로 뽑는다
      // — 40편이 같은 문구가 되면 목록에서 전부 같은 영상으로 보이므로 기본은 비움이다.
      course_headline: String(body.headline || body.course_headline || '').slice(0, 40),
      channel: ['default', 'ch2'].includes(body.channel) ? body.channel : 'default',
      privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : 'unlisted',
      // 여기서는 실제 업로드가 목적이므로 명시적으로 끈다.
      dry_run: 'false',
    };
    const cr = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'course-upload', client_payload: coursePayload }),
    });
    if (cr.status !== 204) {
      const detail = await cr.text().catch(() => '');
      return res.status(502).json({ error: `GitHub 트리거 실패 (${cr.status})`, detail: detail.slice(0, 300) });
    }
    return res.status(200).json({ ok: true, kind: 'course-upload', applied: coursePayload });
  }

  const sourceRunId = String(body.runId || body.source_run_id || '').trim();
  if (!/^\d+$/.test(sourceRunId)) {
    return res.status(400).json({ error: '영상이 들어 있는 실행 ID(runId), 또는 강의 업로드면 driveSrtId 가 필요합니다' });
  }

  const client_payload = {
    source_run_id: sourceRunId,
    privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : 'unlisted',
    // 메타를 script.json 에서 읽을지 deck-meta.json 에서 읽을지 가르므로 원래 엔진과 맞춰야 한다.
    engine: ['illustrated', 'deck3d', 'signal', 'signal3d'].includes(body.engine) ? body.engine : 'signal3d',
    channel: ['default', 'ch2'].includes(body.channel) ? body.channel : 'default',
    // 렌더 당시 배경음악이 없던 영상에 음악만 덧입힌다(영상 스트림은 copy — 재인코딩 없음).
    add_bgm: body.addBgm === true || body.add_bgm === 'true' ? 'true' : 'false',
    // 이미 손봐둔 썸네일을 새 영상으로 옮긴다(이미지 재생성 비용 없이).
    thumb_from: String(body.thumbFrom || body.thumb_from || '').trim().slice(0, 20),
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
