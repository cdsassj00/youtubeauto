/**
 * 한 번 실행에 여러 시리즈를 순서대로 올린다.
 *
 * ★"한 번에 다 올려"는 애초에 안 되는 요청이다★ 업로드 한 번에 1,600 단위가 나가고
 * 썸네일·재생목록까지 합치면 편당 1,700 쯤인데, YouTube Data API 하루 한도가 10,000 이다.
 * 다섯 편이 안전선이고 여섯 편째에서 막힌다. 그러니 몇 편까지 되는지를 코드가 알고
 * 멈춰 주는 편이 낫다 — budget 이 그 숫자다.
 *
 * ★남는 쿼터를 주식 채널에 남겨 둔다★ 같은 프로젝트를 쓰면 한도를 나눠 쓰므로, 강의가
 * 10,000 을 다 먹으면 그날 주식 영상이 통째로 안 나간다. budget 을 4 로 두면 강의가
 * 6,800 쯤 쓰고 3,200 이 남아 주식 두 편이 나간다.
 *
 * ★앞 시리즈를 먼저 비운다★ 목록 순서가 곧 우선순위다. 앞 시리즈가 끝나면(더 올릴 것이
 * 없거나 다음 회차 파일이 아직 없으면) 남은 몫으로 다음 시리즈를 잇는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishOne } from './course.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERIES_PATH = path.resolve(HERE, '../../assets/course/series.json');

interface SeriesCfg {
  name: string;
  folderId: string;
  code: string;
  courseName: string;
  seriesTitle: string;
  playlistTitle: string;
  numberStyle?: string;
  /** 썸네일 왼쪽 아래 고정 띠. 시리즈마다 다르다. */
  hook?: string;
}

async function main(): Promise<void> {
  const cfg = JSON.parse(await fs.readFile(SERIES_PATH, 'utf8')) as { budget?: number; series: SeriesCfg[] };
  const budget = Math.max(1, Number(process.env.COURSE_BUDGET ?? '') || cfg.budget || 4);
  const only = (process.env.COURSE_ONLY ?? '').trim();
  const list = only ? cfg.series.filter((s) => s.code === only || s.name === only) : cfg.series;
  if (!list.length) throw new Error(`올릴 시리즈가 없습니다 (COURSE_ONLY=${only}).`);

  console.log(`▶ 이번 실행 몫 ${budget}편 · 시리즈 ${list.map((s) => s.name).join(' → ')}`);

  let left = budget;
  const done: string[] = [];
  for (const s of list) {
    if (left <= 0) break;
    console.log(`\n════════ ${s.name} ════════`);
    // publishOne 은 환경변수로 설정을 읽는다. 시리즈마다 갈아 끼운다.
    process.env.COURSE_FOLDER_ID = s.folderId;
    process.env.COURSE_CODE = s.code;
    process.env.COURSE_NAME = s.courseName;
    process.env.SERIES_TITLE = s.seriesTitle;
    process.env.PLAYLIST_TITLE = s.playlistTitle;
    process.env.COURSE_AUTO = 'true';
    if (s.numberStyle) process.env.COURSE_NUMBER_STYLE = s.numberStyle;
    if (s.hook) process.env.COURSE_HOOK = s.hook;

    let n = 0;
    while (left > 0) {
      try {
        const r = await publishOne();
        // 'stop' 은 이 시리즈에 더 올릴 것이 없다는 뜻이다(다 했거나 다음 파일이 아직 없거나).
        if (r === 'stop') break;
        n++;
        left--;
      } catch (e) {
        const msg = (e as Error).message ?? '';
        if (/quota/i.test(msg)) {
          console.error(`\n⏭ 오늘 업로드 한도를 다 썼습니다 — 여기서 멈춥니다.`);
          console.error(`   ${msg.split('\n')[0]}`);
          console.error('   한도는 태평양시 자정(한국 시간 오후 4~5시)에 초기화됩니다.');
          left = 0;
          break;
        }
        // 한 편이 터져도 다음 시리즈는 시도한다 — 파일 하나 때문에 그날을 통째로 버리지 않는다.
        console.error(`  ✗ ${s.name} 한 편 실패(다음으로 넘어갑니다): ${msg.split('\n')[0]}`);
        break;
      }
    }
    if (n) done.push(`${s.name} ${n}편`);
    console.log(`  · ${s.name}: ${n}편 (남은 몫 ${left})`);
  }

  console.log(`\n──── 이번 실행: ${done.length ? done.join(' · ') : '올린 것 없음'} ────`);
}

main().catch((e) => {
  console.error('\n❌ 실패:', (e as Error).message);
  process.exit(1);
});
