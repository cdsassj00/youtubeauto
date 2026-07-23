import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme as defaultTheme, type VisualTheme } from '../theme.js';

/**
 * "생활코딩" 스타일 레퍼런스 참고: 등각(isometric) AI 그림과 완전히 다른 결의 평면(flat) 2D
 * 흑백 라인 아이콘 + 페이지가 살짝 접혔다 펴지는 모션. 등각 그림체가 안 어울리는 아주 단순한
 * 도입/전환 씬(제목 카드 등)에 쓸 수 있는 대안 비주얼. AI 이미지 생성 없이 코드로 그려서
 * 비용도 없고, 매번 정확히 같은 모션으로 재현된다.
 */

type FlatIconKind = 'document' | 'chat' | 'search';

/** 문서 아이콘 — 레퍼런스와 같은 "귀퉁이가 말려 올라가는" 모션이 핵심. */
const FlatDocumentIcon: React.FC<{ theme: VisualTheme; frame: number }> = ({ theme, frame }) => {
  const w = 220;
  const h = 280;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const curl = interpolate(frame, [6, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const settle = Math.sin(frame / 40) * 0.06; // 다 말린 뒤에도 살짝 숨쉬듯 흔들림

  const startX = x0 + w * 0.4;
  const endY = y0 + h * 0.58;
  const bulge = (36 + settle * 10) * curl;
  const ctrlX = (startX + x1) / 2 + bulge;
  const ctrlY = (y0 + endY) / 2 - bulge * 0.35;
  const curlPath = `M ${startX} ${y0} Q ${ctrlX} ${ctrlY} ${x1} ${endY} L ${x1} ${y0} Z`;

  const lineTs = [0.42, 0.54, 0.66, 0.78];

  return (
    <g>
      <rect x={x0} y={y0} width={w} height={h} rx={6} fill={theme.paper} stroke={theme.ink} strokeWidth={5} />
      {lineTs.map((t, i) => (
        <line
          key={i}
          x1={x0 + 24}
          y1={y0 + h * t}
          x2={x0 + w * (i === 0 ? 0.58 : 0.4)}
          y2={y0 + h * t}
          stroke={theme.ink}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      <path d={curlPath} fill={theme.paper} stroke={theme.ink} strokeWidth={5} strokeLinejoin="round" />
    </g>
  );
};

/** 말풍선 아이콘 — 질문/대화 전환용. */
const FlatChatIcon: React.FC<{ theme: VisualTheme; frame: number }> = ({ theme, frame }) => {
  const pop = interpolate(frame, [4, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bob = Math.sin(frame / 30) * 4;
  return (
    <g transform={`translate(0, ${bob}) scale(${0.85 + pop * 0.15})`}>
      <path
        d="M -130 -80 Q -130 -110 -100 -110 L 100 -110 Q 130 -110 130 -80 L 130 20 Q 130 50 100 50 L -20 50 L -55 90 L -50 50 L -100 50 Q -130 50 -130 20 Z"
        fill={theme.paper}
        stroke={theme.ink}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      {[-55, 0, 55].map((cx, i) => {
        const at = 10 + i * 6;
        const dot = interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return <circle key={i} cx={cx} cy={-30} r={12} fill={theme.ink} opacity={dot} />;
      })}
    </g>
  );
};

/** 돋보기 아이콘 — 조사/분석 전환용. */
const FlatSearchIcon: React.FC<{ theme: VisualTheme; frame: number }> = ({ theme, frame }) => {
  const draw = interpolate(frame, [4, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const circumference = 2 * Math.PI * 80;
  return (
    <g>
      <circle
        cx={-20}
        cy={-20}
        r={80}
        fill="none"
        stroke={theme.ink}
        strokeWidth={10}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - draw)}
        strokeLinecap="round"
      />
      <line
        x1={40}
        y1={40}
        x2={40 + 70 * draw}
        y2={40 + 70 * draw}
        stroke={theme.ink}
        strokeWidth={14}
        strokeLinecap="round"
      />
    </g>
  );
};

/**
 * 평면 2D 라인 아이콘 슬라이드. title/outro 대안 비주얼로, AI 이미지 대신 코드로 그려서
 * 항상 같은 결(얇은 선, 넉넉한 여백, 담백한 모션)을 유지한다.
 */
export const FlatIconSlide: React.FC<{
  icon: FlatIconKind;
  caption?: string;
  theme?: VisualTheme;
}> = ({ icon, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const Icon = icon === 'chat' ? FlatChatIcon : icon === 'search' ? FlatSearchIcon : FlatDocumentIcon;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={900} height={900} viewBox="-300 -300 600 600">
        <Icon theme={theme} frame={frame} />
      </svg>
    </AbsoluteFill>
  );
};

export const FLAT_ICON_KINDS: FlatIconKind[] = ['document', 'chat', 'search'];
