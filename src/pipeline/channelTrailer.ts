/**
 * 쇼릴을 올려 채널 트레일러로 건다.
 *
 * ★"프로필 영상"은 트레일러다★ 유튜브에는 동영상 프로필 사진이 없다. 아바타는 이미지뿐이고
 * API 로 바꾸는 길도 없다. 영상으로 자기를 소개하는 자리는 채널 트레일러 하나 — 구독하지
 * 않은 사람이 채널 첫 화면에 들어왔을 때 자동 재생되는 영상이다.
 *
 * ★일부공개로 올린다★ 트레일러는 피드나 구독 알림에 뜰 이유가 없다. 공개로 올리면 그날
 * 강의 영상 자리를 차지하고 구독자에게 알림이 간다. 비공개는 아무에게도 안 보여서 트레일러
 * 구실을 못 한다 — 일부공개가 그 사이다.
 *
 * ★두 번 돌려도 하나만 남는다★ TRAILER_VIDEO_ID 로 이미 올려 둔 영상을 주면 새로 올리지
 * 않고 그것을 건다. 쇼릴을 고쳐 다시 올릴 때 예전 것을 손으로 지우게 하려고, 지우는 일은
 * 여기서 하지 않는다 — 조회수가 붙어 있을 수 있다.
 *
 * 드는 쿼터: 업로드 1,600 + 채널 설정 50. 이미 올린 영상을 걸기만 하면 50.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { uploadVideo, setChannelTrailer, apiErrorDetail } from '../lib/youtube.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k: string, d = '') => process.env[k]?.trim() || d;

async function main(): Promise<void> {
  const dry = env('DRY_RUN', 'true').toLowerCase() !== 'false';
  const existing = env('TRAILER_VIDEO_ID');
  const videoPath = path.resolve(HERE, '../../', env('TRAILER_VIDEO', 'assets/brand/showreel-15s.mp4'));
  const title = env('TRAILER_TITLE', '신성진 — AX 업무전환 쇼릴');
  const description = env(
    'TRAILER_DESC',
    [
      '12년간 현장에서 쌓은 것을 15초로 줄였습니다.',
      '',
      '이 채널은 AI를 업무에 실제로 쓰는 법을 다룹니다 — 개념 설명이 아니라,',
      '문서·데이터·반복 작업을 어떻게 줄였는지 그 과정을 그대로 보여 드립니다.',
    ].join('\n'),
  );

  console.log(`▶ 채널 트레일러 설정 · 채널 "${config.targetChannel}"${dry ? ' · 예행 모드' : ''}`);

  let videoId = existing;
  if (videoId) {
    console.log(`  · 이미 올라간 영상을 씁니다: https://youtu.be/${videoId}`);
  } else {
    if (!fs.existsSync(videoPath)) throw new Error(`쇼릴 파일이 없습니다: ${videoPath}`);
    const mb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
    console.log(`  · 올릴 파일: ${path.relative(process.cwd(), videoPath)} (${mb}MB)`);
    console.log(`  · 제목: ${title}`);
    console.log(`  · 공개 범위: ${config.youtubePrivacyStatus}`);
    if (config.youtubePrivacyStatus === 'private') {
      console.warn('  ⚠ 비공개로는 트레일러가 아무에게도 안 보입니다 — YOUTUBE_PRIVACY_STATUS=unlisted 로 두십시오.');
    }
    if (dry) {
      console.log('\n예행 모드라 올리지 않았습니다. DRY_RUN=false 로 실제 반영합니다.');
      return;
    }
    videoId = await uploadVideo({ videoPath, script: { title, description, tags: [] } });
    console.log(`  ✅ 업로드: https://youtu.be/${videoId}`);
  }

  if (dry) {
    console.log(`\n예행 모드라 트레일러를 걸지 않았습니다. DRY_RUN=false 로 실제 반영합니다.`);
    return;
  }

  try {
    const { channelId, before } = await setChannelTrailer(videoId);
    console.log(`  ✅ 트레일러 설정 완료 — 채널 ${channelId}`);
    if (before && before !== videoId) {
      console.log(`  · 전에 걸려 있던 것: https://youtu.be/${before} (지우지 않았습니다 — 필요하면 직접 정리하십시오)`);
    }
    console.log(`\n비구독자가 채널 첫 화면에 들어오면 이 영상이 자동 재생됩니다.`);
  } catch (e) {
    const msg = apiErrorDetail(e);
    if (/insufficient|permission|scope/i.test(msg)) {
      // ★여기서 막힐 수 있다★ channels.update 는 youtube 범위를 요구한다. 지금 리프레시
      // 토큰이 업로드 범위만 가지고 있으면 영상은 올라가고 트레일러만 안 걸린다.
      console.error(`\n✗ 트레일러를 거는 데 권한이 모자랍니다: ${msg.split('\n')[0]}`);
      console.error(`  영상은 올라갔습니다: https://youtu.be/${videoId}`);
      console.error(`  스튜디오 → 맞춤설정 → 레이아웃 → "비구독자 대상 채널 트레일러" 에서`);
      console.error(`  이 영상을 고르면 같은 결과가 됩니다(30초면 됩니다).`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
