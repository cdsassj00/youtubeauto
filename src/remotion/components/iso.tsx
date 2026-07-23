import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { Diagram } from '../../schema.js';
import { theme as defaultTheme, type VisualTheme } from '../theme.js';
import { PRETENDARD } from '../pretendard.js';
import { revealFrames } from './beats.js';

/**
 * 등각(isometric) 모션 그래픽 컴포넌트.
 * diagram/comparison 씬은 AI 그림 대신 이 코드 기반 벡터 애니메이션으로 그린다 —
 * 노드/엣지·좌우비교처럼 "구조화된 데이터"는 참조 영상(Vonix 스타일)처럼
 * 흑백 등각 카드가 나레이션에 맞춰 순서대로 떠오르는 편이 AI 그림보다 훨씬 깔끔하다.
 *
 * 모든 하위 컴포넌트는 theme 을 prop 으로 받는다(라이트/다크 반전을 영상 단위로 고르기 위함,
 * Illustrated.tsx 에서 manifest.theme 에 따라 결정돼 여기까지 내려온다). prop 을 안 주면 기존
 * 라이트 팔레트로 동작해 하위호환된다.
 */

const W = 1920;
const H = 1080;

/** 얇은 등각 원반(플랫폼) — 참조 영상의 떠 있는 디스크. 그레이스케일 잉크 라인. */
const IsoDisk: React.FC<{
  cx: number;
  cy: number;
  r?: number;
  depth?: number;
  fill?: string;
  bob?: number; // 상하 부유 오프셋(px)
  theme?: VisualTheme;
}> = ({ cx, cy, r = 128, depth = 26, fill, bob = 0, theme = defaultTheme }) => {
  const ry = r * 0.5;
  const y = cy + bob;
  const topFill = fill ?? theme.paper;
  return (
    <g>
      {/* 그림자 */}
      <ellipse cx={cx} cy={cy + depth + 10} rx={r * 0.9} ry={ry * 0.55} fill="rgba(0,0,0,0.18)" />
      {/* 옆면(두께) */}
      <path
        d={`M ${cx - r} ${y} A ${r} ${ry} 0 0 0 ${cx + r} ${y} L ${cx + r} ${y + depth} A ${r} ${ry} 0 0 1 ${cx - r} ${y + depth} Z`}
        fill={theme.muted}
        stroke={theme.ink}
        strokeWidth={2.5}
      />
      {/* 윗면 */}
      <ellipse cx={cx} cy={y} rx={r} ry={ry} fill={topFill} stroke={theme.ink} strokeWidth={2.5} />
    </g>
  );
};

/** 등각 카드(다이아몬드 타일) — IsoDisk 의 대안 노드 모양. 원반과 실루엣이 확실히 다르다. */
const IsoCard: React.FC<{
  cx: number;
  cy: number;
  w?: number;
  h?: number;
  depth?: number;
  fill?: string;
  bob?: number;
  theme?: VisualTheme;
}> = ({ cx, cy, w = 260, h = 172, depth = 26, fill, bob = 0, theme = defaultTheme }) => {
  const y = cy + bob;
  const halfW = w / 2;
  const halfH = h / 2;
  const topFill = fill ?? theme.paper;
  const top = [
    [cx, y - halfH],
    [cx + halfW, y],
    [cx, y + halfH],
    [cx - halfW, y],
  ];
  const topPath = `M ${top[0][0]} ${top[0][1]} L ${top[1][0]} ${top[1][1]} L ${top[2][0]} ${top[2][1]} L ${top[3][0]} ${top[3][1]} Z`;
  const sideLeft = `M ${top[3][0]} ${top[3][1]} L ${top[2][0]} ${top[2][1]} L ${top[2][0]} ${top[2][1] + depth} L ${top[3][0]} ${top[3][1] + depth} Z`;
  const sideRight = `M ${top[2][0]} ${top[2][1]} L ${top[1][0]} ${top[1][1]} L ${top[1][0]} ${top[1][1] + depth} L ${top[2][0]} ${top[2][1] + depth} Z`;
  return (
    <g>
      <ellipse cx={cx} cy={cy + depth + 12} rx={halfW * 0.85} ry={halfH * 0.32} fill="rgba(0,0,0,0.18)" />
      <path d={sideLeft} fill={theme.muted} stroke={theme.ink} strokeWidth={2.5} />
      <path d={sideRight} fill={theme.sub} stroke={theme.ink} strokeWidth={2.5} />
      <path d={topPath} fill={topFill} stroke={theme.ink} strokeWidth={2.5} />
    </g>
  );
};

/** 노드/항목 위에 뜨는 라벨 칩(카드). 화면 텍스트라 가독성 위해 정면 플랫으로 그림. */
const LabelChip: React.FC<{ x: number; y: number; text: string; accent?: string; theme?: VisualTheme }> = ({
  x,
  y,
  text,
  accent,
  theme = defaultTheme,
}) => (
  <g>
    <line x1={x} y1={y + 26} x2={x} y2={y + 78} stroke={theme.muted} strokeWidth={3} strokeDasharray="1 8" strokeLinecap="round" />
    <foreignObject x={x - 340} y={y - 76} width={680} height={110}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <div
          style={{
            fontFamily: PRETENDARD,
            fontWeight: 800,
            fontSize: 48,
            lineHeight: 1.2,
            color: theme.ink,
            background: theme.paper,
            border: `3.5px solid ${accent ?? theme.ink}`,
            borderRadius: 18,
            padding: '14px 30px',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 0 rgba(0,0,0,0.18)',
          }}
        >
          {text}
        </div>
      </div>
    </foreignObject>
  </g>
);

/** 이차 베지어 곡선 위의 t(0~1) 지점 좌표. */
function quadPoint(p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * 노드 사이를 잇는 화살표. progress(0~1) 만큼 그어지는 draw-on 애니메이션.
 * 다 그려진 뒤에는 그 경로 위로 실제 데이터가 흐르는 것처럼 작은 펄스(점)가 반복 이동한다 —
 * 정적으로 연결만 되고 끝나는 대신, "무엇이 어디로 흘러가는지" 를 실제로 보여준다.
 */
const IsoArrow: React.FC<{
  from: { x: number; y: number };
  to: { x: number; y: number };
  progress: number;
  accent?: string;
  pulseDelay?: number;
  theme?: VisualTheme;
}> = ({ from, to, progress, accent, pulseDelay = 0, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const strokeColor = accent ?? theme.accent;
  const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 50 };
  const d = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  const len = Math.hypot(to.x - from.x, to.y - from.y) * 1.3 + 60;

  const pulseActive = progress >= 0.92;
  const loopFrames = 52;
  const pulseT = pulseActive ? (((frame + pulseDelay) % loopFrames) / loopFrames) : 0;
  const pulsePos = quadPoint(from, control, to, pulseT);
  const pulseFade = pulseActive
    ? interpolate(pulseT, [0, 0.08, 0.9, 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - progress)}
        markerEnd={progress > 0.85 ? 'url(#iso-arrowhead)' : undefined}
        opacity={progress > 0.02 ? 1 : 0}
      />
      {pulseActive && (
        <>
          <circle cx={pulsePos.x} cy={pulsePos.y} r={17} fill={strokeColor} opacity={pulseFade * 0.22} />
          <circle cx={pulsePos.x} cy={pulsePos.y} r={9} fill={strokeColor} opacity={pulseFade} />
        </>
      )}
    </g>
  );
};

const ArrowHeadDef: React.FC<{ theme?: VisualTheme }> = ({ theme = defaultTheme }) => (
  <defs>
    <marker id="iso-arrowhead" markerWidth="16" markerHeight="16" refX="9" refY="8" orient="auto">
      <path d="M0,0 L16,8 L0,16 Z" fill={theme.accent} />
    </marker>
  </defs>
);

type DiagramLayout = 'conveyor' | 'row' | 'hub' | 'equation' | 'orbit';
type NodeShape = 'disk' | 'card';

/**
 * "A, B 가 합쳐져 C 가 된다" 형태(오퍼랜드 2개 이상 → 결과 노드 1개, 그 외 가지 없음)를 감지한다.
 * 이런 정의/공식형 내용(예: Agent = Model + Harness)은 원반+화살표 도식보다
 * 실제 수식처럼 박스+연산자로 보여주는 편이 훨씬 명확하고, 다른 도식과도 확실히 달라 보인다.
 */
function detectEquation(
  nodes: { id: string; label: string }[],
  edges: { from: string; to: string }[],
): { operands: { id: string; label: string }[]; sum: { id: string; label: string } } | null {
  if (nodes.length !== 3) return null;
  const indeg = new Map<string, number>();
  const outdeg = new Map<string, number>();
  nodes.forEach((n) => {
    indeg.set(n.id, 0);
    outdeg.set(n.id, 0);
  });
  for (const e of edges) {
    if (!outdeg.has(e.from) || !indeg.has(e.to)) continue;
    outdeg.set(e.from, (outdeg.get(e.from) ?? 0) + 1);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const sum = nodes.find((n) => (indeg.get(n.id) ?? 0) >= 2 && (outdeg.get(n.id) ?? 0) === 0);
  if (!sum) return null;
  const operands = nodes.filter(
    (n) => n.id !== sum.id && (outdeg.get(n.id) ?? 0) >= 1 && (indeg.get(n.id) ?? 0) === 0,
  );
  // 딱 "A, B 두 개가 합쳐져 C 하나가 된다"(3노드) 형태만 수식으로 그린다 — 오퍼랜드가 3개 이상이면
  // "여러 개가 코어 하나에 붙는" 허브 구조와 그래프 모양이 같아져 오판하기 쉽고(실제로 5노드 허브가
  // 수식으로 잘못 렌더돼 박스 5개가 화면 밖으로 넘쳐버린 사례가 있었음), 그런 경우는 hub 레이아웃이 맞다.
  if (operands.length !== 2) return null;
  // 오퍼랜드→합 이외의 곁가지 엣지가 있으면(다른 관계가 섞인 그래프) 수식으로 단순화하지 않는다.
  const allEdgesAreCore = edges.every((e) => e.to === sum.id && operands.some((o) => o.id === e.from));
  if (!allEdgesAreCore || edges.length !== operands.length) return null;
  return { operands, sum };
}

/**
 * 매번 "원반 + 화살표"만 반복되지 않도록, 노드/엣지 구조와 씬 순번(seed)에 따라 레이아웃을 다르게 고른다.
 * "A+B=C" 형태 정의는 수식(equation)으로, 노드가 정확히 2개면 궤도(orbit, 레퍼런스의 두 원+점선처럼),
 * 한 노드가 나머지 대부분과 연결된 허브 구조는 방사형(hub)으로, 그 외는 seed 로 대각선(conveyor)과
 * 가로 지그재그(row)를 번갈아 쓴다.
 */
function pickLayout(
  nodes: { id: string; label: string }[],
  edges: { from: string; to: string }[],
  seed: number,
): DiagramLayout {
  if (detectEquation(nodes, edges)) return 'equation';
  if (nodes.length === 2) return 'orbit';
  if (nodes.length >= 4) {
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const maxDegree = Math.max(0, ...degree.values());
    if (maxDegree >= nodes.length - 1) return 'hub';
  }
  return seed % 2 === 0 ? 'conveyor' : 'row';
}

/**
 * 노드 모양(원반/카드)도 레이아웃과 다른 주기로 순환시켜 "항상 동그라미"를 벗어난다.
 * 레이아웃 선택(seed%2)과 위상을 어긋나게 하려고 다른 나눗수를 쓴다.
 */
function pickShape(seed: number): NodeShape {
  return Math.floor(seed / 2) % 2 === 0 ? 'disk' : 'card';
}

function layoutPositions(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
  layout: DiagramLayout,
): { sx: number; sy: number }[] {
  if (layout === 'hub') {
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    let hubIdx = 0;
    let bestDeg = -1;
    nodes.forEach((n, i) => {
      const d = degree.get(n.id) ?? 0;
      if (d > bestDeg) {
        bestDeg = d;
        hubIdx = i;
      }
    });
    const others = nodes.map((_, i) => i).filter((i) => i !== hubIdx);
    const radius = 400;
    return nodes.map((_, i) => {
      if (i === hubIdx) return { sx: 0, sy: 0 };
      const k = others.indexOf(i);
      const angle = -Math.PI / 2 + (k / others.length) * Math.PI * 2;
      return { sx: Math.cos(angle) * radius, sy: Math.sin(angle) * radius * 0.72 };
    });
  }
  if (layout === 'row') {
    // 가로 일렬 배치 + 살짝 지그재그(완전 일직선은 밋밋해서 위아래로 교대).
    return nodes.map((_, i) => {
      const t = nodes.length <= 1 ? 0.5 : i / (nodes.length - 1);
      const sx = -680 + t * 1360;
      const sy = i % 2 === 0 ? -50 : 90;
      return { sx, sy };
    });
  }
  // conveyor(기본): 대각선 컨베이어 라인.
  return nodes.map((_, i) => {
    const t = nodes.length <= 1 ? 0.5 : i / (nodes.length - 1);
    const sx = -600 + t * 1200;
    const sy = -230 + t * 460;
    return { sx, sy };
  });
}

/** 등각 개념 도식: 구조에 따라 컨베이어/가로/허브/수식/궤도 레이아웃 중 하나로 배치되고 순서대로 떠오르며 연결된다. */
export const IsoDiagram: React.FC<{
  diagram: Diagram;
  narration: string;
  durationInFrames: number;
  seed?: number;
  theme?: VisualTheme;
}> = ({ diagram, narration, durationInFrames, seed = 0, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const nodes = diagram.nodes.slice(0, 6);
  const layout = pickLayout(nodes, diagram.edges, seed);

  if (layout === 'equation') {
    const eq = detectEquation(nodes, diagram.edges)!;
    return (
      <IsoEquation operands={eq.operands} sum={eq.sum} narration={narration} durationInFrames={durationInFrames} theme={theme} />
    );
  }
  if (layout === 'orbit') {
    return <OrbitPair nodes={nodes} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  }

  const revealAt = revealFrames(narration, durationInFrames, nodes.length, { head: 0.04, tail: 0.7 });
  const positions = layoutPositions(nodes, diagram.edges, layout);
  const shape = pickShape(seed);

  const idMap = new Map(nodes.map((n, i) => [n.id, i]));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <ArrowHeadDef theme={theme} />
      <g transform={`translate(${W / 2}, ${H / 2 + 30})`}>
        {/* 화살표 (엣지) */}
        {diagram.edges.map((e, i) => {
          const fi = idMap.get(e.from);
          const ti = idMap.get(e.to);
          if (fi === undefined || ti === undefined) return null;
          const revealEdgeAt = Math.max(revealAt[fi] ?? 0, revealAt[ti] ?? 0) + 8;
          const progress = interpolate(frame, [revealEdgeAt, revealEdgeAt + 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <IsoArrow
              key={i}
              from={{ x: positions[fi].sx, y: positions[fi].sy }}
              to={{ x: positions[ti].sx, y: positions[ti].sy }}
              progress={progress}
              pulseDelay={i * 17}
              theme={theme}
            />
          );
        })}

        {/* 노드 (디스크/카드 + 라벨) */}
        {nodes.map((n, i) => {
          const at = revealAt[i] ?? 0;
          const pop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (pop <= 0) return null;
          const bob = Math.sin((frame + i * 40) / 26) * 8;
          const { sx, sy } = positions[i];
          const scale = 0.7 + pop * 0.3;
          const fill = i % 2 === 0 ? theme.paper : theme.muted;
          return (
            <g key={n.id} transform={`translate(${sx}, ${sy}) scale(${scale}) translate(${-sx}, ${-sy})`} opacity={pop}>
              {shape === 'disk' ? (
                <IsoDisk cx={sx} cy={sy} bob={bob} fill={fill} theme={theme} />
              ) : (
                <IsoCard cx={sx} cy={sy} bob={bob} fill={fill} theme={theme} />
              )}
              <LabelChip x={sx} y={sy - 104 + bob} text={n.label} accent={i === nodes.length - 1 ? theme.accent : theme.ink} theme={theme} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/**
 * 등각 수식 도식: "A + B = C" 형태 정의를 원반/화살표 대신 실제 수식처럼 박스+연산자로 보여준다.
 * 다른 도식들과 실루엣 자체가 달라 "맨날 같은 도식" 문제를 구조적으로 피한다.
 */
const IsoEquation: React.FC<{
  operands: { id: string; label: string }[];
  sum: { id: string; label: string };
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
}> = ({ operands, sum, narration, durationInFrames, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const items = [...operands, sum];
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.05, tail: 0.65 });

  const boxW = 400;
  const boxH = 220;
  const opW = 130;
  const gap = 20;
  const slotWidths = items.flatMap((_, i) => (i < items.length - 1 ? [boxW, opW] : [boxW]));
  const totalW = slotWidths.reduce((a, b) => a + b, 0) + gap * (slotWidths.length - 1);
  let cursor = -totalW / 2;
  const boxX: number[] = [];
  const opX: number[] = [];
  slotWidths.forEach((w, i) => {
    const cx = cursor + w / 2;
    if (i % 2 === 0) boxX.push(cx);
    else opX.push(cx);
    cursor += w + gap;
  });

  // 안전장치: 혹시 오퍼랜드가 늘어나 폭이 화면을 넘어서면(더 이상 3노드 전용이 아니게 되더라도)
  // 잘리는 대신 통째로 축소해서 항상 프레임 안에 들어오게 한다.
  const safeScale = Math.min(1, (W - 160) / totalW);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2}) scale(${safeScale})`}>
        {items.map((item, i) => {
          const at = revealAt[i] ?? 0;
          const pop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const isSum = i === items.length - 1;
          const cx = boxX[i];
          return (
            <g key={item.id} opacity={pop} transform={`translate(${cx}, 0) scale(${0.8 + pop * 0.2}) translate(${-cx}, 0)`}>
              <rect
                x={cx - boxW / 2}
                y={-boxH / 2}
                width={boxW}
                height={boxH}
                rx={20}
                fill={isSum ? theme.paper : theme.paper}
                stroke={isSum ? theme.accent : theme.ink}
                strokeWidth={isSum ? 5 : 3.5}
              />
              <foreignObject x={cx - boxW / 2 + 16} y={-boxH / 2 + 16} width={boxW - 32} height={boxH - 32}>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontFamily: PRETENDARD,
                    fontWeight: 800,
                    fontSize: 46,
                    lineHeight: 1.25,
                    color: isSum ? theme.accent : theme.ink,
                  }}
                >
                  {item.label}
                </div>
              </foreignObject>
            </g>
          );
        })}
        {opX.map((cx, i) => {
          const isLast = i === opX.length - 1;
          const sym = isLast ? '=' : '+';
          const revealIdx = isLast ? items.length - 2 : i + 1;
          const at = (revealAt[revealIdx] ?? 0) - 6;
          const pop = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <text
              key={i}
              x={cx}
              y={22}
              textAnchor="middle"
              opacity={pop}
              style={{ fontFamily: PRETENDARD, fontWeight: 900, fontSize: 84, fill: theme.muted }}
            >
              {sym}
            </text>
          );
        })}
      </g>
    </svg>
  );
};

/**
 * 등각 궤도(orbit) 도식: 노드가 정확히 2개인 관계(레퍼런스 이미지처럼 "A vs B"류 대비/짝 개념)를
 * 속이 꽉 찬 원 2개 + 점선 궤도로 보여준다. 원 채우기/글자색을 theme.ink/theme.paper 로 완전히
 * 반전시켜서(다크 테마면 흰 원+검은 글자, 라이트 테마면 검은 원+흰 글자) "다크/화이트 반전 활용"
 * 요청에 맞춘, 원반·카드·화살표와는 실루엣이 아예 다른 네 번째 도식 어휘.
 */
const OrbitPair: React.FC<{
  nodes: { id: string; label: string }[];
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
}> = ({ nodes, narration, durationInFrames, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const pair = nodes.slice(0, 2);
  const revealAt = revealFrames(narration, durationInFrames, pair.length, { head: 0.08, tail: 0.7 });
  const r = 150;
  const gap = 70;
  const centers = [-(r * 2 + gap) / 2, (r * 2 + gap) / 2];
  const ringAt = revealAt[1] ?? 20;
  const ringPop = interpolate(frame, [ringAt, ringAt + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2})`}>
        <ellipse
          cx={0}
          cy={0}
          rx={r * 2 + gap / 2 + 60}
          ry={r + 100}
          fill="none"
          stroke={theme.sub}
          strokeWidth={3}
          strokeDasharray="16 16"
          opacity={ringPop * 0.85}
        />
        {pair.map((n, i) => {
          const at = revealAt[i] ?? 0;
          const pop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (pop <= 0) return null;
          const bob = Math.sin((frame + i * 50) / 30) * 6;
          const cx = centers[i];
          return (
            <g
              key={n.id}
              opacity={pop}
              transform={`translate(${cx}, ${bob}) scale(${0.7 + pop * 0.3}) translate(${-cx}, 0)`}
            >
              <ellipse cx={cx} cy={r * 0.55} rx={r * 0.8} ry={26} fill="rgba(0,0,0,0.18)" />
              <circle cx={cx} cy={0} r={r} fill={theme.ink} stroke={theme.accent} strokeWidth={i === pair.length - 1 ? 5 : 0} />
              <foreignObject x={cx - r + 24} y={-r + 24} width={(r - 24) * 2} height={(r - 24) * 2}>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 42, lineHeight: 1.25, color: theme.paper }}>
                    {n.label}
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/** 등각 좌/우 비교: 두 무리의 원반 스택이 나레이션에 맞춰 쌓이고 가운데 VS 구분선. */
export const IsoComparison: React.FC<{
  comparison: { leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] };
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
}> = ({ comparison, narration, durationInFrames, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const items = [...comparison.leftItems.map((t) => ({ side: 'l' as const, t })), ...comparison.rightItems.map((t) => ({ side: 'r' as const, t }))];
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.75 });

  const leftCount = comparison.leftItems.length;
  const rightCount = comparison.rightItems.length;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <ArrowHeadDef theme={theme} />
      {/* 타이틀 */}
      <foreignObject x={W / 2 - 900} y={110} width={760} height={100}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 60, color: theme.ink, textAlign: 'center' }}>
          {comparison.leftTitle}
        </div>
      </foreignObject>
      <foreignObject x={W / 2 + 140} y={110} width={760} height={100}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 60, color: theme.accent2, textAlign: 'center' }}>
          {comparison.rightTitle}
        </div>
      </foreignObject>

      {/* 가운데 구분선 + VS */}
      <line x1={W / 2} y1={230} x2={W / 2} y2={920} stroke={theme.muted} strokeWidth={3} strokeDasharray="2 12" />
      <circle cx={W / 2} cy={565} r={64} fill={theme.ink} />
      <text x={W / 2} y={582} textAnchor="middle" fontFamily={PRETENDARD} fontWeight={800} fontSize={40} fill={theme.paper}>
        VS
      </text>

      {items.map((it, gi) => {
        const at = revealAt[gi] ?? 0;
        const pop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (pop <= 0) return null;
        const idx = it.side === 'l' ? comparison.leftItems.indexOf(it.t) : comparison.rightItems.indexOf(it.t);
        const count = it.side === 'l' ? leftCount : rightCount;
        const colX = it.side === 'l' ? W / 2 - 500 : W / 2 + 500;
        // 항목 개수와 무관하게 안전한 세로 대역(300~860) 안에 고르게 분배.
        const bandTop = 320;
        const bandBottom = 860;
        const y = count <= 1 ? (bandTop + bandBottom) / 2 : bandTop + (idx / (count - 1)) * (bandBottom - bandTop);
        const slide = (1 - pop) * (it.side === 'l' ? -70 : 70);
        const bob = Math.sin((frame + idx * 30) / 30) * 5;

        // 긴 문구가 카드 밖으로 잘리지 않도록: nowrap 강제 대신 폭에 맞춰 줄바꿈 + 길이에 따라 폰트를 줄인다.
        const fontSize = it.t.length > 18 ? 28 : it.t.length > 12 ? 34 : 40;
        return (
          <g key={`${it.side}-${idx}`} opacity={pop} transform={`translate(${slide}, 0)`}>
            <IsoDisk cx={colX} cy={y + bob} r={108} depth={22} fill={theme.paper} theme={theme} />
            <foreignObject x={colX - 340} y={y - 78 + bob} width={680} height={130}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div
                  style={{
                    fontFamily: PRETENDARD,
                    fontWeight: 700,
                    fontSize,
                    lineHeight: 1.25,
                    color: theme.ink,
                    background: theme.paper,
                    border: `3px solid ${it.side === 'l' ? theme.ink : theme.accent2}`,
                    borderRadius: 16,
                    padding: '12px 24px',
                    textAlign: 'center',
                    maxWidth: 632,
                    wordBreak: 'keep-all',
                  }}
                >
                  {it.t}
                </div>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
};
