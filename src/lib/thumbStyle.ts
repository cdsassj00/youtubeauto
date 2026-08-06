/**
 * 썸네일 스타일 프리셋.
 *
 * 문제: 썸네일이 매번 똑같아 보였다. 원인은 세 가지였고 각각 달랐다.
 *   1) 인물 위치 — 레이아웃 6개 중 4개가 인물을 오른쪽에 뒀다(67%). 랜덤인데도 한쪽으로 쏠린다.
 *   2) 글씨체   — "hand-lettered marker style" 한 줄이 하드코딩돼 있었다.
 *   3) 색조     — THUMBNAIL_TONE 이 dark 로 고정이었고 UI 에도 없었다.
 *
 * 그래서 배경·레터링·액센트를 한 벌로 묶은 "스타일"을 만든다. 셋을 따로 고르게 하면
 * 어울리지 않는 조합(네온 배경 + 세리프 잡지 글씨)이 나오는데, 한 벌로 묶으면 어떤 걸
 * 골라도 완결된 그림이 된다. 인물 위치 쏠림은 좌우 반전(mirror)으로 따로 해결한다.
 */

export type ThumbStyle = {
  id: string;
  label: string;
  /** 배경 묘사 */
  bg: string;
  /** 제목 글씨의 서체·질감 */
  lettering: string;
  /** 제목 글씨의 색 */
  inkTitle: string;
  /** 액센트 색 운용 */
  accent: string;
  /** 배지 바탕색(HEX) */
  badgeColor: string;
};

export const THUMB_STYLES: ThumbStyle[] = [
  {
    id: 'chalk',
    label: '칠판 마커 (기존)',
    bg: 'dark chalkboard background (near-black charcoal) with subtle chalk texture filling the whole frame',
    lettering: 'hand-lettered chalk marker style, thick rounded strokes with slightly rough edges',
    inkTitle: 'the key phrase in bold ORANGE (#e8590c) and the rest in bright WHITE chalk',
    accent: 'Use orange (#e8590c), blue (#1971c2) and green (#2f9e44) accents on clean chalk strokes.',
    badgeColor: '#e8590c',
  },
  {
    id: 'paper',
    label: '크림 종이 + 잉크',
    bg: 'warm cream textured paper background (#efe9dc) filling the whole frame, like a hand-drawn notebook',
    lettering: 'hand-lettered marker style, thick confident strokes as if drawn with a felt pen on paper',
    inkTitle: 'the key phrase in bold ORANGE (#e8590c) marker and the rest in near-black ink',
    accent: 'Use orange (#e8590c), blue (#1971c2) and green (#2f9e44) accents on clean ink strokes.',
    badgeColor: '#e8590c',
  },
  {
    id: 'impact',
    label: '초굵은 고딕 (임팩트)',
    bg: 'a flat bold solid-color background (deep red #b02a1e or deep navy #14213d), completely plain with no texture',
    lettering:
      'EXTREMELY heavy condensed sans-serif lettering, tightly packed, like a sports headline — no handwriting, no marker texture, crisp geometric letterforms with a hard black outline',
    inkTitle: 'the key phrase in vivid YELLOW (#ffd400) and the rest in pure WHITE, each with a thick black outline',
    accent: 'Use only yellow (#ffd400) and white on the solid background — no third color, keep it brutally simple.',
    badgeColor: '#111111',
  },
  {
    id: 'neon',
    label: '네온 사이버',
    bg: 'a very dark navy-black background with a subtle grid and soft neon glow pooling in the corners',
    lettering:
      'sharp modern sans-serif lettering with a neon tube glow, thin bright outline and colored bloom around each stroke',
    inkTitle: 'the key phrase in glowing CYAN (#22d3ee) and the rest in glowing MAGENTA-WHITE',
    accent: 'Use cyan (#22d3ee) and magenta (#e879f9) glows only. Dark, moody, high-tech.',
    badgeColor: '#7c3aed',
  },
  {
    id: 'magazine',
    label: '잡지 편집',
    bg: 'a clean off-white studio background (#f4f2ee) with a large soft shadow, like a magazine cover',
    lettering:
      'elegant high-contrast SERIF typography, tight letter spacing, editorial and restrained — absolutely no handwriting or marker texture',
    inkTitle: 'the key phrase in deep BLACK serif and one single word in bright RED (#d62828)',
    accent: 'Use only black, off-white and one red (#d62828) accent. Lots of white space. Calm and premium.',
    badgeColor: '#d62828',
  },
  {
    id: 'scrap',
    label: '빈티지 판화 콜라주',
    bg: 'an aged mustard-tan paper background (#d9cfa8) with visible paper grain and a faint grid',
    lettering:
      'vintage typewriter / letterpress serif lettering, slightly inked and imperfect, as if stamped onto the paper',
    inkTitle: 'the key phrase in deep INK BLACK and the rest in faded sepia-brown',
    accent:
      'Render any symbol as a black-ink vintage engraving cut-out with a white torn-paper edge, like a scrapbook clipping. Monochrome ink only, no bright colors.',
    badgeColor: '#8b3a2e',
  },
];

const BY_ID = new Map(THUMB_STYLES.map((s) => [s.id, s]));
export const DEFAULT_THUMB_STYLE = THUMB_STYLES[0];

/**
 * 'auto' 면 날짜로 회전한다(같은 회차를 재시도해도 같은 스타일이 나오도록 날짜 기준).
 * 빈 값은 기본값 — "지정 안 함"과 "알아서 골라라"는 다른 뜻이다.
 */
export function resolveThumbStyle(id: string | undefined, date = new Date()): ThumbStyle {
  const key = (id || '').trim().toLowerCase();
  if (key === 'auto') {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return THUMB_STYLES[Math.floor(kst.getTime() / 86_400_000) % THUMB_STYLES.length];
  }
  if (!key) return DEFAULT_THUMB_STYLE;
  return BY_ID.get(key) ?? DEFAULT_THUMB_STYLE;
}
