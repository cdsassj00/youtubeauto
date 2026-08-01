// 웹앱 → GitHub Actions 트리거 (repository_dispatch).
// GITHUB_TOKEN 은 서버(함수)에만 있고 브라우저에 노출되지 않는다.
// 허용값 목록은 src/lib/artStyle.ts / src/lib/tone.ts 의 프리셋 id 와 일치해야 한다.
// (여기서 걸러진 값만 워크플로로 넘어가고, 나머지는 기본값으로 떨어진다.)
const ART_STYLES = ['auto', 'isometric', 'comic', 'watercolor', 'cinematic', 'retro', 'clay', 'pixar'];
const TONES = ['documentary', 'humorous', 'storytelling', 'mystery'];

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

  // 키 이름을 하나만 받으면, 다른 이름으로 보낸 값이 "조용히 무시"된다.
  // 실제로 do_upload 로 보낸 요청이 upload 로 안 잡혀 DO_UPLOAD=false 가 되면서
  // 20분짜리 렌더를 마치고도 업로드가 안 된 적이 있다. 별칭을 함께 받는다.
  const pick = (...keys) => {
    for (const k of keys) if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
    return undefined;
  };
  // 'false'(문자열)도 거짓으로 취급 — JSON 으로 오가며 문자열이 되는 경우가 많다.
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

  const client_payload = {
    // 뉴스 스크립트급 긴 브리핑(타임코드별 섹션 + 참고자료 링크 포함)도 안 잘리게 넉넉히 허용
    // (200자 제한이 "충실 반영" 기능을 무력화시켰던 전례가 있음). GitHub repository_dispatch
    // client_payload 한도(256KB)에 비하면 여전히 작아 안전하다.
    topic: String(body.topic || '').slice(0, 20000),
    content_mode: ['auto', 'trend', 'basics'].includes(pick('mode', 'content_mode')) ? pick('mode', 'content_mode') : 'auto',
    content_level: ['basic', 'intermediate', 'expert'].includes(pick('level', 'content_level')) ? pick('level', 'content_level') : 'expert',
    // 기본은 업로드 안 함 — 유료 업로드는 명시적으로 켤 때만.
    do_upload: truthy(pick('upload', 'do_upload')) ? 'true' : 'false',
    target_minutes: String(Math.max(2, Math.min(20, Number(pick('minutes', 'target_minutes')) || 10))),
    // 업로드 대상 채널 (default | ch2). 알 수 없는 값은 default 로 안전 처리.
    channel: ['default', 'ch2'].includes(body.channel) ? body.channel : 'default',
    // 공개 상태. 리뷰 흐름은 'unlisted'(미등록)로 올려 확인 후 발행. 빈 값이면 워크플로 기본값.
    privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : '',
    // 영상 스타일(=렌더 엔진). illustrated=2D 벡터 | deck3d=3D 기하학 | signal=데이터 중심.
    style: ['illustrated', 'deck3d', 'signal', 'signal3d'].includes(body.style) ? body.style : '',
    // 나레이션 배속(0.8~1.4). 비우면 워크플로 기본값.
    speed: pick('speed', 'narration_speed') ? String(Math.max(0.8, Math.min(1.4, Number(pick('speed', 'narration_speed')) || 1))) : '',
    // 씬 일러스트 화풍(src/lib/artStyle.ts). 'auto' 는 회차마다 날짜로 회전.
    // 목록에 없는 값은 빈 값으로 떨어뜨려 워크플로 기본값(기존 흑백 등각)을 쓰게 한다.
    art_style: ART_STYLES.includes(pick('art', 'art_style')) ? pick('art', 'art_style') : '',
    // 나레이션 말투(src/lib/tone.ts).
    narration_tone: TONES.includes(pick('tone', 'narration_tone')) ? pick('tone', 'narration_tone') : '',
  };

  // 알 수 없는 키가 섞여 오면 조용히 버리지 말고 응답에 알려준다(오타로 인한 설정 유실 방지).
  const KNOWN = new Set([
    'topic', 'mode', 'content_mode', 'level', 'content_level', 'upload', 'do_upload',
    'minutes', 'target_minutes', 'channel', 'privacy', 'style', 'speed', 'narration_speed', 'password',
    'art', 'art_style', 'tone', 'narration_tone',
  ]);
  const ignored = Object.keys(body).filter((k) => !KNOWN.has(k));

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
  return res.status(200).json({
    ok: true,
    // 실제로 무엇이 전달됐는지 되돌려준다 — 업로드 여부/스타일이 의도와 다른지 즉시 확인 가능.
    applied: {
      do_upload: client_payload.do_upload,
      style: client_payload.style || '(워크플로 기본값)',
      privacy: client_payload.privacy || '(워크플로 기본값)',
      target_minutes: client_payload.target_minutes,
      speed: client_payload.speed || '(워크플로 기본값)',
      art_style: client_payload.art_style || '(워크플로 기본값)',
      narration_tone: client_payload.narration_tone || '(워크플로 기본값)',
    },
    ...(ignored.length ? { ignoredKeys: ignored } : {}),
  });
}
