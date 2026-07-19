import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import type { RenderManifest } from '../schema.js';
import { Paper } from './components/Layout.js';
import { SceneVisual } from './components/Scenes.js';
import { Captions } from './components/Captions.js';
import { theme } from './theme.js';

/** 전체 영상: 씬을 오디오 길이에 맞춰 순차 배치 + 전환/카메라 모션 + 배경음악. */
export const AiVideo: React.FC<RenderManifest> = (manifest) => {
  return (
    <AbsoluteFill>
      <MovingPaper />
      {manifest.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={scene.heading}>
          <SceneStage durationInFrames={scene.durationInFrames} index={i}>
            <SceneVisual scene={scene} dur={scene.durationInFrames} />
          </SceneStage>
          <Captions narration={scene.narration} durationInFrames={scene.durationInFrames} />
          <Audio src={staticFile(scene.audioPath)} />
        </Sequence>
      ))}
      {manifest.bgm && <BackgroundMusic src={manifest.bgm} total={manifest.totalDurationInFrames} />}
      <ProgressBar total={manifest.totalDurationInFrames} />
    </AbsoluteFill>
  );
};

/** 배경음악: 나레이션을 방해하지 않도록 낮은 볼륨 + 시작/끝 페이드. */
const BackgroundMusic: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const { fps } = useVideoConfig();
  const fadeIn = Math.round(fps * 1.5);
  const fadeOut = Math.round(fps * 2.5);
  const base = 0.14; // 나레이션 대비 은은하게
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(f) =>
        interpolate(
          f,
          [0, fadeIn, Math.max(fadeIn + 1, total - fadeOut), total],
          [0, base, base, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
      }
    />
  );
};

/** 씬 콘텐츠에 입장 전환 + 상시 카메라 모션(줌/패닝) + 퇴장 페이드를 입힌다. */
const SceneStage: React.FC<{ durationInFrames: number; index: number; children: React.ReactNode }> = ({
  durationInFrames,
  index,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 입장: 아래에서 슬라이드 + 페이드 인 (스프링)
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90, mass: 0.8 }, durationInFrames: 20 });
  const slideFrom = index % 2 === 0 ? 60 : -60; // 씬마다 좌우 번갈아 입장
  const tx = interpolate(enter, [0, 1], [slideFrom, 0]);
  const ty = interpolate(enter, [0, 1], [24, 0]);

  // 상시 켄번즈: 씬 내내 천천히 확대(1.0 → 1.04) + 미세 패닝(정지감 제거)
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.04], { extrapolateRight: 'clamp' });
  const panX = Math.sin(frame / 130) * 10;
  const panY = Math.cos(frame / 150) * 8;

  // 퇴장: 마지막 10프레임 페이드
  const exit = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(enter, exit),
        transform: `translate(${tx + panX}px, ${ty + panY}px) scale(${zoom})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** 종이 배경이 아주 느리게 떠다니게 해서 정적인 느낌을 없앤다. */
const MovingPaper: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 12;
  const drift2 = Math.cos(frame / 110) * 12;
  return (
    <AbsoluteFill style={{ transform: `translate(${drift}px, ${drift2}px) scale(1.05)` }}>
      <Paper />
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const pct = Math.min(1, frame / Math.max(1, total));
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, background: '#00000010' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: theme.accent }} />
    </div>
  );
};
