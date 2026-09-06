/**
 * 이미 올라간 강의 회차의 썸네일 후보를 새로 그려 낸다 (A/B 테스트용).
 *
 * ★영상을 다시 올리지 않는다★ 조회수·링크·댓글이 그대로 남아야 하므로 그림만 만든다.
 * 만든 그림은 아티팩트로 나오고, 사람이 유튜브 스튜디오의 "테스트 및 비교"에 올린다 —
 * 썸네일 A/B 는 데이터 API 로 만들 수 없고 스튜디오에서만 걸 수 있다.
 *
 * ★왜 두 가지를 뽑는가★ 지금 쓰는 그림(AI 인물 + 클립아트)이 대조군 A 다. 여기서
 * 만드는 것은 B(실제 화면 + 인물)와 C(화면만, 글씨 최소)로, 바꾸려는 것이 정확히
 * 무엇인지 갈라서 본다 — 배경을 실제 화면으로 바꾼 것이 이겼는지, 인물이 필요한지.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT_DIR, PRESENTER_IMAGE_PATH } from '../config.js';
import { downloadDriveFile } from '../lib/drive.js';
import { loadCourseManifest } from '../lib/courseManifest.js';
import { listPublishedEpisodes } from '../lib/youtube.js';
import { generateCourseMeta } from '../lib/courseMeta.js';
import { pickFrames } from '../lib/courseFrames.js';
import { drawCourseThumbnail } from '../lib/courseThumbnail.js';
import { groupAccent } from '../lib/seriesStrip.js';
import { printUsage } from '../lib/usage.js';

const env = (k: string, d = '') => process.env[k]?.trim() || d;

export async function runCourseThumbAb(): Promise<void> {
  const seriesCode = env('COURSE_CODE', 'cdsa-ac');
  const courseName = env('COURSE_NAME', 'AI챔피언 강사양성과정');
  const hook = env('COURSE_HOOK', '돈 주고도 못 듣는 강의');
  const limit = Number(env('AB_LIMIT', '10')) || 10;
  const only = env('AB_ORDERS')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  const outDir = path.join(OUT_DIR, 'ab');
  await fs.mkdir(outDir, { recursive: true });

  console.log('▶ 올라간 회차 목록 읽기');
  const episodes = await listPublishedEpisodes(seriesCode);
  const modules = await loadCourseManifest();
  const targets = (only.length ? episodes.filter((e) => only.includes(e.order)) : episodes).slice(0, limit);
  console.log(`  · 대상 ${targets.length}편: ${targets.map((t) => t.order).join(', ')}`);

  const rows: Array<Record<string, string>> = [];
  for (const ep of targets) {
    const mod = modules.find((m) => m.order === ep.order);
    if (!mod) {
      console.warn(`  · [${ep.order}] 드라이브 목록에 없습니다 — 건너뜁니다.`);
      continue;
    }
    console.log(`\n▶ [${ep.order}] ${ep.title}`);
    const srtPath = path.join(outDir, `ep${ep.order}.srt`);
    const videoPath = path.join(outDir, `ep${ep.order}.mp4`);
    try {
      await downloadDriveFile(mod.driveSrtId, srtPath, 200);
      const srt = await fs.readFile(srtPath, 'utf8');
      const { meta } = await generateCourseMeta({
        srt,
        courseName,
        seriesTitle: env('SERIES_TITLE', courseName),
        moduleLabel: mod.moduleLabel,
        filenameTopic: mod.topic,
        order: ep.order,
      });
      console.log(`  · 새 문구: ${meta.thumbnailHeadline.replace(/\n/g, ' / ')}${meta.thumbnailBadge2 ? ` · 배지 "${meta.thumbnailBadge2}"` : ''}`);

      await downloadDriveFile(mod.driveVideoId, videoPath, 1_000_000);
      const frames = await pickFrames(videoPath, path.join(outDir, `frames${ep.order}`), 10);
      console.log(`  · 배경 화면: ${Math.round(frames[0].atSec)}초 (${frames[0].detail})`);

      const accent = groupAccent(mod.moduleLabel, ep.order);
      for (const layout of ['screen', 'bare'] as const) {
        const tag = layout === 'screen' ? 'B' : 'C';
        const out = path.join(outDir, `${String(ep.order).padStart(2, '0')}_${ep.videoId}_${tag}.jpg`);
        await drawCourseThumbnail({
          framePath: frames[0].file,
          headline: meta.thumbnailHeadline,
          badge: meta.thumbnailBadge2 ?? '',
          strip: hook,
          presenterPath: layout === 'screen' ? PRESENTER_IMAGE_PATH : undefined,
          accent,
          layout,
          outPath: out,
        });
      }
      rows.push({ order: String(ep.order), videoId: ep.videoId, title: ep.title, headline: meta.thumbnailHeadline, badge: meta.thumbnailBadge2 ?? '' });
      console.log('  · 후보 2장 생성');
    } catch (e) {
      // 한 편이 막혀도 나머지는 만든다 — 열 편을 한 번에 뽑는 것이 이 스크립트의 목적이다.
      console.warn(`  · [${ep.order}] 실패(건너뜀): ${(e as Error).message}`);
    } finally {
      // ★영상은 바로 지운다★ 한 편이 100MB 라 열 편이면 1GB 다. 러너 디스크가 먼저 찬다.
      await fs.rm(videoPath, { force: true });
      await fs.rm(path.join(outDir, `frames${ep.order}`), { recursive: true, force: true });
    }
  }

  await fs.writeFile(path.join(outDir, 'index.json'), JSON.stringify(rows, null, 2), 'utf8');
  console.log(`\n✅ ${rows.length}편 × 2안 생성 → ${outDir}`);
  printUsage();
}

await runCourseThumbAb();
