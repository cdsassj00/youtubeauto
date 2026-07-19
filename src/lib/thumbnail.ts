import fs from 'node:fs';
import fsp from 'node:fs/promises';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { config, PRESENTER_IMAGE_PATH } from '../config.js';

/**
 * gpt-image-1 로 유튜브 썸네일을 생성한다.
 * 진행자 사진(그린스크린/일반)을 레퍼런스로 넣어 인물을 합성하고,
 * 큰 볼드 한글 제목 + 손그림 다이어그램을 얹은 1280x720 썸네일을 만든다.
 *
 * @returns 성공 여부. OPENAI_API_KEY 가 없으면 false (호출부에서 기본 썸네일로 폴백).
 */
export async function generateThumbnail(params: {
  title: string;
  topic: string;
  outPath: string;
}): Promise<boolean> {
  const { title, topic, outPath } = params;
  const apiKey = config.openaiApiKey;
  if (!apiKey) return false;

  // 진행자 사진 로드 (URL 우선, 없으면 로컬 assets/presenter.png).
  let presenter: Buffer | null = null;
  if (config.presenterImageUrl) {
    const r = await fetch(config.presenterImageUrl);
    if (r.ok) presenter = Buffer.from(await r.arrayBuffer());
  } else if (fs.existsSync(PRESENTER_IMAGE_PATH)) {
    presenter = await fsp.readFile(PRESENTER_IMAGE_PATH);
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildPrompt(title, topic, config.thumbnailTone, Boolean(presenter));

  let b64: string | undefined;
  if (presenter) {
    const img = await toFile(presenter, 'presenter.png', { type: 'image/png' });
    const res = await client.images.edit({
      model: config.openaiImageModel,
      image: img,
      prompt,
      size: '1536x1024',
    });
    b64 = res.data?.[0]?.b64_json;
  } else {
    const res = await client.images.generate({
      model: config.openaiImageModel,
      prompt,
      size: '1536x1024',
    });
    b64 = res.data?.[0]?.b64_json;
  }
  if (!b64) return false;

  // 16:9 (1280x720) 로 크롭·리사이즈.
  const raw = Buffer.from(b64, 'base64');
  await sharp(raw).resize(1280, 720, { fit: 'cover', position: 'centre' }).png().toFile(outPath);
  return true;
}

function buildPrompt(title: string, topic: string, tone: string, hasPresenter: boolean): string {
  const bg =
    tone === 'cream'
      ? 'warm cream paper background (#f4f1ea) with subtle texture'
      : 'dark chalkboard/blackboard background (near-black, subtle chalk texture)';

  const person = hasPresenter
    ? 'Use the provided photo of the male presenter (Korean man with black-framed glasses). Cut him out from his green/plain background cleanly and place him on the RIGHT side, from mid-chest up, looking at the camera, one hand gesturing toward the diagram. Keep his real face and glasses recognizable and natural. Add subtle rim lighting so he pops from the background.'
    : 'Leave the right side open with a soft glow (no person).';

  return [
    'Create a high-CTR YouTube thumbnail, 16:9, ultra clean and professional, Korean educational tech channel style.',
    `Topic: "${topic}".`,
    `Background: ${bg}.`,
    'On the LEFT and CENTER, draw a hand-drawn (Excalidraw / marker sketch) diagram illustrating the topic:',
    'simple boxes, arrows, a brain/LLM circle, small icons (gear, code </>, robot, laptop), connected with sketchy arrows.',
    'Use a consistent accent palette: orange (#e8590c) and blue (#4dabf7) highlights, white/chalk strokes on dark (or ink strokes on cream).',
    `Add a BIG, BOLD Korean title text reading exactly: "${title}".`,
    'The Korean text must be spelled EXACTLY as given, large, bold, highly legible, with an orange marker underline or highlight on the key word.',
    'Add a small circular stamp badge in the corner like "그림으로 이해" or a minutes tag. Keep it tasteful, not cluttered.',
    person,
    'Overall: energetic but clean, strong visual hierarchy, title readable at small size. No watermark, no logos other than what is described.',
  ].join(' ');
}
