// 채널의 최근 업로드 상태를 그대로 찍어 본다. 발행이 늦거나 실패한 게 있는지
// 눈으로 확인하려고 만든 일회성 진단 스크립트 — 아무것도 바꾸지 않는다(읽기 전용).
//
//   npx tsx scripts/check-video-status.mjs            # 최근 10개
//   COUNT=20 npx tsx scripts/check-video-status.mjs    # 최근 20개
import { google } from 'googleapis';
import { createOAuthClient } from '../src/lib/youtube.js';

const count = Number(process.env.COUNT || 10);

async function main() {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const ch = await youtube.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('채널의 업로드 재생목록을 찾지 못했습니다.');

  const pl = await youtube.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: count });
  const ids = (pl.data.items ?? []).map((it) => it.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) {
    console.log('업로드된 영상이 없습니다.');
    return;
  }

  const res = await youtube.videos.list({ part: ['snippet', 'status', 'processingDetails'], id: ids });
  console.log(`▶ 최근 ${res.data.items?.length ?? 0}개\n`);
  for (const v of res.data.items ?? []) {
    const s = v.snippet;
    const st = v.status;
    const pd = v.processingDetails;
    console.log(`[${v.id}] ${s?.title}`);
    console.log(`  게시일: ${s?.publishedAt}`);
    console.log(`  공개 상태: ${st?.privacyStatus} / 업로드 상태: ${st?.uploadStatus}${st?.failureReason ? ` (실패 사유: ${st.failureReason})` : ''}${st?.rejectionReason ? ` (거부 사유: ${st.rejectionReason})` : ''}`);
    console.log(`  처리 상태: ${pd?.processingStatus ?? '(없음)'}${pd?.processingFailureReason ? ` (실패 사유: ${pd.processingFailureReason})` : ''}`);
    if (pd?.processingProgress) {
      console.log(`  처리 진행률: ${JSON.stringify(pd.processingProgress)}`);
    }
    console.log(`  https://youtu.be/${v.id}`);
    console.log();
  }
}

main().catch((e) => {
  console.error('\n❌ 실패:', e.message ?? e);
  process.exit(1);
});
