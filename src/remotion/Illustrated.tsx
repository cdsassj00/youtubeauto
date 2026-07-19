import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import type { RenderManifest } from '../schema.js';
import { theme } from './theme.js';
import { PRETENDARD } from './pretendard.js';
import { sentenceBounds } from './components/beats.js';

/**
 * 일러스트 영상: 씬마다 흑백 라인아트 이미지를 흰 배경에 꽉 채워 보여주고(줌/페이드),
 * 상단에 단어별로 강조되는 볼드 한글 자막을 얹는다. 나레이션 + 배경음악 포함.
 */
export const AiIllustrated: React.FC<RenderManifest> = (manifest) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#ffffff' }}>
      {manifest.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={scene.heading}>
          <SceneShot scene={scene} index={i} />
          <Audio src={staticFile(scene.audioPath)} />
        </Sequence>
      ))}
      {manifest.bgm && <BackgroundMusic src={manifest.bgm} total={manifest.totalDurationInFrames} />}
    </AbsoluteFill>
  );
};

const SceneShot: React.FC<{ scene: RenderManifest['scenes'][number]; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const dur = scene.durationInFrames;

  // 켄번즈: 씬 내내 천천히 확대 + 좌우 번갈아 미세 패닝.
  const zoom = interpolate(frame, [0, dur], [1.03, 1.12], { extrapolateRight: 'clamp' });
  const panX = (index % 2 === 0 ? 1 : -1) * interpolate(frame, [0, dur], [0, 26], { extrapolateRight: 'clamp' });
  // 씬 시작/끝 흰색 페이드(부드러운 전환).
  const fade = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {scene.imagePath ? (
        <AbsoluteFill style={{ transform: `scale(${zoom}) translateX(${panX}px)`, transformOrigin: 'center center' }}>
          <Img src={staticFile(scene.imagePath)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        // 이미지 없을 때 폴백: 흰 배경 + 큰 제목.
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ fontFamily: PRETENDARD, fontWeight: 800, fontSize: 96, color: theme.ink, textAlign: 'center', maxWidth: 1500 }}>
            {scene.heading}
          </h1>
        </AbsoluteFill>
      )}
      <WordCaption narration={scene.narration} durationInFrames={dur} />
    </AbsoluteFill>
  );
};

/** 상단 중앙 볼드 한글 자막 — 현재 읽는 부분은 검정, 지난·다음은 회색으로 강조 이동. */
const WordCaption: React.FC<{ narration: string; durationInFrames: number }> = ({ narration, durationInFrames }) => {
  const frame = useCurrentFrame();
  const bounds = sentenceBounds(narration, durationInFrames);
  if (bounds.length === 0) return null;
  const cur = bounds.find((b) => frame >= b.start && frame < b.end) ?? bounds[bounds.length - 1];

  // 현재 문장을 단어로 나누고, 경과 비율만큼 검정으로 채운다(가라오케식).
  const words = cur.text.split(/(\s+)/); // 공백 유지
  const span = Math.max(1, cur.end - cur.start);
  const prog = Math.max(0, Math.min(1, (frame - cur.start) / span));
  const totalLen = cur.text.length || 1;
  let acc = 0;

  // 문장 등장 팝.
  const pop = interpolate(frame - cur.start, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 80,
        right: 80,
        textAlign: 'center',
        transform: `translateY(${(1 - pop) * -12}px)`,
        opacity: pop,
      }}
    >
      <span
        style={{
          fontFamily: PRETENDARD,
          fontSize: 58,
          fontWeight: 800,
          lineHeight: 1.3,
          background: '#ffffffcc',
          borderRadius: 14,
          padding: '6px 18px',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {words.map((w, i) => {
          if (/^\s+$/.test(w)) return w;
          const before = acc / totalLen;
          acc += w.length;
          const spoken = prog >= before;
          return (
            <span key={i} style={{ color: spoken ? '#111111' : '#b0b4bb', transition: 'none' }}>
              {w}
            </span>
          );
        })}
      </span>
    </div>
  );
};

const BackgroundMusic: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const { fps } = useVideoConfig();
  const fadeIn = Math.round(fps * 1.5);
  const fadeOut = Math.round(fps * 2.5);
  const base = 0.14;
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(f) =>
        interpolate(f, [0, fadeIn, Math.max(fadeIn + 1, total - fadeOut), total], [0, base, base, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};
