import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  config,
  resolveTopicMode,
  ROOT,
  OUT_DIR,
  PUBLIC_DIR,
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
import { researchRecentInfo } from '../lib/research.js';
import { synthesizeSpeech } from '../lib/elevenlabs.js';
import { generateBgm } from '../lib/bgm.js';
import { renderVideo } from '../lib/render.js';
import { generateIllustrations } from '../lib/illustrate.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { uploadVideo, setThumbnail } from '../lib/youtube.js';
import { pickVisualThemeMode } from '../lib/visualTheme.js';

type Step = 'script' | 'voice' | 'render' | 'upload' | 'thumbnail' | 'rethumb';

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
  console.log(`▶ [1/4] 대본 생성 (${topicLabel}, ${config.targetMinutes}분, 난이도=${config.contentLevel})`);

  // 상세 브리핑(긴 글)은 그 자체가 콘텐츠 명세라 리서치가 불필요하다.
  // 그 외(자동 트렌드 모드, 또는 사용자가 짧게 지정한 주제)는 웹서치로 최신 정보를 조사해
  // "학습 데이터 시점에 머문 오래된 내용"이 아니라 실제 최신 사실을 반영하게 한다.
  const customTopic = config.customTopic || undefined;
  const isBriefTopic = Boolean(customTopic) && (customTopic!.length > 120 || /\n/.test(customTopic!));
  let research: string | undefined;
  if (!isBriefTopic) {
    if (customTopic || mode === 'trend') {
      // 주제 지정/트렌드 모드: 그 주제의 최신 소식을 조사.
      console.log('  · 최신 정보 웹서치 조사 중...');
      research = await researchRecentInfo({ dateLabel, topic: customTopic });
    } else {
      // basics(기초 개념) 모드: 주제는 모델이 자동으로 고르므로 특정 주제 검색은 못 하지만,
      // "지금 현재의 최신 모델 지형"을 미리 조사해 넘긴다 — 안 그러면 학습 시점(≈2024) 지식으로
      // GPT-4o·GPT-4 터보 같은 이미 구세대가 된 모델을 대표 예시로 드는 문제가 생긴다(실제로 발생).
      console.log('  · 최신 모델 지형 웹서치 조사 중(기초 모드 그라운딩)...');
      research = await researchRecentInfo({ dateLabel, kind: 'landscape' });
    }
    console.log(research ? '  · 리서치 완료' : '  · 리서치 없음(건너뜀, 학습 데이터로만 진행)');
  }

  const script = await generateScript({
    mode,
    targetMinutes: config.targetMinutes,
    language: config.contentLanguage,
    dateLabel,
    recentTitles,
    customTopic,
    research,
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

  // 라이트/다크 테마를 영상 단위로 한 번 정해 매니페스트에 저장 — 코드로 그리는 발표자료/등각
  // 도식과 AI 일러스트 전체가 이 값을 그대로 따른다(매번 같은 흰 배경으로 안 보이게).
  const visualTheme = pickVisualThemeMode(script.title);
  console.log(`  · 시각 테마: ${visualTheme}`);

  const manifest: RenderManifest = {
    title: script.title,
    topic: script.topic,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    totalDurationInFrames: startFrame,
    scenes,
    createdAt: new Date().toISOString(),
    theme: visualTheme,
    bgm,
  };
  await writeJson(MANIFEST_PATH, manifest);
  const mins = (startFrame / FPS / 60).toFixed(1);
  console.log(`  · 총 길이: 약 ${mins}분 (${startFrame} 프레임)`);
  return manifest;
}

/** 3D 웹녹화 렌더러(web-engine/render3d.cjs)를 실행해 out/video.mp4 를 만든다. */
function render3dVideo(): Promise<void> {
  const script = path.join(ROOT, 'web-engine', 'render3d.cjs');
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, MANIFEST_PATH, VIDEO_PATH, PUBLIC_DIR], {
      stdio: 'inherit',
      // 전역 Playwright 설치를 쓰는 환경(개발 샌드박스)도 해석되게 NODE_PATH 보강.
      env: { ...process.env, NODE_PATH: [process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean).join(path.delimiter) },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`render3d 종료 코드 ${code}`))));
    child.on('error', reject);
  });
}

/** 3) 영상 렌더 + AI 썸네일 */
async function stepRender(): Promise<void> {
  const manifest = (await readJson(MANIFEST_PATH)) as RenderManifest;
  console.log(`▶ [3/4] 영상 렌더링 (엔진: ${config.videoEngine})`);
  if (config.videoEngine === 'web3d') {
    await render3dVideo();
  } else if (config.videoEngine === 'illustrated') {
    // diagram/comparison/bullets/quote 씬은 AI 그림 대신 코드로 그린 등각 모션 그래픽·발표자료
    // 슬라이드로 렌더하므로(Illustrated.tsx 의 IsoDiagram/IsoComparison/BulletSlide/QuoteSlide 참고)
    // AI 일러스트 생성을 건너뛰어 비용을 아끼고, 영상 전체가 AI 그림 한 가지로만 도배되는 걸 막는다.
    const isCodeRendered = (s: (typeof manifest.scenes)[number]) =>
      (s.visual === 'diagram' && Boolean(s.diagram?.nodes.length)) ||
      (s.visual === 'comparison' && Boolean(s.comparison)) ||
      (s.visual === 'bullets' && s.bullets.length > 0) ||
      (s.visual === 'code' && Boolean(s.code)) ||
      ((s.visual === 'title' || s.visual === 'outro') && Boolean(s.icon)) ||
      s.visual === 'quote';
    const needsAiImage = manifest.scenes.filter((s) => !isCodeRendered(s));
    console.log(`  · 씬별 흑백 일러스트 생성 중... (${needsAiImage.length}/${manifest.scenes.length}, 도식/비교/불릿/인용/아이콘 씬은 코드 렌더링으로 대체)`);
    // manifest.theme(다크로 정해졌으면) 에 맞춰 AI 일러스트도 색을 반전해, title/outro 씬만
    // 흰 배경으로 튀지 않고 영상 전체가 한 톤으로 보이게 한다.
    const imgMap = await generateIllustrations(needsAiImage, manifest.theme === 'dark');
    manifest.scenes = manifest.scenes.map((s) => ({ ...s, imagePath: imgMap[s.id] }));
    await writeJson(MANIFEST_PATH, manifest); // imagePath 반영 저장(재실행 대비)
    const made = Object.keys(imgMap).length;
    console.log(`  · 일러스트 ${made}/${needsAiImage.length}장 완료 → Remotion 합성`);
    await renderVideo(manifest, 'AiIllustrated');
  } else {
    await renderVideo(manifest); // 손그림(Remotion)
  }
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

/**
 * (선택) 이미 올라간 기존 영상의 썸네일만 다시 만들어 교체한다 (영상 재렌더/재업로드 없음).
 * 프롬프트 버그로 썸네일만 잘못 나왔을 때, 스크립트 재생성 비용 없이 저렴하게 고치기 위함.
 * 대상 videoId/title/topic/headline 은 RETHUMB_* 환경변수로 받는다.
 */
async function stepRethumb(): Promise<void> {
  const videoId = process.env.RETHUMB_VIDEO_ID?.trim();
  if (!videoId) throw new Error('RETHUMB_VIDEO_ID 환경변수가 필요합니다.');
  const title = process.env.RETHUMB_TITLE?.trim() || '';
  const topic = process.env.RETHUMB_TOPIC?.trim() || '';
  const headline = process.env.RETHUMB_HEADLINE?.trim() || '';
  console.log('▶ 썸네일 재생성 + 교체:', videoId);
  const ok = await generateThumbnail({ title, topic, headline, outPath: THUMBNAIL_PATH });
  if (!ok) throw new Error('썸네일 생성 실패 (OPENAI_API_KEY 확인)');
  await setThumbnail(videoId, THUMBNAIL_PATH);
  console.log('  · 교체 완료:', THUMBNAIL_PATH);
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
    else if (step === 'rethumb') await stepRethumb();
    else if (step === 'upload') await stepUpload();
  }

  console.log('\n✅ 완료');
}

main().catch((err) => {
  console.error('\n❌ 파이프라인 실패:', err);
  process.exit(1);
});
