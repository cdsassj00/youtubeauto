import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config, PUBLIC_DIR } from '../config.js';
import { generateImage } from './imagegen.js';
import { engravingPrompt, makeCutout } from './cutout.js';

/** 컷아웃 저장 폴더 (staticFile 로 참조하기 위해 public 아래). */
export const CUTOUT_DIR = path.join(PUBLIC_DIR, 'cutout');

/**
 * 씬별 컷아웃 판화를 만들어 public/cutout/{id}.png 에 저장한다.
 *
 * illustrated 엔진의 generateIllustrations 와 역할은 같지만 결과물이 다르다.
 *   illustrated → 화면을 꽉 채우는 16:9 일러스트
 *   scrapbook   → 배경이 투명한 "오려낸 종이 조각" (종이 배경 위에 얹힌다)
 *
 * 그래서 화풍(ART_STYLE)을 받지 않는다. 판화가 이 스타일의 정체성이라
 * 다른 화풍을 섞으면 종이·타자기·영사기 전환과 따로 논다.
 *
 * @returns { [sceneId]: 'cutout/{id}.png' } 상대경로 맵. 키가 없으면 그 씬은 그림 없이 간다.
 */
export async function generateCutouts(
  scenes: { id: string; illustration?: string; heading: string }[],
): Promise<Record<string, string>> {
  const provider = config.imageProvider === 'gemini' ? 'gemini' : 'openai';
  if (provider === 'gemini' ? !config.geminiApiKey : !config.openaiApiKey) return {};

  fs.mkdirSync(CUTOUT_DIR, { recursive: true });

  const out: Record<string, string> = {};
  const CONCURRENCY = 3;
  let idx = 0;
  async function worker() {
    while (idx < scenes.length) {
      const i = idx++;
      const scene = scenes[i];
      const subject = (scene.illustration || scene.heading || 'a simple concept about AI').trim();
      try {
        const buf = await generateImage({
          prompt: engravingPrompt(subject),
          step: 'cutout',
          provider,
          // 한 조각이 화면 절반쯤 차지하므로 정사각이 맞다. 16:9 로 뽑으면 좌우 여백만 커진다.
          aspect: '1:1',
        });
        const cut = await makeCutout(buf, { border: 16, shadow: 0.3, width: 1100 });
        // 프롬프트가 "넉넉한 여백"을 요구하므로 조각 주위에 투명 영역이 크게 남는다.
        // 그대로 두면 Remotion 에서 폭을 46% 로 줘도 실제 그림은 훨씬 작아 보인다.
        // 알파 기준으로 잘라내야 배치한 크기가 곧 보이는 크기가 된다.
        const rel = `cutout/${scene.id}.png`;
        await sharp(cut)
          .trim({ threshold: 2 })
          .png()
          .toFile(path.join(PUBLIC_DIR, rel));
        out[scene.id] = rel;
        console.log(`    · 컷아웃 ${i + 1}/${scenes.length} (${scene.id}) 생성`);
      } catch (e) {
        console.warn(`    · 컷아웃 ${scene.id} 실패(무시):`, (e as Error).message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));
  return out;
}
