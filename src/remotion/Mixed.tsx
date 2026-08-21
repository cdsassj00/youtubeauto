/**
 * 한 영상 안에서 씬마다 화풍을 바꿔 그리는 컴포지션.
 *
 * ★왜 필요한가★ 기존 컴포지션들은 각자 영상 전체를 하나의 화풍으로 그린다. 3~5분짜리는
 * 그걸로 버티지만, 미드폼(8~10분)을 한 화풍으로 채우면 중반에 화면이 지겨워진다. 도식 →
 * 손그림 → 화이트보드 → 목록처럼 갈아입혀야 끝까지 본다.
 *
 * ★구현에서 걸리는 것 두 가지★
 *  1. 각 엔진은 배경(AbsoluteFill)을 자기 Sequence 바깥에 깐다. 그대로 겹쳐 놓으면 그 배경이
 *     영상 내내 화면을 덮는다. 그래서 엔진마다 Sequence 로 감싸고, 넘겨주는 씬의 startFrame 을
 *     0 으로 바꿔 Sequence 안쪽 시간축에 맞춘다.
 *  2. 모든 엔진이 manifest.bgm 을 보고 배경음을 깐다. 씬 수만큼 배경음이 겹쳐 소리가 뭉갠다.
 *     그래서 씬별 매니페스트에서는 bgm 을 비우고, 배경음은 여기서 한 번만 깐다.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AiVideo } from './Video.js';
import { AiIllustrated } from './Illustrated.js';
import { Scrapbook } from './Scrapbook.js';
import { Whiteboard } from './Whiteboard.js';
import { Listing } from './Listing.js';
import { Footage } from './Footage.js';
import { StockScene, StockCaption } from './stock/StockScene.js';
import type { RenderManifest, SceneWithAudio } from '../schema.js';

const ENGINES = {
  standard: AiVideo,
  illustrated: AiIllustrated,
  scrapbook: Scrapbook,
  whiteboard: Whiteboard,
  listing: Listing,
  footage: Footage,
} as const;

export type EngineName = keyof typeof ENGINES;

export const Mixed: React.FC<RenderManifest> = (manifest) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    {manifest.scenes.map((scene) => {
      // ★주식 전용 화면은 매니페스트를 통째로 넘기지 않는다★ 값 하나를 그리는 컴포넌트라
      // 씬만 있으면 되고, 자막·오디오는 여기서 얹는다.
      if (scene.engine === 'stock') {
        return (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={`stock · ${scene.heading}`}>
            <StockScene scene={scene as SceneWithAudio} />
            {/* ★자막은 여기서 얹는다고 주석엔 적혀 있었지만 실제로는 안 얹혀 있었다★
                소리를 끄고 보거나 발음이 흔들리는 대목에서도 이걸로 따라갈 수 있어야 한다. */}
            <StockCaption
              narration={scene.captionText ?? scene.narration}
              durationInFrames={scene.durationInFrames}
              speechFrames={Math.round((scene as SceneWithAudio).durationSec * manifest.fps)}
            />
            {scene.audioPath && <Audio src={staticFile(scene.audioPath)} />}
          </Sequence>
        );
      }
      const name = (scene.engine ?? 'standard') as EngineName;
      const Engine = ENGINES[name] ?? AiVideo;
      const one: RenderManifest = {
        ...manifest,
        bgm: undefined,
        totalDurationInFrames: scene.durationInFrames,
        scenes: [{ ...scene, startFrame: 0 }],
      };
      return (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={`${name} · ${scene.heading}`}
        >
          <Engine {...one} />
        </Sequence>
      );
    })}
    {manifest.bgm && <Bgm src={manifest.bgm} total={manifest.totalDurationInFrames} />}
  </AbsoluteFill>
);

const Bgm: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(frame, [0, fps * 2, total - fps * 3, total], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile(src)} volume={0.09 * fade} loop />;
};
