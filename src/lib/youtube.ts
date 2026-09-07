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
  /**
   * 예약 발행 시각(UTC ISO). 주면 비공개로 올려 두고 이 시각에 유튜브가 스스로 공개한다.
   * 트랜스코딩이 끝난 뒤 공개되므로 첫 시청자가 저화질을 보지 않는다.
   */
  publishAt?: string;
}): Promise<string> {
  const { videoPath, script, thumbnailPath, publishAt } = params;

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
  // ★예약 발행은 반드시 private 으로 올려야 한다★ 유튜브는 publishAt 을 private 인
  // 영상에서만 받는다. public 으로 보내면 publishAt 을 조용히 무시하고 즉시 공개해 버린다.
  if (publishAt) {
    status.privacyStatus = 'private';
    status.publishAt = publishAt;
    const kst = new Date(new Date(publishAt).getTime() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);
    console.log(`  · 예약 발행: ${kst} (KST) — 그때까지 비공개로 두고 처리를 끝낸다`);
  }

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

  // ★제목을 글자 그대로 비교하지 않는다★ 1편은 "AI 챔피언 강사양성과정", 2편은
  // "AI챔피언 강사양성과정"(공백 하나 차이)으로 돌아서 같은 시리즈인데 재생목록이 둘로
  // 갈라졌다. 원인은 유튜브가 아니라 내가 워크플로 기본값을 바꾼 것이었다. 사람이 부르는
  // 이름은 공백·대소문자가 흔들리므로, 그 흔들림으로 목록이 갈라지지 않게 정규화해서 찾는다.
  const key = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const want = key(title);

  let pageToken: string | undefined;
  do {
    const res = await youtube.playlists.list({ part: ['snippet'], mine: true, maxResults: 50, pageToken });
    const hit = res.data.items?.find((p) => key(p.snippet?.title ?? '') === want);
    if (hit?.id) {
      console.log(`  · 재생목록 재사용: ${hit.snippet?.title}`);
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

/**
 * 구글 API 오류에서 사람이 읽을 수 있는 이유를 뽑는다.
 *
 * googleapis 오류는 message 가 비어 있는 경우가 있다. 실제로 재생목록 추가가 실패했을 때
 * 로그에 "재생목록 처리 실패(무시): " 만 남아서 왜 실패했는지 알 길이 없었다.
 * 실패를 무시하고 넘어가는 자리일수록 이유는 반드시 남겨야 한다.
 */
export function apiErrorDetail(e: unknown): string {
  const err = e as { message?: string; code?: number | string; errors?: Array<{ message?: string; reason?: string }>; response?: { status?: number; data?: { error?: { message?: string; errors?: Array<{ reason?: string }> } } } };
  const parts = [
    err?.message,
    err?.response?.data?.error?.message,
    err?.errors?.map((x) => `${x.reason ?? ''} ${x.message ?? ''}`.trim()).join('; '),
    err?.response?.data?.error?.errors?.map((x) => x.reason).filter(Boolean).join('; '),
    err?.code != null ? `code=${err.code}` : '',
    err?.response?.status != null ? `http=${err.response.status}` : '',
  ].filter((s) => s && String(s).trim());
  return parts.length ? [...new Set(parts)].join(' | ') : `알 수 없는 오류(${Object.prototype.toString.call(e)})`;
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

/**
 * 이미 올라간 영상의 제목·설명·태그를 바꾼다.
 *
 * 영상 파일은 그대로 두고 메타데이터만 고친다. 제목 형식이나 후킹 문구를 나중에 바꿔도
 * 수십 MB 를 다시 올릴 이유가 없다. 조회수·댓글·링크도 모두 유지된다.
 *
 * ★categoryId 를 반드시 함께 보낸다★ videos.update 는 snippet 을 통째로 갈아끼우는지라,
 * 빼먹으면 카테고리가 지워졌다며 400 으로 거절한다.
 */
export async function updateVideoMeta(params: {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
}): Promise<void> {
  const { videoId, title, description, tags } = params;
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const footer = config.youtubeDescriptionFooter.replace(/\\n/g, '\n').trim();
  const full = (footer ? `${description.trim()}\n\n${footer}` : description.trim()).slice(0, 5000);
  await youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet: { title: title.slice(0, 100), description: full, tags, categoryId: config.youtubeCategoryId },
    },
  });
  console.log(`  · 제목·설명 교체 완료: ${title}`);
}

/**
 * 이 채널에 이미 올라간 회차 번호를 모아 온다.
 *
 * ★"어디까지 올렸는지"를 저장소 파일이 아니라 유튜브에서 읽는 이유★
 * 진행 상태를 커밋해 두면 두 곳(유튜브와 파일)이 어긋나기 시작한다. 실행이 중간에 죽거나,
 * 사람이 유튜브에서 직접 지우거나, 브랜치가 갈리면 파일은 거짓말을 하게 된다. 유튜브가
 * 사실이므로 매번 유튜브에 묻는다. 그러면 상태를 저장할 곳 자체가 없어진다.
 *
 * ★표식을 제목에서 태그로 옮겼다★ 예전에는 제목의 "시리즈명 [N]" 을 읽었다. 그런데 그
 * 번호가 제목 맨 앞에 있으면 "1편부터 봐야 하는 강좌"로 보여서, 낱개로 검색해 들어온
 * 사람이 23편을 그냥 지나친다. 조각조각 나뉜 강의에는 치명적이다. 그래서 제목에서 번호를
 * 빼고, 대신 사람에게 안 보이는 태그(예: cdsa-ac-14)에 적는다. 태그는 시청자 화면에
 * 나오지 않으므로 낱개 영상처럼 보이면서도 기계는 정확히 셀 수 있다.
 *
 * ★옛 제목 형식도 함께 읽는다★ 이미 "시리즈명 [1]" 형태로 올라간 영상이 있다. 태그만
 * 보면 그 영상들이 "안 올라간 것"으로 잡혀 같은 영상을 또 올린다. 둘 다 읽는다.
 */
export async function listPublishedOrders(seriesTitle: string, seriesCode = ''): Promise<Set<number>> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const ch = await youtube.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('채널의 업로드 재생목록을 찾지 못했습니다.');

  // 1) 내 업로드의 videoId 를 모두 모은다.
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await youtube.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    for (const it of res.data.items ?? []) {
      const id = it.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // 2) 50개씩 묶어 제목·태그를 읽는다. playlistItems 로는 태그를 못 받아서 videos.list 가 필요하다.
  const orders = new Set<number>();
  const squash = (s: string) => s.replace(/\s+/g, '');
  const titlePrefix = squash(seriesTitle);
  const tagRe = seriesCode ? new RegExp(`^${seriesCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i') : null;

  for (let i = 0; i < ids.length; i += 50) {
    const res = await youtube.videos.list({ part: ['snippet'], id: ids.slice(i, i + 50) });
    for (const v of res.data.items ?? []) {
      // 태그 표식(현재 방식)
      for (const tag of v.snippet?.tags ?? []) {
        const m = tagRe?.exec(tag.trim());
        if (m) orders.add(Number(m[1]));
      }
      // 옛 제목 형식 "시리즈명 [N] …"
      const t = squash(v.snippet?.title ?? '');
      if (titlePrefix && t.startsWith(titlePrefix)) {
        const m = /^\[(\d+)\]/.exec(t.slice(titlePrefix.length));
        if (m) orders.add(Number(m[1]));
      }
    }
  }
  return orders;
}

/**
 * 회차 번호 → 유튜브 영상. listPublishedOrders 가 번호만 돌려주는 것과 달리 영상 자체를 준다.
 *
 * ★썸네일을 갈아끼우려면 어느 영상인지 알아야 한다★ 회차 표식은 사람에게 안 보이는 태그
 * (cdsa-ac-14)로 박혀 있어서, 그 태그를 읽으면 "14회차는 이 영상"을 알 수 있다. 저장소에
 * 발행 이력을 두지 않는 이 저장소의 원칙("유튜브가 사실이다")을 그대로 따른다.
 */
export async function listPublishedEpisodes(
  seriesCode: string,
): Promise<Array<{ order: number; videoId: string; title: string; publishedAt: string }>> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const ch = await youtube.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('채널의 업로드 재생목록을 찾지 못했습니다.');

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await youtube.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    for (const it of res.data.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const tagRe = new RegExp(`^${seriesCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
  const out: Array<{ order: number; videoId: string; title: string; publishedAt: string }> = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await youtube.videos.list({ part: ['snippet'], id: ids.slice(i, i + 50) });
    for (const v of res.data.items ?? []) {
      for (const tag of v.snippet?.tags ?? []) {
        const m = tagRe.exec(tag.trim());
        if (m && v.id) {
          out.push({
            order: Number(m[1]),
            videoId: v.id,
            title: v.snippet?.title ?? '',
            publishedAt: v.snippet?.publishedAt ?? '',
          });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => b.order - a.order);
}

/**
 * 최근 올린 영상의 제목을 새 것부터 n 개.
 *
 * ★중복 발행을 막는 근거를 따로 저장하지 않는다★ 수시 발행은 같은 종목을 며칠 연속
 * 다루기 쉬운데, 그것을 막으려고 상태 파일을 따로 두면 러너가 매번 새로 뜨는 구조에서
 * 그 파일이 곧 사실과 어긋난다(강의 시리즈에서 이미 겪은 문제다). 채널에 실제로 올라간
 * 것이 사실이므로 그것을 읽는다 — 어느 경로로 올렸든, 손으로 지웠든 자동으로 맞는다.
 */
export async function listRecentVideoTitles(max = 30): Promise<string[]> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const ch = await youtube.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  // ★한 번에 50개까지만 온다★ 발행이 잦아지면 50개는 며칠치밖에 안 되고, 그만큼 같은
  // 종목이 다시 나오기 쉬워진다. 필요한 만큼 페이지를 넘겨 받는다.
  const titles: string[] = [];
  let pageToken: string | undefined;
  while (titles.length < max) {
    const res = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId: uploads,
      maxResults: Math.min(50, max - titles.length),
      pageToken,
    });
    for (const it of res.data.items ?? []) if (it.snippet?.title) titles.push(it.snippet.title);
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return titles;
}

