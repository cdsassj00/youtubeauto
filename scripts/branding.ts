/**
 * 채널 브랜딩 적용 — 배너 · 워터마크 · 설명을 유튜브에 올린다.
 *
 * 왜 스크립트로 만드나:
 *   배너와 워터마크는 API 로 올릴 수 있는데도 매번 스튜디오에서 손으로 올리고 있었다.
 *   이미지가 저장소에 있으면 채널이 늘어나도 같은 방식으로 한 번에 적용된다.
 *
 * ★API 로 안 되는 것★
 *   프로필 사진(채널 아바타)은 YouTube Data API 에 해당 엔드포인트가 없다. 스튜디오에서
 *   직접 올려야 한다. 여기서 하지 않는 이유가 '빠뜨려서'가 아니라는 걸 남겨 둔다.
 *
 * 사용:
 *   TARGET_CHANNEL=ch2 npx tsx scripts/branding.ts            # 배너+워터마크
 *   TARGET_CHANNEL=ch2 BRAND_DESC_FILE=... npx tsx scripts/branding.ts   # 설명까지
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { config } from '../src/config.js';
import { createOAuthClient } from '../src/lib/youtube.js';

const ROOT = process.cwd();
const BANNER = process.env.BRAND_BANNER || path.join(ROOT, 'public/brand/banner.png');
const WATERMARK = process.env.BRAND_WATERMARK || path.join(ROOT, 'public/brand/watermark.png');

async function main() {
  const auth = createOAuthClient();
  const yt = google.youtube({ version: 'v3', auth });

  // ★어느 채널에 적용되는지 먼저 확인한다★
  // 전용 시크릿이 없으면 config 가 조용히 기본 채널로 폴백한다. 브랜딩은 덮어쓰기라
  // 잘못 적용되면 되돌리기가 번거롭다.
  const me = await yt.channels.list({ part: ['snippet', 'brandingSettings'], mine: true });
  const ch = me.data.items?.[0];
  if (!ch?.id) throw new Error('채널을 찾지 못했습니다. 자격증명을 확인하세요.');
  console.log('────────────────────────────────────────────');
  console.log(`적용 대상 채널 : ${ch.snippet?.title} (${ch.snippet?.customUrl || '핸들 없음'})`);
  console.log(`TARGET_CHANNEL : ${config.targetChannel}`);
  console.log('────────────────────────────────────────────');

  // ── 배너 ─────────────────────────────────────────────────────────────────
  // 두 단계다: 이미지를 올려 URL 을 받고(channelBanners.insert), 그 URL 을 채널에 건다.
  // 한 단계만 하면 아무 일도 일어나지 않는다.
  if (fs.existsSync(BANNER)) {
    const up = await yt.channelBanners.insert({
      media: { body: fs.createReadStream(BANNER) },
    });
    const url = up.data.url;
    if (!url) throw new Error('배너 업로드 응답에 url 이 없습니다.');
    await yt.channels.update({
      part: ['brandingSettings'],
      requestBody: {
        id: ch.id,
        brandingSettings: {
          ...ch.brandingSettings,
          image: { ...(ch.brandingSettings?.image || {}), bannerExternalUrl: url },
        },
      },
    });
    console.log(`✅ 배너 적용 (${(fs.statSync(BANNER).size / 1024).toFixed(0)}KB)`);
  } else {
    console.log(`· 배너 파일 없음 — 건너뜀 (${BANNER})`);
  }

  // ── 워터마크 ─────────────────────────────────────────────────────────────
  // 영상 오른쪽 아래에 계속 떠 있는 표식. timing 을 주지 않으면 영상 전체에 표시된다.
  if (fs.existsSync(WATERMARK)) {
    await yt.watermarks.set({
      channelId: ch.id,
      media: { body: fs.createReadStream(WATERMARK) },
      requestBody: {
        position: { type: 'corner', cornerPosition: 'bottomRight' },
        timing: { type: 'offsetFromStart', offsetMs: '0' },
      },
    });
    console.log(`✅ 워터마크 적용 (${(fs.statSync(WATERMARK).size / 1024).toFixed(0)}KB)`);
  } else {
    console.log(`· 워터마크 파일 없음 — 건너뜀 (${WATERMARK})`);
  }

  // ── 설명 (선택) ──────────────────────────────────────────────────────────
  const descFile = process.env.BRAND_DESC_FILE;
  if (descFile && fs.existsSync(descFile)) {
    const description = fs.readFileSync(descFile, 'utf8').trim();
    await yt.channels.update({
      part: ['brandingSettings'],
      requestBody: {
        id: ch.id,
        brandingSettings: {
          ...ch.brandingSettings,
          channel: { ...(ch.brandingSettings?.channel || {}), description },
        },
      },
    });
    console.log(`✅ 채널 설명 적용 (${description.length}자)`);
  }

  console.log('────────────────────────────────────────────');
  console.log('프로필 사진은 API 로 바꿀 수 없습니다 — 스튜디오에서 직접 올리세요.');
}

main().catch((e) => {
  const msg = String(e?.errors?.[0]?.message || e?.message || e);
  console.error('❌ 적용 실패:', msg);
  if (/quota/i.test(msg)) {
    console.error('할당량 초과입니다. channelBanners.insert 는 비용이 큰 편이라 하루에 여러 번 돌리지 마세요.');
  }
  process.exit(1);
});
