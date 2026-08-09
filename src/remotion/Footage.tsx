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
import { IsoDiagram, IsoComparison } from './components/iso.js';
import { darkTheme } from './theme.js';

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
          {/*
            도식이 있는 씬은 큰 글씨 대신 도식이 주인공이다.
            둘을 같이 크게 띄우면 화면 왼쪽에서 서로 자리를 다툰다.
          */}
          {hasFigure(scene) ? (
            <FigureOverlay scene={scene} index={i} durationInFrames={scene.durationInFrames} />
          ) : (
            <Keynote
              heading={scene.heading}
              subtext={scene.bullets[0] || ''}
              durationInFrames={scene.durationInFrames}
            />
          )}
          <Caption
            narration={scene.narration}
            durationInFrames={scene.durationInFrames}
            speechFrames={Math.round(scene.durationSec * manifest.fps)}
          />
          {scene.sourceNote && <SourceNote text={scene.sourceNote} />}
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

/**
 * 키노트 타이포 — 큰 글씨(핵심)와 작은 글씨(부연)를 실사 위에 얹는다.
 *
 * 이 엔진이 자막만 깔면 "스톡 영상에 자막 붙인 것"이 되고, 무슨 말을 하는 회차인지가
 * 화면에 안 남는다. 강의형 콘텐츠는 소리를 끄고 지나가는 시청자에게도 핵심 문장이
 * 보여야 한다. 그래서 씬의 heading 을 화면 왼쪽에 크게 세우고 부연을 한 줄 붙인다.
 *
 * 실사 위에 흰 글씨를 그냥 얹으면 밝은 장면에서 읽히지 않으므로, 글자 뒤에만
 * 왼쪽에서 오는 어두운 그라디언트를 깐다(화면 전체를 덮으면 영상이 죽는다).
 */
/** 이 씬에 코드로 그리는 도식이 실제로 들어가는가. */
function hasFigure(scene: RenderManifest['scenes'][number]): boolean {
  if (scene.visual === 'diagram') return Boolean(scene.diagram?.nodes.length);
  if (scene.visual === 'comparison') return Boolean(scene.comparison);
  return false;
}

/**
 * 실사 위에 얹는 도식.
 *
 * ★이게 이 엔진의 마지막 조각이다★
 * 실사 위에 글자만 얹으면 "스톡 영상에 자막 단 것"에서 못 벗어난다. illustrated 엔진이
 * 코드로 그리던 등각 도식·비교 모션그래픽을 평평한 배경 대신 실사 위에 올리면,
 * 남의 소재 위에 우리 것이 올라가서 화면의 성격 자체가 달라진다.
 *
 * 두 가지를 지켜야 실제로 읽힌다:
 *  1) 도식 뒤에 어둡게 깔아 준다. 도식은 단색 배경 기준으로 그려져 있어서 복잡한 실사
 *     위에 그대로 올리면 선과 글자가 묻힌다. 다만 화면을 완전히 덮지는 않는다 —
 *     가장자리로 배경 영상이 살아 있어야 "영상 위에 자료를 올린" 화면이 된다.
 *  2) 다크 테마로 그린다. iso 컴포넌트는 theme.paper 를 배경이 아니라 노드 채움색으로
 *     쓰므로, 어두운 paper + 흰 ink 조합이면 노드가 실사 위에서 또렷하게 뜬다.
 */
const FigureOverlay: React.FC<{
  scene: RenderManifest['scenes'][number];
  index: number;
  durationInFrames: number;
}> = ({ scene, index, durationInFrames }) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [2, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leave = interpolate(frame, [durationInFrames - 12, durationInFrames - 2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const o = Math.min(appear, leave);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: o }}>
      {/* 가운데를 어둡게 눌러 도식을 띄우고, 가장자리는 배경 영상이 그대로 보이게 둔다 */}
      <AbsoluteFill
        style={{
          // 처음엔 .90/.78/.30 으로 깔았더니 도식은 잘 읽히는데 배경 영상이 거의 안 보였다.
          // 그러면 "실사 위에 도식"이 아니라 그냥 어두운 배경의 도식 화면이 된다.
          // 도식이 있는 가운데만 눌러 주고 가장자리는 영상이 살아 있게 낮춘다.
          background:
            'radial-gradient(74% 70% at 50% 46%, rgba(8,10,14,.80) 0%, rgba(8,10,14,.62) 55%, rgba(8,10,14,.18) 100%)',
        }}
      />
      {/* 도식이 주인공인 씬이므로 제목은 위쪽에 작게 — 큰 글씨와 자리를 다투지 않게 */}
      {scene.heading && (
        <div
          style={{
            position: 'absolute',
            top: 74,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: PRETENDARD,
            fontWeight: 900,
            fontSize: 44,
            letterSpacing: '-.03em',
            color: '#ffffff',
            textShadow: '0 2px 18px rgba(0,0,0,.6)',
            wordBreak: 'keep-all',
          }}
        >
          {scene.heading}
        </div>
      )}
      {scene.visual === 'diagram' && scene.diagram ? (
        <IsoDiagram
          diagram={scene.diagram}
          narration={scene.narration}
          durationInFrames={durationInFrames}
          seed={index}
          theme={darkTheme}
        />
      ) : scene.comparison ? (
        <IsoComparison
          comparison={scene.comparison}
          narration={scene.narration}
          durationInFrames={durationInFrames}
          theme={darkTheme}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** 큰 글씨가 쓸 수 있는 가로 폭(px). 오른쪽 절반은 배경 영상을 보여 줘야 하므로 넘기지 않는다. */
const HEAD_W = 940;

/**
 * 글자 수에 맞춰 큰 글씨 크기를 정한다.
 *
 * 예전엔 22자를 기준으로 78/62 두 단계만 뒀는데, 14자짜리 문장이 폭을 넘겨 두 줄로
 * 쪼개졌다("처음엔 말을 잘 걸어야 / 했다"). 짧은 문장은 한 줄로 끝나야 키노트로 읽힌다.
 *
 * ★비율은 추정하지 말고 실측한 값을 쓴다★ 처음엔 "한글은 글자폭이 글자크기와 같다"고
 * 보고 0.98 을 썼는데, Pretendard 900 에 letter-spacing -0.035em 을 건 실제 폭을 재 보니
 * 글자당 0.64~0.89 였다(공백과 라틴 문자가 훨씬 좁다). 과대추정이라 계산상 딱 맞는 값도
 * 실제로는 남아돌지 않아 결국 줄이 넘어갔다.
 *
 * 가장 넓은 경우(한글만 이어진 문장, 0.885)를 기준으로 잡아 어떤 문장이 와도 넘치지 않게 한다.
 * 16자 이하는 한 줄에 넣고, 그보다 길면 두 줄을 목표로 크기를 잡는다.
 */
function headingSize(heading: string): number {
  const CHAR_RATIO = 0.9;
  const targetLines = heading.length <= 16 ? 1 : 2;
  const fit = (HEAD_W * targetLines) / (heading.length * CHAR_RATIO);
  return Math.round(Math.max(46, Math.min(78, fit)));
}

const Keynote: React.FC<{ heading: string; subtext: string; durationInFrames: number }> = ({
  heading,
  subtext,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  if (!heading) return null;
  const inFade = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 끝에서 먼저 빠진다 — 다음 씬의 큰 글씨와 겹치면 지저분하다.
  const outFade = interpolate(frame, [durationInFrames - 14, durationInFrames - 4], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const o = Math.min(inFade, outFade);
  const rise = (1 - inFade) * 16;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          opacity: o,
          background: 'linear-gradient(100deg, rgba(8,10,14,.86) 0%, rgba(8,10,14,.58) 42%, transparent 68%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 120,
          width: HEAD_W,
          opacity: o,
          transform: `translateY(${rise}px)`,
        }}
      >
        <div
          style={{
            fontFamily: PRETENDARD,
            fontWeight: 900,
            fontSize: headingSize(heading),
            lineHeight: 1.16,
            letterSpacing: '-.035em',
            color: '#ffffff',
            textShadow: '0 2px 24px rgba(0,0,0,.45)',
            // ★keep-all 이 없으면 한글이 단어 중간에서 잘린다★
            // 실제로 "처음엔 말을 잘 걸어야 했 / 다" 처럼 두 글자짜리 어절이 쪼개져 나왔다.
            // 브라우저 기본값(break-word)은 한국어에서 어절 개념이 없어 아무 데서나 끊는다.
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
          }}
        >
          {heading}
        </div>
        {subtext && (
          <div
            style={{
              marginTop: 22,
              paddingLeft: 18,
              borderLeft: '3px solid rgba(255,255,255,.5)',
              fontFamily: PRETENDARD,
              fontWeight: 600,
              fontSize: 27,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,.86)',
              textShadow: '0 1px 12px rgba(0,0,0,.5)',
            }}
          >
            {subtext}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/**
 * 시연·사례 표기 — 화면 왼쪽 아래에 아주 옅게.
 *
 * "지금 이 얘기는 어디서 확인할 수 있나"를 남기되 화면을 방해하면 안 되므로 투명도를
 * 낮게 둔다. 진하게 하면 시청자가 자막인 줄 알고 읽으려다 본문을 놓친다.
 */
const SourceNote: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: 'absolute',
      left: 96,
      bottom: 168,
      maxWidth: 720,
      fontFamily: PRETENDARD,
      fontWeight: 600,
      fontSize: 19,
      lineHeight: 1.45,
      color: '#ffffff',
      opacity: 0.34,
      letterSpacing: '.01em',
      textShadow: '0 1px 10px rgba(0,0,0,.6)',
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
);

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
const Caption: React.FC<{ narration: string; durationInFrames: number; speechFrames: number }> = ({
  narration,
  durationInFrames,
  speechFrames,
}) => {
  const frame = useCurrentFrame();
  const chunks = captionChunks(narration, durationInFrames, 16, speechFrames);
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
