import sharp, { type OverlayOptions } from 'sharp';

/**
 * 컷아웃 스크랩 — 흰 배경 판화 그림을 "가위로 오린 종이 조각"으로 바꾼다.
 *
 * VOX 스타일 영상의 핵심 소재다. 판화가 종이 위에 붙은 스크랩처럼 보이려면 세 가지가 필요하다:
 *   1) 흰 배경이 투명해야 한다      — 안 그러면 종이 배경 위에 흰 사각형이 얹힌다
 *   2) 잉크 주위에 흰 종이 테두리   — 가위로 오려낸 자국. 이게 없으면 그냥 합성처럼 보인다
 *   3) 그 아래 옅은 그림자          — 종이가 배경 위에 "놓여" 있다는 느낌
 *
 * ★키잉 방식★
 * 크로마키가 아니라 밝기를 그대로 알파로 쓴다(alpha = 255 - 밝기).
 * 판화는 검은 선과 흰 여백뿐이라 이 방법이 잘 맞는다. 게다가 중간 회색이 반투명으로
 * 남아서 해칭(빗금)의 부드러운 경계가 그대로 살아난다 — 임계값으로 자르면 계단처럼
 * 깨진다. 잉크가 종이에 스민 느낌을 얻으려면 이쪽이 맞다.
 */

export interface CutoutOptions {
  /** 종이 테두리 두께(px). 0 이면 테두리 없이 잉크만. */
  border?: number;
  /** 그림자 세기 0~1. 0 이면 그림자 없음. */
  shadow?: number;
  /** 결과 가로 픽셀. 세로는 비율 유지. */
  width?: number;
}

/**
 * 흰 배경 그림 → 투명 배경 + 종이 테두리 + 그림자가 붙은 PNG 버퍼.
 * 실패하면 예외를 던진다(호출부가 씬 단위로 잡아 건너뛴다).
 */
export async function makeCutout(input: Buffer, opts: CutoutOptions = {}): Promise<Buffer> {
  const border = opts.border ?? 14;
  const shadow = opts.shadow ?? 0.28;
  const width = opts.width ?? 1000;

  // 원본을 목표 크기로 줄이고 회색조 raw 픽셀을 얻는다.
  const base = sharp(input).resize({ width, withoutEnlargement: true }).removeAlpha();
  const { data, info } = await base.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // 밝기를 알파로 뒤집는다. 흰 종이(255) → 0, 검은 잉크(0) → 255.
  const ink = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = 255 - data[i];

  // 테두리용 실루엣 — "물체 하나가 종이 한 장 위에 얹혀 있다"로 보여야 한다.
  //
  // 잉크를 조금만 번지게 하면 선마다 따로 후광이 생기고 안쪽이 뚫려서, 종이에 붙인 게
  // 아니라 그냥 합성한 것처럼 보인다(실제로 그렇게 나왔다). 그래서 두 마스크를 합친다:
  //   merge — 크게 번지게 해 선 사이를 메운 덩어리(안쪽을 채운다)
  //   edge  — 작게 번지게 한 윤곽(가장자리를 물체 모양에 붙잡아 둔다)
  // 둘 중 밝은 쪽(lighten)을 쓰면 안은 채워지면서 외곽선은 뭉개지지 않는다.
  const rawMask = { raw: { width: W, height: H, channels: 1 } } as const;
  let silhouette: Buffer | null = null;
  if (border > 0) {
    // 번짐 반경은 이미지 크기에 비례해야 한다 — 고정값이면 큰 그림에서 선 사이를 못 메운다.
    const mergeRadius = Math.max(border * 2, Math.round(W / 36));
    // linear 의 기울기를 가파르게 둬야 종이 가장자리가 '가위로 자른 자국'처럼 또렷해진다.
    // 완만하면 빛 번짐(글로우)처럼 보여서 종이가 아니라 후광이 된다. 다만 완전한 이진화는
    // 계단이 생기므로, 1~2px 정도만 부드럽게 남도록 기울기만 세운다.
    //
    // ★기울기를 한 번 더 세웠다★ 테스트 렌더에서 겨자색 종이 위에 얹어보니 22/-120 은
    // 여전히 종이가 아니라 흰 후광으로 보였다. 전이대(알파 0→255 구간)의 폭이 문제다:
    //   22/-120 → 원본값 5.5~17 (폭 11.5) : 넓어서 뿌옇게 번진다
    //   60/-330 → 원본값 5.5~9.8 (폭 4.3) : 자른 자국처럼 또렷하다
    // 임계값 자체는 낮게 유지해야(≈5.5) 실루엣이 잉크 바깥으로 충분히 부풀어 종이가 된다.
    const merge = await sharp(ink, rawMask).blur(mergeRadius).linear(60, -330).png().toBuffer();
    const edge = await sharp(ink, rawMask).blur(border / 2).linear(40, -360).png().toBuffer();
    silhouette = await sharp(merge)
      .composite([{ input: edge, blend: 'lighten' }])
      .png()
      .toBuffer();
  }

  const layers: OverlayOptions[] = [];

  // 1) 그림자 — 실루엣을 더 크게 번지게 해서 아래에 깐다.
  if (silhouette && shadow > 0) {
    const shadowMask = await sharp(silhouette).blur(border).linear(shadow, 0).toBuffer();
    const shadowLayer = await sharp({
      create: { width: W, height: H, channels: 3, background: '#3a3226' },
    })
      .png()
      .toBuffer();
    layers.push({
      input: await applyMask(shadowLayer, shadowMask, W, H),
      left: Math.round(border * 0.35),
      top: Math.round(border * 0.5),
    });
  }

  // 2) 흰 종이 조각
  if (silhouette) {
    const paper = await sharp({ create: { width: W, height: H, channels: 3, background: '#fdfcf7' } })
      .png()
      .toBuffer();
    layers.push({ input: await applyMask(paper, silhouette, W, H), left: 0, top: 0 });
  }

  // 3) 잉크 — 원본 색을 유지하되 알파만 갈아끼운다(해칭 계조 보존).
  const rgb = await base.clone().png().toBuffer();
  layers.push({ input: await applyMask(rgb, ink, W, H, true), left: 0, top: 0 });

  // 그림자가 오른쪽/아래로 밀리므로 캔버스를 조금 키워 잘리지 않게 한다.
  const pad = Math.ceil(border * 1.2);
  return sharp({
    create: { width: W + pad, height: H + pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

/** RGB 이미지에 1채널 마스크를 알파로 붙인다. */
async function applyMask(
  rgb: Buffer,
  mask: Buffer,
  W: number,
  H: number,
  maskIsRaw = false,
): Promise<Buffer> {
  const alpha = maskIsRaw
    ? await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
    : await sharp(mask).resize(W, H, { fit: 'fill' }).png().toBuffer();
  return sharp(rgb)
    .resize(W, H, { fit: 'fill' })
    .ensureAlpha()
    .joinChannel(await sharp(alpha).greyscale().raw().toBuffer(), {
      raw: { width: W, height: H, channels: 1 },
    })
    .png()
    .toBuffer();
}

/**
 * 판화 컷아웃용 이미지 프롬프트.
 *
 * 키잉이 깨끗하려면 배경이 "완전한 흰색 단색"이어야 한다 — 그림자·질감·테두리·액자가
 * 조금이라도 있으면 그게 전부 잉크로 오인돼 지저분한 조각이 나온다. 그래서 배경 조건을
 * 여러 번 반복해서 못박는다.
 */
export function engravingPrompt(subject: string): string {
  return [
    // ★기법과 시대를 반드시 분리한다★
    // "19세기 판화"라고만 하면 모델이 소재까지 그 시대로 옮긴다 — 실제로 현대 엔지니어를
    // 프록코트 입은 빅토리아 시대 신사로 그렸다. 빌려오는 건 "그리는 방식"뿐이고,
    // 무엇을 그리는지는 대본이 정한다. 그래서 아래 두 줄을 앞에 세워 못박는다.
    'Rendering technique only: vintage steel-engraving / etching style — pure black ink line work,',
    'fine cross-hatching and stippling for shading, high contrast, monochrome, no color whatsoever.',
    `Subject: ${subject}.`,
    'CRITICAL: depict the subject exactly as it is in the present day. Do NOT make the subject look antique or historical.',
    'Modern equipment stays modern, modern clothing stays modern (contemporary shirts, jeans, hoodies, lab coats, sneakers) —',
    'no Victorian dress, no top hats, no frock coats, no period costume, no old-fashioned machinery unless the subject itself says so.',
    'Only the drawing technique is vintage; the thing being drawn is current.',
    // 아래 세 줄이 키잉 품질을 좌우한다.
    'The background must be completely blank pure white (#FFFFFF) — absolutely no background scenery,',
    'no vignette, no paper texture, no drop shadow, no frame, no border, no ground line, no sky.',
    'The single subject is isolated and centered with generous empty white space around it, like a cut-out catalogue illustration.',
    'No text, no letters, no numbers, no captions, no signature, no watermark anywhere.',
  ].join(' ');
}
