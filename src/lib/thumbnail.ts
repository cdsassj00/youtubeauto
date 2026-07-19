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
  outPath: string;
}): Promise<boolean> {
  const { title, topic, headline, outPath } = params;
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
  const prompt = buildPrompt(headline?.trim() || title, topic, config.thumbnailTone, Boolean(presenter), variation);

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

function pickVariation(): { outfit: string; pose: string } {
  const outfit = OUTFITS[Math.floor(Math.random() * OUTFITS.length)];
  const pose = POSES[Math.floor(Math.random() * POSES.length)];
  return { outfit, pose };
}

function buildPrompt(
  headline: string,
  topic: string,
  tone: string,
  hasPresenter: boolean,
  variation: { outfit: string; pose: string },
): string {
  const cream = tone !== 'dark';
  const bg = cream
    ? 'warm cream textured paper background (#efe9dc) filling the whole frame, like a hand-drawn notebook'
    : 'dark chalkboard background (near-black charcoal) with subtle chalk texture filling the whole frame';
  const inkTitle = cream
    ? 'the key phrase in bold ORANGE (#e8590c) marker and the rest in near-black ink'
    : 'the key phrase in bold ORANGE (#e8590c) and the rest in bright WHITE chalk';

  const person = hasPresenter
    ? [
        'You are given a photo of a real Korean man wearing black-framed glasses.',
        'Cleanly REMOVE his green/plain background and place the SAME man on the RIGHT side of the thumbnail, from chest up, turned slightly toward the center,',
        `with a confident friendly expression, ${variation.pose}.`,
        `Dress him in ${variation.outfit}.`,
        'CRITICAL: keep his real face, glasses, hairstyle and skin natural and clearly recognizable — do NOT beautify or change his identity; only his outfit and pose may differ. Add subtle rim lighting so he pops from the background.',
      ].join(' ')
    : 'Leave the right side as soft empty space (no person).';

  return [
    'Create a professional, high-CTR YouTube thumbnail image in 16:9 landscape, in the style of top Korean educational tech YouTubers.',
    `Video topic: "${topic}".`,
    `Background: ${bg}.`,
    person,
    'On the LEFT and CENTER area, draw a BOLD hand-drawn (marker / Excalidraw sketch) concept diagram that illustrates the topic:',
    'a few labeled rounded boxes connected by sketchy arrows, plus simple line icons (brain, gear, robot, laptop, cloud, chat bubble, code </>), clearly related to the topic.',
    'Use orange (#e8590c), blue (#1971c2) and green (#2f9e44) accents on clean strokes. Lively and clear, NOT cluttered, with real depth.',
    `Add a HUGE, BOLD Korean title, hand-lettered marker style, reading EXACTLY these characters with NOTHING added or dropped: "${headline}".`,
    `Render the Korean text with PERFECT, correct Hangul spelling — every syllable exactly as written, do not merge, drop, or repeat any character — very large and thick, 1-2 lines, ${inkTitle}, as the clear focal point.`,
    'Keep ALL text fully inside the frame with a safe margin — never let letters touch or get cut off by any edge.',
    'You may add ONE tiny round accent sticker (a checkmark or a star), but it must NOT contain any of the title words and must not overlap the title text.',
    'Overall: energetic, high contrast, strong visual hierarchy; the title must be legible even as a tiny phone thumbnail. No watermark, no extra logos.',
  ].join(' ');
}
