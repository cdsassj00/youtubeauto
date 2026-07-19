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
  // Excalidraw 기본 손글씨 폰트 (Virgil) 를 못 구하면 시스템 손글씨/고딕으로 폴백.
  handFont:
    '"Excalifont", "Virgil", "Nanum Pen Script", "Gaegu", "Comic Sans MS", sans-serif',
  bodyFont:
    '"Pretendard", "Nanum Gothic", -apple-system, "Malgun Gothic", sans-serif',
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
