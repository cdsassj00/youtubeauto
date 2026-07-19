import React from 'react';
import { Composition } from 'remotion';
import { AiVideo } from './Video.js';
import type { RenderManifest } from '../schema.js';

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

/** 스튜디오 미리보기용 최소 샘플 (실제 렌더 시엔 inputProps 로 매니페스트가 주입됨). */
const sampleManifest: RenderManifest = {
  title: '샘플 미리보기',
  topic: 'AI 기초',
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  totalDurationInFrames: FPS * 12,
  createdAt: new Date(0).toISOString(),
  scenes: [
    {
      id: 's1',
      heading: 'AI 는 어떻게 생각할까?',
      narration: '오늘은 인공지능이 어떻게 작동하는지 아주 쉽게 알아봅니다. 준비되셨나요?',
      bullets: ['핵심만, 쉽게, 그림으로'],
      visual: 'title',
      startFrame: 0,
      durationInFrames: FPS * 6,
      audioPath: 'audio/s1.mp3',
      durationSec: 6,
    },
    {
      id: 's2',
      heading: '3단계로 이해하기',
      narration: '첫째 입력, 둘째 처리, 셋째 출력. 이 흐름만 기억하면 됩니다.',
      bullets: ['입력을 받는다', '패턴을 계산한다', '결과를 내놓는다'],
      visual: 'diagram',
      diagram: {
        nodes: [
          { id: 'in', label: '입력' },
          { id: 'model', label: '모델' },
          { id: 'out', label: '출력' },
        ],
        edges: [
          { from: 'in', to: 'model' },
          { from: 'model', to: 'out' },
        ],
      },
      startFrame: FPS * 6,
      durationInFrames: FPS * 6,
      audioPath: 'audio/s2.mp3',
      durationSec: 6,
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AiExplainer"
      component={AiVideo}
      durationInFrames={sampleManifest.totalDurationInFrames}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={sampleManifest}
      calculateMetadata={({ props }) => {
        const m = props as RenderManifest;
        return {
          durationInFrames: Math.max(1, m.totalDurationInFrames),
          fps: m.fps || FPS,
          width: m.width || WIDTH,
          height: m.height || HEIGHT,
        };
      }}
    />
  );
};
