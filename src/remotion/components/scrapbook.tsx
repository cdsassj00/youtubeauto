import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { PRETENDARD } from '../pretendard.js';

/**
 * VOX(스크랩북) 스타일 화면 부품.
 *
 * 참고 영상을 프레임 단위로 뜯어보고 재현한 것들이다:
 *   종이 배경 · 타자기 타이핑 · 스크랩 순차 등장 · 영사기 화이트 플래시 전환.
 * 전부 코드로 그리므로 추가 비용이 없다(그림만 AI 로 만든다).
 */

/** 종이 배경 종류 — 씬마다 갈아끼워 같은 화면이 이어지지 않게 한다. */
export type PaperKind = 'mustard' | 'grid' | 'lined' | 'plain';

const PAPER: Record<PaperKind, { bg: string; ink: string; lines?: string }> = {
  // 겨자색 카드 — 참고 영상의 도입부 톤
  mustard: { bg: '#d6c99c', ink: '#241f18' },
  // 모눈종이 — 도식·숫자가 나오는 장면
  grid: { bg: '#e9e6dc', ink: '#20242b', lines: 'grid' },
  // 줄공책 — 글이 주인공인 장면
  lined: { bg: '#eeebe3', ink: '#20242b', lines: 'lined' },
  // 무지 — 스크랩이 클 때
  plain: { bg: '#eae7de', ink: '#20242b' },
};

/**
 * 종이 배경.
 * 흰색도 검정도 아닌 "종이"라는 점이 이 스타일의 핵심이다. 눈금·괘선은 SVG 로 그리고,
 * 얼룩은 큰 방사형 그라디언트 몇 개로 만든다 — 텍스처 이미지를 넣지 않아 용량이 0 이다.
 */
export const PaperBackground: React.FC<{ kind: PaperKind; seed?: number }> = ({ kind, seed = 0 }) => {
  const p = PAPER[kind];
  const s = (n: number) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      {/* 종이 얼룩 — 완전히 균일한 색은 종이로 안 보인다 */}
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(60% 45% at ${20 + s(1) * 25}% ${25 + s(2) * 20}%, #00000012, transparent 70%)`,
            `radial-gradient(50% 40% at ${70 + s(3) * 20}% ${65 + s(4) * 20}%, #00000010, transparent 70%)`,
            `radial-gradient(80% 60% at 50% 120%, #0000001a, transparent 60%)`,
          ].join(','),
        }}
      />
      {kind === 'grid' && (
        <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.5 }}>
          <defs>
            <pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0 L0 0 0 48" fill="none" stroke="#5a6b8c" strokeWidth="1" opacity="0.35" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)" />
        </svg>
      )}
      {kind === 'lined' && (
        <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.45 }}>
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1="0" y1={90 + i * 62} x2="100%" y2={90 + i * 62} stroke="#7c8aa6" strokeWidth="1.4" />
          ))}
          <line x1="180" y1="0" x2="180" y2="100%" stroke="#c98b8b" strokeWidth="1.6" opacity="0.7" />
        </svg>
      )}
      {/* 가장자리 어둠 — 종이가 평평하게 놓인 느낌 */}
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px #00000026' }} />
    </AbsoluteFill>
  );
};

/**
 * 타자기 타이핑.
 *
 * 참고 영상에서 0.1초마다 1~2자씩 늘어났다(초당 10~15자). 커서 막대가 끝에 붙어 있고
 * 문장이 다 찍히면 잠깐 멈춘다. 이 채널은 한국어라 자모가 아니라 완성형 글자 단위로 센다.
 *
 * ★글자가 주인공이다★ 이 스타일에서 큰 타이포는 장식이 아니라 화면 그 자체다.
 * 하단 자막은 따로 작게 깔린다.
 */
export const Typewriter: React.FC<{
  text: string;
  /** 초당 몇 글자 */
  cps?: number;
  /** 시작 지연 프레임 */
  delay?: number;
  fps: number;
  color: string;
  fontSize?: number;
  align?: 'left' | 'center';
}> = ({ text, cps = 13, delay = 0, fps, color, fontSize = 96, align = 'left' }) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - delay);
  const shown = Math.min(text.length, Math.floor((elapsed / fps) * cps));
  const done = shown >= text.length;
  // 커서는 다 찍힌 뒤에도 잠깐 깜빡이다 사라진다.
  const blink = Math.floor(frame / (fps * 0.4)) % 2 === 0;
  const cursorVisible = !done || (frame - delay < (text.length / cps) * fps + fps * 1.5 && blink);

  return (
    <div
      style={{
        fontFamily: PRETENDARD,
        fontWeight: 800,
        fontSize,
        lineHeight: 1.18,
        color,
        textAlign: align,
        letterSpacing: '-0.5px',
        // 잉크가 종이에 눌린 느낌 — 아주 옅은 그림자
        textShadow: '0 1px 0 #00000018',
      }}
    >
      {text.slice(0, shown)}
      {cursorVisible && (
        <span style={{ opacity: 0.55, fontWeight: 400 }}>|</span>
      )}
    </div>
  );
};

/**
 * 스크랩 한 조각 — 컷아웃 PNG 가 종이 위에 "탁" 놓이는 등장.
 *
 * 페이드만 쓰면 밋밋하다. 참고 영상처럼 살짝 크게 들어와 제자리에 앉고, 각도도 조금
 * 틀어져 있어야 손으로 붙인 느낌이 난다.
 */
export const ScrapPiece: React.FC<{
  src: string;
  /** 화면 기준 위치(%) */
  x: number;
  y: number;
  /** 화면 가로 대비 최대 폭(%) */
  w: number;
  /** 화면 세로 대비 최대 높이(%) — 이걸 안 걸면 세로로 긴 조각이 화면 밖으로 나간다 */
  h: number;
  delay: number;
  fps: number;
  seed?: number;
}> = ({ src, x, y, w, h, delay, fps, seed = 0 }) => {
  const frame = useCurrentFrame();
  const t = frame - delay;
  const dur = Math.round(fps * 0.32);
  const p = interpolate(t, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // 살짝 큰 데서 제자리로 — 스프링처럼 아주 약간 지나쳤다 돌아온다.
  const scale = 1.14 - 0.14 * p + Math.sin(p * Math.PI) * 0.02;
  const tilt = ((seed % 7) - 3) * 0.7; // -2.1° ~ +2.1°
  if (t < 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        // 폭·높이 둘 다 상자로 묶고 그 안에서 비율을 유지한다(object-fit: contain).
        // 폭만 주면 세로로 긴 조각이 화면 아래로 잘려 나간다 — 실제로 그렇게 나왔다.
        width: `${w}%`,
        height: `${h}%`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${tilt}deg)`,
        opacity: p,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block' }}
      />
    </div>
  );
};

/**
 * 영사기 전환 — 씬 경계에서 화면이 하얗게 날아갔다 돌아온다.
 *
 * 참고 영상 5.9초 지점을 0.1초 간격으로 뜯어보니, 화면 전체가 노출 과다로 완전히
 * 하얘졌다가 새 화면이 배어들며 정착했다(약 0.4초). 필름 게이트를 지날 때 광량이
 * 튀는 것을 흉내낸 것이다. 단순 크로스페이드와 인상이 완전히 다르다.
 *
 * 씬의 앞·뒤 양쪽에 깔아야 "나갔다 들어온다"가 된다.
 */
export const ProjectorFlash: React.FC<{ durationInFrames: number; fps: number }> = ({
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const f = Math.round(fps * 0.4);
  // 시작 직후와 끝나기 직전에 각각 한 번씩 번쩍인다.
  const inFlash = interpolate(frame, [0, f * 0.35, f], [0.95, 0.5, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outFlash = interpolate(
    frame,
    [durationInFrames - f, durationInFrames - f * 0.35, durationInFrames],
    [0, 0.5, 0.95],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const v = Math.max(inFlash, outFlash);
  if (v <= 0.001) return null;
  return (
    <AbsoluteFill
      style={{
        // 순백보다 살짝 따뜻해야 전구 빛처럼 보인다.
        backgroundColor: '#fffaf0',
        opacity: v,
        pointerEvents: 'none',
      }}
    />
  );
};

/** 필름 그레인 — 아주 옅게 깔아야 종이·판화가 "찍힌 화면"으로 붙는다. */
export const FilmGrain: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const frame = useCurrentFrame();
  // 프레임마다 패턴을 흔들어 정지 노이즈처럼 보이지 않게 한다.
  const shift = (frame * 37 + seed * 11) % 100;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.055, mixBlendMode: 'multiply' }}>
      <svg width="100%" height="100%">
        <filter id={`grain${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed={shift} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const paperInk = (kind: PaperKind) => PAPER[kind].ink;
export const PAPER_KINDS: PaperKind[] = ['mustard', 'grid', 'lined', 'plain'];
