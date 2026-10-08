/**
 * 책 명언 쇼츠의 판 — 고정 제목 · 레터박스 그림 · 그림 위 자막 · 고정 꼬리말.
 *
 * ★잘 되고 있는 채널의 짜임새를 그대로 따른다★ 참고로 본 것은 @오늘의지혜 의 영상이고,
 * 가져온 것은 배치뿐이다(글·그림·목소리는 전부 우리 것). 왜 이 배치가 나은지는 분명하다.
 *
 *  · 제목이 영상 내내 위에 붙어 있다. 쇼츠는 중간에 들어오는 사람이 많은데, 첫 컷에만
 *    훅을 띄우면 그 사람들은 무슨 영상인지 모른 채 넘긴다.
 *  · 그림을 꽉 채우지 않고 가운데 띠로 둔다. 꽉 채우면 가로가 잘려 그림이 망가진다 —
 *    돈을 들여 뽑은 그림이면 온전히 보여 주는 쪽이 맞다.
 *  · 자막은 그림 위 아래쪽에 얹는다. 글만 큰 화면은 읽히지만 볼 것이 없고, 그림만 있으면
 *    소리를 끄고 보는 사람이 내용을 못 따라온다.
 *  · 꼬리말이 늘 같은 자리에 있어 채널이 기억된다.
 */
import { SHORT_W, SHORT_H } from './shortRender.js';

const FONT = "Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif";
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const widthUnits = (s: string) =>
  [...s].reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 1 : /[A-Za-z0-9%$+.,]/.test(ch) ? 0.56 : 0.4), 0);

/**
 * 그림 띠가 앉는 자리.
 *
 * ★아래쪽은 유튜브가 덮는다★ 쇼츠 화면 아래 450px 쯤은 채널명·설명·버튼이 올라앉는다.
 * 그렇다고 띠를 너무 올리면 그림 아래로 검은 여백이 크게 남아 허전해진다(처음 470 으로
 * 잡았더니 640px 이 비었다). 꼬리말까지 넣고 UI 를 피하는 선이 여기다.
 */
export const BAND_TOP = 540;
export const BAND_H = Math.round((SHORT_W * 3) / 4); // 4:3 그림 그대로
export const BAND_BOTTOM = BAND_TOP + BAND_H;

function textBlock(
  text: string,
  opts: { cx: number; baseline: number; maxW: number; cap: number; min: number; accent: string; stroke: number; up?: boolean },
): string {
  const lines = text
    .split(/\s*\n\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const plain = (t: string) => t.replace(/\*\*/g, '');
  const size = Math.min(
    ...lines.map((l) => Math.max(opts.min, Math.min(opts.cap, Math.floor(opts.maxW / (widthUnits(plain(l)) || 1))))),
  );
  const lineH = Math.round(size * 1.22);
  // up 이면 baseline 이 마지막 줄 — 아래에서 위로 쌓는다.
  const first = opts.up ? opts.baseline - (lines.length - 1) * lineH : opts.baseline;
  return lines
    .map((l, i) => {
      const spans = l
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map((p) =>
          p.startsWith('**')
            ? `<tspan fill="${opts.accent}">${esc(p.slice(2, -2))}</tspan>`
            : `<tspan>${esc(p)}</tspan>`,
        )
        .join('');
      // 강조 경계의 띄어쓰기가 사라지지 않게 한다(썸네일에서 실제로 겪었다).
      return `<text xml:space="preserve" x="${opts.cx}" y="${first + i * lineH}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="900" letter-spacing="-2" fill="#ffffff" stroke="#000000" stroke-width="${opts.stroke}" paint-order="stroke" stroke-linejoin="round">${spans}</text>`;
    })
    .join('\n');
}

export interface WisdomFrameOpts {
  /** 영상 내내 위에 붙어 있는 제목. 두 줄. */
  title: string;
  /** 이 컷의 자막. 그림 위 아래쪽에 얹는다. 빈 문자열이면 안 넣는다. */
  caption: string;
  /** 늘 같은 자리에 있는 꼬리말. */
  footer: string;
  accent: string;
}

/** 그림 위에 덮을 글자판(투명). 그림 띠 안쪽은 비워 둬 그림이 보이게 한다. */
export function wisdomOverlaySvg(o: WisdomFrameOpts): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHORT_W}" height="${SHORT_H}">
<!-- 위아래 검은 띠. 그림 띠만 비워 둔다. -->
<rect x="0" y="0" width="${SHORT_W}" height="${BAND_TOP}" fill="#000000"/>
<rect x="0" y="${BAND_BOTTOM}" width="${SHORT_W}" height="${SHORT_H - BAND_BOTTOM}" fill="#000000"/>
${textBlock(o.title, { cx: SHORT_W / 2, baseline: BAND_TOP - 170, maxW: 940, cap: 96, min: 56, accent: o.accent, stroke: 0 })}
${
  o.caption
    ? // 자막은 그림 아래쪽에 얹는다. 그림 위라 테두리를 꼭 둘러야 읽힌다.
      textBlock(o.caption, {
        cx: SHORT_W / 2,
        baseline: BAND_BOTTOM - 64,
        maxW: 880,
        cap: 72,
        min: 46,
        accent: o.accent,
        stroke: 10,
        up: true,
      })
    : ''
}
<text x="${SHORT_W / 2}" y="${BAND_BOTTOM + 96}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="bold" fill="#c9d1de">${esc(o.footer)}</text>
</svg>`;
}
