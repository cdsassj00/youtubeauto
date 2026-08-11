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

/**
 * 나레이션을 짧은 자막 조각(chunk)으로 쪼개고 각 조각의 화면 구간(프레임)을 배분한다.
 * 한 화면에 긴 문장이 통째로 지나가지 않도록, 문장을 다시 maxChars 이하의 구절로 나눈다.
 */
/**
 * 문장을 "쉬는 자리"로 먼저 쪼갠다.
 *
 * 쉼표·가운뎃점·콜론은 말하는 사람이 실제로 숨을 고르는 지점이라, 여기서 끊으면
 * 자막이 발화 호흡과 맞는다. 부호는 앞 조각에 붙여 둔다(뒤로 넘기면 조각이 부호로 시작한다).
 */
function splitClauses(text: string): string[] {
  // ★숫자 안의 쉼표에서는 끊지 않는다★
  // "1,411원" 처럼 천 단위 구분 쉼표가 들어간 수치가 "1," / "411원" 으로 쪼개져
  // 자막에 "1," 만 0.3초 스치고 지나갔다. 쉼표 뒤가 곧바로 숫자면 그건 문장의 쉼이
  // 아니라 자릿수 구분이므로 끊지 않는다(말하는 사람도 거기서 안 쉰다).
  return text
    .split(/(?<=[,،、·:;])(?!\d)\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * 한 절을 maxChars 이하 구절들로 묶는다.
 *
 * 그냥 채우다 넘치면 끊는 방식은 "확대되기 때문에 어떤" 처럼 다음 말과 붙어야 할 어절이
 * 앞줄 끝에 매달린다. 그래서 끊을 자리를 정할 때, 직전 어절이 연결어미로 끝나면
 * (…하고 / …하며 / …해서 / …지만 / …는데) 거기서 끊는 쪽을 우선한다 — 한국어에서
 * 그 자리가 자연스러운 쉼이다.
 */
const CLAUSE_TAIL = /(고|며|서|면|나|만|지만|는데|운데|어야|아야|으로|로|까지|부터|처럼|보다|이며|이고|라서|거나)$/;

/**
 * 줄 끝에 홀로 남으면 안 되는 말들.
 *
 * "2023년 1월 이후 첫 / 인상이었습니다" 처럼, 뒤에 오는 말을 꾸미는 단어가 앞줄 끝에
 * 매달리면 그 줄이 미완성으로 읽힌다. 읽는 사람은 "첫..." 에서 한 박자 멈췄다가 다음
 * 줄에서 "인상"을 만나는데, 말하는 사람은 그 사이에서 쉬지 않는다 — 자막과 소리가
 * 어긋나는 지점이다. 이런 단어가 줄 끝에 오면 다음 줄로 넘긴다.
 */
const NO_TRAILING =
  /^(첫|새|옛|헌|온갖|여러|각|매|다른|같은|어떤|무슨|이런|저런|그런|모든|약|총|더|덜|가장|제일|먼저|바로|곧|다시|아주|매우|훨씬|서로|이|그|저)$/;

/** 줄 끝에 매달린 꾸밈말을 다음 줄로 넘긴다. 넘긴 단어들을 순서대로 돌려준다. */
function peelDangling(cur: string[]): string[] {
  const moved: string[] = [];
  // 최소 한 단어는 남겨 둔다 — 다 넘기면 빈 줄이 된다.
  while (cur.length > 1 && NO_TRAILING.test(cur[cur.length - 1])) {
    moved.unshift(cur.pop() as string);
  }
  return moved;
}

function packWords(clause: string, maxChars: number): string[] {
  const words = clause.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let cur: string[] = [];
  const len = (a: string[]) => a.join(' ').length;

  for (const w of words) {
    if (cur.length && len([...cur, w]) > maxChars) {
      // 끊기 직전, 마지막 어절이 연결어미가 아니고 그 앞 어절이 연결어미라면
      // 한 어절을 다음 줄로 넘겨 의미 단위를 살린다(단, 남는 조각이 있을 때만).
      if (cur.length >= 2 && !CLAUSE_TAIL.test(cur[cur.length - 1]) && CLAUSE_TAIL.test(cur[cur.length - 2])) {
        const moved = cur.pop() as string;
        const dangling = peelDangling(cur);
        parts.push(cur.join(' '));
        cur = [...dangling, moved, w];
      } else {
        const dangling = peelDangling(cur);
        parts.push(cur.join(' '));
        cur = [...dangling, w];
      }
    } else {
      cur.push(w);
    }
  }
  if (cur.length) parts.push(cur.join(' '));
  return parts;
}

export function captionChunks(
  narration: string,
  durationInFrames: number,
  maxChars = 16,
  speechFrames?: number,
): SentenceBound[] {
  // ★자막이 뒤로 갈수록 늦어지던 원인★
  // 씬 길이(durationInFrames)는 "나레이션 오디오 + 끝 여백 0.6초"다(run.ts TAIL_PAD_FRAMES).
  // 자막을 씬 길이 전체에 비례 배분하면 그 여백까지 나눠 갖게 되어, 씬 끝으로 갈수록
  // 소리보다 최대 0.6초 뒤처진다. 말이 끝났는데 자막이 아직 안 넘어가는 그 현상이다.
  // 그래서 실제 오디오 길이(speechFrames)가 주어지면 그 구간에만 배분한다.
  const span = speechFrames && speechFrames > 0 ? Math.min(speechFrames, durationInFrames) : durationInFrames;
  const sentences = sentenceBounds(narration, span);
  const out: SentenceBound[] = [];
  for (const s of sentences) {
    // ★의미 단위로 먼저 자른다★
    // 예전엔 글자 수만 보고 단어를 채워 넣어서 "…읽고 쓰는 것에서" / "확대되기 때문에 어떤"
    // 처럼 쉼표를 무시하고 끊겼다. 쉼표·가운뎃점 같은 문장부호는 말하는 사람이 실제로 쉬는
    // 자리이므로, 여기서 먼저 끊으면 자막이 호흡과 맞는다.
    const clauses = splitClauses(s.text);
    const parts: string[] = [];
    for (const clause of clauses) {
      parts.push(...packWords(clause, maxChars));
    }
    // 글자수로만 자르면 마지막에 "-합니다." 같은 접미사 한 조각만 남아 다음 자막이
    // 문맥 없는 꼬리말처럼 보이는 문제가 있다. 너무 짧은 조각은 바로 앞 조각에 합쳐
    // (maxChars 를 살짝 넘기더라도) 어색한 고아 자막을 없앤다.
    // 5 였는데 "시절에는," 같은 5자 조각이 0.6초만 스치고 지나갔다. 6 으로 올리면
    // 앞 조각에 붙어 한 호흡으로 읽힌다(쉼표는 그대로 남아 끊는 지점은 보인다).
    const MIN_CHUNK_CHARS = 6;
    for (let i = parts.length - 1; i > 0; i--) {
      if (parts[i].length < MIN_CHUNK_CHARS) {
        parts[i - 1] = `${parts[i - 1]} ${parts[i]}`;
        parts.splice(i, 1);
      }
    }
    if (parts.length === 0) continue;
    // 문장 구간을 구절 글자수 비례로 분배.
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    let acc = 0;
    const sentSpan = s.end - s.start; // 바깥 span(씬 전체)과 헷갈리지 않게 이름을 나눈다
    for (const p of parts) {
      const start = s.start + (acc / total) * sentSpan;
      acc += p.length;
      const end = s.start + (acc / total) * sentSpan;
      out.push({ text: p, start, end });
    }
  }
  return out;
}

/** 현재 프레임 기준, 지금까지 등장한 요소들 중 가장 최근 요소의 인덱스(-1=아직 없음). */
export function activeIndex(revealAt: number[], frame: number): number {
  let idx = -1;
  for (let i = 0; i < revealAt.length; i++) if (frame >= revealAt[i]) idx = i;
  return idx;
}
