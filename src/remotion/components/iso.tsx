import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { Diagram } from '../../schema.js';
import { theme as defaultTheme, monoRamp, type VisualTheme } from '../theme.js';
import { PRETENDARD } from '../pretendard.js';
import { revealFrames } from './beats.js';

/**
 * 평면(flat) 2D "생활코딩" 스타일 모션 그래픽 컴포넌트.
 * diagram/comparison 씬은 AI 그림 대신 이 코드 기반 벡터 애니메이션으로 그린다 —
 * 예전엔 등각(isometric) 원반이었지만, "전부 생활코딩 스타일로 통일 + 도형 애니메이션 강화"
 * 요청에 따라 얇은 선으로 그린 평면 도형(둥근 사각형/원)이 테두리부터 그려지고(draw-on),
 * 통통 튀어 등장하며, 연결선이 그어진 뒤 데이터 펄스가 흐르는 방식으로 바꿨다.
 *
 * (export 이름은 IsoDiagram/IsoComparison 을 유지 — 호출부 변경 최소화. 시각만 평면으로 전환됨.)
 * 모든 하위 컴포넌트는 theme 을 prop 으로 받는다(라이트/다크 반전을 영상 단위로 고름).
 */

const W = 1920;
const H = 1080;

/** 이차 베지어 곡선 위의 t(0~1) 지점 좌표. */
function quadPoint(p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** 통통 튀는 등장(overshoot) — appear 0~1 을 scale 로. */
function popScale(appear: number): number {
  // 0 → 0.7 에서 시작, 1.08 까지 튀었다가 1.0 으로 안착.
  if (appear <= 0) return 0.7;
  if (appear >= 1) return 1;
  const s = interpolate(appear, [0, 0.7, 1], [0.7, 1.08, 1]);
  return s;
}

/**
 * 평면 노드 — 둥근 사각형(box) 또는 원(circle). 얇은 선 테두리가 draw-on 으로 그려지고,
 * 라벨은 도형 "안"에 들어간다. 등장 후엔 계속 살짝 부유(float)하고, 강조 노드(마지막)는
 * 바깥으로 은은한 펄스 링이 반복된다 — "도형 애니메이션 강화".
 */
const FlatNode: React.FC<{
  cx: number;
  cy: number;
  label: string;
  shape: 'box' | 'circle';
  accent: string;
  emphasize?: boolean;
  theme: VisualTheme;
  appear: number; // 0..1 등장 진행
  frame: number;
  seed: number;
}> = ({ cx, cy, label, shape, accent, emphasize = false, theme, appear, frame, seed }) => {
  if (appear <= 0) return null;
  const bob = Math.sin((frame + seed * 40) / 26) * 6 * appear;
  const scale = popScale(appear);
  const y = cy + bob;

  const boxW = 300;
  const boxH = 150;
  const r = 100;

  // 테두리 draw-on: pathLength 정규화 + dashoffset.
  const strokeCommon = {
    fill: theme.paper,
    stroke: emphasize ? accent : theme.ink,
    strokeWidth: emphasize ? 7 : 5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - Math.min(1, appear * 1.15),
  };

  // 강조 노드의 반복 펄스 링(등장 완료 후).
  const pulse = appear >= 0.98 ? (frame % 60) / 60 : -1;
  const pulseFade = pulse >= 0 ? interpolate(pulse, [0, 0.1, 1], [0, 0.5, 0]) : 0;
  const pulseScale = pulse >= 0 ? interpolate(pulse, [0, 1], [1, 1.35]) : 1;

  const labelFontSize = label.length > 10 ? 34 : label.length > 6 ? 40 : 46;

  return (
    <g transform={`translate(${cx}, ${y}) scale(${scale})`} opacity={Math.min(1, appear * 1.4)}>
      {emphasize && pulse >= 0 && (
        shape === 'circle' ? (
          <circle cx={0} cy={0} r={r * pulseScale} fill="none" stroke={accent} strokeWidth={4} opacity={pulseFade} />
        ) : (
          <rect
            x={(-boxW / 2) * pulseScale}
            y={(-boxH / 2) * pulseScale}
            width={boxW * pulseScale}
            height={boxH * pulseScale}
            rx={26 * pulseScale}
            fill="none"
            stroke={accent}
            strokeWidth={4}
            opacity={pulseFade}
          />
        )
      )}
      {shape === 'circle' ? (
        <circle cx={0} cy={0} r={r} {...strokeCommon} />
      ) : (
        <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} rx={24} {...strokeCommon} />
      )}
      <foreignObject
        x={shape === 'circle' ? -r + 14 : -boxW / 2 + 18}
        y={shape === 'circle' ? -r + 14 : -boxH / 2 + 14}
        width={shape === 'circle' ? (r - 14) * 2 : boxW - 36}
        height={shape === 'circle' ? (r - 14) * 2 : boxH - 28}
      >
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
            fontSize: labelFontSize,
            lineHeight: 1.2,
            color: emphasize ? accent : theme.ink,
            wordBreak: 'keep-all',
            opacity: interpolate(appear, [0.4, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          {label}
        </div>
      </foreignObject>
    </g>
  );
};

/**
 * 노드 사이 연결선(평면). progress 만큼 그어지고, 다 그려지면 경로 위로 데이터 펄스(점)가 흐른다.
 * 화살표 머리는 다 그려진 뒤 나타난다.
 */
const FlatArrow: React.FC<{
  from: { x: number; y: number };
  to: { x: number; y: number };
  progress: number;
  accent: string;
  pulseDelay?: number;
  theme: VisualTheme;
}> = ({ from, to, progress, accent, pulseDelay = 0, theme }) => {
  const frame = useCurrentFrame();
  // 노드 반지름만큼 양끝을 물러나게(도형에 안 파묻히게).
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const pad = 96;
  const p0 = { x: from.x + ux * pad, y: from.y + uy * pad };
  const p2 = { x: to.x - ux * pad, y: to.y - uy * pad };
  const control = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 - 40 };
  const d = `M ${p0.x} ${p0.y} Q ${control.x} ${control.y} ${p2.x} ${p2.y}`;

  const pulseActive = progress >= 0.92;
  const loopFrames = 46;
  const pulseT = pulseActive ? ((frame + pulseDelay) % loopFrames) / loopFrames : 0;
  const pulsePos = quadPoint(p0, control, p2, pulseT);
  const pulseFade = pulseActive
    ? interpolate(pulseT, [0, 0.1, 0.9, 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={accent}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
        markerEnd={progress > 0.9 ? 'url(#flat-arrowhead)' : undefined}
        opacity={progress > 0.02 ? 1 : 0}
      />
      {pulseActive && (
        <>
          <circle cx={pulsePos.x} cy={pulsePos.y} r={14} fill={accent} opacity={pulseFade * 0.25} />
          <circle cx={pulsePos.x} cy={pulsePos.y} r={8} fill={accent} opacity={pulseFade} />
        </>
      )}
    </g>
  );
};

const ArrowHeadDef: React.FC<{ theme: VisualTheme }> = ({ theme }) => (
  <defs>
    <marker id="flat-arrowhead" markerWidth="14" markerHeight="14" refX="8" refY="7" orient="auto">
      <path d="M0,0 L14,7 L0,14 Z" fill={theme.accent} />
    </marker>
  </defs>
);

type DiagramLayout = 'conveyor' | 'row' | 'hub' | 'equation' | 'orbit' | 'timeline' | 'cycle' | 'layers' | 'matrix';
type NodeShape = 'box' | 'circle';

/** 모든 노드가 한 줄 방향 사슬(a→b→c→d)을 이루는지 — 순서대로 정렬된 인덱스 반환, 아니면 null. */
function detectChain(nodes: { id: string }[], edges: { from: string; to: string }[]): number[] | null {
  if (nodes.length < 3 || edges.length !== nodes.length - 1) return null;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const indeg = new Array(nodes.length).fill(0);
  const outdeg = new Array(nodes.length).fill(0);
  const next = new Array(nodes.length).fill(-1);
  for (const e of edges) {
    const f = idx.get(e.from);
    const t = idx.get(e.to);
    if (f === undefined || t === undefined) return null;
    outdeg[f]++;
    indeg[t]++;
    next[f] = t;
  }
  // 시작점(indeg 0) 정확히 1개여야 한 줄 사슬.
  const starts = indeg.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
  if (starts.length !== 1) return null;
  const order: number[] = [];
  let cur = starts[0];
  const seen = new Set<number>();
  while (cur !== -1 && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    cur = next[cur];
  }
  return order.length === nodes.length ? order : null;
}

/** 모든 노드가 하나의 닫힌 순환(a→b→c→a)을 이루는지 — 순서 인덱스 반환, 아니면 null. */
function detectCycle(nodes: { id: string }[], edges: { from: string; to: string }[]): number[] | null {
  if (nodes.length < 3 || edges.length !== nodes.length) return null;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const next = new Array(nodes.length).fill(-1);
  const indeg = new Array(nodes.length).fill(0);
  for (const e of edges) {
    const f = idx.get(e.from);
    const t = idx.get(e.to);
    if (f === undefined || t === undefined) return null;
    if (next[f] !== -1) return null; // 각 노드 outdeg 정확히 1
    next[f] = t;
    indeg[t]++;
  }
  if (!indeg.every((d) => d === 1)) return null;
  const order: number[] = [];
  const seen = new Set<number>();
  let cur = 0;
  while (cur !== -1 && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    cur = next[cur];
  }
  return order.length === nodes.length ? order : null;
}

/** "A, B 두 개가 합쳐져 C 하나" 형태(3노드)만 수식으로 감지. */
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
  const operands = nodes.filter((n) => n.id !== sum.id && (outdeg.get(n.id) ?? 0) >= 1 && (indeg.get(n.id) ?? 0) === 0);
  if (operands.length !== 2) return null;
  const allEdgesAreCore = edges.every((e) => e.to === sum.id && operands.some((o) => o.id === e.from));
  if (!allEdgesAreCore || edges.length !== operands.length) return null;
  return { operands, sum };
}

function pickLayout(
  nodes: { id: string; label: string }[],
  edges: { from: string; to: string }[],
  seed: number,
): DiagramLayout {
  if (detectEquation(nodes, edges)) return 'equation';
  if (nodes.length === 2) return 'orbit';
  if (detectCycle(nodes, edges)) return 'cycle';
  // 엣지가 거의 없는 독립 4개 항목(관계 아닌 병렬 분류) → 2×2 매트릭스.
  if (nodes.length === 4 && edges.length <= 1) return 'matrix';
  if (nodes.length >= 4) {
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const maxDegree = Math.max(0, ...degree.values());
    if (maxDegree >= nodes.length - 1) return 'hub';
  }
  // 한 줄 사슬(순차 단계)이면 conveyor/timeline/row/layers 를 seed 로 번갈아 — 같은 흐름도 매번 다르게.
  if (detectChain(nodes, edges)) {
    const pick = seed % 4;
    return pick === 0 ? 'conveyor' : pick === 1 ? 'timeline' : pick === 2 ? 'layers' : 'row';
  }
  return seed % 2 === 0 ? 'conveyor' : 'row';
}

/** 노드 모양(둥근사각형/원)을 레이아웃과 다른 주기로 순환. */
function pickShape(seed: number): NodeShape {
  return Math.floor(seed / 2) % 2 === 0 ? 'box' : 'circle';
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
    const radius = 420;
    return nodes.map((_, i) => {
      if (i === hubIdx) return { sx: 0, sy: 0 };
      const k = others.indexOf(i);
      const angle = -Math.PI / 2 + (k / others.length) * Math.PI * 2;
      return { sx: Math.cos(angle) * radius, sy: Math.sin(angle) * radius * 0.74 };
    });
  }
  if (layout === 'row') {
    return nodes.map((_, i) => {
      const t = nodes.length <= 1 ? 0.5 : i / (nodes.length - 1);
      const sx = -700 + t * 1400;
      const sy = i % 2 === 0 ? -70 : 90;
      return { sx, sy };
    });
  }
  // conveyor(기본): 대각선 흐름.
  return nodes.map((_, i) => {
    const t = nodes.length <= 1 ? 0.5 : i / (nodes.length - 1);
    const sx = -640 + t * 1280;
    const sy = -220 + t * 440;
    return { sx, sy };
  });
}

/** 평면 개념 도식: 구조에 따라 컨베이어/가로/허브/수식/궤도 레이아웃 중 하나로 배치·애니메이션. */
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
  if (layout === 'timeline') {
    const order = detectChain(nodes, diagram.edges)!;
    return <TimelineDiagram nodes={order.map((i) => nodes[i])} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  }
  if (layout === 'cycle') {
    const order = detectCycle(nodes, diagram.edges)!;
    return <CycleDiagram nodes={order.map((i) => nodes[i])} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  }
  if (layout === 'layers') {
    const order = detectChain(nodes, diagram.edges) ?? nodes.map((_, i) => i);
    return <LayersDiagram nodes={order.map((i) => nodes[i])} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  }
  if (layout === 'matrix') {
    return <MatrixDiagram nodes={nodes} narration={narration} durationInFrames={durationInFrames} theme={theme} />;
  }

  const revealAt = revealFrames(narration, durationInFrames, nodes.length, { head: 0.04, tail: 0.7 });
  const positions = layoutPositions(nodes, diagram.edges, layout);
  const shape = pickShape(seed);
  const idMap = new Map(nodes.map((n, i) => [n.id, i]));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <ArrowHeadDef theme={theme} />
      <g transform={`translate(${W / 2}, ${H / 2 + 20})`}>
        {diagram.edges.map((e, i) => {
          const fi = idMap.get(e.from);
          const ti = idMap.get(e.to);
          if (fi === undefined || ti === undefined) return null;
          const revealEdgeAt = Math.max(revealAt[fi] ?? 0, revealAt[ti] ?? 0) + 10;
          const progress = interpolate(frame, [revealEdgeAt, revealEdgeAt + 22], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <FlatArrow
              key={i}
              from={{ x: positions[fi].sx, y: positions[fi].sy }}
              to={{ x: positions[ti].sx, y: positions[ti].sy }}
              progress={progress}
              accent={theme.accent}
              pulseDelay={i * 15}
              theme={theme}
            />
          );
        })}
        {nodes.map((n, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const { sx, sy } = positions[i];
          return (
            <FlatNode
              key={n.id}
              cx={sx}
              cy={sy}
              label={n.label}
              shape={shape}
              accent={theme.accent}
              emphasize={i === nodes.length - 1}
              theme={theme}
              appear={appear}
              frame={frame}
              seed={i}
            />
          );
        })}
      </g>
    </svg>
  );
};

/** 평면 수식 도식: "A + B = C" 를 박스 + 연산자로. */
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
  const safeScale = Math.min(1, (W - 160) / totalW);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2}) scale(${safeScale})`}>
        {items.map((item, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const isSum = i === items.length - 1;
          const cx = boxX[i];
          return (
            <FlatNode
              key={item.id}
              cx={cx}
              cy={0}
              label={item.label}
              shape="box"
              accent={theme.accent}
              emphasize={isSum}
              theme={theme}
              appear={appear}
              frame={frame}
              seed={i}
            />
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
              y={26}
              textAnchor="middle"
              opacity={pop}
              style={{ fontFamily: PRETENDARD, fontWeight: 900, fontSize: 88, fill: theme.sub }}
            >
              {sym}
            </text>
          );
        })}
      </g>
    </svg>
  );
};

/** 평면 궤도: 노드 2개 관계를 원 2개 + 점선 궤도로. */
const OrbitPair: React.FC<{
  nodes: { id: string; label: string }[];
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
}> = ({ nodes, narration, durationInFrames, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const pair = nodes.slice(0, 2);
  const revealAt = revealFrames(narration, durationInFrames, pair.length, { head: 0.08, tail: 0.7 });
  const r = 130;
  const gap = 90;
  const centers = [-(r * 2 + gap) / 2, (r * 2 + gap) / 2];
  const ringAt = revealAt[1] ?? 20;
  const ringProgress = interpolate(frame, [ringAt, ringAt + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rot = (frame / 8) % 360;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2})`}>
        <ellipse
          cx={0}
          cy={0}
          rx={r * 2 + gap / 2 + 60}
          ry={r + 90}
          fill="none"
          stroke={theme.sub}
          strokeWidth={4}
          strokeDasharray="18 18"
          pathLength={1}
          strokeDashoffset={1 - ringProgress}
          opacity={0.85}
          transform={`rotate(${rot})`}
          style={{ transformOrigin: 'center' }}
        />
        {pair.map((n, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <FlatNode
              key={n.id}
              cx={centers[i]}
              cy={0}
              label={n.label}
              shape="circle"
              accent={theme.accent}
              emphasize={i === pair.length - 1}
              theme={theme}
              appear={appear}
              frame={frame}
              seed={i}
            />
          );
        })}
      </g>
    </svg>
  );
};

/**
 * 타임라인 도식: 순차 단계(a→b→c→d)를 가로 기준선 + 등간격 마디로 그린다. 마디는 원, 라벨은
 * 위/아래로 교대. "박스+화살표"와 실루엣이 완전히 달라 같은 흐름도 다른 그림으로 보인다.
 */
const TimelineDiagram: React.FC<{
  nodes: { id: string; label: string }[];
  narration: string;
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ nodes, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const n = nodes.length;
  const revealAt = revealFrames(narration, durationInFrames, n, { head: 0.05, tail: 0.72 });
  const lineY = 0;
  const x0 = -760;
  const x1 = 760;
  const xs = nodes.map((_, i) => (n <= 1 ? 0 : x0 + (i / (n - 1)) * (x1 - x0)));
  const lineProgress = interpolate(frame, [revealAt[0] ?? 0, (revealAt[n - 1] ?? 0) + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2})`}>
        {/* 기준선 (그어지는 애니메이션) */}
        <line
          x1={x0}
          y1={lineY}
          x2={x0 + (x1 - x0) * lineProgress}
          y2={lineY}
          stroke={theme.sub}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {nodes.map((node, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (appear <= 0) return null;
          const cx = xs[i];
          const above = i % 2 === 0;
          const emphasize = i === n - 1;
          const dotR = 20 * popScale(appear);
          const labelY = above ? -60 : 60;
          const tickTop = above ? -34 : 34;
          const bob = Math.sin((frame + i * 40) / 28) * 4 * appear;
          return (
            <g key={node.id} opacity={Math.min(1, appear * 1.4)}>
              <line x1={cx} y1={lineY} x2={cx} y2={tickTop} stroke={theme.muted} strokeWidth={3} strokeDasharray="1 7" strokeLinecap="round" />
              <circle cx={cx} cy={lineY} r={dotR} fill={emphasize ? theme.accent : theme.paper} stroke={emphasize ? theme.accent : theme.ink} strokeWidth={5} />
              {emphasize && <circle cx={cx} cy={lineY} r={dotR + 10 + (Math.sin(frame / 9) + 1) * 5} fill="none" stroke={theme.accent} strokeWidth={3} opacity={0.4} />}
              <foreignObject x={cx - 160} y={(above ? labelY - 90 : labelY) + bob} width={320} height={110}>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: above ? 'flex-end' : 'flex-start',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontFamily: PRETENDARD,
                    fontWeight: 800,
                    fontSize: node.label.length > 8 ? 34 : 42,
                    color: emphasize ? theme.accent : theme.ink,
                    lineHeight: 1.2,
                    wordBreak: 'keep-all',
                  }}
                >
                  {node.label}
                </div>
              </foreignObject>
              <text x={cx} y={above ? 8 : 8} textAnchor="middle" style={{ fontFamily: PRETENDARD, fontWeight: 900, fontSize: 20, fill: emphasize ? '#fff' : theme.sub }}>
                {i + 1}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/**
 * 순환 도식: 닫힌 루프(a→b→c→a)를 원형으로 배치하고 곡선 화살표가 시계방향으로 돈다.
 * 판단→실행→관찰 루프 같은 "반복되는 순환"에 딱 맞고, 다른 도식과 구도가 완전히 다르다.
 */
const CycleDiagram: React.FC<{
  nodes: { id: string; label: string }[];
  narration: string;
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ nodes, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const n = nodes.length;
  const revealAt = revealFrames(narration, durationInFrames, n, { head: 0.05, tail: 0.68 });
  const R = 330;
  const pos = nodes.map((_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <ArrowHeadDef theme={theme} />
      <g transform={`translate(${W / 2}, ${H / 2})`}>
        {nodes.map((_, i) => {
          const j = (i + 1) % n;
          const at = Math.max(revealAt[i] ?? 0, revealAt[j] ?? 0) + 8;
          const progress = interpolate(frame, [at, at + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          // 원호를 따라 살짝 바깥으로 부푼 곡선.
          const p0 = pos[i];
          const p2 = pos[j];
          const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
          const mlen = Math.hypot(mid.x, mid.y) || 1;
          const bulge = 1.28;
          const ctrl = { x: (mid.x / mlen) * R * bulge, y: (mid.y / mlen) * R * bulge };
          // 노드 반지름만큼 물러나게.
          const a0 = Math.atan2(ctrl.y - p0.y, ctrl.x - p0.x);
          const a2 = Math.atan2(ctrl.y - p2.y, ctrl.x - p2.x);
          const pad = 96;
          const s = { x: p0.x + Math.cos(a0) * pad, y: p0.y + Math.sin(a0) * pad };
          const e = { x: p2.x + Math.cos(a2) * pad, y: p2.y + Math.sin(a2) * pad };
          const d = `M ${s.x} ${s.y} Q ${ctrl.x} ${ctrl.y} ${e.x} ${e.y}`;
          const len = 400;
          const pulseActive = progress >= 0.9;
          const pulseT = pulseActive ? ((frame + i * 12) % 46) / 46 : 0;
          const pp = quadPoint(s, ctrl, e, pulseT);
          const pf = pulseActive ? interpolate(pulseT, [0, 0.1, 0.9, 1], [0, 1, 1, 0]) : 0;
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={theme.accent}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={len}
                strokeDashoffset={len * (1 - progress)}
                markerEnd={progress > 0.9 ? 'url(#flat-arrowhead)' : undefined}
              />
              {pulseActive && <circle cx={pp.x} cy={pp.y} r={8} fill={theme.accent} opacity={pf} />}
            </g>
          );
        })}
        {nodes.map((node, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <FlatNode
              key={node.id}
              cx={pos[i].x}
              cy={pos[i].y}
              label={node.label}
              shape="circle"
              accent={theme.accent}
              emphasize={false}
              theme={theme}
              appear={appear}
              frame={frame}
              seed={i}
            />
          );
        })}
      </g>
    </svg>
  );
};

/**
 * 레이어(계층) 도식: 순차/누적 단계를 아래에서 위로 쌓이는 가로 막대로 그린다. 밑에서부터
 * 하나씩 쌓여 올라가는 애니메이션이라 "토대 위에 얹는" 구조(사전학습→튜닝→정렬 등)에 잘 맞고,
 * 타임라인/컨베이어와 실루엣이 또 다르다.
 */
const LayersDiagram: React.FC<{
  nodes: { id: string; label: string }[];
  narration: string;
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ nodes, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const layers = nodes.slice(0, 6);
  const n = layers.length;
  // 아래(마지막) → 위(첫) 순서로 쌓는 게 자연스러운 경우가 많지만, 나레이션 순서대로 등장시키되
  // 배치는 첫 항목이 맨 위가 되게 한다(사슬 순서 = 위에서 아래로 읽힘).
  const revealAt = revealFrames(narration, durationInFrames, n, { head: 0.06, tail: 0.72 });
  const barW = 1180;
  const barH = 108;
  const gap = 26;
  const totalH = n * barH + (n - 1) * gap;
  const top = -totalH / 2;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2})`}>
        {layers.map((node, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (appear <= 0) return null;
          const y = top + i * (barH + gap);
          // 계단식 들여쓰기(피라미드 느낌): 위층일수록 살짝 좁게.
          const shrink = (n - 1 - i) * 26;
          const w = barW - shrink;
          const x = -w / 2;
          const emphasize = i === n - 1;
          const color = emphasize ? theme.accent : theme.ink;
          const slide = (1 - appear) * 40;
          return (
            <g key={node.id} opacity={Math.min(1, appear * 1.4)} transform={`translate(0, ${slide})`}>
              <rect x={x} y={y} width={w} height={barH} rx={16} fill={theme.paper} stroke={color} strokeWidth={emphasize ? 6 : 4} />
              <rect x={x} y={y} width={12} height={barH} rx={0} fill={color} opacity={0.85} />
              <foreignObject x={x + 34} y={y} width={w - 60} height={barH}>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: PRETENDARD,
                    fontWeight: 700,
                    fontSize: node.label.length > 16 ? 38 : 46,
                    color: theme.ink,
                    wordBreak: 'keep-all',
                  }}
                >
                  {node.label}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/**
 * 2×2 매트릭스: 관계(엣지)가 아니라 병렬 분류 4개를 사분면에 배치. 축이 있는 비교/분류
 * (예: 중요도×긴급도, 학습형×실행형)에 어울리며 노드+화살표와 완전히 다른 그림.
 */
const MatrixDiagram: React.FC<{
  nodes: { id: string; label: string }[];
  narration: string;
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ nodes, narration, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const cells = nodes.slice(0, 4);
  const revealAt = revealFrames(narration, durationInFrames, cells.length, { head: 0.06, tail: 0.72 });
  const cw = 520;
  const ch = 300;
  const gap = 40;
  const centers = [
    { x: -(cw + gap) / 2, y: -(ch + gap) / 2 },
    { x: (cw + gap) / 2, y: -(ch + gap) / 2 },
    { x: -(cw + gap) / 2, y: (ch + gap) / 2 },
    { x: (cw + gap) / 2, y: (ch + gap) / 2 },
  ];
  const axis = interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(${W / 2}, ${H / 2})`}>
        <line x1={0} y1={-(ch + gap / 2 + 30) * axis} x2={0} y2={(ch + gap / 2 + 30) * axis} stroke={theme.muted} strokeWidth={4} />
        <line x1={-(cw + gap / 2 + 30) * axis} y1={0} x2={(cw + gap / 2 + 30) * axis} y2={0} stroke={theme.muted} strokeWidth={4} />
        {cells.map((node, i) => {
          const at = revealAt[i] ?? 0;
          const appear = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (appear <= 0) return null;
          const c = centers[i];
          const color = monoRamp(theme, 4)[i % 4];
          return (
            <g key={node.id} opacity={Math.min(1, appear * 1.4)} transform={`translate(${c.x}, ${c.y}) scale(${popScale(appear)}) translate(${-c.x}, ${-c.y})`}>
              <rect x={c.x - cw / 2} y={c.y - ch / 2} width={cw} height={ch} rx={20} fill={theme.paper} stroke={color} strokeWidth={5} />
              <foreignObject x={c.x - cw / 2 + 28} y={c.y - ch / 2 + 20} width={cw - 56} height={ch - 40}>
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
                    fontSize: node.label.length > 14 ? 40 : 50,
                    color: theme.ink,
                    lineHeight: 1.25,
                    wordBreak: 'keep-all',
                  }}
                >
                  {node.label}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/** 평면 좌/우 비교: 두 무리의 카드가 나레이션에 맞춰 그려지고 가운데 VS. */
export const IsoComparison: React.FC<{
  comparison: { leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] };
  narration: string;
  durationInFrames: number;
  theme?: VisualTheme;
}> = ({ comparison, narration, durationInFrames, theme = defaultTheme }) => {
  const frame = useCurrentFrame();
  const items = [
    ...comparison.leftItems.map((t) => ({ side: 'l' as const, t })),
    ...comparison.rightItems.map((t) => ({ side: 'r' as const, t })),
  ];
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.75 });

  const leftCount = comparison.leftItems.length;
  const rightCount = comparison.rightItems.length;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      {/* 타이틀 */}
      <foreignObject x={W / 2 - 900} y={110} width={760} height={110}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 58, color: theme.ink, textAlign: 'center', wordBreak: 'keep-all' }}>
          {comparison.leftTitle}
        </div>
      </foreignObject>
      <foreignObject x={W / 2 + 140} y={110} width={760} height={110}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 58, color: theme.accent2, textAlign: 'center', wordBreak: 'keep-all' }}>
          {comparison.rightTitle}
        </div>
      </foreignObject>

      {/* 가운데 구분선 + VS */}
      <line x1={W / 2} y1={250} x2={W / 2} y2={930} stroke={theme.muted} strokeWidth={3} strokeDasharray="2 14" />
      <circle cx={W / 2} cy={575} r={58} fill={theme.ink} />
      <text x={W / 2} y={592} textAnchor="middle" fontFamily={PRETENDARD} fontWeight={800} fontSize={38} fill={theme.paper}>
        VS
      </text>

      {items.map((it, gi) => {
        const at = revealAt[gi] ?? 0;
        const appear = interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (appear <= 0) return null;
        const idx = it.side === 'l' ? comparison.leftItems.indexOf(it.t) : comparison.rightItems.indexOf(it.t);
        const count = it.side === 'l' ? leftCount : rightCount;
        const colX = it.side === 'l' ? W / 2 - 470 : W / 2 + 470;
        const bandTop = 330;
        const bandBottom = 870;
        const y = count <= 1 ? (bandTop + bandBottom) / 2 : bandTop + (idx / (count - 1)) * (bandBottom - bandTop);
        const slide = (1 - appear) * (it.side === 'l' ? -70 : 70);
        const bob = Math.sin((frame + idx * 30) / 28) * 5 * appear;
        const accent = it.side === 'l' ? theme.ink : theme.accent2;
        const cardW = 620;
        const cardH = 128;
        const fontSize = it.t.length > 18 ? 30 : it.t.length > 12 ? 36 : 42;

        return (
          <g key={`${it.side}-${idx}`} transform={`translate(${colX + slide}, ${y + bob}) scale(${popScale(appear)})`} opacity={Math.min(1, appear * 1.4)}>
            <rect
              x={-cardW / 2}
              y={-cardH / 2}
              width={cardW}
              height={cardH}
              rx={20}
              fill={theme.paper}
              stroke={accent}
              strokeWidth={5}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - Math.min(1, appear * 1.15)}
            />
            <foreignObject x={-cardW / 2 + 24} y={-cardH / 2 + 14} width={cardW - 48} height={cardH - 28}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontFamily: PRETENDARD,
                  fontWeight: 700,
                  fontSize,
                  lineHeight: 1.25,
                  color: theme.ink,
                  wordBreak: 'keep-all',
                  opacity: interpolate(appear, [0.4, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}
              >
                {it.t}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
};
