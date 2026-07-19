import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import type { RenderManifest } from '../schema.js';
import { Paper } from './components/Layout.js';
import { SceneVisual } from './components/Scenes.js';
import { Captions } from './components/Captions.js';
import { theme } from './theme.js';

/** 전체 영상: 씬을 오디오 길이에 맞춰 순차 배치. */
export const AiVideo: React.FC<RenderManifest> = (manifest) => {
  return (
    <AbsoluteFill>
      <Paper />
      {manifest.scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={scene.heading}>
          <SceneVisual scene={scene} />
          <Captions narration={scene.narration} durationInFrames={scene.durationInFrames} />
          <Audio src={staticFile(scene.audioPath)} />
        </Sequence>
      ))}
      <ProgressBar total={manifest.totalDurationInFrames} />
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
