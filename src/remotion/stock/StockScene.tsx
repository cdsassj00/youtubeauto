/**
 * 주식 데일리 전용 화면.
 *
 * ★왜 따로 만들었나★ 기존 엔진(listing·scrapbook)은 사진을 깔도록 만들어진 것이라,
 * 사진을 안 주면 제목만 띄우고 내용을 전부 자막에 떠넘긴다. 실제로 첫 영상이 그랬다 —
 * "어제 추천, 오늘 결과" 화면에 종목이 한 줄도 없었다. 숫자를 다루는 채널에서 숫자가
 * 화면에 없으면 영상일 이유가 없다. 그래서 값을 화면에 직접 그리는 컴포넌트를 만든다.
 *
 * ★움직임은 값이 만든다★ 장식으로 흔드는 게 아니라, 행이 하나씩 들어오고 막대가 값만큼
 * 자라는 식으로 숫자 자체가 움직이게 한다.
 */
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SceneWithAudio } from '../../schema.js';

const BG = '#070d1a';
const BG2 = '#0c1730';
const UP = '#e8564a';
const DOWN = '#5b8ae0';
const GOLD = '#d9a441';
const WHITE = '#f2f6ff';
const DIM = '#8fa0c0';
const FONT = "'Pretendard','Noto Sans CJK KR','Malgun Gothic',sans-serif";

const Shell: React.FC<{ heading: string; children: React.ReactNode }> = ({ heading, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.5) });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${BG} 0%, ${BG2} 55%, ${BG} 100%)`, fontFamily: FONT }}>
      <div style={{ position: 'absolute', top: 64, left: 96, right: 96 }}>
        <div style={{ color: GOLD, fontSize: 26, letterSpacing: 8, opacity: 0.9 }}>STOCKONTOLOGY</div>
        <div
          style={{
            color: WHITE,
            fontSize: 68,
            fontWeight: 800,
            marginTop: 10,
            opacity: enter,
            transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
          }}
        >
          {heading}
        </div>
      </div>
      {children}
    </AbsoluteFill>
  );
};

/** 어제 추천 채점 — 종목마다 한 줄, 등락률 막대가 값만큼 자란다. */
const PrevTable: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = scene.stock?.rows ?? [];
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pct)));

  return (
    <Shell heading={scene.heading}>
      {scene.stock?.big ? (
        <div style={{ position: 'absolute', top: 72, right: 96, textAlign: 'right' }}>
          <div style={{ color: UP, fontSize: 92, fontWeight: 800, lineHeight: 1 }}>{scene.stock.big}</div>
          <div style={{ color: DIM, fontSize: 26, marginTop: 8 }}>{scene.stock.caption}</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 258, left: 96, right: 96 }}>
        {rows.map((r, i) => {
          // ★한 줄씩 들어온다★ 다섯 줄이 한꺼번에 뜨면 어디를 보라는 것인지 알 수 없다.
          const at = Math.round(fps * (0.35 + i * 0.45));
          const in_ = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.5) });
          const grow = spring({ frame: frame - at - Math.round(fps * 0.2), fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.7) });
          const up = r.pct >= 0;
          const w = (Math.abs(r.pct) / maxAbs) * 380 * grow;
          return (
            <div
              key={r.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                height: 128,
                opacity: in_,
                transform: `translateX(${interpolate(in_, [0, 1], [-40, 0])}px)`,
                borderBottom: '1px solid rgba(143,160,192,0.18)',
              }}
            >
              <div style={{ width: 300, color: WHITE, fontSize: 42, fontWeight: 700 }}>{r.name}</div>
              <div style={{ width: 420, color: DIM, fontSize: 32 }}>
                {r.from} <span style={{ color: DIM }}>→</span> <span style={{ color: WHITE }}>{r.to}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ width: w, height: 18, borderRadius: 9, background: up ? UP : DOWN }} />
                <div style={{ color: up ? UP : DOWN, fontSize: 40, fontWeight: 800 }}>
                  {up ? '+' : ''}
                  {r.pct.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

/** 섹터 로테이션 — 유지/진입/이탈을 칩으로 나눠 보여준다. */
const Rotation: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groups = scene.stock?.groups ?? [];
  const color = { keep: GOLD, in: UP, out: DOWN } as const;
  let n = 0;
  return (
    <Shell heading={scene.heading}>
      {scene.stock?.big ? (
        <div style={{ position: 'absolute', top: 72, right: 96, textAlign: 'right' }}>
          <div style={{ color: GOLD, fontSize: 92, fontWeight: 800, lineHeight: 1 }}>{scene.stock.big}</div>
          <div style={{ color: DIM, fontSize: 26, marginTop: 8 }}>{scene.stock.caption}</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 300, left: 96, right: 96 }}>
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 78 }}>
            <div style={{ color: color[g.tone], fontSize: 30, fontWeight: 700, marginBottom: 18 }}>{g.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              {g.items.map((it) => {
                const at = Math.round(fps * (0.4 + n++ * 0.25));
                const in_ = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.45) });
                return (
                  <div
                    key={it}
                    style={{
                      padding: '16px 34px',
                      borderRadius: 14,
                      border: `2px solid ${color[g.tone]}`,
                      color: WHITE,
                      fontSize: 40,
                      fontWeight: 700,
                      opacity: in_,
                      transform: `scale(${interpolate(in_, [0, 1], [0.85, 1])})`,
                    }}
                  >
                    {it}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
};


/**
 * 거시 → 섹터 → 종목 전파.
 *
 * ★이 채널의 유일한 도식이다★ 사이트가 준 그림을 한 장 깔아 두면 화면이 멈춘 것처럼
 * 보인다. 신호가 왼쪽에서 오른쪽으로 흘러가는 것이 이 전략의 설명 전부이므로, 그 흐름을
 * 화면에서 실제로 움직이게 한다 — 열이 하나씩 서고, 선을 따라 빛이 지나간다.
 */
const Flow: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = (scene.stock?.groups ?? []).slice(0, 3);
  const colX = [180, 830, 1480];
  const colW = 420;
  const tone = { keep: GOLD, in: UP, out: DOWN } as const;

  // ★열 이름이 상자 뒤에 깔렸었다★ 라벨을 296 에 두고 첫 상자가 248 에서 시작하니 겹쳤다.
  // 라벨 자리를 먼저 잡고 상자는 그 아래에서 시작하게 한다.
  const LABEL_Y = 300;
  const gap = 150;
  const nodeY = (_ci: number, i: number, n: number) => {
    const center = 640; // 화면 세로 가운데보다 조금 아래 — 위쪽 제목과 균형이 맞는다
    const top = center - ((n - 1) * gap) / 2;
    return top + i * gap;
  };

  return (
    <Shell heading={scene.heading}>
      {scene.stock?.big ? (
        <div style={{ position: 'absolute', top: 72, right: 96, textAlign: 'right', zIndex: 2 }}>
          <div style={{ color: UP, fontSize: 92, fontWeight: 800, lineHeight: 1 }}>{scene.stock.big}</div>
          <div style={{ color: DIM, fontSize: 26, marginTop: 8 }}>{scene.stock.caption}</div>
        </div>
      ) : null}
      <AbsoluteFill>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {cols.slice(0, 2).map((g, ci) =>
            g.items.flatMap((_, i) =>
              (cols[ci + 1]?.items ?? []).map((_, j) => {
                const at = Math.round(fps * (1.1 + ci * 0.9));
                const p = interpolate(frame - at, [0, fps * 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                const x1 = colX[ci] + colW;
                const y1 = nodeY(ci, i, g.items.length) + 34;
                const x2 = colX[ci + 1];
                const y2 = nodeY(ci + 1, j, cols[ci + 1].items.length) + 34;
                const mx = (x1 + x2) / 2;
                const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
                return (
                  <g key={`${ci}-${i}-${j}`}>
                    <path d={d} stroke="rgba(232,86,74,0.30)" strokeWidth={2} fill="none" />
                    {/* 선을 따라 지나가는 빛 — 신호가 "흐른다"를 눈에 보이게 한다 */}
                    <path
                      d={d}
                      stroke={UP}
                      strokeWidth={4}
                      fill="none"
                      strokeDasharray="120 2000"
                      strokeDashoffset={2120 - p * 2120}
                      opacity={p > 0 && p < 1 ? 0.95 : 0}
                    />
                  </g>
                );
              }),
            ),
          )}
        </svg>
        {cols.map((g, ci) => (
          <div key={g.label}>
            <div style={{ position: 'absolute', left: colX[ci], top: LABEL_Y, width: colW, textAlign: 'center', color: DIM, fontSize: 30, letterSpacing: 4 }}>{g.label}</div>
            {g.items.map((it, i) => {
              const at = Math.round(fps * (0.4 + ci * 0.9 + i * 0.12));
              const in_ = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.5) });
              return (
                <div
                  key={it}
                  style={{
                    position: 'absolute',
                    left: colX[ci],
                    top: nodeY(ci, i, g.items.length),
                    width: colW,
                    height: 68,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 14,
                    border: `2px solid ${tone[g.tone]}`,
                    background: 'rgba(12,23,48,0.85)',
                    color: WHITE,
                    fontSize: 34,
                    fontWeight: 700,
                    opacity: in_,
                    transform: `translateX(${interpolate(in_, [0, 1], [-24, 0])}px)`,
                  }}
                >
                  {it}
                </div>
              );
            })}
          </div>
        ))}
      </AbsoluteFill>
    </Shell>
  );
};

/** 합성 점수 분해 — 세 축이 각자 얼마를 보탰는지 막대로. */
const ScoreBars: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = scene.stock?.rows ?? [];
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.pct)));
  return (
    <Shell heading={scene.heading}>
      {scene.stock?.big ? (
        <div style={{ position: 'absolute', top: 72, right: 96, textAlign: 'right' }}>
          <div style={{ color: UP, fontSize: 92, fontWeight: 800, lineHeight: 1 }}>{scene.stock.big}</div>
          <div style={{ color: DIM, fontSize: 26, marginTop: 8 }}>{scene.stock.caption}</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 320, left: 96, right: 96 }}>
        {rows.map((r, i) => {
          const at = Math.round(fps * (0.5 + i * 0.6));
          const grow = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.8) });
          const up = r.pct >= 0;
          return (
            <div key={r.name} style={{ marginBottom: 96, opacity: grow > 0 ? 1 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 14 }}>
                <div style={{ color: WHITE, fontSize: 44, fontWeight: 700, width: 260 }}>{r.name}</div>
                <div style={{ color: DIM, fontSize: 30 }}>{r.from}</div>
                <div style={{ color: up ? UP : DOWN, fontSize: 44, fontWeight: 800, marginLeft: 'auto' }}>
                  {up ? '+' : ''}
                  {r.pct.toFixed(3)}
                </div>
              </div>
              <div style={{ height: 22, borderRadius: 11, background: 'rgba(143,160,192,0.15)' }}>
                <div style={{ width: `${(Math.abs(r.pct) / maxAbs) * 100 * grow}%`, height: 22, borderRadius: 11, background: up ? UP : DOWN }} />
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};


/** 엔진 비교 — 네(또는 세) 장의 카드가 순서대로 선다. */
const Cards: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = scene.stock?.cards ?? [];
  const w = Math.floor((1920 - 192 - (cards.length - 1) * 28) / Math.max(1, cards.length));
  return (
    <Shell heading={scene.heading}>
      <div style={{ position: 'absolute', top: 300, left: 96, right: 96, display: 'flex', gap: 28 }}>
        {cards.map((c, i) => {
          const at = Math.round(fps * (0.4 + i * 0.5));
          const in_ = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.5) });
          const neg = c.value.trim().startsWith('-');
          return (
            <div
              key={c.title}
              style={{
                width: w,
                padding: '34px 30px',
                borderRadius: 20,
                border: `2px solid ${c.highlight ? GOLD : 'rgba(143,160,192,0.28)'}`,
                background: 'rgba(12,23,48,0.7)',
                opacity: in_,
                transform: `translateY(${interpolate(in_, [0, 1], [26, 0])}px)`,
              }}
            >
              <div style={{ color: WHITE, fontSize: 40, fontWeight: 800 }}>{c.title}</div>
              <div style={{ color: DIM, fontSize: 24, marginTop: 10, minHeight: 66, lineHeight: 1.35 }}>{c.sub}</div>
              {c.value ? <div style={{ color: neg ? DOWN : UP, fontSize: 60, fontWeight: 800, margin: '18px 0 8px' }}>{c.value}</div> : null}
              {c.items.map((it) => (
                <div key={it} style={{ color: WHITE, fontSize: 28, marginTop: 12, opacity: 0.92 }}>
                  · {it}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Shell>
  );
};


/** 오늘 작동한 인과 — "A 가 움직여서 B 가 됐다" 를 한 줄씩. */
const Chains: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = scene.stock?.rows ?? [];
  return (
    <Shell heading={scene.heading}>
      <div style={{ position: 'absolute', top: 280, left: 96, right: 96 }}>
        {rows.map((r, i) => {
          const at = Math.round(fps * (0.4 + i * 0.9));
          const in_ = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.5) });
          const arrow = interpolate(frame - at - fps * 0.25, [0, fps * 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={r.name + i} style={{ marginBottom: 44, opacity: in_, transform: `translateY(${interpolate(in_, [0, 1], [20, 0])}px)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ padding: '14px 28px', borderRadius: 12, border: `2px solid ${GOLD}`, color: WHITE, fontSize: 38, fontWeight: 700 }}>{r.name}</div>
                {/* 화살표가 자라면서 오른쪽 상자를 밀어낸다 — 인과의 방향이 눈에 보인다 */}
                <div style={{ width: 120 * arrow, height: 4, background: UP, borderRadius: 2 }} />
                <div style={{ padding: '14px 28px', borderRadius: 12, border: `2px solid ${UP}`, color: WHITE, fontSize: 38, fontWeight: 700, opacity: arrow }}>{r.to}</div>
              </div>
              {r.note ? <div style={{ color: DIM, fontSize: 27, marginTop: 12, marginLeft: 6 }}>{r.note}</div> : null}
            </div>
          );
        })}
      </div>
    </Shell>
  );
};


/** 표지·클로징 — 큰 한 덩어리와 아래 안내. */
const Headline: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const in_ = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  const lines = scene.stock?.rows ?? [];
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${BG} 0%, ${BG2} 55%, ${BG} 100%)`,
        fontFamily: FONT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ color: GOLD, fontSize: 30, letterSpacing: 10, marginBottom: 26, opacity: in_ }}>STOCKONTOLOGY</div>
      {scene.stock?.big ? (
        <div style={{ color: UP, fontSize: 200, fontWeight: 800, lineHeight: 1, opacity: in_, transform: `scale(${interpolate(in_, [0, 1], [0.9, 1])})` }}>
          {scene.stock.big}
        </div>
      ) : null}
      <div style={{ color: WHITE, fontSize: 68, fontWeight: 800, marginTop: 22, opacity: in_, textAlign: 'center' }}>{scene.heading}</div>
      {scene.stock?.caption ? <div style={{ color: DIM, fontSize: 34, marginTop: 18, opacity: in_ }}>{scene.stock.caption}</div> : null}
      <div style={{ marginTop: 54 }}>
        {lines.map((r, i) => {
          const at = Math.round(fps * (0.7 + i * 0.4));
          const a = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.4) });
          return (
            <div key={r.name} style={{ color: r.note === 'dim' ? DIM : WHITE, fontSize: r.note === 'dim' ? 26 : 34, marginTop: 14, opacity: a, textAlign: 'center' }}>
              {r.name}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const StockScene: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const kind = scene.stock?.kind;
  if (kind === 'rotation') return <Rotation scene={scene} />;
  if (kind === 'flow') return <Flow scene={scene} />;
  if (kind === 'scoreBars') return <ScoreBars scene={scene} />;
  if (kind === 'cards') return <Cards scene={scene} />;
  if (kind === 'chains') return <Chains scene={scene} />;
  if (kind === 'headline') return <Headline scene={scene} />;
  return <PrevTable scene={scene} />;
};
