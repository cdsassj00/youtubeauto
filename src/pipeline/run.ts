import fs from 'node:fs/promises';
import {
  config,
  resolveTopicMode,
  OUT_DIR,
  AUDIO_DIR,
  SCRIPT_PATH,
  MANIFEST_PATH,
  VIDEO_PATH,
  THUMBNAIL_PATH,
  FPS,
  WIDTH,
  HEIGHT,
  audioStaticPath,
} from '../config.js';
import { ScriptSchema, type Script, type RenderManifest, type SceneWithAudio } from '../schema.js';
import { generateScript } from '../lib/anthropic.js';
import { synthesizeSpeech } from '../lib/elevenlabs.js';
import { generateBgm } from '../lib/bgm.js';
import { renderVideo } from '../lib/render.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { uploadVideo } from '../lib/youtube.js';

type Step = 'script' | 'voice' | 'render' | 'upload' | 'thumbnail';

const TAIL_PAD_FRAMES = 18; // 각 씬 끝 여백(약 0.6초)

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, 'utf8')) as T;
}
async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

/** 1) 대본 생성 */
async function stepScript(): Promise<Script> {
  const mode = resolveTopicMode();
  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // 최근 제목(중복 회피) — 파일이 있으면 사용.
  let recentTitles: string[] = [];
  try {
    const hist = await readJson<{ titles: string[] }>(`${OUT_DIR}/history.json`);
    recentTitles = hist.titles.slice(-20);
  } catch {
    /* 없으면 무시 */
  }

  const topicLabel = config.customTopic ? `주제="${config.customTopic}"` : `모드=${mode}`;
  console.log(`▶ [1/4] 대본 생성 (${topicLabel}, ${config.targetMinutes}분)`);
  const script = await generateScript({
    mode,
    targetMinutes: config.targetMinutes,
    language: config.contentLanguage,
    dateLabel,
    recentTitles,
    customTopic: config.customTopic || undefined,
  });

  await writeJson(SCRIPT_PATH, script);
  await writeJson(`${OUT_DIR}/history.json`, {
    titles: [...recentTitles, script.title],
  });
  console.log(`  · 제목: ${script.title}`);
  console.log(`  · 씬 수: ${script.scenes.length}`);
  return script;
}

/** 2) 나레이션(TTS) 생성 + 렌더 매니페스트 작성 */
async function stepVoice(): Promise<RenderManifest> {
  const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
  console.log(`▶ [2/4] 나레이션 생성 (${script.scenes.length}개 씬)`);

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  const scenes: SceneWithAudio[] = [];
  let startFrame = 0;
  for (const [i, scene] of script.scenes.entries()) {
    const outPath = `${AUDIO_DIR}/${scene.id}.mp3`;
    const { durationSec } = await synthesizeSpeech({ text: scene.narration, outPath });
    const durationInFrames = Math.ceil(durationSec * FPS) + TAIL_PAD_FRAMES;
    scenes.push({
      ...scene,
      audioPath: audioStaticPath(scene.id),
      durationSec,
      startFrame,
      durationInFrames,
    });
    startFrame += durationInFrames;
    console.log(`  · (${i + 1}/${script.scenes.length}) ${scene.id} — ${durationSec.toFixed(1)}s`);
  }

  // 배경음악(BGM) 생성 — public/audio/bgm.wav (Remotion staticFile 로 참조).
  let bgm: string | undefined;
  try {
    generateBgm(`${AUDIO_DIR}/bgm.wav`);
    bgm = 'audio/bgm.wav';
    console.log('  · 배경음악 생성: audio/bgm.wav');
  } catch (e) {
    console.warn('  · 배경음악 생성 실패(무시, 무음 진행):', (e as Error).message);
  }

  const manifest: RenderManifest = {
    title: script.title,
    topic: script.topic,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    totalDurationInFrames: startFrame,
    scenes,
    createdAt: new Date().toISOString(),
    bgm,
  };
  await writeJson(MANIFEST_PATH, manifest);
  const mins = (startFrame / FPS / 60).toFixed(1);
  console.log(`  · 총 길이: 약 ${mins}분 (${startFrame} 프레임)`);
  return manifest;
}

/** 3) 영상 렌더 + AI 썸네일 */
async function stepRender(): Promise<void> {
  const manifest = (await readJson(MANIFEST_PATH)) as RenderManifest;
  console.log('▶ [3/4] 영상 렌더링');
  await renderVideo(manifest); // 렌더 시 기본(손그림) 썸네일도 THUMBNAIL_PATH 로 생성됨
  console.log('  · 저장:', VIDEO_PATH);

  // AI 썸네일 시도 — 실패/키없음 시 위의 기본 썸네일을 그대로 사용.
  const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
  try {
    const ok = await generateThumbnail({
      title: script.title,
      topic: script.topic,
      headline: script.thumbnailHeadline,
      outPath: THUMBNAIL_PATH,
    });
    console.log(
      ok
        ? '  · AI 썸네일(gpt-image-1) 생성 완료: ' + THUMBNAIL_PATH
        : '  · AI 썸네일 건너뜀(OPENAI_API_KEY 없음) → 기본 손그림 썸네일 사용',
    );
  } catch (e) {
    console.warn('  · AI 썸네일 실패(무시, 기본 썸네일 사용):', (e as Error).message);
  }
}

/** (선택) 썸네일만 생성 — 프롬프트/스타일 튜닝용 (영상 렌더 없이). */
async function stepThumbnail(): Promise<void> {
  const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
  console.log('▶ 썸네일 생성:', script.title);
  const ok = await generateThumbnail({ title: script.title, topic: script.topic, headline: script.thumbnailHeadline, outPath: THUMBNAIL_PATH });
  console.log(ok ? '  · 저장: ' + THUMBNAIL_PATH : '  · OPENAI_API_KEY 없음 → 생성 안 함');
}

/** 4) 유튜브 업로드 */
async function stepUpload(): Promise<void> {
  console.log('▶ [4/4] 유튜브 업로드');
  if (!config.doUpload) {
    console.log('  · DO_UPLOAD=false → 업로드 건너뜀 (out/video.mp4 확인)');
    return;
  }
  const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
  const videoId = await uploadVideo({
    videoPath: VIDEO_PATH,
    script,
    thumbnailPath: THUMBNAIL_PATH,
  });
  console.log(`  · 업로드 완료: https://youtu.be/${videoId} (${config.youtubePrivacyStatus})`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg?.split('=')[1] as Step | undefined;

  const steps: Step[] = only ? [only] : ['script', 'voice', 'render', 'upload'];

  for (const step of steps) {
    if (step === 'script') await stepScript();
    else if (step === 'voice') await stepVoice();
    else if (step === 'render') await stepRender();
    else if (step === 'thumbnail') await stepThumbnail();
    else if (step === 'upload') await stepUpload();
  }

  console.log('\n✅ 완료');
}

main().catch((err) => {
  console.error('\n❌ 파이프라인 실패:', err);
  process.exit(1);
});
