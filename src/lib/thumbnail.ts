import fs from 'node:fs';
import fsp from 'node:fs/promises';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { config, PRESENTER_IMAGE_PATH } from '../config.js';
import { recordUsage } from './usage.js';
import { resolveThumbStyle, type ThumbStyle } from './thumbStyle.js';

const W = 1280;
const H = 720;

/**
 * gpt-image-1 로 유튜브 썸네일을 통째로 생성한다 (인물 + 손그림 도식 + 큰 한글 제목).
 *
 * 진행자(그린스크린) 사진을 레퍼런스로 넣어 인물을 깔끔히 오려 배치하고,
 * 주목성 높은 볼드 한글 제목과 개념 도식을 모델이 직접 그린다.
 * (레퍼런스 썸네일 스타일: 손그림 크림/칠판 배경 + 인물 포인팅 + 큰 한글 제목.)
 *
 * @returns 성공 여부. OPENAI_API_KEY 가 없으면 false (호출부에서 기본 썸네일로 폴백).
 */
export async function generateThumbnail(params: {
  title: string;
  topic: string;
  headline?: string; // 썸네일용 짧고 강한 문구(없으면 title 사용)
  /** 주체 배지 — 문구를 짧게 유지하는 대신 "무엇에 대한 영상인지"를 구석에 작게 박는다. */
  badge?: string;
  /** 여러 제품을 함께 다루는 회차용 — 배지 대신 제품 심볼을 한 줄로 나열한다. (예: 'ChatGPT, Claude, Gemini, Grok') */
  productIcons?: string;
  outPath: string;
  /** 파격 모드 — 사건형/충격 트렌드 뉴스일 때 긴장감 있는 강렬한 구도로. (기초 영상은 false 로 차분하게.) */
  dramatic?: boolean;
}): Promise<boolean> {
  const { title, topic, headline, badge, productIcons, outPath, dramatic = false } = params;
  const apiKey = config.openaiApiKey;
  if (!apiKey) return false;

  let presenter: Buffer | null = null;
  // 얼굴을 쓰지 않는 채널이면 사진을 아예 읽지 않는다(프롬프트도 인물 없는 구도로 바뀐다).
  if (!config.usePresenter) {
    console.log('  · 썸네일: 인물 합성 없음 (USE_PRESENTER 꺼짐)');
  } else if (config.presenterImageUrl) {
    const r = await fetch(config.presenterImageUrl);
    if (r.ok) presenter = Buffer.from(await r.arrayBuffer());
  } else if (fs.existsSync(PRESENTER_IMAGE_PATH)) {
    presenter = await fsp.readFile(PRESENTER_IMAGE_PATH);
  }

  const client = new OpenAI({ apiKey });
  // 매 생성마다 포즈·복장을 다르게 (얼굴/안경/헤어 정체성은 유지, 옷과 자세만 변주).
  const variation = pickVariation();
  // 스타일 프리셋(배경·글씨체·액센트 한 벌). 'auto' 면 회차마다 날짜 기준으로 회전한다.
  const thumbStyle = resolveThumbStyle(config.thumbnailStyle);
  console.log(`  · 썸네일 스타일: ${thumbStyle.label} / 인물 ${variation.mirror ? '좌' : '우'}측 배치`);
  const prompt = buildPrompt(headline?.trim() || title, topic, title, thumbStyle, Boolean(presenter), variation, dramatic, badge?.trim() || '', productIcons?.trim() || '');

  let b64: string | undefined;
  if (presenter) {
    const img = await toFile(presenter, 'presenter.png', { type: 'image/png' });
    const editParams: Record<string, unknown> = {
      model: config.openaiImageModel,
      image: img,
      prompt,
      size: '1536x864',
      quality: 'high',
    };
    // gpt-image-1 계열은 input_fidelity 로 얼굴 보존(없으면 딴사람으로 다시 그림).
    // gpt-image-2 는 이 파라미터를 받지 않으므로 제외.
    if (config.openaiImageModel.startsWith('gpt-image-1')) {
      editParams.input_fidelity = 'high';
    }
    const res = await client.images.edit(editParams as never);
    b64 = res.data?.[0]?.b64_json;
  } else {
    const res = await client.images.generate({
      model: config.openaiImageModel,
      prompt,
      size: '1536x864',
      quality: 'high',
    });
    b64 = res.data?.[0]?.b64_json;
  }
  if (!b64) return false;
  recordUsage({ kind: 'openai-image', step: 'thumbnail', model: config.openaiImageModel, images: 1 });

  // 16:9 (1280x720) 로 크롭·리사이즈.
  //
  // ★PNG 가 아니라 JPEG 로 쓴다★ 유튜브 썸네일 상한은 2MB 다. 칠판처럼 매끈한 그림은
  // PNG 로도 들어가지만, 종이 질감처럼 잔무늬가 많으면 같은 1280x720 인데도 그 선을
  // 넘어 업로드가 통째로 거부된다(실제로 겪었다 — "The provided image content is invalid").
  // 화질 차이는 사실상 없다: 유튜브는 어차피 받은 이미지를 JPEG 으로 다시 굽는다.
  const cropped = sharp(Buffer.from(b64, 'base64')).resize(W, H, { fit: 'cover', position: 'centre' });
  let buf = await cropped.clone().jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  // 재본 최악값이 1.4MB 라 q90 으로 넘칠 일은 사실상 없지만, 넘으면 조용히 거부당하는
  // 대신 화질을 조금 내려서라도 반드시 들어가게 한다.
  if (buf.length > 1.8 * 1024 * 1024) {
    buf = await cropped.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    console.log('  · 썸네일이 커서 화질을 낮춰 다시 인코딩했습니다');
  }
  await fsp.writeFile(outPath, buf);
  console.log(`  · 썸네일 파일: ${(buf.length / 1024).toFixed(0)}KB (유튜브 상한 2048KB)`);
  return true;
}

/** 매 생성마다 다른 포즈/복장을 고르기 위한 변주 목록. 정체성(얼굴·안경·헤어)은 건드리지 않는다. */
const OUTFITS = [
  'a crisp charcoal suit jacket over a white shirt (no tie)',
  'a smart navy blazer over a light knit sweater',
  'a clean black turtleneck',
  'a casual light-grey hoodie',
  'a denim shirt over a plain tee',
  'a beige cardigan over a white shirt',
  'a dark green bomber jacket over a tee',
  'a light-blue oxford shirt with rolled-up sleeves',
];
const POSES = [
  'one hand pointing toward the title/diagram (classic YouTube pose)',
  'both hands open in an explaining gesture, palms up',
  'one hand raised with a thumbs-up, the other relaxed',
  'arms crossed with a confident half-smile',
  'one hand touching his chin in a thoughtful "hmm" pose',
  'leaning slightly forward, one finger raised as if making a key point',
  'one hand near the head with a surprised, eyes-wide expression',
  'giving an OK sign with one hand, cheerful expression',
];

/**
 * 구도(레이아웃) 변주 — 인물 위치·크기와 제목 위치를 통째로 바꾼다.
 * 예전엔 "인물은 항상 오른쪽 가슴 위, 제목은 항상 왼쪽"으로 고정돼 매번 같은 그림이 나왔다.
 * badge 는 제목·인물과 겹치지 않는 모서리를 레이아웃마다 지정한다.
 */
const LAYOUTS = [
  {
    person: 'on the RIGHT side of the frame, from chest up, turned slightly toward the center',
    title: 'Place the Korean title block on the LEFT half, vertically centered.',
    symbol: 'Draw the single symbol in the LOWER-LEFT area, below the title, smaller than the title.',
    badge: 'TOP-LEFT',
  },
  {
    person: 'on the LEFT side of the frame, from chest up, turned slightly toward the center (mirrored composition)',
    title: 'Place the Korean title block on the RIGHT half, vertically centered.',
    symbol: 'Draw the single symbol in the LOWER-RIGHT area, below the title, smaller than the title.',
    badge: 'TOP-RIGHT',
  },
  {
    person: 'on the RIGHT side as a LARGE close-up (head and shoulders filling nearly half the frame height), turned toward the center',
    title: 'Stack the Korean title across the LEFT side and continue into the BOTTOM-LEFT corner, in 2-3 lines.',
    symbol: 'Draw the single symbol small in the UPPER-LEFT, above the title.',
    badge: 'BOTTOM-RIGHT',
  },
  {
    person: 'in the BOTTOM-RIGHT corner, waist up and larger than usual, slightly cropped by the bottom edge, looking up toward the title',
    title: 'Place the Korean title in the UPPER-LEFT, spanning the top two-thirds of the frame in 2 lines.',
    symbol: 'Draw the single symbol in the LEFT-MIDDLE area, under the title.',
    badge: 'BOTTOM-LEFT',
  },
  {
    person: 'at the BOTTOM-CENTER, smaller (head and shoulders only), looking up at the title above him',
    title: 'Place the Korean title across the TOP, spanning the full width in 2 lines, large and centered.',
    symbol: 'Draw the single symbol in the MIDDLE-LEFT, beside the person.',
    badge: 'TOP-RIGHT',
  },
  {
    person: 'on the FAR RIGHT edge, three-quarter view turned inward, cropped so part of his shoulder leaves the frame',
    title: 'Place the Korean title in the CENTER-LEFT, shifted slightly upward.',
    symbol: 'Draw the single symbol large in the BOTTOM-CENTER, behind and below the title.',
    badge: 'TOP-LEFT',
  },
];

type Variation = { outfit: string; pose: string; layout: (typeof LAYOUTS)[number]; mirror: boolean };

/**
 * 레이아웃을 좌우 반전한다.
 *
 * 레이아웃 6개 중 4개가 인물을 오른쪽에 둬서, 랜덤인데도 67% 확률로 오른쪽에 섰다.
 * "항상 사람이 오른쪽"이라는 지적이 정확했다. 레이아웃을 다시 쓰는 대신 좌우를 통째로
 * 뒤집으면 배치 수가 두 배가 되고 좌우 비율도 정확히 반반이 된다.
 */
function mirrorText(t: string): string {
  return t
    .replace(/LEFT/g, '\u0000')
    .replace(/RIGHT/g, 'LEFT')
    .replace(/\u0000/g, 'RIGHT');
}

function pickVariation(): Variation {
  const outfit = OUTFITS[Math.floor(Math.random() * OUTFITS.length)];
  const pose = POSES[Math.floor(Math.random() * POSES.length)];
  const base = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
  const mirror = Math.random() < 0.5;
  const flipped = mirror
    ? {
        person: mirrorText(base.person),
        title: mirrorText(base.title),
        symbol: mirrorText(base.symbol),
        badge: mirrorText(base.badge),
      }
    : base;
  // ★배지는 오른쪽 아래에 두지 않는다★ 목록에서 그 자리에 재생시간 배지가 덧씌워져
  // 통째로 가려진다. 배지는 작고 어디든 놓을 수 있으니 위로 올린다. 좌우 반전을 하면
  // BOTTOM-LEFT 가 BOTTOM-RIGHT 로 바뀌므로 반전 여부와 상관없이 마지막에 한 번 걸러낸다.
  // (제목은 자리를 옮길 수 없어, 프롬프트에서 "그 구석까지 늘리지 말라"로 따로 처리한다.)
  const layout = flipped.badge === 'BOTTOM-RIGHT' ? { ...flipped, badge: 'TOP-RIGHT' } : flipped;
  return { outfit, pose, layout, mirror };
}

function buildPrompt(
  headline: string,
  topic: string,
  title: string,
  style: ThumbStyle,
  hasPresenter: boolean,
  variation: Variation,
  dramatic: boolean,
  badge: string,
  productIcons: string,
): string {
  const layout = variation.layout;
  // 배경·글씨체·액센트는 스타일 프리셋이 한 벌로 정한다(src/lib/thumbStyle.ts).
  // 예전엔 배경만 dark/cream 두 갈래였고 글씨체는 "마커 손글씨"로 하드코딩돼 있어서,
  // 무엇을 골라도 썸네일이 늘 같은 인상이었다.
  const bg = style.bg;
  const inkTitle = style.inkTitle;

  const expression = dramatic
    ? 'a serious, tense, slightly shocked expression (wide eyes, brows raised) fitting a breaking-news moment'
    : 'a confident friendly expression';
  const person = hasPresenter
    ? [
        'You are given a photo of a real Korean man wearing black-framed glasses.',
        `Cleanly REMOVE his green/plain background and place the SAME man ${layout.person},`,
        `with ${expression}, ${variation.pose}.`,
        `Dress him in ${variation.outfit}.`,
        'CRITICAL: keep his real face, glasses, hairstyle and skin natural and clearly recognizable — do NOT beautify or change his identity; only his outfit and pose may differ. Add subtle rim lighting so he pops from the background.',
      ].join(' ')
    : 'Leave the area where the person would go as soft empty space (no person).';

  return [
    'Create a professional, high-CTR YouTube thumbnail image in 16:9 landscape, in the style of top Korean educational tech YouTubers.',
    `IMPORTANT CONTEXT: ${config.thumbnailContext}.`,
    `Video title: "${title}". Video topic: "${topic}".`,
    'DISAMBIGUATION (read carefully before drawing): Korean tech terms in the topic can have an unrelated everyday industrial meaning — pick the SOFTWARE/AI meaning, never the physical one. ' +
      'Specifically: if the topic mentions "하네스"(harness), it means an AI AGENT\'S SOFTWARE SCAFFOLDING/RUNTIME (the code+config wrapper around an LLM, like Claude Code or a coding agent) — draw a laptop/terminal window, a flowchart of an agent loop, or a code editor, NEVER a physical wire harness, cable bundle, connector, wiring loom, robot arm, car, or airplane part. Do the same kind of correction for any other term that could be misread as physical/industrial hardware.',
    `Background: ${bg}${dramatic ? ', with a subtle dark vignette and a dramatic spotlight glow behind the man for cinematic tension' : ''}.`,
    person,
    // ★ 썸네일은 인포그래픽이 아니다 ★ 예전엔 "라벨 붙은 박스 여러 개 + 화살표"를 요구해서
    // 깨알 글씨가 8~10개씩 박힌 정보 덤프가 나왔다 — 폰 썸네일에선 아무것도 안 읽히고 제목만 가린다.
    // 큰 상징 하나로 제한해 제목이 주인공이 되게 한다.
    // ★구도는 매번 달라야 한다★ 인물·제목 위치를 고정하면 채널 썸네일이 전부 똑같아 보인다.
    layout.title,
    // 제품 심볼 줄을 쓰는 회차는 "큰 상징 하나" 지시를 통째로 대체한다.
    // 뒤에 예외 문구만 덧붙였더니 앞의 강한 금지("상징 하나만", "추가 아이콘 최대 2개")에 밀려
    // 심볼 줄이 아예 안 그려지고 엉뚱한 트로피 하나가 나왔다 — 두 지시가 서로 싸운 것.
    productIcons
      ? `${layout.symbol.replace('the single symbol', `a single horizontal ROW of ${productIcons.split(',').length} product symbols`)} ` +
        `These symbols stand for these AI products, in this order: ${productIcons}. ` +
        'Draw each as a simplified chalk-style iconic mark — clean geometric shapes (for example a soft flower/asterisk burst, a rounded starburst, a four-pointed spark, a bold stylized X) — ' +
        'all the same size, evenly spaced in one straight row, the row together spanning roughly one third of the frame width. ' +
        'THIS ROW IS THE ONLY VISUAL ELEMENT besides the title and the person.'
      : `${layout.symbol} It must be ONE single bold hand-drawn symbol that captures the idea at a glance ` +
        (config.thumbnailFocus === 'visual'
          ? ' In this composition the "symbol" IS the main photographic scene — draw a real, specific situation a Korean viewer would recognize (for example a hospital reception desk, a pile of banknotes, a pharmacy counter, a subway turnstile), not an abstract icon.'
          : ' (for example: a giant up-arrow, a price tag, a balance scale, a rocket, a brain, a padlock, a stopwatch — whichever fits the topic).'),
    'CRITICAL: do NOT draw a diagram, flowchart, or multiple labeled boxes. Do NOT add small explanatory text, bullet lists, checkmark lists, or captions anywhere.',
    productIcons
      ? 'Do NOT write the product names as text anywhere. Do NOT add any other large symbol (no trophy, no arrow, no medal) — the row of product symbols takes its place. Everything else stays EMPTY.'
      : 'At most 2 extra tiny icons. Everything else stays EMPTY — negative space makes the title readable at phone size.',
    dramatic
      ? 'Give it a breaking-news, high-alert feeling: a strong RED (#e03131) alert accent — e.g. a bold red warning triangle/exclamation, a red circle-and-slash, or a red cracked/broken outline around one box — combined with orange (#e8590c) and cool blue (#1971c2). High drama and urgency, but still clean and readable, NOT cluttered.'
      : `${style.accent} Lively and clear, NOT cluttered, with real depth.`,
    `Add a HUGE, BOLD Korean title in ${style.lettering}, reading EXACTLY these characters with NOTHING added or dropped: "${headline}".`,
    `Render the Korean text with PERFECT, correct Hangul spelling — every syllable exactly as written, do not merge, drop, or repeat any character — ${dramatic ? 'enormous and ultra-thick, dominating the frame' : 'very large and thick'}, broken into lines as described in the layout above, ${inkTitle}, as the clear focal point.`,
    // ★"프레임 안"만으로는 부족하다★ 실제로 글자가 오른쪽 끝에서 11px 떨어진 썸네일이 나왔다.
    // 잘리지는 않았지만 숨이 막히고, 무엇보다 유튜브가 목록에서 오른쪽 아래에 재생시간
    // 배지를 얹기 때문에 그 자리에 글자를 두면 가려진다. 여백을 %로 못박고,
    // 오른쪽 아래 모서리는 아예 비워 두게 한다.
    'Keep ALL text fully inside the frame with a generous safe margin of at least 5% of the frame width from every edge — being merely "not cut off" is NOT enough; text crowding an edge looks cramped.',
    'The video duration stamp is overlaid in the BOTTOM-RIGHT corner in listings, so keep that zone clear: no letters inside the rightmost 20% of the width within the bottom 14% of the height. If a line of the title runs along the bottom, END IT BEFORE that zone instead of extending it to the right edge — shorten or re-break the line rather than letting it reach the corner.',
    // 문구를 8~14자로 짧게 쓰게 하는 대신, "무엇에 대한 영상인지"는 이 작은 배지가 책임진다.
    badge && !productIcons
      ? `In the ${layout.badge} corner, add ONE small flat rectangular badge (about 1/8 of the frame width) filled with ${dramatic ? 'red (#e03131)' : style.badgeColor}, containing ONLY this short text in clean white letters, spelled exactly: "${badge}". Keep it small and secondary — it must never compete with or overlap the big title or the person.`
      : dramatic
        ? 'You may add ONE small red accent sticker (a warning "!" or "STOP"-style badge), but it must NOT contain any of the title words and must not overlap the title text.'
        : 'You may add ONE tiny round accent sticker (a checkmark or a star), but it must NOT contain any of the title words and must not overlap the title text.',
    dramatic
      ? 'Overall: dramatic, cinematic, maximum contrast and tension like a top breaking-news tech thumbnail; the title must be legible even as a tiny phone thumbnail. No watermark, no extra logos.'
      : 'Overall: energetic, high contrast, strong visual hierarchy; the title must be legible even as a tiny phone thumbnail. No watermark, no extra logos.',
    // ★글자만 큼지막한 썸네일에서 벗어나기★
    // text 모드는 제목이 화면의 40%를 먹고 그림은 보조다. 정보형 채널에는 맞지만,
    // 대중 대상 채널에서는 "글씨만 큰 판때기"로 보여 손이 안 간다. visual 모드는
    // 그 비중을 뒤집어, 한 장면이 화면을 채우고 제목은 아래 좁은 띠에만 얹는다.
    config.thumbnailFocus === 'visual'
      ? 'FINAL CHECK — COMPOSITION IS VISUAL-FIRST: a single vivid, concrete real-world SCENE or OBJECT must fill roughly 70% of the frame and be the first thing the eye lands on. ' +
        'Shoot it like a striking photograph: one clear subject, shallow depth, dramatic directional light, rich color. ' +
        'Place the Korean title in a compact band low in the frame, occupying no more than 25% of the height, in 1-2 short lines — bold and perfectly legible, but NOT filling the frame. ' +
        'The band must NOT run the full width to the bottom-right: end the text before the rightmost 22% of the width, and keep it clear of the bottom 12% of the height. That bottom-right area stays image only — the video duration stamp is overlaid there in listings and would cover the last characters. If the title does not fit, break it into 2 lines or shorten the band rather than pushing it into that corner. ' +
        'Put a solid or gradient backing behind the title band so it stays readable over the image. ' +
        'The image must make someone curious before they read a single word.'
      : 'FINAL CHECK: the Korean title must occupy roughly 40% of the frame and be the first thing the eye lands on. If any element competes with it, remove that element.',
  ].join(' ');
}
