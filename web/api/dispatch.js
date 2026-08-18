// 무료 점검·관리 워크플로 공용 트리거 (repository_dispatch).
//
// ★왜 하나로 합쳤나★
// 점검용 워크플로마다 엔드포인트를 하나씩 늘리다가 Vercel 서버리스 함수 상한(12개)을
// 넘겨 배포가 통째로 실패했다. 빌드 로그에는 에러가 안 찍히고 'Error' 상태만 남아서
// 원인을 찾는 데 시간이 걸렸다. 이 파일들은 하는 일이 "이벤트 이름 하나 쏘기"로 같으므로
// 앞으로 워크플로가 늘어도 여기 EVENTS 에 한 줄만 추가한다.
//
// 영상 발행(publish)·업로드·공개전환처럼 돈이 들거나 되돌리기 어려운 것은 여기 두지 않는다.
// 각자 전용 엔드포인트로 남겨 실수로 섞여 호출되지 않게 한다.

/** 허용된 이벤트와, 각 이벤트가 받을 수 있는 값. */
const EVENTS = {
  // 스톡 3종(Pexels·Pixabay·Unsplash) 키 점검 — 검색만 하므로 무료.
  'stock-check': () => ({}),

  // ElevenLabs 목소리 목록 — 합성하지 않으므로 문자 사용량 0.
  voices: () => ({}),

  // 채널 숫자(조회수·좋아요·댓글 등) 읽기 — 읽기만 하므로 무료.
  stats: (b) => ({ channel: pickChannel(b.channel) || 'default' }),

  // 업로드 대상 채널 확인 — channels.list 한 번(할당량 1).
  'channel-check': (b) => ({ channel: pickChannel(b.channel) || 'ch2' }),

  // 강의 영상 메타데이터 미리보기 — 자막을 읽어 제목·설명·챕터만 만들어 본다.
  //
  // ★여기서는 예행 모드만 허용한다★ 같은 워크플로가 dry_run=false 면 실제로 영상을
  // 올린다. 이 파일의 규칙("돈이 들거나 되돌리기 어려운 것은 두지 않는다")을 지키려면
  // 값을 받아 넘기면 안 되고, 여기서 true 로 못박아야 한다. 실제 업로드는 워크플로를
  // 직접 실행해서만 되게 남겨 둔다.
  'course-upload': (b) => ({
    drive_srt_id: String(b.drive_srt_id || b.srtId || '').trim(),
    drive_video_id: String(b.drive_video_id || b.videoId || '').trim(),
    module_label: String(b.module_label || b.moduleLabel || '').slice(0, 60),
    course_topic: String(b.course_topic || b.topic || '').slice(0, 200),
    dry_run: 'true',
  }),

  // 채널 브랜딩(배너·워터마크·설명) 적용.
  // ★채널 기본값을 두지 않는다★ 브랜딩은 덮어쓰기라 실수로 본 채널을 덮으면 되돌리기가
  // 번거롭다. 값을 안 보내면 조용히 default 로 떨어뜨리지 않고 거절한다.
  branding: (b) => {
    const channel = pickChannel(b.channel);
    if (!channel) throw new Error("branding 은 channel 을 'default' 또는 'ch2' 로 명시해야 합니다");
    return { channel, apply_description: truthy(b.apply_description ?? b.description) ? 'true' : 'false' };
  },
};

const pickChannel = (v) => (['default', 'ch2'].includes(String(v || '').trim()) ? String(v).trim() : '');
const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

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

  const event = String(body.event || '').trim();
  const build = EVENTS[event];
  if (!build) {
    return res.status(400).json({ error: `event 가 올바르지 않습니다`, allowed: Object.keys(EVENTS) });
  }

  let client_payload;
  try {
    client_payload = build(body);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }

  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: event, client_payload }),
  });
  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  // 무엇이 전달됐는지 되돌려준다 — 채널을 잘못 보냈는지 응답만 보고 알 수 있게.
  return res.status(200).json({ ok: true, event, applied: client_payload });
}
