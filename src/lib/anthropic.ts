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
  /** 웹서치로 미리 조사한 최신 정보 요약(research.ts) — 있으면 대본에 사실관계를 반영. */
  research?: string;
}): Promise<Script> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  const { mode, targetMinutes, language, dateLabel, recentTitles = [], customTopic, research } = params;

  // customTopic 이 한 줄 주제가 아니라 상세 브리핑(설치 방법·단계·목록 등)일 수 있다.
  // 그런 경우 Claude 가 자기 판단으로 요약·생략하지 않도록, 원문 내용을 빠짐없이 충실히 반영하게 강제한다.
  const isBrief = Boolean(customTopic) && (customTopic!.length > 120 || /\n/.test(customTopic!));
  const themeGuide = customTopic
    ? isBrief
      ? [
          '아래 사용자 브리핑을 "원문 그대로의 콘텐츠 명세"로 취급한다. 네 마음대로 요약·생략·재해석하지 말 것.',
          '브리핑에 담긴 모든 항목·단계·사실을 빠짐없이 영상에 담고, 제시된 순서를 최대한 유지한다.',
          '특히 설치 방법·설정 절차·명령어·순서형 내용은 반드시 한 단계당 하나의 씬으로 나눠 구체적으로 설명한다(어느 단계도 건너뛰지 말 것).',
          '내용이 많아 목표 분량을 넘기면, 분량보다 "브리핑 내용 완전 반영"을 우선한다.',
          '',
          `=== 사용자 브리핑 시작 ===\n${customTopic}\n=== 사용자 브리핑 끝 ===`,
        ].join('\n')
      : `사용자가 지정한 주제 "${customTopic}" 를 정확히 이 주제로 다룬다. 주제에서 벗어나지 말 것.`
    : mode === 'trend'
      ? '최신 AI 트렌드/뉴스/신기술을 다룬다. 최근 몇 달 사이 화제가 된 모델, 제품, 논쟁, 업계 흐름 중 하나를 골라 깊이 있게 설명한다.'
      : 'AI 를 처음 접하는 사람도 이해할 수 있는 AI 기초 상식/핵심 개념을 다룬다. (예: LLM 작동 원리, 토큰, 임베딩, RAG, 파인튜닝, 프롬프트, 에이전트, 확산모델 등)';

  const avoid =
    !customTopic && recentTitles.length > 0
      ? `\n\n최근 발행한 제목들과 겹치지 않는 새로운 주제를 골라라:\n- ${recentTitles.join('\n- ')}`
      : '';

  // 웹서치로 조사한 최신 정보(research.ts) — 있으면 이 사실관계를 바탕으로 대본을 쓰게 한다.
  // (Claude 학습 데이터 시점보다 최신 소식을 반영하기 위함. 지어내지 말고 여기 있는 사실만 활용.)
  const researchBlock = research?.trim()
    ? [
        '',
        '=== 웹서치로 조사한 최신 정보(참고용) 시작 ===',
        research.trim(),
        '=== 웹서치로 조사한 최신 정보 끝 ===',
        '위 리서치에 나온 사실·수치·날짜·출처를 대본에 적극 반영해라.',
        '중요: 날짜·버전 번호·출시일·수치처럼 "틀리면 바로 티나는" 구체적 사실은 위 리서치에 명시된 것만 써라.',
        '리서치에 없는 날짜/수치는 절대 추측해서 채워넣지 말 것 — 아래 "구체적으로 쓰라"는 지침보다 이 규칙이 우선이다.',
        '리서치가 비어 있거나 부족하면, 그 부분은 날짜·수치 없이 개념 설명 위주로 쓰거나 "정확한 시점은 확인되지 않았지만" 식으로 완곡하게 표현해라.',
      ].join('\n')
    : research === undefined
      ? ''
      : '리서치 결과가 없다(웹서치 실패 또는 확인된 정보 없음). 이 경우 날짜·버전·수치 등 최근 사실을 단정적으로 지어내지 말고, 검증 가능한 일반 개념 설명 위주로 써라.';

  // 분량 가이드: 10분 ≈ 약 8,500자 한국어 나레이션.
  const targetChars = Math.round(targetMinutes * 850);

  // 대본 난이도/전문성 (CONTENT_LEVEL). "너무 쉽게만 풀어줘서 전문적인 영상이 안 나온다"는
  // 피드백에 따라 기본값(expert)은 실무자 대상으로 깊이 있게 쓴다.
  const levelGuides: Record<string, string> = {
    basic:
      '시청자는 이 주제를 처음 접하는 완전 초보다. 전문 용어는 최대한 풀어쓰고, 친절한 비유와 쉬운 예시로 눈높이를 낮춰 설명한다.',
    intermediate:
      '시청자는 AI/IT에 어느 정도 익숙한 사람이다. 기초 개념 설명은 짧게 짚고 넘어가고, 실무 예시·구체적 수치·최신 사례 위주로 균형 있게 설명한다.',
    expert:
      [
        '이 채널은 실무자·전문가 시청자를 대상으로 한다. 초등학생 눈높이로 풀어쓰지 않는다.',
        '전문 용어는 순화하지 않고 그대로 쓰되, 처음 등장할 때만 한 문장으로 짧게 정의하고 이후로는 계속 전문 용어로 서술한다.',
        '"쉽게 말하면", "간단히 설명하면", "초등학생도 이해하는" 같은 눈높이를 낮추는 표현을 쓰지 않는다.',
        '구체적인 수치·벤치마크·버전명·회사명·날짜·출처를 최대한 명시하고, 실무에 바로 쓸 수 있는 디테일(설정값, 한계, 트레이드오프, 실패 사례)을 반드시 포함한다.',
      ].join(' '),
  };
  const levelGuide = levelGuides[config.contentLevel] ?? levelGuides.expert;

  const system = [
    '너는 교육 유튜브 채널의 수석 작가이자 연출가다.',
    '영상은 씬마다 "깨끗한 흑백 등각(isometric) 삽화 한 장 + 화면 하단 자막(나레이션) + 배경음악"으로 구성되는 설명 영상이다. (손그림/판서/플래시 애니메이션이 아니다.)',
    'diagram/comparison 씬은 그림 대신 코드로 그린 등각 모션 그래픽(떠 있는 원반+라벨 카드, 화살표)이 자동으로 들어간다.',
    '시청자는 한국어 사용자다. 흥미롭게, 그러나 정확하고 밀도 있게 설명해야 한다.',
    levelGuide,
    '과장·낚시성 표현은 피한다. 이해는 추상적 비유·은유가 아니라 실제 사례·구체적 수치·단계별 설명으로 돕는다. 비유는 꼭 필요할 때만 최소한으로.',
    'narration 은 성우가 그대로 읽을 수 있는 완결된 구어체 문장으로 작성한다. (마크다운/이모지/괄호 지시문 금지)',
    'heading·bullets 는 보조 데이터일 뿐 화면 자막으로는 나레이션이 쓰이므로, 짧고 핵심만 담는다.',
    'illustration 은 이 씬을 한 장의 흑백 등각(isometric) 삽화로 그리기 위한 영어 묘사다. 나레이션이 말하는 사물·행동·화면을, 3/4 등각 각도에서 본 입체 형태(장치·박스·인물 등)로 직접적·직관적으로 그린다(은유 금지, 정면 평면 구도 금지). 화면에 글자는 넣지 않는다.',
  ].join(' ');

  const user = [
    `오늘은 ${dateLabel} 이다. ${targetMinutes}분 분량의 ${language === 'ko' ? '한국어' : language} 영상 대본을 만들어라.`,
    `이번 회차 방향: ${themeGuide}`,
    avoid,
    researchBlock,
    '',
    '요구사항:',
    isBrief
      ? `- 전체 나레이션 합계 글자 수는 약 ${targetChars}자를 "최소 기준"으로 삼되, 브리핑 내용을 다 담기 위해 필요하면 더 길게 써도 된다(분량보다 완전 반영 우선).`
      : `- 전체 나레이션 합계 글자 수는 약 ${targetChars}자(±15%)를 목표로 한다. 이 정도가 ${targetMinutes}분 분량이다.`,
    isBrief
      ? '- 씬(scenes)은 브리핑 내용을 다 담는 데 필요한 만큼 충분히 만든다(단계형 내용은 단계당 1씬). 한 씬의 narration 은 1~2문장으로 짧게(한 화면에 자막이 너무 길게 지나가지 않도록).'
      : '- 씬(scenes)은 18~26개로 잘게 나눈다. 한 씬의 narration 은 1~2문장으로 짧게(한 화면에 자막이 너무 길게 지나가지 않도록).',
    '- 첫 씬은 visual="title" 로 후킹 도입(왜 이 주제가 중요한지)을 담는다. visual="title" 은 이 영상 전체에서 딱 이 첫 씬 한 번만 쓴다 — 중간에 장/화제를 전환하고 싶어도 title 을 또 쓰지 마라(그러면 그 씬마다 AI 그림 한 장 + 줌 효과가 반복돼 영상 전체가 "맨날 같은 그림"처럼 보이는 가장 큰 원인이 된다). 장 전환이 필요하면 quote(소제목이나 전환 문장을 강조 문구로) 또는 bullets 를 대신 써라.',
    '- 중간 씬은 bullets / diagram / comparison / quote / code 다섯 가지만으로 구성한다(title 은 위에서 말했듯 중간에 쓰지 않는다). 한 영상에 한두 타입만 반복되지 않게 다섯 가지를 고루 번갈아 쓰고, 다루는 내용에 실제 파일/코드가 있으면 code 를, 여러 항목이 하나에 모이거나 퍼지는 관계면 diagram 을 적극 활용해라.',
    '- visual="code" 는 이 대본에서 가장 중요한 "구체성" 장치다 — 다룰 대상에 실제로 존재하는 파일/설정/코드가 있다면(예: 스킬 정의 파일, 훅 스크립트, 플러그인 매니페스트, 설정 파일, API 요청 예시, 커맨드 한 줄) 말로 설명만 하지 말고 반드시 code 씬으로 화면에 그대로 보여준다. code 필드에 filename(실제 있을 법한 경로), language, code(실제 동작할 법한 8~14줄짜리 최소 예시, 지어내되 현실적이고 정확한 문법으로)를 채운다. 이런 소재가 있는 대본이면 최소 1개 이상 반드시 넣는다.',
    '- visual="bullets" 인 씬은 bullets 배열에 짧은 항목을 반드시 2~5개 채운다(빈 배열 금지). 각 항목은 한 화면에 큰 글씨로 뜨는 문구이므로 8~16자 정도로 짧게.',
    '- visual="quote" 인 씬은 narration 자체가 화면에 크게 뜨는 한 문장 임팩트 인용구가 되므로, narration 을 다른 씬보다 짧고 단호한 한 문장으로 쓴다(주석문/설명 붙이지 말고 그 자체로 완결된 명제).',
    '- visual="diagram" 은 실제로 "여러 요소가 순서/관계로 연결되는" 내용에만 쓴다(흐름, 파이프라인, 구조). 그냥 나열식 정보는 diagram 대신 bullets 를 써라.',
    '- diagram 을 쓰는 씬은 nodes(2~6개)와 edges(화살표)로 개념 흐름을 표현한다. node.id 는 짧은 영숫자, label 은 한국어.',
    '- comparison 씬은 두 개념/접근을 좌우로 비교한다. leftItems/rightItems 각 항목은 카드 안에 한 줄로 들어가야 하므로 12자 이내로 짧게 — "Claude Code, OpenCode 같은 실행기" 처럼 긴 문장을 통째로 넣지 말고 "실행기 직접 구현"처럼 핵심만 압축해라.',
    '- 마지막 씬은 visual="outro" 로 핵심 3줄 요약 + 구독 유도를 담는다.',
    '- title/outro 씬(영상 전체에서 첫 씬과 마지막 씬)은 icon 필드로 렌더링된다(생활코딩 스타일 평면 2D 라인 아이콘, AI 그림 아님). icon 필드를 반드시 채워라. 고를 수 있는 값: document(문서/자료/정의), chat(질문/대화/논쟁), search(조사/분석/검색), lock(보안/권한/잠금), key(인증/접근권한), database(데이터/저장소), server(인프라/백엔드/실행환경), cloud(클라우드/원격서비스), terminal(코드/커맨드/실행), gear(설정/구성), link(연결/통합/연동), check(완료/검증/성공), warning(주의/오류/리스크), user(개인/사용자), users(팀/커뮤니티), clock(시간/속도/지연), chart(성장/통계/수치), mail(알림/전달).',
    '- icon 선택 원칙: 반드시 그 씬이 실제로 설명하는 대상과 의미가 통하는 것을 골라라 — 장식으로 아무거나 고르면 안 된다. 예: "용어 정의"를 다루면 document나 search, "보안/권한 얘기"면 lock이나 key, "데이터/저장"이면 database, "실행 환경/인프라"면 server나 cloud, "코드/커맨드 예시"면 terminal, "설정값 얘기"면 gear, "여러 도구가 연동됨"이면 link, "결론/맞다"면 check, "위험 경고"면 warning, "숫자/트렌드"면 chart. heading·narration 을 보고 가장 뜻이 맞는 것 하나를 고른다. 애매하면 문서/개념 정의를 뜻하는 document 를 기본값으로.',
    '- 같은 영상 안에서 title 과 outro 가 같은 icon 을 또 쓰지 마라(둘은 보통 다른 국면 — 도입 vs 결론 — 이므로 서로 다른 icon 이 자연스럽다).',
    '- title(제목)은 클릭하고 싶되 정확한 40자 이내.',
    '- thumbnailHeadline: 썸네일에 크게 박을 문구. 가장 중요한 원칙은 "직관적이고 설명적일 것" — 무엇에 대한 영상인지 썸네일만 보고 즉시 알 수 있어야 한다. 반드시 영상의 핵심 대상(제품명/주제명/용어)을 문구 안에 그대로 넣어라. 좋은 예: "제미나이 3.6 플래시 출시가 주는 메시지", "하네스 엔지니어링, 알고 보면 그냥 설정", "RAG가 검색을 바꾸는 방식". 길이는 15~25자 정도로, 제목을 살짝 다듬은 설명형이면 충분하다.',
    '- 절대 하지 말 것: 대상 없이 감탄사/단정만 던지는 낚시성 문구("주력이 됐다", "이게 진짜다", "그거 설정이다" 처럼 무엇에 대한 얘긴지 안 보이는 것). "그거", "이거" 같은 지시대명사로 시작하는 것. "~완벽정리", "~진짜 원리" 같은 뻔한 클리셰. — 짧고 강하게 만들려다 대상이 사라지면 실패다. 짧음보다 "무슨 영상인지 바로 아는 것"이 우선이다.',
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
