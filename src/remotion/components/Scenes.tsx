import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import type { Scene } from '../../schema.js';
import { theme, nodeColors } from '../theme.js';
import { Heading, usePopIn, useDrawProgress } from './Layout.js';
import { RoughBox, RoughEllipse, RoughArrow } from './Rough.js';

/** 씬 종류에 따라 알맞은 비주얼을 그린다. */
export const SceneVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.visual) {
    case 'title':
      return <TitleVisual scene={scene} />;
    case 'diagram':
      return <DiagramVisual scene={scene} />;
    case 'comparison':
      return <ComparisonVisual scene={scene} />;
    case 'quote':
      return <QuoteVisual scene={scene} />;
    case 'outro':
      return <OutroVisual scene={scene} />;
    case 'bullets':
    default:
      return <BulletsVisual scene={scene} />;
  }
};

const TitleVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  const pop = usePopIn(6);
  const boxDraw = useDrawProgress(0, 26);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <svg width={1500} height={520} viewBox="0 0 1500 520">
        <RoughBox x={40} y={40} width={1420} height={440} stroke={theme.accent2} strokeWidth={5} roughness={1.6} seed={7} progress={boxDraw} />
      </svg>
      <div
        style={{
          position: 'absolute',
          textAlign: 'center',
          transform: `scale(${0.85 + pop * 0.15})`,
          opacity: pop,
          maxWidth: 1300,
        }}
      >
        <div style={{ fontFamily: theme.handFont, fontSize: 40, color: theme.accent }}>AI 이야기</div>
        <h1 style={{ fontFamily: theme.handFont, fontSize: 96, color: theme.ink, margin: '10px 0', lineHeight: 1.15 }}>
          {scene.heading}
        </h1>
        {scene.bullets[0] && (
          <p style={{ fontFamily: theme.bodyFont, fontSize: 40, color: theme.sub }}>{scene.bullets[0]}</p>
        )}
      </div>
    </AbsoluteFill>
  );
};

const BulletsVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <div style={{ position: 'absolute', top: 280, left: 160, right: 160 }}>
        {scene.bullets.map((b, i) => {
          const start = 20 + i * 22;
          const appear = interpolate(frame, [start, start + 16], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const dotDraw = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                marginBottom: 34,
                opacity: appear,
                transform: `translateX(${(1 - appear) * -40}px)`,
              }}
            >
              <svg width={54} height={54} style={{ flexShrink: 0 }}>
                <RoughEllipse
                  cx={27}
                  cy={27}
                  width={44}
                  height={44}
                  stroke={nodeColors[i % nodeColors.length]}
                  fill={nodeColors[i % nodeColors.length]}
                  strokeWidth={3}
                  seed={i + 3}
                  progress={dotDraw}
                />
              </svg>
              <span style={{ fontFamily: theme.bodyFont, fontSize: 52, color: theme.ink, fontWeight: 700 }}>
                {b}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const DiagramVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const diagram = scene.diagram;
  if (!diagram || diagram.nodes.length === 0) return <BulletsVisual scene={scene} />;

  // 자동 레이아웃: 노드를 1~2행으로 배치.
  const nodes = diagram.nodes;
  const perRow = nodes.length <= 3 ? nodes.length : Math.ceil(nodes.length / 2);
  const boxW = 320;
  const boxH = 130;
  const areaLeft = 160;
  const areaRight = 1760;
  const rows = Math.ceil(nodes.length / perRow);
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const countInRow = Math.min(perRow, nodes.length - row * perRow);
    const gap = (areaRight - areaLeft - countInRow * boxW) / (countInRow + 1);
    const x = areaLeft + gap + col * (boxW + gap);
    const y = 340 + row * 240 - (rows - 1) * 20;
    pos[n.id] = { x, y };
  });

  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        {/* 엣지(화살표) — 노드가 대략 등장한 뒤 그린다. */}
        {diagram.edges.map((e, i) => {
          const a = pos[e.from];
          const b = pos[e.to];
          if (!a || !b) return null;
          const start = 20 + nodes.length * 10 + i * 12;
          const prog = interpolate(frame, [start, start + 22], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const ax = a.x + boxW / 2;
          const ay = a.y + boxH;
          const bx = b.x + boxW / 2;
          const by = b.y;
          const sameRow = Math.abs(a.y - b.y) < 10;
          const x1 = sameRow ? a.x + boxW : ax;
          const y1 = sameRow ? a.y + boxH / 2 : ay;
          const x2 = sameRow ? b.x : bx;
          const y2 = sameRow ? b.y + boxH / 2 : by;
          return (
            <g key={i}>
              <RoughArrow x1={x1} y1={y1} x2={x2} y2={y2} progress={prog} stroke={theme.sub} strokeWidth={3} seed={i * 3 + 1} />
              {e.label && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 12}
                  fontFamily={theme.handFont}
                  fontSize={30}
                  fill={theme.accent}
                  textAnchor="middle"
                  opacity={prog}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {/* 노드 박스 */}
        {nodes.map((n, i) => {
          const p = pos[n.id];
          const start = 14 + i * 12;
          const prog = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const color = nodeColors[i % nodeColors.length];
          return (
            <g key={n.id}>
              <RoughBox x={p.x} y={p.y} width={boxW} height={boxH} stroke={color} strokeWidth={4} roughness={1.5} seed={i + 11} progress={prog} />
              <text
                x={p.x + boxW / 2}
                y={p.y + boxH / 2 + 12}
                fontFamily={theme.handFont}
                fontSize={38}
                fill={theme.ink}
                textAnchor="middle"
                opacity={prog}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

const ComparisonVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  const cmp = scene.comparison;
  const leftDraw = useDrawProgress(14, 22);
  const rightDraw = useDrawProgress(24, 22);
  if (!cmp) return <BulletsVisual scene={scene} />;
  const Col = (props: {
    title: string;
    items: string[];
    color: string;
    x: number;
    draw: number;
    startFrame: number;
  }) => (
    <>
      <svg width={820} height={640} viewBox="0 0 820 640" style={{ position: 'absolute', top: 280, left: props.x }}>
        <RoughBox x={20} y={20} width={780} height={600} stroke={props.color} strokeWidth={4} roughness={1.4} seed={props.x} progress={props.draw} />
      </svg>
      <div style={{ position: 'absolute', top: 300, left: props.x + 20, width: 780, padding: 40, boxSizing: 'border-box' }}>
        <div style={{ fontFamily: theme.handFont, fontSize: 56, color: props.color, marginBottom: 24 }}>{props.title}</div>
        <ItemsList items={props.items} startFrame={props.startFrame} />
      </div>
    </>
  );
  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <Col title={cmp.leftTitle} items={cmp.leftItems} color={theme.accent2} x={120} draw={leftDraw} startFrame={26} />
      <div style={{ position: 'absolute', top: 520, left: 950, transform: 'translateX(-50%)', fontFamily: theme.handFont, fontSize: 72, color: theme.muted }}>
        VS
      </div>
      <Col title={cmp.rightTitle} items={cmp.rightItems} color={theme.accent} x={980} draw={rightDraw} startFrame={36} />
    </AbsoluteFill>
  );
};

const ItemsList: React.FC<{ items: string[]; startFrame: number }> = ({ items, startFrame }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {items.map((it, i) => {
        const s = startFrame + i * 14;
        const op = interpolate(frame, [s, s + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 22, opacity: op }}>
            <span style={{ fontFamily: theme.handFont, fontSize: 40, color: theme.ink }}>•</span>
            <span style={{ fontFamily: theme.bodyFont, fontSize: 40, color: theme.ink, fontWeight: 600 }}>{it}</span>
          </div>
        );
      })}
    </>
  );
};

const QuoteVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  const pop = usePopIn(8);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 160 }}>
      <div style={{ fontFamily: theme.handFont, fontSize: 220, color: theme.highlight, lineHeight: 0.4 }}>“</div>
      <p
        style={{
          fontFamily: theme.handFont,
          fontSize: 84,
          color: theme.ink,
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: 1500,
          transform: `scale(${0.9 + pop * 0.1})`,
          opacity: pop,
        }}
      >
        {scene.bullets[0] ?? scene.heading}
      </p>
    </AbsoluteFill>
  );
};

const OutroVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const subPop = interpolate(frame, [50, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontFamily: theme.handFont, fontSize: 80, color: theme.ink, marginBottom: 40 }}>{scene.heading}</h1>
      <div style={{ width: 1200 }}>
        {scene.bullets.map((b, i) => {
          const s = 10 + i * 18;
          const op = interpolate(frame, [s, s + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ display: 'flex', gap: 20, marginBottom: 28, opacity: op, justifyContent: 'center' }}>
              <span style={{ fontFamily: theme.handFont, fontSize: 48, color: theme.accent }}>✓</span>
              <span style={{ fontFamily: theme.bodyFont, fontSize: 46, color: theme.ink, fontWeight: 700 }}>{b}</span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 60,
          padding: '24px 60px',
          background: theme.accent,
          color: 'white',
          fontFamily: theme.handFont,
          fontSize: 56,
          borderRadius: 20,
          transform: `scale(${0.8 + subPop * 0.2})`,
          opacity: subPop,
          boxShadow: '8px 8px 0 #00000020',
        }}
      >
        👍 구독 &amp; 좋아요
      </div>
    </AbsoluteFill>
  );
};
