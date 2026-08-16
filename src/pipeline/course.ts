/**
 * 직접 만든 강의 영상 한 편을 유튜브에 올린다.
 *
 * 자동 생성 파이프라인(run.ts)과 완전히 다른 흐름이다. 여기서는 영상을 만들지 않는다 —
 * 이미 완성된 영상과 자막을 드라이브에서 받아, 자막을 읽고 메타데이터를 만들어 올린다.
 *
 * ★폴더 목록은 여기서 읽지 않는다★ 드라이브 목록 조회는 인증이 필요한데 러너에는 그
 * 자격이 없다. 대신 "무엇을 올릴지"는 호출하는 쪽(Claude 세션)이 정해 파일 ID 로 넘긴다.
 * 러너는 공개 링크로 내려받기만 하면 되므로 자격증명이 하나도 늘지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT_DIR, THUMBNAIL_PATH, config } from '../config.js';
import { downloadDriveFile } from '../lib/drive.js';
import { generateCourseMeta } from '../lib/courseMeta.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { uploadVideo, uploadCaption, ensurePlaylist, addToPlaylist, updateVideoMeta, setThumbnail } from '../lib/youtube.js';
import { printUsage } from '../lib/usage.js';

const env = (k: string, fallback = '') => (process.env[k] ?? '').trim() || fallback;

async function main(): Promise<void> {
  const videoFileId = env('DRIVE_VIDEO_ID');
  const srtFileId = env('DRIVE_SRT_ID');
  const moduleLabel = env('MODULE_LABEL');
  const topic = env('COURSE_TOPIC');
  const courseName = env('COURSE_NAME', 'AI챔피언 강사양성과정');
  // 제목 앞에 붙는 시리즈명과 회차. 회차는 드라이브 파일명 순번을 그대로 받는다.
  const seriesTitle = env('SERIES_TITLE', courseName);
  const order = Number(env('COURSE_ORDER', '0')) || 0;
  // ★썸네일 공통 후킹 문구★ 회차마다 바뀌지 않는다 — 37편이 한 시리즈로 보이게 하는 장치이자,
  // "유료 과정을 공짜로 푼다"는 이 시리즈에서 가장 센 사실이다. 코드가 아니라 환경변수로 둔 것은
  // 문구를 바꾸려고 배포를 다시 하지 않아도 되게 하기 위해서다.
  const hook = env('COURSE_HOOK', '돈 주고도 못 듣는 강의');
  const hookSub = env('COURSE_HOOK_SUB', '무조건 구독 · 소장');
  const playlistTitle = env('PLAYLIST_TITLE', courseName);
  // ★기본이 예행 모드다★ 실수로 트리거했을 때 영상이 올라가 있는 것보다,
  // 아무것도 안 올라간 채 메타데이터만 나와 있는 편이 낫다.
  const dryRun = env('DRY_RUN', 'true').toLowerCase() !== 'false';
  // ★이미 올라간 영상 고치기★ 값이 있으면 새로 올리지 않고 그 영상의 제목·설명·썸네일만
  // 갈아끼운다. 형식을 바꿨다고 76MB 를 다시 올릴 이유가 없고, 조회수·링크도 유지된다.
  const updateVideoId = env('UPDATE_VIDEO_ID');

  if (!srtFileId) throw new Error('DRIVE_SRT_ID 가 필요합니다.');
  if (!dryRun && !videoFileId) throw new Error('DRIVE_VIDEO_ID 가 필요합니다.');

  await fs.mkdir(OUT_DIR, { recursive: true });
  const srtPath = path.join(OUT_DIR, 'course.srt');
  const videoPath = path.join(OUT_DIR, 'course.mp4');

  console.log(`▶ [1/5] 자막 내려받기 (${moduleLabel || '모듈'})`);
  const srtBytes = await downloadDriveFile(srtFileId, srtPath, 200);
  console.log(`  · ${srtBytes.toLocaleString()} 바이트`);

  console.log('▶ [2/5] 자막을 읽어 제목·설명·챕터 생성');
  const srt = await fs.readFile(srtPath, 'utf8');
  const { meta, parsed, chapters, description: body } = await generateCourseMeta({
    srt,
    moduleLabel,
    filenameTopic: topic,
    courseName,
    seriesTitle,
    order,
  });
  // 제목 = 시리즈명 [회차] 내용. 목록에서 순서와 소속이 한눈에 보여야 한다.
  const prefix = order ? `${seriesTitle} [${order}] ` : `${seriesTitle} `;
  const fullTitle = `${prefix}${meta.title}`.slice(0, 100);
  // 설명 맨 위에 후킹 한 줄을 얹는다 — 검색 결과와 추천 카드에서 앞부분만 보이기 때문이다.
  const description = `${hook} · ${hookSub}\n\n${body}`;

  const metaOut = {
    moduleLabel,
    title: fullTitle,
    description,
    tags: meta.tags,
    chapters,
    thumbnailHeadline: meta.thumbnailHeadline,
    thumbnailHook: hook,
    thumbnailBadge: meta.thumbnailBadge,
    srtCues: parsed.cues.length,
    durationSec: Math.round(parsed.durationSec),
  };
  await fs.writeFile(path.join(OUT_DIR, 'course-meta.json'), JSON.stringify(metaOut, null, 2), 'utf8');

  console.log(`\n──────── 이 영상으로 올라갈 내용 ────────`);
  console.log(`제목: ${fullTitle}`);
  console.log(`길이: ${Math.round(parsed.durationSec / 60)}분 · 자막 ${parsed.cues.length}줄`);
  console.log(`태그: ${meta.tags.join(', ')}`);
  console.log(`썸네일: 큰 문구 "${hook}" / 회차 문구 "${meta.thumbnailHeadline}" / 배지 ${meta.thumbnailBadge}`);
  console.log(`\n${description}\n────────────────────────────────────\n`);

  if (dryRun) {
    console.log('▶ 예행 모드 — 여기서 멈춥니다. 실제 업로드는 DRY_RUN=false 로 다시 실행하세요.');
    printUsage();
    return;
  }

  if (updateVideoId) {
    console.log(`▶ 기존 영상 고치기 (${updateVideoId}) — 영상은 다시 올리지 않습니다`);
    await updateVideoMeta({ videoId: updateVideoId, title: fullTitle, description, tags: meta.tags });
    const ok = await generateThumbnail({
      title: fullTitle,
      topic: `${courseName} — ${topic}`,
      headline: hook,
      badge: `${seriesTitle} ${order ? `[${order}]` : ''} · ${meta.thumbnailHeadline}`.trim(),
      outPath: THUMBNAIL_PATH,
    });
    if (ok) await setThumbnail(updateVideoId, THUMBNAIL_PATH);
    console.log(`\n✅ 교체 완료: https://youtu.be/${updateVideoId}`);
    printUsage();
    return;
  }

  console.log('▶ [3/5] 영상 내려받기');
  const bytes = await downloadDriveFile(videoFileId, videoPath, 1_000_000);
  console.log(`  · ${(bytes / 1024 / 1024).toFixed(1)}MB`);

  console.log('▶ [4/5] 썸네일 생성');
  const madeThumb = await generateThumbnail({
    title: fullTitle,
    topic: `${courseName} — ${topic}`,
    // 큰 글씨는 시리즈 공통 후킹, 배지에 회차와 이번 편 문구를 넣는다.
    headline: hook,
    badge: `${seriesTitle} ${order ? `[${order}]` : ''} · ${meta.thumbnailHeadline}`.trim(),
    outPath: THUMBNAIL_PATH,
  });
  console.log(madeThumb ? '  · 완료' : '  · 건너뜀(OPENAI_API_KEY 없음)');

  console.log('▶ [5/5] 유튜브 업로드');
  const videoId = await uploadVideo({
    videoPath,
    script: { title: fullTitle, description, tags: meta.tags },
    thumbnailPath: madeThumb ? THUMBNAIL_PATH : undefined,
  });

  // ★자막 트랙은 기본으로 붙이지 않는다★
  // 이 강의 영상들은 자막이 이미 화면에 구워져 있어서 트랙이 중복이다. 게다가
  // captions.insert 는 youtube.force-ssl 범위를 요구하는데 지금 리프레시 토큰에는 없어서
  // 매번 "Insufficient Permission" 만 남긴다. 필요해지면 재인증 후 켜면 된다.
  if (env('COURSE_CAPTIONS', 'false').toLowerCase() === 'true') {
    try {
      await uploadCaption({ videoId, srtPath });
    } catch (e) {
      console.warn('  · 자막 트랙 첨부 실패(무시):', (e as Error).message);
    }
  }
  try {
    const playlistId = await ensurePlaylist({
      title: playlistTitle,
      description: `${courseName} 모듈 강의`,
      privacyStatus: config.youtubePrivacyStatus === 'private' ? 'unlisted' : (config.youtubePrivacyStatus as 'public' | 'unlisted'),
    });
    await addToPlaylist(playlistId, videoId);
  } catch (e) {
    console.warn('  · 재생목록 처리 실패(무시):', (e as Error).message);
  }

  await fs.writeFile(
    path.join(OUT_DIR, 'upload-result.json'),
    JSON.stringify({ videoId, url: `https://youtu.be/${videoId}`, privacy: config.youtubePrivacyStatus, ...metaOut }, null, 2),
    'utf8',
  );
  console.log(`\n✅ 업로드 완료: https://youtu.be/${videoId}`);
  printUsage();
}

main().catch((e) => {
  console.error('\n❌ 실패:', (e as Error).message);
  process.exit(1);
});
