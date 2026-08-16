import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { recordUsage } from './usage.js';
import { parseSrt, timedOutline, stampFromSeconds, type ParsedSrt } from './srt.js';

/**
 * 직접 만든 강의 영상의 유튜브 메타데이터를 자막에서 뽑는다.
 *
 * ★대본을 새로 쓰는 것이 아니다★ 이 영상은 이미 완성돼 있다. 여기서 하는 일은
 * "이미 있는 내용을 정확히 요약해 옮기는 것"뿐이다. 그래서 파이프라인의 다른 대본
 * 생성기와 정반대의 지침을 준다 — 없는 내용을 지어내면 안 되고, 재미있게 각색해서도
 * 안 되며, 강사가 실제로 한 말을 벗어나면 안 된다.
 */

export const CourseMetaSchema = z.object({
  /** 유튜브 제목. 100자 상한이지만 실제로는 60자 안쪽이 잘 읽힌다. */
  title: z.string(),
  /** 설명란 본문(챕터 목록은 코드가 따로 붙인다). */
  summary: z.string(),
  /** 이 강의에서 실제로 다룬 것들 — 설명란에 목록으로 들어간다. */
  keyPoints: z.array(z.string()),
  tags: z.array(z.string()),
  /** 챕터 — label 은 짧게, at 은 "12:34" 형태로 자막에 실제로 있는 시각. */
  chapters: z.array(z.object({ at: z.string(), label: z.string() })),
  /** 썸네일에 크게 박을 짧은 문구(12자 안쪽). */
  thumbnailHeadline: z.string(),
  /** 썸네일 구석 배지 — 어느 과정의 몇 번째인지. */
  thumbnailBadge: z.string(),
});
export type CourseMeta = z.infer<typeof CourseMetaSchema>;

/** "12:34" → 754. 형식이 틀렸으면 NaN. */
function parseStamp(s: string): number {
  const p = s.trim().split(':').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return NaN;
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return NaN;
}

/**
 * ★모델이 만든 챕터를 그대로 믿지 않는다★
 * 유튜브 챕터에는 규칙이 있다. 첫 챕터는 반드시 0:00 이어야 하고, 시각이 오름차순이어야
 * 하며, 최소 3개에 각 구간이 10초 이상이어야 한다. 하나라도 어긋나면 유튜브가 챕터를
 * 통째로 무시한다 — 조용히. 그래서 여기서 정리하고, 살릴 수 없으면 빈 배열로 돌려
 * "챕터 없음"이 되게 한다(깨진 목록이 설명란에 남는 것보다 낫다).
 */
export function normalizeChapters(
  chapters: { at: string; label: string }[],
  durationSec: number,
): { at: string; label: string }[] {
  const seen = new Set<number>();
  const items = chapters
    .map((c) => ({ sec: parseStamp(c.at), label: (c.label || '').trim() }))
    .filter((c) => Number.isFinite(c.sec) && c.sec >= 0 && c.sec < durationSec - 5 && c.label)
    .sort((a, b) => a.sec - b.sec)
    .filter((c) => {
      const k = Math.round(c.sec);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  if (!items.length) return [];
  // 첫 챕터는 0:00 이어야 한다 — 아니면 맨 앞에 하나 만들어 붙인다.
  if (items[0].sec > 0) items.unshift({ sec: 0, label: '시작' });

  // 10초 미만 간격은 뒤엣것을 버린다.
  const spaced: typeof items = [];
  for (const it of items) {
    if (!spaced.length || it.sec - spaced[spaced.length - 1].sec >= 10) spaced.push(it);
  }
  if (spaced.length < 3) return [];
  return spaced.map((c) => ({ at: stampFromSeconds(c.sec), label: c.label }));
}

/** 설명란을 조립한다 — 요약 + 다룬 내용 + 챕터. 푸터는 업로드 단계가 붙인다. */
export function buildDescription(meta: CourseMeta, chapters: { at: string; label: string }[]): string {
  const parts = [meta.summary.trim()];
  if (meta.keyPoints.length) {
    parts.push(['이 강의에서 다루는 것', ...meta.keyPoints.map((k) => `· ${k}`)].join('\n'));
  }
  if (chapters.length) {
    parts.push(['목차', ...chapters.map((c) => `${c.at} ${c.label}`)].join('\n'));
  }
  return parts.join('\n\n');
}

export interface CourseMetaInput {
  /** 시리즈명 — 제목 맨 앞에 붙는다. 예: "AI챔피언 강사양성과정" */
  seriesTitle: string;
  /** 회차 번호 — 파일명 순번을 그대로 쓴다. 제목의 [N]. */
  order: number;
  /** 자막 원문(SRT). */
  srt: string;
  /** 파일 이름에서 뽑은 모듈 표시 — 예: "2일차 오전 M01". 제목 앞에 붙일 수 있다. */
  moduleLabel: string;
  /** 파일 이름에서 뽑은 원래 주제 — 모델에게 힌트로 준다. */
  filenameTopic: string;
  /** 과정 이름 — 설명·배지에 쓴다. */
  courseName: string;
}

export async function generateCourseMeta(
  input: CourseMetaInput,
): Promise<{ meta: CourseMeta; parsed: ParsedSrt; chapters: { at: string; label: string }[]; description: string }> {
  const parsed = parseSrt(input.srt);
  if (parsed.cues.length < 5) {
    throw new Error(`자막에서 읽어낸 대사가 ${parsed.cues.length}개뿐입니다 — 파일이 온전한지 확인하세요.`);
  }
  const outline = timedOutline(parsed, 60);
  const lengthLabel = stampFromSeconds(parsed.durationSec);

  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  const system = [
    '너는 교육 영상의 유튜브 메타데이터를 쓰는 편집자다.',
    '★이 영상은 이미 완성돼 있다★ 너는 대본을 쓰는 것이 아니라, 이미 녹화된 강의의 자막을 읽고 그 내용을 정확히 옮기는 일을 한다.',
    '자막에 없는 내용을 절대 지어내지 마라. 강사가 하지 않은 말, 다루지 않은 도구·개념·수치를 넣으면 안 된다.',
    '★후킹은 하되 거짓말은 하지 마라★ 이 강의는 실제로 유료 강사양성과정이다. 그 사실 자체가 이미 가장 센 후킹이므로 "충격", "99%가 모르는" 같은 없는 말을 지어낼 이유가 없다. 강의에 없는 내용을 있다고 하거나 과장된 효과를 약속하는 것만 금지다 — 세게 말하는 것 자체는 괜찮다.',
    '시청자는 한국어 사용자이고, 이 영상을 찾는 사람은 "이 강의에서 무엇을 배우는지"를 알고 싶어 한다.',
  ].join(' ');

  const user = [
    `과정: ${input.courseName}`,
    `모듈: ${input.moduleLabel}`,
    `파일명이 말하는 주제: ${input.filenameTopic}`,
    `영상 길이: ${lengthLabel}`,
    '',
    '아래는 이 강의의 자막을 1분 단위로 묶은 것이다. 대괄호 안이 그 대목이 시작되는 시각이다.',
    '=== 자막 시작 ===',
    outline,
    '=== 자막 끝 ===',
    '',
    '요구사항:',
    `- title: 35~50자. 앞에 시리즈명과 회차가 코드로 붙으므로("${input.seriesTitle} [${input.order}] ")  그 부분은 쓰지 마라. 이 강의를 안 본 사람이 "이건 봐야겠는데" 하고 누를 만한 문장으로 써라 — 다룬 내용을 정확히 담되 밋밋한 목차 제목("~에 대하여", "~ 이해하기")은 피한다.`,
    '- summary: 3~5문장. 이 강의에서 무엇을 어떤 순서로 다루는지, 누가 보면 좋은지. 자막에 나온 내용만.',
    '- keyPoints: 4~7개. 각 20자 안쪽. 실제로 다룬 것만 — 다루지 않은 일반론을 채워 넣지 마라.',
    '- tags: 8~12개. 한국어 위주로, 이 주제를 찾을 때 칠 만한 말.',
    `- chapters: 5~10개. ★at 은 위 자막에 실제로 나온 시각 중에서 골라라★ 지어낸 시각을 쓰면 목차가 엉뚱한 곳을 가리킨다. 첫 챕터는 반드시 "0:00". label 은 12자 안쪽. 영상 길이(${lengthLabel})를 넘는 시각은 쓰지 마라.`,
    '- thumbnailHeadline: 10자 안쪽. 이 회차에서 가장 궁금하게 만드는 한마디. 명사 나열 말고 질문이나 단언으로. (예: "챗봇과 뭐가 다른가", "프롬프트는 숨어 있다") 썸네일에는 이것과 별도로 시리즈 공통 문구가 함께 박히므로, 여기서는 이 회차만의 것을 써라.',
    `- thumbnailBadge: "${input.moduleLabel}" 를 짧게 줄인 것(8자 안쪽).`,
    `- summary 첫 문장은 이 과정이 어떤 것인지 밝히는 데 쓴다 — 실제 유료 강사양성과정이라는 사실을 담되 담백하게.`,
  ].join('\n');

  const stream = client.messages.stream({
    model: config.claudeModel,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(CourseMetaSchema) },
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
  if (!block || block.type !== 'text') throw new Error('메타데이터 응답이 비었습니다.');
  const meta = CourseMetaSchema.parse(JSON.parse(block.text));

  const chapters = normalizeChapters(meta.chapters, parsed.durationSec);
  if (meta.chapters.length && !chapters.length) {
    console.warn(`  · 챕터를 살릴 수 없어 뺐습니다(모델이 준 ${meta.chapters.length}개가 유튜브 규칙에 안 맞음)`);
  }
  return { meta, parsed, chapters, description: buildDescription(meta, chapters) };
}
