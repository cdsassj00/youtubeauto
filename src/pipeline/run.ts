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
  STOCK_VIEWS_PATH,
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
import { buildSignalDeck } from '../lib/deckFromScript.js';
import { loadListingSpec, stageListingPhotos, generateListingScript } from '../lib/listing.js';
import { researchRecentInfo } from '../lib/research.js';
import { synthesizeSpeech } from '../lib/elevenlabs.js';
import { generateBgm, bgmStyleFromEnv } from '../lib/bgm.js';
import { generateSfx } from '../lib/sfx.js';
import { renderVideo } from '../lib/render.js';
import { renderHyperVideo, assertHyperRuntime } from '../lib/hyperframes.js';
import { generateIllustrations } from '../lib/illustrate.js';
import { generateCutouts } from '../lib/cutoutScene.js';
import { planBroll } from '../lib/broll.js';
import { fetchStock, creditLine, type StockClip } from '../lib/stock.js';
import { fetchAsset, availableProviders, creditBlock, type StockAsset } from '../lib/stockProviders.js';
import { planShots, shotSeeds } from '../lib/footagePlan.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { printUsage } from '../lib/usage.js';
import { uploadVideo, setThumbnail, setPrivacy } from '../lib/youtube.js';
import { pickVisualThemeMode } from '../lib/visualTheme.js';
import { fetchBrief, fetchSceneImage, freshnessProblem } from '../lib/stockBrief.js';
import { buildStockScript } from '../lib/stockScript.js';
import { drawStockThumbnail } from '../lib/stockThumbnail.js';

type Step = 'script' | 'voice' | 'render' | 'upload' | 'thumbnail' | 'rethumb' | 'setprivacy' | 'remixbgm';

/**
 * 전용 대본(deck.json)을 쓰는 엔진인가.
 *
 * ★signal 은 여기서 빠졌다★ 이제 표준 대본(script.json)을 쓴다. 덱 형식이 따로 있으면
 * 자막 분절·도식 4종·나레이션 생성이 전부 두 벌이 되어 한쪽만 낡는다. signal 은
 * deckFromScript.ts 가 표준 대본을 슬라이드로 옮겨주므로 화면 스타일만 담당한다.
 * signal3d/deck3d 는 렌더러(deck-timed.js)가 슬라이드 타입이 달라 아직 옛 경로에 남겨둔다 —
 * 확인하지 않은 것을 옮기면 화면이 통째로 비는 쪽으로 조용히 실패한다.
 */
const DECK_ENGINES = ['signal3d', 'deck3d'];
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
  // ★주식 데일리는 값과 말을 나눈다★ 숫자는 stockontology.cc 응답에서 그대로 옮기고,
  // "왜 그런가"만 Claude 가 쓴다(stockScript → stockNarrate). 모델이 쓴 문장에 화면에 없는
  // 숫자가 있으면 그 씬은 버려지고 조립본이 나간다 — 숫자가 곧 신뢰인 채널이라서다.
  if (config.videoEngine === 'stock') {
    const market = (process.env.STOCK_MARKET ?? 'KR').toUpperCase() as 'KR' | 'US';
    console.log(`▶ [1/4] 주식 브리프 조립 (${market})`);
    const { date, brief, disclaimer } = await fetchBrief(market);

    // ★자동 발행에서 제일 위험한 실패는 조용히 어제 것을 오늘 것이라고 내보내는 것이다★
    // 여기서 막지 않으면 시세 수집이 멈춘 날 낡은 값으로 종목을 추천하고, 다음 날 그걸
    // 채점까지 한다. 눈으로는 구별이 안 되는 종류의 사고다.
    const stale = freshnessProblem(date, brief);
    if (stale) {
      console.error(`⏭ 오늘은 발행하지 않습니다 — ${stale}`);
      console.error(`   date=${date} basis=${brief.basis} dataAgeMinutes=${brief.dataAgeMinutes ?? '?'}`);
      // 워크플로에 알려 뒤 단계(나레이션·렌더·업로드)를 건너뛰게 한다.
      // ★실패로 끝내지 않는다★ 건너뛰는 것은 정상 동작이라, 빨간 X 로 남기면 진짜 고장과
      // 구별이 안 되고 매번 알림이 울려 나중에는 아무도 안 본다.
      if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, 'skip=true\n');
      process.exit(0);
    }
    // 0 이면 전부(약 9분 30초). 미리보기·짧은 회차는 STOCK_MAX_MIN 으로 줄인다.
    const maxMin = Number(process.env.STOCK_MAX_MIN ?? '0') || 0;
    const { script, views } = await buildStockScript(brief, date, disclaimer, maxMin);
    await writeJson(SCRIPT_PATH, script);
    await writeJson(STOCK_VIEWS_PATH, views);
    console.log(`  · ${date} ${brief.marketKo} · ${brief.regime.label}`);
    console.log(`  · 씬 ${script.scenes.length}개 · 사이트 화면 ${Object.keys(views).length}장${maxMin ? ` (${maxMin}분 목표로 줄임)` : ''}`);
    console.log(`  · 제목: ${script.title}`);
    const blank = [...brief.picks, ...brief.avoid].filter((p) => !p.sector);
    if (blank.length) console.warn(`  ⚠ 섹터가 비어 있는 종목: ${blank.map((p) => p.name).join(', ')}`);
    return script as Script;
  }

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

  // 목록형 — 자료(items.json)가 사실을 쥐고, Claude 는 문장만 쓴다.
  // 일반 대본 생성기에 맡기면 자료에 없는 걸 지어내거나 있는 걸 빠뜨린다(실제로 겪었다).
  if (config.videoEngine === 'listing') {
    const { spec } = loadListingSpec(config.listingSet);
    console.log(`  · 목록 자료: ${spec.title} (항목 ${spec.items.length}개)`);
    const listingScript = await generateListingScript(spec, config.targetMinutes);
    await writeJson(SCRIPT_PATH, listingScript);
    await writeJson(`${OUT_DIR}/history.json`, { titles: [...recentTitles, listingScript.title] });
    console.log(`  · 제목: ${listingScript.title}`);
    console.log(`  · 씬 수: ${listingScript.scenes.length} (도입 + 항목 ${spec.items.length} + 마무리)`);
    return listingScript;
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
    generateBgm(`${AUDIO_DIR}/bgm.wav`, bgmStyleFromEnv());
    bgm = 'audio/bgm.wav';
    console.log('  · 배경음악 생성: audio/bgm.wav');
  } catch (e) {
    console.warn('  · 배경음악 생성 실패(무시, 무음 진행):', (e as Error).message);
  }

  // 효과음(장면 전환 '휙' / 숫자 등장 '띵') — 배경음악과 같은 방식으로 합성한다.
  // 실패해도 영상은 나가야 하므로 플래그만 내리고 넘어간다.
  const sfxMade = generateSfx(AUDIO_DIR);
  const sfx = sfxMade.length === 3;
  console.log(sfx ? `  · 효과음 생성: ${sfxMade.join(', ')}` : '  · 효과음 생성 실패(무시, 효과음 없이 진행)');

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
    sfx,
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
function renderDeckVideo(deckPath: string = DECK_PATH, clipsJson = ''): Promise<void> {
  const script = path.join(WEB3D_DIR, 'narrate-deck.mjs');
  // 배경음악 — deck 엔진(signal/deck3d)은 나레이션만 mux 해서 음악이 아예 없었다.
  // (illustrated 엔진만 Remotion 에서 BGM 을 깔고 있었다.) 여기서 만들어 경로를 넘긴다.
  let bgmPath = '';
  try {
    bgmPath = path.join(OUT_DIR, 'bgm.wav');
    generateBgm(bgmPath, bgmStyleFromEnv());
    console.log('  · 배경음악 생성:', bgmPath);
  } catch (e) {
    bgmPath = '';
    console.warn('  · 배경음악 생성 실패(무시, 음악 없이 진행):', (e as Error).message);
  }
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, deckPath, VIDEO_PATH], {
      stdio: 'inherit',
      env: {
        ...process.env,
        W: String(WIDTH),
        H: String(HEIGHT),
        FPS: String(FPS),
        NARRATION_SPEED: String(config.narrationSpeed),
        BGM_PATH: bgmPath,
        // 비어 있으면 렌더러가 예전처럼 자기 손으로 TTS 를 돌린다(signal3d/deck3d).
        // 값이 있으면 2단계가 만든 mp3 를 그대로 쓴다(signal).
        CLIPS_JSON: clipsJson,
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
  } else if (config.videoEngine === 'hyper') {
    // hyper 엔진 — HyperFrames(HTML → MP4). Remotion 도 web3d-deck 도 거치지 않는
    // 세 번째 렌더 경로다. 대본·나레이션(1·2단계)은 그대로 쓰므로 여기서만 갈라진다.
    // AI 그림·스톡 영상을 한 장도 쓰지 않아 이미지 비용이 0 이다.
    await renderHyperVideo(manifest, VIDEO_PATH);
  } else if (config.videoEngine === 'footage') {
    // 실사 푸티지 엔진 — AI 그림을 한 장도 만들지 않는다. 화면을 전부 스톡으로 채운다.
    await attachFootage(manifest);
    await writeJson(MANIFEST_PATH, manifest);
    await renderVideo(manifest, 'Footage');
  } else if (config.videoEngine === 'scrapbook') {
    // VOX(스크랩북) 엔진 — 종이 배경 위에 컷아웃 판화를 붙이고 큰 글자를 타자기로 찍는다.
    //
    // ★모든 씬에 그림을 붙이지 않는다★ 이유가 두 가지다.
    //  1) 연출 — 참고 영상도 글자만 남는 화면과 그림이 붙는 화면이 번갈아 나온다. 매 컷마다
    //     그림이 들어오면 눈이 쉴 곳이 없어 오히려 단조로워진다(quote 씬이 그 쉼표다).
    //  2) 비용 — 이 엔진은 컷이 빨라 씬이 45~65개다. 전부 그리면 장당 $0.067 × 60 ≈ $4 로
    //     영상 한 편 값이 몇 배가 된다. visual="image" 인 씬만 그리면 절반 이하로 떨어진다.
    const needsArt = manifest.scenes.filter(
      (s) => s.visual === 'image' || s.visual === 'title' || s.visual === 'outro',
    );
    console.log(`  · 컷아웃 판화 생성 중... (${needsArt.length}/${manifest.scenes.length}, image/title/outro 씬만)`);
    const cutMap = await generateCutouts(needsArt);
    // 생성에 실패한 씬은 기존 값을 그대로 둔다(덮어쓰면 있던 그림까지 날아간다).
    manifest.scenes = manifest.scenes.map((s) => ({ ...s, imagePath: cutMap[s.id] ?? s.imagePath }));
    await writeJson(MANIFEST_PATH, manifest);
    console.log(`  · 컷아웃 ${Object.keys(cutMap).length}/${needsArt.length}장 완료 → Remotion 합성`);
    await renderVideo(manifest, 'Scrapbook');
  } else if (config.videoEngine === 'illustrated' || config.videoEngine === 'whiteboard') {
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
    // ★화이트보드는 예외★ 배경이 종이색(#F4EDE0)으로 못박혀 있어서, 테마 추첨이 dark 로
    // 떨어지면 흰선/검은바탕 그림이 베이지 종이 위에 검은 사각형으로 얹힌다. 종이 위에
    // 그리는 엔진이므로 그림도 항상 밝은 쪽이어야 한다.
    const isWhiteboard = config.videoEngine === 'whiteboard';
    const imgMap = await generateIllustrations(needsAiImage, !isWhiteboard && manifest.theme === 'dark');
    manifest.scenes = manifest.scenes.map((s) => ({ ...s, imagePath: imgMap[s.id] }));
    // ★B롤은 illustrated 전용★ engines.ts 에서 화이트보드는 broll:false 인데 여기서는
    // 엔진을 안 보고 붙이고 있었다. Whiteboard.tsx 는 scene.broll 을 읽지 않으니 화면에는
    // 안 나오지만, 붙은 클립이 영상 설명의 Pexels 출처 표기에 그대로 들어가 "화면에 없는
    // 소재를 출처로 밝히는" 설명이 만들어진다.
    if (!isWhiteboard) await attachBroll(manifest);
    await writeJson(MANIFEST_PATH, manifest); // imagePath 반영 저장(재실행 대비)
    const made = Object.keys(imgMap).length;
    console.log(`  · 일러스트 ${made}/${needsAiImage.length}장 완료 → Remotion 합성`);
    // 화이트보드는 같은 그림을 쓰되 화면에서 '그려지는' 연출만 다르다.
    // 그림 생성 단계를 공유하므로 비용은 illustrated 와 같다.
    await renderVideo(manifest, config.videoEngine === 'whiteboard' ? 'Whiteboard' : 'AiIllustrated');
  } else if (config.videoEngine === 'stock') {
    // 사이트가 서버에서 그려 준 1920x1080 완성 화면을 씬 배경으로 깐다. 브라우저도 AI 그림도
    // 필요 없다 — illustrated 엔진이 imagePath 를 전체화면으로 깔아 주므로 그 자리에 넣는다.
    const views = await readJson<Record<string, string>>(STOCK_VIEWS_PATH);
    const market = (process.env.STOCK_MARKET ?? 'KR').toUpperCase() as 'KR' | 'US';
    await fs.mkdir(path.join('public', 'img'), { recursive: true });
    let got = 0;
    for (const [sceneId, view] of Object.entries(views)) {
      const rel = `img/${sceneId}.png`;
      try {
        await fetchSceneImage(market, view, path.join('public', rel));
        got++;
      } catch (e) {
        // ★한 장 실패로 그날 영상을 버리지 않는다★ 그 씬은 엔진이 자체 화면으로 그린다.
        console.warn(`  · 화면 실패(무시): ${view} — ${(e as Error).message}`);
        continue;
      }
      manifest.scenes = manifest.scenes.map((s) => (s.id === sceneId ? { ...s, imagePath: rel } : s));
    }
    await writeJson(MANIFEST_PATH, manifest);
    console.log(`  · 사이트 화면 ${got}/${Object.keys(views).length}장 배치 → Mixed 합성`);
    await renderVideo(manifest, 'Mixed');
  } else if (config.videoEngine === 'signal') {
    // SIGNAL — 화면은 덱 렌더러가 그리지만 대본·나레이션은 표준 경로 것을 그대로 쓴다.
    // manifest 를 슬라이드로 옮기고, 2단계가 만들어 둔 mp3 목록을 함께 넘긴다.
    const { deck, clips } = buildSignalDeck(manifest, AUDIO_DIR);
    const deckPath = path.join(OUT_DIR, 'deck-from-script.json');
    const clipsPath = path.join(OUT_DIR, 'deck-clips.json');
    await writeJson(deckPath, deck);
    await writeJson(clipsPath, clips);
    console.log(`  · 표준 대본 → SIGNAL 슬라이드 ${deck.slides.length}개 (나레이션 재사용)`);
    await renderDeckVideo(deckPath, clipsPath);
  } else if (config.videoEngine === 'listing') {
    // 목록형 — 자료의 사진을 그대로 씬에 꽂는다. 스톡도 AI 그림도 부르지 않는다.
    const { spec, dir } = loadListingSpec(config.listingSet);
    const photos = stageListingPhotos(spec, dir);
    // 씬 순서: [도입] + 항목 N개 + [마무리]. 그래서 항목 i 는 씬 i+1 이다.
    manifest.scenes = manifest.scenes.map((s, i) => {
      const p = photos.get(i - 1);
      return p ? { ...s, imagePath: p } : s;
    });
    await writeJson(MANIFEST_PATH, manifest);
    console.log(`  · 사진 ${photos.size}장 배치 → Remotion 합성`);
    await renderVideo(manifest, 'Listing');
  } else if (config.videoEngine === 'handdrawn') {
    // 손그림 — 이 파이프라인의 첫 화면 스타일(종이 배경 + 도식 + 자막).
    // ★한동안 아무도 고를 수 없었다★ illustrated 엔진이 생기면서 기본값이 그쪽으로 넘어갔고,
    // 손그림은 맨 아래 "그 외" 폴백 자리로 밀렸는데, 고를 수 있는 엔진이 전부 위 분기에서
    // 잡히는 바람에 여기까지 내려올 값이 하나도 없었다. 컴포지션은 멀쩡히 살아 있었으므로
    // 엔진 목록에 정식으로 올리고 자기 분기를 준다.
    await renderVideo(manifest, 'AiExplainer');
  } else {
    // 알 수 없는 VIDEO_ENGINE 값에 대한 폴백. 여기 오면 설정이 잘못된 것이므로 알린다.
    console.warn(`  · 알 수 없는 엔진 '${config.videoEngine}' — 손그림으로 대체합니다`);
    await renderVideo(manifest, 'AiExplainer');
  }
  console.log('  · 저장:', VIDEO_PATH);

  await makeThumbnail();
}

/** AI 썸네일 생성 — 실패/키없음 시 기존 썸네일을 그대로 둔다. (엔진 무관 공통) */
async function makeThumbnail(): Promise<void> {
  const meta = await loadMeta();
  // 주식 데일리는 그림이 아니라 숫자를 보여주는 썸네일이라 코드로 그린다 — 매일 같은
  // 자리에 같은 크기로 찍혀야 시리즈로 묶이고, 장당 비용도 0 이다.
  if (config.videoEngine === 'stock') {
    const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
    const names = script.scenes.filter((s) => s.id.startsWith('pick')).map((s) => s.heading.replace(/^\d+\.\s*/, '').replace(/\s+[-\d.]+$/, ''));
    const now = new Date();
    await drawStockThumbnail({
      headline: meta.thumbnailHeadline,
      badge: meta.thumbnailBadge || '한국',
      names,
      dateLabel: `${now.getMonth() + 1}/${now.getDate()}`,
      outPath: THUMBNAIL_PATH,
    });
    console.log('  · 썸네일(코드 렌더):', THUMBNAIL_PATH);
    return;
  }
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
  generateBgm(bgmPath, bgmStyleFromEnv());

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
/**
 * 실사 푸티지 엔진 — 모든 씬을 스톡 컷으로 빈틈없이 채운다.
 *
 * attachBroll 과 목적이 정반대다. 저쪽은 원본 화면 위에 가끔 인서트를 얹는 것이고,
 * 이쪽은 화면 자체가 스톡이다. 그래서 상한도 없고 씬 종류로 거르지도 않는다.
 *
 * 소재를 못 구한 씬은 컷이 비는데, 렌더러가 그 경우 제목 카드를 대신 띄운다
 * (검은 화면보다 낫고, 무엇을 못 구했는지 눈으로 바로 보인다).
 */
async function attachFootage(manifest: RenderManifest): Promise<void> {
  const providers = availableProviders();
  if (!providers.length) {
    throw new Error(
      '실사 푸티지 엔진에는 스톡 API 키가 최소 하나 필요합니다 ' +
        '(PEXELS_API_KEY / PIXABAY_API_KEY / UNSPLASH_ACCESS_KEY).',
    );
  }
  console.log(`  · 실사 푸티지 수집 중... (소스: ${providers.join(', ')})`);

  const used: StockAsset[] = [];
  let filled = 0;
  let shots = 0;

  for (const [i, scene] of manifest.scenes.entries()) {
    // 검색어는 대본이 씬마다 써 둔 영어 묘사를 그대로 쓴다.
    // 비어 있으면(quote/code 씬 등) 제목으로 대신한다 — 한국어라도 안 쓰는 것보다 낫다.
    const query = (scene.illustration || scene.heading || '').trim();
    if (!query) continue;

    const plan = planShots(scene.durationInFrames, manifest.fps);
    const seeds = shotSeeds(i, plan.length);
    const cuts: NonNullable<RenderManifest['scenes'][number]['broll']> = [];

    for (const [ci, shot] of plan.entries()) {
      const asset = await fetchAsset(query, seeds[ci], true);
      if (!asset) continue;
      // 영상 클립이 컷보다 짧으면 뒤가 검은 화면이 된다 — 클립 길이로 잘라 맞춘다.
      const maxFrames = Math.floor((asset.duration - 0.3) * manifest.fps);
      const len = Math.min(shot.durationInFrames, maxFrames);
      if (len < manifest.fps) continue; // 1초 미만은 깜빡임이다
      cuts.push({
        path: asset.relPath,
        kind: asset.kind,
        fromFrame: shot.fromFrame,
        durationInFrames: len,
      });
      used.push(asset);
    }

    if (cuts.length) {
      scene.broll = cuts;
      filled++;
      shots += cuts.length;
    }
  }

  console.log(`  · 푸티지 ${shots}컷 / ${filled}개 씬 (전체 ${manifest.scenes.length}개 씬)`);
  if (!shots) throw new Error('스톡에서 소재를 하나도 구하지 못했습니다 — 검색어나 API 키를 확인하세요.');

  // ★Unsplash 는 출처 표기가 의무다★ 설명란에 반드시 들어가야 한다.
  const credit = creditBlock(used);
  if (!credit) return;
  try {
    const script = ScriptSchema.parse(await readJson(SCRIPT_PATH));
    if (!script.description.includes(credit)) {
      script.description = `${script.description}\n\n${credit}`;
      await writeJson(SCRIPT_PATH, script);
    }
  } catch (e) {
    console.warn('  · 출처 표기 추가 실패(무시):', (e as Error).message);
  }
}

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
    // 영상 우선, 없으면 사진. 영상만 고집하면 조금만 구체적인 키워드에서 결과가 0건이라
    // 그 씬이 그대로 정지 화면으로 남는다(고치려던 문제가 그대로 남는다).
    const clip = await fetchStock(plan.query, i);
    if (!clip) continue;
    const scene = byId.get(plan.sceneId);
    if (!scene) continue;

    // 클립 실제 길이를 넘는 컷은 끝이 검은 화면이 된다 — 클립 길이로 잘라 맞춘다.
    // 사진은 duration 이 Infinity 라 이 계산이 컷을 깎지 않는다.
    const maxFrames = Math.floor((clip.duration - 0.3) * manifest.fps);
    const cuts = plan.cuts
      .map((c) => ({
        path: clip.relPath,
        kind: clip.kind,
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

  // ★유료 단계 전에 확인한다★ hyper 엔진은 Node 22 이상에서만 렌더된다. 렌더는 3단계라
  // 여기서 안 막으면 대본(Claude)·나레이션(ElevenLabs) 값을 다 치르고 마지막에 실패한다.
  if (config.videoEngine === 'hyper') assertHyperRuntime();

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
