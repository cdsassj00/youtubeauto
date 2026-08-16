import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from '../config.js';
import { ScriptSchema, type Script } from '../schema.js';
import { recordUsage } from './usage.js';
import { buildToneGuide, resolveTone } from './tone.js';
import { resolveArtStyle } from './artStyle.js';
import { levelGuide } from './level.js';
import { VOX_SYSTEM_LINES, voxRequirements } from './voxScript.js';

/** 출력 길이 초과로 JSON 이 도중에 잘렸을 때의 표식 — 이 메시지로 재시도 여부를 판단한다. */
const TRUNCATED_MSG = '대본 JSON 이 출력 도중 잘렸습니다(출력 길이 초과).';

/**
 * 서론 길이 제한 — 엔진과 무관하게 공통이라 한 곳에 두고 각 요구사항 목록에 끼운다.
 *
 * 왜: 직전 회차(생맥주, 8분)는 4분의 1이 지나도록 "이런 기대를 하죠" 수준의 예열이
 * 계속됐다. 프롬프트가 첫 씬을 "후킹 도입"이라고만 하고 서론에 몇 씬을 쓸지는 아무 말도
 * 하지 않아서, 모델이 배경 설명을 앞에 잔뜩 몰아두는 쪽으로 흘렀다.
 */
const INTRO_RULE =
  '- ★서론은 최대 2씬★ 세 번째 씬부터는 이미 본론이어야 한다. 첫 씬 첫 문장에서 이 영상이 뒤집을 통념이나 답할 질문을 곧바로 꺼내라. ' +
  '"오늘은 ~에 대해 알아보겠습니다", "~라는 말 들어보셨나요", "먼저 배경부터 살펴보면" 같은 예열 문장은 쓰지 마라 — 시청자는 그 구간에서 나간다. ' +
  '배경 설명과 용어 정의를 앞에 몰아두지 말고 필요해지는 순간에 한 문장씩 풀어라. 결론이나 반전을 아껴 두지 말고, 무엇을 말할 영상인지 초반에 분명히 밝힌 뒤 그것을 풀어 나가라.';

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

  // 분량 가이드: 실측 결과 한국어 ElevenLabs 나레이션은 초당 약 7자(≈ 분당 420자)로 읽힌다.
  // 이전엔 850자/분으로 잡아 목표가 실제의 두 배였고, 게다가 "씬당 1~2문장 짧게" 지침과 충돌해
  // 모델이 총량을 무시하고 씬당 ~90자만 써서 10분 목표가 4분대로 나오는 심각한 미달이 있었다.
  // 여유를 둬 분당 460자로 잡고(≈ 10분이면 4,600자), 아래 요구사항에서 이 총량을 "반드시 채워야 하는
  // 하한"으로 강하게 못박는다.
  const targetChars = Math.round(targetMinutes * 460);

  // 난이도 지침은 deckgen 과 공유한다(src/lib/level.ts).
  const guide = levelGuide(config.contentLevel);
  // 대본이 "이 영상은 어떤 그림체인지" 알아야 illustration 묘사를 그 화풍에 맞게 쓴다.
  const artStyle = resolveArtStyle(config.artStyle);
  // ★엔진에 따라 대본 요구가 근본적으로 달라진다★
  // 스크랩북(VOX) 엔진은 화면에 도표·불릿이 없고 heading 이 주인공이라, 기본 엔진 지침을
  // 그대로 주면 렌더링되지 않는 씬 타입만 잔뜩 만들어 낸다. 자세한 이유는 voxScript.ts 참고.
  const isVox = config.videoEngine === 'scrapbook';
  // 실사 푸티지 엔진은 화면이 전부 스톡 영상이고, 그 위에 큰 글씨(heading)와 부연 한 줄,
  // 그리고 아주 옅은 시연·사례 표기(sourceNote)가 얹힌다. 도표·코드 화면이 존재하지 않는다.
  const isFootage = config.videoEngine === 'footage';

  const system = [
    '너는 교육 유튜브 채널의 수석 작가이자 연출가다.',
    ...(isVox
      ? VOX_SYSTEM_LINES
      : [
          `영상은 씬마다 "${artStyle.label} 화풍의 삽화 한 장 + 화면 하단 자막(나레이션) + 배경음악"으로 구성되는 설명 영상이다. (손그림/판서/플래시 애니메이션이 아니다.)`,
          'diagram/comparison 씬은 그림 대신 코드로 그린 등각 모션 그래픽(떠 있는 원반+라벨 카드, 화살표)이 자동으로 들어간다.',
        ]),
    '시청자는 한국어 사용자다. 흥미롭게, 그러나 정확하고 밀도 있게 설명해야 한다.',
    guide,
    // 말투는 난이도와 별개의 축이다 — "쉽게 설명한다"와 "유머러스하게 말한다"는 같이 성립한다.
    `말투: ${buildToneGuide(resolveTone(config.narrationTone))}`,
    `오늘은 ${dateLabel} 이다. 모델·제품 예시를 들 때는 "지금 현재" 기준으로 최신인 것을 써라. 네 학습 데이터 시점에 최신이었어도 지금은 이미 구세대가 된 모델(예: GPT-4o, GPT-4 Turbo, GPT-3.5 등 오래된 세대)을 "요즘 대표 예시"처럼 제시하면 영상이 낡아 보인다 — 절대 그렇게 하지 마라. 리서치(아래)에 최신 모델이 있으면 반드시 그 이름을 쓰고, 확신이 없으면 특정 구세대 제품명을 콕 집지 말고 "각 회사의 최신 대형 모델들"처럼 일반화해서 말해라. (단, 역사적 맥락을 설명할 때 과거 모델을 "과거에 그랬다"고 언급하는 것은 괜찮다 — 문제는 낡은 모델을 "현재"인 양 말하는 것이다.)`,
    '과장·낚시성 표현은 피한다. 이해는 추상적 비유·은유가 아니라 실제 사례·구체적 수치·단계별 설명으로 돕는다. 비유는 꼭 필요할 때만 최소한으로.',
    'narration 은 성우가 그대로 읽을 수 있는 완결된 구어체 문장으로 작성한다. (마크다운/이모지/괄호 지시문 금지)',
    // illustration 은 "무엇을 그릴지"만 쓰게 한다. "어떻게 그릴지"(화풍)는 이미지 생성 직전에
    // artStyle.ts(스크랩북이면 cutout.ts)가 붙이므로, 여기서 화풍까지 지시하면 두 지시가 충돌한다.
    // 스크랩북 엔진은 heading 이 주인공이고 illustration 요구도 달라서, 두 줄 다 voxScript.ts 가 대신 말한다.
    ...(isVox
      ? []
      : [
          'heading·bullets 는 보조 데이터일 뿐 화면 자막으로는 나레이션이 쓰이므로, 짧고 핵심만 담는다.',
          'illustration 은 이 씬에서 눈에 보이는 장면을 적은 영어 묘사다. 두 군데에 쓰인다 — AI 삽화를 그리는 데 쓰이고, 동시에 실사 스톡 영상을 검색하는 검색어로도 쓰인다. 그래서 나레이션이 말하는 사물·행동·화면이 무엇인지만 구체적으로 적는다(은유·추상 금지 — 검색이 안 된다). 화풍·색·터치는 적지 마라 — 그건 별도로 지정된다. 화면에 글자는 넣지 않는다.',
        ]),
  ].join(' ');

  const user = [
    `오늘은 ${dateLabel} 이다. ${targetMinutes}분 분량의 ${language === 'ko' ? '한국어' : language} 영상 대본을 만들어라.`,
    `이번 회차 방향: ${themeGuide}`,
    avoid,
    researchBlock,
    '',
    '요구사항:',
    `- ★가장 흔한 실패 = 분량 미달★ 전체 나레이션 합계 글자 수(공백 포함)는 반드시 약 ${targetChars}자 이상이어야 한다. 한국어 나레이션은 초당 약 7자로 읽혀서 ${targetChars}자라야 ${targetMinutes}분이 나온다. 이보다 짧게 쓰면 영상이 목표의 절반짜리로 나와 완전히 실패다 — ${isVox ? '씬 수를 아주 많이 늘려서' : '씬 수를 충분히 늘리고 각 씬 나레이션을 충분히 길게 써서'} 이 총량을 반드시 채워라.${isBrief ? ' 브리핑 내용이 많으면 이보다 더 길어도 좋다(분량보다 완전 반영 우선).' : ''}`,
    // ★엔진별 씬 구성 규칙★ 스크랩북은 도표·불릿 화면이 존재하지 않고 heading 이 주인공이라,
    // 아래 기본 규칙(diagram 최소 3개, bullets 30% 이하 …)을 그대로 주면 렌더링되지 않는 씬만 만들어 낸다.
    ...(isFootage ? [
      `- 씬(scenes)은 ${isBrief ? '26~38' : '26~38'}개로 나눈다. 씬 하나가 화면 한 장면이다.`,
      '- 한 씬의 narration 은 2~3문장, 대략 90~150자.',
      '- ★이 영상은 배경이 전부 실사 영상·사진이다★ 그 위에 큰 글씨, 또는 코드로 그린 도식이 얹힌다. 코드·불릿 화면은 존재하지 않는다. visual 은 title / image / quote / diagram / comparison / metric / bars / outro 여덟 가지만 쓴다.',
      // ★도식 종류를 늘린 이유★
      // diagram·comparison 은 배치가 9가지나 되지만 부품이 '둥근 상자 + 화살표' 하나뿐이라,
      // 배치가 바뀌어도 화면은 늘 같아 보인다("비슷한 도식만 갈아 끼운다"). metric·bars 는
      // 상자도 화살표도 쓰지 않아서 같은 영상 안에 섞이면 화면의 결이 실제로 달라진다.
      '- ★도식 네 종류를 골고루 섞어라★ diagram(관계·흐름) / comparison(둘을 맞세움) / metric(수치 하나) / bars(크기 비교). 한 종류가 세 번 연속으로 오지 않게 하고, 도식 씬이 4개 이상이면 최소 세 종류를 쓴다. diagram 만 반복하면 화면이 전부 똑같아 보인다.',
      '- metric 은 "수치 하나가 곧 메시지"일 때 쓴다. value 는 단위·기호를 붙인 채로("82%", "3배", "1994년"), label 은 무엇의 수치인지 16자 이내, note 는 한 줄 부연(없으면 빈 문자열).',
      '- bars 는 두세 대상의 크기 차이를 보여줄 때 쓴다. items 2~5개, label 12자 이내, value 는 숫자만(단위는 unit 에 따로). 값이 비슷비슷하면 쓰지 마라 — 길이 차이가 안 보이면 의미가 없다. 반대로 최댓값이 최솟값의 20배를 넘어도 쓰지 마라 — 작은 막대가 선처럼 보여 아무것도 안 읽힌다(그럴 땐 metric 으로 큰 값 하나만 보여 주는 편이 낫다).',
      '- ★metric·bars 의 숫자는 브리프에 실제로 적힌 것만 쓴다★ 브리프에 수치가 없으면 이 두 타입을 아예 쓰지 마라. 그럴듯한 숫자를 만들어 내는 것은 이 영상에서 가장 큰 사고다. 어림수·추정치·"대략 몇 배" 같은 것도 금지한다.',
      // ★도식 배분은 소재가 정한다★
      // 예전엔 "전체의 20~30%" 를 장르와 무관하게 못 박아 뒀다. 그런데 diagram 을 "순서·관계로
      // 이어지는 내용"으로만 정의해 놔서, 인물의 일생 같은 이야기형 소재를 주면 해당되는 씬이
      // 하나도 없다고 판단해 도식이 통째로 사라진다. 그러면 실사 위에 우리 것이 아무것도 안
      // 올라가서 "스톡 영상에 자막 단 것"이 된다. 소재 성격을 먼저 판정하게 하고, 그에 맞는
      // 도식 쓰임새를 알려 준다 — 회차마다 사람이 지시하지 않아도 되도록.
      '- ★먼저 이 소재가 설명형인지 이야기형인지 스스로 판정하고 그에 맞게 도식을 배분해라★',
      '  · 설명형(개념·기술·방법·정리): diagram·comparison 을 전체 씬의 20~30%. 흐름·구조·비교가 내용의 뼈대이므로 적극적으로 쓴다.',
      '  · 이야기형(한 사람의 일생·사건·회고): diagram·comparison 을 전체 씬의 12~20%. 도식이 잦으면 이야기의 호흡이 끊긴다. 다만 0개는 안 된다 — 아래 쓰임새로 최소 3개는 반드시 넣어라.',
      '- ★이야기형에서 diagram 을 쓰는 법★ 흐름도가 아니라 다음 세 가지로 쓴다. 이 셋은 이야기형에서 언제나 성립한다.',
      '  · 연표 — nodes 를 시간 순으로 두고 edges 로 잇는다. label 은 "1932 출생", "1993 수술" 처럼 연도+사건 8자 이내.',
      '  · 관계도 — 인물을 가운데 두고 그를 도운 사람·조직을 잇는다.',
      '  · 갈림길 — 그가 실제로 마주한 두 선택지를 comparison 으로 맞세운다(실제로 한 선택만 쓰고, 없는 갈등을 지어내지 마라).',
      '- 설명형에서 diagram 은 "여러 요소가 순서·관계로 이어지는" 내용에 쓴다(단계 흐름, 구조, 순환).',
      '- 공통: nodes 2~6개와 edges 로 표현하고 node.id 는 짧은 영숫자, label 은 한국어 8자 이내로 짧게.',
      '- comparison 은 두 대상을 맞세울 때만 쓴다. leftItems/rightItems 각 항목은 12자 이내로 압축한다 — 길면 도식 안에서 잘린다.',
      '- 나머지 씬은 image·quote 로 두어 실사와 큰 글씨가 숨 쉴 자리를 만든다. 매 씬마다 도식이 뜨면 눈 둘 곳이 없어져 오히려 산만해진다.',
      '- ★diagram·comparison 씬도 illustration 을 반드시 채운다★ 도식 뒤에 깔릴 배경 영상을 그것으로 검색한다. 도식 내용과 어울리는 실사 장면을 적어라.',
      '- ★heading 이 화면에 크게 박히는 키노트 문장이다★ 이 영상에서 heading 은 보조 라벨이 아니라 화면 왼쪽에 큰 글씨로 뜨는 주인공이다. 8~22자의 완결된 단정문으로 써라. "주요 특징", "현황" 같은 라벨은 절대 쓰지 마라 — 소리를 끄고 지나가는 시청자에게 남는 유일한 문장이다.',
      '- ★bullets 의 첫 항목이 큰 글씨 아래 붙는 부연 한 줄이다★ 모든 씬의 bullets 에 정확히 1개만 채워라(2개 이상 넣어도 첫 항목만 화면에 나온다). 25~45자로, heading 을 되풀이하지 말고 heading 이 왜 그런지를 한 줄로 보탠다.',
      '- ★sourceNote 는 화면 아래에 아주 옅게 깔리는 한 줄이다★ 그 씬에서 실제로 보여 줄 만한 시연 대상, 사례 사이트, 확인처를 짧게 적는다(예: "시연 · 코딩 에이전트로 즉석 시각화", "사례 · public-task.lovable.app", "확인 · 2026.07.30 발표"). 해당되는 것이 없으면 빈 문자열로 두어라 — 억지로 채우면 화면만 지저분해진다.',
      '- ★illustration 은 모든 씬에 반드시 채운다★ 이 묘사로 실사 스톡을 검색하므로 이것이 비면 그 씬은 화면이 빈다. 추상적으로 쓰면 아무것도 안 잡힌다 — 눈에 보이는 것만 영어로 적어라(사람, 손, 도구, 기계, 장소, 사물).',
      '- 좋은 illustration: "a person typing on a laptop late at night in an office", "hands sorting printed documents on a desk", "wide shot of a data center server aisle", "a robotic arm assembling parts in a factory"',
      '- 나쁜 illustration: "the concept of collaboration", "digital transformation" — 스톡에서 검색되지 않는다.',
      '- 같은 검색어를 여러 씬에 반복하지 마라. 비슷한 내용이라도 다른 장면을 지정해야 화면이 반복되지 않는다.',
      '- visual="quote" 인 씬은 heading 하나로 화면이 완성되는 자리다. 전환점·반전·단언에 쓰고, 이 씬에서도 illustration 은 채운다(배경 영상이 필요하다).',
      '- 첫 씬은 visual="title", 마지막 씬은 visual="outro" 로 각각 한 번씩만 쓴다.',
      INTRO_RULE,
      '- title/outro 씬은 icon 필드도 채운다(다른 엔진과 호환을 위해). 값은 아래 icon 목록에서 고른다.',
      '- 고를 수 있는 icon: document, chat, search, lock, key, database, server, cloud, terminal, gear, link, check, warning, user, users, clock, chart, mail.',
    ] : isVox ? voxRequirements({ targetChars, isBrief }) : [
      `- 씬(scenes)은 ${isBrief ? '26~40' : '28~40'}개로 잘게 나눈다(단계형 내용은 단계당 1씬). 씬이 적으면 위 총 글자수를 못 채운다.`,
      '- 한 씬의 narration 은 2~4문장, 대략 120~200자로 충분히 쓴다 — 한 문장만 달랑 쓰면 영상이 짧아지는 주된 원인이 된다. (예외: quote 씬만은 한 문장 임팩트로 짧게 쓴다.)',
      '- 첫 씬은 visual="title" 로 후킹 도입(왜 이 주제가 중요한지)을 담는다. visual="title" 은 이 영상 전체에서 딱 이 첫 씬 한 번만 쓴다 — 중간에 장/화제를 전환하고 싶어도 title 을 또 쓰지 마라(그러면 그 씬마다 AI 그림 한 장 + 줌 효과가 반복돼 영상 전체가 "맨날 같은 그림"처럼 보이는 가장 큰 원인이 된다). 장 전환이 필요하면 quote(소제목이나 전환 문장을 강조 문구로) 또는 bullets 를 대신 써라.',
      INTRO_RULE,
      '- 중간 씬은 bullets / diagram / comparison / quote / code / image 여섯 가지만으로 구성한다(title 은 위에서 말했듯 중간에 쓰지 않는다). 한 영상에 한두 타입만 반복되지 않게 고루 번갈아 쓰고, 다루는 내용에 실제 파일/코드가 있으면 code 를, 여러 항목이 하나에 모이거나 퍼지는 관계면 diagram 을 적극 활용해라.',
      '- ★단조로움 방지(반드시 지켜라)★ bullets 씬은 전체 중간 씬의 1/3(약 30%)을 넘기지 마라 — 직전 영상은 절반 이상이 bullets라 밋밋했다. 대신 다음 최소 개수를 반드시 채운다: diagram 최소 3개, comparison 최소 2개, quote 2~4개, code 최소 1개(소재가 있으면 2개 이상). 같은 타입이 세 씬 연속으로 오지 않게 번갈아 배치한다. 설명을 "여러 항목 나열"로 처리하고 싶을 때 습관적으로 bullets 를 쓰지 말고, 관계·흐름이면 diagram, 두 대상이면 comparison 으로 바꿔라.',
      '- visual="code" 는 이 대본에서 가장 중요한 "구체성" 장치다 — 다룰 대상에 실제로 존재하는 파일/설정/코드가 있다면(예: 스킬 정의 파일, 훅 스크립트, 플러그인 매니페스트, 설정 파일, API 요청 예시, 커맨드 한 줄) 말로 설명만 하지 말고 반드시 code 씬으로 화면에 그대로 보여준다. code 필드에 filename(실제 있을 법한 경로), language, code(실제 동작할 법한 8~14줄짜리 최소 예시, 지어내되 현실적이고 정확한 문법으로)를 채운다. 이런 소재가 있는 대본이면 최소 1개 이상 반드시 넣는다.',
      // ★image 씬이 없으면 화풍 설정이 영상에 전혀 안 나타난다★
      // 이전에는 모든 씬 타입이 코드 렌더링 대상이라 AI 그림이 한 장도 안 만들어졌고,
      // 그 결과 사용자가 고른 화풍(클레이·수채화 등)이 아무 효과가 없었다.
      '- visual="image" 는 AI 그림 한 장을 화면 가득 보여주는 씬이다. 도식으로 그리기 어려운 "실제 장면·사물·상황"에 쓴다(예: 사람이 작업하는 모습, 물리적 장치, 공간, 현장). 이 영상에 반드시 4~6개 넣어라 — 전부 도표·글자 화면이면 보는 사람이 지친다. 다만 남발하지 마라: 관계·흐름은 diagram, 나열은 bullets 가 항상 낫다.',
      // ★illustration 은 모든 씬에 채워야 한다★
      // 예전에는 image 씬에만 채우게 했는데, 이 필드가 B롤(실사 영상) 검색어로도 쓰인다.
      // 그 결과 도표·불릿 씬은 검색어가 없어서 B롤이 구조적으로 한 컷도 안 들어갔고,
      // 정작 B롤이 필요 없는(이미 그림이 꽉 찬) image 씬에만 들어갈 수 있었다 — 거꾸로였다.
      // 3분 영상을 실제로 뽑아 보고 확인한 문제다.
      '- ★illustration 필드는 quote/code 를 제외한 모든 씬에 반드시 채운다★ (영어로, 그 씬에서 눈에 보이는 장면·사물·행동을 구체적으로). visual="image" 인 씬에서는 이 묘사로 AI 그림을 그리고, 그 외의 씬(bullets/diagram/comparison/title/outro)에서는 이 묘사로 실사 배경 영상을 검색해 화면 중간에 2~3초짜리 컷으로 얹는다. 비워 두면 그 씬은 도표와 글자만 나오는 밋밋한 화면이 된다.',
      '- illustration 은 검색어로도 쓰이므로 추상적으로 쓰면 안 된다. "the concept of efficiency" 같은 건 아무것도 안 잡힌다. 눈에 보이는 것을 적어라 — 사람, 손, 도구, 재료, 기계, 장소. 예: "hands pouring roasted grains into a stone mill", "steam rising from a bamboo steamer in a kitchen".',
      '- visual="bullets" 인 씬은 bullets 배열에 짧은 항목을 반드시 2~5개 채운다(빈 배열 금지). 각 항목은 한 화면에 큰 글씨로 뜨는 문구이므로 8~16자 정도로 짧게.',
      '- visual="quote" 인 씬은 narration 자체가 화면에 크게 뜨는 한 문장 임팩트 인용구가 되므로, narration 을 다른 씬보다 짧고 단호한 한 문장으로 쓴다(주석문/설명 붙이지 말고 그 자체로 완결된 명제).',
      '- visual="diagram" 은 실제로 "여러 요소가 순서/관계로 연결되는" 내용에만 쓴다(흐름, 파이프라인, 구조). 그냥 나열식 정보는 diagram 대신 bullets 를 써라.',
      '- diagram 을 쓰는 씬은 nodes(2~6개)와 edges(화살표)로 개념 흐름을 표현한다. node.id 는 짧은 영숫자, label 은 한국어.',
      '- comparison 씬은 두 개념/접근을 좌우로 비교한다. leftItems/rightItems 각 항목은 카드 안에 한 줄로 들어가야 하므로 12자 이내로 짧게 — "Claude Code, OpenCode 같은 실행기" 처럼 긴 문장을 통째로 넣지 말고 "실행기 직접 구현"처럼 핵심만 압축해라.',
      '- 마지막 씬은 visual="outro" 로 핵심 3줄 요약 + 구독 유도를 담는다.',
      '- title/outro 씬(영상 전체에서 첫 씬과 마지막 씬)은 icon 필드로 렌더링된다(생활코딩 스타일 평면 2D 라인 아이콘, AI 그림 아님). icon 필드를 반드시 채워라. 고를 수 있는 값: document(문서/자료/정의), chat(질문/대화/논쟁), search(조사/분석/검색), lock(보안/권한/잠금), key(인증/접근권한), database(데이터/저장소), server(인프라/백엔드/실행환경), cloud(클라우드/원격서비스), terminal(코드/커맨드/실행), gear(설정/구성), link(연결/통합/연동), check(완료/검증/성공), warning(주의/오류/리스크), user(개인/사용자), users(팀/커뮤니티), clock(시간/속도/지연), chart(성장/통계/수치), mail(알림/전달).',
      '- icon 선택 원칙: 반드시 그 씬이 실제로 설명하는 대상과 의미가 통하는 것을 골라라 — 장식으로 아무거나 고르면 안 된다. 예: "용어 정의"를 다루면 document나 search, "보안/권한 얘기"면 lock이나 key, "데이터/저장"이면 database, "실행 환경/인프라"면 server나 cloud, "코드/커맨드 예시"면 terminal, "설정값 얘기"면 gear, "여러 도구가 연동됨"이면 link, "결론/맞다"면 check, "위험 경고"면 warning, "숫자/트렌드"면 chart. heading·narration 을 보고 가장 뜻이 맞는 것 하나를 고른다. 애매하면 문서/개념 정의를 뜻하는 document 를 기본값으로.',
      '- 같은 영상 안에서 title 과 outro 가 같은 icon 을 또 쓰지 마라(둘은 보통 다른 국면 — 도입 vs 결론 — 이므로 서로 다른 icon 이 자연스럽다).',
    ]),
    '- title(제목)은 클릭하고 싶되 정확한 40자 이내.',
    // ★썸네일 문구가 조회수를 좌우한다★ 예전엔 "직관적·설명적, 15~25자"를 요구해서
    // "가격 그대로, 성능만 2배 오른 Opus 5" 같은 설명문이 나왔다 — 정확하지만 아무도 안 누른다.
    // 대상은 배지(thumbnailBadge)가 책임지게 하고, 문구는 짧은 "긴장" 한 방으로 간다.
    '- thumbnailHeadline: 썸네일에 크게 박을 문구. 설명문을 쓰지 마라. 길이는 8~14자 — 폰 화면에서 0.5초 만에 읽혀야 한다.',
    '- 반드시 다음 다섯 중 하나의 "긴장"을 담아라: (1) 대비 — 상식과 어긋나는 둘을 붙인다("같은 값, 2배 실력"). (2) 의외성 — 예상을 깬 사실을 선언한다("이번엔 값을 안 올렸다"). (3) 궁금증 — 답이 궁금해지는 질문("왜 값을 안 올렸을까"). (4) 이득 선언 — 시청자가 얻는 것을 단정한다("공짜로 2배 빨라졌다").',
    `- (5) 요약 선언 — 짧은 시간에 다 알려준다고 약속한다. 이 유형만 24자까지 허용한다. 예: "${Math.round(targetMinutes)}분만에 알아보는 <주제> 출시내용 요약". 출시·발표·업데이트를 통째로 훑는 회차라면 (5)가 가장 잘 맞고, 이때는 대상 이름을 문구 안에 그대로 넣어라.`,
    // ★대상이 어디에도 없으면 썸네일이 "무슨 교재 표지"처럼 보인다★
    // 예전 규칙은 "문구에 대상이 들어갔으면 배지는 비워도 된다"였는데, 문구에도 대상이
    // 없고 배지도 빈 조합을 막지 못했다. 실제로 '하네스' 영상에서 그 조합이 나와,
    // 무엇에 대한 영상인지 썸네일만 봐서는 알 수 없는 결과가 됐다.
    '- thumbnailBadge: 문구에서 뺀 대상을 담는 짧은 배지(제품·회사·기술 이름, 2~12자. 예: "Claude Opus 5", "RAG"). 썸네일 구석에 작게 들어간다.',
    '- ★반드시 지켜라★ thumbnailHeadline 과 thumbnailBadge 중 최소 한 곳에는 "이 영상이 무엇에 대한 것인지"를 알려주는 고유명사(제품·기술·회사·개념 이름)가 반드시 들어가야 한다. 둘 다 일반적인 말뿐이면 썸네일만 보고는 주제를 알 수 없어 아무도 누르지 않는다. 문구에 이미 그 이름이 들어갔다면 배지는 비워도 좋고, 문구가 일반적인 말뿐이라면 배지를 반드시 채워라.',
    '- 절대 하지 말 것: "~를 공개했습니다", "~가 오른 제품명" 같은 밋밋한 서술문과 사실 나열. "그거", "이거" 처럼 배지에도 대상이 없이 사라지는 낚시. "~완벽정리", "~진짜 원리" 같은 뻔한 클리셰. 과장·거짓. — 자료에 있는 사실을 "가장 세게 말하는 방식"을 찾는 것이지, 없는 말을 짓는 게 아니다.',
    '- description(설명란)은 실제 줄바꿈(\\n)으로 문단을 나눈다: 먼저 3~5문장 요약, 그다음 빈 줄, 그다음 "다루는 내용:" 아래에 항목마다 줄바꿈해 나열한다. (한 덩어리로 붙여쓰지 말 것)',
    '- tags 는 검색 최적화된 한국어/영어 키워드 8~15개.',
  ].join('\n');

  // 한 번 생성해서 Script 로 파싱하는 내부 실행기(분량 미달 시 재시도에 재사용).
  async function runOnce(extraUserNote: string): Promise<Script> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user + extraUserNote }];
    const stream = client.messages.stream({
      model: config.claudeModel,
      // 사고(thinking) 토큰도 이 예산을 함께 쓴다. 32000 이면 긴 브리핑 + 30여 개 씬을 쓰다가
      // JSON 이 중간에서 잘려("Unterminated string in JSON") 파이프라인 전체가 죽었다.
      // Opus 4.8 은 최대 128K 출력이라 넉넉히 잡아 둔다.
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { format: zodOutputFormat(ScriptSchema) },
      system,
      messages,
    });
    // SDK 가 구조화 출력을 즉시 파싱하므로, 출력이 잘리면 여기서 파싱 오류로 터진다.
    // 원인을 알 수 없는 스택트레이스 대신 무엇이 잘못됐는지 알려주고 위쪽에서 재시도하게 한다.
    let final: Anthropic.Message;
    try {
      final = await stream.finalMessage();
      recordUsage({ kind: 'claude', step: 'script', model: config.claudeModel,
        inputTokens: final.usage?.input_tokens, outputTokens: final.usage?.output_tokens });
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/parse structured output/i.test(msg)) throw new Error(TRUNCATED_MSG);
      throw e;
    }
    if (final.stop_reason === 'refusal') {
      throw new Error('Claude 가 대본 생성을 거부했습니다(안전상). 주제를 바꿔 다시 시도하세요.');
    }
    if (final.stop_reason === 'max_tokens') throw new Error(TRUNCATED_MSG);
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

  /** 출력이 잘려 JSON 이 깨진 경우 한 번만 더 시도한다(부가 필드를 짧게 쓰도록 지시). */
  async function runOnceResilient(extraUserNote: string): Promise<Script> {
    try {
      return await runOnce(extraUserNote);
    } catch (e) {
      if ((e as Error).message !== TRUNCATED_MSG) throw e;
      console.warn('[대본] 출력이 잘려 재시도 — 부가 필드를 짧게 쓰도록 지시');
      return runOnce(
        extraUserNote +
          '\n\n※ 직전 시도는 출력이 너무 길어 JSON 이 도중에 잘렸다. 나레이션 총량은 그대로 지키되, illustrationPrompt 는 한 줄(60자 이내)로 짧게 쓰고 description 도 간결하게 줄여라.',
      );
    }
  }

  const totalChars = (s: Script) => s.scenes.reduce((sum, sc) => sum + (sc.narration?.length ?? 0), 0);

  let script = await runOnceResilient('');
  let chars = totalChars(script);
  console.log(`[대본] 나레이션 총 ${chars}자 / 목표 ${targetChars}자 (씬 ${script.scenes.length}개)`);

  // 분량 미달(목표의 70% 미만) 방지 — 모델이 "짧게" 지침에 과반응해 총량을 놓치는 흔한 실패를
  // 한 번의 재생성으로 교정한다. 더 긴 쪽을 채택(재생성이 오히려 짧으면 첫 결과를 유지).
  if (chars < targetChars * 0.82) {
    console.log(`[대본] 분량 미달 → 더 길게 재생성 시도`);
    try {
      const retry = await runOnceResilient(
        `\n\n[중요·재작성 지시] 직전 시도가 총 ${chars}자로 목표(${targetChars}자)의 절반 수준밖에 안 돼 영상이 너무 짧다. 이번엔 씬 수를 ${isBrief ? 30 : 32}개 이상으로 늘리고 각 씬 나레이션을 2~4문장(120~200자)으로 충분히 써서 총 ${targetChars}자 이상을 반드시 채워라. (quote 씬만 짧게.)`,
      );
      const retryChars = totalChars(retry);
      console.log(`[대본] 재생성 결과 총 ${retryChars}자 (씬 ${retry.scenes.length}개)`);
      if (retryChars > chars) {
        script = retry;
        chars = retryChars;
      }
    } catch (e) {
      console.warn('[대본] 재생성 실패, 첫 결과 유지:', e instanceof Error ? e.message : e);
    }
  }

  return script;
}
