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

/** 2:1 등각 투영. (x,y) 는 바닥 격자 좌표, z 는 높이. */
function isoProject(x: number, y: number, z = 0) {
  return {
    sx: (x - y) * ISO_SCALE_X,
    sy: (x + y) * ISO_SCALE_Y - z,
  };
}
const ISO_SCALE_X = 150;
const ISO_SCALE_Y = 75;

/** 얇은 등각 원반(플랫폼) — 참조 영상의 떠 있는 디스크. 그레이스케일 잉크 라인. */
const IsoDisk: React.FC<{
  cx: number;
  cy: number;
  r?: number;
  depth?: number;
  fill?: string;
  bob?: number; // 상하 부유 오프셋(px)
}> = ({ cx, cy, r = 78, depth = 16, fill = '#f1f2f4', bob = 0 }) => {
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
    <line x1={x} y1={y + 18} x2={x} y2={y + 58} stroke={theme.muted} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
    <foreignObject x={x - 260} y={y - 54} width={520} height={80}>
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
            fontSize: 34,
            lineHeight: 1.2,
            color: theme.ink,
            background: '#ffffff',
            border: `2.5px solid ${accent ?? theme.ink}`,
            borderRadius: 14,
            padding: '10px 22px',
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 0 rgba(30,30,30,0.08)',
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
  const my = (from.y + to.y) / 2 - 34;
  const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
  const len = Math.hypot(to.x - from.x, to.y - from.y) * 1.3 + 60;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={accent}
        strokeWidth={4}
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
    <marker id="iso-arrowhead" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 Z" fill={theme.accent} />
    </marker>
  </defs>
);

/** 등각 개념 도식: 노드가 대각선 컨베이어처럼 배치되고 순서대로 떠오르며 화살표로 연결된다. */
export const IsoDiagram: React.FC<{ diagram: Diagram; narration: string; durationInFrames: number }> = ({
  diagram,
  narration,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const nodes = diagram.nodes.slice(0, 6);
  const revealAt = revealFrames(narration, durationInFrames, nodes.length, { head: 0.04, tail: 0.7 });

  // 대각선 컨베이어 라인 위에 노드 배치 (참조 영상처럼).
  const positions = nodes.map((_, i) => {
    const t = nodes.length <= 1 ? 0 : i / (nodes.length - 1);
    const gx = -2 + t * 4; // 격자 좌표 -2..2
    const gy = -1 + t * 1.4;
    return isoProject(gx, gy);
  });

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
          const bob = Math.sin((frame + i * 40) / 26) * 6;
          const { sx, sy } = positions[i];
          const scale = 0.7 + pop * 0.3;
          return (
            <g key={n.id} transform={`translate(${sx}, ${sy}) scale(${scale}) translate(${-sx}, ${-sy})`} opacity={pop}>
              <IsoDisk cx={sx} cy={sy} bob={bob} fill={i % 2 === 0 ? '#f1f2f4' : '#e7e8eb'} />
              <LabelChip x={sx} y={sy - 46 + bob} text={n.label} accent={i === nodes.length - 1 ? theme.accent : theme.ink} />
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
      <foreignObject x={W / 2 - 900} y={140} width={760} height={80}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 46, color: theme.ink, textAlign: 'center' }}>
          {comparison.leftTitle}
        </div>
      </foreignObject>
      <foreignObject x={W / 2 + 140} y={140} width={760} height={80}>
        <div style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 46, color: theme.accent2, textAlign: 'center' }}>
          {comparison.rightTitle}
        </div>
      </foreignObject>

      {/* 가운데 구분선 + VS */}
      <line x1={W / 2} y1={190} x2={W / 2} y2={920} stroke={theme.muted} strokeWidth={2} strokeDasharray="2 10" />
      <circle cx={W / 2} cy={555} r={46} fill={theme.ink} />
      <text x={W / 2} y={568} textAnchor="middle" fontFamily={PRETENDARD} fontWeight={800} fontSize={30} fill="#fff">
        VS
      </text>

      {items.map((it, gi) => {
        const at = revealAt[gi] ?? 0;
        const pop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (pop <= 0) return null;
        const idx = it.side === 'l' ? comparison.leftItems.indexOf(it.t) : comparison.rightItems.indexOf(it.t);
        const count = it.side === 'l' ? leftCount : rightCount;
        const colX = it.side === 'l' ? W / 2 - 480 : W / 2 + 480;
        const stackTop = 300;
        const gap = 150;
        const y = stackTop + idx * gap - ((count - 1) * gap) / 2 + 280;
        const slide = (1 - pop) * (it.side === 'l' ? -60 : 60);
        const bob = Math.sin((frame + idx * 30) / 30) * 4;

        return (
          <g key={`${it.side}-${idx}`} opacity={pop} transform={`translate(${slide}, 0)`}>
            <IsoDisk cx={colX} cy={y + bob} r={64} depth={12} fill={it.side === 'l' ? '#f1f2f4' : '#eaf1fb'} />
            <foreignObject x={colX - 260} y={y - 40 + bob} width={520} height={70}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div
                  style={{
                    fontFamily: PRETENDARD,
                    fontWeight: 700,
                    fontSize: 30,
                    color: theme.ink,
                    background: '#ffffff',
                    border: `2px solid ${it.side === 'l' ? theme.ink : theme.accent2}`,
                    borderRadius: 12,
                    padding: '8px 20px',
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
