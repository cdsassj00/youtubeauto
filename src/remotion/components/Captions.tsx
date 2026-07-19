import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { theme } from '../theme.js';

/** 나레이션을 문장 단위로 나눠 하단 자막으로 순차 표시. */
export const Captions: React.FC<{ narration: string; durationInFrames: number }> = ({
  narration,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const sentences = splitSentences(narration);
  if (sentences.length === 0) return null;

  // 각 문장에 글자 수 비례로 시간 배분.
  const totalChars = sentences.reduce((s, t) => s + t.length, 0) || 1;
  let acc = 0;
  const bounds = sentences.map((t) => {
    const start = acc / totalChars;
    acc += t.length;
    const end = acc / totalChars;
    return { text: t, start: start * durationInFrames, end: end * durationInFrames };
  });
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

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!…。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
