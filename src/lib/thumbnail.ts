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
  const prompt = buildPrompt(headline?.trim() || title, topic, config.thumbnailTone, Boolean(presenter));

  let b64: string | undefined;
  if (presenter) {
    const img = await toFile(presenter, 'presenter.png', { type: 'image/png' });
    const res = await client.images.edit({
      model: config.openaiImageModel,
      image: img,
      prompt,
      size: '1536x1024',
      quality: 'high',
    });
    b64 = res.data?.[0]?.b64_json;
  } else {
    const res = await client.images.generate({
      model: config.openaiImageModel,
      prompt,
      size: '1536x1024',
      quality: 'high',
    });
    b64 = res.data?.[0]?.b64_json;
  }
  if (!b64) return false;

  // 16:9 (1280x720) 로 크롭·리사이즈.
  await sharp(Buffer.from(b64, 'base64')).resize(W, H, { fit: 'cover', position: 'centre' }).png().toFile(outPath);
  return true;
}

function buildPrompt(headline: string, topic: string, tone: string, hasPresenter: boolean): string {
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
        'with a confident friendly expression, ONE HAND POINTING toward the title/diagram (classic YouTube pose).',
        'CRITICAL: keep his real face, glasses, hairstyle and skin natural and clearly recognizable — do NOT beautify or change his identity. Add subtle rim lighting so he pops from the background.',
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
    'You may add ONE tiny round accent sticker (a checkmark or a star), but it must NOT contain any of the title words and must not overlap the title text.',
    'Overall: energetic, high contrast, strong visual hierarchy; the title must be legible even as a tiny phone thumbnail. No watermark, no extra logos.',
  ].join(' ');
}
