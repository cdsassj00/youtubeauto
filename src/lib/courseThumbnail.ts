/**
 * 강의 썸네일을 코드로 그린다 — 배경은 그 강의의 실제 화면.
 *
 * ★왜 다시 만드는가★ 지금까지는 gpt-image 가 인물과 클립아트(자물쇠·로켓·퍼즐)를 그렸다.
 * 같은 분야에서 잘 되는 채널들을 실제로 훑어보니 클립아트를 쓰는 곳이 하나도 없었다.
 * 조코딩은 자동매매 앱 화면을, 코딩애플은 크롬이 받은 파일(weights.bin 2.3GB) 스크린샷을,
 * 노마드코더는 문제의 UI 자체를 깐다. 클립아트는 "무엇을 배우는 영상인지"를 못 알려준다 —
 * 자물쇠는 보안 영상에도 배포 영상에도 그릴 수 있기 때문이다.
 *
 * ★전체 화면을 그대로 깔면 안 된다★ 목록에서 썸네일은 가로 320px 안팎으로 줄어든다.
 * 엑셀 시트 한 장을 통째로 넣으면 그 크기에서는 회색 격자무늬로 뭉개진다. 그래서 한
 * 부분을 크게 잘라 쓴다 — 코딩애플이 파일 아이콘 하나를 화면 절반으로 키운 것과 같다.
 *
 * ★강의 녹화에는 자막이 박혀 있다★ 하단에 흰 글씨 자막 띠가, 우상단에 웹캠이 있다.
 * 그대로 쓰면 우리 글씨와 겹쳐 지저분해진다. 잘라낼 영역을 기본값으로 정해 둔다.
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

const W = 1280;
const H = 720;
// ★속성값 안에서는 작은따옴표를 쓴다★ 큰따옴표로 감싼 font-family 안에 큰따옴표가
// 들어가면 그 자리에서 속성이 끝나 버려 SVG 파싱이 통째로 깨진다.
const FONT = "Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 한글은 글자당 폭이 거의 1em, 라틴·숫자는 그 절반쯤. 글자 크기를 폭에 맞출 때 쓴다. */
const widthUnits = (s: string) =>
  [...s].reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 1 : /[A-Za-z0-9%$+.,]/.test(ch) ? 0.56 : 0.4), 0);

function fitSize(text: string, maxWidth: number, max: number, min: number): number {
  const u = widthUnits(text) || 1;
  return Math.max(min, Math.min(max, Math.floor(maxWidth / u)));
}

/**
 * 배경으로 쓸 화면 한 조각을 만든다.
 *
 * ★기본 크롭 영역을 왜 이렇게 잡았나★ 강의 녹화는 위쪽에 프로그램 메뉴 띠, 아래쪽에
 * 자막 띠, 오른쪽 위에 웹캠이 있다. 가운데 왼쪽을 크게 잘라 쓰면 셋 다 피하면서
 * 내용(표·코드)만 남는다. 특정 회차에서 어긋나면 crop 으로 직접 넘긴다.
 */
async function screenPlate(
  framePath: string,
  crop?: { left: number; top: number; width: number; height: number },
  cropVariant = 0,
  dim = 0.5,
): Promise<Buffer> {
  const meta = await sharp(framePath).metadata();
  const fw = meta.width ?? 1920;
  const fh = meta.height ?? 1080;
  // ★잘라 오는 자리도 편마다 바꾼다★ 늘 같은 데를 잘라 오면 강의가 달라도 배경이 비슷해
  // 보인다. 셋 다 메뉴 띠·자막 띠·웹캠을 피하되, 넓게/좁게/오른쪽으로 서로 다르게 잡는다.
  const BOXES = [
    { l: 0.02, t: 0.12, w: 0.68, h: 0.62 }, // 왼쪽 넓게
    { l: 0.18, t: 0.2, w: 0.46, h: 0.42 }, // 가운데 바짝 당겨서
    { l: 0.34, t: 0.1, w: 0.58, h: 0.56 }, // 오른쪽으로 옮겨서
  ];
  const b = BOXES[((cropVariant ?? 0) % BOXES.length + BOXES.length) % BOXES.length];
  const box = crop ?? {
    left: Math.round(fw * b.l),
    top: Math.round(fh * b.t),
    width: Math.round(fw * b.w),
    height: Math.round(fh * b.h),
  };
  // ★어둡게 깐다★ 엑셀 화면은 거의 흰색이라 그 위에 흰 글씨를 얹으면 사라진다. 목록
  // 크기(가로 320px)에서 시청자가 셀 값을 읽는 것도 아니다 — "표를 다루는 영상이구나"만
  // 전달되면 되므로, 밝기를 절반으로 낮추고 채도를 살짝 올려 배경으로 만든다.
  return sharp(framePath)
    .extract({
      left: Math.max(0, Math.min(box.left, fw - 2)),
      top: Math.max(0, Math.min(box.top, fh - 2)),
      width: Math.max(2, Math.min(box.width, fw - box.left)),
      height: Math.max(2, Math.min(box.height, fh - box.top)),
    })
    .resize(W, H, { fit: 'cover', position: 'left top' })
    .modulate({ brightness: dim, saturation: 1.15 })
    .toBuffer();
}

/**
 * 판을 짜는 방식. 편마다 돌려 가며 쓴다.
 *
 * ★같은 틀이 스물일곱 번 반복되면 목록에서 한 덩어리로 뭉친다★ 배경·문구가 달라도
 * 글씨 자리·인물 자리·띠 자리가 늘 같으면 눈은 "아까 본 것"으로 처리하고 지나간다.
 * 그래서 실루엣 자체가 다른 넷을 두고 돌린다. 시리즈 표식(왼쪽 아래 띠)만 고정으로
 * 남겨 두어 "이 채널 것"이라는 인식은 유지한다.
 */
export type CourseThumbLayout = 'screen' | 'bare' | 'band' | 'boxed';

export interface CourseThumbOpts {
  /** 배경으로 쓸 강의 화면(프레임 png). */
  framePath: string;
  /** 큰 글씨. 가운뎃점·줄바꿈으로 두 줄까지 나눈다. 한 줄 9자 이내를 권한다. */
  headline: string;
  /** 시리즈 고정 띠(왼쪽 아래). */
  strip?: string;
  /** 강조할 짧은 값 — 숫자가 있으면 여기 넣는다(예: "2.3GB", "10만 줄"). */
  badge?: string;
  /** 인물 사진(원형 인서트). 없으면 안 넣는다. */
  presenterPath?: string;
  /** 그날의 강조색. */
  accent?: string;
  crop?: { left: number; top: number; width: number; height: number };
  /** 배경에서 잘라 올 자리(0·1·2). 편마다 바꿔 배경이 닮아 보이지 않게 한다. */
  cropVariant?: number;
  layout?: CourseThumbLayout;
  outPath: string;
}

export async function drawCourseThumbnail(opts: CourseThumbOpts): Promise<void> {
  const { framePath, headline, strip = '', badge = '', presenterPath, crop, outPath } = opts;
  const layout: CourseThumbLayout = opts.layout ?? 'screen';
  const ACC = /^#[0-9a-f]{6}$/i.test(opts.accent ?? '') ? opts.accent! : '#ffd400';

  // band 는 강조색 판 위에 글씨를 얹으므로 배경을 덜 어둡게 해도 읽힌다.
  const plate = await screenPlate(framePath, crop, opts.cropVariant ?? 0, layout === 'band' ? 0.62 : 0.5);

  const lines = headline
    .split(/\s*[·\n]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

  // ★크기가 곧 임팩트다★ 처음엔 760px 폭에 132px 상한으로 잡았는데, 목록 크기로 줄여
  // 지금 쓰는 썸네일과 나란히 놓아 보니 확연히 약했다. 배경을 실제 화면으로 바꾸는 것과
  // 글씨가 작아지는 것은 별개의 문제다 — 지금 것의 장점(굵고 큰 글씨)은 그대로 가져간다.
  // ★인물 원이 앉는 자리는 비워 둔다★ 원은 지름 268 로 오른쪽 아래에 앉는다. 글씨 폭을
  // 화면 폭에 맞춰 잡으면 긴 문구의 끝 글자가 원 뒤로 들어간다 — 실제로 band 에서 "설계"
  // 의 끝이 잘렸다. 인물이 있는 판은 원 왼쪽까지만 쓴다.
  const MAXW: Record<CourseThumbLayout, number> = { screen: 940, bare: 1150, band: 900, boxed: 740 };
  const CAP: Record<CourseThumbLayout, number> = { screen: 158, bare: 176, band: 150, boxed: 132 };
  const maxW = MAXW[layout];
  const cap = CAP[layout];
  const plain = (t: string) => t.replace(/\*\*/g, '');
  const size = Math.min(...lines.map((l) => fitSize(plain(l), maxW, cap, 64)));
  const lineH = Math.round(size * 1.06);
  const blockH = (lines.length - 1) * lineH;

  // ★글씨가 놓이는 자리는 반드시 어둡게 깐다★ 엑셀 화면은 거의 흰색이라 흰 글씨가
  // 그냥 사라진다. 흰 글씨에 검은 테두리를 두르는 방법도 있지만 목록 크기에서 지저분하다.
  // 글씨가 앉을 만큼만 어두운 판을 깔고 그 위에 쓴다 — 화면은 여전히 보인다.
  //
  // ★bare·boxed 는 아래/오른쪽에서부터 쌓는다★ 위에서부터 잡으면 두 줄짜리 문구의 둘째
  // 줄이 화면 밖으로 나간다(실제로 그렇게 잘렸다).
  const stripY = H - 64;
  const bandTop = Math.round(H * 0.28);
  const bandH = blockH + size + 96;

  let textX = 56;
  let anchor: 'start' | 'end' = 'start';
  let textTop = 250;
  let textFill = '#ffffff';
  let strokeW = Math.round(size * 0.1);
  let spanFill = ACC;
  let scrim: string;
  let presenterAt: 'br' | 'bl' | 'none' = presenterPath ? 'br' : 'none';

  if (layout === 'bare') {
    textTop = H - 176 - blockH;
    presenterAt = 'none';
    scrim = `<rect x="0" y="0" width="${W}" height="${H}" fill="#05070d" opacity=".34"/>
<rect x="0" y="${H - 300}" width="${W}" height="300" fill="url(#veil)"/>`;
  } else if (layout === 'band') {
    // ★강조색 판을 가로로 지른다★ 어두운 판에 흰 글씨만 쓰던 것과 실루엣이 가장 크게
    // 다르다. 글씨는 판 위에 검게 얹어 대비를 뒤집는다.
    textTop = bandTop + size + 34;
    textFill = '#0a0f18';
    strokeW = 0;
    spanFill = '#ffffff';
    scrim = `<rect x="0" y="0" width="${W}" height="${H}" fill="#05070d" opacity=".2"/>
<rect x="0" y="${bandTop}" width="${W}" height="${bandH}" fill="${ACC}"/>`;
  } else if (layout === 'boxed') {
    // ★좌우를 뒤집는다★ 글씨가 오른쪽, 인물이 왼쪽. 배경 화면은 왼쪽에서 그대로 보인다.
    textX = W - 56;
    anchor = 'end';
    textTop = 268;
    presenterAt = presenterPath ? 'bl' : 'none';
    scrim = `<rect x="0" y="0" width="${W}" height="${H}" fill="#05070d" opacity=".2"/>
<rect x="${Math.round(W * 0.34)}" y="0" width="${Math.round(W * 0.66)}" height="${H}" fill="url(#rside)"/>`;
  } else {
    scrim = `<rect x="0" y="0" width="${W}" height="${H}" fill="#05070d" opacity=".22"/>
<rect x="0" y="0" width="${Math.round(W * 0.68)}" height="${H}" fill="url(#side)"/>`;
  }

  // 배지 자리는 글씨 블록을 기준으로 잡는다 — 판마다 글씨가 다른 높이에 있다.
  const badgeY = layout === 'bare' || layout === 'band' ? textTop - size - 96 : textTop + blockH + 34;
  const badgeSize = badge ? fitSize(badge, 300, 74, 40) : 0;
  const badgeW = badge ? Math.round(badgeSize * widthUnits(badge) + 52) : 0;
  const badgeX = anchor === 'end' ? textX - badgeW : textX;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#05070d" stop-opacity=".92"/>
    <stop offset=".62" stop-color="#05070d" stop-opacity=".78"/>
    <stop offset="1" stop-color="#05070d" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="rside" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#05070d" stop-opacity="0"/>
    <stop offset=".38" stop-color="#05070d" stop-opacity=".82"/>
    <stop offset="1" stop-color="#05070d" stop-opacity=".94"/>
  </linearGradient>
  <filter id="ts" x="-12%" y="-30%" width="130%" height="180%">
    <feDropShadow dx="0" dy="5" stdDeviation="10" flood-color="#03050a" flood-opacity=".92"/>
  </filter>
  <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#05070d" stop-opacity="0"/>
    <stop offset="1" stop-color="#05070d" stop-opacity=".93"/>
  </linearGradient>
</defs>
${scrim}
${
  // 시리즈 세로 띠. band 는 강조색 판이 이미 그 구실을 해서 겹치면 지저분하다.
  layout === 'band'
    ? ''
    : `<rect x="${anchor === 'end' ? W - 14 : 0}" y="0" width="14" height="${H}" fill="${ACC}"/>`
}
${lines
  .map((l, i) => {
    // **강조** 로 감싼 조각만 다른 색으로 칠한다. 지금 쓰는 썸네일이 한 낱말만 노랗게
    // 하는데, 그게 "어디를 읽어야 하는지"를 0.2초에 알려 준다.
    const spans = l
      .split(/(\*\*[^*]+\*\*)/)
      .filter(Boolean)
      .map((p) =>
        p.startsWith('**')
          ? `<tspan fill="${spanFill}">${esc(p.slice(2, -2))}</tspan>`
          : `<tspan>${esc(p)}</tspan>`,
      )
      .join('');
    // ★테두리를 두른다★ 배경이 실제 화면이라 자리마다 밝기가 다르다. 그림자만으로는
    // 밝은 셀 위에서 글자가 묻힌다. paint-order 로 테두리를 글자 뒤에 깔면 어디에 놓여도 읽힌다.
    const ink = strokeW
      ? ` filter="url(#ts)" stroke="#05070d" stroke-width="${strokeW}" paint-order="stroke" stroke-linejoin="round"`
      : '';
    // ★xml:space="preserve" 가 없으면 강조 경계의 띄어쓰기가 사라진다★ **AI가** 알아서 를
    // tspan 둘로 쪼개면 두 번째 조각의 앞 공백을 XML 이 지워 "AI가알아서" 로 붙어 나온다.
    // 글자가 큰 자리라 붙은 것이 바로 보인다.
    return `<text xml:space="preserve" x="${textX}" y="${textTop + i * lineH}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="900" letter-spacing="-3" fill="${textFill}"${ink}>${spans}</text>`;
  })
  .join('\n')}
${
  badge
    ? `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeSize + 30}" rx="12" fill="${layout === 'band' ? '#0a0f18' : ACC}"/>
<text x="${badgeX + badgeW / 2}" y="${badgeY + badgeSize + 8}" font-family="${FONT}" font-size="${badgeSize}" font-weight="900" fill="${layout === 'band' ? ACC : '#0a0f18'}" text-anchor="middle">${esc(badge)}</text>`
    : ''
}
${
  strip
    ? `<rect x="0" y="${stripY}" width="${Math.round(28 + 26 * widthUnits(strip))}" height="52" fill="#05070d" opacity=".8"/>
<text x="18" y="${stripY + 36}" font-family="${FONT}" font-size="26" font-weight="bold" fill="#e7ecf5" opacity=".9">${esc(strip)}</text>`
    : ''
}
</svg>`;

  const layers: OverlayOptions[] = [{ input: Buffer.from(svg) }];

  // 인물은 동그랗게 잘라 오른쪽 아래에 얹는다. 배경 제거(누끼)가 없어도 자연스럽고,
  // 얼굴이 있으면 클릭률이 오른다는 것이 여러 자료의 공통된 이야기다.
  if (presenterPath && presenterAt !== 'none') {
    const R = 268;
    const circle = Buffer.from(`<svg width="${R}" height="${R}"><circle cx="${R / 2}" cy="${R / 2}" r="${R / 2}" fill="#fff"/></svg>`);
    const face = await sharp(presenterPath)
      // ★position:'top' 은 얼굴이 아니라 머리 위 선반을 잘랐다★ 세로로 긴 사진에서
      // 위쪽 정사각형은 배경일 때가 많다. sharp 가 눈에 띄는 영역을 찾아 자르게 한다.
      .resize(R, R, { fit: 'cover', position: sharp.strategy.attention })
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toBuffer();
    const ring = Buffer.from(
      `<svg width="${R + 16}" height="${R + 16}"><circle cx="${(R + 16) / 2}" cy="${(R + 16) / 2}" r="${R / 2 + 5}" fill="none" stroke="${ACC}" stroke-width="8"/></svg>`,
    );
    // 시리즈 띠가 왼쪽 아래에 있으므로, 인물이 왼쪽으로 갈 때는 띠를 피해 살짝 올린다.
    const px = presenterAt === 'bl' ? 46 : W - R - 46;
    const py = presenterAt === 'bl' ? H - R - 86 : H - R - 46;
    layers.push({ input: face, left: px, top: py });
    layers.push({ input: ring, left: px - 8, top: py - 8 });
  }

  if (process.env.COURSE_THUMB_DEBUG) await fs.writeFile(`${outPath}.svg`, svg, 'utf8');
  const png = await sharp(plate).composite(layers).jpeg({ quality: 90 }).toBuffer();
  await fs.writeFile(outPath, png);
}
