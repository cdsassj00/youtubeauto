/**
 * 이미 올라간 강의를 시리즈별 재생목록에 회차 순서대로 정리한다.
 *
 * ★재생목록이 순서를 알려 주는 자리다★ 시리즈를 번갈아 올리면 채널 앞면의 순서는 뒤섞인다.
 * 앞으로 올라갈 편은 회차 번호를 자리 번호로 써서 제 자리에 꽂히지만(course.ts), 이미
 * 올라간 편들은 올린 순서대로 쌓여 있거나 아예 재생목록에 없을 수 있다. 그쪽을 맞춘다.
 *
 * ★영상을 건드리지 않는다★ 제목·설명·조회수·링크는 그대로다. 재생목록 항목만 넣고 옮긴다.
 *
 * ★쿼터가 실제로 든다★ 넣기·옮기기가 각 50 단위다. 업로드 한 편(1,700)만큼 쓰려면 34번을
 * 손대야 하는 셈이지만, 43편을 한 번에 정리하면 2,150 이라 그날 발행 몫을 밀어낸다.
 * 그래서 한 번에 손대는 수를 PLAYLIST_BUDGET 으로 묶고, 남으면 다음에 이어서 한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import {
  ensurePlaylist,
  addToPlaylist,
  listPlaylistItems,
  movePlaylistItem,
  listPublishedEpisodes,
  apiErrorDetail,
} from '../lib/youtube.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERIES_PATH = path.resolve(HERE, '../../assets/course/series.json');

interface SeriesCfg {
  name: string;
  code: string;
  courseName: string;
  playlistTitle: string;
}

const env = (k: string, d = '') => process.env[k]?.trim() || d;

async function main(): Promise<void> {
  const cfg = JSON.parse(await fs.readFile(SERIES_PATH, 'utf8')) as { series: SeriesCfg[] };
  const only = env('COURSE_ONLY');
  const list = only ? cfg.series.filter((s) => s.code === only || s.name === only) : cfg.series;
  if (!list.length) throw new Error(`정리할 시리즈가 없습니다 (COURSE_ONLY=${only}).`);

  const dry = env('DRY_RUN', 'true').toLowerCase() !== 'false';
  let budget = Math.max(1, Number(env('PLAYLIST_BUDGET', '40')));

  console.log(`▶ 재생목록 정리${dry ? ' · 예행 모드' : ''} · 이번에 손댈 수 있는 항목 ${budget}개 (${budget * 50} 쿼터)`);

  let touched = 0;
  let left = 0;
  for (const s of list) {
    const episodes = (await listPublishedEpisodes(s.code)).slice().sort((a, b) => a.order - b.order);
    if (!episodes.length) {
      console.log(`\n════════ ${s.name} — 올라간 편이 없습니다 ════════`);
      continue;
    }
    const playlistId = await ensurePlaylist({
      title: s.playlistTitle,
      description: `${s.courseName} 모듈 강의`,
      privacyStatus:
        config.youtubePrivacyStatus === 'private' ? 'unlisted' : (config.youtubePrivacyStatus as 'public' | 'unlisted'),
    });
    const items = await listPlaylistItems(playlistId);
    const byVideo = new Map(items.map((i) => [i.videoId, i]));
    // ★넣거나 옮기면 다른 항목의 자리가 밀린다★ 처음 읽은 자리 번호를 그대로 믿고 "이미
    // 맞다"고 건너뛰면, 앞에서 한 번 손댄 뒤로는 그 판단이 전부 틀어진다. 지금 순서를
    // 손안에 들고 매번 같이 고친다.
    const current = items.map((i) => i.videoId);

    console.log(`\n════════ ${s.name} — 올라간 편 ${episodes.length} · 재생목록 ${items.length} ════════`);

    // ★자리 번호는 회차가 아니라 "있는 편들 중 몇 번째"로 준다★ 회차 번호를 그대로 쓰면
    // 빠진 회차만큼 빈 자리를 요구하게 되는데, 유튜브는 목록 길이를 넘는 값을 맨 뒤로
    // 맞춰 버린다. 그러면 앞쪽을 맞추는 동안 뒤쪽이 계속 밀려 끝이 안 난다.
    let slot = 0;
    for (const ep of episodes) {
      const want = slot++;
      const at = current.indexOf(ep.videoId);
      const what = at < 0 ? '넣기' : at !== want ? `옮기기 ${at + 1}→${want + 1}` : '';
      if (!what) continue;

      if (budget <= 0) {
        left++;
        continue;
      }
      console.log(`  · [${ep.order}] ${what} — ${ep.title.slice(0, 50)}`);
      if (!dry) {
        const cur = byVideo.get(ep.videoId);
        try {
          if (at < 0) await addToPlaylist(playlistId, ep.videoId, want);
          else if (cur) await movePlaylistItem({ itemId: cur.itemId, playlistId, videoId: ep.videoId, position: want });
        } catch (e) {
          const msg = apiErrorDetail(e);
          if (/quota/i.test(msg)) {
            console.error(`\n⏭ 오늘 쿼터를 다 썼습니다 — 여기서 멈춥니다. 내일 다시 돌리면 이어서 합니다.`);
            console.error(`   ${msg.split('\n')[0]}`);
            budget = 0;
            left++;
            continue;
          }
          console.warn(`    ✗ 실패(건너뜁니다): ${msg.split('\n')[0]}`);
          continue;
        }
      }
      // 예행 모드에서도 같이 고친다 — 안 그러면 "손댈 것"이 실제보다 많게 세어진다.
      if (at >= 0) current.splice(at, 1);
      current.splice(want, 0, ep.videoId);
      budget--;
      touched++;
    }
  }

  console.log(`\n────────────────`);
  if (dry) console.log(`예행 모드라 아무것도 바꾸지 않았습니다. 손댈 것 ${touched}개. DRY_RUN=false 로 실제 반영합니다.`);
  else console.log(`✅ ${touched}개 반영 (${touched * 50} 쿼터)`);
  if (left) console.log(`남은 것 ${left}개 — 이번 몫을 다 써서 못 했습니다. 한 번 더 돌리면 이어서 합니다.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
