import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

/**
 * deck 기반 영상 엔진(signal / deck3d)용 대본 생성기.
 *
 * 기존 illustrated 엔진은 "씬 + 나레이션 + 일러스트" 구조(schema.ts ScriptSchema)를 쓰지만,
 * signal/deck3d 는 "데이터 중심 슬라이드(숫자·지표·관계도)" 구조라 스키마 자체가 다르다.
 * 그래서 여기서 deck.json 을 직접 생성하고, 썸네일·업로드 단계가 쓸 메타(title/description/tags)도 함께 받는다.
 *
 * say = 화면 자막(영어·숫자 그대로), spoken = TTS 발음용(숫자를 한글로 풀어 읽기).
 */

export type DeckSlide = Record<string, unknown>;
export interface GeneratedDeck {
  meta: { title: string; description: string; tags: string[]; thumbnailHeadline: string; topic: string };
  deck: { engine: string; space3d?: boolean; header: string; accent?: string; palette?: string; slides: DeckSlide[] };
}

const SIGNAL_SPEC = `
[SIGNAL 스타일] 딥블랙 배경 + 단일 액센트 + 큰 숫자 + 압도적 여백의 데이터 중심 화면.
슬라이드 타입(type):
- claim   : { type:"claim", kicker:"소제목", claim:"큰 문장(<br> 줄바꿈, <em>강조</em> 가능)", lead:"보조설명" }
- big     : { type:"big", kicker, value:"2×", unit:"이상", sub:"영문 소문자 모노 라벨", lead:"보조설명" }
- convert : { type:"convert", kicker, from:"이전값", fromLabel:"모노 라벨", to:"이후값", toLabel:"모노 라벨", lead }
- metrics : { type:"metrics", kicker, items:[["항목명","값","영문 모노 설명"], ... 3~4개] }
- nodes   : { type:"nodes", kicker, points:[{label:"단계",x:10,y:50}, ...], links:[[0,1],[1,2]],
              steps:[{node:0,say:"..."},{node:1,say:"..."}] }  // 카메라가 단계별로 강조하며 진행
  · points 의 x,y 는 0~100 백분율 좌표. 3~5개 노드를 화면에 고르게 배치.
  · nodes 는 steps 각각이 하나의 나레이션 비트가 된다(steps 에만 say/spoken 을 쓴다).
규칙: 화면에 요소를 적게 — 숫자와 짧은 라벨 위주. 장식 금지. 12~16개 슬라이드.
`;

const DECK3D_SPEC = `
[3D 기하학 스타일] 3D 공간에 카드가 놓이고 카메라가 이동하며 설명하는 화면.
슬라이드 타입(type):
- title : { type:"title", kicker, title:"큰 제목(\\n 로 2줄)", lead:"보조설명" }
- stat  : { type:"stat", kicker, head:"소제목", stats:[["값","라벨"], ... 3개] }
- flow  : { type:"flow", kicker, head:"소제목", nodes:[{label:"단계",say:"..."}, ... 3~5개] }
          // 카메라가 노드를 하나씩 따라간다. nodes 각각이 나레이션 비트.
- cmp   : { type:"cmp", kicker, head, left:["제목","항목","항목"], right:["제목","항목","항목"] }
- quote : { type:"quote", quote:"한 문장 임팩트(\\n 로 2줄)" }
규칙: 12~16개 슬라이드. 같은 타입 3연속 금지. flow 는 2개 이상 넣어 카메라 추적을 살린다.
`;

export async function generateDeck(params: {
  topic: string;
  style: 'signal' | 'signal3d' | 'deck3d';
  targetMinutes: number;
  dateLabel: string;
  research?: string;
}): Promise<GeneratedDeck> {
  const { topic, style, targetMinutes, dateLabel, research } = params;
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  // 한국어 나레이션은 초당 약 7자 → 목표 분량(자)
  const targetChars = Math.round(targetMinutes * 460);

  const system = [
    '너는 데이터 중심 설명 영상의 수석 작가다. 화면은 슬라이드로, 목소리는 나레이션으로 나간다.',
    '가장 중요한 원칙: 추상적인 컨셉만 던지지 말고 문서·자료에 있는 실제 사실과 수치를 근거로 설명한다.',
    '그리고 각 사실마다 "그래서 사용자에게 무엇이 달라지는가(체감)"를 같은 나레이션 안에서 이어 말한다.',
    '',
    '각 슬라이드(및 nodes/flow 의 각 단계)에는 두 필드를 쓴다:',
    '- say   : 화면 하단 자막. 제품명·숫자·단위는 영어와 아라비아 숫자 그대로 쓴다. (예: "Opus 4.8보다 2배, $25")',
    '- spoken: 성우 발음용. say 와 같은 내용이되 숫자·영문을 한국어 발음대로 풀어 쓴다.',
    '          (예: "오퍼스 사 점 팔보다 두 배, 이십오 달러") — 아라비아 숫자와 로마자를 절대 남기지 마라.',
    'say 에 숫자·영문이 전혀 없으면 spoken 은 생략해도 된다.',
    '',
    style === 'deck3d' ? DECK3D_SPEC : SIGNAL_SPEC,
    '',
    `오늘은 ${dateLabel} 이다. 나레이션 합계 글자 수는 약 ${targetChars}자 이상이어야 ${targetMinutes}분이 나온다 — 반드시 채워라.`,
    '출력은 JSON 하나만. 설명·마크다운·코드펜스 금지.',
    '형식: {"meta":{"title":"영상 제목(40자 이내)","description":"유튜브 설명(줄바꿈 포함)","tags":["키워드", ...8~15개],',
    '"thumbnailHeadline":"썸네일 문구(15~25자, 대상이 분명하게)"},',
    '"deck":{"header":"화면 좌상단에 계속 뜨는 머리글(짧게)","slides":[ ...슬라이드... ]}}',
  ].join('\n');

  const user = [
    `주제: ${topic}`,
    research?.trim() ? `\n=== 웹서치로 조사한 최신 정보(이 사실만 사용) ===\n${research.trim()}\n=== 끝 ===\n리서치에 없는 날짜·수치는 지어내지 마라.` : '',
    '이 주제로 위 형식의 JSON 을 출력하라.',
  ].join('\n');

  const stream = client.messages.stream({
    model: config.claudeModel,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') throw new Error('Claude 가 대본 생성을 거부했습니다(안전상).');
  const block = final.content.find((b) => b.type === 'text');
  let text = block && 'text' in block ? block.text.trim() : '';
  if (!text) throw new Error('deck 생성 실패: 텍스트 출력 없음');
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: { meta?: Record<string, unknown>; deck?: Record<string, unknown> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('deck JSON 파싱 실패: ' + text.slice(0, 200));
  }
  const slides = (parsed.deck?.slides as DeckSlide[]) || [];
  if (!slides.length) throw new Error('deck 에 slides 가 비어 있습니다');

  const meta = parsed.meta || {};
  return {
    meta: {
      title: String(meta.title || topic).slice(0, 100),
      description: String(meta.description || ''),
      tags: Array.isArray(meta.tags) ? (meta.tags as string[]).map(String).slice(0, 15) : [],
      thumbnailHeadline: String(meta.thumbnailHeadline || meta.title || topic).slice(0, 60),
      topic,
    },
    deck: {
      engine: style === 'deck3d' ? 'timed' : 'signal',
      // signal3d = SIGNAL 디자인 그대로 + 3D 깊이 카메라(텍스트는 DOM 이라 선명하게 유지)
      space3d: style === 'signal3d',
      header: String(parsed.deck?.header || meta.title || ''),
      accent: '#2ee87a',
      palette: 'noir',
      slides,
    },
  };
}
