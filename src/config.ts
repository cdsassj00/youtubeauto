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

/** staticFile() 로 참조할 오디오 상대경로 (public 기준). */
export const audioStaticPath = (sceneId: string) => `audio/${sceneId}.mp3`;

/** 영상 규격 */
export const FPS = 30;
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
  return process.env[name] ?? fallback;
}

export const config = {
  // Anthropic
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  claudeModel: optional('CLAUDE_MODEL', 'claude-opus-4-8'),

  // ElevenLabs
  elevenLabsApiKey: () => required('ELEVENLABS_API_KEY'),
  elevenLabsVoiceId: optional('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
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
