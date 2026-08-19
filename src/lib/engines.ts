/**
 * 영상 엔진과 각 엔진이 실제로 지원하는 옵션 — 단일 정의.
 *
 * 왜 필요한가: 옵션을 하나씩 늘리다 보니 서로 안 맞는 조합이 생겼다. 화면에서는 고를 수
 * 있는데 실제로는 아무 효과가 없는 설정이 세 개나 있었고(화풍·B롤·난이도), 그중 난이도는
 * 코드를 뒤져보기 전까지 아무도 몰랐다. "고를 수 있다 = 적용된다"가 깨지면 사용자는
 * 결과물을 보고도 왜 그런지 알 수 없다.
 *
 * 그래서 "무엇이 무엇과 맞물리는가"를 여기 한 곳에만 적는다. UI·API·파이프라인이 모두
 * 이 표를 보므로, 새 엔진이나 새 옵션을 추가할 때 여기만 갱신하면 세 곳이 같이 맞는다.
 *
 * ★이 파일을 고치면 web/api/publish.js 의 ENGINES 도 같이 고쳐야 한다★
 * (서버리스 함수는 이 모듈을 import 할 수 없어 값을 복제해 둔다 — 어긋나면 조용히
 *  무시되는 옵션이 다시 생긴다.)
 */

export type EngineId = 'stock' | 'illustrated' | 'scrapbook' | 'footage' | 'signal' | 'signal3d' | 'deck3d' | 'hyper' | 'handdrawn' | 'listing' | 'whiteboard';

/** 엔진과 무관하게 항상 적용되는 옵션은 여기 적지 않는다(주제·길이·모드·채널·배속). */
export interface EngineCaps {
  id: EngineId;
  label: string;
  /** 한 줄 설명 — UI 에서 무엇을 고르는 것인지 알려준다. */
  blurb: string;
  /** AI 그림을 쓰므로 화풍(artStyle)이 실제로 화면에 나타나는가 */
  artStyle: boolean;
  /** 스톡 영상 B롤 인서트 컷을 넣을 수 있는가 */
  broll: boolean;
  /** 대본 난이도(contentLevel)를 읽는가 */
  level: boolean;
  /** 나레이션 말투(tone)를 읽는가 */
  tone: boolean;
}

export const ENGINES: EngineCaps[] = [
  {
    id: 'stock',
    label: '주식 데일리 (stockontology.cc)',
    blurb:
      '사이트 공개 API 로 오늘의 국면·인과·추천 종목을 받아 씬마다 화풍을 바꿔 그린다. ' +
      '대본을 Claude 가 쓰지 않고 응답의 문장을 그대로 조립하므로 숫자가 지어내지지 않는다.',
    // 화면은 사이트가 서버에서 그려 준 완성본을 쓴다 — AI 그림도 스톡도 부르지 않는다.
    artStyle: false,
    broll: false,
    level: false,
    tone: false,
  },
  {
    id: 'illustrated',
    label: '2D 일러스트 + 영상컷',
    blurb: 'AI 그림과 도식에 스톡 영상 컷을 섞는다. 화풍을 고를 수 있는 유일한 스타일.',
    artStyle: true,
    broll: true,
    level: true,
    tone: true,
  },
  {
    id: 'scrapbook',
    label: '스크랩북 (빈티지 판화)',
    blurb: '종이 위에 판화 컷아웃을 붙이고 큰 글자를 타자기로 찍는다. 화풍은 판화로 고정.',
    // 화풍은 "빈티지 판화"로 고정이다 — 이 스타일의 정체성이라 바꾸면 다른 엔진이 된다.
    artStyle: false,
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'footage',
    label: '실사 푸티지 (무료 스톡)',
    blurb:
      '무료 스톡(Pexels·Pixabay·Unsplash) 실사 영상·사진이 화면을 꽉 채우고 자막만 얹힌다. ' +
      'AI 그림을 안 써서 이미지 비용이 0 이지만, 화면이 전부 남의 소재라 유튜브 재사용 콘텐츠 판정 위험이 있다.',
    // AI 그림을 아예 만들지 않으므로 화풍은 적용될 곳이 없다.
    artStyle: false,
    // "인서트 B롤"이라는 개념 자체가 없다 — 화면 전체가 스톡이다.
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'signal',
    label: '시그널 (데이터 중심)',
    blurb: '딥블랙 배경에 큰 숫자와 도식. 화면을 코드로 그려서 화풍·영상컷은 안 들어간다.',
    artStyle: false,
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'signal3d',
    label: '시그널 + 3D 공간',
    blurb: '시그널 디자인에 3D 깊이 카메라. 마찬가지로 화풍·영상컷은 안 들어간다.',
    artStyle: false,
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'deck3d',
    label: '3D 기하학 도형',
    blurb: '3D 공간에 카드가 놓이고 카메라가 이동한다. 화풍·영상컷은 안 들어간다.',
    artStyle: false,
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'whiteboard',
    label: '화이트보드 (손으로 그려지는 그림)',
    blurb:
      '따뜻한 종이 위에 그림이 손으로 그려지듯 한 획씩 드러난다. 화풍을 고를 수 있고(그림을 AI 가 그린다), ' +
      '설명형 개념 영상에 잘 맞는다. 기법은 geeklee/srt-whiteboard-animation(MIT)에서 가져왔다.',
    artStyle: true,
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'listing',
    label: '목록형 소개 (사진 카드)',
    blurb:
      '자료가 준 사진을 한 장씩 화면에 꽉 채우고 이름·위치 카드를 얹는다. "N곳 소개" 같은 목록 자료 전용. ' +
      '사진과 사실은 자료에서 그대로 오고 나레이션 문장만 AI 가 쓴다. 스톡 영상·AI 그림을 안 쓴다.',
    artStyle: false,
    broll: false,
    level: false,
    tone: true,
  },
  {
    id: 'handdrawn',
    label: '손그림 (종이 위 도식)',
    blurb:
      '종이 질감 배경 위에 손으로 그린 듯한 도식과 자막이 올라간다. 이 파이프라인의 첫 화면 스타일로, ' +
      'AI 그림도 스톡 영상도 안 써서 이미지 비용이 0 이다.',
    artStyle: false,
    broll: false,
    level: true,
    tone: true,
  },
  {
    id: 'hyper',
    label: '모션 타이포 (HyperFrames)',
    blurb:
      'HTML+GSAP 을 그대로 영상으로 굽는다. 큰 글자와 숫자가 움직이는 화면이라 AI 그림·스톡 영상이 ' +
      '아예 안 들어가서 이미지 비용이 0 이고, 화면이 100% 우리가 만든 것이라 재사용 콘텐츠 위험도 없다.',
    artStyle: false,
    broll: false,
    level: true,
    tone: true,
  },
];

const BY_ID = new Map(ENGINES.map((e) => [e.id, e]));

export const DEFAULT_ENGINE = ENGINES[0];

export function resolveEngine(id: string | undefined): EngineCaps {
  return BY_ID.get((id || '').trim().toLowerCase() as EngineId) ?? DEFAULT_ENGINE;
}

/**
 * 이 엔진에서 무시될 옵션 이름들.
 * 사용자가 값을 지정했는데 안 먹는 경우를 조용히 넘기지 않고 알려주는 데 쓴다.
 */
export function ignoredOptions(
  engine: EngineCaps,
  provided: { artStyle?: boolean; broll?: boolean },
): string[] {
  const out: string[] = [];
  if (provided.artStyle && !engine.artStyle) out.push('화풍');
  if (provided.broll && !engine.broll) out.push('영상컷(B롤)');
  return out;
}
