import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config.js';

/**
 * 대본 작성 전에 실제 웹서치로 최신 정보를 조사한다.
 *
 * Claude 의 학습 데이터는 특정 시점에서 멈춰 있어("최신 정보도 아닌 것 같다"는 피드백대로)
 * trend 모드/구체적 주제는 검색 없이는 오래된 지식으로만 쓰이게 된다. 검색은 대본 자체를
 * 쓰는 것보다 훨씬 가벼운 작업이라, 비싼 Opus 대신 이미 이 파이프라인에 있는 OpenAI 키로
 * 처리한다(RESEARCH_PROVIDER=openai 기본값). Claude 웹서치는 OPENAI_API_KEY 가 없거나
 * 명시적으로 anthropic 을 선택했을 때만 폴백으로 쓴다.
 *
 * 구조화 출력(output_config.format)과 웹서치 툴 조합은 공식 문서에 호환성이 명시돼
 * 있지 않으므로, 이 리서치 호출은 어느 provider 를 쓰든 구조화 출력 없이 일반 텍스트로
 * 받고 그 결과를 generateScript() 호출의 참고자료로 넘기는 2단계 방식을 쓴다.
 *
 * @returns 리서치 요약 텍스트. 실패하면 빈 문자열(호출부는 리서치 없이 진행).
 */
export async function researchRecentInfo(params: { dateLabel: string; topic?: string }): Promise<string> {
  if (config.researchProvider === 'anthropic') return researchWithClaude(params);
  if (!config.openaiApiKey) {
    console.warn('  · RESEARCH_PROVIDER=openai 이지만 OPENAI_API_KEY 없음 → Claude 웹서치로 대체');
    return researchWithClaude(params);
  }
  const result = await researchWithOpenAI(params);
  // OpenAI 웹서치 실패 시 Claude 로 한 번 더 시도(완전히 리서치 없이 진행하기보단 낫다).
  return result || researchWithClaude(params);
}

function buildQuery(topic?: string): string {
  return topic
    ? `"${topic}"에 대한 최신 소식·업데이트·수치·논쟁`
    : '최근 1~2개월 사이 AI 업계에서 화제가 된 모델·제품·논쟁·연구 발표';
}

const RESEARCH_INSTRUCTIONS =
  '너는 유튜브 대본 작가를 위한 리서치 어시스턴트다. 반드시 웹 검색으로 실제 최신 정보를 확인한 뒤에만 답하고, 확실하지 않은 내용은 쓰지 않는다.';

/** 저비용 provider: OpenAI Responses API + 내장 web_search 툴 (gpt-4.1-mini 기본값). */
async function researchWithOpenAI(params: { dateLabel: string; topic?: string }): Promise<string> {
  const { dateLabel, topic } = params;
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const query = buildQuery(topic);
  try {
    const res = await client.responses.create({
      model: config.openaiResearchModel,
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: RESEARCH_INSTRUCTIONS },
        {
          role: 'user',
          content: [
            `오늘은 ${dateLabel} 이다. ${query}를 웹 검색으로 조사해라.`,
            '결과는 영상 대본 작성에 바로 참고할 수 있도록, 핵심 사실·수치·날짜·출처를 8~12개의 한국어 불릿으로 정리해라.',
            '검색으로 확인 안 되는 내용은 추측해서 쓰지 말고 제외해라.',
          ].join(' '),
        },
      ],
    });
    return (res.output_text ?? '').trim();
  } catch (e) {
    console.warn('  · 리서치(OpenAI 웹서치) 실패(무시):', (e as Error).message);
    return '';
  }
}

/** 폴백/대체 provider: Claude + 서버사이드 web_search 툴. */
async function researchWithClaude(params: { dateLabel: string; topic?: string }): Promise<string> {
  const { dateLabel, topic } = params;
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });
  const query = buildQuery(topic);
  try {
    const res = await client.messages.create({
      model: config.claudeModel,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      system: RESEARCH_INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            `오늘은 ${dateLabel} 이다. ${query}를 웹 검색으로 조사해라.`,
            '결과는 영상 대본 작성에 바로 참고할 수 있도록, 핵심 사실·수치·날짜·출처를 8~12개의 한국어 불릿으로 정리해라.',
            '검색으로 확인 안 되는 내용은 추측해서 쓰지 말고 제외해라.',
          ].join(' '),
        },
      ],
    });

    if (res.stop_reason === 'refusal') return '';
    return res.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  } catch (e) {
    console.warn('  · 리서치(Claude 웹서치) 실패(무시, 리서치 없이 진행):', (e as Error).message);
    return '';
  }
}
