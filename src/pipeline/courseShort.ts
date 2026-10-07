/**
 * 이미 있는 강의 한 편에서 쇼츠를 만들어 올린다.
 *
 * ★새로 찍지 않는다★ 강의가 일흔 편 넘게 쌓여 있고 자막까지 붙어 있다. 거기서 사람들이
 * 남에게 옮길 만한 한 토막을 잘라 내는 쪽이 정확하고, 비용도 모델 한 번 + ffmpeg 뿐이다.
 * 쇼츠는 그 자체로도 보지만, 전체 강의로 가는 길이기도 하다.
 *
 * ★어느 편으로 만들지★ 폴더 순서대로 돌되, 이미 쇼츠를 만든 회차는 건너뛴다. 어느 회차로
 * 만들었는지는 쇼츠 태그(`<코드>-short-<회차>`)에 박아 둔다 — 저장소에 발행 이력을 두지
 * 않는 이 저장소의 원칙("유튜브가 사실이다")을 그대로 따른다.
 *
 * 드는 쿼터: 업로드 1,600. 썸네일은 안 건다(쇼츠는 세로 첫 프레임이 그대로 쓰인다).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { downloadDriveFile } from '../lib/drive.js';
import { listPublicFolder } from '../lib/driveFolder.js';
import { pairCourseFiles } from '../lib/courseFiles.js';
import { planShort } from '../lib/shortPlan.js';
import { renderShort } from '../lib/shortRender.js';
import { thumbVariant } from '../lib/thumbVariant.js';
import { uploadVideo, listPublishedOrders, apiErrorDetail } from '../lib/youtube.js';
import { flagScolding } from '../lib/courseMeta.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERIES_PATH = path.resolve(HERE, '../../assets/course/series.json');
const OUT_DIR = path.resolve(HERE, '../../out/short');

const env = (k: string, d = '') => process.env[k]?.trim() || d;

interface SeriesCfg {
  name: string;
  folderId: string;
  code: string;
  courseName: string;
  seriesTitle: string;
  hook?: string;
}

/** 이 실행에서 이미 만든 회차 — 유튜브 목록에 뜨기까지 시차가 있다(강의에서 겪었다). */
const justMade = new Map<string, Set<number>>();

export async function makeOne(): Promise<'ok' | 'stop'> {
  const cfg = JSON.parse(await fs.readFile(SERIES_PATH, 'utf8')) as { series: SeriesCfg[] };
  const only = env('COURSE_ONLY');
  const list = only ? cfg.series.filter((s) => s.code === only || s.name === only) : cfg.series;
  if (!list.length) throw new Error(`시리즈를 못 찾았습니다 (COURSE_ONLY=${only}).`);
  const s = list[0];

  const shortCode = `${s.code}-short`;
  const made = await listPublishedOrders(`${s.seriesTitle} 쇼츠`, shortCode);
  for (const n of justMade.get(shortCode) ?? []) made.add(n);

  const { pairs } = pairCourseFiles(await listPublicFolder(s.folderId));
  const wanted = Number(env('SHORT_ORDER', '')) || 0;
  const next = wanted ? pairs.find((p) => p.order === wanted) : pairs.find((p) => !made.has(p.order));
  if (!next) {
    console.log(`· 쇼츠로 만들 회차가 없습니다 — ${s.name} 은 다 했습니다 (만든 것 ${made.size}편).`);
    return 'stop';
  }
  console.log(`▶ ${s.name} [${next.order}] ${next.topic}`);

  await fs.mkdir(OUT_DIR, { recursive: true });
  const videoPath = path.join(OUT_DIR, 'source.mp4');
  const srtPath = path.join(OUT_DIR, 'source.srt');

  console.log('▶ [1/4] 자막·영상 내려받기');
  await downloadDriveFile(next.srtId, srtPath);
  const srt = await fs.readFile(srtPath, 'utf8');

  console.log('▶ [2/4] 토막·훅 고르기');
  const { plan, template } = await planShort({
    srt,
    sourceTitle: next.topic,
    courseName: s.courseName,
    maxSec: Number(env('SHORT_MAX_SEC', '55')),
    minSec: Number(env('SHORT_MIN_SEC', '30')),
  });
  console.log(`  · 훅 틀 ${template.id}번: ${template.pattern.slice(0, 44)}…`);
  console.log(`  · 훅: ${plan.hook.replace(/\n/g, ' / ')}`);
  console.log(`  · 구간: ${plan.startSec.toFixed(1)}~${plan.endSec.toFixed(1)}초 (${(plan.endSec - plan.startSec).toFixed(1)}초)`);
  console.log(`  · 고른 이유: ${plan.why}`);
  const scold = flagScolding(`${plan.hook}\n${plan.title}`);
  if (scold.length) console.warn(`  ⚠ 훈계조로 읽힐 수 있는 말: ${scold.join(', ')}`);

  const mb = (await downloadDriveFile(next.videoId, videoPath)) / 1024 / 1024;
  console.log(`  · 원본 ${mb.toFixed(1)}MB`);

  console.log('▶ [3/4] 세로로 만들기');
  const outPath = path.join(OUT_DIR, 'short.mp4');
  await renderShort({
    sourceVideo: videoPath,
    srt,
    startSec: plan.startSec,
    endSec: plan.endSec,
    hook: plan.hook,
    outro: plan.outro,
    strip: s.hook ?? s.seriesTitle,
    accent: thumbVariant(next.order).accent,
    workDir: path.join(OUT_DIR, 'work'),
    outPath,
  });

  console.log('▶ [4/4] 업로드');
  if (env('DRY_RUN', 'true').toLowerCase() !== 'false') {
    console.log('\n예행 모드라 올리지 않았습니다. 만든 영상은 아티팩트로 받아 보십시오.');
    return 'stop';
  }
  // ★#Shorts 를 설명에 넣는다★ 세로 1080x1920 에 3분 이하면 유튜브가 알아서 쇼츠로
  // 분류하지만, 표식이 있으면 확실하다.
  const description = [plan.summary.trim(), '', `전체 강의: ${s.seriesTitle}`, '#Shorts'].join('\n');
  try {
    const videoId = await uploadVideo({
      videoPath: outPath,
      script: {
        title: plan.title.slice(0, 90),
        description,
        tags: [...plan.tags, 'Shorts', `${shortCode}-${next.order}`],
      },
    });
    const set = justMade.get(shortCode) ?? new Set<number>();
    set.add(next.order);
    justMade.set(shortCode, set);
    console.log(`\n✅ https://youtu.be/${videoId}`);
    return 'ok';
  } catch (e) {
    const msg = apiErrorDetail(e);
    if (/quota/i.test(msg)) {
      console.error('\n⏭ 오늘 업로드 한도를 다 썼습니다 — 여기서 멈춥니다.');
      console.error(`   ${msg.split('\n')[0]}`);
      return 'stop';
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const budget = Math.max(1, Number(env('SHORT_BUDGET', '1')));
  console.log(`▶ 쇼츠 ${budget}편 · 공개 범위 ${config.youtubePrivacyStatus}`);
  for (let i = 0; i < budget; i++) {
    if ((await makeOne()) === 'stop') break;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
