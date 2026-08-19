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
import { config } from '../config.js';

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const num = (v: unknown) => Number(v ?? 0).toLocaleString();

interface Row {
  id: string;
  title: string;
  at: string;
  days: number;
  views: number;
  likes: number;
  comments: number;
}

async function main(): Promise<void> {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const ch = await youtube.channels.list({ part: ['contentDetails', 'statistics', 'snippet'], mine: true });
  const me = ch.data.items?.[0];
  const uploads = me?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('업로드 재생목록을 찾지 못했습니다.');
  // ★어느 채널을 읽었는지 먼저 찍는다★ 요청한 채널과 실제로 읽힌 채널이 다를 수 있는데
  // (자격증명이 기본값으로 폴백되면 그렇게 된다) 제목만 봐서는 알아채기 어렵다. 나란히 둔다.
  console.log(`■ 채널: ${me?.snippet?.title}  (요청: ${config.targetChannel})`);
  console.log(`  구독자 ${num(me?.statistics?.subscriberCount)} · 총 조회수 ${num(me?.statistics?.viewCount)} · 영상 ${num(me?.statistics?.videoCount)}개\n`);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await youtube.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    for (const it of r.data.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);

  const rows: Row[] = [];
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

  await analytics(auth, rows);
}

/**
 * 시청 지표를 읽는다.
 *
 * ★조회수만으로는 무엇을 고칠지 못 정한다★ 조회수가 낮은 이유는 둘인데 처방이 정반대다.
 *   유튜브가 안 뿌린다        → 주제·채널 문제 (썸네일을 아무리 고쳐도 안 바뀐다)
 *   뿌리는데 안 눌린다/안 본다 → 썸네일·제목·도입부 문제
 * 노출수와 클릭률 자체는 API 에 없다(스튜디오 전용 지표다). 대신 유입 경로 분포와
 * 평균 시청 지속률로 같은 갈림길을 판별할 수 있다. 탐색/추천 유입이 거의 없으면 첫 번째,
 * 유입은 있는데 지속률이 낮으면 두 번째다.
 */
async function analytics(auth: ReturnType<typeof createOAuthClient>, rows: Row[]): Promise<void> {
  const ya = google.youtubeAnalytics({ version: 'v2', auth });
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const titleOf = new Map(rows.map((r) => [r.id, r.title]));

  // ★한 조회가 막혀도 나머지는 보여 준다★ 예전에 Analytics 가 통째로 try 하나에 묶여 있어서
  // 뒤쪽 조회 하나가 실패하면 앞의 성공한 숫자까지 같이 사라졌다. 구간마다 따로 감싼다.
  const section = async (title: string, opts: Record<string, unknown>, label?: (k: string) => string): Promise<string[]> => {
    console.log(`\n■ ${title}`);
    const keys: string[] = [];
    try {
      const res = await ya.reports.query({ ids: 'channel==MINE', startDate: start, endDate: end, ...opts } as never);
      console.log(`  ${(res.data.columnHeaders ?? []).map((h) => h.name).join(' · ')}`);
      for (const row of res.data.rows ?? []) {
        const cells = [...row];
        keys.push(String(cells[0]));
        if (label) cells[0] = `${cells[0]}  ${pad(label(String(cells[0])), 38)}`;
        console.log(`  ${cells.join('  ')}`);
      }
      if (!res.data.rows?.length) console.log('  (데이터 없음)');
    } catch (e) {
      const detail = apiErrorDetail(e);
      console.log(`  ✗ 읽지 못했습니다: ${detail}`);
      if (detail.includes('accessNotConfigured')) {
        console.log('  → 구글 클라우드 프로젝트에서 YouTube Analytics API 가 꺼져 있습니다. 콘솔에서 켜면 됩니다(재인증 아님).');
      } else if (/insufficient|Scope|forbidden/i.test(detail)) {
        console.log('  → 지금 토큰에 yt-analytics.readonly 가 없습니다. 재인증하면 열립니다.');
      }
    }
    return keys;
  };

  const perf = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage';

  await section('90일 상위 영상 (조회수순)', { metrics: perf, dimensions: 'video', sort: '-views', maxResults: 25 }, (k) => titleOf.get(k) ?? '');

  // 최근 올린 것들만 따로 본다. 상위 25위 안에 못 들어서 위 표에는 안 나오는데, 정작
  // 지금 판단해야 하는 건 이것들이다.
  const recent = rows.slice(0, 20).map((r) => r.id).filter(Boolean);
  if (recent.length) {
    const got = await section(
      `최근 업로드 ${recent.length}개 (90일 기준)`,
      { metrics: perf, dimensions: 'video', filters: `video==${recent.join(',')}`, sort: '-views', maxResults: 50 },
      (k) => titleOf.get(k) ?? '',
    );
    // ★없는 줄을 조용히 넘기면 "0회"로 오해한다★ Analytics 는 며칠 늦게 집계돼서 갓 올린
    // 영상은 아직 행이 없다. 조회수는 이미 찍히고 있으므로, 빠졌다는 사실을 적어 둔다.
    const missing = recent.filter((id) => !got.includes(id));
    if (missing.length) {
      console.log(`\n  ※ 아래 ${missing.length}개는 아직 Analytics 집계 전입니다(보통 2~3일 걸림). 조회수 자체는 위 표에 이미 있습니다.`);
      for (const id of missing) console.log(`     ${id}  ${titleOf.get(id) ?? ''}`);
    }
    await section('최근 업로드의 유입 경로', {
      metrics: 'views',
      dimensions: 'insightTrafficSourceType',
      filters: `video==${recent.join(',')}`,
      sort: '-views',
    });
  }

  await section('채널 전체 유입 경로 (90일)', { metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' });

  // ★범례를 직접 확인하고 고쳤다★ 처음에 BROWSE_FEATURES·SUGGESTED 라고 적었는데 그런
  // 값은 이 API 에 없다. 스튜디오의 "탐색 기능"은 SUBSCRIBER 로, "추천 동영상"은
  // RELATED_VIDEO 로 나온다. 범례가 틀리면 숫자를 정반대로 읽게 된다.
  console.log('\n  ※ 노출수(impressions)·클릭률은 Analytics API 에 아예 없는 지표다 — 스튜디오 화면에서만 본다.');
  console.log('     유입 경로 범례: SUBSCRIBER=홈·구독 피드(스튜디오의 "탐색 기능") · RELATED_VIDEO=추천 동영상');
  console.log('                     YT_SEARCH=유튜브 검색 · YT_CHANNEL=채널 페이지 · EXT_URL=외부 사이트 · NO_LINK_OTHER=직접 유입');
}

main().catch((e) => {
  console.error('\n❌ 실패:', apiErrorDetail(e));
  process.exit(1);
});
