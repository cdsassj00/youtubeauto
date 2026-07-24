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

/** diagram 노드에 순환 배정할 강조색. (다색은 촌스러워 폐기 예정 — monoRamp 사용 권장) */
export const nodeColors = [
  theme.accent2,
  theme.accent,
  theme.accent3,
  '#9c36b5',
  '#0c8599',
  '#e64980',
];

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * 모노톤 명도 그라데이션 램프 — from(진한 잉크)에서 to(연한 muted)로 n단계 보간한 회색조 배열.
 * "번호색이 알록달록해서 촌스럽다, 모노톤 그라데이션으로만 구분하라"는 요청에 따라, 슬라이드
 * 번호·막대·매트릭스 색을 다색 대신 이 램프로 칠한다.
 */
export function monoRamp(theme: VisualTheme, count: number): string[] {
  const [r0, g0, b0] = hexToRgb(theme.ink);
  const [r1, g1, b1] = hexToRgb(theme.muted);
  if (count <= 1) return [theme.ink];
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * 0.72; // 끝까지 muted 로 가지 않고 72%까지만(가독성 유지)
    return rgbToHex(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t);
  });
}

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
