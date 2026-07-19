import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import { config, PUBLIC_DIR } from '../config.js';

/** 일러스트 저장 폴더 (staticFile 로 참조하기 위해 public 아래). */
export const IMG_DIR = path.join(PUBLIC_DIR, 'img');

/** 모든 씬에 일관되게 적용하는 흑백 라인아트 스타일 규칙. */
const STYLE =
  'Clean black-and-white line-art editorial illustration, minimalist, on a pure white background. ' +
  'Consistent friendly cartoon style with fine ink linework and subtle grey shading, no color at all. ' +
  'Depict the subject LITERALLY and DIRECTLY — show the actual objects, screens, and actions being explained, ' +
  'not abstract metaphors or symbolic scenes; the viewer should instantly recognize what is being described. ' +
  'Centered composition with generous white space, 16:9 landscape. ' +
  'Absolutely NO text, letters, words, captions, numbers, logos, or watermarks anywhere in the image.';

/**
 * 씬별 흑백 라인아트 일러스트를 gpt-image-1 로 생성해 public/img/{id}.png 에 저장한다.
 * @returns { [sceneId]: 'img/{id}.png' } 상대경로 맵. 키 없으면 생성 실패(폴백은 호출부).
 */
export async function generateIllustrations(
  scenes: { id: string; illustration?: string; heading: string }[],
): Promise<Record<string, string>> {
  const apiKey = config.openaiApiKey;
  if (!apiKey) return {};
  const client = new OpenAI({ apiKey });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const out: Record<string, string> = {};
  // 이미지 API 레이트리밋을 고려해 소규모 동시성(3)으로 처리.
  const CONCURRENCY = 3;
  let idx = 0;
  async function worker() {
    while (idx < scenes.length) {
      const i = idx++;
      const scene = scenes[i];
      const subject = (scene.illustration || scene.heading || 'a simple concept about AI').trim();
      try {
        const res = await client.images.generate({
          model: config.openaiIllustrationModel,
          prompt: `${STYLE} Subject: ${subject}`,
          size: '1536x1024', // mini 는 16:9 미지원 → 3:2 생성 후 16:9 로 크롭(글자 없어 무해)
          quality: 'medium',
        });
        const b64 = res.data?.[0]?.b64_json;
        if (!b64) continue;
        const rel = `img/${scene.id}.png`;
        await sharp(Buffer.from(b64, 'base64'))
          .resize(1920, 1080, { fit: 'cover', position: 'centre' })
          .png()
          .toFile(path.join(PUBLIC_DIR, rel));
        out[scene.id] = rel;
        console.log(`    · 일러스트 ${i + 1}/${scenes.length} (${scene.id}) 생성`);
      } catch (e) {
        console.warn(`    · 일러스트 ${scene.id} 실패(무시):`, (e as Error).message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));
  return out;
}
