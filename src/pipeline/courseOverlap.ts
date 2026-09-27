/**
 * 드라이브 폴더의 강의가 채널에 이미 올라간 것과 겹치지 않는지 본다. 아무것도 바꾸지 않는다.
 *
 * ★왜 필요한가★ 중복 방지 장치는 자기 표식만 본다. course.ts 는 태그 `<코드>-<회차>` 나
 * 옛 제목 형식 "시리즈명 [N]" 으로 "이미 올린 회차"를 세는데, 시리즈를 새로 만들면 그
 * 코드로 올라간 것이 하나도 없으니 0편으로 읽고 1번부터 시작한다. 같은 강의를 예전에
 * 다른 시리즈 이름으로, 또는 손으로 올려 두었더라도 그것은 보이지 않는다.
 *
 * ★막지 않고 알려 준다★ 제목이 닮았다는 이유로 발행을 멈추면 28번 빠졌을 때처럼 시리즈가
 * 조용히 서 버린다. 같은 주제를 다른 과정에서 다시 찍은 것도 흔하다(환경부 1일차 M01 과
 * 강사양성 1일차 M09 는 둘 다 "LLM 이 답을 만드는 원리"지만 다른 녹화다). 그래서 이것은
 * 판정이 아니라 사람이 보고 결정할 목록이다.
 *
 * ★쿼터는 거의 안 쓴다★ 목록 읽기는 호출당 1 단위라 채널 전체를 훑어도 열몇 단위다.
 * 업로드 한 편이 1,600 인 것과 비교가 안 된다 — 발행 전에 마음껏 돌려도 된다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPublicFolder } from '../lib/driveFolder.js';
import { pairCourseFiles } from '../lib/courseFiles.js';
import { listRecentVideoTitles } from '../lib/youtube.js';
import { similarity } from '../lib/courseOverlap.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERIES_PATH = path.resolve(HERE, '../../assets/course/series.json');

interface SeriesCfg {
  name: string;
  folderId: string;
  code: string;
}

async function main(): Promise<void> {
  const cfg = JSON.parse(await fs.readFile(SERIES_PATH, 'utf8')) as { series: SeriesCfg[] };
  const only = (process.env.COURSE_ONLY ?? '').trim();
  const list = only ? cfg.series.filter((s) => s.code === only || s.name === only) : cfg.series;
  if (!list.length) throw new Error(`볼 시리즈가 없습니다 (COURSE_ONLY=${only}).`);

  const threshold = Number(process.env.OVERLAP_THRESHOLD ?? '') || 0.5;

  console.log('▶ 채널에 올라간 영상 제목을 읽습니다');
  const titles = await listRecentVideoTitles(Number(process.env.OVERLAP_SCAN ?? '') || 800);
  console.log(`  · 올라간 영상 ${titles.length}편`);

  let flagged = 0;
  for (const s of list) {
    const { pairs, skipped } = pairCourseFiles(await listPublicFolder(s.folderId));
    console.log(`\n════════ ${s.name} — 폴더 ${pairs.length}편${skipped.length ? ` (건너뜀 ${skipped.length})` : ''} ════════`);

    for (const p of pairs) {
      const best = titles
        .map((t) => ({ t, s: similarity(p.topic, t) }))
        .sort((x, y) => y.s - x.s)[0];
      if (!best || best.s < threshold) continue;
      flagged++;
      console.log(`  ${(best.s * 100).toFixed(0)}%  [${p.order}] ${p.moduleLabel} ${p.topic}`);
      console.log(`         이미 올라간 것 ↔ ${best.t}`);
    }
  }

  console.log(`\n────────────────`);
  if (!flagged) {
    console.log(`겹치는 것으로 의심되는 편이 없습니다 — 그대로 발행하면 됩니다.`);
  } else {
    console.log(`닮은 제목 ${flagged}건 — 위 목록을 사람이 보고 판단해야 합니다.`);
    console.log(`같은 주제를 다른 과정에서 다시 찍은 것이면 그대로 올리면 됩니다.`);
    console.log(`정말 같은 녹화면 그 파일을 폴더에서 빼거나 이름의 순번을 지워 두십시오`);
    console.log(`(순번이 없으면 발행 대상에서 빠집니다).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
