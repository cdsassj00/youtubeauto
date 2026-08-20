// 웹앱 → GitHub Actions 트리거 (repository_dispatch).
// GITHUB_TOKEN 은 서버(함수)에만 있고 브라우저에 노출되지 않는다.
// 허용값 목록은 src/lib/artStyle.ts / src/lib/tone.ts 의 프리셋 id 와 일치해야 한다.
// (여기서 걸러진 값만 워크플로로 넘어가고, 나머지는 기본값으로 떨어진다.)
const ART_STYLES = ['auto', 'isometric', 'comic', 'watercolor', 'cinematic', 'retro', 'clay', 'pixar'];
const TONES = ['documentary', 'plain', 'humorous', 'storytelling', 'mystery'];
// 썸네일 스타일(src/lib/thumbStyle.ts). 썸네일은 엔진과 무관하게 항상 생성되므로
// 어떤 영상 스타일을 골라도 그대로 적용된다 — 모순 조합이 없다.
const THUMB_STYLES = ['auto', 'chalk', 'paper', 'impact', 'neon', 'magazine', 'scrap'];

// ★src/lib/engines.ts 의 ENGINES 와 반드시 같아야 한다★
// 서버리스 함수는 그 모듈을 import 할 수 없어 값을 복제해 둔다. 어긋나면
// "화면에서는 고를 수 있는데 실제로는 안 먹는" 옵션이 다시 생긴다.
const ENGINES = {
  // 주식 데일리 — 사이트 API 로 재료를 받아 씬마다 화풍을 바꿔 그린다. 화풍/B롤/난이도/말투는
  // 이 엔진에서 아무 효과가 없다(대본을 Claude 가 쓰지 않고 화면은 사이트가 그려 준다).
  stock: { artStyle: false, broll: false, level: false, tone: false },
  illustrated: { artStyle: true, broll: true },
  scrapbook: { artStyle: false, broll: false },
  footage: { artStyle: false, broll: false },
  signal: { artStyle: false, broll: false },
  signal3d: { artStyle: false, broll: false },
  deck3d: { artStyle: false, broll: false },
  hyper: { artStyle: false, broll: false },
  handdrawn: { artStyle: false, broll: false },
  listing: { artStyle: false, broll: false },
  whiteboard: { artStyle: true, broll: false },
};

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

  // ★재업로드는 다른 이벤트로 나간다★ 이미 렌더된 mp4 를 다른 채널로 다시 올리는 것뿐이라
  // 대본·나레이션·렌더 옵션이 하나도 필요 없다. 같은 페이로드에 얹으면 검증이 뒤엉키고,
  // 무엇보다 "돈이 드는 발행"과 "무료 재업로드"가 로그에서 구분되지 않는다.
  if (String(body.mode || '') === 'reupload') {
    const runId = String(body.source_run_id || '').trim();
    if (!/^\d+$/.test(runId)) return res.status(400).json({ error: 'source_run_id (워크플로 run 번호) 가 필요합니다' });
    const payload = {
      source_run_id: runId,
      channel: ['default', 'ch2'].includes(body.channel) ? body.channel : 'default',
      privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : 'unlisted',
      title: String(body.title || '').slice(0, 100),
    };
    const r2 = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'reupload', client_payload: payload }),
    });
    if (!r2.ok) return res.status(502).json({ error: 'GitHub dispatch 실패', detail: await r2.text() });
    return res.status(200).json({ ok: true, mode: 'reupload', applied: payload });
  }

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

    // ★나머지 옵션은 반드시 이 opts 안에 넣는다★
    // GitHub repository_dispatch 의 client_payload 는 "최상위 속성 10개"가 상한이다.
    // 옵션을 최상위에 하나씩 늘리다가 11개가 되면서 발행이 422 로 통째로 막힌 적이 있다.
    // 중첩된 값은 개수에 세지 않으므로, 앞으로 옵션이 늘어도 여기에만 추가하면 안전하다.
    // (워크플로에서는 client_payload.opts.<이름> 으로 읽는다.)
    opts: {
      // 공개 상태. 리뷰 흐름은 'unlisted'(미등록)로 올려 확인 후 발행. 빈 값이면 워크플로 기본값.
      privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : '',
      market: ['KR', 'US'].includes(String(body.market || '').toUpperCase()) ? String(body.market).toUpperCase() : '',
      // 영상 스타일(=렌더 엔진). illustrated=2D 벡터 | deck3d=3D 기하학 | signal=데이터 중심.
      style: ['stock', 'illustrated', 'scrapbook', 'footage', 'deck3d', 'signal', 'signal3d', 'hyper', 'handdrawn', 'listing', 'whiteboard'].includes(body.style)
        ? body.style
        : '',
      // 나레이션 배속(0.8~1.4). 비우면 워크플로 기본값.
      speed: pick('speed', 'narration_speed') ? String(Math.max(0.8, Math.min(1.4, Number(pick('speed', 'narration_speed')) || 1))) : '',
      // 씬 일러스트 화풍(src/lib/artStyle.ts). 'auto' 는 회차마다 날짜로 회전.
      // 목록에 없는 값은 빈 값으로 떨어뜨려 워크플로 기본값(기존 흑백 등각)을 쓰게 한다.
      art_style: ART_STYLES.includes(pick('art', 'art_style')) ? pick('art', 'art_style') : '',
      // 나레이션 말투(src/lib/tone.ts).
      narration_tone: TONES.includes(pick('tone', 'narration_tone')) ? pick('tone', 'narration_tone') : '',
      thumb_style: THUMB_STYLES.includes(pick('thumb', 'thumb_style')) ? pick('thumb', 'thumb_style') : '',
      // 배경음악 결. 비우면 파이프라인이 말투를 보고 고른다(이야기형 warm / 설명형 lofi).
      bgm_style: ['warm', 'lofi'].includes(pick('bgm', 'bgm_style')) ? pick('bgm', 'bgm_style') : '',
      // 목록형 엔진이 쓸 자료 폴더 이름(assets/listing/<이름>). 영문·숫자·-_ 만 허용.
      listing_set: String(pick('listing', 'listing_set') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60),
    },
  };

  // 알 수 없는 키가 섞여 오면 조용히 버리지 말고 응답에 알려준다(오타로 인한 설정 유실 방지).
  const KNOWN = new Set([
    'topic', 'mode', 'content_mode', 'level', 'content_level', 'upload', 'do_upload',
    'minutes', 'target_minutes', 'channel', 'privacy', 'style', 'market', 'speed', 'narration_speed', 'password',
    'art', 'art_style', 'tone', 'narration_tone', 'thumb', 'thumb_style', 'bgm', 'bgm_style',
    'listing', 'listing_set',
  ]);
  const ignored = Object.keys(body).filter((k) => !KNOWN.has(k));

  // 고른 엔진이 지원하지 않는 옵션을 지정했는지 확인한다.
  // 엔진이 비어 있으면 워크플로 기본값(illustrated)이 쓰이므로 그 기준으로 본다.
  const caps = ENGINES[client_payload.opts.style || 'illustrated'] || ENGINES.illustrated;
  const notApplied = [];
  if (client_payload.opts.art_style && !caps.artStyle) {
    notApplied.push('화풍 — 이 영상 스타일은 화면을 코드로 그려서 그림체가 적용되지 않습니다');
  }

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
      // ★채널은 반드시 되돌려준다★
      // 업로드 여부·스타일은 확인란에 있는데 채널만 빠져 있었다. 채널을 잘못 보내면
      // 영상이 통째로 남의 채널에 올라가는, 되돌리기 가장 번거로운 사고인데 정작
      // 응답만 봐서는 알 수가 없었다. 알 수 없는 값은 위에서 'default' 로 떨어뜨리므로
      // 오타를 냈을 때도 여기 'default' 가 찍혀 바로 드러난다.
      channel: client_payload.channel,
      style: client_payload.opts.style || '(워크플로 기본값)',
      privacy: client_payload.opts.privacy || '(워크플로 기본값)',
      target_minutes: client_payload.target_minutes,
      speed: client_payload.opts.speed || '(말투에 맞춤)',
      bgm: client_payload.opts.bgm_style || '(말투에 맞춤)',
      art_style: client_payload.opts.art_style || '(워크플로 기본값)',
      narration_tone: client_payload.opts.narration_tone || '(워크플로 기본값)',
      thumb_style: client_payload.opts.thumb_style || '(워크플로 기본값)',
      listing_set: client_payload.opts.listing_set || '(없음)',
    },
    // 지정했지만 이 엔진에서 안 먹는 옵션을 알려준다 — 조용히 무시되면
    // 결과물을 보고도 왜 반영이 안 됐는지 알 수 없다.
    ...(notApplied.length ? { notApplied } : {}),
    ...(ignored.length ? { ignoredKeys: ignored } : {}),
  });
}
