/**
 * 채널 영상들의 숫자를 뽑는다.
 *
 * ★두 종류의 숫자가 있고, 권한이 다르다★
 *  · 조회수·좋아요·댓글 (Data API, statistics) — 지금 토큰으로 바로 읽힌다.
 *  · 노출수·클릭률·평균 시청 지속 (Analytics API) — yt-analytics.readonly 가 필요하다.
 *
 * 진단에는 두 번째가 훨씬 중요하다. 조회수가 낮을 때 원인은 둘 중 하나인데 이 둘의
 * 처방이 정반대이기 때문이다.
 *   노출은 나오는데 클릭률이 낮다  → 썸네일·제목 문제
 *   노출 자체가 안 뜬다            → 주제·카테고리·채널 신뢰도 문제
 * 조회수만 보면 이 둘을 구분할 수 없다. 그래서 권한이 없으면 "없다"고 분명히 말한다.
 */
import { google } from 'googleapis';
import { createOAuthClient, apiErrorDetail } from '../lib/youtube.js';

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const num = (v: unknown) => Number(v ?? 0).toLocaleString();

async function main(): Promise<void> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const ch = await youtube.channels.list({ part: ['contentDetails', 'statistics', 'snippet'], mine: true });
  const me = ch.data.items?.[0];
  const uploads = me?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('업로드 재생목록을 찾지 못했습니다.');
  console.log(`■ 채널: ${me?.snippet?.title}`);
  console.log(`  구독자 ${num(me?.statistics?.subscriberCount)} · 총 조회수 ${num(me?.statistics?.viewCount)} · 영상 ${num(me?.statistics?.videoCount)}개\n`);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await youtube.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    for (const it of r.data.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);

  const rows: Array<{ id: string; title: string; at: string; days: number; views: number; likes: number; comments: number }> = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await youtube.videos.list({ part: ['snippet', 'statistics'], id: ids.slice(i, i + 50) });
    for (const v of r.data.items ?? []) {
      const at = v.snippet?.publishedAt ?? '';
      const days = at ? Math.max(1, (Date.now() - new Date(at).getTime()) / 86400000) : 1;
      rows.push({
        id: v.id ?? '', title: v.snippet?.title ?? '', at: at.slice(0, 10), days,
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
      });
    }
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));

  console.log(`■ 영상별 (최신순, ${rows.length}개)`);
  console.log(`  ${pad('게시일', 11)}${pad('제목', 42)}${'조회'.padStart(7)}${'하루평균'.padStart(9)}${'좋아요'.padStart(7)}${'댓글'.padStart(6)}`);
  for (const r of rows) {
    console.log(`  ${pad(r.at, 11)}${pad(r.title, 42)}${String(r.views).padStart(7)}${(r.views / r.days).toFixed(1).padStart(9)}${String(r.likes).padStart(7)}${String(r.comments).padStart(6)}`);
  }

  // ── 노출수·클릭률 ────────────────────────────────────────────────
  console.log('\n■ 노출수 · 클릭률 (진단에 꼭 필요한 숫자)');
  try {
    const ya = google.youtubeAnalytics({ version: 'v2', auth });
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const res = await ya.reports.query({
      ids: 'channel==MINE',
      startDate: start,
      endDate: end,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
      dimensions: 'video',
      sort: '-views',
      maxResults: 25,
    });
    const head = (res.data.columnHeaders ?? []).map((h) => h.name);
    console.log(`  ${head.join(' · ')}`);
    for (const row of res.data.rows ?? []) console.log(`  ${row.join('  ')}`);
    console.log('\n  ※ 노출수(impressions)와 클릭률은 Analytics 의 별도 지표군이라 위 조회로는 안 나온다.');
    console.log('     스튜디오 화면에는 있지만 API 로는 콘텐츠 소유자 권한이 필요하다.');
  } catch (e) {
    console.log(`  ✗ 읽지 못했습니다: ${apiErrorDetail(e)}`);
    console.log('  → 지금 토큰에는 yt-analytics.readonly 권한이 없습니다. 재인증하면 열립니다.');
  }
}

main().catch((e) => {
  console.error('\n❌ 실패:', apiErrorDetail(e));
  process.exit(1);
});
