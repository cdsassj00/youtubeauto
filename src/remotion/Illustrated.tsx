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
import { captionChunks } from './components/beats.js';
import { IsoDiagram, IsoComparison } from './components/iso.js';

/**
 * 일러스트 영상: 씬마다 흑백 라인아트 이미지를 흰 배경에 꽉 채워 보여주고(줌인/줌아웃),
 * 하단에 짧은 구절 단위 볼드 한글 자막을 얹는다. 나레이션 + 배경음악 포함.
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

  // 켄번즈 강화: 씬마다 줌인/줌아웃 번갈아 + 대각선 패닝 + 미세 드리프트(정체감 제거).
  const zoomIn = index % 2 === 0;
  const zoom = zoomIn
    ? interpolate(frame, [0, dur], [1.02, 1.18], { extrapolateRight: 'clamp' })
    : interpolate(frame, [0, dur], [1.18, 1.02], { extrapolateRight: 'clamp' });
  const dir = index % 2 === 0 ? 1 : -1;
  const panX = dir * interpolate(frame, [0, dur], [-34, 34], { extrapolateRight: 'clamp' }) + Math.sin(frame / 90) * 6;
  const panY = dir * interpolate(frame, [0, dur], [18, -18], { extrapolateRight: 'clamp' }) + Math.cos(frame / 110) * 5;
  // 씬 시작/끝 흰색 페이드(부드러운 전환).
  const fade = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // diagram/comparison 씬은 AI 그림 대신 등각(isometric) 코드 애니메이션으로 그린다 —
  // 구조화된 노드/엣지·좌우비교 데이터를 실제 모션 그래픽으로 보여줘서 AI 그림보다 깔끔하고
  // 나레이션 타이밍에 정확히 맞물린다.
  if (scene.visual === 'diagram' && scene.diagram && scene.diagram.nodes.length > 0) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <AbsoluteFill style={{ transform: `scale(${1 + (zoom - 1) * 0.35}) translate(${panX * 0.3}px, ${panY * 0.3}px)`, transformOrigin: 'center center' }}>
          <IsoDiagram diagram={scene.diagram} narration={scene.narration} durationInFrames={dur} />
        </AbsoluteFill>
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }
  if (scene.visual === 'comparison' && scene.comparison) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <AbsoluteFill style={{ transform: `scale(${1 + (zoom - 1) * 0.35}) translate(${panX * 0.3}px, ${panY * 0.3}px)`, transformOrigin: 'center center' }}>
          <IsoComparison comparison={scene.comparison} narration={scene.narration} durationInFrames={dur} />
        </AbsoluteFill>
        <WordCaption narration={scene.narration} durationInFrames={dur} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {scene.imagePath ? (
        <AbsoluteFill style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: 'center center' }}>
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

/** 하단 중앙 짧은 자막(구절 단위) — 흰 배경/그림 위에서도 잘 보이게 어두운 알약 + 흰 글씨. */
const WordCaption: React.FC<{ narration: string; durationInFrames: number }> = ({ narration, durationInFrames }) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 16);
  if (chunks.length === 0) return null;
  const cur = chunks.find((b) => frame >= b.start && frame < b.end) ?? chunks[chunks.length - 1];

  const words = cur.text.split(/(\s+)/); // 공백 유지
  const span = Math.max(1, cur.end - cur.start);
  const prog = Math.max(0, Math.min(1, (frame - cur.start) / span));
  const totalLen = cur.text.length || 1;
  let acc = 0;

  // 조각이 바뀔 때마다 살짝 통통 등장.
  const pop = interpolate(frame - cur.start, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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
          background: 'rgba(15,15,18,0.72)',
          borderRadius: 16,
          padding: '10px 26px',
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
            <span key={i} style={{ color: spoken ? '#ffffff' : '#ffffff70' }}>
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
