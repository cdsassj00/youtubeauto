import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import type { RenderManifest } from '../schema.js';
import { PRETENDARD } from './pretendard.js';
import { captionChunks } from './components/beats.js';
import {
  PaperBackground,
  Typewriter,
  ScrapPiece,
  ProjectorFlash,
  FilmGrain,
  paperInk,
  PAPER_KINDS,
  type PaperKind,
} from './components/scrapbook.js';

/**
 * VOX(스크랩북) 엔진.
 *
 * 기존 illustrated 엔진과 무엇이 다른가:
 *   - 배경이 흰색/검정이 아니라 "종이"다
 *   - 큰 글자가 장식이 아니라 화면 그 자체다(타자기로 찍힌다)
 *   - 그림은 컷아웃 스크랩으로 종이 위에 하나씩 붙는다
 *   - 씬 전환이 페이드가 아니라 영사기 화이트 플래시다
 *
 * "한 화면이 15~20초씩 정지해 프리젠테이션 같다"는 문제를 구조로 푼다.
 * 이 엔진은 씬 안에서 계속 뭔가가 일어난다 — 글자가 찍히고, 스크랩이 하나씩 붙는다.
 */
export const Scrapbook: React.FC<RenderManifest> = (manifest) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#e9e6dc' }}>
      {manifest.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={scene.heading}
        >
          <ScrapScene scene={scene} index={i} fps={manifest.fps} />
        </Sequence>
      ))}
      {manifest.bgm && <BackgroundMusic src={manifest.bgm} total={manifest.totalDurationInFrames} />}
    </AbsoluteFill>
  );
};

const ScrapScene: React.FC<{
  scene: RenderManifest['scenes'][number];
  index: number;
  fps: number;
}> = ({ scene, index, fps }) => {
  const dur = scene.durationInFrames;
  // 종이 종류는 씬마다 돌아가며 바뀐다 — 같은 종이가 이어지면 다시 정적으로 보인다.
  const paper: PaperKind = PAPER_KINDS[index % PAPER_KINDS.length];
  const ink = paperInk(paper);

  // 이 씬에서 큰 글자로 찍을 문장. heading 이 짧고 선언적이라 타자기에 맞는다.
  const headline = (scene.heading || '').trim();

  // 스크랩 배치 — 씬마다 자리를 바꿔 "늘 같은 구도"를 피한다.
  // 한 화면에 하나만 크게 두는 것이 이 스타일의 규칙이다(참고 영상도 대부분 1~2개).
  // 폭과 높이를 함께 준다. 컷아웃은 세로로 긴 것도 가로로 넓은 것도 나오는데, 폭만 주면
  // 세로로 긴 조각이 화면 밖으로 흘러넘친다(테스트 렌더에서 실제로 그렇게 나왔다).
  // 위쪽은 큰 글자, 아래쪽은 자막이 쓰므로 세로는 화면의 절반 남짓까지만 허용한다.
  const spots = [
    { x: 64, y: 60, w: 40, h: 52 },
    { x: 36, y: 62, w: 38, h: 50 },
    { x: 62, y: 56, w: 42, h: 54 },
    { x: 38, y: 58, w: 40, h: 50 },
  ];
  const spot = spots[index % spots.length];

  // 그림이 없는 씬(주로 quote)은 글자가 유일한 내용이므로 화면 가운데에 크게 앉힌다.
  // 위쪽에 작게 두면 종이만 넓게 비어 "빠진 화면"처럼 보인다. 참고 영상도 전환 문장은
  // 화면 한가운데 한 줄로 크게 박는다 — 이 대비가 컷 사이의 쉼표 역할을 한다.
  const soloText = !scene.imagePath;

  return (
    <AbsoluteFill>
      <PaperBackground kind={paper} seed={index} />

      {/* 큰 타이포 — 나레이션 시작과 함께 찍히기 시작한다 */}
      {headline && (
        <div
          style={
            soloText
              ? {
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 160px',
                  paddingBottom: 120, // 하단 자막 자리를 비워 둔다
                }
              : { position: 'absolute', left: 110, top: 96, right: 110, maxWidth: 1180 }
          }
        >
          <Typewriter
            text={headline}
            fps={fps}
            color={ink}
            fontSize={soloText ? (headline.length > 14 ? 120 : 148) : headline.length > 18 ? 78 : 104}
            align={soloText ? 'center' : 'left'}
            delay={Math.round(fps * 0.25)}
          />
        </div>
      )}

      {/* 컷아웃 스크랩 — 글자가 어느 정도 찍힌 뒤에 붙는다 */}
      {scene.imagePath && (
        <ScrapPiece
          src={scene.imagePath}
          x={spot.x}
          y={spot.y}
          w={spot.w}
          h={spot.h}
          delay={Math.round(fps * 1.1)}
          fps={fps}
          seed={index}
        />
      )}

      {/* 하단 자막 — 큰 글자가 주인공이므로 자막은 작고 조용하게 */}
      <ScrapCaption narration={scene.narration} durationInFrames={dur} speechFrames={Math.round(scene.durationSec * fps)} />

      <FilmGrain seed={index} />
      <ProjectorFlash durationInFrames={dur} fps={fps} />
    </AbsoluteFill>
  );
};

/**
 * 하단 자막.
 *
 * illustrated 엔진의 자막은 화면 중앙 하단에 크고 굵게 들어가지만, 이 스타일에서는
 * 큰 타이포가 주인공이라 자막이 크면 둘이 싸운다. 참고 영상처럼 작은 검은 알약으로 깐다.
 */
const ScrapCaption: React.FC<{ narration: string; durationInFrames: number; speechFrames: number }> = ({
  narration,
  durationInFrames,
  speechFrames,
}) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 22, speechFrames);
  if (!chunks.length) return null;
  const cur = chunks.find((b) => frame >= b.start && frame < b.end) ?? chunks[chunks.length - 1];
  const pop = interpolate(frame - cur.start, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 64,
        left: 0,
        right: 0,
        textAlign: 'center',
        opacity: pop,
      }}
    >
      <span
        style={{
          fontFamily: PRETENDARD,
          fontWeight: 600,
          fontSize: 34,
          color: '#f5f2ea',
          background: '#14161acc',
          padding: '10px 22px',
          borderRadius: 6,
          lineHeight: 1.5,
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {cur.text}
      </span>
    </div>
  );
};

/** 배경음악 — illustrated 엔진과 같은 방식(전체 길이에 걸쳐 낮게 깔고 끝에서 페이드아웃). */
const BackgroundMusic: React.FC<{ src: string; total: number }> = ({ src, total }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [total - 48, total], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile(src)} volume={0.1 * fade} loop />;
};
