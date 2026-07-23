import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { Diagram } from '../../schema.js';
import { theme } from '../theme.js';
import { PRETENDARD } from '../pretendard.js';
import { revealFrames } from './beats.js';

/**
 * 등각(isometric) 모션 그래픽 컴포넌트.
 * diagram/comparison 씬은 AI 그림 대신 이 코드 기반 벡터 애니메이션으로 그린다 —
 * 노드/엣지·좌우비교처럼 "구조화된 데이터"는 참조 영상(Vonix 스타일)처럼
 * 흑백 등각 카드가 나레이션에 맞춰 순서대로 떠오르는 편이 AI 그림보다 훨씬 깔끔하다.
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
}> = ({ cx, cy, r = 128, depth = 26, fill = '#f1f2f4', bob = 0 }) => {
  const ry = r * 0.5;
  const y = cy + bob;
  return (
    <g>
      {/* 그림자 */}
      <ellipse cx={cx} cy={cy + depth + 10} rx={r * 0.9} ry={ry * 0.55} fill="rgba(30,30,30,0.08)" />
      {/* 옆면(두께) */}
      <path
        d={`M ${cx - r} ${y} A ${r} ${ry} 0 0 0 ${cx + r} ${y} L ${cx + r} ${y + depth} A ${r} ${ry} 0 0 1 ${cx - r} ${y + depth} Z`}
        fill="#dcdde0"
        stroke={theme.ink}
        strokeWidth={2.5}
      />
      {/* 윗면 */}
      <ellipse cx={cx} cy={y} rx={r} ry={ry} fill={fill} stroke={theme.ink} strokeWidth={2.5} />
    </g>
  );
};

/** 노드/항목 위에 뜨는 라벨 칩(카드). 화면 텍스트라 가독성 위해 정면 플랫으로 그림. */
const LabelChip: React.FC<{ x: number; y: number; text: string; accent?: string }> = ({ x, y, text, accent }) => (
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
            background: '#ffffff',
            border: `3.5px solid ${accent ?? theme.ink}`,
            borderRadius: 18,
            padding: '14px 30px',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 0 rgba(30,30,30,0.08)',
          }}
        >
          {text}
        </div>
      </div>
    </foreignObject>
  </g>
);

/** 노드 사이를 잇는 화살표. progress(0~1) 만큼 그어지는 draw-on 애니메이션. */
const IsoArrow: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number }; progress: number; accent?: string }> = ({
  from,
  to,
  progress,
  accent = theme.accent,
}) => {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 50;
  const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
  const len = Math.hypot(to.x - from.x, to.y - from.y) * 1.3 + 60;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={accent}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - progress)}
        markerEnd={progress > 0.85 ? 'url(#iso-arrowhead)' : undefined}
        opacity={progress > 0.02 ? 1 : 0}
      />
    </g>
  );
};

const ArrowHeadDef = () => (
  <defs>
    <marker id="iso-arrowhead" markerWidth="16" markerHeight="16" refX="9" refY="8" orient="auto">
      <path d="M0,0 L16,8 L0,16 Z" fill={theme.accent} />
    </marker>
  </defs>
);

type DiagramLayout = 'conveyor' | 'row' | 'hub';

/**
 * 매번 "대각선 컨베이어 + 원반 + 화살표"만 반복되지 않도록, 노드/엣지 구조와 씬 순번(seed)에
 * 따라 레이아웃을 다르게 고른다. 한 노드가 나머지 대부분과 연결된 허브 구조면 방사형(hub)으로,
 * 아니면 seed 로 대각선(conveyor)과 가로 지그재그(row)를 번갈아 쓴다.
 */
function pickLayout(nodes: { id: string }[], edges: { from: string; to: string }[], seed: number): DiagramLayout {
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

/** 등각 개념 도식: 구조에 따라 컨베이어/가로/허브 레이아웃 중 하나로 배치되고 순서대로 떠오르며 화살표로 연결된다. */
export const IsoDiagram: React.FC<{ diagram: Diagram; narration: string; durationInFrames: number; seed?: number }> = ({
  diagram,
  narration,
  durationInFrames,
  seed = 0,
}) => {
  const frame = useCurrentFrame();
  const nodes = diagram.nodes.slice(0, 6);
  const revealAt = revealFrames(narration, durationInFrames, nodes.length, { head: 0.04, tail: 0.7 });

  const layout = pickLayout(nodes, diagram.edges, seed);
  const positions = layoutPositions(nodes, diagram.edges, layout);

  const idMap = new Map(nodes.map((n, i) => [n.id, i]));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <ArrowHeadDef />
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
            />
          );
        })}

        {/* 노드 (디스크 + 라벨) */}
        {nodes.map((n, i) => {
          const at = revealAt[i] ?? 0;
          const pop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (pop <= 0) return null;
          const bob = Math.sin((frame + i * 40) / 26) * 8;
          const { sx, sy } = positions[i];
          const scale = 0.7 + pop * 0.3;
          return (
            <g key={n.id} transform={`translate(${sx}, ${sy}) scale(${scale}) translate(${-sx}, ${-sy})`} opacity={pop}>
              <IsoDisk cx={sx} cy={sy} bob={bob} fill={i % 2 === 0 ? '#f1f2f4' : '#e7e8eb'} />
              <LabelChip x={sx} y={sy - 104 + bob} text={n.label} accent={i === nodes.length - 1 ? theme.accent : theme.ink} />
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
}> = ({ comparison, narration, durationInFrames }) => {
  const frame = useCurrentFrame();
  const items = [...comparison.leftItems.map((t) => ({ side: 'l' as const, t })), ...comparison.rightItems.map((t) => ({ side: 'r' as const, t }))];
  const revealAt = revealFrames(narration, durationInFrames, items.length, { head: 0.08, tail: 0.75 });

  const leftCount = comparison.leftItems.length;
  const rightCount = comparison.rightItems.length;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <ArrowHeadDef />
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
      <text x={W / 2} y={582} textAnchor="middle" fontFamily={PRETENDARD} fontWeight={800} fontSize={40} fill="#fff">
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

        return (
          <g key={`${it.side}-${idx}`} opacity={pop} transform={`translate(${slide}, 0)`}>
            <IsoDisk cx={colX} cy={y + bob} r={108} depth={22} fill={it.side === 'l' ? '#f1f2f4' : '#eaf1fb'} />
            <foreignObject x={colX - 320} y={y - 62 + bob} width={640} height={90}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div
                  style={{
                    fontFamily: PRETENDARD,
                    fontWeight: 700,
                    fontSize: 40,
                    color: theme.ink,
                    background: '#ffffff',
                    border: `3px solid ${it.side === 'l' ? theme.ink : theme.accent2}`,
                    borderRadius: 16,
                    padding: '12px 26px',
                    whiteSpace: 'nowrap',
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
