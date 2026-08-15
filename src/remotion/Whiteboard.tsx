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
        {scene.imagePath ? (
          <InkReveal src={scene.imagePath} progress={p} />
        ) : (
          <BulletBoard scene={scene} progress={p} />
        )}
      </div>
    </AbsoluteFill>
  );
};

/**
 * 그림이 없는 씬(도입·마무리·인용 등)은 요점을 한 줄씩 손으로 적어 나가는 것처럼 보여준다.
 * 빈 화면을 오래 두면 "그리는 영상"의 리듬이 끊긴다.
 */
const BulletBoard: React.FC<{ scene: SceneWithAudio; progress: number }> = ({ scene, progress }) => {
  const lines = scene.bullets.length ? scene.bullets : [scene.heading];
  const shown = Math.ceil(progress * lines.length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34, justifyContent: 'center', height: '100%' }}>
      {lines.map((b, i) => {
        // 각 줄이 자기 차례에 왼쪽에서 밀려 들어온다.
        const local = Math.max(0, Math.min(1, progress * lines.length - i));
        if (i >= shown) return null;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 22,
              opacity: local,
              transform: `translateX(${(1 - local) * 24}px)`,
              fontFamily: 'Pretendard, sans-serif',
              fontSize: 46,
              fontWeight: 600,
              color: INK,
              wordBreak: 'keep-all',
            }}
          >
            <span style={{ color: '#E8B21E', fontWeight: 900 }}>—</span>
            <span>{b}</span>
          </div>
        );
      })}
    </div>
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
