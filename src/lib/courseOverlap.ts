/**
 * 강의 제목이 얼마나 닮았는지 재는 척도. 발행 전 중복 확인이 사람에게 보여 줄 목록을
 * 뽑는 데 쓴다 — 판정이 아니라 후보 추리기다.
 *
 * 낱말이 얼마나 겹치는지로 잰다. 완전일치로는 못 잡는다 — 같은 강의라도 발행 제목은 대본을 읽고
 * 새로 쓰기 때문에 파일 이름과 글자가 다르다. 짧은 쪽을 분모로 두어, 긴 제목 안에 짧은
 * 주제가 통째로 들어 있는 경우를 놓치지 않는다.
 */
const STOP = new Set(['그리고', '위한', '하는', '만들기', '이해하기', '까지', '부터', '무엇이', '어떻게', 'ai', '강의']);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[^0-9a-z가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}
