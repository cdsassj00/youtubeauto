import 'dotenv/config';
import { toneMedia } from './lib/tone.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 프로젝트 루트 및 산출물 경로 */
export const ROOT = path.resolve(__dirname, '..');
export const OUT_DIR = path.join(ROOT, 'out');
// 오디오는 Remotion 의 staticFile() 로 참조하기 위해 public/ 아래에 둔다.
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const AUDIO_DIR = path.join(PUBLIC_DIR, 'audio');
export const SCRIPT_PATH = path.join(OUT_DIR, 'script.json');
export const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
export const VIDEO_PATH = path.join(OUT_DIR, 'video.mp4');
// ★JPEG 다★ 예전엔 PNG 였는데, 유튜브 썸네일은 2MB 가 상한이고 종이 질감처럼
// 잔무늬가 많은 그림은 1280x720 PNG 로도 그 선을 넘는다. 실제로 '크림 종이' 스타일
// 회차에서 업로드가 "The provided image content is invalid" 로 거부됐다(BAnnxcEovCU).
// JPEG 은 같은 그림이 수백 KB 라 내용에 상관없이 안전하다.
export const THUMBNAIL_PATH = path.join(OUT_DIR, 'thumbnail.jpg');
// 업로드 결과(videoId·공개상태 등) — "업로드 전 리뷰" 흐름에서 웹앱이 읽어 미리보기/발행 제어에 씀.
export const UPLOAD_RESULT_PATH = path.join(OUT_DIR, 'upload-result.json');
// deck 기반 엔진(signal / deck3d)용 산출물 — 슬라이드 데이터와 업로드 메타(제목·설명·태그).
export const DECK_PATH = path.join(OUT_DIR, 'deck.json');
export const DECK_META_PATH = path.join(OUT_DIR, 'deck-meta.json');
export const WEB3D_DIR = path.join(ROOT, 'web3d-deck');
// 썸네일 인물 합성용 진행자 사진 (그린스크린/투명 모두 가능). CI 에선 저장소에 커밋하거나 URL 로 제공.
export const ASSETS_DIR = path.join(ROOT, 'assets');
export const PRESENTER_IMAGE_PATH = path.join(ASSETS_DIR, 'presenter.png');

/** staticFile() 로 참조할 오디오 상대경로 (public 기준). */
export const audioStaticPath = (sceneId: string) => `audio/${sceneId}.mp3`;

/** 영상 규격 (10분 영상 렌더 부담을 줄이기 위해 24fps — 부드러움 충분) */
export const FPS = 24;
export const WIDTH = 1920;
export const HEIGHT = 1080;

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `환경변수 ${name} 이(가) 설정되지 않았습니다. .env 파일 또는 GitHub Secrets 를 확인하세요.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  // 빈 문자열("")도 미설정으로 간주 — GitHub Actions 가 미설정 변수를 빈 값으로 넘겨
  // 코드 기본값을 덮어쓰는 문제를 방지.
  return v == null || v.trim() === '' ? fallback : v;
}

// ── 업로드 대상 채널 선택 ────────────────────────────────────────────────
// TARGET_CHANNEL 이 'default' 가 아니면(예: 'ch2') 해당 채널 전용 환경변수(_SUFFIX)를
// 먼저 찾고, 없으면 기본 변수로 폴백한다. 채널마다 refresh token/카테고리/설명 푸터를
// 따로 둘 수 있어 한 파이프라인으로 여러 채널에 업로드 가능(기본값은 기존 동작 그대로).
const TARGET_CHANNEL = optional('TARGET_CHANNEL', 'default').trim().toLowerCase();
const CH_SUFFIX = TARGET_CHANNEL && TARGET_CHANNEL !== 'default' ? '_' + TARGET_CHANNEL.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
/** 채널별 우선 조회 후 기본으로 폴백하는 optional. */
function chOptional(base: string, fallback: string): string {
  return optional(base + CH_SUFFIX, optional(base, fallback));
}
/** 채널별 우선 조회 후 기본으로 폴백하는 required. */
function chRequired(base: string): string {
  const v = process.env[base + CH_SUFFIX] ?? process.env[base];
  if (!v || v.trim() === '') {
    throw new Error(`환경변수 ${base + CH_SUFFIX} (또는 ${base}) 이(가) 설정되지 않았습니다. 채널(${TARGET_CHANNEL}) 자격증명을 확인하세요.`);
  }
  return v;
}

export const config = {
  // 현재 업로드 대상 채널 키 ('default' | 그 외 채널 키).
  targetChannel: TARGET_CHANNEL,
  // Anthropic
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  claudeModel: optional('CLAUDE_MODEL', 'claude-opus-4-8'),

  // ElevenLabs
  elevenLabsApiKey: () => required('ELEVENLABS_API_KEY'),
  // ssjvoice (사용자 지정 목소리). 필요 시 ELEVENLABS_VOICE_ID 로 덮어쓸 수 있음.
  // 기본값은 현재 계정의 ssjvoice — 예전 ID(dChkTgjs2tPbb8OYH4OX)는 계정이 바뀌며 사라져
  // 404(voice_not_found)가 났다. GitHub 변수가 비어 있어도 동작하도록 유효한 값을 기본으로 둔다.
  elevenLabsVoiceId: optional('ELEVENLABS_VOICE_ID', 'zXF1qpTynfgd9dv4R300'),
  elevenLabsModelId: optional('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2'),

  // YouTube (채널별 자격증명 지원 — chRequired/chOptional 로 TARGET_CHANNEL 에 맞는 값을 고름)
  // client id/secret 는 보통 한 OAuth 앱을 공유하므로 기본값으로 폴백되지만, 채널별로 따로
  // 두고 싶으면 _SUFFIX 변수를 주면 된다.
  youtubeClientId: () => chRequired('YOUTUBE_CLIENT_ID'),
  youtubeClientSecret: () => chRequired('YOUTUBE_CLIENT_SECRET'),
  // refresh token 은 채널(=계정)마다 다르므로 반드시 채널별로 발급받아 넣는다.
  youtubeRefreshToken: () => chRequired('YOUTUBE_REFRESH_TOKEN'),
  youtubePrivacyStatus: chOptional('YOUTUBE_PRIVACY_STATUS', 'private'),
  youtubeCategoryId: chOptional('YOUTUBE_CATEGORY_ID', '27'),
  // 모든 영상 설명란 맨 아래에 붙는 고정 안내(줄바꿈은 실제 개행 또는 \n). 채널별로 다르게 가능.
  youtubeDescriptionFooter: chOptional('YOUTUBE_DESC_FOOTER', 'AX전환은 CDSA와 함께\nhttps://cdsa.kr'),
  // 합성 콘텐츠 공개 표시. YouTube 정책상 "자기 목소리를 복제해 보이스오버/더빙에 쓰는 것"과
  // "실사가 아닌 완전 애니메이션/일러스트 콘텐츠"는 명시적 예외 대상 — 이 채널(음성 클론 나레이션 +
  // 흑백 일러스트/등각 그래픽)은 둘 다 해당해 표시 불필요. 필요해지면(실사풍으로 바뀌는 등) true로.
  containsSyntheticMedia: optional('SYNTHETIC_MEDIA_DISCLOSURE', 'false').toLowerCase() === 'true',

  // 콘텐츠
  contentMode: optional('CONTENT_MODE', 'auto'),
  // 대본 난이도/전문성: basic(쉬운 설명) | intermediate(균형) | expert(전문가용, 기본값).
  // "너무 쉽게만 풀어준다"는 피드백에 따라 기본을 expert 로 둔다.
  contentLevel: optional('CONTENT_LEVEL', 'expert').toLowerCase(),
  targetMinutes: Number(optional('TARGET_MINUTES', '10')),
  contentLanguage: optional('CONTENT_LANGUAGE', 'ko'),
  // 직접 지정한 주제(웹앱/수동 실행에서 전달). 비어 있으면 모드에 따라 자동 선택.
  customTopic: optional('TOPIC', '').trim(),

  // 썸네일 (OpenAI 이미지 모델). 현재 최신 이미지 모델명은 gpt-image-1.
  openaiApiKey: optional('OPENAI_API_KEY', ''),
  // 썸네일용 고급 모델 gpt-image-2 (얼굴 보존 + 한글 텍스트 우수).
  openaiImageModel: optional('OPENAI_IMAGE_MODEL', 'gpt-image-2'),
  // 영상 일러스트용 저가 모델 (글자 없는 흑백 라인아트라 mini 로 충분 → 비용 절감).
  openaiIllustrationModel: optional('OPENAI_ILLUSTRATION_MODEL', 'gpt-image-1-mini'),
  // 이미지 생성 provider: openai | gemini.
  // gemini(Nano Banana)는 회화적 화풍(수채화·클레이·코믹북)에 강하고 장당 단가가 더 싸다.
  // 다만 썸네일은 진행자 얼굴을 보존해야 해서 provider 와 무관하게 계속 OpenAI 를 쓴다.
  imageProvider: optional('IMAGE_PROVIDER', 'openai').toLowerCase(),
  geminiApiKey: optional('GEMINI_API_KEY', ''),
  // Nano Banana 2. 더 좋은 결과가 필요하면 gemini-3-pro-image(장당 약 2배).
  geminiImageModel: optional('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image'),

  // 무료 스톡 소스(src/lib/stockProviders.ts). 셋 다 선택 사항이고, 있는 것만 쓴다.
  //   Pexels   영상+사진 · 표기 의무 없음
  //   Pixabay  영상+사진 · 표기 의무 없음
  //   Unsplash 사진만    · ★표기 의무 + download_location 호출 의무★
  // 하나도 없으면 B롤은 조용히 건너뛰고, footage 엔진은 아예 시작하지 않는다.
  pexelsApiKey: optional('PEXELS_API_KEY', ''),
  pixabayApiKey: optional('PIXABAY_API_KEY', ''),
  unsplashAccessKey: optional('UNSPLASH_ACCESS_KEY', ''),

  // 씬 일러스트 화풍(src/lib/artStyle.ts). auto 면 날짜 기준으로 회차마다 다르게 고른다.
  artStyle: optional('ART_STYLE', 'isometric').toLowerCase(),
  // 나레이션 말투(src/lib/tone.ts): documentary | humorous | storytelling | mystery
  narrationTone: optional('NARRATION_TONE', 'documentary').toLowerCase(),

  // 진행자 사진을 URL 로 줄 경우(저장소에 커밋하기 싫을 때). 비면 assets/presenter.png 사용.
  presenterImageUrl: chOptional('PRESENTER_IMAGE_URL', ''),
  // ★썸네일에 진행자 얼굴을 합성할지★
  // assets/presenter.png 는 본인 사진이고, 지금까지는 그 파일이 있으면 채널과 무관하게
  // 무조건 합성됐다. 그래서 새 채널을 만들자마자 첫 영상 썸네일에 얼굴이 들어갔다.
  // 얼굴은 한 번 올라가면 되돌리기 어려우므로 기본값을 채널별로 나눈다 —
  // 기본 채널만 켜 두고, 다른 채널은 명시적으로 켤 때만(USE_PRESENTER_CH2=true) 쓴다.
  usePresenter:
    chOptional('USE_PRESENTER', TARGET_CHANNEL === 'default' ? 'true' : 'false').toLowerCase() === 'true',
  // 썸네일 배경 톤: dark(칠판) | cream(종이) — thumbnailStyle 로 대체됐지만 기존 배선 호환용으로 남긴다.
  thumbnailTone: optional('THUMBNAIL_TONE', 'dark'),
  // 썸네일 스타일 프리셋(src/lib/thumbStyle.ts) — 배경·글씨체·액센트를 한 벌로 정한다.
  // auto 면 회차마다 날짜 기준으로 회전. 비우면 기존 칠판 마커.
  thumbnailStyle: optional('THUMBNAIL_STYLE', 'chalk').toLowerCase(),
  // ★썸네일이 무엇을 주인공으로 삼는가★
  //  text   : 큰 글씨가 화면의 40%를 먹고 그림은 보조 (기존 동작)
  //  visual : 장면·사물이 화면을 채우고 글씨는 아래쪽 좁은 띠로 (글씨만 큼지막한 인상 탈피)
  // 채널마다 결이 다르므로 기본값을 나눈다 — 기본 채널은 지금까지의 인상을 유지한다.
  thumbnailFocus: chOptional('THUMBNAIL_FOCUS', TARGET_CHANNEL === 'default' ? 'text' : 'visual').toLowerCase(),
  // ★이 채널이 무엇을 다루는가★
  // 예전엔 "이 채널은 개발자용 AI/소프트웨어만 다룬다"가 프롬프트에 하드코딩돼 있었다.
  // 그래서 건강보험 같은 소재를 줘도 개발자용 AI 이미지를 그리라는 지시가 함께 나갔다.
  thumbnailContext: chOptional(
    'THUMBNAIL_CONTEXT',
    TARGET_CHANNEL === 'default'
      ? 'this channel covers AI / software engineering / LLM agent topics for developers — never physical hardware, electrical wiring, automotive parts, or manufacturing'
      : 'this channel explains everyday IT, economy and society topics for a general Korean audience — draw ordinary Korean life scenes and familiar objects, never developer or coding imagery',
  ),

  // 대본 전 최신정보 리서치(웹서치) 담당 provider: openai(기본, 저비용) | anthropic(Claude 웹서치).
  // 검색은 대본 작성만큼 비싼 모델이 필요 없는 작업이라 기본은 OpenAI 로 비용을 아낀다.
  researchProvider: optional('RESEARCH_PROVIDER', 'openai').toLowerCase(),
  openaiResearchModel: optional('OPENAI_RESEARCH_MODEL', 'gpt-4.1-mini'),

  // 영상 엔진(=화면 스타일):
  //  illustrated : 2D AI 흑백 일러스트 + 코드 도식 (기본, 기존 채널 스타일)
  //  deck3d      : 3D 기하학 도형 공간에서 카메라가 이동하며 설명 (web3d-deck/deck-timed.js)
  //  signal      : 딥블랙 + 단일 액센트 + 큰 숫자의 데이터 중심 화면 (web3d-deck/deck-signal.js)
  //  signal3d    : signal 디자인 + 3D 깊이 카메라(텍스트는 DOM 이라 선명)
  //  web3d/remotion : 구버전 엔진
  videoEngine: optional('VIDEO_ENGINE', 'illustrated').toLowerCase(),
  /** 목록형 엔진이 쓸 자료 폴더 이름 (assets/listing/<이름>/items.json). */
  listingSet: optional('LISTING_SET', '').trim(),
  // 나레이션 속도 배속(1=원속). 빠르게 하면 같은 시간에 더 많은 내용이 들어가므로
  // 대본 목표 글자 수도 이 비율만큼 늘려야 목표 길이가 맞는다.
  // ★배속은 말투에 따라 기본값이 다르다★
  // 1.2 배는 정보를 빠르게 넘기는 설명 영상에 맞춰 올린 값이다. 그런데 인물의 일생을
  // 다루는 영상에 그대로 적용되니 목소리가 들떠 들려서 내용과 정반대가 됐다. 회차마다
  // 사람이 낮추게 두면 또 잊어버리므로(BGM 과 같은 이유) 말투에서 끌어온다.
  // NARRATION_SPEED 에 값이 들어오면 그것이 언제나 우선한다.
  narrationSpeed: (() => {
    const raw = optional('NARRATION_SPEED', '').trim();
    if (raw !== '') return Math.max(0.5, Math.min(2, Number(raw) || 1));
    return toneMedia(optional('NARRATION_TONE', '')).speed;
  })(),

  // 동작
  doUpload: optional('DO_UPLOAD', 'false').toLowerCase() === 'true',
};

/**
 * CONTENT_MODE 가 auto 일 때 요일에 따라 트렌드/기초를 번갈아 선택.
 * (월수금 = 트렌드, 화목토일 = 기초 상식)
 */
export function resolveTopicMode(date = new Date()): 'trend' | 'basics' {
  if (config.contentMode === 'trend') return 'trend';
  if (config.contentMode === 'basics') return 'basics';
  // CI 러너는 UTC 로 돈다. 스케줄이 22:00 UTC(=다음날 07:00 KST)라서 UTC 요일로 판정하면
  // 한국 기준 요일과 하루가 어긋난다 — 월수금 트렌드로 의도한 로테이션이 실제로는
  // 한국 시간 화목토에 나왔다. 항상 KST 요일로 계산한다.
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=일 ... 6=토 (KST 기준)
  return [1, 3, 5].includes(day) ? 'trend' : 'basics';
}
