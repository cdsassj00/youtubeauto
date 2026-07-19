/**
 * 나레이션 ↔ 화면을 동기화하기 위한 "비트(beat)" 계산 헬퍼.
 *
 * 기존 문제: 다이어그램/불릿 등장 타이밍이 첫 6초에 하드코딩돼 있어,
 * 40초짜리 나레이션이 흐르는 동안 화면은 6초 만에 다 그려지고 멈춰 있었다
 * ("판서 중심 / 설명과 따로 논다"). 이 헬퍼는 나레이션을 문장 단위로 쪼갠 뒤,
 * 각 시각 요소의 등장 프레임을 씬의 "전체 길이"에 걸쳐, 실제 문장이 발화되는
 * 지점(문장 시작)에 맞춰 배치한다.
 */

/** 문장 분리 (한국어/영문 종결부호 기준). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!…。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SentenceBound = { text: string; start: number; end: number };

/** 문장별 화면 구간(프레임) — 글자 수에 비례해 전체 길이를 배분. 자막·비주얼 공용. */
export function sentenceBounds(narration: string, durationInFrames: number): SentenceBound[] {
  const sentences = splitSentences(narration);
  if (sentences.length === 0) return [];
  const totalChars = sentences.reduce((s, t) => s + t.length, 0) || 1;
  let acc = 0;
  return sentences.map((t) => {
    const start = (acc / totalChars) * durationInFrames;
    acc += t.length;
    const end = (acc / totalChars) * durationInFrames;
    return { text: t, start, end };
  });
}

/**
 * `count` 개의 시각 요소가 등장할 프레임을 반환한다.
 * 씬 길이의 head~tail 구간에 고르게 목표를 잡되, 가장 가까운 "문장 시작"에 스냅해
 * 나레이션이 그 요소를 말하는 순간과 그림이 맞물리게 한다.
 */
export function revealFrames(
  narration: string,
  durationInFrames: number,
  count: number,
  opts: { head?: number; tail?: number; minGap?: number } = {},
): number[] {
  if (count <= 0) return [];
  const head = (opts.head ?? 0.06) * durationInFrames;
  const tail = (opts.tail ?? 0.72) * durationInFrames;
  const minGap = opts.minGap ?? 14;
  const starts = sentenceBounds(narration, durationInFrames).map((b) => b.start);

  const frames: number[] = [];
  for (let i = 0; i < count; i++) {
    const target = count === 1 ? head : head + (tail - head) * (i / (count - 1));
    let f = target;
    if (starts.length) {
      f = starts.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), starts[0]);
    }
    frames.push(f);
  }
  // 단조 증가 + 최소 간격 보장 (같은 문장에 여러 요소가 스냅되는 경우 분산).
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] <= frames[i - 1] + minGap) {
      frames[i] = frames[i - 1] + Math.max(minGap, (durationInFrames * 0.5) / count);
    }
  }
  return frames;
}

/** 현재 프레임 기준, 지금까지 등장한 요소들 중 가장 최근 요소의 인덱스(-1=아직 없음). */
export function activeIndex(revealAt: number[], frame: number): number {
  let idx = -1;
  for (let i = 0; i < revealAt.length; i++) if (frame >= revealAt[i]) idx = i;
  return idx;
}
