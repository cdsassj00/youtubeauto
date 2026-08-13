/**
 * hyper 엔진 — HyperFrames(HTML → MP4)로 렌더하는 세 번째 경로.
 *
 * ★왜 세 번째 경로인가★
 * 저장소에는 이미 두 가지 렌더 경로가 있다.
 *   A. Remotion (illustrated/scrapbook/footage) — React 컴포지션
 *   B. web3d-deck/*.mjs (signal/deck3d) — Playwright 로 직접 짠 프레임 캡처
 * 둘 중 어느 쪽도 건드리지 않는다. B 를 HyperFrames 로 갈아끼우는 안도 있었지만,
 * 잘 돌아가는 발행 경로를 바꾸는 위험을 지금 질 이유가 없다. 엔진을 하나 더 만들면
 * 기존 영상은 한 프레임도 안 바뀌고, 새 엔진은 실패해도 고르지 않으면 그만이다.
 *
 * ★A 의 자산을 그대로 쓴다★
 * 대본 생성(1단계)·나레이션 생성(2단계)은 손대지 않는다. 이 모듈은 3단계(렌더)만
 * 대체하므로, manifest.json 과 out/audio/<sceneId>.mp3 를 그대로 읽는다.
 * 자막 분절도 beats.ts 를 import 해서 쓴다 — 그 파일은 import 가 하나도 없는 순수
 * TS 라 Node 에서 그냥 돌아간다. 베껴 오면 "1,411원 안 쪼개기"·"꾸밈말 안 매달기"
 * 같은 고친 규칙이 두 벌이 되어 한쪽만 낡는다. 한 벌로 둔다.
 *
 * ★결정론★
 * B 의 프레임 캡처는 `waitForTimeout(45)` 로 "이 정도면 그렸겠지" 하고 기다린다.
 * 러너가 느린 날엔 실행마다 결과가 달라진다. HyperFrames 는 Chrome 의 BeginFrame 으로
 * 프레임마다 타임라인을 seek 하므로 같은 입력이면 같은 출력이 나온다. GSAP 타임라인을
 * paused 로 만들어 window.__timelines 에 넘겨주는 것이 그 계약이다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { RenderManifest } from '../schema.js';
import { captionChunks } from '../remotion/components/beats.js';

const require_ = createRequire(import.meta.url);

/** HyperFrames 가 요구하는 최소 Node 메이저 버전 (package.json engines: ">=22"). */
const MIN_NODE_MAJOR = 22;

/**
 * hyper 엔진을 쓸 수 있는 환경인지 파이프라인 맨 앞에서 확인한다.
 *
 * ★왜 렌더 직전이 아니라 맨 앞인가★ 렌더는 3단계다. 그 앞의 대본 생성(Claude)과
 * 나레이션(ElevenLabs)은 이미 돈이 나간 뒤다. Node 가 낮아 렌더러가 시작도 못 하는
 * 상황이면, 확인이 늦을수록 "돈은 다 쓰고 결과물은 없는" 실행이 된다. 공짜로 알 수 있는
 * 사실은 공짜인 동안 확인한다.
 */
export function assertHyperRuntime(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      `hyper 엔진은 Node ${MIN_NODE_MAJOR} 이상이 필요합니다 (현재 ${process.versions.node}). ` +
        '워크플로의 actions/setup-node node-version 을 확인하세요.',
    );
  }
}

/** 씬 배경색 — 순서대로 돌려 쓴다. 씬이 바뀐 것이 색으로 먼저 보이게 하려는 것. */
const FIELDS = ['#0b0d10', '#101820', '#0d1117', '#121016'];
const ACCENT = '#ffd43b';
const SUB = '#8fb8ff';

/** HTML 특수문자 이스케이프 — 대본은 사용자 입력이라 그대로 넣으면 마크업이 깨진다. */
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 프레임 → 초. HyperFrames 의 data-start/data-duration 은 초 단위다. */
const sec = (frames: number, fps: number) => Math.max(0, frames / fps);

/**
 * 씬 본문 — visual 종류에 따라 다른 마크업을 만든다.
 * 도식 4종(metric/bars/comparison/diagram)은 A 와 같은 데이터를 쓰되 표현만 다르게 간다.
 */
function sceneBody(scene: RenderManifest['scenes'][number], idx: number): string {
  const v = scene.visual;

  if (v === 'metric' && scene.metric?.value) {
    return `
      <div class="metric" id="m${idx}">${esc(scene.metric.value)}</div>
      <div class="metric-label" id="ml${idx}">${esc(scene.metric.label ?? '')}</div>`;
  }

  if (v === 'bars' && scene.bars?.items?.length) {
    const items = scene.bars.items;
    // 막대 길이는 최댓값 기준 비율이다. 최댓값이 0 이면 나눗셈이 NaN 이 되어
    // 막대가 통째로 사라지므로 하한을 둔다.
    const max = Math.max(...items.map((it) => Number(it.value) || 0), 1);
    const rows = items
      .map((it, i) => {
        const pct = Math.max(2, (Number(it.value) / max) * 100);
        const top = Number(it.value) >= max;
        return `<div class="bar-row" id="b${idx}_${i}">
          <div class="bar-label">${esc(it.label)}</div>
          <div class="bar-track"><div class="bar-fill${top ? ' top' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="bar-value">${esc(String(it.value))}${esc(scene.bars?.unit ?? '')}</div>
        </div>`;
      })
      .join('\n');
    return `<div class="bars">${rows}</div>`;
  }

  if (v === 'comparison' && scene.comparison) {
    const c = scene.comparison;
    const col = (title: string, items: string[]) =>
      `<div class="col"><div class="col-title">${esc(title)}</div>${(items ?? [])
        .map((t) => `<div class="col-item">${esc(t)}</div>`)
        .join('')}</div>`;
    return `<div class="compare" id="c${idx}">
      ${col(c.leftTitle, c.leftItems)}
      <div class="vs">vs</div>
      ${col(c.rightTitle, c.rightItems)}
    </div>`;
  }

  if (v === 'diagram' && scene.diagram?.nodes?.length) {
    const nodes = scene.diagram.nodes;
    return `<div class="flow" id="d${idx}">${nodes
      .map(
        (n, i) =>
          `<div class="node">${esc(n.label)}</div>${i < nodes.length - 1 ? '<div class="arrow">→</div>' : ''}`,
      )
      .join('')}</div>`;
  }

  // bullets / quote / 그 밖 — 요점을 한 줄씩 세운다.
  const lines = scene.bullets?.length ? scene.bullets : [];
  if (lines.length) {
    return `<div class="bullets">${lines
      .map((b, i) => `<div class="bullet" id="p${idx}_${i}">${esc(b)}</div>`)
      .join('')}</div>`;
  }
  return '';
}

/** manifest 하나를 통째로 HyperFrames 컴포지션 HTML 로 만든다. */
export function buildComposition(manifest: RenderManifest): string {
  const fps = manifest.fps;
  const W = manifest.width;
  const H = manifest.height;
  const total = sec(manifest.totalDurationInFrames, fps);

  const clips: string[] = [];
  const tweens: string[] = [];

  manifest.scenes.forEach((scene, idx) => {
    const start = sec(scene.startFrame, fps);
    const dur = sec(scene.durationInFrames, fps);
    const field = FIELDS[idx % FIELDS.length];

    clips.push(`
      <div class="scene clip" id="s${idx}" data-start="${start.toFixed(3)}" data-duration="${dur.toFixed(3)}"
           data-track-index="1" style="background:${field}">
        <div class="heading" id="h${idx}">${esc(scene.heading)}</div>
        <div class="body">${sceneBody(scene, idx)}</div>
        ${scene.sourceNote ? `<div class="source">${esc(scene.sourceNote)}</div>` : ''}
      </div>`);

    // 씬 안의 등장 애니메이션 — 타임라인 절대 시각(start)에 얹는다.
    tweens.push(`tl.from("#h${idx}", {opacity:0, y:-24, duration:0.5, ease:"power2.out"}, ${start.toFixed(3)});`);
    tweens.push(
      `tl.from("#s${idx} .body", {opacity:0, y:28, duration:0.6, ease:"power3.out"}, ${(start + 0.15).toFixed(3)});`,
    );

    // ★자막★ A 와 같은 분절 규칙(beats.ts)을 그대로 쓴다.
    // ★speechFrames 를 반드시 넘긴다★ 씬 길이에는 끝 여백(TAIL_PAD_FRAMES, 0.6초)이 붙어 있어서,
    // 그 전체에 자막을 비례 배분하면 씬 끝으로 갈수록 소리보다 최대 0.6초 늦는다(A 에서 겪은 버그).
    // manifest 에는 실제 오디오 길이가 durationSec 로 들어 있으니 그것을 프레임으로 바꿔 넘긴다.
    const speechFrames = Math.round(scene.durationSec * fps);
    const chunks = captionChunks(scene.narration, scene.durationInFrames, 16, speechFrames);
    chunks.forEach((ch) => {
      const cs = start + sec(ch.start, fps);
      const cd = Math.max(0.2, sec(ch.end - ch.start, fps));
      clips.push(
        `<div class="caption clip" data-start="${cs.toFixed(3)}" data-duration="${cd.toFixed(3)}" data-track-index="2">${esc(ch.text)}</div>`,
      );
    });

    // 나레이션 오디오 — 씬 시작에 맞춰 깐다.
    clips.push(
      `<audio data-start="${start.toFixed(3)}" data-duration="${dur.toFixed(3)}" data-track-index="10" data-volume="1" src="audio/${scene.id}.mp3"></audio>`,
    );
  });

  // 배경음악 — 전체 길이에 깔고 나레이션에 묻히지 않게 낮춘다.
  if (manifest.bgm) {
    clips.push(
      `<audio data-start="0" data-duration="${total.toFixed(3)}" data-track-index="11" data-volume="0.18" src="${esc(manifest.bgm)}"></audio>`,
    );
  }

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<!-- ★GSAP 은 로컬 파일이다★ 스캐폴드 기본값은 jsdelivr CDN 인데, 렌더가 외부
     네트워크에 의존하면 프록시·차단 환경에서 조용히 무너진다. node_modules 에서 복사해 쓴다. -->
<script src="gsap.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${W}px; height:${H}px; overflow:hidden; background:#000; }
  body { font-family:"Pretendard","Noto Sans CJK KR","NanumGothic",sans-serif; color:#fff;
         word-break:keep-all; }
  .clip { position:absolute; }
  /* ★본문을 세로 가운데에 둔다★ 처음엔 위에서부터 쌓았더니 내용이 화면 위쪽 40% 에만
     몰리고 가운데가 텅 비어 미완성처럼 보였다. 자막이 앉을 아래쪽(220px)을 미리 비워 두고,
     남은 공간의 한가운데에 본문을 놓는다. */
  .scene { left:0; top:0; width:${W}px; height:${H}px; padding:96px 120px;
           display:flex; flex-direction:column; }
  .heading { font-size:52px; font-weight:800; color:${SUB}; letter-spacing:-1px; flex:0 0 auto; }
  .body { flex:1 1 auto; display:flex; flex-direction:column; justify-content:center;
          padding-bottom:220px; }
  .source { position:absolute; left:120px; bottom:64px; font-size:24px; color:#6b7684; }

  .metric { font-size:230px; font-weight:900; color:${ACCENT}; letter-spacing:-6px; line-height:1.05; }
  .metric-label { font-size:46px; color:#c9d1d9; margin-top:16px; }

  .bars { display:flex; flex-direction:column; gap:28px; max-width:1500px; }
  .bar-row { display:flex; align-items:center; gap:24px; font-size:38px; }
  .bar-label { width:340px; color:#c9d1d9; }
  .bar-track { flex:1; height:52px; background:#1b2028; border-radius:6px; overflow:hidden; }
  .bar-fill { height:100%; background:#4b6b9a; }
  .bar-fill.top { background:${ACCENT}; }
  .bar-value { width:190px; text-align:right; font-weight:800; }

  .compare { display:flex; align-items:flex-start; gap:56px; }
  .col { flex:1; }
  .col-title { font-size:46px; font-weight:800; margin-bottom:24px; color:${ACCENT}; }
  .col-item { font-size:36px; color:#c9d1d9; margin-bottom:16px; }
  .vs { font-size:40px; color:#6b7684; padding-top:12px; }

  .flow { display:flex; align-items:center; flex-wrap:wrap; gap:20px; }
  .node { border:3px solid #4b6b9a; border-radius:14px; padding:22px 30px; font-size:34px; }
  .arrow { font-size:40px; color:#6b7684; }

  .bullets { display:flex; flex-direction:column; gap:26px; }
  .bullet { font-size:44px; color:#e6edf3; }

  .caption { left:120px; bottom:150px; width:${W - 240}px; text-align:center;
             font-size:52px; font-weight:700; line-height:1.35;
             text-shadow:0 4px 18px rgba(0,0,0,.85); }
</style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${total.toFixed(3)}"
       data-width="${W}" data-height="${H}">
${clips.join('\n')}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    // ★paused 여야 한다★ 렌더러가 프레임마다 이 타임라인을 seek 한다.
    // 재생 상태로 두면 벽시계 시간에 따라 흘러가 결정론이 깨진다.
    const tl = gsap.timeline({ paused: true });
${tweens.join('\n')}
    window.__timelines["main"] = tl;
  </script>
</body>
</html>
`;
}

/**
 * ffmpeg / ffprobe 를 PATH 에 올린 임시 bin 디렉터리를 만든다.
 *
 * ★왜 필요한가★ HyperFrames 는 시스템 PATH 의 ffmpeg·ffprobe 를 찾는다. 이 저장소는
 * ffmpeg-static(ffmpeg 만) 을 쓰고 ffprobe 는 없다. 다행히 Remotion 이 ffprobe 를 같이
 * 깔아둬서 그 둘을 심볼릭 링크로 모아 PATH 앞에 붙인다. 워크플로에 apt-get 을 추가하는
 * 것보다 낫다 — 러너 이미지가 바뀌어도 저장소만으로 자립한다.
 */
async function ensureFfmpegOnPath(dir: string): Promise<string> {
  const binDir = path.join(dir, '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const ffmpeg = require_('ffmpeg-static') as string;
  // Remotion 의 compositor 패키지는 플랫폼별로 이름이 갈린다(gnu/musl 등).
  let ffprobe = '';
  for (const pkg of [
    '@remotion/compositor-linux-x64-gnu',
    '@remotion/compositor-linux-x64-musl',
    '@remotion/compositor-linux-arm64-gnu',
    '@remotion/compositor-darwin-arm64',
  ]) {
    try {
      ffprobe = path.join(path.dirname(require_.resolve(`${pkg}/package.json`)), 'ffprobe');
      await fs.access(ffprobe);
      break;
    } catch {
      ffprobe = '';
    }
  }
  if (!ffprobe) throw new Error('ffprobe 를 찾지 못했습니다 (Remotion compositor 패키지 확인)');

  for (const [src, name] of [
    [ffmpeg, 'ffmpeg'],
    [ffprobe, 'ffprobe'],
  ] as const) {
    const dest = path.join(binDir, name);
    await fs.rm(dest, { force: true });
    await fs.symlink(src, dest);
  }
  return binDir;
}

/** 프로젝트 디렉터리를 꾸리고 hyperframes CLI 로 렌더한다. */
export async function renderHyperVideo(manifest: RenderManifest, outPath: string): Promise<void> {
  const outDir = path.dirname(outPath);
  const projectDir = path.join(outDir, 'hyper');
  await fs.mkdir(projectDir, { recursive: true });

  // GSAP 을 프로젝트 안으로 복사 (CDN 의존 제거)
  const gsapSrc = path.join(path.dirname(require_.resolve('gsap/package.json')), 'dist', 'gsap.min.js');
  await fs.copyFile(gsapSrc, path.join(projectDir, 'gsap.min.js'));

  // 오디오는 out/audio 에 이미 있다. 컴포지션이 상대경로로 읽도록 심볼릭 링크를 건다.
  const audioLink = path.join(projectDir, 'audio');
  await fs.rm(audioLink, { force: true, recursive: true });
  await fs.symlink(path.join(outDir, 'audio'), audioLink, 'dir');

  await fs.writeFile(path.join(projectDir, 'index.html'), buildComposition(manifest), 'utf8');

  const binDir = await ensureFfmpegOnPath(projectDir);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      // ★dist/cli.js 가 아니라 공식 bin 을 부른다★ bin 래퍼가 Node 버전 확인 등
      // 사전 점검을 하고 들어간다. 내부 파일을 직접 부르면 그 점검을 건너뛰게 되고,
      // 패키지 내부 구조가 바뀌면 조용히 깨진다.
      [
        require_.resolve('hyperframes/bin/hyperframes.mjs'),
        'render',
        projectDir,
        '-o',
        outPath,
        '--fps',
        String(manifest.fps),
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
          // 렌더 파이프라인에서 익명 사용량 전송을 끈다 — 발행 자동화가 외부로
          // 신호를 보낼 이유가 없고, 네트워크가 막힌 환경에서 지연 요인이 된다.
          HYPERFRAMES_TELEMETRY_DISABLED: '1',
          HYPERFRAMES_SKIP_SKILLS: '1',
        },
      },
    );
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`hyperframes 종료 코드 ${code}`))));
  });
}
