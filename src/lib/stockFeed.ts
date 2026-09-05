/**
 * 수시 발행용 — "지금 무슨 일이 일어났는가"를 받아 온다 (/api/feed, /api/stock/<코드>/bundle).
 *
 * ★데일리와 무엇이 다른가★ daily-brief 는 하루 한 번 마감 뒤의 결론 한 장이다. 그것만
 * 쓰면 505종목을 분석해 놓고 하루 5종목만 내보내게 된다. 그렇다고 아무 때나 "이 종목
 * 좋습니다"를 반복하면 매번 같은 영상이 된다. 수시 발행이 성립하려면 "왜 하필 지금
 * 이 종목인가"가 있어야 하고, 그것이 이벤트다.
 *
 * ★이벤트는 값이 큰 것이 아니라 바뀐 것이다★ 사이트 쪽 설계가 그렇다 — 거래대금 3배가
 * 어제도 3배였으면 이벤트가 아니다. 그래서 whyNowKo("직전까지는 온톨로지만 들고 있었는데
 * 수급이 새로 들어왔습니다")가 성립한다. 이 문장이 이 영상의 존재 이유다.
 *
 * ★첫 호출은 비어 있는 것이 정상이다★ 비교할 스냅샷이 없는데 "새로 겹쳤다"고 말하면
 * 거짓이라, 사이트가 스냅샷만 만들고 다음 갱신부터 실제 변화를 낸다. 그러므로 이벤트가
 * 0건인 것은 고장이 아니다 — 그날은 발행하지 않고 조용히 끝낸다.
 */
import type { Levels } from './stockBrief.js';
import type { TaPlan } from './stockTa.js';

const BASE = process.env.STOCK_API_BASE ?? 'https://stockontology.cc';

export type Market = 'KR' | 'US';
/** 장 상태. 장중에 "마감 기준"이라고 말하면 거짓말이 되므로 문구를 이 값으로 가른다. */
export type SessionState = 'pre' | 'open' | 'closed';

/** 이벤트 종류. 그대로 영상 한 편의 주제가 된다. */
export type FeedKind =
  | 'new_agreement'
  | 'agreement_lost'
  | 'breakout'
  | 'volume_surge'
  | 'support_test'
  | 'plan_upgrade'
  | 'plan_downgrade'
  | 'regime_shift'
  | 'streak';

export interface FeedEvent {
  id: string;
  at: number;
  /** 시장 단위 이벤트(regime_shift)는 종목이 없어 null 로 온다. */
  code: string | null;
  symbol?: string | null;
  name: string;
  sector?: string | null;
  kind: FeedKind;
  headlineKo: string;
  whyNowKo: string;
  strength: number;
  /** strength × 종류 가중치. 흔한 이벤트가 목록을 도배하지 않도록 사이트가 계산해 준다. */
  priority: number;
  price?: number;
  changePct?: number;
}

export interface Feed {
  market: Market;
  asOf: number;
  sessionState: SessionState;
  sessionKo: string;
  staleAfterMinutes: number;
  events: FeedEvent[];
}

export interface Bundle {
  code: string;
  symbol: string;
  name: string;
  sector: string | null;
  /** 어느 시장인지. 없으면 심볼 접미사로 가른다. */
  market?: Market;
  price: number;
  priceLabel: string;
  changePct: number;
  asOf: number;
  sessionState: SessionState;
  sessionKo: string;
  staleAfterMinutes: number;
  /** 이 종목을 지금 다룰 이유 — 거시·수급·차트 세 갈래. */
  why: { macroKo?: string | null; flowKo?: string | null; chartKo?: string | null };
  ontology?: unknown | null;
  flow?: unknown | null;
  levels?: Levels | null;
  plan?: TaPlan | null;
  strategies?: Array<{ id: string; nameKo: string; author?: string; verdict: string; score: number; text: string }>;
  consensus?: { score?: number; verdict?: string; text?: string; buy?: number; sell?: number; neutral?: number } | null;
  indicators?: Record<string, number> | null;
  chart?: { close?: number[] };
  /** 사이트가 그려 주는 화면 주소. 유니버스 밖 종목은 null 이다. */
  views?: Record<string, string> | null;
  /** 30~45초 세로 한 편에 들어갈 낭독용 문장. */
  shortsBrief?: { hookKo: string; bodyKo: string[]; closeKo: string; numbers: string[] } | null;
  disclaimerKo?: string;
}

async function getJson<T>(url: string): Promise<T> {
  // 5분 엣지 캐시가 있어 같은 URL 을 다시 부르면 갱신 전 값이 온다(사이트 쪽 안내).
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchFeed(market: Market, opts: { since?: number; limit?: number; excludeCodes?: string[] } = {}): Promise<Feed> {
  const q = new URLSearchParams({ market, limit: String(opts.limit ?? 20) });
  if (opts.since) q.set('since', String(opts.since));
  if (opts.excludeCodes?.length) q.set('excludeCodes', opts.excludeCodes.join(','));
  return getJson<Feed>(`${BASE}/api/feed?${q}`);
}

export async function fetchBundle(codeOrSymbol: string): Promise<Bundle> {
  return getJson<Bundle>(`${BASE}/api/stock/${encodeURIComponent(codeOrSymbol)}/bundle`);
}

/**
 * 이 값으로 영상을 만들어도 되는가. 문제가 있으면 사람이 읽을 이유를, 없으면 null.
 *
 * ★장중이라고 막지는 않는다★ 수시 발행은 장중에도 나가는 것이 정상이다. 대신 문구를
 * "지금 이 시각 기준"으로 바꾼다(sessionLabel). 다만 사이트가 알려 준 유효 시간을
 * 넘긴 값이면 그건 낡은 값이라 쓰면 안 된다.
 */
export function feedProblem(f: Pick<Feed, 'asOf' | 'staleAfterMinutes'>): string | null {
  const ageMin = (Date.now() - f.asOf) / 60000;
  if (!Number.isFinite(ageMin)) return '응답에 시각(asOf)이 없습니다.';
  if (ageMin > f.staleAfterMinutes) {
    return `값이 ${Math.round(ageMin)}분 전 것입니다(이 시간대 허용 ${f.staleAfterMinutes}분) — 수집이 멈춘 것으로 보입니다.`;
  }
  return null;
}

/**
 * 화면·나레이션에 쓸 기준 시점 문구.
 *
 * ★장중에 "마감 기준"이라고 하면 거짓말이다★ 같은 값이라도 장이 열려 있으면 몇 분 뒤에
 * 달라진다. 그래서 무엇을 기준으로 한 값인지 말로 남긴다.
 */
export function sessionLabel(state: SessionState, sessionKo?: string): string {
  if (sessionKo) return sessionKo;
  if (state === 'open') return '장중 — 지금 이 시각 기준입니다';
  if (state === 'pre') return '장 시작 전 — 직전 거래일 종가 기준입니다';
  return '장 마감 — 오늘 종가 기준입니다';
}
