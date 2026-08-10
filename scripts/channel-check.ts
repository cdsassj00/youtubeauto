/**
 * 업로드 대상 채널 점검 — 돈이 들지 않는 확인용.
 *
 * 왜 필요한가:
 *   config.ts 는 TARGET_CHANNEL=ch2 일 때 YOUTUBE_REFRESH_TOKEN_CH2 를 찾다가 없으면
 *   ★에러 없이★ 기본 토큰으로 폴백한다(chRequired). 채널을 여러 개 쓰기 좋으라고 그렇게
 *   뒀는데, 뒤집어 말하면 시크릿 이름을 하나 틀려도 아무 경고 없이 1번 채널로 올라간다.
 *   유료로 영상을 다 만들고 업로드까지 끝난 뒤에야 알게 되고, 그때는 이미 남의 채널에
 *   영상이 올라가 있다.
 *
 *   그래서 발행 전에 "이 자격증명이 실제로 어느 채널을 여는가"를 한 번 물어본다.
 *   channels.list(mine) 한 번이면 끝이고 할당량도 1 units 다.
 *
 * 사용: TARGET_CHANNEL=ch2 npx tsx scripts/channel-check.ts
 */
import { google } from 'googleapis';
import { config } from '../src/config.js';
import { createOAuthClient } from '../src/lib/youtube.js';

async function main() {
  const target = config.targetChannel;
  const suffix = target && target !== 'default' ? `_${target.toUpperCase().replace(/[^A-Z0-9]/g, '')}` : '';

  console.log('────────────────────────────────────────────');
  console.log(`TARGET_CHANNEL = ${target}`);

  // ★폴백이 일어났는지 먼저 알려준다★
  // 채널 이름만 찍으면 "왜 1번 채널이 나오지"에서 다시 막힌다. 전용 시크릿이 실제로
  // 있었는지를 함께 보여주면 원인이 바로 드러난다(값은 절대 찍지 않는다).
  if (suffix) {
    const own = Boolean(process.env[`YOUTUBE_REFRESH_TOKEN${suffix}`]?.trim());
    console.log(`YOUTUBE_REFRESH_TOKEN${suffix} : ${own ? '있음' : '없음 → 기본 토큰으로 폴백됨'}`);
    if (!own) {
      console.log('⚠ 전용 토큰이 없어 기본 채널 자격증명으로 동작합니다. 이대로 올리면 1번 채널로 갑니다.');
    }
    const cid = Boolean(process.env[`YOUTUBE_CLIENT_ID${suffix}`]?.trim());
    console.log(`YOUTUBE_CLIENT_ID${suffix}     : ${cid ? '있음' : '없음 → 기본 클라이언트 사용'}`);
  }

  const auth = createOAuthClient();
  const yt = google.youtube({ version: 'v3', auth });
  const me = await yt.channels.list({ part: ['snippet', 'statistics'], mine: true });
  const ch = me.data.items?.[0];
  if (!ch) {
    console.error('❌ 채널을 찾지 못했습니다. 토큰이 유튜브 채널에 연결돼 있지 않습니다.');
    process.exit(1);
  }

  const title = ch.snippet?.title || '(제목 없음)';
  const handle = ch.snippet?.customUrl || '(핸들 없음)';
  console.log('────────────────────────────────────────────');
  console.log(`✅ 이 자격증명이 여는 채널 : ${title}`);
  console.log(`   핸들                   : ${handle}`);
  console.log(`   구독자                 : ${ch.statistics?.subscriberCount ?? '-'}`);
  console.log(`   영상 수                : ${ch.statistics?.videoCount ?? '-'}`);
  console.log('────────────────────────────────────────────');
  console.log('   → 발행하려는 채널이 맞는지 확인하세요.');

  // 워크플로가 아티팩트 이름과 요약에 쓸 수 있게 파일로도 남긴다.
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('node:fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${title}\nhandle=${handle}\n`);
  }
}

main().catch((e) => {
  // invalid_grant 는 원인이 갈리므로 짚어 준다 — 실제로 여기서 한 번 막힌다.
  const msg = String(e?.message || e);
  console.error('❌ 확인 실패:', msg);
  if (/invalid_grant/i.test(msg)) {
    console.error(
      '\ninvalid_grant 는 보통 셋 중 하나입니다:\n' +
        '  1) refresh token 을 발급한 OAuth 클라이언트와 지금 쓰는 클라이언트가 다르다\n' +
        '     → 토큰을 웹 클라이언트로 받았다면 YOUTUBE_CLIENT_ID/SECRET 도 같은 것으로 맞춰야 한다\n' +
        '  2) OAuth 동의 화면이 "테스트" 상태다 → 토큰이 7일 만에 만료된다. "프로덕션"으로 게시할 것\n' +
        '  3) 구글 계정에서 앱 권한을 해제했다 → 토큰을 다시 발급받아야 한다',
    );
  }
  process.exit(1);
});
