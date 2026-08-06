/**
 * 대본 난이도(CONTENT_LEVEL) 지침.
 *
 * 원래 anthropic.ts 안에 인라인으로 박혀 있어서 illustrated 엔진에서만 적용됐고,
 * signal/deck3d 대본(deckgen.ts)은 난이도를 아예 읽지 않았다 — 사용자가 "쉽게"를 골라도
 * 시그널 영상은 전문가용으로 나왔다. 두 생성기가 같은 정의를 쓰도록 분리한다.
 */

export type LevelId = 'basic' | 'intermediate' | 'expert';

const GUIDES: Record<LevelId, string> = {
  basic:
    '시청자는 이 주제를 처음 접하는 완전 초보다. 전문 용어는 최대한 풀어쓰고, 친절한 비유와 쉬운 예시로 눈높이를 낮춰 설명한다.',
  intermediate:
    '시청자는 AI/IT에 어느 정도 익숙한 사람이다. 기초 개념 설명은 짧게 짚고 넘어가고, 실무 예시·구체적 수치·최신 사례 위주로 균형 있게 설명한다.',
  expert: [
    '이 채널은 실무자·전문가 시청자를 대상으로 한다. 초등학생 눈높이로 풀어쓰지 않는다.',
    '전문 용어는 순화하지 않고 그대로 쓰되, 처음 등장할 때만 한 문장으로 짧게 정의하고 이후로는 계속 전문 용어로 서술한다.',
    '"쉽게 말하면", "간단히 설명하면", "초등학생도 이해하는" 같은 눈높이를 낮추는 표현을 쓰지 않는다.',
    '구체적인 수치·벤치마크·버전명·회사명·날짜·출처를 최대한 명시하고, 실무에 바로 쓸 수 있는 디테일(설정값, 한계, 트레이드오프, 실패 사례)을 반드시 포함한다.',
  ].join(' '),
};

/** 모르는 값이면 expert(기본값). */
export function levelGuide(id: string | undefined): string {
  return GUIDES[(id || '').trim().toLowerCase() as LevelId] ?? GUIDES.expert;
}
