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
import { listPublishedEpisodes, setThumbnail } from '../lib/youtube.js';
import { generateCourseMeta } from '../lib/courseMeta.js';
import { pickFrames } from '../lib/courseFrames.js';
import { drawCourseThumbnail } from '../lib/courseThumbnail.js';
import { groupAccent } from '../lib/seriesStrip.js';
import { printUsage } from '../lib/usage.js';

const env = (k: string, d = '') => process.env[k]?.trim() || d;

/**
 * 새 규칙을 지킨 문구인지 본다. 어긴 것은 채널에 걸지 않는다.
 *
 * ★열 편을 한 번에 갈아끼우는 작업이라 확인 없이 나가면 안 된다★ 지금까지 나쁜 문구가
 * 나온 이유가 프롬프트였고 그것을 고쳤지만, 모델이 매번 지킨다는 보장은 없다. 규칙을
 * 어긴 회차는 그림만 만들어 두고 걸지 않은 채 표에 이유를 적는다 — 사람이 보고 정한다.
 */
// ★"AI" 는 일부러 뺐다★ 넣으면 "세 줄이면 AI가 안다" 같은 문구가 통과해 버린다. 그건
// 무엇을 아는지가 없어서 지금 문제가 된 바로 그 형태다. 도구 이름이나 일상 사물처럼
// 보는 순간 무엇인지 아는 말만 센다.
const CONCRETE = [
  '엑셀', 'CSV', '시트', 'ChatGPT', '챗GPT', '클로드', 'Claude', '크롬', '브라우저', '파이썬',
  'API', '주피터', '노션', '깃허브', '유튜브', '슬랙', '구글', '피그마', '커서', 'VS코드',
  '터미널', '코드', '표', '사진', '이미지', '영상', '파일', '사이트', '앱', '데이터베이스',
  // 도구 이름이 아니어도 상황이 그려지는 말들 — "인터넷 막힌 회사에서" 같은 문구를 살린다.
  '인터넷', '회사', '폰', '휴대폰', '메일', '문서', '보고서', '발표', '워드', '한글',
  '폴더', '링크', '계정', '비밀번호', '서버', '컴퓨터', '노트북', '화면',
];

function headlineProblem(h: string): string | null {
  const lines = h.split('\n').map((l) => l.replace(/\*\*/g, '').trim()).filter(Boolean);
  if (!lines.length) return '문구가 비었습니다';
  if (lines.length > 2) return `${lines.length}줄입니다(두 줄까지)`;
  const tooLong = lines.find((l) => [...l].length > 11);
  if (tooLong) return `한 줄이 깁니다: "${tooLong}"`;
  const flat = lines.join(' ');
  const hasNumber = /\d/.test(flat);
  const hasName = CONCRETE.some((w) => flat.toLowerCase().includes(w.toLowerCase()));
  if (!hasNumber && !hasName) return '아는 이름도 숫자도 없습니다';
  if (/(뭔데|무엇인가|이란|란\?|왜 .*인가)/.test(flat)) return '개념 질문입니다';
  return null;
}


export async function runCourseThumbAb(): Promise<void> {
  const seriesCode = env('COURSE_CODE', 'cdsa-ac');
  const courseName = env('COURSE_NAME', 'AI챔피언 강사양성과정');
  const hook = env('COURSE_HOOK', '돈 주고도 못 듣는 강의');
  const limit = Number(env('AB_LIMIT', '10')) || 10;
  /**
   * 만든 것을 실제로 채널에 걸지.
   *
   * ★split 이 이 시리즈에 맞는 A/B 다★ 유튜브 스튜디오의 "테스트 및 비교"는 한 영상에
   * 여러 장을 걸어 같은 조건에서 겨루게 해 주지만, 데이터 API 로는 만들 수 없어 사람이
   * 스무 장을 손으로 올려야 한다. 대신 열 편을 반으로 갈라 홀수 회차에 B, 짝수 회차에
   * C 를 걸면 손 하나 안 대고 두 방식의 클릭률을 비교할 수 있다. 편마다 내용이 달라
   * 정밀도는 떨어지지만, 지금 필요한 것은 "화면 배경이 통하나 / 인물이 필요한가" 라는
   * 큰 방향이라 이것으로 충분하다.
   */
  const apply = env('AB_APPLY', 'none').toLowerCase();
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
      // ★거는 것은 한 장뿐이다★ 두 장을 잇달아 걸면 나중 것만 남고 앞 것은 흔적도 없다.
      const bad = headlineProblem(meta.thumbnailHeadline);
      if (bad) console.warn(`  · 문구가 규칙을 어겼습니다 — ${bad} (걸지 않고 그림만 둡니다)`);
      const chosen = bad
        ? ''
        : apply === 'split'
          ? ep.order % 2 === 1
            ? 'B'
            : 'C'
          : apply === 'b'
            ? 'B'
            : apply === 'c'
              ? 'C'
              : '';
      if (chosen) {
        const file = path.join(outDir, `${String(ep.order).padStart(2, '0')}_${ep.videoId}_${chosen}.jpg`);
        await setThumbnail(ep.videoId, file);
        console.log(`  · 채널에 ${chosen} 안을 걸었습니다`);
      }
      rows.push({
        order: String(ep.order),
        videoId: ep.videoId,
        title: ep.title,
        headline: meta.thumbnailHeadline,
        badge: meta.thumbnailBadge2 ?? '',
        applied: chosen || (bad ? `보류 — ${bad}` : '(걸지 않음)'),
      });
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
  const applied = rows.filter((r) => r.applied === 'B' || r.applied === 'C');
  console.log(`\n✅ ${rows.length}편 × 2안 생성 → ${outDir}`);
  if (applied.length) {
    const b = applied.filter((r) => r.applied === 'B').map((r) => r.order);
    const c = applied.filter((r) => r.applied === 'C').map((r) => r.order);
    console.log(`   채널 반영: B(화면+인물) ${b.join(', ') || '없음'} / C(화면만) ${c.join(', ') || '없음'}`);
  }
  printUsage();
}

await runCourseThumbAb();
