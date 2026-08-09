/**
 * 실사 푸티지 엔진의 컷 계획.
 *
 * broll.ts 와 목적이 정반대다:
 *   broll.ts     원본 화면 위에 "가끔" 인서트를 얹는다 → 자리를 아껴 고른다
 *   footagePlan  화면을 "전부" 실사로 채운다          → 빈틈 없이 이어 붙인다
 *
 * 그래서 여기서는 씬 전체를 컷으로 분할한다. 한 컷이 길어지면 지루하므로,
 * 씬이 길면 소재를 여러 개 갈아 끼운다.
 */

/** 컷 하나 — 씬 시작 기준 상대 프레임. */
export interface Shot {
  fromFrame: number;
  durationInFrames: number;
}

/**
 * 컷 길이 목표(초).
 *
 * 실사 컷은 3~6초가 편하다. 3초보다 짧으면 무슨 장면인지 인지하기 전에 넘어가고,
 * 6초를 넘으면 스톡 특유의 짧은 루프가 눈에 띄기 시작한다.
 */
const TARGET_SEC = 4.5;
const MIN_SEC = 3;

/**
 * 씬 하나를 컷들로 나눈다. 컷은 빈틈 없이 이어지고 합이 정확히 씬 길이가 된다
 * (한 프레임이라도 비면 검은 화면이 보인다).
 */
export function planShots(durationInFrames: number, fps: number): Shot[] {
  const dur = durationInFrames;
  if (dur <= 0) return [];

  // 몇 컷으로 나눌지 — 목표 길이에 가장 가깝게, 단 최소 길이는 지킨다.
  let count = Math.max(1, Math.round(dur / (TARGET_SEC * fps)));
  while (count > 1 && dur / count < MIN_SEC * fps) count--;

  const base = Math.floor(dur / count);
  const shots: Shot[] = [];
  for (let i = 0; i < count; i++) {
    const from = i * base;
    // 마지막 컷이 나머지를 전부 흡수한다 — 반올림 때문에 끝에 빈틈이 생기면 안 된다.
    const len = i === count - 1 ? dur - from : base;
    shots.push({ fromFrame: from, durationInFrames: len });
  }
  return shots;
}

/**
 * 씬의 검색어를 컷 수만큼 만든다.
 *
 * 한 씬을 3컷으로 나눠 놓고 같은 검색어로 3번 부르면 비슷한 그림이 이어져
 * 나눈 의미가 없다. 그래서 대본이 준 묘사(illustration)를 기본으로 쓰되,
 * 컷마다 다른 seed 를 줘서 결과가 갈리게 한다. 검색어 자체를 비틀지는 않는다 —
 * 대본이 쓴 묘사가 그 씬에서 가장 정확한 검색어이기 때문이다.
 */
export function shotSeeds(sceneIndex: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => sceneIndex * 7 + i * 3 + 1);
}
