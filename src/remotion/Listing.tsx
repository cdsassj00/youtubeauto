import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RenderManifest, SceneWithAudio } from '../schema.js';
import { captionChunks } from './components/beats.js';
import { SceneSfx } from './components/Sfx.js';

/**
 * 목록형 소개 영상 — 한 항목 = 한 화면.
 *
 * ★이 컴포지션의 원칙★
 * 사진이 주인공이다. 자료가 준 사진을 화면에 꽉 채우고, 그 위에 이름 카드만 얹는다.
 * 스톡 영상도 AI 그림도 쓰지 않는다 — 목록 영상에서 화면에 나와야 하는 것은
 * "그 항목" 자체이지 비슷한 분위기의 남의 사진이 아니다.
 *
 * 카드에 들어가는 글자는 전부 자료에서 온 값이다(heading=이름, bullets=접근·특징,
 * sourceNote=지역). 모델이 지어낸 문장은 나레이션과 자막에만 있다.
 */
export const Listing: React.FC<RenderManifest> = (manifest) => {
  // 번호는 사진이 있는 항목에만 붙인다(도입·마무리 화면 제외).
  let itemNo = 0;
  const numbers = manifest.scenes.map((s) => (s.imagePath ? ++itemNo : 0));
  const total = itemNo;

  return (
    <AbsoluteFill style={{ backgroundColor: '#08090B' }}>
      {manifest.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={scene.heading}
        >
          {scene.imagePath ? (
            <ItemCard scene={scene} no={numbers[i]} total={total} />
          ) : (
            <BookendCard scene={scene} />
          )}
          <Caption
            narration={scene.narration}
            durationInFrames={scene.durationInFrames}
            speechFrames={Math.round(scene.durationSec * manifest.fps)}
          />
          {scene.audioPath && <Audio src={staticFile(scene.audioPath)} />}
          <SceneSfx scene={scene} enabled={manifest.sfx} />
        </Sequence>
      ))}
      {manifest.bgm && <Bgm src={manifest.bgm} total={manifest.totalDurationInFrames} />}
    </AbsoluteFill>
  );
};

/** 항목 한 개 — 사진 전면 + 좌하단 이름 카드 + 우상단 번호. */
const ItemCard: React.FC<{ scene: SceneWithAudio; no: number; total: number }> = ({ scene, no, total }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // 켄번즈 — 정지 사진이 그대로 멈춰 있으면 슬라이드쇼처럼 보인다. 아주 천천히 밀어준다.
  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.14], { extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, durationInFrames], [-8, 8], { extrapolateRight: 'clamp' });
  // 카드는 살짝 늦게 올라온다 — 사진을 먼저 보게 한다.
  const cardIn = interpolate(frame, [Math.round(fps * 0.25), Math.round(fps * 0.75)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile(scene.imagePath!)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translateX(${drift}px)`,
          }}
        />
      </AbsoluteFill>

      {/* 사진 위에 글자를 얹으려면 아래쪽을 눌러줘야 읽힌다. */}
      <AbsoluteFill
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,.92) 0%, rgba(0,0,0,.55) 26%, transparent 52%)' }}
      />

      {/* 번호 — 지금 몇 번째인지 알려준다. 목록 영상에서 이게 없으면 길을 잃는다. */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          right: 64,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          fontFamily: 'Pretendard, sans-serif',
          textShadow: '0 4px 20px rgba(0,0,0,.9)',
        }}
      >
        <span style={{ fontSize: 92, fontWeight: 900, color: '#FFD43B', letterSpacing: '-.04em' }}>
          {String(no).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 34, fontWeight: 700, color: 'rgba(255,255,255,.62)' }}>/ {total}</span>
      </div>

      {/* 이름 카드 — 자막(하단 중앙)과 겹치지 않게 화면 중단보다 살짝 아래, 왼쪽에 둔다. */}
      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 300,
          maxWidth: 1180,
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 26}px)`,
          fontFamily: 'Pretendard, sans-serif',
        }}
      >
        {scene.sourceNote && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '.06em',
              color: '#08090B',
              background: '#FFD43B',
              padding: '6px 16px',
              borderRadius: 6,
              marginBottom: 18,
            }}
          >
            {scene.sourceNote}
          </div>
        )}
        <div
          style={{
            fontSize: 84,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-.035em',
            lineHeight: 1.12,
            wordBreak: 'keep-all',
            textShadow: '0 6px 28px rgba(0,0,0,.95)',
          }}
        >
          {scene.heading}
        </div>
        {scene.bullets.map((b, i) => (
          <div
            key={i}
            style={{
              marginTop: i === 0 ? 20 : 8,
              fontSize: 36,
              fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? '#8FB8FF' : 'rgba(255,255,255,.86)',
              wordBreak: 'keep-all',
              textShadow: '0 3px 16px rgba(0,0,0,.9)',
            }}
          >
            {b}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** 도입·마무리 화면 — 사진이 없으므로 글자만 크게. */
const BookendCard: React.FC<{ scene: SceneWithAudio }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inK = interpolate(frame, [0, Math.round(fps * 0.6)], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(120% 90% at 30% 20%, #16202C 0%, #08090B 70%)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 140px',
      }}
    >
      <div
        style={{
          opacity: inK,
          transform: `translateY(${(1 - inK) * 22}px)`,
          fontFamily: 'Pretendard, sans-serif',
          fontSize: 96,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '-.035em',
          textAlign: 'center',
          lineHeight: 1.16,
          wordBreak: 'keep-all',
        }}
      >
        {scene.heading}
      </div>
      {scene.sourceNote && (
        <div style={{ marginTop: 28, fontSize: 26, color: 'rgba(255,255,255,.5)', fontFamily: 'Pretendard, sans-serif' }}>
          {scene.sourceNote}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** 자막 — 다른 엔진과 같은 분절 규칙(beats.ts)을 쓴다. */
const Caption: React.FC<{ narration: string; durationInFrames: number; speechFrames: number }> = ({
  narration,
  durationInFrames,
  speechFrames,
}) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 16, speechFrames);
  const cur = chunks.find((c) => frame >= c.start && frame < c.end) ?? chunks[chunks.length - 1];
  if (!cur) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 120,
        textAlign: 'center',
        fontFamily: 'Pretendard, sans-serif',
        fontSize: 52,
        fontWeight: 700,
        color: '#fff',
        lineHeight: 1.35,
        wordBreak: 'keep-all',
        textShadow: '0 4px 18px rgba(0,0,0,.95)',
      }}
    >
      {cur.text}
    </div>
  );
};

const Bgm: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(frame, [0, fps * 2, total - fps * 3, total], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile(src)} volume={0.09 * fade} loop />;
};
