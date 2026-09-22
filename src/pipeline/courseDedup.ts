/**
 * 같은 회차가 여러 번 올라간 것을 정리한다.
 *
 * ★왜 생겼나★ 한 번에 여러 편 올리도록 바꾸면서, 방금 올린 영상이 유튜브 업로드 목록에
 * 아직 안 뜨는 시차를 못 메웠다. 40번을 올리고 몇 초 뒤 "이미 올라간 회차: …, 39" 라는
 * 답을 받아 40번을 또 집었다. 그렇게 29~40번이 두 번씩 올라갔다.
 * (원인은 course.ts 의 justPublished 로 막았다. 이 스크립트는 이미 생긴 것을 치운다.)
 *
 * ★먼저 올린 것을 남긴다★ 조회수·시청 시간이 쌓여 있고 링크가 돌아다녔을 수 있다.
 * 나중 것이 제목이 더 나아 보여도, 남의 손에 있는 링크를 깨는 것보다 낫다.
 *
 * ★기본은 지우지 않고 비공개로 돌린다★ 지우면 되돌릴 수 없다. 비공개면 목록에서는
 * 사라지면서 원하면 되살릴 수 있다. 정말 지우려면 ACTION=delete 로 따로 지시한다.
 */
import { google } from 'googleapis';
import { createOAuthClient, listPublishedEpisodes } from '../lib/youtube.js';

const env = (k: string, d = '') => process.env[k]?.trim() || d;

export async function runCourseDedup(): Promise<void> {
  const seriesCode = env('COURSE_CODE', 'cdsa-ac');
  const action = env('ACTION', 'private').toLowerCase();
  const dry = env('DRY_RUN', 'true').toLowerCase() !== 'false';
  if (!['private', 'delete'].includes(action)) throw new Error(`ACTION 은 private 또는 delete 입니다 (받은 값: ${action}).`);

  const episodes = await listPublishedEpisodes(seriesCode);
  const byOrder = new Map<number, typeof episodes>();
  for (const ep of episodes) byOrder.set(ep.order, [...(byOrder.get(ep.order) ?? []), ep]);

  const dups = [...byOrder.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => a[0] - b[0]);

  console.log(`▶ ${seriesCode} · 올라간 영상 ${episodes.length}편 · 회차 ${byOrder.size}개`);
  if (!dups.length) {
    console.log('  · 중복 없음.');
    return;
  }

  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  let touched = 0;

  for (const [order, list] of dups) {
    // 먼저 올린 것이 남는다. publishedAt 이 빈 값이면 맨 뒤로 보내 실수로 남기지 않는다.
    const sorted = [...list].sort((a, b) => (a.publishedAt || '9999').localeCompare(b.publishedAt || '9999'));
    const keep = sorted[0];
    const drop = sorted.slice(1);
    console.log(`\n[${order}번] ${list.length}개`);
    console.log(`  남김: ${keep.publishedAt.slice(0, 16)} https://youtu.be/${keep.videoId}`);
    for (const d of drop) {
      console.log(`  ${action === 'delete' ? '삭제' : '비공개'}: ${d.publishedAt.slice(0, 16)} https://youtu.be/${d.videoId}  ${d.title.slice(0, 50)}`);
      if (dry) continue;
      if (action === 'delete') {
        await youtube.videos.delete({ id: d.videoId });
      } else {
        // ★status 만 보낸다★ snippet 을 같이 보내면 통째로 갈아끼우게 되어 빠뜨린 필드가 지워진다.
        await youtube.videos.update({ part: ['status'], requestBody: { id: d.videoId, status: { privacyStatus: 'private' } } });
      }
      touched++;
    }
  }

  console.log(
    dry
      ? `\n예행 모드라 아무것도 바꾸지 않았습니다. 중복 ${dups.length}개 회차. DRY_RUN=false 로 실제 반영합니다.`
      : `\n✅ ${touched}편 ${action === 'delete' ? '삭제' : '비공개 전환'} (중복 ${dups.length}개 회차)`,
  );
}

await runCourseDedup();
