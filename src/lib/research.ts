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
export async function researchRecentInfo(params: { dateLabel: string; topic?: string; kind?: 'topic' | 'landscape' }): Promise<string> {
  if (config.researchProvider === 'anthropic') return researchWithClaude(params);
  if (!config.openaiApiKey) {
    console.warn('  · RESEARCH_PROVIDER=openai 이지만 OPENAI_API_KEY 없음 → Claude 웹서치로 대체');
    return researchWithClaude(params);
  }
  const result = await researchWithOpenAI(params);
  // OpenAI 웹서치 실패 시 Claude 로 한 번 더 시도(완전히 리서치 없이 진행하기보단 낫다).
  return result || researchWithClaude(params);
}

function buildQuery(topic?: string, kind: 'topic' | 'landscape' = 'topic'): string {
  // 'landscape': 기초(basics) 개념 영상용 — 주제가 무엇이든 "지금 현재의 최신 모델 지형"을 알아야
  // GPT-4o 같은 이미 구세대가 된 모델을 대표 예시로 드는 실수를 막는다(학습 시점 지식은 낡음).
  if (kind === 'landscape') {
    return '지금 현재 각 회사의 최신 주력 대형 언어 모델(LLM)이 무엇인지 — OpenAI, Anthropic(Claude), Google(Gemini), Meta 등 회사별 가장 최근 출시된 대표 모델의 정확한 이름·버전과 대략의 컨텍스트 길이. 이미 구세대가 된 모델(예: GPT-4o, GPT-4 Turbo)이 아니라 "가장 최신" 모델';
  }
  return topic
    ? `"${topic}"에 대한 최신 소식·업데이트·수치·논쟁`
    : '최근 1~2개월 사이 AI 업계에서 화제가 된 모델·제품·논쟁·연구 발표';
}

const RESEARCH_INSTRUCTIONS = [
  '너는 정확성을 최우선으로 하는 팩트체커 겸 리서치 어시스턴트다.',
  '반드시 web_search 도구를 실제로 호출해서 검색부터 하고, 검색 결과에 명시적으로 나온 내용만 답한다.',
  '검색 없이 너의 기억(학습 데이터)만으로 날짜·버전·수치·출시일을 답하는 것은 절대 금지다 — 기억은 틀릴 수 있고, 틀린 날짜를 자신있게 말하는 것보다 "확인 안 됨"이 훨씬 낫다.',
  '각 항목에는 근거가 된 출처(매체명 또는 URL)를 함께 표기한다. 출처를 댈 수 없는 항목은 아예 쓰지 않는다.',
].join(' ');

function researchPrompt(dateLabel: string, query: string): string {
  return [
    `오늘은 ${dateLabel} 이다. ${query}를 web_search 도구로 실제 검색해라(검색 없이 답하지 말 것).`,
    '결과는 영상 대본 작성에 바로 참고할 수 있도록, 핵심 사실·수치·날짜·출처를 8~12개의 한국어 불릿으로 정리해라.',
    '각 불릿 끝에 (출처: OO) 형식으로 출처를 붙여라.',
    '검색 결과로 확인 안 되는 내용, 특히 정확한 날짜·버전 번호는 절대 추측해서 쓰지 말고 그냥 제외해라. 항목이 적어도 괜찮다 — 확인된 사실만 남겨라.',
  ].join(' ');
}

/** 저비용 provider: OpenAI Responses API + 내장 web_search 툴 (gpt-4.1-mini 기본값). tool_choice 로 검색을 강제한다. */
async function researchWithOpenAI(params: { dateLabel: string; topic?: string; kind?: 'topic' | 'landscape' }): Promise<string> {
  const { dateLabel, topic, kind } = params;
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const query = buildQuery(topic, kind);
  try {
    const res = await client.responses.create({
      model: config.openaiResearchModel,
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
      input: [
        { role: 'system', content: RESEARCH_INSTRUCTIONS },
        { role: 'user', content: researchPrompt(dateLabel, query) },
      ],
    });
    const text = (res.output_text ?? '').trim();
    console.log(`  · 리서치(OpenAI) 결과 ${text.length}자 — 미리보기: ${text.slice(0, 120).replace(/\n/g, ' ')}...`);
    return text;
  } catch (e) {
    console.warn('  · 리서치(OpenAI 웹서치) 실패(무시):', (e as Error).message);
    return '';
  }
}

/** 폴백/대체 provider: Claude + 서버사이드 web_search 툴. tool_choice 로 검색을 강제한다. */
async function researchWithClaude(params: { dateLabel: string; topic?: string; kind?: 'topic' | 'landscape' }): Promise<string> {
  const { dateLabel, topic, kind } = params;
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });
  const query = buildQuery(topic, kind);
  try {
    const res = await client.messages.create({
      model: config.claudeModel,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      tool_choice: { type: 'tool', name: 'web_search' },
      system: RESEARCH_INSTRUCTIONS,
      messages: [{ role: 'user', content: researchPrompt(dateLabel, query) }],
    });

    if (res.stop_reason === 'refusal') return '';
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    console.log(`  · 리서치(Claude) 결과 ${text.length}자 — 미리보기: ${text.slice(0, 120).replace(/\n/g, ' ')}...`);
    return text;
  } catch (e) {
    console.warn('  · 리서치(Claude 웹서치) 실패(무시, 리서치 없이 진행):', (e as Error).message);
    return '';
  }
}
