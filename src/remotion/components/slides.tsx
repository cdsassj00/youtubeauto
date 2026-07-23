import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme as defaultTheme, nodeColors, type VisualTheme } from '../theme.js';
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
export const BulletSlide: React.FC<{
  heading: string;
  bullets: string[];
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
}> = ({ heading, bullets, narration, durationInFrames, theme = defaultTheme }) => {
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

const MONO = "'SFMono-Regular', 'Consolas', 'Menlo', 'Liberation Mono', monospace";

/**
 * 실제 파일/코드 예시 한 화면 — 에디터 창처럼 보이는 다크 카드에 줄 단위로 코드가 타이핑되듯 나타난다.
 * "추상적 표현만 하고 구체적으로 설명 안 한다"는 피드백에 대한 대응: 개념을 말로만 풀지 않고
 * 실제 파일명·설정·코드 한 조각을 화면에 그대로 보여준다.
 */
export const CodeSlide: React.FC<{
  filename: string;
  language: string;
  code: string;
  narration: string;
  durationInFrames: number;
}> = ({ filename, code, narration, durationInFrames }) => {
  const frame = useCurrentFrame();
  const lines = code.split('\n').slice(0, 16);
  const revealAt = revealFrames(narration, durationInFrames, lines.length, { head: 0.1, tail: 0.85 });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: 1420,
          borderRadius: 22,
          background: '#1c1e26',
          boxShadow: '0 26px 60px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '22px 28px',
            borderBottom: '1px solid #2e313d',
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#28c840' }} />
          <div style={{ marginLeft: 16, fontFamily: MONO, fontSize: 30, color: '#8a8fa3' }}>{filename}</div>
        </div>
        <div style={{ padding: '32px 40px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {lines.map((line, i) => {
            const at = revealAt[i] ?? 0;
            const pop = interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (pop <= 0) return null;
            return (
              <div key={i} style={{ display: 'flex', gap: 24, opacity: pop }}>
                <div style={{ width: 44, textAlign: 'right', fontFamily: MONO, fontSize: 30, color: '#4d5266', flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 32,
                    lineHeight: 1.5,
                    color: '#d7dae2',
                    whiteSpace: 'pre',
                  }}
                >
                  {line || ' '}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 한 문장을 크게 강조하는 인용구 슬라이드. */
export const QuoteSlide: React.FC<{ text: string; durationInFrames: number; theme?: VisualTheme }> = ({
  text,
  durationInFrames,
  theme = defaultTheme,
}) => {
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
