import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme as defaultTheme, nodeColors, type VisualTheme } from '../theme.js';
import { PRETENDARD } from '../pretendard.js';
import { revealFrames } from './beats.js';

/**
 * 발표자료(프레젠테이션 슬라이드) 스타일 컴포넌트.
 *
 * "같은 종류 슬라이드가 매번 똑같은 디자인으로 반복된다"는 피드백에 대응해, 각 종류마다
 * 여러 디자인(variant)을 두고 씬 순번(seed)으로 돌려쓴다. 같은 bullets 라도 씬마다
 * 번호 리스트 / 2단 그리드 / 큰 숫자 에디토리얼 / 좌측 컬러바 카드 로 번갈아 나온다.
 */

// ─────────────────────────── BULLETS ───────────────────────────

const BULLET_VARIANTS = 4;

export const BulletSlide: React.FC<{
  heading: string;
  bullets: string[];
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
  seed?: number;
}> = ({ heading, bullets, narration, durationInFrames, theme = defaultTheme, seed = 0 }) => {
  const variant = ((seed % BULLET_VARIANTS) + BULLET_VARIANTS) % BULLET_VARIANTS;
  if (variant === 1) return <BulletGrid heading={heading} bullets={bullets} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  if (variant === 2) return <BulletBigNumber heading={heading} bullets={bullets} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  if (variant === 3) return <BulletBarCards heading={heading} bullets={bullets} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  return <BulletNumberedList heading={heading} bullets={bullets} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
};

type SlideInner = {
  heading: string;
  bullets: string[];
  narration: string;
  durationInFrames: number;
  theme: VisualTheme;
};

const Heading: React.FC<{ text: string; theme: VisualTheme; align?: 'left' | 'center' }> = ({ text, theme, align = 'left' }) => (
  <div
    style={{
      fontFamily: PRETENDARD,
      fontWeight: 800,
      fontSize: 64,
      color: theme.ink,
      marginBottom: 56,
      borderLeft: align === 'left' ? `12px solid ${theme.accent}` : undefined,
      paddingLeft: align === 'left' ? 32 : 0,
      textAlign: align,
      wordBreak: 'keep-all',
    }}
  >
    {text}
  </div>
);

/** A: 번호 매긴 세로 리스트. */
const BulletNumberedList: React.FC<SlideInner> = ({ heading, bullets, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const items = bullets.slice(0, 6);
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.72 });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 1500 }}>
        <Heading text={heading} theme={theme} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 38 }}>
          {items.map((text, i) => {
            const at = revealAt[i] ?? 0;
            const pop = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (pop <= 0) return null;
            const color = nodeColors[i % nodeColors.length];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 32, opacity: pop, transform: `translateX(${(1 - pop) * -40}px)` }}>
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
                    boxShadow: '0 6px 0 rgba(0,0,0,0.12)',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontFamily: PRETENDARD, fontWeight: 700, fontSize: 52, color: theme.ink, lineHeight: 1.35, wordBreak: 'keep-all' }}>{text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** B: 2단 그리드 카드. */
const BulletGrid: React.FC<SlideInner> = ({ heading, bullets, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const items = bullets.slice(0, 6);
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.72 });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 1500 }}>
        <Heading text={heading} theme={theme} align="center" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'center' }}>
          {items.map((text, i) => {
            const at = revealAt[i] ?? 0;
            const pop = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (pop <= 0) return null;
            const color = nodeColors[i % nodeColors.length];
            return (
              <div
                key={i}
                style={{
                  width: 700,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 26,
                  padding: '28px 34px',
                  border: `3px solid ${theme.muted}`,
                  borderLeft: `10px solid ${color}`,
                  borderRadius: 18,
                  background: theme.paper,
                  opacity: pop,
                  transform: `translateY(${(1 - pop) * 26}px)`,
                }}
              >
                <div style={{ flexShrink: 0, fontFamily: PRETENDARD, fontWeight: 900, fontSize: 54, color }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ fontFamily: PRETENDARD, fontWeight: 700, fontSize: 40, color: theme.ink, lineHeight: 1.3, wordBreak: 'keep-all' }}>{text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** C: 큰 숫자 에디토리얼 — 항목마다 거대한 반투명 숫자 + 텍스트, 좌우 교대. */
const BulletBigNumber: React.FC<SlideInner> = ({ heading, bullets, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const items = bullets.slice(0, 5);
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.72 });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 1560 }}>
        <Heading text={heading} theme={theme} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
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
                  gap: 30,
                  opacity: pop,
                  transform: `translateX(${(1 - pop) * (i % 2 === 0 ? -50 : 50)}px)`,
                  borderBottom: `2px solid ${theme.muted}`,
                  paddingBottom: 20,
                }}
              >
                <div style={{ flexShrink: 0, width: 130, textAlign: 'center', fontFamily: PRETENDARD, fontWeight: 900, fontSize: 96, lineHeight: 1, color, opacity: 0.85 }}>
                  {i + 1}
                </div>
                <div style={{ fontFamily: PRETENDARD, fontWeight: 700, fontSize: 50, color: theme.ink, lineHeight: 1.3, wordBreak: 'keep-all' }}>{text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** D: 좌측 컬러바 카드 스택. */
const BulletBarCards: React.FC<SlideInner> = ({ heading, bullets, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const items = bullets.slice(0, 6);
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.72 });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 1440 }}>
        <Heading text={heading} theme={theme} align="center" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {items.map((text, i) => {
            const at = revealAt[i] ?? 0;
            const pop = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            if (pop <= 0) return null;
            const color = nodeColors[i % nodeColors.length];
            const w = interpolate(pop, [0, 1], [0.4, 1]);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  opacity: pop,
                  transform: `scaleX(${w})`,
                  transformOrigin: 'left center',
                  background: theme.paper,
                  border: `3px solid ${theme.muted}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  boxShadow: '0 6px 0 rgba(0,0,0,0.08)',
                }}
              >
                <div style={{ width: 18, background: color, flexShrink: 0 }} />
                <div style={{ padding: '30px 40px', fontFamily: PRETENDARD, fontWeight: 700, fontSize: 48, color: theme.ink, lineHeight: 1.3, wordBreak: 'keep-all' }}>
                  {text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────── QUOTE ───────────────────────────

const QUOTE_VARIANTS = 3;

export const QuoteSlide: React.FC<{ text: string; durationInFrames: number; theme?: VisualTheme; seed?: number }> = ({
  text,
  durationInFrames,
  theme = defaultTheme,
  seed = 0,
}) => {
  const variant = ((seed % QUOTE_VARIANTS) + QUOTE_VARIANTS) % QUOTE_VARIANTS;
  if (variant === 1) return <QuoteLeftBar text={text} durationInFrames={durationInFrames} theme={theme} />;
  if (variant === 2) return <QuoteBand text={text} durationInFrames={durationInFrames} theme={theme} />;
  return <QuoteCentered text={text} durationInFrames={durationInFrames} theme={theme} />;
};

type QuoteInner = { text: string; durationInFrames: number; theme: VisualTheme };

/** A: 가운데 정렬 + 큰 따옴표. */
const QuoteCentered: React.FC<QuoteInner> = ({ text, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const settle = interpolate(frame, [0, 20], [0.94, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 260px' }}>
      <div style={{ fontFamily: PRETENDARD, fontWeight: 900, fontSize: 210, color: theme.accent, opacity: 0.16, position: 'absolute', top: 90, left: 140 }}>“</div>
      <div style={{ opacity: pop, transform: `scale(${settle})`, textAlign: 'center' }}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 64, lineHeight: 1.45, color: theme.ink, wordBreak: 'keep-all' }}>{text}</div>
        <div style={{ width: 140, height: 6, background: theme.accent, margin: '44px auto 0', borderRadius: 3 }} />
      </div>
    </AbsoluteFill>
  );
};

/** B: 좌측 굵은 액센트 바 + 좌측 정렬. */
const QuoteLeftBar: React.FC<QuoteInner> = ({ text, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const barH = interpolate(frame, [0, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 48, width: 1500, alignItems: 'center' }}>
        <div style={{ width: 16, height: 360 * barH, background: theme.accent, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ opacity: pop, transform: `translateX(${(1 - pop) * 30}px)` }}>
          <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 72, lineHeight: 1.35, color: theme.ink, wordBreak: 'keep-all' }}>{text}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** C: 액센트 밴드 안에 반전 텍스트. */
const QuoteBand: React.FC<QuoteInner> = ({ text, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const bandW = interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pop = interpolate(frame, [14, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: 1560,
          background: theme.accent,
          borderRadius: 28,
          padding: '90px 90px',
          transform: `scaleX(${bandW})`,
          transformOrigin: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ opacity: pop, fontFamily: PRETENDARD, fontWeight: 900, fontSize: 70, lineHeight: 1.35, color: '#fff', textAlign: 'center', wordBreak: 'keep-all' }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────── CODE ───────────────────────────

const MONO = "'SFMono-Regular', 'Consolas', 'Menlo', 'Liberation Mono', monospace";

/** 실제 파일/코드 예시 — 에디터 창 스타일(코드 내용 자체가 매번 달라 변주 불필요). */
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
      <div style={{ width: 1420, borderRadius: 22, background: '#1c1e26', boxShadow: '0 26px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 28px', borderBottom: '1px solid #2e313d' }}>
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
                <div style={{ width: 44, textAlign: 'right', fontFamily: MONO, fontSize: 30, color: '#4d5266', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontFamily: MONO, fontSize: 32, lineHeight: 1.5, color: '#d7dae2', whiteSpace: 'pre' }}>{line || ' '}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
