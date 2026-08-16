import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { google } from 'googleapis';
import { config } from '../config.js';
import type { Script } from '../schema.js';

/**
 * OAuth2 클라이언트 생성 (refresh token 기반, 서버/CI 환경에서 사용).
 */
export function createOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    config.youtubeClientId(),
    config.youtubeClientSecret(),
    'urn:ietf:wg:oauth:2.0:oob',
  );
  oauth2.setCredentials({ refresh_token: config.youtubeRefreshToken() });
  return oauth2;
}

/**
 * 렌더된 mp4 를 YouTube 에 업로드한다. (resumable upload)
 * @returns 업로드된 videoId
 */
export async function uploadVideo(params: {
  videoPath: string;
  // 제목·설명·태그만 있으면 되므로 Script 전체가 아니라 메타 형태를 받는다
  // (deck 기반 엔진은 Script 스키마를 쓰지 않는다).
  script: { title: string; description: string; tags: string[] };
  thumbnailPath?: string;
}): Promise<string> {
  const { videoPath, script, thumbnailPath } = params;

  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  // 대본 설명 + 고정 푸터(모든 영상 공통 안내). 줄바꿈(\n)은 유튜브가 그대로 표시.
  const footer = config.youtubeDescriptionFooter.replace(/\\n/g, '\n').trim();
  const description = (footer ? `${script.description.trim()}\n\n${footer}` : script.description.trim()).slice(0, 5000);

  // containsSyntheticMedia 는 googleapis 패키지의 타입 정의가 아직 못 따라와서(2024-10-30 API 추가분)
  // 여기서는 존재하지 않는 필드로 잡힌다 — 런타임 REST 요청 자체는 정상 처리되므로 캐스팅으로 우회.
  const status: Record<string, unknown> = {
    privacyStatus: config.youtubePrivacyStatus,
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: config.containsSyntheticMedia,
  };

  const insertRes = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title.slice(0, 100),
        description,
        tags: script.tags,
        categoryId: config.youtubeCategoryId,
        defaultLanguage: config.contentLanguage,
        defaultAudioLanguage: config.contentLanguage,
      },
      status: status as never,
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = insertRes.data.id;
  if (!videoId) {
    throw new Error('YouTube 업로드 응답에 videoId 가 없습니다.');
  }

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    await youtube.thumbnails
      .set({ videoId, media: { body: fs.createReadStream(thumbnailPath) } })
      .catch((e) => {
        // 썸네일 설정 권한(전화 인증 채널)이 없으면 실패할 수 있으므로 경고만.
        console.warn('썸네일 설정 실패(무시):', (e as Error).message);
      });
  }

  return videoId;
}

/** 유튜브 썸네일 파일 상한. 넘으면 업로드가 통째로 거부된다. */
const THUMB_MAX_BYTES = 2 * 1024 * 1024;

/** 이미 올라간 영상의 썸네일만 새 이미지로 교체한다 (rethumb 파이프라인 단계용). */
export async function setThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
  // ★거부되기 전에 여기서 걸러 이유를 말한다★
  // 유튜브가 상한을 넘긴 파일에 돌려주는 말은 "The provided image content is invalid" 로,
  // 파일이 깨진 것인지 큰 것인지 구분이 안 된다. 실제로 그 메시지만 보고는 원인을
  // 찾을 수 없었다(BAnnxcEovCU). 크기를 먼저 재서 숫자로 알려준다.
  const bytes = (await fsp.stat(thumbnailPath)).size;
  const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;
  if (bytes > THUMB_MAX_BYTES) {
    throw new Error(`썸네일이 유튜브 상한을 넘었습니다 — ${kb(bytes)} > ${kb(THUMB_MAX_BYTES)} (${thumbnailPath})`);
  }
  const mimeType = thumbnailPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.thumbnails.set({ videoId, media: { mimeType, body: fs.createReadStream(thumbnailPath) } });
  console.log(`  · 썸네일 설정 완료 (${kb(bytes)}, ${mimeType})`);
}

/**
 * 이미 올라간 영상의 공개 상태를 바꾼다 (미리보기 unlisted → 발행 public 등).
 * "업로드 전 리뷰" 흐름의 승인 단계에서 사용.
 */
export async function setPrivacy(videoId: string, privacyStatus: 'public' | 'unlisted' | 'private'): Promise<void> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: config.containsSyntheticMedia,
      } as never,
    },
  });
}

// ── 직접 만든 강의 영상 업로드용 ────────────────────────────────────────────
// 자막 트랙과 재생목록은 자동 생성 파이프라인에는 필요 없었지만, 사람이 만든 강의를
// 시리즈로 올릴 때는 둘 다 있어야 자료 구실을 한다.

/**
 * 이미 올라간 영상에 자막(SRT) 트랙을 붙인다.
 *
 * 자동 생성 자막에 기대지 않는 이유: 강의에는 고유명사·영문 용어가 많아 인식 정확도가
 * 크게 떨어진다. 사람이 만든 자막이 이미 있으면 그것이 언제나 낫다.
 */
export async function uploadCaption(params: {
  videoId: string;
  srtPath: string;
  /** BCP-47 언어 코드. 한국어 강의면 'ko'. */
  language?: string;
  /** 유튜브 자막 목록에 표시될 이름. */
  name?: string;
}): Promise<void> {
  const { videoId, srtPath, language = 'ko', name = '한국어' } = params;
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.captions.insert({
    part: ['snippet'],
    requestBody: { snippet: { videoId, language, name, isDraft: false } },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(srtPath) },
  });
  console.log(`  · 자막 트랙 첨부 완료 (${language})`);
}

/**
 * 제목이 같은 재생목록을 찾고, 없으면 만든다.
 *
 * ★매번 새로 만들지 않는다★ 하루에 하나씩 올리는 구조라 이 함수가 회차마다 호출된다.
 * 그냥 insert 하면 같은 이름의 재생목록이 37개 생긴다.
 */
export async function ensurePlaylist(params: {
  title: string;
  description?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
}): Promise<string> {
  const { title, description = '', privacyStatus = 'public' } = params;
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  let pageToken: string | undefined;
  do {
    const res = await youtube.playlists.list({ part: ['snippet'], mine: true, maxResults: 50, pageToken });
    const hit = res.data.items?.find((p) => p.snippet?.title === title);
    if (hit?.id) {
      console.log(`  · 재생목록 재사용: ${title}`);
      return hit.id;
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const created = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: { snippet: { title, description }, status: { privacyStatus } },
  });
  const id = created.data.id;
  if (!id) throw new Error('재생목록 생성에 실패했습니다.');
  console.log(`  · 재생목록 생성: ${title}`);
  return id;
}

/** 영상을 재생목록 맨 뒤에 넣는다. 이미 들어 있으면 중복으로 또 들어가므로 호출부가 관리한다. */
export async function addToPlaylist(playlistId: string, videoId: string): Promise<void> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
  });
  console.log('  · 재생목록에 추가 완료');
}
