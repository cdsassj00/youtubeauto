/**
 * 강의 한 편에서 쇼츠로 쓸 한 토막과 첫 3초 훅을 고른다.
 *
 * ★쇼츠를 새로 찍지 않는다★ 강의가 일흔 편 넘게 쌓여 있고 자막까지 붙어 있다. 거기서
 * 사람들이 남에게 옮길 만한 한 토막을 잘라 내는 쪽이, 없는 내용을 새로 만드는 것보다
 * 정확하고 비용도 0 에 가깝다(모델 한 번 + ffmpeg).
 *
 * ★훅은 지어내는 것이 아니라 고르는 것이다★ 틀 50가지를 자산으로 두고, 모델은 그중
 * 내용에 맞는 것을 하나 골라 대괄호를 자막에서 읽은 실제 값으로 채운다. 빈 화면에서
 * 문구를 쓰게 하면 "AI 활용법!" 같은 말이 나온다 — 고르게 하면 구조가 남는다.
 *
 * ★자른 토막이 그 자체로 말이 돼야 한다★ 강의 중간을 아무 데나 잘라 붙이면 "…그래서
 * 이것도" 로 시작해 아무도 못 알아듣는다. 문장이 시작되는 자막 경계에서 자르게 한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { recordUsage } from './usage.js';
import { parseSrt, timedOutline, stampFromSeconds, type ParsedSrt } from './srt.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_PATH = path.resolve(HERE, '../../assets/shorts/hooks.json');

export interface HookTemplate {
  id: number;
  pattern: string;
  example: string;
}

export async function loadHookTemplates(): Promise<HookTemplate[]> {
  const raw = JSON.parse(await fs.readFile(HOOKS_PATH, 'utf8')) as { templates: HookTemplate[] };
  if (!raw.templates?.length) throw new Error('훅 틀을 하나도 읽지 못했습니다.');
  return raw.templates;
}

export const ShortPlanSchema = z.object({
  /** 고른 훅 틀 번호 — 왜 그 틀인지 로그로 되짚을 수 있게 남긴다. */
  hookTemplateId: z.number(),
  /** 첫 화면에 크게 박히는 두 줄. 줄바꿈으로 나눈다. */
  hook: z.string(),
  /** 자를 구간. 자막에 실제로 있는 경계여야 한다. */
  startSec: z.number(),
  endSec: z.number(),
  /** 왜 이 토막인지 — 사람이 보고 판단할 한 줄. 발행물에는 안 나간다. */
  why: z.string(),
  /** 쇼츠 제목. 40자 안쪽. */
  title: z.string(),
  /** 설명란 첫 문단. */
  summary: z.string(),
  tags: z.array(z.string()),
  /** 마지막 2초에 띄울 한 줄 — 원본 강의로 보내는 말. */
  outro: z.string(),
});
export type ShortPlan = z.infer<typeof ShortPlanSchema>;

export interface ShortPlanInput {
  srt: string;
  /** 원본 강의 제목 — 모델에게 맥락으로 준다. */
  sourceTitle: string;
  courseName: string;
  /** 쇼츠 길이 상한(초). 유튜브 쇼츠는 3분까지지만 짧을수록 끝까지 본다. */
  maxSec?: number;
  minSec?: number;
}

export async function planShort(
  input: ShortPlanInput,
): Promise<{ plan: ShortPlan; parsed: ParsedSrt; template: HookTemplate }> {
  const parsed = parseSrt(input.srt);
  if (parsed.cues.length < 10) {
    throw new Error(`자막 대사가 ${parsed.cues.length}개뿐입니다 — 쇼츠를 고를 만큼이 안 됩니다.`);
  }
  const templates = await loadHookTemplates();
  const maxSec = input.maxSec ?? 55;
  const minSec = input.minSec ?? 30;

  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  const system = [
    '너는 교육 영상에서 쇼츠로 쓸 토막을 골라내는 편집자다.',
    '★이 영상은 이미 찍혀 있다★ 자막에 있는 말만 쓸 수 있다. 강사가 하지 않은 말, 다루지 않은 수치·도구·사례를 넣으면 안 된다.',
    '★발주 기관 이름을 쓰지 마라★ 자막에 특정 기관·부처·기업 이름이 나와도 옮기지 말고, "공공기관"·"기관"·"공무원" 같은 대체어도 쓰지 마라. 그 말이 없어도 통하도록 문장을 다시 써라.',
    '★말투★ 가르치는 사람이 아니라 옆자리에서 먼저 해 본 사람이 알려 주는 말투로 써라. 음슴체("~됨"), 해요체, 명사로 끝내기, 되묻기 중에서 고른다. 명령형("~해라")과 평생·완벽·마스터·총정리·핵심·제대로·반드시·필수·비법·노하우·충격·99% 는 쓰지 마라 — 훈계로 읽힌다.',
  ].join(' ');

  const outline = timedOutline(parsed, 30);
  const user = [
    `과정: ${input.courseName}`,
    `원본 강의: ${input.sourceTitle}`,
    `영상 길이: ${stampFromSeconds(parsed.durationSec)}`,
    '',
    '=== 훅 틀 (이 중 하나를 골라 쓴다) ===',
    ...templates.map((t) => `${t.id}. ${t.pattern}\n   예) ${t.example}`),
    '=== 훅 틀 끝 ===',
    '',
    '아래는 자막을 30초 단위로 묶은 것이다. 대괄호 안이 그 대목이 시작되는 시각이다.',
    '=== 자막 시작 ===',
    outline,
    '=== 자막 끝 ===',
    '',
    '요구사항:',
    `- startSec·endSec: ${minSec}~${maxSec}초짜리 한 토막. ★위 자막에 실제로 나온 시각에서 골라라★ 지어낸 시각을 쓰면 엉뚱한 데가 잘린다.`,
    '- ★그 토막만 떼어 놓아도 말이 되어야 한다★ "그래서 이것도…" 처럼 앞을 받는 말로 시작하면 아무도 못 알아듣는다. 하나의 이야기가 시작해서 끝나는 자리를 골라라. 설명이 중간에 끊기면 더 짧더라도 끝나는 데서 잘라라.',
    '- 고르는 기준: (1) 구체적인 수치·분량·시간이 나오는 대목, (2) "이렇게 하면 안 된다 / 여기서 막힌다"는 함정, (3) 전에는 이렇게 하던 것을 이제 이렇게 한다는 전후 비교. 개념 정의나 목차 소개는 고르지 마라.',
    '- hookTemplateId: 고른 토막에 맞는 틀 번호 하나.',
    '- hook: 그 틀의 대괄호를 자막에서 읽은 실제 값으로 채운 두 줄. 줄바꿈(\\n)으로 나누고 한 줄 14자 이내. ★예시 문장을 베끼지 마라★ 예시의 숫자나 사례는 이 강의 것이 아니다. 강조할 한 덩어리를 ** 로 감싼다.',
    '- why: 왜 이 토막인지 한 줄. 발행물에는 안 나간다.',
    '- title: 40자 이내. 쇼츠 제목이다. 해시태그는 넣지 마라(태그는 따로 준다).',
    '- summary: 2~3문장. 이 토막에서 무엇을 보여 주는지.',
    '- tags: 6~10개. 한국어 위주.',
    '- outro: 마지막 2초에 띄울 한 줄. 20자 이내. 전체 강의로 가라는 말을 담되 명령형은 쓰지 마라(예: "전체 강의는 채널에 있어요").',
  ].join('\n');

  const stream = client.messages.stream({
    model: config.claudeModel,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ShortPlanSchema) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const final = await stream.finalMessage();
  recordUsage({
    kind: 'claude',
    step: 'script',
    model: config.claudeModel,
    inputTokens: final.usage?.input_tokens,
    outputTokens: final.usage?.output_tokens,
  });

  const block = final.content.find((c) => c.type === 'text');
  if (!block || block.type !== 'text') throw new Error('쇼츠 계획 응답이 비었습니다.');
  const plan = ShortPlanSchema.parse(JSON.parse(block.text));

  const fixed = snapToCues(plan, parsed, minSec, maxSec);
  const template = templates.find((t) => t.id === fixed.hookTemplateId) ?? templates[0];
  return { plan: fixed, parsed, template };
}

/**
 * 모델이 준 시각을 자막 경계로 당긴다.
 *
 * ★0.4초 어긋나면 첫 글자가 잘린다★ 모델은 30초 단위 묶음을 보고 답하므로 시각이 대충
 * 맞는다. 말이 시작되는 자막의 시작점으로 당기고, 말이 끝나는 자막의 끝점까지 민다.
 * 쇼츠는 첫 1초가 전부라 첫 음절이 잘리면 그 편은 거기서 끝이다.
 */
export function snapToCues(plan: ShortPlan, parsed: ParsedSrt, minSec: number, maxSec: number): ShortPlan {
  const cues = parsed.cues;
  if (!cues.length) return plan;

  // 시작: 요청한 시각 이상에서 가장 가까운 자막의 시작. 없으면 마지막 자막.
  const startCue = cues.find((c) => c.end > plan.startSec) ?? cues[cues.length - 1];
  const start = Math.max(0, startCue.start - 0.15);

  // 끝: 상한 안에서 말이 끝나는 마지막 자막의 끝.
  const hardEnd = start + maxSec;
  let end = start + minSec;
  for (const c of cues) {
    if (c.start < start) continue;
    if (c.end > hardEnd) break;
    end = c.end;
  }
  // 자막이 띄엄띄엄해 최소 길이를 못 채우면 상한까지 민다 — 영상 끝은 넘기지 않는다.
  if (end - start < minSec) end = Math.min(hardEnd, parsed.durationSec);
  return { ...plan, startSec: Number(start.toFixed(2)), endSec: Number((end + 0.25).toFixed(2)) };
}
