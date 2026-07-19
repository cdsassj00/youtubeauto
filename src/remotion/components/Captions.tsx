import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { theme } from '../theme.js';
import { sentenceBounds } from './beats.js';

/** 나레이션을 문장 단위로 나눠 하단 자막으로 순차 표시. (비주얼 등장과 동일한 비트 타이밍 공유) */
export const Captions: React.FC<{ narration: string; durationInFrames: number }> = ({
  narration,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const bounds = sentenceBounds(narration, durationInFrames);
  if (bounds.length === 0) return null;
  const current = bounds.find((b) => frame >= b.start && frame < b.end) ?? bounds[bounds.length - 1];

  // 문장이 바뀔 때마다 통통 튀며 등장(kinetic).
  const local = frame - current.start;
  const pop = interpolate(local, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = interpolate(pop, [0, 1], [0.9, 1]);
  const lift = interpolate(pop, [0, 1], [16, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: `translateX(-50%) translateY(${lift}px) scale(${scale})`,
        opacity: pop,
        maxWidth: 1500,
        padding: '18px 32px',
        background: '#ffffffdd',
        border: `3px solid ${theme.ink}`,
        borderRadius: 18,
        boxShadow: '6px 6px 0 #00000015',
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: theme.bodyFont,
          fontSize: 38,
          lineHeight: 1.4,
          color: theme.ink,
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        {current.text}
      </p>
    </div>
  );
};
