import fs from 'node:fs';
import fsp from 'node:fs/promises';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { config, PRESENTER_IMAGE_PATH } from '../config.js';

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
  if (config.presenterImageUrl) {
    const r = await fetch(config.presenterImageUrl);
    if (r.ok) presenter = Buffer.from(await r.arrayBuffer());
  } else if (fs.existsSync(PRESENTER_IMAGE_PATH)) {
    presenter = await fsp.readFile(PRESENTER_IMAGE_PATH);
  }

  const client = new OpenAI({ apiKey });
  // 매 생성마다 포즈·복장을 다르게 (얼굴/안경/헤어 정체성은 유지, 옷과 자세만 변주).
  const variation = pickVariation();
  const prompt = buildPrompt(headline?.trim() || title, topic, title, config.thumbnailTone, Boolean(presenter), variation, dramatic, badge?.trim() || '', productIcons?.trim() || '');

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

  // 16:9 (1280x720) 로 크롭·리사이즈.
  await sharp(Buffer.from(b64, 'base64')).resize(W, H, { fit: 'cover', position: 'centre' }).png().toFile(outPath);
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

type Variation = { outfit: string; pose: string; layout: (typeof LAYOUTS)[number] };

function pickVariation(): Variation {
  const outfit = OUTFITS[Math.floor(Math.random() * OUTFITS.length)];
  const pose = POSES[Math.floor(Math.random() * POSES.length)];
  const layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
  return { outfit, pose, layout };
}

function buildPrompt(
  headline: string,
  topic: string,
  title: string,
  tone: string,
  hasPresenter: boolean,
  variation: Variation,
  dramatic: boolean,
  badge: string,
  productIcons: string,
): string {
  const layout = variation.layout;
  // 파격 모드: 사건형 뉴스에 어울리는 강렬·긴장 구도(빨강 경고 액센트, 극적 조명/비네트, 초대형 글자,
  // 진지·놀란 표정). 톤은 무조건 어두운 배경으로 대비를 극대화한다.
  const cream = dramatic ? false : tone !== 'dark';
  const bg = cream
    ? 'warm cream textured paper background (#efe9dc) filling the whole frame, like a hand-drawn notebook'
    : 'dark chalkboard background (near-black charcoal) with subtle chalk texture filling the whole frame';
  const inkTitle = cream
    ? 'the key phrase in bold ORANGE (#e8590c) marker and the rest in near-black ink'
    : 'the key phrase in bold ORANGE (#e8590c) and the rest in bright WHITE chalk';

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
    'IMPORTANT CONTEXT: this channel exclusively covers AI / software engineering / LLM agent topics for developers — never physical hardware, electrical wiring, automotive parts, or manufacturing.',
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
        '(for example: a giant up-arrow, a price tag, a balance scale, a rocket, a brain, a padlock, a stopwatch — whichever fits the topic).',
    'CRITICAL: do NOT draw a diagram, flowchart, or multiple labeled boxes. Do NOT add small explanatory text, bullet lists, checkmark lists, or captions anywhere.',
    productIcons
      ? 'Do NOT write the product names as text anywhere. Do NOT add any other large symbol (no trophy, no arrow, no medal) — the row of product symbols takes its place. Everything else stays EMPTY.'
      : 'At most 2 extra tiny icons. Everything else stays EMPTY — negative space makes the title readable at phone size.',
    dramatic
      ? 'Give it a breaking-news, high-alert feeling: a strong RED (#e03131) alert accent — e.g. a bold red warning triangle/exclamation, a red circle-and-slash, or a red cracked/broken outline around one box — combined with orange (#e8590c) and cool blue (#1971c2). High drama and urgency, but still clean and readable, NOT cluttered.'
      : 'Use orange (#e8590c), blue (#1971c2) and green (#2f9e44) accents on clean strokes. Lively and clear, NOT cluttered, with real depth.',
    `Add a HUGE, BOLD Korean title, hand-lettered marker style, reading EXACTLY these characters with NOTHING added or dropped: "${headline}".`,
    `Render the Korean text with PERFECT, correct Hangul spelling — every syllable exactly as written, do not merge, drop, or repeat any character — ${dramatic ? 'enormous and ultra-thick, dominating the frame' : 'very large and thick'}, broken into lines as described in the layout above, ${inkTitle}, as the clear focal point.`,
    'Keep ALL text fully inside the frame with a safe margin — never let letters touch or get cut off by any edge.',
    // 문구를 8~14자로 짧게 쓰게 하는 대신, "무엇에 대한 영상인지"는 이 작은 배지가 책임진다.
    badge && !productIcons
      ? `In the ${layout.badge} corner, add ONE small flat rectangular badge (about 1/8 of the frame width) filled with ${dramatic ? 'red (#e03131)' : 'orange (#e8590c)'}, containing ONLY this short text in clean white letters, spelled exactly: "${badge}". Keep it small and secondary — it must never compete with or overlap the big title or the person.`
      : dramatic
        ? 'You may add ONE small red accent sticker (a warning "!" or "STOP"-style badge), but it must NOT contain any of the title words and must not overlap the title text.'
        : 'You may add ONE tiny round accent sticker (a checkmark or a star), but it must NOT contain any of the title words and must not overlap the title text.',
    dramatic
      ? 'Overall: dramatic, cinematic, maximum contrast and tension like a top breaking-news tech thumbnail; the title must be legible even as a tiny phone thumbnail. No watermark, no extra logos.'
      : 'Overall: energetic, high contrast, strong visual hierarchy; the title must be legible even as a tiny phone thumbnail. No watermark, no extra logos.',
    'FINAL CHECK: the Korean title must occupy roughly 40% of the frame and be the first thing the eye lands on. If any element competes with it, remove that element.',
  ].join(' ');
}
