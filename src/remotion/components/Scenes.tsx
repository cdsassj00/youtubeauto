import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import type { Scene } from '../../schema.js';
import { theme, nodeColors } from '../theme.js';
import { Heading, usePopIn, useDrawProgress } from './Layout.js';
import { RoughBox, RoughEllipse, RoughArrow, RoughLine } from './Rough.js';
import { revealFrames, activeIndex } from './beats.js';

/**
 * 씬 종류에 따라 알맞은 비주얼을 그린다.
 * dur(씬 전체 프레임)과 narration 을 받아, 시각 요소가 씬 내내 나레이션에 맞춰
 * 순차로 살아 움직이게 한다(첫 몇 초에 다 그려지고 멈추던 문제 해결).
 */
export const SceneVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  switch (scene.visual) {
    case 'title':
      return <TitleVisual scene={scene} dur={dur} />;
    case 'diagram':
      return <DiagramVisual scene={scene} dur={dur} />;
    case 'comparison':
      return <ComparisonVisual scene={scene} dur={dur} />;
    case 'quote':
      return <QuoteVisual scene={scene} />;
    case 'outro':
      return <OutroVisual scene={scene} dur={dur} />;
    case 'metric':
      // ★metric/bars 는 나중에 추가된 도식이라 여기 없었다★ default 로 떨어져
      // 불릿 화면으로 렌더됐고, 숫자가 통째로 사라졌다(빈 화면에 가까웠다).
      return scene.metric?.value ? <MetricVisual scene={scene} dur={dur} /> : <BulletsVisual scene={scene} dur={dur} />;
    case 'bars':
      return scene.bars?.items?.length ? <BarsVisual scene={scene} dur={dur} /> : <BulletsVisual scene={scene} dur={dur} />;
    case 'bullets':
    default:
      return <BulletsVisual scene={scene} dur={dur} />;
  }
};

/**
 * 큰 숫자 하나 — 손으로 크게 쓴 것처럼. 상자·화살표 없이 숫자가 화면의 주인공이다.
 * 자릿수가 많으면 글자를 줄여 화면 밖으로 안 나가게 한다.
 */
const MetricVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const f = useFloat(7, 6, 0.6);
  const value = scene.metric?.value ?? '';
  // 등장은 나레이션 첫 문장에 맞춘다 — 말보다 먼저 튀어나오면 김이 샌다.
  const [at] = revealFrames(scene.narration, dur, 1, { head: 0.08, tail: 0.5 });
  const pop = interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const size = value.length > 10 ? 150 : value.length > 6 ? 200 : 260;
  const underline = interpolate(frame, [at + 14, at + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <div style={{ position: 'absolute', top: 300, left: 160, right: 160, transform: `translateY(${f.y}px)` }}>
        <div
          style={{
            fontSize: size,
            fontWeight: 800,
            color: theme.accent,
            letterSpacing: '-.04em',
            lineHeight: 1.05,
            opacity: pop,
            transform: `scale(${0.9 + pop * 0.1})`,
            transformOrigin: 'left center',
          }}
        >
          {value}
        </div>
        {/* 숫자 밑에 손으로 그은 밑줄 — 강조가 손그림 결을 유지하게 */}
        <svg width="900" height="26" style={{ display: 'block', marginTop: 6 }}>
          <RoughLine x1={4} y1={14} x2={4 + 880 * underline} y2={16} stroke={theme.accent} strokeWidth={6} seed={7} />
        </svg>
        {scene.metric?.label && (
          <div style={{ marginTop: 18, fontSize: 44, color: theme.ink, opacity: pop }}>{scene.metric.label}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** 막대 비교 — 길이로 크기 차이를 보여준다. 막대도 손으로 그린 상자로 그린다. */
const BarsVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const items = (scene.bars?.items ?? []).slice(0, 5);
  const unit = scene.bars?.unit ?? '';
  // 최댓값이 0 이면 나눗셈이 NaN 이 되어 막대가 통째로 사라진다.
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  const revealAt = revealFrames(scene.narration, dur, items.length, { head: 0.1, tail: 0.76 });
  const TRACK = 900;

  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <div style={{ position: 'absolute', top: 300, left: 160, right: 120 }}>
        {items.map((it, i) => {
          const start = revealAt[i];
          const grow = interpolate(frame, [start, start + 26], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const w = Math.max(8, (Number(it.value) / max) * TRACK) * grow;
          const top = Number(it.value) >= max;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 26 }}>
              <div style={{ width: 300, fontSize: 38, color: theme.ink, opacity: grow > 0 ? 1 : 0 }}>{it.label}</div>
              <svg width={TRACK + 10} height="62">
                <RoughBox
                  x={4}
                  y={8}
                  width={Math.max(8, w)}
                  height={44}
                  progress={1}
                  stroke={top ? theme.accent : theme.ink}
                  fill={top ? theme.accent : undefined}
                  fillStyle="hachure"
                  strokeWidth={3}
                  seed={i + 3}
                />
              </svg>
              <div style={{ width: 190, fontSize: 38, fontWeight: 700, color: theme.ink, opacity: grow }}>
                {it.value}
                {unit}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** 아주 느린 상시 부유(浮遊) — 화면이 절대 완전히 멈추지 않게. */
function useFloat(ampX = 10, ampY = 8, speed = 1): { x: number; y: number } {
  const frame = useCurrentFrame();
  return { x: Math.sin(frame / (90 / speed)) * ampX, y: Math.cos(frame / (110 / speed)) * ampY };
}

const TitleVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene }) => {
  const pop = usePopIn(6);
  const boxDraw = useDrawProgress(0, 26);
  const f = useFloat(14, 10, 0.8);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `translate(${f.x}px, ${f.y}px)` }}>
        <svg width={1500} height={520} viewBox="0 0 1500 520">
          <RoughBox x={40} y={40} width={1420} height={440} stroke={theme.accent2} strokeWidth={5} roughness={1.6} seed={7} progress={boxDraw} />
        </svg>
      </div>
      <div
        style={{
          position: 'absolute',
          textAlign: 'center',
          transform: `translate(${f.x}px, ${f.y}px) scale(${0.85 + pop * 0.15})`,
          opacity: pop,
          maxWidth: 1300,
        }}
      >
        <div style={{ fontFamily: theme.handFont, fontSize: 40, color: theme.accent }}>AI 이야기</div>
        <h1 style={{ fontFamily: theme.displayFont, fontSize: 100, color: theme.ink, margin: '10px 0', lineHeight: 1.15 }}>
          {scene.heading}
        </h1>
        {scene.bullets[0] && (
          <p style={{ fontFamily: theme.bodyFont, fontSize: 40, color: theme.sub }}>{scene.bullets[0]}</p>
        )}
      </div>
    </AbsoluteFill>
  );
};

const BulletsVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const bullets = scene.bullets.length ? scene.bullets : [scene.heading];
  // 불릿을 씬 전체에 걸쳐 문장 비트에 맞춰 등장시킨다.
  const revealAt = revealFrames(scene.narration, dur, bullets.length, { head: 0.1, tail: 0.78 });
  const active = activeIndex(revealAt, frame);
  const f = useFloat(6, 5, 0.7);

  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <div style={{ position: 'absolute', top: 300, left: 160, right: 160, transform: `translateY(${f.y}px)` }}>
        {bullets.map((b, i) => {
          const start = revealAt[i];
          const appear = interpolate(frame, [start, start + 16], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const dotDraw = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          // 지금 설명 중인 불릿을 강조(살짝 크게+진하게), 지난 불릿은 은은히 흐리게.
          const isCurrent = i === active;
          const focus = interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const dim = active > i ? 0.72 : 1;
          const pulse = isCurrent ? 1 + Math.sin(frame / 9) * 0.012 : 1;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                marginBottom: 34,
                opacity: appear * dim,
                transform: `translateX(${(1 - appear) * -40}px) scale(${(isCurrent ? 1.03 : 1) * pulse})`,
                transformOrigin: 'left center',
              }}
            >
              <svg width={58} height={58} style={{ flexShrink: 0 }}>
                <RoughEllipse
                  cx={29}
                  cy={29}
                  width={44 + focus * 4}
                  height={44 + focus * 4}
                  stroke={nodeColors[i % nodeColors.length]}
                  fill={nodeColors[i % nodeColors.length]}
                  strokeWidth={3}
                  seed={i + 3}
                  progress={dotDraw}
                />
              </svg>
              <span
                style={{
                  fontFamily: theme.bodyFont,
                  fontSize: 52,
                  color: isCurrent ? theme.ink : theme.sub,
                  fontWeight: isCurrent ? 800 : 700,
                }}
              >
                {b}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const DiagramVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const diagram = scene.diagram;
  if (!diagram || diagram.nodes.length === 0) return <BulletsVisual scene={scene} dur={dur} />;

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

  // 노드 등장 프레임을 씬 전체 길이에 배분(나레이션 비트에 스냅).
  const nodeReveal = revealFrames(scene.narration, dur, nodes.length, { head: 0.05, tail: 0.82, minGap: 16 });
  const active = activeIndex(nodeReveal, frame);
  const centerX = 960;
  const centerY = rows > 1 ? 560 : 460;

  // 카메라: 현재 설명 중인 노드를 씬 내내 따라다니다가, 마지막 구간에 전체로 줌아웃.
  const camKeys: number[] = [0];
  const camScale: number[] = [1.06];
  const camX: number[] = [centerX];
  const camY: number[] = [centerY];
  nodes.forEach((n, i) => {
    const p = pos[n.id];
    camKeys.push(nodeReveal[i] + 6);
    camScale.push(rows > 1 ? 1.34 : 1.28);
    camX.push(p.x + boxW / 2);
    camY.push(p.y + boxH / 2);
  });
  camKeys.push(Math.max(dur * 0.9, (nodeReveal[nodes.length - 1] ?? 0) + 24));
  camScale.push(1.0);
  camX.push(centerX);
  camY.push(centerY);
  // interpolate 는 단조 증가 키가 필요 — 보정.
  for (let i = 1; i < camKeys.length; i++) if (camKeys[i] <= camKeys[i - 1]) camKeys[i] = camKeys[i - 1] + 1;

  const easeOpt = {
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
    easing: Easing.inOut(Easing.ease),
  };
  // 상시 미세 드리프트로 정지감 제거.
  const driftX = Math.sin(frame / 100) * 8;
  const driftY = Math.cos(frame / 120) * 6;
  const cs = interpolate(frame, camKeys, camScale, easeOpt);
  const cfx = interpolate(frame, camKeys, camX, easeOpt) + driftX;
  const cfy = interpolate(frame, camKeys, camY, easeOpt) + driftY;
  const cam = `translate(${960 - cfx * cs} ${540 - cfy * cs}) scale(${cs})`;

  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <g transform={cam}>
          {/* 엣지(화살표): 연결된 목적지 노드가 등장한 직후 그린다. */}
          {diagram.edges.map((e, i) => {
            const a = pos[e.from];
            const b = pos[e.to];
            if (!a || !b) return null;
            const toIdx = nodes.findIndex((n) => n.id === e.to);
            const start = (nodeReveal[toIdx] ?? nodeReveal[nodes.length - 1] ?? 0) - 4;
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
            const hot = active === toIdx; // 지금 도달한 화살표 강조
            return (
              <g key={i}>
                <RoughArrow
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  progress={prog}
                  stroke={hot ? theme.accent : theme.sub}
                  strokeWidth={hot ? 4 : 3}
                  seed={i * 3 + 1}
                />
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
            const start = nodeReveal[i];
            const prog = interpolate(frame, [start, start + 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const color = nodeColors[i % nodeColors.length];
            const isCurrent = i === active;
            // 현재 노드는 은은히 맥동, 지난 노드는 살짝 흐리게.
            const pulse = isCurrent ? 1 + Math.sin(frame / 8) * 0.02 : 1;
            const nodeOpacity = active > i ? 0.82 : 1;
            const cx = p.x + boxW / 2;
            const cy = p.y + boxH / 2;
            return (
              <g key={n.id} opacity={nodeOpacity} transform={`translate(${cx} ${cy}) scale(${pulse}) translate(${-cx} ${-cy})`}>
                {isCurrent && (
                  <rect
                    x={p.x - 10}
                    y={p.y - 10}
                    width={boxW + 20}
                    height={boxH + 20}
                    rx={16}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.35 + Math.sin(frame / 7) * 0.15}
                  />
                )}
                <RoughBox x={p.x} y={p.y} width={boxW} height={boxH} stroke={color} strokeWidth={4} roughness={1.5} seed={i + 11} progress={prog} />
                <text
                  x={cx}
                  y={cy + 12}
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
        </g>
      </svg>
    </AbsoluteFill>
  );
};

const ComparisonVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  const cmp = scene.comparison;
  const leftDraw = useDrawProgress(14, 22);
  const rightDraw = useDrawProgress(Math.round(dur * 0.42), 22);
  if (!cmp) return <BulletsVisual scene={scene} dur={dur} />;
  // 왼쪽 항목은 앞부분, 오른쪽 항목은 뒷부분 나레이션에 맞춰 등장.
  const leftAt = revealFrames(scene.narration, dur, cmp.leftItems.length, { head: 0.12, tail: 0.44 });
  const rightAt = revealFrames(scene.narration, dur, cmp.rightItems.length, { head: 0.5, tail: 0.82 });
  const Col = (props: { title: string; items: string[]; color: string; x: number; draw: number; at: number[] }) => (
    <>
      <svg width={820} height={640} viewBox="0 0 820 640" style={{ position: 'absolute', top: 280, left: props.x }}>
        <RoughBox x={20} y={20} width={780} height={600} stroke={props.color} strokeWidth={4} roughness={1.4} seed={props.x} progress={props.draw} />
      </svg>
      <div style={{ position: 'absolute', top: 300, left: props.x + 20, width: 780, padding: 40, boxSizing: 'border-box' }}>
        <div style={{ fontFamily: theme.handFont, fontSize: 56, color: props.color, marginBottom: 24 }}>{props.title}</div>
        <ItemsList items={props.items} at={props.at} />
      </div>
    </>
  );
  return (
    <AbsoluteFill>
      <Heading text={scene.heading} />
      <Col title={cmp.leftTitle} items={cmp.leftItems} color={theme.accent2} x={120} draw={leftDraw} at={leftAt} />
      <div style={{ position: 'absolute', top: 520, left: 950, transform: 'translateX(-50%)', fontFamily: theme.handFont, fontSize: 72, color: theme.muted }}>
        VS
      </div>
      <Col title={cmp.rightTitle} items={cmp.rightItems} color={theme.accent} x={980} draw={rightDraw} at={rightAt} />
    </AbsoluteFill>
  );
};

const ItemsList: React.FC<{ items: string[]; at: number[] }> = ({ items, at }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {items.map((it, i) => {
        const s = at[i] ?? i * 14;
        const op = interpolate(frame, [s, s + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const slide = interpolate(frame, [s, s + 14], [-24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 22, opacity: op, transform: `translateX(${slide}px)` }}>
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
  const f = useFloat(10, 8, 0.6);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 160 }}>
      <div style={{ transform: `translate(${f.x}px, ${f.y}px)`, textAlign: 'center' }}>
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
      </div>
    </AbsoluteFill>
  );
};

const OutroVisual: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const revealAt = revealFrames(scene.narration, dur, scene.bullets.length, { head: 0.08, tail: 0.6 });
  const subPop = interpolate(frame, [dur * 0.72, dur * 0.72 + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontFamily: theme.displayFont, fontSize: 84, color: theme.ink, marginBottom: 40 }}>{scene.heading}</h1>
      <div style={{ width: 1200 }}>
        {scene.bullets.map((b, i) => {
          const s = revealAt[i] ?? 10 + i * 18;
          const op = interpolate(frame, [s, s + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const slide = interpolate(frame, [s, s + 16], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ display: 'flex', gap: 20, marginBottom: 28, opacity: op, justifyContent: 'center', transform: `translateY(${slide}px)` }}>
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
