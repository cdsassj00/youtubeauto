/**
 * 예약 발행 시각 계산.
 *
 * ★업로드 시각과 공개 시각을 떼어 놓는 이유★
 * videos.insert 는 바이트를 다 받으면 바로 반환한다 — 111MB 짜리가 9초 만에 끝났다.
 * 하지만 그 시점의 유튜브는 아직 트랜스코딩 중이라 고화질이 없다. 그대로 공개하면
 * 발행 직후 들어온 사람이 360p 를 보게 되는데, 하필 그 초반 몇 분이 유튜브가 반응을
 * 재는 구간이다. 첫인상과 초기 지표를 동시에 깎아 먹는다.
 *
 * 그래서 미리 비공개로 올려 두고 publishAt 으로 시각을 지정한다. 유튜브가 처리를 끝낸 뒤
 * 정해진 시각에 스스로 공개로 바꾼다. "6시에 올라와 있다"가 그제서야 사실이 된다.
 */

/** 한국 표준시는 UTC+9 고정이다(서머타임이 없다). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 'HH:MM'(한국 시각)을 받아, 지금 이후로 가장 가까운 그 시각을 UTC ISO 문자열로 돌려준다.
 * 이미 지난 시각이면 다음 날로 넘긴다.
 */
export function nextKstTimeUtc(hhmm: string, now: Date = new Date()): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`발행 시각 형식이 잘못됐습니다: "${hhmm}" (예: "06:00")`);
  const hour = Number(m[1]);
  const min = Number(m[2]);
  if (hour > 23 || min > 59) throw new Error(`발행 시각 범위가 잘못됐습니다: "${hhmm}"`);

  // now 에 9시간을 더하면, 그 값의 UTC 필드가 곧 한국 벽시계 숫자가 된다.
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const target = new Date(Date.UTC(
    kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), hour, min, 0, 0,
  ));
  if (target.getTime() <= kstNow.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - KST_OFFSET_MS).toISOString();
}
