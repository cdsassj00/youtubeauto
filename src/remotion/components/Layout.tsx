import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { theme } from '../theme.js';
import { Highlighter } from './Rough.js';

/** 종이 배경 + 은은한 점 격자. */
export const Paper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: theme.paper }}>
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="#00000010" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
    {children}
  </AbsoluteFill>
);

/** 프레임 진행도(0..1) — 시작 프레임부터 duration 동안 선형. */
export function useDrawProgress(startFrame: number, durationFrames: number): number {
  const frame = useCurrentFrame();
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** 스프링 기반 등장(팝인). */
export function usePopIn(startFrame: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.7 },
    durationInFrames: 20,
  });
}

/** 화면 상단 손글씨 제목 + 형광펜 밑줄. */
export const Heading: React.FC<{ text: string; color?: string }> = ({
  text,
  color = theme.accent,
}) => {
  const pop = usePopIn(4);
  const underline = useDrawProgress(14, 18);
  const approxWidth = Math.min(text.length * 42 + 40, 1500);
  return (
    <div style={{ position: 'absolute', top: 70, left: 110, right: 110 }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <svg
          width={approxWidth}
          height={40}
          style={{ position: 'absolute', bottom: -8, left: -10 }}
        >
          <Highlighter x={0} y={8} width={approxWidth - 20} color={theme.highlight} progress={underline} />
        </svg>
        <h1
          style={{
            fontFamily: theme.handFont,
            fontSize: 68,
            color: theme.ink,
            margin: 0,
            transform: `scale(${0.8 + pop * 0.2})`,
            transformOrigin: 'left center',
            opacity: pop,
            position: 'relative',
          }}
        >
          {text}
        </h1>
      </div>
      <div style={{ height: 6 }} />
      <div style={{ width: 220, height: 6, background: color, borderRadius: 3, opacity: pop }} />
    </div>
  );
};
