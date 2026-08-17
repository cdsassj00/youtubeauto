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
import { groupAccent, type StripSpec } from '../lib/seriesStrip.js';
import { uploadVideo, uploadCaption, ensurePlaylist, addToPlaylist, updateVideoMeta, setThumbnail, listPublishedOrders, apiErrorDetail } from '../lib/youtube.js';
import { nextCourseModule } from '../lib/courseManifest.js';
import { printUsage } from '../lib/usage.js';

const env = (k: string, fallback = '') => (process.env[k] ?? '').trim() || fallback;

async function main(): Promise<void> {
  const courseName = env('COURSE_NAME', 'AI챔피언 강사양성과정');
  // 제목 앞에 붙는 시리즈명과 회차. 회차는 드라이브 파일명 순번을 그대로 받는다.
  const seriesTitle = env('SERIES_TITLE', courseName);
  // 어디까지 올렸는지 세기 위한 표식. 시청자에게는 안 보이는 태그로 들어간다.
  const seriesCode = env('COURSE_CODE', 'cdsa-ac');

  // ★자동 모드★ 무엇을 올릴지 사람이 정해 주지 않고, 목록에서 아직 안 올라간 것 중
  // 순번이 가장 빠른 것을 스스로 고른다. 하루 한 편 크론이 이 모드로 돈다.
  let videoFileId = env('DRIVE_VIDEO_ID');
  let srtFileId = env('DRIVE_SRT_ID');
  let moduleLabel = env('MODULE_LABEL');
  let topic = env('COURSE_TOPIC');
  let order = Number(env('COURSE_ORDER', '0')) || 0;

  if (env('COURSE_AUTO', 'false').toLowerCase() === 'true') {
    console.log('▶ [0] 다음 회차 고르기 (자동)');
    const published = await listPublishedOrders(seriesTitle, seriesCode);
    console.log(`  · 이미 올라간 회차: ${[...published].sort((a, b) => a - b).join(', ') || '없음'}`);
    const next = await nextCourseModule(published);
    // ★올릴 게 없으면 조용히 끝낸다★ 실패로 처리하면 매일 빨간 알림이 온다.
    // 순서를 기다리는 것도, 다 끝난 것도 고장이 아니다.
    if (next.kind === 'waiting') {
      console.log(`  · [${next.order}]번 차례인데 아직 드라이브에 없습니다. 순서를 지키려고 오늘은 건너뜁니다.`);
      printUsage();
      return;
    }
    if (next.kind === 'done') {
      console.log('  · 올릴 회차가 없습니다 — 시리즈를 다 발행했습니다.');
      printUsage();
      return;
    }
    ({ driveVideoId: videoFileId, driveSrtId: srtFileId, moduleLabel, topic, order } = next.module);
    console.log(`  · 이번 차례: [${order}] ${moduleLabel} — ${topic}`);
  }
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
  // ★이 회차만 큰 글씨를 사람이 정하고 싶을 때★ 비워 두는 것이 기본이고, 그러면 지금까지처럼
  // 자막을 읽고 모델이 회차마다 새로 뽑는다. 40편이 같은 문구가 되면 안 되므로 이 값은
  // 회차별로 넘기는 일회용이지 시리즈 공통 설정이 아니다(시리즈 공통 문구는 COURSE_HOOK 이다).
  const headlineOverride = env('COURSE_HEADLINE');
  // ★기본은 낱개 영상이다★ 제목 맨 앞에 "시리즈명 [14]" 가 붙으면 "1편부터 봐야 하는
  // 강좌"로 보여서, 검색으로 들어온 사람이 그냥 지나친다. 조각조각 나뉜 강의에는 치명적이다.
  // 회차 번호가 필요한 시리즈면 COURSE_NUMBERED=true 로 되돌린다.
  const numbered = env('COURSE_NUMBERED', 'false').toLowerCase() === 'true';

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
  // 제목은 이 영상 하나로 서야 한다(numbered 를 켜면 옛 방식대로 시리즈명·회차가 앞에 붙는다).
  const prefix = numbered ? (order ? `${seriesTitle} [${order}] ` : `${seriesTitle} `) : '';
  const fullTitle = `${prefix}${meta.title}`.slice(0, 100);
  // 설명 맨 위에 후킹 한 줄을 얹는다 — 검색 결과와 추천 카드에서 앞부분만 보이기 때문이다.
  const description = `${hook} · ${hookSub}\n\n${body}`;

  // ★썸네일에서 큰 글씨와 시리즈 표식의 역할★
  //
  // 처음엔 거꾸로였다: 큰 글씨에 시리즈 공통 후킹("돈 주고도 못 듣는 강의")을 넣고,
  // 이번 편 문구는 구석 배지로 밀어 놨다. 한 편만 보면 세 보이지만 40편을 목록에 세우면
  // 제일 큰 글씨가 40장 모두 똑같아서 어느 것을 눌러야 할지 알 수 없다 — 시리즈로 보이는
  // 대신 그냥 중복으로 보인다.
  //
  // 그래서 뒤집었다.
  //  · 큰 글씨 = 이 회차만의 문구. 무엇을 눌러야 할지를 정하는 건 이쪽이다.
  //  · 시리즈 표식 = 왼쪽 아래 고정 띠(회차 번호 + 공통 문구). 자리·모양·색이 매 편
  //    똑같아서 눈이 하나의 표식으로 학습한다. 색은 일차별로 나눠 목록에 구획을 만든다.
  // 띠에서도 번호를 뺀다 — 구석의 "14" 도 순서를 강요하는 신호다. 문구만 남기면 시리즈
  // 표식 구실은 그대로 하면서 "몇 번째부터 봐야 하나" 하는 부담은 사라진다.
  const strip: StripSpec = { label: hook, order: numbered ? order : 0, accent: groupAccent(moduleLabel, order) };
  const headline = headlineOverride || meta.thumbnailHeadline;
  // 시청자에게 안 보이는 진행 표식. 이게 없으면 다음 회차를 고를 수 없다.
  const tags = order ? [...meta.tags, `${seriesCode}-${order}`] : meta.tags;

  const metaOut = {
    moduleLabel,
    title: fullTitle,
    description,
    tags,
    chapters,
    thumbnailHeadline: headline,
    thumbnailHook: hook,
    seriesStrip: strip,
    thumbnailBadge: meta.thumbnailBadge,
    srtCues: parsed.cues.length,
    durationSec: Math.round(parsed.durationSec),
  };
  await fs.writeFile(path.join(OUT_DIR, 'course-meta.json'), JSON.stringify(metaOut, null, 2), 'utf8');

  console.log(`\n──────── 이 영상으로 올라갈 내용 ────────`);
  console.log(`제목: ${fullTitle}`);
  console.log(`길이: ${Math.round(parsed.durationSec / 60)}분 · 자막 ${parsed.cues.length}줄`);
  console.log(`태그: ${meta.tags.join(', ')}`);
  console.log(`썸네일: 큰 글씨 "${headline}"${headlineOverride ? " (지정)" : ""} / 시리즈 띠 [${String(order).padStart(2, '0')}] ${hook} (${strip.accent})`);
  console.log(`\n${description}\n────────────────────────────────────\n`);

  if (dryRun) {
    console.log('▶ 예행 모드 — 여기서 멈춥니다. 실제 업로드는 DRY_RUN=false 로 다시 실행하세요.');
    printUsage();
    return;
  }

  if (updateVideoId) {
    console.log(`▶ 기존 영상 고치기 (${updateVideoId}) — 영상은 다시 올리지 않습니다`);
    await updateVideoMeta({ videoId: updateVideoId, title: fullTitle, description, tags });
    const ok = await generateThumbnail({
      title: fullTitle,
      topic: `${courseName} — ${topic}`,
      headline,
      seriesStrip: strip,
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
    // 큰 글씨는 이 회차만의 문구, 시리즈 표식은 코드가 얹는 왼쪽 아래 띠가 맡는다(위 설명 참고).
    headline,
    seriesStrip: strip,
    outPath: THUMBNAIL_PATH,
  });
  console.log(madeThumb ? '  · 완료' : '  · 건너뜀(OPENAI_API_KEY 없음)');

  console.log('▶ [5/5] 유튜브 업로드');
  const videoId = await uploadVideo({
    videoPath,
    script: { title: fullTitle, description, tags },
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
      console.warn('  · 자막 트랙 첨부 실패(무시):', apiErrorDetail(e));
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
    console.warn('  · 재생목록 처리 실패(무시):', apiErrorDetail(e));
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
