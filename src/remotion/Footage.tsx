import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import type { RenderManifest } from '../schema.js';
import { PRETENDARD } from './pretendard.js';
import { captionChunks } from './components/beats.js';

/**
 * 실사 푸티지 엔진.
 *
 * 다른 엔진과 근본적으로 다른 점: AI 그림도, 코드로 그린 도식도 쓰지 않는다.
 * 무료 스톡(Pexels · Pixabay · Unsplash)에서 가져온 실사 영상·사진이 화면을 꽉 채우고,
 * 그 위에 자막만 얹힌다. 이미지 생성 비용이 0 이다.
 *
 * ★대신 유튜브 "재사용 콘텐츠" 위험을 안는다★
 * 다른 엔진들이 스톡을 45% 상한으로 묶어 둔 것은 그 판정을 피하기 위해서였다.
 * 이 엔진에는 그 안전장치가 없다. 나레이션과 대본은 원본이지만 화면은 전부 남의 소재다.
 * 수익화를 노리는 채널이라면 이 엔진만으로 채우지 않는 편이 안전하다.
 *
 * 화면 구성이 단순한 만큼 "지루해지지 않게" 하는 장치가 중요하다:
 *   - 한 씬이 길면 소재를 두세 번 갈아 끼운다(씬 하나 = 컷 하나가 아니다)
 *   - 사진은 반드시 켄번즈로 움직인다. 정지 사진이 8초 떠 있으면 그대로 멈춘 영상이다
 *   - 컷 전환은 커튼 와이프. 페이드는 편집한 컷이 아니라 사고처럼 보인다
 */
export const Footage: React.FC<RenderManifest> = (manifest) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {manifest.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={scene.heading}
        >
          <FootageScene scene={scene} index={i} />
          <Caption narration={scene.narration} durationInFrames={scene.durationInFrames} />
          {scene.audioPath && <Audio src={staticFile(scene.audioPath)} />}
        </Sequence>
      ))}
      {manifest.bgm && <BackgroundMusic src={manifest.bgm} total={manifest.totalDurationInFrames} />}
    </AbsoluteFill>
  );
};

const FootageScene: React.FC<{ scene: RenderManifest['scenes'][number]; index: number }> = ({
  scene,
  index,
}) => {
  // 이 엔진에서는 broll 배열이 "이 씬을 채우는 컷들"이다(다른 엔진처럼 위에 얹는 인서트가 아니다).
  const cuts = scene.broll || [];
  if (!cuts.length) {
    // 소재를 하나도 못 구한 씬 — 검은 화면 대신 제목이라도 띄운다.
    return <HeadingCard heading={scene.heading} />;
  }
  return (
    <AbsoluteFill>
      {cuts.map((c, ci) => (
        <Sequence key={`${scene.id}-c${ci}`} from={c.fromFrame} durationInFrames={c.durationInFrames}>
          <Shot
            src={c.path}
            kind={c.kind}
            durationInFrames={c.durationInFrames}
            seed={index * 5 + ci}
            first={ci === 0}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/**
 * 컷 하나 — 화면을 꽉 채운다.
 *
 * 첫 컷은 와이프 없이 바로 들어간다. 씬 경계에서 이미 화면이 바뀌는데 거기에 와이프까지
 * 겹치면 전환이 두 번 일어난 것처럼 보인다. 씬 안에서 소재가 갈릴 때만 와이프를 건다.
 */
const Shot: React.FC<{
  src: string;
  kind: 'video' | 'photo';
  durationInFrames: number;
  seed: number;
  first: boolean;
}> = ({ src, kind, durationInFrames, seed, first }) => {
  const frame = useCurrentFrame();

  const WIPE = 10;
  const wipe = interpolate(frame, [0, WIPE], [100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fromRight = seed % 2 === 0;
  const clipPath = first
    ? undefined
    : fromRight
      ? `inset(0 0 0 ${wipe}%)`
      : `inset(0 ${wipe}% 0 0)`;

  // 사진은 반드시 움직인다. 영상도 아주 약하게 밀어 주면 스톡 특유의 "제자리 루프"가 덜 보인다.
  const zoomIn = seed % 2 === 0;
  const dir = seed % 4;
  const dx = [-2.2, 2.2, -1.5, 1.5][dir];
  const dy = [1.3, -1.3, -1.8, 1.8][dir];
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const amp = kind === 'photo' ? 0.14 : 0.06;
  const zoom = zoomIn ? 1.02 + amp * p : 1.02 + amp - amp * p;

  const media = { width: '100%', height: '100%', objectFit: 'cover' } as const;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', clipPath }}>
      <AbsoluteFill
        style={{
          transform: `scale(${zoom}) translate(${dx * p}%, ${dy * p}%)`,
          transformOrigin: 'center center',
        }}
      >
        {kind === 'photo' ? (
          <Img src={staticFile(src)} style={media} />
        ) : (
          <OffthreadVideo src={staticFile(src)} muted style={media} />
        )}
      </AbsoluteFill>
      {/* 비네트 — 소스마다 노출·톤이 제각각인데 이걸 깔면 한 영상처럼 붙고 자막도 읽힌다 */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(0,0,0,.42) 0%, transparent 24%, transparent 48%, rgba(0,0,0,.80) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

/** 소재를 못 구한 씬의 대타 — 검은 화면보다는 제목이 낫다. */
const HeadingCard: React.FC<{ heading: string }> = ({ heading }) => (
  <AbsoluteFill
    style={{
      backgroundColor: '#101216',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 140px',
    }}
  >
    <div
      style={{
        fontFamily: PRETENDARD,
        fontWeight: 800,
        fontSize: 84,
        lineHeight: 1.2,
        color: '#f2f4f8',
        textAlign: 'center',
      }}
    >
      {heading}
    </div>
  </AbsoluteFill>
);

/** 하단 자막 — 화면이 실사라 대비를 확실히 줘야 읽힌다. */
const Caption: React.FC<{ narration: string; durationInFrames: number }> = ({
  narration,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 16);
  if (!chunks.length) return null;
  const cur = chunks.find((b) => frame >= b.start && frame < b.end) ?? chunks[chunks.length - 1];
  const pop = interpolate(frame - cur.start, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 72,
        left: 80,
        right: 80,
        textAlign: 'center',
        transform: `translateY(${(1 - pop) * 14}px)`,
        opacity: pop,
      }}
    >
      <span
        style={{
          fontFamily: PRETENDARD,
          fontSize: 60,
          fontWeight: 800,
          lineHeight: 1.25,
          color: '#fff',
          background: 'rgba(12,12,15,0.78)',
          borderRadius: 16,
          padding: '10px 26px',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {cur.text}
      </span>
    </div>
  );
};

const BackgroundMusic: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [total - 48, total], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile(src)} volume={0.09 * fade} loop />;
};
