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
      <div style={{ position: 'absolute', top: 250, left: 96, right: 96 }}>
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
                height: 104,
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
      <div style={{ position: 'absolute', top: 260, left: 96, right: 96 }}>
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 54 }}>
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

export const StockScene: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const kind = scene.stock?.kind;
  if (kind === 'rotation') return <Rotation scene={scene} />;
  return <PrevTable scene={scene} />;
};
