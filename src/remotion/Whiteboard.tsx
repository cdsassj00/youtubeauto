import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RenderManifest, SceneWithAudio } from '../schema.js';
import { captionChunks } from './components/beats.js';
import { InkReveal, drawProgress } from './components/whiteboard.js';
import { SceneSfx } from './components/Sfx.js';
import { SceneVisual } from './components/Scenes.js';

/**
 * 화이트보드 엔진 — 따뜻한 종이 위에 그림이 손으로 그려진다.
 *
 * 기법은 geeklee/srt-whiteboard-animation(MIT)에서 가져왔고, 구현은 Remotion 으로 다시 썼다.
 * ★가져오지 않은 것: 자막★ 원본은 SRT 자막을 읽어 장면을 나누고 자막도 거기서 뽑지만,
 * 우리는 이미 나레이션(2단계)과 자막 분절(beats.ts)을 갖고 있다. 그쪽을 쓰면 규칙이 두 벌이
 * 되어 "1,411원"이 쪼개지는 문제를 또 겪는다. 화면 연출만 가져온다.
 */
export const Whiteboard: React.FC<RenderManifest> = (manifest) => (
  <AbsoluteFill style={{ backgroundColor: PAPER }}>
    <PaperGrain />
    {manifest.scenes.map((scene) => (
      <Sequence
        key={scene.id}
        from={scene.startFrame}
        durationInFrames={scene.durationInFrames}
        name={scene.heading}
      >
        <Board scene={scene} />
        <Caption
          narration={scene.narration}
          durationInFrames={scene.durationInFrames}
          speechFrames={Math.round(scene.durationSec * manifest.fps)}
        />
        {scene.audioPath && <Audio src={staticFile(scene.audioPath)} />}
        <SceneSfx scene={scene} enabled={manifest.sfx} />
      </Sequence>
    ))}
    {manifest.bgm && <Bgm src={manifest.bgm} total={manifest.totalDurationInFrames} />}
  </AbsoluteFill>
);

/** 원본 프로젝트의 "따뜻한 베이지 종이"를 따랐다 — 흰 종이는 화면에서 눈이 부시다. */
const PAPER = '#F4EDE0';
const INK = '#2B2B2B';

const Board: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = drawProgress(frame, durationInFrames, fps);

  // 제목은 그림보다 먼저 손으로 쓴 것처럼 살짝 앞서 들어온다.
  const titleIn = interpolate(frame, [0, Math.round(fps * 0.5)], [0, 1], { extrapolateRight: 'clamp' });

  // ★그림이 없는 씬은 손그림 도식 렌더러에 통째로 맡긴다★
  // 예전엔 불릿 목록으로 떨어뜨렸는데, 실제 회차를 재보니 도식 13개 중 12개가
  // diagram/comparison 이었다(k-dg9-cp3). 그 12개가 전부 글머리표 나열이 됐을 것이다.
  // SceneVisual 은 이미 rough.js 로 선을 그려 나가는 컴포넌트라 화이트보드 결과도 맞고,
  // 손그림 엔진과 코드를 공유하므로 한쪽만 낡을 일도 없다.
  if (!scene.imagePath) {
    // ★도식에는 띠 마스크를 쓰지 않는다★
    // 한때 그림 씬과 같은 마스크를 도식에도 씌우고 dur 을 0.6초로 뭉갰다. 결과가 나빴다:
    // 도식은 상자 몇 개가 화면 위쪽에 모여 있어서 띠가 그 구간을 지나는 순간 한 줄이
    // 통째로 나타났고(그리는 게 아니라 튀어나오는 것으로 보였다), 그 뒤 손은 아무것도 없는
    // 빈 종이를 계속 쓸고 다녔다. 게다가 SceneVisual 이 원래 갖고 있던 "나레이션에 맞춰
    // 요소를 하나씩" 연출까지 그 짧은 dur 이 죽였다.
    //
    // 띠 마스크는 사진처럼 화면을 꽉 채운 그림에서만 그럴듯하다. 도식은 요소가 띄엄띄엄
    // 놓인 그림이라, 요소 단위로 그려야 손으로 그리는 것처럼 보인다. 그래서 씬 길이를
    // 그대로 넘겨 원래의 순차 등장을 살리고(상자는 rough.js 로 선이 그어지며 나타난다),
    // 손은 SceneVisual 안에서 지금 그리는 상자 테두리를 따라가게 한다(hand).
    return (
      <AbsoluteFill>
        <SceneVisual scene={scene} dur={durationInFrames} hand />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 76,
          right: 120,
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 14}px)`,
          fontFamily: 'Pretendard, sans-serif',
          fontSize: 58,
          fontWeight: 800,
          color: INK,
          letterSpacing: '-.03em',
          wordBreak: 'keep-all',
        }}
      >
        {scene.heading}
        {/* 제목 밑줄 — 진행도에 맞춰 그어진다(그리는 중이라는 신호). */}
        <div
          style={{
            marginTop: 14,
            height: 6,
            width: `${Math.min(100, titleIn * 100)}%`,
            maxWidth: 620,
            background: '#E8B21E',
            borderRadius: 3,
          }}
        />
      </div>

      {/* 그림판 — 자막 자리를 비워 두고 가운데에 크게. */}
      <div style={{ position: 'absolute', left: 180, right: 180, top: 220, bottom: 250 }}>
        <InkReveal src={scene.imagePath} progress={p} />
      </div>
    </AbsoluteFill>
  );
};

/** 종이 결 — 완전히 균일한 색은 화면에서 인쇄물처럼 죽는다. 아주 옅게만. */
const PaperGrain: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        'radial-gradient(circle at 20% 15%, rgba(0,0,0,.020) 0 1px, transparent 1px),' +
        'radial-gradient(circle at 70% 60%, rgba(0,0,0,.016) 0 1px, transparent 1px)',
      backgroundSize: '7px 7px, 11px 11px',
    }}
  />
);

/** 자막 — 다른 엔진과 같은 분절 규칙(beats.ts). 종이 배경이라 글자는 진한 잉크색이다. */
const Caption: React.FC<{ narration: string; durationInFrames: number; speechFrames: number }> = ({
  narration,
  durationInFrames,
  speechFrames,
}) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 16, speechFrames);
  const cur = chunks.find((c) => frame >= c.start && frame < c.end) ?? chunks[chunks.length - 1];
  if (!cur) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 140,
        right: 140,
        bottom: 96,
        textAlign: 'center',
        fontFamily: 'Pretendard, sans-serif',
        fontSize: 50,
        fontWeight: 700,
        color: INK,
        lineHeight: 1.35,
        wordBreak: 'keep-all',
      }}
    >
      {cur.text}
    </div>
  );
};

const Bgm: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(frame, [0, fps * 2, total - fps * 3, total], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile(src)} volume={0.09 * fade} loop />;
};
