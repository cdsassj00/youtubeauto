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
  UPLOAD_RESULT_PATH,
  DECK_PATH,
  DECK_META_PATH,
  WEB3D_DIR,
  FPS,
  WIDTH,
  HEIGHT,
  audioStaticPath,
} from '../config.js';
import { ScriptSchema, type Script, type RenderManifest, type SceneWithAudio } from '../schema.js';
import { generateScript } from '../lib/anthropic.js';
import { generateDeck } from '../lib/deckgen.js';
import { researchRecentInfo } from '../lib/research.js';
import { synthesizeSpeech } from '../lib/elevenlabs.js';
import { generateBgm } from '../lib/bgm.js';
import { renderVideo } from '../lib/render.js';
import { generateIllustrations } from '../lib/illustrate.js';
import { generateCutouts } from '../lib/cutoutScene.js';
import { planBroll } from '../lib/broll.js';
import { fetchClip, creditLine, type StockClip } from '../lib/stock.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { printUsage } from '../lib/usage.js';
import { uploadVideo, setThumbnail, setPrivacy } from '../lib/youtube.js';
import { pickVisualThemeMode } from '../lib/visualTheme.js';

type Step = 'script' | 'voice' | 'render' | 'upload' | 'thumbnail' | 'rethumb' | 'setprivacy' | 'remixbgm';

/** deck 기반 엔진(3D 기하학 / SIGNAL)인가 — 대본 스키마와 렌더 경로가 illustrated 와 완전히 다르다. */
const DECK_ENGINES = ['signal', 'signal3d', 'deck3d'];
const isDeckEngine = () => DECK_ENGINES.includes(config.videoEngine);

/** 업로드/썸네일이 쓰는 메타 — 엔진에 따라 script.json 또는 deck-meta.json 에서 읽는다. */
type VideoMeta = { title: string; description: string; tags: string[]; topic: string; thumbnailHeadline: string; thumbnailBadge?: string };
async function loadMeta(): Promise<VideoMeta> {
  if (isDeckEngine()) return (await readJson(DECK_META_PATH)) as VideoMeta;
  const s = ScriptSchema.parse(await readJson(SCRIPT_PATH));
  return { title: s.title, description: s.description, tags: s.tags, topic: s.topic, thumbnailHeadline: s.thumbnailHeadline, thumbnailBadge: s.thumbnailBadge };
}

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

  // deck 기반 엔진(3D 기하학 / SIGNAL)은 슬라이드 데이터 구조가 달라 전용 생성기를 쓴다.
  if (isDeckEngine()) {
    const style = config.videoEngine as 'signal' | 'signal3d' | 'deck3d';
    const { meta, deck } = await generateDeck({
      topic: customTopic || (mode === 'trend' ? '최근 가장 화제가 된 AI 트렌드 하나' : 'AI 핵심 개념 하나'),
      style,
      targetMinutes: config.targetMinutes,
      dateLabel,
      research,
    });
    await writeJson(DECK_PATH, deck);
    await writeJson(DECK_META_PATH, meta);
    await writeJson(`${OUT_DIR}/history.json`, { titles: [...recentTitles, meta.title] });
    console.log(`  · 제목: ${meta.title}`);
    console.log(`  · 슬라이드 수: ${deck.slides.length} (스타일: ${style})`);
    return null as unknown as Script; // deck 엔진은 Script 를 쓰지 않는다
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
async function stepVoice(): Promise<RenderManifest | null> {
  // deck 엔진은 렌더러(narrate-deck.mjs)가 슬라이드 비트별로 직접 TTS 하고 그 길이로 화면 타이밍을
  // 맞추므로(나레이션-화면 싱크의 핵심), 여기서 따로 오디오를 만들지 않는다.
  if (isDeckEngine()) {
    console.log('▶ [2/4] 나레이션 — deck 엔진은 렌더 단계에서 비트별로 생성 (건너뜀)');
    return null;
  }
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

/** deck 기반 엔진 렌더 — web3d-deck/narrate-deck.mjs 가 비트별 TTS + 프레임렌더 + mux 를 한다. */
function renderDeckVideo(): Promise<void> {
  const script = path.join(WEB3D_DIR, 'narrate-deck.mjs');
  // 배경음악 — deck 엔진(signal/deck3d)은 나레이션만 mux 해서 음악이 아예 없었다.
  // (illustrated 엔진만 Remotion 에서 BGM 을 깔고 있었다.) 여기서 만들어 경로를 넘긴다.
  let bgmPath = '';
  try {
    bgmPath = path.join(OUT_DIR, 'bgm.wav');
    generateBgm(bgmPath);
    console.log('  · 배경음악 생성:', bgmPath);
  } catch (e) {
    bgmPath = '';
    console.warn('  · 배경음악 생성 실패(무시, 음악 없이 진행):', (e as Error).message);
  }
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, DECK_PATH, VIDEO_PATH], {
      stdio: 'inherit',
      env: {
        ...process.env,
        W: String(WIDTH),
        H: String(HEIGHT),
        FPS: String(FPS),
        NARRATION_SPEED: String(config.narrationSpeed),
        BGM_PATH: bgmPath,
        USAGE_PATH: path.join(OUT_DIR, 'usage.json'),
        BGM_VOLUME: process.env.BGM_VOLUME || '0.085',
        // 워크플로 변수(ELEVENLABS_VOICE_ID)가 비어 있어도 config 의 기본값이 적용되도록 명시 전달.
        ELEVENLABS_API_KEY: config.elevenLabsApiKey(),
        ELEVENLABS_VOICE_ID: config.elevenLabsVoiceId,
        ELEVENLABS_MODEL_ID: config.elevenLabsModelId,
        NODE_PATH: [process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean).join(path.delimiter),
      },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`narrate-deck 종료 코드 ${code}`))));
    child.on('error', reject);
  });
}

/** 3) 영상 렌더 + AI 썸네일 */
async function stepRender(): Promise<void> {
  // deck 엔진은 manifest 대신 deck.json 을 쓴다.
  if (isDeckEngine()) {
    console.log(`▶ [3/4] 영상 렌더링 (엔진: ${config.videoEngine})`);
    await renderDeckVideo();
    console.log('  · 저장:', VIDEO_PATH);
    await makeThumbnail();
    return;
  }
  const manifest = (await readJson(MANIFEST_PATH)) as RenderManifest;
  console.log(`▶ [3/4] 영상 렌더링 (엔진: ${config.videoEngine})`);
  if (config.videoEngine === 'web3d') {
    await render3dVideo();
  } else if (config.videoEngine === 'scrapbook') {
    // VOX(스크랩북) 엔진 — 종이 배경 위에 컷아웃 판화를 붙이고 큰 글자를 타자기로 찍는다.
    // 여기서는 모든 씬이 그림을 받는다. illustrated 와 달리 도식·불릿을 코드로 그리지 않고
    // "한 화면에 스크랩 하나"가 원칙이라, 그림이 없으면 화면이 글자만 남는다.
    const needsArt = manifest.scenes.filter((s) => s.visual !== 'quote');
    console.log(`  · 컷아웃 판화 생성 중... (${needsArt.length}/${manifest.scenes.length}, 인용 씬 제외)`);
    const cutMap = await generateCutouts(needsArt);
    // 생성에 실패한 씬은 기존 값을 그대로 둔다(덮어쓰면 있던 그림까지 날아간다).
    manifest.scenes = manifest.scenes.map((s) => ({ ...s, imagePath: cutMap[s.id] ?? s.imagePath }));
    await writeJson(MANIFEST_PATH, manifest);
    console.log(`  · 컷아웃 ${Object.keys(cutMap).length}/${needsArt.length}장 완료 → Remotion 합성`);
    await renderVideo(manifest, 'Scrapbook');
  } else if (config.videoEngine === 'illustrated') {
    // diagram/comparison/bullets/quote 씬은 AI 그림 대신 코드로 그린 등각 모션 그래픽·발표자료
    // 슬라이드로 렌더하므로(Illustrated.tsx 의 IsoDiagram/IsoComparison/BulletSlide/QuoteSlide 참고)
    // AI 일러스트 생성을 건너뛰어 비용을 아끼고, 영상 전체가 AI 그림 한 가지로만 도배되는 걸 막는다.
    // ★visual="image" 는 반드시 여기서 제외돼야 한다★
    // 예전에는 대본이 만들 수 있는 모든 씬 타입이 이 목록에 걸려서 needsAiImage 가 항상 0이었고,
    // 그 결과 AI 일러스트가 한 장도 안 만들어졌다 — 화풍 설정이 아무 효과가 없던 원인이다.
    const isCodeRendered = (s: (typeof manifest.scenes)[number]) =>
      s.visual !== 'image' &&
      ((s.visual === 'diagram' && Boolean(s.diagram?.nodes.length)) ||
      (s.visual === 'comparison' && Boolean(s.comparison)) ||
      (s.visual === 'bullets' && s.bullets.length > 0) ||
      (s.visual === 'code' && Boolean(s.code)) ||
      ((s.visual === 'title' || s.visual === 'outro') && Boolean(s.icon)) ||
      s.visual === 'quote');
    const needsAiImage = manifest.scenes.filter((s) => !isCodeRendered(s));
    console.log(`  · 씬별 흑백 일러스트 생성 중... (${needsAiImage.length}/${manifest.scenes.length}, 도식/비교/불릿/인용/아이콘 씬은 코드 렌더링으로 대체)`);
    // manifest.theme(다크로 정해졌으면) 에 맞춰 AI 일러스트도 색을 반전해, title/outro 씬만
    // 흰 배경으로 튀지 않고 영상 전체가 한 톤으로 보이게 한다.
    const imgMap = await generateIllustrations(needsAiImage, manifest.theme === 'dark');
    manifest.scenes = manifest.scenes.map((s) => ({ ...s, imagePath: imgMap[s.id] }));
    await attachBroll(manifest);
    await writeJson(MANIFEST_PATH, manifest); // imagePath 반영 저장(재실행 대비)
    const made = Object.keys(imgMap).length;
    console.log(`  · 일러스트 ${made}/${needsAiImage.length}장 완료 → Remotion 합성`);
    await renderVideo(manifest, 'AiIllustrated');
  } else {
    await renderVideo(manifest); // 손그림(Remotion)
  }
  console.log('  · 저장:', VIDEO_PATH);

  await makeThumbnail();
}

/** AI 썸네일 생성 — 실패/키없음 시 기존 썸네일을 그대로 둔다. (엔진 무관 공통) */
async function makeThumbnail(): Promise<void> {
  const meta = await loadMeta();
  try {
    const ok = await generateThumbnail({
      title: meta.title,
      topic: meta.topic,
      headline: meta.thumbnailHeadline,
      badge: meta.thumbnailBadge,
      outPath: THUMBNAIL_PATH,
      dramatic: resolveTopicMode() === 'trend',
    });
    console.log(
      ok
        ? '  · AI 썸네일 생성 완료: ' + THUMBNAIL_PATH
        : '  · AI 썸네일 건너뜀(OPENAI_API_KEY 없음) → 기본 썸네일 사용',
    );
  } catch (e) {
    console.warn('  · AI 썸네일 실패(무시, 기본 썸네일 사용):', (e as Error).message);
  }
}

/** (선택) 썸네일만 생성 — 프롬프트/스타일 튜닝용 (영상 렌더 없이). */
async function stepThumbnail(): Promise<void> {
  const meta = await loadMeta();
  console.log('▶ 썸네일 생성:', meta.title);
  await makeThumbnail();
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
  const badge = process.env.RETHUMB_BADGE?.trim() || '';
  const productIcons = process.env.RETHUMB_ICONS?.trim() || '';
  const ok = await generateThumbnail({ title, topic, headline, badge, productIcons, outPath: THUMBNAIL_PATH, dramatic: process.env.RETHUMB_DRAMATIC === 'true' });
  if (!ok) throw new Error('썸네일 생성 실패 (OPENAI_API_KEY 확인)');
  await setThumbnail(videoId, THUMBNAIL_PATH);
  console.log('  · 교체 완료:', THUMBNAIL_PATH);
}

/**
 * (선택) 이미 렌더된 out/video.mp4 에 배경음악만 덧입힌다 — 영상은 재인코딩하지 않는다(-c:v copy).
 * deck 엔진이 BGM 없이 만든 기존 영상을 재렌더 없이 구제하기 위한 경로.
 */
async function stepRemixBgm(): Promise<void> {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const FFMPEG = req('ffmpeg-static') as string;
  const bgmPath = path.join(OUT_DIR, 'bgm.wav');
  const outPath = path.join(OUT_DIR, 'video-bgm.mp4');
  console.log('▶ 배경음악 덧입히기 (영상 재인코딩 없음)');
  generateBgm(bgmPath);

  const volume = process.env.BGM_VOLUME || '0.085';
  const dur = await new Promise<number>((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-i', VIDEO_PATH], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0);
    });
  });
  if (!dur) throw new Error('영상 길이를 읽지 못했습니다 — out/video.mp4 를 확인하세요.');
  console.log(`  · 원본 길이 ${dur.toFixed(1)}s, BGM 볼륨 ${volume}`);

  const filter =
    `[1:a]volume=${volume},atrim=0:${dur.toFixed(3)},asetpts=N/SR/TB,` +
    `afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, dur - 3).toFixed(3)}:d=3[bg];` +
    `[0:a][bg]amix=inputs=2:duration=first:normalize=0[a]`;
  await new Promise<void>((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-y', '-i', VIDEO_PATH, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outPath], { stdio: 'inherit' });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg 종료 코드 ${c}`))));
    p.on('error', reject);
  });
  await fs.rename(outPath, VIDEO_PATH);
  console.log('  · 완료 — 배경음악이 깔린 영상으로 교체:', VIDEO_PATH);
}

/** 4) 유튜브 업로드 */
async function stepUpload(): Promise<void> {
  console.log('▶ [4/4] 유튜브 업로드');
  if (!config.doUpload) {
    console.log('  · DO_UPLOAD=false → 업로드 건너뜀 (out/video.mp4 확인)');
    return;
  }
  const meta = await loadMeta();
  const videoId = await uploadVideo({
    videoPath: VIDEO_PATH,
    script: meta,
    thumbnailPath: THUMBNAIL_PATH,
  });
  const privacy = config.youtubePrivacyStatus;
  console.log(`  · 업로드 완료: https://youtu.be/${videoId} (${privacy})`);
  // "업로드 전 리뷰" 흐름용 결과 기록 — 웹앱이 videoId/공개상태로 미리보기·발행을 제어.
  await writeUploadResult({ videoId, privacyStatus: privacy, title: meta.title, thumbnailHeadline: meta.thumbnailHeadline, topic: meta.topic });
}

/** 업로드 결과를 out/upload-result.json 에 기록(웹앱 리뷰 화면이 읽음). */
async function writeUploadResult(r: { videoId: string; privacyStatus: string; title?: string; thumbnailHeadline?: string; topic?: string }): Promise<void> {
  const data = {
    videoId: r.videoId,
    privacyStatus: r.privacyStatus,
    title: r.title ?? '',
    thumbnailHeadline: r.thumbnailHeadline ?? '',
    topic: r.topic ?? '',
    watchUrl: `https://www.youtube.com/watch?v=${r.videoId}`,
    embedUrl: `https://www.youtube.com/embed/${r.videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
    channel: config.targetChannel,
    at: new Date().toISOString(),
  };
  await fs.writeFile(UPLOAD_RESULT_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log('  · 결과 기록:', UPLOAD_RESULT_PATH);
}

/** (선택) 이미 올라간 영상의 공개 상태 전환 — 미리보기(unlisted) → 발행(public) 등. */
/**
 * 씬 위에 얹을 스톡 B롤을 붙인다.
 *
 * 한 화면이 15~20초씩 정지해 있어서 "프리젠테이션 같다"는 문제를 고치기 위한 것이다.
 * 어디에 넣을지는 broll.ts 가 계산하고, 클립은 stock.ts 가 내려받는다.
 *
 * PEXELS_API_KEY 가 없으면 조용히 아무것도 안 한다 — B롤은 없어도 영상이 나와야 한다.
 */
async function attachBroll(manifest: RenderManifest): Promise<void> {
  if (!config.pexelsApiKey) return;

  const plans = planBroll(
    manifest.scenes.map((s) => ({
      id: s.id,
      visual: s.visual,
      durationInFrames: s.durationInFrames,
      // 검색어는 대본이 씬마다 써 둔 영어 묘사를 그대로 쓴다(이미 "무엇이 보이는가"의 설명이다).
      query: s.illustration,
    })),
    manifest.fps,
  );
  if (!plans.length) return;

  console.log(`  · B롤 배치: ${plans.length}개 씬 (Pexels 검색 중...)`);
  const byId = new Map(manifest.scenes.map((s) => [s.id, s]));
  const used: StockClip[] = [];
  let ok = 0;

  for (const [i, plan] of plans.entries()) {
    const clip = await fetchClip(plan.query, i);
    if (!clip) continue;
    const scene = byId.get(plan.sceneId);
    if (!scene) continue;

    // 클립 실제 길이를 넘는 컷은 끝이 검은 화면이 된다 — 클립 길이로 잘라 맞춘다.
    const maxFrames = Math.floor((clip.duration - 0.3) * manifest.fps);
    const cuts = plan.cuts
      .map((c) => ({
        path: clip.relPath,
        fromFrame: c.fromFrame,
        durationInFrames: Math.min(c.durationInFrames, maxFrames),
      }))
      .filter((c) => c.durationInFrames >= manifest.fps * 2); // 2초 미만은 깜빡임처럼 보인다

    if (!cuts.length) continue;
    scene.broll = cuts;
    used.push(clip);
    ok++;
  }

  console.log(`  · B롤 ${ok}/${plans.length}개 씬 적용`);

  // 출처 표기는 설명란 맨 아래에 덧붙인다(Pexels 는 의무가 아니지만 표기가 권장된다).
  // 설명란은 매니페스트가 아니라 script.json 에 있고 업로드 단계가 거기서 읽으므로,
  // 그 파일을 갱신해야 실제 영상 설명에 들어간다.
  const credit = creditLine(used);
  if (!credit) return;
  try {
    const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
    if (!script.description.includes('Pexels')) {
      script.description = `${script.description}\n\n${credit}`;
      await writeJson(SCRIPT_PATH, script);
      console.log('  · 설명란에 스톡 출처 표기 추가');
    }
  } catch (e) {
    // 출처 표기 실패가 영상 제작을 막을 이유는 없다.
    console.warn('  · 출처 표기 추가 실패(무시):', (e as Error).message);
  }
}

async function stepSetPrivacy(): Promise<void> {
  const videoId = process.env.SETPRIVACY_VIDEO_ID?.trim();
  const status = (process.env.SETPRIVACY_STATUS?.trim() || 'public') as 'public' | 'unlisted' | 'private';
  if (!videoId) throw new Error('SETPRIVACY_VIDEO_ID 환경변수가 필요합니다.');
  if (!['public', 'unlisted', 'private'].includes(status)) throw new Error(`잘못된 공개상태: ${status}`);
  console.log(`▶ 공개상태 전환: ${videoId} → ${status}`);
  await setPrivacy(videoId, status);
  await writeUploadResult({ videoId, privacyStatus: status });
  console.log('  · 완료');
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
    else if (step === 'setprivacy') await stepSetPrivacy();
    else if (step === 'remixbgm') await stepRemixBgm();
  }

  printUsage();
  console.log('\n✅ 완료');
}

main().catch((err) => {
  console.error('\n❌ 파이프라인 실패:', err);
  process.exit(1);
});
