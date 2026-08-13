import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import type { SceneWithAudio } from '../../schema.js';

/**
 * 씬에 얹는 효과음.
 *
 * ★소리는 신호이지 존재감이 아니다★
 * 목적은 "장면이 바뀌었다", "이 숫자가 중요하다"를 귀로 알려주는 것이다. 나레이션을
 * 덮으면 그 순간 말이 안 들리므로 볼륨을 낮게 잡는다(파형 자체도 sfx.ts 에서 이미
 * 최대치를 눌러 두었다 — 여기서 한 번 더 줄이는 것이다).
 *
 * ★없으면 조용히 넘어간다★
 * manifest.sfx 가 참일 때만 그린다. 효과음 파일이 없는데 staticFile 로 참조하면
 * 렌더가 통째로 실패한다 — 소리 하나 때문에 20분짜리 영상을 잃을 이유가 없다.
 */
export const SceneSfx: React.FC<{ scene: SceneWithAudio; enabled?: boolean }> = ({ scene, enabled }) => {
  if (!enabled) return null;

  // 숫자가 주인공인 씬에만 '띵' 을 얹는다. 매 씬마다 울리면 그 순간이 특별하지 않다.
  const emphasize = (scene.visual === 'metric' && Boolean(scene.metric?.value)) ||
    (scene.visual === 'bars' && Boolean(scene.bars?.items?.length));

  return (
    <>
      {/* 장면 전환 — 씬 시작에 '휙' 한 번 */}
      <Audio src={staticFile('audio/sfx/whoosh.wav')} volume={0.34} />
      {/* 숫자 등장 — 도식이 자리를 잡는 지점(약 0.6초)에 맞춰 '띵' */}
      {emphasize && (
        <Sequence from={18} durationInFrames={40}>
          <Audio src={staticFile('audio/sfx/chime.wav')} volume={0.26} />
        </Sequence>
      )}
    </>
  );
};
