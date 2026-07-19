import fs from 'node:fs';
import fsp from 'node:fs/promises';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { config, PRESENTER_IMAGE_PATH } from '../config.js';

const W = 1280;
const H = 720;

/**
 * 유튜브 썸네일 생성 (1280x720).
 *
 * 핵심: 한글 텍스트는 이미지 모델(gpt-image-1)이 자주 깨뜨리므로 **모델에게 글자를 맡기지 않는다.**
 * 모델은 배경 + 손그림 일러스트 + 인물(진행자 사진 합성)만 그리고,
 * 큰 볼드 한글 제목은 이 코드가 실제 폰트로 **직접 오버레이**해 항상 또렷하고 정확하게 나오게 한다.
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
  const prompt = buildPrompt(topic, config.thumbnailTone, Boolean(presenter));

  let b64: string | undefined;
  if (presenter) {
    const img = await toFile(presenter, 'presenter.png', { type: 'image/png' });
    const res = await client.images.edit({ model: config.openaiImageModel, image: img, prompt, size: '1536x1024' });
    b64 = res.data?.[0]?.b64_json;
  } else {
    const res = await client.images.generate({ model: config.openaiImageModel, prompt, size: '1536x1024' });
    b64 = res.data?.[0]?.b64_json;
  }
  if (!b64) return false;

  // 16:9 로 크롭 후, 한글 제목을 실제 폰트로 오버레이해 합성.
  const base = await sharp(Buffer.from(b64, 'base64'))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const overlay = Buffer.from(buildTitleSvg(title, config.thumbnailTone, Boolean(presenter)));
  await sharp(base).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(outPath);
  return true;
}

/** 모델 프롬프트 — 글자는 넣지 말고 그림만. 제목 자리는 비워두게 지시. */
function buildPrompt(topic: string, tone: string, hasPresenter: boolean): string {
  const bg =
    tone === 'cream'
      ? 'warm cream paper background (#f4f1ea) with subtle texture'
      : 'deep dark background (near-black navy/charcoal) with subtle texture and soft vignette';
  const person = hasPresenter
    ? 'Use the provided photo of the male presenter (Korean man with black-framed glasses). Cleanly cut him from his background and place him on the RIGHT third, from mid-chest up, friendly confident expression, one hand gesturing toward the illustration. Keep his real face and glasses natural and recognizable, with soft rim lighting so he pops.'
    : 'Leave the right third as soft empty glow (no person).';
  return [
    'Create a high-CTR YouTube thumbnail background image, 16:9, clean and professional, Korean educational tech channel style.',
    `Topic: "${topic}".`,
    `Background: ${bg}.`,
    'In the CENTER/LEFT area, draw a bold, colorful hand-drawn (marker / Excalidraw) illustration of the topic:',
    'a few simple boxes and sketchy arrows, a glowing brain or robot, small icons (gear, code </>, laptop, chat bubble), a sense of flow.',
    'Vibrant accent palette: orange (#e8590c), blue (#4dabf7), green (#2f9e44), with clean white/chalk strokes. Make it lively and eye-catching, strong depth.',
    person,
    'IMPORTANT: DO NOT render any text, letters, words, captions, or numbers anywhere in the image. No typography at all. Leave the LOWER-LEFT area relatively clean and uncluttered so a title can be placed there later.',
    'No watermark, no logos.',
  ].join(' ');
}

/** 한글 제목 오버레이 SVG (실제 폰트로 또렷하게, 강조 밑줄 + 가독성 스트로크). */
function buildTitleSvg(title: string, tone: string, hasPresenter: boolean): string {
  const maxW = hasPresenter ? 820 : 1120; // 인물이 오른쪽에 있으면 왼쪽 폭만 사용
  const lines = wrapKo(title, hasPresenter ? 11 : 15).slice(0, 2);
  const fontSize = lines.length > 1 ? 92 : 108;
  const lineH = fontSize * 1.16;
  const startY = H - 90 - (lines.length - 1) * lineH;
  const stroke = tone === 'cream' ? '#ffffff' : '#0a0a0a';
  const ink = tone === 'cream' ? '#1a1a1a' : '#ffffff';

  const tspans = lines
    .map((ln, i) => {
      const y = startY + i * lineH;
      const esc = escapeXml(ln);
      // 스트로크(외곽선) 텍스트 → 채움 텍스트 순으로 겹쳐 가독성 확보.
      return (
        `<text x="60" y="${y}" font-family="'Black Han Sans','NanumGothic','Noto Sans CJK KR',sans-serif" font-weight="900" ` +
        `font-size="${fontSize}" fill="none" stroke="${stroke}" stroke-width="14" stroke-linejoin="round" paint-order="stroke">${esc}</text>` +
        `<text x="60" y="${y}" font-family="'Black Han Sans','NanumGothic','Noto Sans CJK KR',sans-serif" font-weight="900" ` +
        `font-size="${fontSize}" fill="${ink}">${esc}</text>`
      );
    })
    .join('');

  // 하단 왼쪽 가독성용 그라데이션 패널 + 강조 밑줄.
  const underlineY = startY + (lines.length - 1) * lineH + 22;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#000000" stop-opacity="0.72"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${H - 260}" width="${maxW + 40}" height="260" fill="url(#shade)"/>
    <rect x="60" y="${underlineY}" width="220" height="14" rx="7" fill="#e8590c"/>
    ${tspans}
  </svg>`;
}

/** 한글/공백 기준 단순 줄바꿈 (대략 maxChars 기준). */
function wrapKo(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
}
