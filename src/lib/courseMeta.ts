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
    '★발주 기관 이름을 절대 쓰지 마라★ 자막에 특정 기관·부처·기업 이름이 나오더라도 제목·설명·태그·썸네일 문구에는 옮기지 마라. 필요하면 "공공기관", "기관", "공무원" 처럼 일반적인 말로 바꿔 써라. 이 영상들은 특정 발주처를 드러내지 않고 공개된다.',
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
    '- title: 35~55자. ★이 제목 하나로 서야 한다★ 시리즈명도 회차 번호도 앞에 붙지 않는다. 이 영상만 검색으로 마주친 사람이 무슨 내용인지 알고 누를 만해야 한다. "~에 대하여", "~ 이해하기", "~ 활용법" 같은 목차 제목은 아무도 안 누른다 — 다룬 내용을 정확히 담되, 이 강의에서 가장 궁금한 대목을 제목이 먼저 건드려라. 회차·일차·모듈 번호는 제목에 쓰지 마라.',
    '- summary: 3~5문장. 이 강의에서 무엇을 어떤 순서로 다루는지, 누가 보면 좋은지. 자막에 나온 내용만.',
    '- keyPoints: 4~7개. 각 20자 안쪽. 실제로 다룬 것만 — 다루지 않은 일반론을 채워 넣지 마라.',
    '- tags: 8~12개. 한국어 위주로, 이 주제를 찾을 때 칠 만한 말.',
    `- chapters: 5~10개. ★at 은 위 자막에 실제로 나온 시각 중에서 골라라★ 지어낸 시각을 쓰면 목차가 엉뚱한 곳을 가리킨다. 첫 챕터는 반드시 "0:00". label 은 12자 안쪽. 영상 길이(${lengthLabel})를 넘는 시각은 쓰지 마라.`,
    '- thumbnailHeadline: 8~14자. ★썸네일에서 가장 큰 글씨다. 이 영상의 조회수는 사실상 이 한 줄이 정한다★',
    '  · 물어야 할 것은 "이 강의가 무엇을 가르치나"가 아니라 "지금 사람들이 알고 싶어 안달인 것 중 이 강의가 답해 주는 게 뭔가"다. ' +
      '강의 내용을 요약하면 아무도 안 누른다. 자막을 처음부터 끝까지 훑어서, 사람들이 이미 쫓고 있는 것을 강사가 건드리는 대목을 찾아 거기서 뽑아라.',
    '  · ★센 말과 약한 말★ 에이전트, 하네스, MCP, 스킬, 서브에이전트, 바이브코딩, 자동화, RAG, 임베딩, 파인튜닝, 토큰, 컨텍스트, API 처럼 ' +
      '"저게 정확히 뭔지 궁금했다" 소리가 나오는 개념·정체를 잡아라. 반대로 프롬프트, 마크다운, 문서, 엑셀, 파일, 정리, 활용법, 기초, 이해 같은 ' +
      '흔하고 밋밋한 말은 큰 글씨로 쓰지 마라 — 이미 다 아는 말이라 손이 안 간다. 그 말이 정말 이 회차의 핵심이면 통념을 뒤집는 형태로만 써라.',
    '  · 질문이나 단언으로 써라. 명사 나열("스킬과 컨텍스트 엔지니어링")은 최악이다. 좋은 예: "에이전트는 아직 아니다", "손발 잘린 LLM", "하네스가 뭔데", "챗봇과 뭐가 다른가".',
    '  · ★강의에 없는 말은 안 된다★ 세게 쓰되 지어내지 마라. 위 개념어도 강사가 실제로 다룬 것만 쓴다.',
    '  · 시리즈 공통 문구("돈 주고도 못 듣는 강의")는 썸네일 구석에 따로 박히니 여기 넣지 마라. 이 회차에서만 나오는 것을 잡아야 목록에서 서로 구분된다.',
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
  const raw = CourseMetaSchema.parse(JSON.parse(block.text));
  const meta = redactClient(raw);

  const chapters = normalizeChapters(meta.chapters, parsed.durationSec);
  if (meta.chapters.length && !chapters.length) {
    console.warn(`  · 챕터를 살릴 수 없어 뺐습니다(모델이 준 ${meta.chapters.length}개가 유튜브 규칙에 안 맞음)`);
  }
  return { meta, parsed, chapters, description: buildDescription(meta, chapters) };
}

/**
 * 제목·설명·썸네일 문구에서 발주 기관 이름을 지운다.
 *
 * ★자막 본문은 건드리지 않는다★ 강의 중에 기관 이름이 나오는 것까지 다 걸러내려면 영상
 * 자체를 손봐야 하는데 그건 이 파이프라인의 일이 아니다. 다만 그 말이 자막에 있으므로
 * 모델이 제목이나 설명에 그대로 옮겨 적을 수 있고, 그건 채널 앞면에 박히는 글자다.
 *
 * ★프롬프트로만 막지 않는다★ "쓰지 마라"는 지시는 대개 지켜지지만 가끔 새고, 새면
 * 40편 중 어느 하나에서 조용히 새기 때문에 사람이 눈치채기 어렵다. 지시(위 system)와
 * 사후 검사를 둘 다 둔다 — 나가는 글자를 실제로 확인하는 쪽이 최후 방어선이다.
 */
export function redactClient<T extends CourseMeta>(meta: T): T {
  const terms = (process.env.COURSE_REDACT ?? '환경부').split(',').map((s) => s.trim()).filter(Boolean);
  if (!terms.length) return meta;
  const as = (process.env.COURSE_REDACT_AS ?? '공공기관').trim();
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

  let hits = 0;
  const scrub = (s: string) => s.replace(re, () => { hits += 1; return as; });
  const out = {
    ...meta,
    title: scrub(meta.title),
    summary: scrub(meta.summary),
    keyPoints: meta.keyPoints.map(scrub),
    tags: meta.tags.map(scrub),
    chapters: meta.chapters.map((c) => ({ ...c, label: scrub(c.label) })),
    thumbnailHeadline: scrub(meta.thumbnailHeadline),
    thumbnailBadge: scrub(meta.thumbnailBadge),
  };
  if (hits) console.warn(`  · 기관 이름을 제목·설명에서 ${hits}곳 가렸습니다 (${terms.join(', ')} → ${as})`);
  return out as T;
}
