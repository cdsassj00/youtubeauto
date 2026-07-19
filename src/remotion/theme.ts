import { handFamily, bodyFamily, displayFamily } from './fonts.js';

/** Excalidraw 손그림 느낌의 색/폰트 팔레트. */
export const theme = {
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
} as const;

/** diagram 노드에 순환 배정할 강조색. */
export const nodeColors = [
  theme.accent2,
  theme.accent,
  theme.accent3,
  '#9c36b5',
  '#0c8599',
  '#e64980',
];
