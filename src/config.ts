import 'dotenv/config';
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
export const THUMBNAIL_PATH = path.join(OUT_DIR, 'thumbnail.png');
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

export const config = {
  // Anthropic
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  claudeModel: optional('CLAUDE_MODEL', 'claude-opus-4-8'),

  // ElevenLabs
  elevenLabsApiKey: () => required('ELEVENLABS_API_KEY'),
  // ssjvoice (사용자 지정 목소리). 필요 시 ELEVENLABS_VOICE_ID 로 덮어쓸 수 있음.
  elevenLabsVoiceId: optional('ELEVENLABS_VOICE_ID', 'dChkTgjs2tPbb8OYH4OX'),
  elevenLabsModelId: optional('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2'),

  // YouTube
  youtubeClientId: () => required('YOUTUBE_CLIENT_ID'),
  youtubeClientSecret: () => required('YOUTUBE_CLIENT_SECRET'),
  youtubeRefreshToken: () => required('YOUTUBE_REFRESH_TOKEN'),
  youtubePrivacyStatus: optional('YOUTUBE_PRIVACY_STATUS', 'private'),
  youtubeCategoryId: optional('YOUTUBE_CATEGORY_ID', '27'),

  // 콘텐츠
  contentMode: optional('CONTENT_MODE', 'auto'),
  targetMinutes: Number(optional('TARGET_MINUTES', '10')),
  contentLanguage: optional('CONTENT_LANGUAGE', 'ko'),
  // 직접 지정한 주제(웹앱/수동 실행에서 전달). 비어 있으면 모드에 따라 자동 선택.
  customTopic: optional('TOPIC', '').trim(),

  // 썸네일 (OpenAI 이미지 모델). 현재 최신 이미지 모델명은 gpt-image-1.
  openaiApiKey: optional('OPENAI_API_KEY', ''),
  // 최신 이미지 모델 gpt-image-2 (얼굴 보존 + 한글 텍스트 우수). 필요 시 env 로 변경.
  openaiImageModel: optional('OPENAI_IMAGE_MODEL', 'gpt-image-2'),
  // 진행자 사진을 URL 로 줄 경우(저장소에 커밋하기 싫을 때). 비면 assets/presenter.png 사용.
  presenterImageUrl: optional('PRESENTER_IMAGE_URL', ''),
  // 썸네일 배경 톤: dark(칠판) | cream(종이)
  thumbnailTone: optional('THUMBNAIL_TONE', 'dark'),

  // 영상 엔진: 'illustrated'(AI 흑백 일러스트) | 'web3d'(3D 웹녹화) | 'remotion'(손그림). 기본 illustrated.
  videoEngine: optional('VIDEO_ENGINE', 'illustrated').toLowerCase(),

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
  const day = date.getDay(); // 0=일 ... 6=토
  return [1, 3, 5].includes(day) ? 'trend' : 'basics';
}
