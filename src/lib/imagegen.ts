import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { recordUsage } from './usage.js';

/**
 * 이미지 생성 provider 추상화 — OpenAI / Gemini(Nano Banana) 를 같은 함수로 부른다.
 *
 * Gemini 를 붙인 이유는 두 가지다.
 *  1) 화풍 다양화 — 수채화·클레이·코믹북 같은 회화적 화풍은 Gemini 이미지 모델이 강하다.
 *  2) 비용 — 1K 기준 gemini-3.1-flash-image 는 장당 약 $0.067 로, 지금 쓰는 OpenAI
 *     이미지 모델보다 싸다.
 *
 * ★API 형태는 @google/genai 2.15.0 의 타입 정의(genai.d.ts)에서 확인한 것이다★
 *   ai.interactions.create({ model, input: string, response_format: { type:'image', ... } })
 *   → interaction.output_image.data (base64), interaction.usage.total_* (토큰 수)
 * 추측으로 쓴 필드는 없다.
 */

export type ImageProvider = 'openai' | 'gemini';

export interface GenerateImageOptions {
  prompt: string;
  /** 사용량 장부에 남길 단계 이름 (illustration / thumbnail / figure 등) */
  step: string;
  /** 강제 지정. 비우면 config.imageProvider 를 따른다. */
  provider?: ImageProvider;
  /** 강제 지정. 비우면 provider 별 기본 모델. */
  model?: string;
  /** 16:9 가 기본. OpenAI 는 픽셀 크기로, Gemini 는 비율로 변환된다. */
  aspect?: '16:9' | '1:1';
}

/** provider 별 기본 모델. */
function defaultModel(provider: ImageProvider): string {
  return provider === 'gemini' ? config.geminiImageModel : config.openaiIllustrationModel;
}

/**
 * 이미지 한 장을 생성해 PNG 버퍼로 돌려준다.
 * 실패하면 예외를 던진다 — 호출부가 씬 단위로 잡아서 무시할 수 있게.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<Buffer> {
  const provider: ImageProvider = opts.provider || (config.imageProvider as ImageProvider) || 'openai';
  const model = opts.model || defaultModel(provider);
  const aspect = opts.aspect || '16:9';

  if (provider === 'gemini') return generateWithGemini(opts.prompt, model, aspect, opts.step);
  return generateWithOpenAI(opts.prompt, model, aspect, opts.step);
}

async function generateWithGemini(
  prompt: string,
  model: string,
  aspect: '16:9' | '1:1',
  step: string,
): Promise<Buffer> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY 가 없습니다');
  const ai = new GoogleGenAI({ apiKey });

  const interaction = await ai.interactions.create({
    model,
    input: prompt,
    response_format: {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio: aspect,
      // 1K 면 1080p 로 리사이즈하기에 충분하고, 2K 보다 싸다.
      image_size: '1K',
    },
  });

  const b64 = interaction.output_image?.data;
  if (!b64) throw new Error('Gemini 응답에 이미지가 없습니다');

  recordUsage({
    kind: 'gemini-image',
    step,
    model,
    images: 1,
    inputTokens: interaction.usage?.total_input_tokens || 0,
    outputTokens: interaction.usage?.total_output_tokens || 0,
  });

  return Buffer.from(b64, 'base64');
}

async function generateWithOpenAI(
  prompt: string,
  model: string,
  aspect: '16:9' | '1:1',
  step: string,
): Promise<Buffer> {
  const apiKey = config.openaiApiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY 가 없습니다');
  const client = new OpenAI({ apiKey });

  // mini 계열은 16:9 를 지원하지 않아 3:2 로 뽑고 호출부에서 크롭한다(글자가 없어 무해).
  const size = aspect === '1:1' ? '1024x1024' : '1536x1024';
  const res = await client.images.generate({
    model,
    prompt,
    size: size as '1024x1024' | '1536x1024',
    quality: 'medium',
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI 응답에 이미지가 없습니다');

  recordUsage({ kind: 'openai-image', step, model, images: 1 });
  return Buffer.from(b64, 'base64');
}
