import { handFamily, bodyFamily, displayFamily } from './fonts.js';

/** 색/폰트 팔레트 구조 — light/dark 팔레트가 서로 구조적으로 호환되도록 문자열 타입으로 고정. */
export type VisualTheme = {
  paper: string;
  ink: string;
  sub: string;
  accent: string;
  accent2: string;
  accent3: string;
  highlight: string;
  muted: string;
  handFont: string;
  bodyFont: string;
  displayFont: string;
};

/** Excalidraw 손그림 느낌의 색/폰트 팔레트. */
export const theme: VisualTheme = {
  paper: '#faf9f5', // 종이 배경
  ink: '#1e1e1e', // 손글씨 잉크
  sub: '#495057',
  accent: '#e8590c', // 강조(주황)
  accent2: '#1971c2', // 강조(파랑)
  accent3: '#2f9e44', // 강조(초록)
  highlight: '#ffe066', // 형광펜
  muted: '#adb5bd',
  // 번들 내장 폰트 (fonts.ts) — 시스템 설치 불필요
  handFont: `${handFamily}, "Comic Sans MS", sans-serif`,
  bodyFont: `${bodyFamily}, "Malgun Gothic", sans-serif`,
  displayFont: `${displayFamily}, ${handFamily}, sans-serif`,
};

/** diagram 노드에 순환 배정할 강조색. */
export const nodeColors = [
  theme.accent2,
  theme.accent,
  theme.accent3,
  '#9c36b5',
  '#0c8599',
  '#e64980',
];

/**
 * 다크 변형 팔레트 — "다크/화이트를 적절히 반전 활용해라"는 요청에 따라, 영상마다 라이트(흰 배경+
 * 검은 잉크)와 다크(질감있는 짙은 배경+흰 도형) 중 하나를 골라 코드로 그리는 화면 전체(발표자료/등각
 * 도식)에 일관되게 적용한다. accent 색은 라이트와 동일하게 유지해 브랜드 톤을 지킨다.
 */
export const darkTheme: VisualTheme = {
  paper: '#15161a', // 질감있는 짙은 배경
  ink: '#f4f5f7', // 흰 잉크(라이트의 ink 대응)
  sub: '#c1c6cf',
  accent: '#ff7a3d', // 다크에서 더 잘 보이게 살짝 밝힌 주황
  accent2: '#4dabf7',
  accent3: '#51cf66',
  highlight: '#ffe066',
  muted: '#5c6270',
  handFont: theme.handFont,
  bodyFont: theme.bodyFont,
  displayFont: theme.displayFont,
};
