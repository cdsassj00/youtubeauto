import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme as defaultTheme, type VisualTheme } from '../theme.js';
import { IconKind } from '../../schema.js';

/**
 * "생활코딩" 스타일 레퍼런스 참고: 등각(isometric) AI 그림과 완전히 다른 결의 평면(flat) 2D
 * 흑백 라인 아이콘 + 담백한 그리기(draw-on) 모션. AI 이미지 생성 없이 코드로 그려서 비용도
 * 없고, 매번 같은 모션으로 재현된다.
 *
 * "추상적이고 의미 없는 아이콘이면 안 된다"는 요구에 맞춰, 이 라이브러리는 자물쇠/열쇠/DB/
 * 서버/클라우드/터미널 등 실제 개념과 1:1로 대응하는 넉넉한 아이콘 목록을 제공한다.
 * 어떤 아이콘을 쓸지는 대본 생성 시(anthropic.ts) 그 씬이 실제로 설명하는 대상에 맞춰
 * 고르므로, "장식용 아무 아이콘"이 아니라 "그 씬 내용 그 자체"를 가리키게 된다.
 */

export const FLAT_ICON_KINDS = IconKind.options;

export type FlatIconKind = (typeof FLAT_ICON_KINDS)[number];

/** 문서 아이콘 — 레퍼런스와 같은 "귀퉁이가 말려 올라가는" 모션이 핵심(고유 애니메이션이라 별도 구현). */
const FlatDocumentIcon: React.FC<{ theme: VisualTheme; frame: number }> = ({ theme, frame }) => {
  const w = 220;
  const h = 280;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const curl = interpolate(frame, [6, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const settle = Math.sin(frame / 40) * 0.06;

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

/** 말풍선 아이콘 — 질문/대화. */
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

/** 돋보기 아이콘 — 조사/분석/검색. */
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
      <line x1={40} y1={40} x2={40 + 70 * draw} y2={40 + 70 * draw} stroke={theme.ink} strokeWidth={14} strokeLinecap="round" />
    </g>
  );
};

/**
 * 나머지 아이콘들은 "선/원/사각형을 순서대로 그려나가는" 공통 애니메이션 시스템으로 정의한다.
 * 도형마다 pathLength=1 정규화를 써서 실제 경로 길이 계산 없이 항상 같은 방식으로 draw-on 된다.
 */
type ShapeDef =
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; rotate?: number; fill?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: boolean }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; fill?: boolean }
  | { t: 'path'; d: string; fill?: boolean }
  | { t: 'polyline'; points: string; fill?: boolean }
  | { t: 'polygon'; points: string; fill?: boolean };

const IconShape: React.FC<{ shape: ShapeDef; theme: VisualTheme; progress: number }> = ({ shape, theme, progress }) => {
  if (shape.fill) {
    const style = { opacity: progress };
    const fillColor = theme.ink;
    let el: React.ReactNode = null;
    if (shape.t === 'circle') el = <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={fillColor} style={style} />;
    else if (shape.t === 'rect') el = <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 0} fill={fillColor} style={style} />;
    else if (shape.t === 'polygon') el = <polygon points={shape.points} fill={fillColor} style={style} />;
    else if (shape.t === 'path') el = <path d={shape.d} fill={fillColor} style={style} />;
    else if (shape.t === 'ellipse') el = <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={fillColor} style={style} />;
    return shape.t === 'rect' && shape.rotate ? <g transform={`rotate(${shape.rotate})`}>{el}</g> : <>{el}</>;
  }
  const common = {
    fill: 'none' as const,
    stroke: theme.ink,
    strokeWidth: 9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - progress,
  };
  let el: React.ReactNode = null;
  if (shape.t === 'rect') el = <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 0} {...common} />;
  else if (shape.t === 'circle') el = <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
  else if (shape.t === 'ellipse') el = <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />;
  else if (shape.t === 'line') el = <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />;
  else if (shape.t === 'path') el = <path d={shape.d} {...common} />;
  else if (shape.t === 'polyline') el = <polyline points={shape.points} {...common} />;
  else if (shape.t === 'polygon') el = <polygon points={shape.points} {...common} />;
  return shape.t === 'rect' && shape.rotate ? <g transform={`rotate(${shape.rotate})`}>{el}</g> : <>{el}</>;
};

const GenericIcon: React.FC<{ shapes: ShapeDef[]; theme: VisualTheme; frame: number }> = ({ shapes, theme, frame }) => (
  <g>
    {shapes.map((s, i) => {
      const at = 4 + i * 5;
      const progress = interpolate(frame, [at, at + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return <IconShape key={i} shape={s} theme={theme} progress={progress} />;
    })}
  </g>
);

function gearTeeth(): ShapeDef[] {
  const teeth: ShapeDef[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    teeth.push({
      t: 'line',
      x1: Math.cos(angle) * 45,
      y1: Math.sin(angle) * 45,
      x2: Math.cos(angle) * 62,
      y2: Math.sin(angle) * 62,
    });
  }
  return teeth;
}

/** 아이콘별 도형 목록 — 실제 개념과 1:1 대응(자물쇠=보안/권한, DB=데이터, 서버=인프라 등). */
const GENERIC_ICONS: Partial<Record<FlatIconKind, ShapeDef[]>> = {
  lock: [
    { t: 'path', d: 'M -30 -15 L -30 -40 A 30 30 0 0 1 30 -40 L 30 -15' },
    { t: 'rect', x: -50, y: -15, w: 100, h: 80, rx: 14 },
    { t: 'circle', cx: 0, cy: 15, r: 10, fill: true },
    { t: 'rect', x: -6, y: 20, w: 12, h: 20, rx: 4, fill: true },
  ],
  key: [
    { t: 'circle', cx: -45, cy: 0, r: 28 },
    { t: 'line', x1: -17, y1: 0, x2: 60, y2: 0 },
    { t: 'line', x1: 40, y1: 0, x2: 40, y2: 18 },
    { t: 'line', x1: 58, y1: 0, x2: 58, y2: 14 },
  ],
  database: [
    { t: 'ellipse', cx: 0, cy: -45, rx: 55, ry: 16 },
    { t: 'line', x1: -55, y1: -45, x2: -55, y2: 45 },
    { t: 'line', x1: 55, y1: -45, x2: 55, y2: 45 },
    { t: 'path', d: 'M -55 0 A 55 16 0 0 0 55 0' },
    { t: 'path', d: 'M -55 45 A 55 16 0 0 0 55 45' },
  ],
  server: [
    { t: 'rect', x: -55, y: -70, w: 110, h: 140, rx: 10 },
    { t: 'line', x1: -55, y1: -25, x2: 55, y2: -25 },
    { t: 'line', x1: -55, y1: 20, x2: 55, y2: 20 },
    { t: 'circle', cx: -35, cy: -47, r: 6, fill: true },
    { t: 'circle', cx: -35, cy: -2, r: 6, fill: true },
    { t: 'circle', cx: -35, cy: 43, r: 6, fill: true },
  ],
  cloud: [
    {
      t: 'path',
      d: 'M -70 20 C -95 20 -95 -30 -62 -30 C -60 -60 -15 -65 5 -42 C 20 -68 65 -55 60 -22 C 90 -18 88 20 58 20 Z',
    },
  ],
  terminal: [
    { t: 'rect', x: -70, y: -50, w: 140, h: 100, rx: 10 },
    { t: 'polyline', points: '-40,-15 -18,5 -40,25' },
    { t: 'line', x1: -10, y1: 25, x2: 22, y2: 25 },
  ],
  gear: [{ t: 'circle', cx: 0, cy: 0, r: 45 }, { t: 'circle', cx: 0, cy: 0, r: 16 }, ...gearTeeth()],
  link: [
    { t: 'rect', x: -40, y: -18, w: 55, h: 36, rx: 18, rotate: -20 },
    { t: 'rect', x: -15, y: -18, w: 55, h: 36, rx: 18, rotate: -20 },
  ],
  check: [
    { t: 'circle', cx: 0, cy: 0, r: 58 },
    { t: 'polyline', points: '-28,2 -8,25 30,-25' },
  ],
  warning: [
    { t: 'polygon', points: '0,-58 55,42 -55,42' },
    { t: 'line', x1: 0, y1: -20, x2: 0, y2: 15 },
    { t: 'circle', cx: 0, cy: 32, r: 5, fill: true },
  ],
  user: [
    { t: 'circle', cx: 0, cy: -35, r: 26 },
    { t: 'path', d: 'M -48 55 A 48 40 0 0 1 48 55' },
  ],
  users: [
    { t: 'circle', cx: -25, cy: -38, r: 22 },
    { t: 'path', d: 'M -60 50 A 38 34 0 0 1 10 50' },
    { t: 'circle', cx: 35, cy: -32, r: 22 },
    { t: 'path', d: 'M 0 55 A 38 34 0 0 1 70 55' },
  ],
  clock: [
    { t: 'circle', cx: 0, cy: 0, r: 58 },
    { t: 'line', x1: 0, y1: 0, x2: 0, y2: -32 },
    { t: 'line', x1: 0, y1: 0, x2: 26, y2: 12 },
  ],
  chart: [
    { t: 'line', x1: -60, y1: 50, x2: 60, y2: 50 },
    { t: 'rect', x: -45, y: 0, w: 24, h: 50 },
    { t: 'rect', x: -12, y: -25, w: 24, h: 75 },
    { t: 'rect', x: 21, y: -45, w: 24, h: 95 },
  ],
  mail: [
    { t: 'rect', x: -65, y: -42, w: 130, h: 84, rx: 8 },
    { t: 'polyline', points: '-65,-42 0,10 65,-42' },
  ],
};

/**
 * 평면 2D 라인 아이콘 슬라이드. title/outro 대안 비주얼로, AI 이미지 대신 코드로 그려서
 * 항상 같은 결(얇은 선, 넉넉한 여백, 담백한 모션)을 유지한다. 어떤 아이콘을 쓸지는 대본
 * 생성 단계에서 그 씬이 실제로 설명하는 대상에 맞춰 고른 값이 그대로 들어온다.
 */
export const FlatIconSlide: React.FC<{
  icon: FlatIconKind;
  theme?: VisualTheme;
}> = ({ icon, theme = defaultTheme }) => {
  const frame = useCurrentFrame();

  let content: React.ReactNode;
  if (icon === 'document') content = <FlatDocumentIcon theme={theme} frame={frame} />;
  else if (icon === 'chat') content = <FlatChatIcon theme={theme} frame={frame} />;
  else if (icon === 'search') content = <FlatSearchIcon theme={theme} frame={frame} />;
  else content = <GenericIcon shapes={GENERIC_ICONS[icon] ?? GENERIC_ICONS.document ?? []} theme={theme} frame={frame} />;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={900} height={900} viewBox="-300 -300 600 600">
        {content}
      </svg>
    </AbsoluteFill>
  );
};
