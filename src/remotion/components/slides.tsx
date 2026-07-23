import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme, nodeColors } from '../theme.js';
import { PRETENDARD } from '../pretendard.js';
import { revealFrames } from './beats.js';

/**
 * 발표자료(프레젠테이션 슬라이드) 스타일 컴포넌트.
 *
 * 이전엔 diagram/comparison 을 뺀 모든 씬(특히 bullets/quote)이 AI 그림 한 장으로
 * 렌더돼 영상 전체가 "맨날 같은 그림"처럼 보였다. bullets/quote 씬은 이미 구조화된
 * 텍스트 데이터가 있으니, AI 그림 대신 실제 발표자료처럼 코드로 그려서 시각적 변주를 준다.
 */

/** 번호 매긴 불릿 리스트 슬라이드 — 나레이션 타이밍에 맞춰 한 줄씩 등장. */
export const BulletSlide: React.FC<{ heading: string; bullets: string[]; narration: string; durationInFrames: number }> = ({
  heading,
  bullets,
  narration,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const items = bullets.slice(0, 6);
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.72 });
  const breathe = 1 + Math.sin(frame / 140) * 0.01;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${breathe})`, width: 1500 }}>
        <div
          style={{
            fontFamily: PRETENDARD,
            fontWeight: 800,
            fontSize: 66,
            color: theme.ink,
            marginBottom: 64,
            borderLeft: `12px solid ${theme.accent}`,
            paddingLeft: 32,
          }}
        >
          {heading}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {items.map((text, i) => {
            const at = revealAt[i] ?? 0;
            const pop = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (pop <= 0) return null;
            const color = nodeColors[i % nodeColors.length];
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 32,
                  opacity: pop,
                  transform: `translateX(${(1 - pop) * -40}px)`,
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 76,
                    height: 76,
                    borderRadius: 20,
                    background: color,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: PRETENDARD,
                    fontWeight: 800,
                    fontSize: 36,
                    boxShadow: '0 6px 0 rgba(0,0,0,0.08)',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontFamily: PRETENDARD, fontWeight: 700, fontSize: 52, color: theme.ink, lineHeight: 1.35 }}>{text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 한 문장을 크게 강조하는 인용구 슬라이드. */
export const QuoteSlide: React.FC<{ text: string; durationInFrames: number }> = ({ text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const settle = interpolate(frame, [0, 20], [0.94, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0.85], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 260px' }}>
      <div
        style={{
          fontFamily: PRETENDARD,
          fontWeight: 900,
          fontSize: 210,
          color: theme.accent,
          opacity: 0.16,
          position: 'absolute',
          top: 90,
          left: 140,
        }}
      >
        “
      </div>
      <div
        style={{
          opacity: pop * fadeOut,
          transform: `scale(${settle})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: PRETENDARD,
            fontWeight: 800,
            fontSize: 64,
            lineHeight: 1.45,
            color: theme.ink,
          }}
        >
          {text}
        </div>
        <div style={{ width: 140, height: 6, background: theme.accent, margin: '44px auto 0', borderRadius: 3 }} />
      </div>
    </AbsoluteFill>
  );
};
