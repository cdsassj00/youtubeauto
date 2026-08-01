/**
 * 씬 일러스트 화풍(art style) 프리셋.
 *
 * 기존에는 흑백 등각(isometric) 라인아트 한 가지로 고정돼 있어서, 영상이 쌓일수록
 * "매번 같은 그림"이라는 인상을 줬다. 이 파일은 화풍만 갈아끼울 수 있게 분리한다.
 *
 * 구조:
 *   SUBJECT_RULES  — 화풍과 무관하게 항상 지켜야 하는 "무엇을 그릴지" 규칙
 *   ART_STYLES     — "어떻게 그릴지"(붓질·재질·색)만 담는 프리셋
 *
 * 이렇게 나눈 이유: 화풍을 바꿔도 "글자 넣지 마라 / AI 클리셰 그리지 마라 / 은유 대신
 * 실물을 그려라" 같은 핵심 제약은 그대로 유지돼야 하기 때문이다. 프리셋에 이 규칙을
 * 복사해 넣으면 새 화풍을 추가할 때마다 빠뜨리게 된다.
 */

/**
 * 화풍과 무관하게 모든 일러스트에 적용되는 "무엇을 그릴지" 규칙.
 * 기존 illustrate.ts 의 STYLE_BASE 에서 화풍(등각 라인아트) 부분만 걷어낸 것이다.
 */
const SUBJECT_RULES =
  'Depict the subject LITERALLY and DIRECTLY — show the actual objects, screens, and actions being explained, ' +
  'not abstract metaphors or symbolic scenes; the viewer should instantly recognize what is being described. ' +
  'STRICTLY FORBIDDEN generic "AI cliche" imagery: a brain made of circuits, a glowing lightbulb, an abstract cloud of floating dots/network nodes, ' +
  'a robot hand touching a human hand, a glowing orb/sphere, a holographic brain, magical light rays, or any generic sci-fi "AI" symbolism. ' +
  'Instead always depict one concrete, real, specific object or scene tied to the exact subject (an actual laptop screen with a real UI, a physical office desk, ' +
  'a specific labeled diagram, a real tool, a stack of paper documents, a server rack, a phone showing an app). ' +
  'Centered composition with generous empty space, 16:9 landscape. ' +
  'Absolutely NO text, letters, words, captions, numbers, logos, or watermarks anywhere in the image — not even short tags, labels, tabs, or stickers with words on them. ' +
  'If the concrete object you choose would realistically have text on it (a book, a screen, a sign, a sticky note, a bookmark tab), draw it with blank space, abstract scribble lines, or a solid color block standing in for the text — never render actual letterforms, and never invent words, since AI-generated text always comes out garbled and unreadable.';

export type ArtStyle = {
  /** 환경변수/UI 에서 쓰는 식별자 */
  id: string;
  /** UI 에 보여줄 한국어 라벨 */
  label: string;
  /** 컬러 화풍이면 true. 자막·도식의 대비 계산에 쓰인다. */
  color: boolean;
  /**
   * 화풍 지시문. dark=true 면 어두운 배경 변형을 돌려준다.
   * (영상 테마가 dark 일 때 일러스트만 흰 배경이면 그 씬에서 화면이 번쩍인다.)
   */
  look: (dark: boolean) => string;
};

/**
 * 고를 수 있는 화풍들.
 * 첫 항목(isometric)이 기존 채널 스타일이며, 지정이 없을 때의 안전한 기본값이다.
 */
export const ART_STYLES: ArtStyle[] = [
  {
    id: 'isometric',
    label: '흑백 등각 라인아트 (기존)',
    color: false,
    look: (dark) =>
      (dark
        ? 'Clean white-ink isometric editorial illustration, minimalist, on a solid near-black background (#15161a), ' +
          'fine white/light-grey linework and subtle lighter-grey flat shading, grayscale only. '
        : 'Clean black-and-white isometric editorial illustration, minimalist, on a pure white background, ' +
          'fine black ink linework and subtle grey flat shading, grayscale only. ') +
      'Objects are shown as geometric solids/platforms viewed from a 3/4 isometric angle with a consistent top-left light source, ' +
      'NOT a flat front-facing view, with soft drop shadows beneath floating elements.',
  },
  {
    id: 'comic',
    label: '빈티지 코믹북',
    color: true,
    look: (dark) =>
      'Vintage 1960s American comic book panel art: bold black ink outlines of uneven weight, flat limited-palette colors ' +
      '(warm red, mustard yellow, teal, cream), visible halftone Ben-Day dot shading, slight off-register misprint edges, ' +
      'and subtly aged//yellowed paper texture. Dynamic slightly low camera angle for drama. ' +
      (dark
        ? 'Set the scene against a deep desaturated background so it sits comfortably on a dark page. '
        : 'Set the scene against a light aged-newsprint background. ') +
      'No speech balloons, no caption boxes, no onomatopoeia — those all contain lettering.',
  },
  {
    id: 'watercolor',
    label: '수채화',
    color: true,
    look: (dark) =>
      'Loose hand-painted watercolor illustration on textured cold-press paper: soft translucent washes with visible ' +
      'pigment granulation and blooming edges, colors bleeding gently into one another, a few confident darker ink ' +
      'contour lines drawn over the wash, and areas of untouched paper left as highlights. Calm muted palette. ' +
      (dark
        ? 'Use deep indigo and slate washes so the painting reads well against a dark page. '
        : 'Leave the paper white and airy around the subject. '),
  },
  {
    id: 'cinematic',
    label: '시네마틱 사진',
    color: true,
    look: (dark) =>
      'Photorealistic cinematic still, shot on a full-frame camera with a 35mm lens at f/1.8: shallow depth of field with ' +
      'creamy background bokeh, motivated practical lighting, gentle film grain, subtle anamorphic-style highlight flare, ' +
      'and a restrained teal-and-amber color grade. Composed like a frame from a documentary feature. ' +
      (dark
        ? 'Low-key lighting with deep shadows and a dark environment. '
        : 'High-key soft daylight with a bright airy environment. '),
  },
  {
    id: 'retro',
    label: '레트로 애니메이션',
    color: true,
    look: (dark) =>
      'Mid-century retro cartoon animation cel, in the style of 1950s-60s limited animation: simplified geometric character ' +
      'and object shapes, thick confident brush outlines, flat matte gouache-like color fills with a warm muted palette ' +
      '(burnt orange, avocado, teal, cream), textured paper grain overlay, and stylized flat perspective. ' +
      (dark ? 'Painted on a dark muted background card. ' : 'Painted on a warm cream background card. '),
  },
  {
    id: 'clay',
    label: '클레이 애니메이션',
    color: true,
    look: (dark) =>
      'Stop-motion claymation still: every object sculpted from modeling clay with visible fingerprints, thumb dents, and ' +
      'tool marks in the surface, slightly imperfect handmade proportions, soft matte clay texture, and a real miniature ' +
      'set built on a tabletop. Soft studio softbox lighting with gentle contact shadows, shallow macro depth of field. ' +
      (dark ? 'Dark neutral backdrop. ' : 'Light neutral backdrop. '),
  },
  {
    id: 'pixar',
    label: '3D 픽사 스타일',
    color: true,
    look: (dark) =>
      'Polished 3D animated feature film render in a modern Pixar-like house style: appealing rounded stylized forms with ' +
      'soft bevelled edges, rich subsurface-scattering materials, global illumination with warm bounce light, a clear key ' +
      'light and rim light, and shallow cinematic depth of field. Bright saturated but tasteful palette. ' +
      (dark ? 'Dark environment with warm practical lights. ' : 'Bright cheerful environment. '),
  },
];

const BY_ID = new Map(ART_STYLES.map((s) => [s.id, s]));

/** 기본 화풍 = 기존 채널 스타일. 알 수 없는 id 가 들어와도 여기로 떨어진다. */
export const DEFAULT_ART_STYLE = ART_STYLES[0];

/**
 * 'auto' 일 때 날짜로 화풍을 고른다.
 *
 * 랜덤이 아니라 날짜 기반 결정론으로 고르는 이유: 같은 실행을 재시도했을 때 화풍이
 * 바뀌면 이전 렌더와 섞여 한 영상 안에서 화풍이 갈릴 수 있기 때문이다.
 * 회차마다 달라지되, 한 회차 안에서는 항상 같은 값이 나온다.
 */
export function pickAutoStyle(date = new Date()): ArtStyle {
  // KST 기준 날짜로 고른다(설정의 요일 계산과 같은 기준).
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const dayNumber = Math.floor(kst.getTime() / 86_400_000);
  return ART_STYLES[dayNumber % ART_STYLES.length];
}

/**
 * id 로 화풍을 찾는다.
 *
 * 'auto' 를 명시했을 때만 날짜 기반으로 회전한다. 빈 값은 기본값(기존 채널 스타일)으로
 * 떨어뜨린다 — 환경변수 배선이 하나라도 빠졌을 때 화풍이 제멋대로 바뀌면
 * 원인을 찾기 어려운 사고가 되기 때문이다. "지정 안 함"과 "알아서 골라라"는 다른 뜻이다.
 */
export function resolveArtStyle(id: string | undefined, date = new Date()): ArtStyle {
  const key = (id || '').trim().toLowerCase();
  if (key === 'auto') return pickAutoStyle(date);
  if (!key) return DEFAULT_ART_STYLE;
  return BY_ID.get(key) ?? DEFAULT_ART_STYLE;
}

/**
 * 이미지 모델에 넘길 최종 프롬프트를 조립한다.
 * 화풍(어떻게) → 공통 규칙(무엇을) → 소재 순서로 붙인다.
 */
export function buildIllustrationPrompt(style: ArtStyle, subject: string, dark: boolean): string {
  return `${style.look(dark)} ${SUBJECT_RULES} Subject: ${subject}`;
}
