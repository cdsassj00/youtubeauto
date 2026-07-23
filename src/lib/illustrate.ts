import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import { config, PUBLIC_DIR } from '../config.js';

/** 일러스트 저장 폴더 (staticFile 로 참조하기 위해 public 아래). */
export const IMG_DIR = path.join(PUBLIC_DIR, 'img');

/**
 * 모든 씬에 일관되게 적용하는 흑백 등각(isometric) 라인아트 스타일 규칙.
 * 영상 내 diagram/comparison 씬은 코드로 그린 등각 모션 그래픽(IsoDiagram/IsoComparison, iso.tsx)을
 * 쓰므로, AI 로 그리는 이 일러스트도 같은 등각 시각언어(뜬 플랫폼, 3/4 각도, 얇은 잉크선)로
 * 맞춰야 영상 전체가 한 스타일처럼 보인다.
 */
const STYLE_BASE =
  'Draw the subject as a clean isometric (2.5D) technical illustration, like a modern SaaS product diagram: ' +
  'objects and scenes are shown as geometric solids/platforms viewed from a 3/4 isometric angle with a consistent ' +
  'top-left light source, NOT a flat front-facing view. ' +
  'Depict the subject LITERALLY and DIRECTLY — show the actual objects, screens, and actions being explained in isometric form, ' +
  'not abstract metaphors or symbolic scenes; the viewer should instantly recognize what is being described. ' +
  'STRICTLY FORBIDDEN generic "AI cliche" imagery: a brain made of circuits, a glowing lightbulb, an abstract cloud of floating dots/network nodes, ' +
  'a robot hand touching a human hand, a glowing orb/sphere, a holographic brain, magical light rays, or any generic sci-fi "AI" symbolism. ' +
  'Instead always depict one concrete, real, specific object or scene tied to the exact subject (an actual laptop screen with a real UI, a physical office desk, ' +
  'a specific labeled diagram, a real tool, a stack of paper documents, a server rack, a phone showing an app). ' +
  'Centered composition with generous empty space and soft drop shadows beneath floating elements, 16:9 landscape. ' +
  'Absolutely NO text, letters, words, captions, numbers, logos, or watermarks anywhere in the image — not even short tags, labels, tabs, or stickers with words on them. ' +
  'If the concrete object you choose would realistically have text on it (a book, a screen, a sign, a sticky note, a bookmark tab), draw it with blank white space, abstract scribble lines, or a solid color block standing in for the text — never render actual letterforms, and never invent words, since AI-generated text always comes out garbled and unreadable.';

/**
 * 모든 씬에 일관되게 적용하는 등각(isometric) 라인아트 스타일 규칙 — 라이트/다크 두 변형.
 * 영상 내 diagram/comparison 씬은 코드로 그린 등각 모션 그래픽(IsoDiagram/IsoComparison, iso.tsx)을
 * 쓰는데, 그 코드 렌더링도 manifest.theme 에 따라 라이트/다크를 반전하므로, AI 로 그리는 이
 * 일러스트도 같은 테마를 따라야 한 영상 안에서 title/outro 씬만 배경색이 튀지 않는다.
 */
function buildStyle(dark: boolean): string {
  return dark
    ? 'Clean white-ink isometric editorial illustration, minimalist, on a solid near-black background (#15161a). ' +
        STYLE_BASE +
        ' Consistent style with fine white/light-grey linework and subtle lighter-grey flat shading, no color at all (grayscale only, pure white/light outlines on the dark background).'
    : 'Clean black-and-white isometric editorial illustration, minimalist, on a pure white background. ' +
        STYLE_BASE +
        ' Consistent style with fine ink linework and subtle grey flat shading, no color at all (grayscale only, pure black outlines).';
}

/**
 * 씬별 등각 라인아트 일러스트를 gpt-image-1 로 생성해 public/img/{id}.png 에 저장한다.
 * @param dark true 면 다크(짙은 배경+흰 잉크) 변형으로 그린다(manifest.theme==='dark'일 때).
 * @returns { [sceneId]: 'img/{id}.png' } 상대경로 맵. 키 없으면 생성 실패(폴백은 호출부).
 */
export async function generateIllustrations(
  scenes: { id: string; illustration?: string; heading: string }[],
  dark = false,
): Promise<Record<string, string>> {
  const apiKey = config.openaiApiKey;
  if (!apiKey) return {};
  const client = new OpenAI({ apiKey });
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const style = buildStyle(dark);

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
          prompt: `${style} Subject: ${subject}`,
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
