/**
 * 쇼츠 컷의 배경을 코드로 그린다 — 스톡이 없거나, 스톡보다 나을 때.
 *
 * ★스톡만으로는 안 된다★ "slow ocean waves" 같은 말로 받아 오는 영상은 어느 채널에나
 * 있는 그림이라 금방 흔해 보이고, 구체적인 말일수록 검색이 빈다. 코드로 그리면 공짜이고,
 * 회차마다 다르게 나오며, 무엇보다 글씨가 반드시 읽힌다 — 밝기를 우리가 정하기 때문이다.
 *
 * ★세 가지를 둔 이유★ 한 가지로 스물일곱 편을 만들면 썸네일에서 겪은 일이 그대로 반복된다.
 * 결이 서로 다른 셋을 두고 컷마다 돌린다.
 *   sketch — 손으로 그린 듯한 선과 동그라미. 생각을 풀어 가는 결이라 책·개념에 맞는다.
 *   vector — 크고 납작한 도형. 멀리서도 형태가 읽혀 첫 컷에 세다.
 *   grid   — 격자와 빛나는 점. 도구·자동화 쪽 이야기에 맞는다.
 *
 * ★같은 글이면 같은 그림이 나온다★ 글에서 씨앗을 뽑아 쓰므로, 다시 돌려도 같은 배경이
 * 나온다. 한 편을 다시 만들 때 그림이 통째로 바뀌면 무엇을 고쳤는지 알 수 없다.
 */
import sharp from 'sharp';
import { SHORT_W, SHORT_H } from './shortRender.js';

export type BackdropStyle = 'sketch' | 'vector' | 'grid';
export const BACKDROP_STYLES: BackdropStyle[] = ['sketch', 'vector', 'grid'];

/** 글에서 뽑은 씨앗 — 같은 글이면 같은 그림. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 씨앗에서 0~1 을 뽑는 작은 난수. Math.random 을 쓰면 돌릴 때마다 그림이 바뀐다. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 손으로 그은 듯 떨리는 선. 점을 여럿 찍고 조금씩 흔든다. */
function wobbleLine(x1: number, y1: number, x2: number, y2: number, r: () => number, amp = 10): string {
  const steps = 8;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const jx = i === 0 || i === steps ? 0 : (r() - 0.5) * amp * 2;
    const jy = i === 0 || i === steps ? 0 : (r() - 0.5) * amp * 2;
    pts.push(`${(x1 + (x2 - x1) * t + jx).toFixed(1)},${(y1 + (y2 - y1) * t + jy).toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}" fill="none"/>`;
}

/** 손으로 그린 동그라미 — 반지름을 각도마다 흔든다. */
function wobbleCircle(cx: number, cy: number, rad: number, r: () => number, amp = 0.06): string {
  const steps = 26;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = rad * (1 + (r() - 0.5) * amp * 2);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}" fill="none"/>`;
}

export function backdropSvg(style: BackdropStyle, text: string, accent: string): string {
  const r = rng(seedFrom(text + style));
  const W = SHORT_W;
  const H = SHORT_H;

  if (style === 'sketch') {
    // ★선은 화면 가장자리에 둔다★ 가운데는 글씨 자리라, 거기에 그림이 있으면 둘 다 안 읽힌다.
    const marks: string[] = [];
    for (let i = 0; i < 7; i++) {
      const top = r() < 0.5;
      const cy = top ? 180 + r() * 420 : H - 180 - r() * 420;
      const cx = 120 + r() * (W - 240);
      if (r() < 0.45) marks.push(wobbleCircle(cx, cy, 70 + r() * 130, r));
      else {
        const len = 180 + r() * 360;
        const a = (r() - 0.5) * 1.2;
        marks.push(wobbleLine(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, r));
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#0b0e14"/>
<g stroke="#2b3444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${marks.join('')}</g>
<g stroke="${accent}" stroke-width="6" stroke-linecap="round" opacity=".5">${wobbleCircle(W * (0.2 + r() * 0.6), H * (0.16 + r() * 0.12), 90 + r() * 70, r)}</g>
</svg>`;
  }

  if (style === 'vector') {
    // 큰 납작한 도형 몇 개. 멀리서도 형태가 읽힌다.
    const shapes: string[] = [];
    const palette = ['#162033', '#1b2942', '#101826'];
    for (let i = 0; i < 5; i++) {
      const fill = palette[Math.floor(r() * palette.length)];
      const top = r() < 0.5;
      const y = top ? -120 + r() * 560 : H - 560 + r() * 560;
      const x = -160 + r() * (W + 160);
      const s = 260 + r() * 420;
      shapes.push(
        r() < 0.5
          ? `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(s / 2).toFixed(0)}" fill="${fill}"/>`
          : `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(0)}" height="${(s * 0.7).toFixed(0)}" rx="40" fill="${fill}" transform="rotate(${((r() - 0.5) * 40).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`,
      );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#070b12"/>
${shapes.join('')}
<circle cx="${(W * (0.15 + r() * 0.7)).toFixed(0)}" cy="${(H * (0.12 + r() * 0.1)).toFixed(0)}" r="${(70 + r() * 60).toFixed(0)}" fill="${accent}" opacity=".5"/>
</svg>`;
  }

  // grid — 격자와 빛나는 점.
  const dots: string[] = [];
  for (let i = 0; i < 16; i++) {
    const x = 60 + r() * (W - 120);
    const y = 100 + r() * (H - 200);
    const on = r() < 0.3;
    dots.push(
      `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(on ? 10 : 6).toFixed(0)}" fill="${on ? accent : '#2a3champ'}" opacity="${on ? 0.8 : 0.45}"/>`.replace(
        '#2a3champ',
        '#2a3448',
      ),
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><pattern id="g" width="90" height="90" patternUnits="userSpaceOnUse">
<path d="M90 0H0V90" fill="none" stroke="#161d2b" stroke-width="2"/></pattern></defs>
<rect width="${W}" height="${H}" fill="#070a10"/>
<rect width="${W}" height="${H}" fill="url(#g)"/>
${dots.join('')}
</svg>`;
}

/** 배경 한 장을 png 로 굽는다. */
export async function drawBackdrop(
  style: BackdropStyle,
  text: string,
  accent: string,
  outPath: string,
): Promise<string> {
  await sharp(Buffer.from(backdropSvg(style, text, accent))).png().toFile(outPath);
  return outPath;
}
