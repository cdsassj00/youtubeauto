import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config, PUBLIC_DIR } from '../config.js';
import { buildIllustrationPrompt, resolveArtStyle, type ArtStyle } from './artStyle.js';
import { generateImage } from './imagegen.js';

/** 일러스트 저장 폴더 (staticFile 로 참조하기 위해 public 아래). */
export const IMG_DIR = path.join(PUBLIC_DIR, 'img');

/**
 * 씬별 일러스트를 생성해 public/img/{id}.png 에 저장한다.
 *
 * 화풍은 ART_STYLE 로 고른다(src/lib/artStyle.ts). 예전에는 흑백 등각 라인아트가
 * 코드에 하드코딩돼 있어서 모든 영상이 같은 그림체로 나왔다.
 *
 * @param dark true 면 다크(짙은 배경) 변형으로 그린다(manifest.theme==='dark'일 때).
 * @returns { [sceneId]: 'img/{id}.png' } 상대경로 맵. 키 없으면 생성 실패(폴백은 호출부).
 */
export async function generateIllustrations(
  scenes: { id: string; illustration?: string; heading: string }[],
  dark = false,
): Promise<Record<string, string>> {
  const provider = config.imageProvider === 'gemini' ? 'gemini' : 'openai';
  // provider 별로 필요한 키가 다르다. 없으면 조용히 건너뛰고 호출부가 폴백한다.
  if (provider === 'gemini' ? !config.geminiApiKey : !config.openaiApiKey) return {};

  const style: ArtStyle = resolveArtStyle(config.artStyle);
  fs.mkdirSync(IMG_DIR, { recursive: true });
  console.log(`  · 일러스트 화풍: ${style.label} (${style.id}) / provider=${provider}`);

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
        const buf = await generateImage({
          prompt: buildIllustrationPrompt(style, subject, dark),
          step: 'illustration',
          provider,
        });
        const rel = `img/${scene.id}.png`;
        // OpenAI mini 는 3:2 로 나오므로 16:9 로 크롭한다. Gemini 는 이미 16:9 라 그대로 통과.
        await sharp(buf)
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
