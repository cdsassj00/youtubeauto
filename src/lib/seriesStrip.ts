/**
 * 시리즈 띠 — 강의 썸네일 왼쪽 아래에 얹는 고정 라벨.
 *
 * ★왜 코드로 그리고 모델에게 안 맡기나★
 * 40편짜리 시리즈에서 "이건 같은 시리즈다"를 알려주는 장치는 매 편 **똑같은 자리에
 * 똑같은 모양**으로 있어야 눈이 그걸 하나의 표식으로 학습한다. 그림 모델에게 맡기면
 * 위치·크기·색·글자 굵기가 매번 조금씩 흔들려서 40장이 "비슷하지만 제각각"이 된다 —
 * 시리즈로 안 묶이고 그냥 산만해진다.
 *
 * 덤으로 두 가지가 더 해결된다.
 *  · 한글 철자가 100% 정확하다. 그림 모델은 한글을 "그리는" 것이라 획이 뭉개지거나
 *    글자가 빠지는데, 여기서는 실제 폰트로 조판하므로 틀릴 수가 없다.
 *  · 모델이 그려야 할 글자 덩어리가 둘에서 하나로 줄어, 큰 제목의 철자 정확도도 올라간다.
 *
 * 폰트는 fonts-noto-cjk 에 의존한다 (워크플로에서 설치). librsvg 가 fontconfig 로 찾는다.
 */
import sharp, { type Sharp, type OverlayOptions } from 'sharp';

const FONT = '"Noto Sans CJK KR","Noto Sans CJK JP",sans-serif';

/**
 * 묶음별 색.
 *
 * 40편이 전부 같은 색이면 재생목록이 한 덩어리로 보인다. 일차/오전오후로 색을 나누면
 * 목록을 훑을 때 "여기부터 2일차구나" 하는 구획이 눈에 들어온다 — 회차 번호를 하나씩
 * 읽지 않아도 자기가 어디쯤 있는지 안다.
 */
const GROUP_COLORS: Array<[RegExp, string]> = [
  [/1일차/, '#4c6ef5'],
  [/2일차\s*오전/, '#1098ad'],
  [/2일차\s*오후/, '#0ca678'],
  [/3일차\s*오전/, '#f08c00'],
  [/3일차\s*오후/, '#e8590c'],
  [/2일차/, '#1098ad'],
  [/3일차/, '#f08c00'],
];

/** 모듈 표시("2일차 오전 M01")에서 묶음 색을 고른다. 못 찾으면 회차로 돌려쓴다. */
export function groupAccent(moduleLabel: string, order: number): string {
  for (const [re, color] of GROUP_COLORS) {
    if (re.test(moduleLabel)) return color;
  }
  const fallback = ['#4c6ef5', '#1098ad', '#0ca678', '#f08c00', '#e8590c'];
  return fallback[Math.max(0, order - 1) % fallback.length];
}

/**
 * 글자가 실제로 차지하는 폭을 잰다 — 어림하지 않고 한 번 그려서 잉크 범위를 본다.
 *
 * 처음엔 "한글은 1em, 공백은 0.32em" 식으로 계산했는데 실제보다 40px 넓게 나왔다.
 * 글자칸 오른쪽에만 여백이 두 배로 붙어 띠가 한쪽으로 쏠려 보였다. 폰트의 실제 자간·
 * 사이드베어링을 코드로 맞히려는 게 애초에 틀린 접근이라, 작게 한 번 그려서 재기로 했다.
 * (1280x720 한 장 만드는 데 드는 비용에 비하면 이 렌더는 없는 것과 같다.)
 */
async function measureWidth(text: string, size: number): Promise<number> {
  if (!text.trim()) return 0;
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size * 1.4) + 80}" height="${size * 3}">
    <text x="20" y="${size * 1.5}" font-family='${FONT}' font-size="${size}" font-weight="700" fill="#fff"
      dominant-baseline="central">${esc(text)}</text></svg>`;
  const png = await sharp(Buffer.from(probe), { density: 72 }).png().toBuffer();
  const { info } = await sharp(png).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
  return info.width;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface StripSpec {
  /** 시리즈 공통 문구. 40편 내내 한 글자도 바뀌지 않아야 표식 구실을 한다. */
  label: string;
  /** 회차 — 숫자 칸에 크게 들어간다. 0 이면 숫자 칸을 생략한다. */
  order: number;
  /** 묶음 색 (#rrggbb). */
  accent: string;
}

/** 띠가 차지하는 영역 — 프롬프트에서 이 자리를 비워두라고 말할 때 쓴다. */
export interface StripBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 34;
const HEIGHT = 88;
const PAD = 26;
const LABEL_SIZE = 33;
const NUM_SIZE = 46;

/** 띠의 크기와 위치를 계산한다(그리기 전에 알아야 프롬프트에서 자리를 비워둘 수 있다). */
export async function stripBox(spec: StripSpec, canvasW: number, canvasH: number): Promise<StripBox> {
  const numW = spec.order > 0 ? HEIGHT : 0;
  const textW = (await measureWidth(spec.label, LABEL_SIZE)) + PAD * 2;
  return { left: MARGIN, top: canvasH - HEIGHT - MARGIN, width: numW + textW, height: HEIGHT };
}

function stripSvg(spec: StripSpec, box: StripBox): string {
  const { width: w, height: h } = box;
  const numW = spec.order > 0 ? HEIGHT : 0;
  const num = spec.order > 0 ? String(spec.order).padStart(2, '0') : '';
  // 숫자 칸은 액센트색, 문구 칸은 거의 검정 — 어떤 배경 그림 위에 얹혀도 글자가 살아남는다.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <filter id="sh" x="-20%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <g filter="url(#sh)">
    <rect x="0" y="0" width="${w}" height="${h}" rx="10" fill="#12151a" fill-opacity="0.94"/>
    ${numW ? `<path d="M10,0 H${numW} V${h} H10 A10,10 0 0 1 0,${h - 10} V10 A10,10 0 0 1 10,0 Z" fill="${spec.accent}"/>` : ''}
  </g>
  ${
    numW
      ? `<text x="${numW / 2}" y="${h / 2}" font-family='${FONT}' font-size="${NUM_SIZE}" font-weight="700"
        fill="#ffffff" text-anchor="middle" dominant-baseline="central">${num}</text>`
      : ''
  }
  <text x="${numW + PAD}" y="${h / 2}" font-family='${FONT}' font-size="${LABEL_SIZE}" font-weight="700"
    fill="#ffffff" dominant-baseline="central">${esc(spec.label)}</text>
</svg>`;
}

/** 완성된 썸네일 위에 띠를 얹는다. 입력은 이미 1280x720 으로 맞춰진 이미지여야 한다. */
export async function compositeStrip(image: Sharp, spec: StripSpec, canvasW: number, canvasH: number): Promise<Sharp> {
  const box = await stripBox(spec, canvasW, canvasH);
  const svg = Buffer.from(stripSvg(spec, box), 'utf8');
  // ★density 는 반드시 72★ sharp 의 SVG 렌더는 density/72 배로 확대한다. 기본값인 줄 알고
  // 96 을 넘겼더니 480x88 로 선언한 띠가 640x117 로 나왔다 — 좌표는 그대로 두고 그림만
  // 1.33배가 되니 자리도 크기도 어긋난다. 재서 확인했다(72 → 정확히 선언한 크기).
  const png = await sharp(svg, { density: 72 }).png().toBuffer();
  const layer: OverlayOptions = { input: png, left: box.left, top: box.top };
  return image.composite([layer]);
}
