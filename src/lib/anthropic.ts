import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from '../config.js';
import { ScriptSchema, type Script } from '../schema.js';

/**
 * Claude(Opus 4.8) 로 이번 회차 영상 대본을 생성한다.
 * 구조화 출력(Structured Outputs)으로 ScriptSchema 형태의 JSON 을 강제하고,
 * 대본이 길어질 수 있으므로 스트리밍으로 받는다(비스트리밍은 SDK 가 타임아웃으로 차단).
 */
export async function generateScript(params: {
  mode: 'trend' | 'basics';
  targetMinutes: number;
  language: string;
  dateLabel: string;
  recentTitles?: string[];
  customTopic?: string;
}): Promise<Script> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  const { mode, targetMinutes, language, dateLabel, recentTitles = [], customTopic } = params;

  const themeGuide = customTopic
    ? `사용자가 지정한 주제 "${customTopic}" 를 정확히 이 주제로 다룬다. 주제에서 벗어나지 말 것.`
    : mode === 'trend'
      ? '최신 AI 트렌드/뉴스/신기술을 다룬다. 최근 몇 달 사이 화제가 된 모델, 제품, 논쟁, 업계 흐름 중 하나를 골라 깊이 있게 설명한다.'
      : 'AI 를 처음 접하는 사람도 이해할 수 있는 AI 기초 상식/핵심 개념을 다룬다. (예: LLM 작동 원리, 토큰, 임베딩, RAG, 파인튜닝, 프롬프트, 에이전트, 확산모델 등)';

  const avoid =
    !customTopic && recentTitles.length > 0
      ? `\n\n최근 발행한 제목들과 겹치지 않는 새로운 주제를 골라라:\n- ${recentTitles.join('\n- ')}`
      : '';

  // 분량 가이드: 10분 ≈ 약 8,500자 한국어 나레이션.
  const targetChars = Math.round(targetMinutes * 850);

  const system = [
    '너는 교육 유튜브 채널의 수석 작가이자 연출가다.',
    'Excalidraw 손그림 스타일의 플래시 애니메이션 영상용 대본을 쓴다.',
    '시청자는 한국어 사용자이며, 어렵지 않고 흥미롭게, 그러나 정확하게 설명해야 한다.',
    '과장·낚시성 표현은 피하고, 구체적 예시와 비유로 이해를 돕는다.',
    'narration 은 성우가 그대로 읽을 수 있는 완결된 구어체 문장으로 작성한다. (마크다운/이모지/괄호 지시문 금지)',
    'heading·bullets 는 화면에 표시되므로 짧고 핵심만 담는다.',
    'illustration 은 이 씬을 한 장의 흑백 라인아트 삽화로 그리기 위한 영어 묘사다. 구체적인 인물·사물·행동·은유를 담되 화면에 글자는 넣지 않는다.',
  ].join(' ');

  const user = [
    `오늘은 ${dateLabel} 이다. ${targetMinutes}분 분량의 ${language === 'ko' ? '한국어' : language} 영상 대본을 만들어라.`,
    `이번 회차 방향: ${themeGuide}`,
    avoid,
    '',
    '요구사항:',
    `- 전체 나레이션 합계 글자 수는 약 ${targetChars}자(±15%)를 목표로 한다. 이 정도가 ${targetMinutes}분 분량이다.`,
    '- 씬(scenes)은 18~26개로 잘게 나눈다. 한 씬의 narration 은 1~2문장으로 짧게(한 화면에 자막이 너무 길게 지나가지 않도록).',
    '- 첫 씬은 visual="title" 로 후킹 도입(왜 이 주제가 중요한지)을 담는다.',
    '- 중간 씬들은 bullets / diagram / comparison / quote 를 다양하게 섞어 지루하지 않게 한다.',
    '- 각 씬에는 illustration 필드를 반드시 넣는다: 그 씬의 나레이션 내용을 "직접적·직관적으로 그대로" 보여주는 흑백 라인아트 삽화의 영어 시각 묘사. 추상적 은유·비유는 피하고, 실제로 설명하는 사물·행동·화면을 구체적으로 그린다(예: "서버"면 데이터센터 랙, "데이터베이스"면 원통형 DB 아이콘과 표, "로그인"이면 자물쇠와 아이디/비밀번호 입력창). 한 문장~두 문장, 화면에 글자는 넣지 않는다. 매 씬 서로 다른 그림.',
    '- diagram 을 쓰는 씬은 nodes(2~6개)와 edges(화살표)로 개념 흐름을 표현한다. node.id 는 짧은 영숫자, label 은 한국어.',
    '- comparison 씬은 두 개념/접근을 좌우로 비교한다.',
    '- 마지막 씬은 visual="outro" 로 핵심 3줄 요약 + 구독 유도를 담는다.',
    '- title(제목)은 클릭하고 싶되 정확한 40자 이내.',
    '- thumbnailHeadline: 썸네일에 크게 박을 아주 짧고 강한 후킹 문구. 한 줄에 5~9자씩 최대 2줄 분량(전체 18자 이내). 예: "헷갈리는 RAG 5분 완벽정리", "AI가 답을 만드는 진짜 원리". 제목과 달라도 됨, 임팩트 최우선.',
    '- description(설명란)은 실제 줄바꿈(\\n)으로 문단을 나눈다: 먼저 3~5문장 요약, 그다음 빈 줄, 그다음 "다루는 내용:" 아래에 항목마다 줄바꿈해 나열한다. (한 덩어리로 붙여쓰지 말 것)',
    '- tags 는 검색 최적화된 한국어/영어 키워드 8~15개.',
  ].join('\n');

  const stream = client.messages.stream({
    model: config.claudeModel,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ScriptSchema) },
    system,
    messages: [{ role: 'user', content: user }],
  });

  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    throw new Error('Claude 가 대본 생성을 거부했습니다(안전상). 주제를 바꿔 다시 시도하세요.');
  }

  const textBlock = final.content.find((b) => b.type === 'text');
  const text = textBlock && 'text' in textBlock ? textBlock.text : '';
  if (!text) {
    throw new Error(`Claude 대본 생성 실패: 텍스트 출력 없음 (stop_reason=${final.stop_reason}).`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Claude 응답을 JSON 으로 파싱하지 못했습니다.');
  }
  return ScriptSchema.parse(json);
}
