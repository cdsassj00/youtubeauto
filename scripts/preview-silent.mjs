// 무음 프리뷰 렌더 — 돈을 쓰지 않고 화면과 애니메이션만 확인한다.
//
// ★이게 없어서 빈 화면 다섯 개가 그대로 나갔다★ TTS 없이는 매니페스트를 만들 수
// 없어서, 유료 발행을 돌리기 전에는 완성 영상을 볼 방법이 아예 없었다. 나레이션
// 길이로 씬 시간을 추정하고 그만큼의 무음 트랙을 깔면 화면은 실제와 같이 움직인다.
// (오디오만 없다. 길이는 실제 TTS 와 몇 초 차이가 날 수 있다.)
//
//   npx tsx src/pipeline/run.ts --only=script   # 먼저 대본을 뽑고
//   node scripts/preview-silent.mjs             # 매니페스트 + 무음 트랙
//   REMOTION_SKIP_FONT_LOAD=1 npx remotion render src/remotion/index.ts Mixed \
//     out/preview.mp4 --props=out/manifest-preview.json --scale=0.5
import fs from 'node:fs/promises';
import path from 'node:path';

const FPS = 24;
const TAIL_PAD_FRAMES = 12;
const CHARS_PER_SEC = 320 / 60; // src/lib/stockScript.ts 와 같은 값
const SAMPLE_RATE = 8000; // 무음이라 품질이 필요 없다 — 파일만 작게

/** 지정한 길이의 무음 WAV. Remotion 은 확장자가 아니라 내용으로 디코딩한다. */
function silentWav(seconds) {
  const frames = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const data = frames * 2;
  const buf = Buffer.alloc(44 + data); // 나머지는 0 = 무음
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data, 40);
  return buf;
}

const script = JSON.parse(await fs.readFile('out/script.json', 'utf8'));
await fs.mkdir('public/audio', { recursive: true });

let startFrame = 0;
const scenes = [];
for (const scene of script.scenes) {
  const durationSec = Math.max(2, scene.narration.length / CHARS_PER_SEC);
  const durationInFrames = Math.ceil(durationSec * FPS) + TAIL_PAD_FRAMES;
  await fs.writeFile(path.join('public/audio', `${scene.id}.wav`), silentWav(durationSec));
  scenes.push({ ...scene, audioPath: `audio/${scene.id}.wav`, durationSec, startFrame, durationInFrames });
  startFrame += durationInFrames;
  console.log(`  · ${scene.id} — ${durationSec.toFixed(1)}s (${scene.engine ?? 'illustrated'}${scene.stock ? `/${scene.stock.kind}` : ''})`);
}

const manifest = {
  title: script.title,
  topic: script.topic ?? '',
  fps: FPS,
  width: 1920,
  height: 1080,
  totalDurationInFrames: startFrame,
  scenes,
  createdAt: new Date().toISOString(),
  theme: 'dark',
  // ★배경음악과 효과음은 끈다★ 없는 파일을 staticFile 로 참조하면 렌더가 통째로 죽는다.
  sfx: false,
};
await fs.writeFile('out/manifest-preview.json', JSON.stringify(manifest, null, 2));
const total = startFrame / FPS;
console.log(`\n무음 매니페스트: out/manifest-preview.json — 씬 ${scenes.length}개 · ${Math.floor(total / 60)}분 ${Math.round(total % 60)}초`);
