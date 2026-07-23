import fs from 'node:fs';
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
  script: Script;
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
