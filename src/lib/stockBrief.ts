/**
 * stockontology.cc /api/daily-brief 응답을 영상으로 내보내도 되는지 판정한다.
 *
 * 주식 쇼츠(scripts/stock-shorts.mjs)가 쓴다. 예전 8분 미드폼이 쓰던 대본·장면 조립은 들어냈고,
 * 종목·목표가·손절가는 사이트 공식 추천(briefs[].horizons)을 그대로 옮긴다.
 */

export type Market = 'KR' | 'US';

/** 판정에 필요한 칸만. 나머지 칸은 쇼츠 쪽에서 응답을 그대로 읽는다. */
export interface Brief {
  market: Market;
  marketKo: string;
  /** prev_close / intraday / post_close — 늘어날 수 있어 sessionClosed 를 먼저 본다. */
  basis: string;
  /** 이 시세가 마감 확정값인가. false 면 발행하지 않는다. */
  sessionClosed?: boolean;
  /** 시세가 몇 분 전 값인가 — 수집이 멈췄는지 보는 값. */
  dataAgeMinutes?: number;
}

/** 오늘 날짜(KST). 사이트의 date 가 KST 기준이라 UTC 로 비교하면 새벽 회차가 하루 어긋난다. */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 이 브리프로 영상을 만들어도 되는가. 문제가 있으면 사람이 읽을 이유를, 없으면 null.
 *
 * ★자동 발행에서 제일 위험한 실패는 "조용히 어제 것을 오늘 것이라고 내보내는 것"이다★
 * 시세 수집이 멈춘 채로도 계산은 되기 때문에 낡은 시세로 만든 오늘치 응답이 나올 수 있다.
 * 규칙(사이트 docs/DAILY-BRIEF-API.md 3-1):
 *   · date 가 오늘(KST)일 것
 *   · sessionClosed 가 false 가 아닐 것, basis 가 intraday 가 아닐 것
 *   · dataAgeMinutes 가 12시간 미만일 것
 * ★미국이 prev_close 로 오는 것은 정상이다★ 미국장은 그날 아침(KST)에 이미 끝나 확정된 값이다.
 */
export function freshnessProblem(date: string, brief: Brief, maxAgeMinutes = 720): string | null {
  const today = todayKst();
  if (date !== today) return `브리프 날짜가 ${date} 입니다(오늘은 ${today}).`;
  if (brief.sessionClosed === false) return '아직 장이 끝나지 않았습니다(sessionClosed=false) — 마감 확정 뒤에 만들어야 합니다.';
  if (brief.basis === 'intraday') return '장중(intraday) 기준 값입니다 — 종가가 확정된 뒤에 만들어야 합니다.';
  const age = brief.dataAgeMinutes;
  if (typeof age === 'number' && age >= maxAgeMinutes) {
    return `시세가 ${Math.round(age / 60)}시간 전 값입니다(허용 ${maxAgeMinutes / 60}시간) — 수집이 멈춘 것으로 보입니다.`;
  }
  return null;
}
