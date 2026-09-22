/**
 * 직접 만든 강의 영상 한 편을 유튜브에 올린다.
 *
 * 자동 생성 파이프라인(run.ts)과 완전히 다른 흐름이다. 여기서는 영상을 만들지 않는다 —
 * 이미 완성된 영상과 자막을 드라이브에서 받아, 자막을 읽고 메타데이터를 만들어 올린다.
 *
 * ★폴더가 곧 목록이다★ 예전에는 드라이브 목록 조회에 인증이 필요해 순서를 저장소 안
 * 파일에 손으로 적어 두었다. 지금은 공개 폴더를 임베드 화면으로 읽으므로(driveFolder.ts)
 * 파일만 넣으면 된다. 내려받기도 공개 링크라 자격증명은 여전히 하나도 필요 없다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OUT_DIR, THUMBNAIL_PATH, config,
  PRESENTER_IMAGE_PATH,
} from '../config.js';
import { downloadDriveFile } from '../lib/drive.js';
import { generateCourseMeta } from '../lib/courseMeta.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { pickFrames } from '../lib/courseFrames.js';
import { drawCourseThumbnail } from '../lib/courseThumbnail.js';
import { groupAccent, type StripSpec } from '../lib/seriesStrip.js';
import { uploadVideo, uploadCaption, ensurePlaylist, addToPlaylist, updateVideoMeta, setThumbnail, listPublishedOrders, apiErrorDetail } from '../lib/youtube.js';
import { courseTotal, nextCourseModule } from '../lib/courseManifest.js';
import { nextKstTimeUtc } from '../lib/publishTime.js';
import { printUsage } from '../lib/usage.js';

const env = (k: string, fallback = '') => (process.env[k] ?? '').trim() || fallback;

/**
 * 이번 프로세스에서 올린 회차. 시리즈 표식별로 따로 센다.
 *
 * ★유튜브는 방금 올린 영상을 곧바로 목록에 넣어 주지 않는다★ 어디까지 올렸는지는 채널에
 * 물어서 정하는데(유튜브가 사실이다), 업로드 직후 몇 초 안에 다시 물으면 방금 올린 것이
 * 아직 안 보인다. 하루 한 편일 때는 24시간 뒤에 묻기 때문에 드러나지 않았다.
 *
 * 한 번에 여러 편 올리도록 바꾸자마자 29~40번이 전부 두 번씩 올라갔다 — 40번을 올리고
 * 몇 초 뒤 "이미 올라간 회차: …, 39" 라는 답을 받아 40번을 또 집었다. 채널 응답만으로는
 * 이 창을 못 메우므로, 이 프로세스가 방금 올린 것은 따로 기억해 둔다.
 */
const justPublished = new Map<string, Set<number>>();

/** 한 편 올린다. 'ok' 면 계속 돌려도 되고, 'stop' 이면 더 올릴 것이 없다는 뜻이다. */
export async function publishOne(): Promise<'ok' | 'stop'> {
  const courseName = env('COURSE_NAME', 'AI챔피언 강사양성과정');
  // 제목 앞에 붙는 시리즈명과 회차. 회차는 드라이브 파일명 순번을 그대로 받는다.
  const seriesTitle = env('SERIES_TITLE', courseName);
  // 어디까지 올렸는지 세기 위한 표식. 시청자에게는 안 보이는 태그로 들어간다.
  const seriesCode = env('COURSE_CODE', 'cdsa-ac');
  // ★올리는 시각과 공개되는 시각을 떼어 놓는다★ 비우면 예전처럼 올리자마자 공개된다.
  const publishAtKst = env('COURSE_PUBLISH_AT');

  // ★자동 모드★ 무엇을 올릴지 사람이 정해 주지 않고, 목록에서 아직 안 올라간 것 중
  // 순번이 가장 빠른 것을 스스로 고른다. 하루 한 편 크론이 이 모드로 돈다.
  let videoFileId = env('DRIVE_VIDEO_ID');
  let srtFileId = env('DRIVE_SRT_ID');
  let descFileId = env('DRIVE_DESC_ID');
  let moduleLabel = env('MODULE_LABEL');
  let topic = env('COURSE_TOPIC');
  let order = Number(env('COURSE_ORDER', '0')) || 0;

  if (env('COURSE_AUTO', 'false').toLowerCase() === 'true') {
    console.log('▶ [0] 다음 회차 고르기 (자동)');
    const published = await listPublishedOrders(seriesTitle, seriesCode);
    const mine = justPublished.get(seriesCode);
    if (mine?.size) {
      for (const n of mine) published.add(n);
      console.log(`  · 이번 실행에서 올린 회차(유튜브 목록에는 아직 안 보임): ${[...mine].sort((a, b) => a - b).join(', ')}`);
    }
    console.log(`  · 이미 올라간 회차: ${[...published].sort((a, b) => a - b).join(', ') || '없음'}`);
    const next = await nextCourseModule(published);
    // ★올릴 게 없으면 조용히 끝낸다★ 실패로 처리하면 매일 빨간 알림이 온다.
    // 순서를 기다리는 것도, 다 끝난 것도 고장이 아니다.
    if (next.kind === 'waiting') {
      console.log(`  · [${next.order}]번 차례인데 아직 드라이브에 없습니다. 순서를 지키려고 오늘은 건너뜁니다.`);
      printUsage();
      return 'stop';
    }
    if (next.kind === 'done') {
      console.log('  · 올릴 회차가 없습니다 — 시리즈를 다 발행했습니다.');
      printUsage();
      return 'stop';
    }
    ({ driveVideoId: videoFileId, driveSrtId: srtFileId, moduleLabel, topic, order } = next.module);
    descFileId = next.module.driveDescId ?? '';
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
  /**
   * 회차 번호를 어디에 붙일지. prefix(기본) | suffix | none.
   *
   * ★시청자가 순서를 못 찾고 있었다★ 댓글로 "연속성 있는 강의를 파트별로 끊어 올리는
   * 것 같은데 순서를 알 수 있게 번호를 넣어 달라"는 요청이 왔다. 실제로 번호가 어디에도
   * 없었다 — 제목에도, 썸네일에도, 설명 첫 줄에도.
   *
   * ★맨 앞에 둔다★ 처음엔 뒤에 붙였다 — 제목이 내용으로 시작해야 검색에서 유리하다고
   * 봤기 때문이다. 그런데 목록에서 여러 편이 세로로 늘어설 때 번호가 같은 자리에 있어야
   * 눈이 순서를 따라간다. 끝에 붙이면 제목 길이가 편마다 달라 번호 위치가 들쭉날쭉하고,
   * 모바일에서는 제목이 잘려 번호가 아예 안 보이는 편도 생긴다. 순서를 알려 달라는
   * 요청에 대한 답으로는 앞이 맞다.
   */
  const numberStyle = env('COURSE_NUMBER_STYLE', 'prefix').toLowerCase();
  const total = await courseTotal();

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
  /**
   * 사람이 써 둔 업로드 설명(<이름>_업로드설명.txt)이 있으면 그것을 그대로 쓴다.
   *
   * ★사람이 쓴 것을 모델이 다시 쓸 이유가 없다★ 이 파일에는 제목 한 줄, 요약, 실제
   * 시각이 박힌 목차, 강사 표기, 해시태그가 이미 들어 있다. 목차 시각은 영상을 보고
   * 적은 것이라 자막에서 추정한 것보다 정확하다.
   *
   * ★제목에 번호를 또 붙이지 않는다★ 첫 줄이 "[01/09] … | 관리자 AI 리더십" 처럼 이미
   * 번호와 시리즈명을 달고 있다. 그 위에 우리 접두어를 얹으면 번호가 두 번 붙는다.
   */
  let authored: { title: string; description: string; tags: string[] } | null = null;
  if (descFileId) {
    try {
      const descPath = path.join(OUT_DIR, 'course-desc.txt');
      await downloadDriveFile(descFileId, descPath, 10);
      // BOM 은 첫 글자로 남아 제목 맨 앞에 보이지 않는 문자를 끼워 넣는다.
      const raw = (await fs.readFile(descPath, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      const lines = raw.split('\n');
      const titleIdx = lines.findIndex((l) => l.trim());
      const title = (lines[titleIdx] ?? '').trim();
      const rest = lines.slice(titleIdx + 1).join('\n').trim();
      if (title && rest) {
        const tags = [...new Set([...rest.matchAll(/#([^\s#]+)/g)].map((m) => m[1]))].slice(0, 12);
        authored = { title: title.slice(0, 100), description: rest, tags };
        console.log(`  · 업로드 설명 파일을 씁니다 (${raw.length}자, 태그 ${tags.length}개)`);
      } else {
        console.warn('  ⚠ 설명 파일이 비어 제목·설명을 자막에서 만듭니다.');
      }
    } catch (e) {
      // 설명 파일 하나 때문에 그날 발행을 버리지 않는다 — 없으면 지금까지처럼 만든다.
      console.warn(`  ⚠ 설명 파일을 못 읽어 자막에서 만듭니다 — ${(e as Error).message}`);
    }
  }

  // ★번호는 제목 맨 앞이다★ 목록에서 여러 편이 세로로 늘어설 때 번호가 같은 자리에
  // 있어야 눈이 순서를 따라간다. 끝에 붙이면 제목 길이가 편마다 달라 번호가 들쭉날쭉한
  // 위치에 서고, 모바일에서는 제목이 잘려 아예 안 보이는 편도 생긴다.
  const prefix = numberStyle === 'prefix' && order ? `${seriesTitle}[${order}${total ? `/${total}` : ''}] ` : '';
  const suffix = numberStyle === 'suffix' && order ? ` [${order}${total ? `/${total}` : ''}]` : '';
  // 100자 상한은 번호를 뗀 뒤에 자른다 — 안 그러면 번호가 잘려 나가 순서를 알 수 없게 된다.
  const fullTitle = authored ? authored.title : (prefix + meta.title).slice(0, 100 - suffix.length) + suffix;
  // 설명 맨 위에 후킹 한 줄을 얹는다 — 검색 결과와 추천 카드에서 앞부분만 보이기 때문이다.
  // 그 바로 아래에 순서를 적는다. 제목의 [14/43] 만으로는 재생목록이 있는지 모른다.
  const orderLine = order ? `${seriesTitle} ${order}${total ? `/${total}` : ''}번째 편입니다. 전체 순서는 재생목록에서 볼 수 있습니다.\n` : '';
  const description = authored ? authored.description : `${hook} · ${hookSub}\n${orderLine}\n${body}`;

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
  // ★띠에도 번호를 되살린다★ 예전에 뺀 이유는 "몇 번째부터 봐야 하나" 하는 부담을
  // 주지 않으려는 것이었는데, 실제로는 순서를 못 찾겠다는 요청이 왔다. 부담보다 길잡이가
  // 없는 쪽이 더 큰 문제다.
  const strip: StripSpec = { label: hook, order: numberStyle === 'none' ? 0 : order, accent: groupAccent(moduleLabel, order) };
  const headline = headlineOverride || meta.thumbnailHeadline;
  // 시청자에게 안 보이는 진행 표식. 이게 없으면 다음 회차를 고를 수 없다.
  // 진행 표식은 어느 쪽이든 붙인다 — 이게 없으면 다음 회차를 고를 수 없다.
  const baseTags = authored ? authored.tags : meta.tags;
  const tags = order ? [...baseTags, `${seriesCode}-${order}`] : baseTags;

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
    thumbnailBadge2: meta.thumbnailBadge2 ?? '',
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
    return 'stop';
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
    return 'stop';
  }

  console.log('▶ [3/5] 영상 내려받기');
  const bytes = await downloadDriveFile(videoFileId, videoPath, 1_000_000);
  console.log(`  · ${(bytes / 1024 / 1024).toFixed(1)}MB`);

  console.log('▶ [4/5] 썸네일 생성');
  // ★배경을 그 강의의 실제 화면으로★ 지금까지는 gpt-image 가 인물과 클립아트(자물쇠·
  // 로켓·퍼즐)를 그렸다. 같은 분야에서 잘 되는 채널들(조코딩·노마드코더·코딩애플)을
  // 실제로 훑어보니 클립아트를 쓰는 곳이 하나도 없었다 — 자물쇠는 보안 영상에도 배포
  // 영상에도 그릴 수 있어서 "무엇을 배우는 영상인지"를 하나도 못 알려준다. 영상 안에
  // 이미 엑셀 시트·코드·설정 화면이 다 있으므로 그것을 배경으로 쓴다. 그림 생성이
  // 사라져 장당 비용도 0 이 된다.
  const thumbStyle = env('COURSE_THUMB_STYLE', 'screen').toLowerCase();
  let madeThumb = false;
  if (thumbStyle === 'screen' || thumbStyle === 'bare') {
    try {
      const frames = await pickFrames(videoPath, path.join(OUT_DIR, 'frames'), 10);
      const best = frames[0];
      console.log(`  · 배경 화면: ${Math.round(best.atSec)}초 지점 (${best.detail})`);
      await drawCourseThumbnail({
        framePath: best.file,
        headline,
        badge: metaOut.thumbnailBadge2,
        strip: hook,
        // 얼굴이 있으면 클릭률이 오른다는 것이 여러 자료의 공통된 이야기다. bare 는
        // 화면만으로 가는 대조군이라 인물을 넣지 않는다.
        presenterPath: thumbStyle === 'screen' ? PRESENTER_IMAGE_PATH : undefined,
        accent: groupAccent(moduleLabel, order),
        layout: thumbStyle,
        outPath: THUMBNAIL_PATH,
      });
      madeThumb = true;
      console.log('  · 완료(코드 생성 · 비용 0)');
    } catch (e) {
      // ★한 장 실패로 그날 발행을 버리지 않는다★ 그림이 없으면 유튜브가 영상에서
      // 자동으로 한 장 고른다 — 우리가 고른 것보다는 못하지만 발행은 나간다.
      console.warn(`  · 화면 썸네일 실패(그림 없이 올립니다): ${(e as Error).message}`);
    }
  } else {
    madeThumb = await generateThumbnail({
      title: fullTitle,
      topic: `${courseName} — ${topic}`,
      // 큰 글씨는 이 회차만의 문구, 시리즈 표식은 코드가 얹는 왼쪽 아래 띠가 맡는다(위 설명 참고).
      headline,
      seriesStrip: strip,
      outPath: THUMBNAIL_PATH,
    });
    console.log(madeThumb ? '  · 완료' : '  · 건너뜀(OPENAI_API_KEY 없음)');
  }

  console.log('▶ [5/5] 유튜브 업로드');
  // 공개 예정인 영상만 예약한다 — 미등록·비공개로 올리는 것은 예약할 이유가 없다.
  const publishAt = publishAtKst && config.youtubePrivacyStatus === 'public'
    ? nextKstTimeUtc(publishAtKst)
    : undefined;
  const videoId = await uploadVideo({
    videoPath,
    script: { title: fullTitle, description, tags },
    thumbnailPath: madeThumb ? THUMBNAIL_PATH : undefined,
    publishAt,
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
  // ★여기서 기억해 두지 않으면 다음 편이 같은 회차를 또 올린다★ 유튜브 목록에 뜨기까지
  // 시차가 있어서, 바로 다음에 물어보면 방금 올린 것이 안 보인다.
  if (order) {
    const set = justPublished.get(seriesCode) ?? new Set<number>();
    set.add(order);
    justPublished.set(seriesCode, set);
  }
  printUsage();
  return 'ok';
}

/**
 * 한 번 실행에 여러 편을 올린다.
 *
 * ★쿼터가 진짜 상한이다★ 업로드 한 번에 1,600 단위가 나가고 썸네일·재생목록까지
 * 합치면 편당 1,700 쯤이다. 하루 한도가 10,000 이니 다섯 편이 안전선이고 여섯 편째에서
 * 막힌다. 그러니 "한 번에 다 올려" 는 애초에 안 되는 요청이고, 몇 편까지 되는지를
 * 코드가 알고 멈춰 주는 편이 낫다.
 *
 * ★막히는 것은 고장이 아니다★ 한도에 닿으면 빨간 X 대신 몇 편 올렸는지 적고 끝낸다.
 * 남은 편은 다음 날(태평양시 자정, 한국 시간 오후 4~5시 초기화) 차례가 온다.
 */
async function main(): Promise<void> {
  const count = Math.max(1, Number(env('COURSE_COUNT', '1')) || 1);
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (count > 1) console.log(`\n════════ ${i + 1}/${count}편째 ════════`);
    try {
      const r = await publishOne();
      if (r === 'stop') break;
      done++;
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/quota/i.test(msg)) {
        console.error(`\n⏭ 오늘 업로드 한도를 다 썼습니다 — ${done}편까지 올렸습니다.`);
        console.error(`   ${msg.split('\n')[0]}`);
        console.error('   한도는 태평양시 자정(한국 시간 오후 4~5시)에 초기화됩니다. 남은 편은 그 뒤에 올라갑니다.');
        break;
      }
      throw e;
    }
  }
  if (count > 1) console.log(`\n──── 이번 실행: ${done}편 업로드 ────`);
}

// ★직접 실행할 때만 돈다★ courseBatch 가 publishOne 을 가져다 쓰는데, 불러오는 것만으로
// main 이 돌면 시리즈 하나가 제멋대로 한 편 올라간다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('\n❌ 실패:', (e as Error).message);
    process.exit(1);
  });
}
