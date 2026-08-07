/**
 * B롤 컷 배치 계획.
 *
 * "언제 화면을 바꿀지"만 정하는 순수 계산 — 네트워크도 파일도 건드리지 않아서
 * 그대로 테스트할 수 있다. 실제 클립 다운로드는 stock.ts 가 한다.
 *
 * 배치 원칙(왜 이렇게 정했는지):
 *  - 씬 앞부분은 건드리지 않는다. 도식·불릿이 등장하는 구간이라 여기서 화면을 덮으면
 *    시청자가 방금 나온 내용을 못 본다. 그래서 항상 앞 35% 이후에 넣는다.
 *  - 씬 끝에도 여유를 둔다. 컷이 씬 경계에 딱 붙으면 전환이 겹쳐 지저분해진다.
 *  - code/quote 씬은 제외. 코드는 읽어야 하고, 인용은 한 방을 위한 정지 화면이다.
 *  - 전체 씬의 일정 비율까지만. 스톡이 너무 많으면 원본 채널색이 사라지고
 *    유튜브 재사용 콘텐츠 판정 위험도 올라간다.
 */

/** 컷 하나 — 씬 시작 기준 상대 프레임. */
export interface BrollCut {
  /** 씬 시작으로부터 몇 프레임 뒤에 컷이 들어가는가 */
  fromFrame: number;
  durationInFrames: number;
}

export interface BrollPlanInput {
  id: string;
  visual: string;
  durationInFrames: number;
  /** 검색어로 쓸 영어 묘사 (없으면 이 씬은 건너뛴다) */
  query?: string;
}

export interface BrollPlan {
  sceneId: string;
  query: string;
  cuts: BrollCut[];
}

/** 이 씬 종류에는 B롤을 얹지 않는다. */
const EXCLUDED = new Set(['code', 'quote']);

/** B롤을 받을 수 있는 씬의 최대 비율 — 원본이 주역이어야 한다. */
const MAX_RATIO = 0.45;

/**
 * 컷 길이(초) 범위. 2초보다 짧으면 깜빡임처럼 보이고, 4초를 넘으면 다시 늘어진다.
 *
 * ★2.5 → 2.0 으로 내린 이유★
 * 3분 영상을 실제로 뽑아 보니 B롤이 한 장면도 안 들어갔다. 이 값들이 전부 10분 영상
 * 기준이었기 때문이다. 3분에 씬 28~40개면 씬당 평균 5~6.4초인데, 앞 35%(≈2초)를
 * 보호하고 끝 1.2초를 비우면 2.5초짜리 컷이 들어갈 자리가 아예 남지 않는다.
 */
const MIN_SEC = 2;
const MAX_SEC = 4;

/**
 * 컷을 받을 수 있는 최소 씬 길이(초).
 * 8초였는데, 3분 영상에서는 8초를 넘는 씬이 0~3개뿐이라 사실상 기능이 꺼져 있었다.
 */
const MIN_SCENE_SEC = 6;

/** 씬 끝에 비워 두는 시간(초) — 컷이 씬 경계에 붙으면 전환이 겹쳐 지저분해진다. */
const TAIL_SEC = 0.8;

export function planBroll(scenes: BrollPlanInput[], fps: number): BrollPlan[] {
  const minLen = MIN_SEC * fps;

  // 짧은 씬은 애초에 컷을 넣을 자리가 없다. 긴 씬부터 채운다 —
  // 늘어짐이 가장 심한 곳부터 고쳐야 효과가 크다.
  const eligible = scenes
    .filter((s) => !EXCLUDED.has(s.visual) && (s.query || '').trim().length > 0)
    .filter((s) => s.durationInFrames >= MIN_SCENE_SEC * fps)
    .sort((a, b) => b.durationInFrames - a.durationInFrames);

  const budget = Math.floor(scenes.length * MAX_RATIO);
  const chosen = eligible.slice(0, Math.max(0, budget));

  return chosen.map((s) => ({
    sceneId: s.id,
    query: (s.query || '').trim(),
    cuts: cutsFor(s.durationInFrames, fps, minLen),
  }));
}

/**
 * 한 씬 안에서 컷 위치를 잡는다.
 * 16초를 넘으면 두 번 끊는다 — 한 번만으로는 여전히 늘어진다.
 */
function cutsFor(dur: number, fps: number, minLen: number): BrollCut[] {
  const safeStart = Math.floor(dur * 0.35); // 앞 35% 는 원본 화면 보호
  const safeEnd = dur - Math.floor(TAIL_SEC * fps); // 끝 여유 — 전환 겹침 방지
  const room = safeEnd - safeStart;
  if (room < minLen) return [];

  const long = dur > 16 * fps;
  const count = long && room >= minLen * 2 + fps ? 2 : 1;
  const len = Math.min(MAX_SEC * fps, Math.max(minLen, Math.floor(room / (count * 1.6))));

  const cuts: BrollCut[] = [];
  if (count === 1) {
    // 가운데보다 살짝 뒤 — 씬 후반이 가장 늘어지는 구간이다.
    cuts.push({ fromFrame: safeStart + Math.floor((room - len) * 0.55), durationInFrames: len });
  } else {
    const gap = Math.floor((room - len * 2) / 3);
    cuts.push({ fromFrame: safeStart + gap, durationInFrames: len });
    cuts.push({ fromFrame: safeStart + gap * 2 + len, durationInFrames: len });
  }
  // 계산이 어긋나 씬 밖으로 나가는 컷은 버린다(렌더에서 조용히 깨지는 것보다 낫다).
  return cuts.filter((c) => c.fromFrame >= 0 && c.fromFrame + c.durationInFrames <= safeEnd);
}
