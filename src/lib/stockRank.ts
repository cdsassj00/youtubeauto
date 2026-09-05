/**
 * 순위표에서 발행 후보를 고른다 (/api/quant/rank).
 *
 * ★피드만으로는 하루 한두 편이 한계다★ /api/feed 는 "직전 대비 바뀐 것"만 준다. 그건
 * 발행 이유로는 제일 좋지만 조용한 날에는 0~1건이다. 350종목을 다섯 관점으로 훑어
 * 놓고 하루 한 편은 너무 적다.
 *
 * ★그렇다고 "1위니까 좋습니다"는 아무 때나 할 수 있는 말이다★ 순위 하나만 들고
 * 나가면 어제도 오늘도 같은 말이 된다. 그래서 여기서는 순위 자체가 아니라 **관점들의
 * 교차**를 발행 이유로 삼는다 — 차트만 보는 눈, 수급만 보는 눈, 눌림목을 찾는 눈이
 * 서로 다른 기준인데도 같은 종목에 모였다면 그건 오늘 확인 가능한 사실이다.
 * (역추세는 상승 추세 종목을 싫어하므로, 돌파와 눌림목에 동시에 걸리는 일은 드물다.
 *  그래서 5개 전부 걸린 종목은 실제로 하루 한두 개뿐이다 — 희소해서 값이 있다.)
 */
import type { FeedEvent, Market } from './stockFeed.js';

const BASE = process.env.STOCK_API_BASE ?? 'https://stockontology.cc';

export interface RankProfile {
  id: string;
  nameKo: string;
}

export interface RankRow {
  code: string;
  symbol?: string | null;
  name: string;
  sector: string | null;
  price: number;
  changePct: number;
  score: number;
  taScore?: number;
  turnover?: number;
  /** 이 종목이 왜 이 순위인지 — 기여도가 큰 것부터. 그대로 나레이션 재료가 된다. */
  reasons?: Array<{ text: string; contribution: number }>;
}

export interface RankResponse {
  profile: RankProfile;
  profiles?: RankProfile[];
  universe: number;
  scanned: number;
  updatedAt: number;
  rows: RankRow[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchRank(market: Market, profile?: string, limit = 50): Promise<RankResponse> {
  const q = new URLSearchParams({ market, limit: String(limit) });
  if (profile) q.set('profile', profile);
  return getJson<RankResponse>(`${BASE}/api/quant/rank?${q}`);
}

export interface CrossPick {
  code: string;
  symbol?: string | null;
  name: string;
  sector: string | null;
  price: number;
  changePct: number;
  /** 어느 관점에서 몇 위였는지. 이 목록의 길이가 곧 "몇 개 관점이 지목했나"다. */
  hits: Array<{ profile: string; nameKo: string; rank: number }>;
  bestRank: number;
  reasons: Array<{ text: string; contribution: number }>;
}

/**
 * 다섯 관점을 모두 훑어 종목별로 뒤집는다.
 *
 * ★알 수 없는 프로필은 조용히 다른 결과를 준다★ profile=value 로 물어보면 오류가
 * 아니라 blend 결과가 온다. 그대로 세면 "수급+차트"를 두 번 센 것이 되어 교차 개수가
 * 부풀려진다 — 실제로 이 함수를 처음 쓸 때 그렇게 셌다. 응답이 되돌려준 profile.id 가
 * 요청한 것과 같을 때만 한 표로 인정한다.
 */
export async function crossProfilePicks(market: Market, limit = 20): Promise<CrossPick[]> {
  const base = await fetchRank(market, undefined, limit);
  const profiles = base.profiles?.length ? base.profiles : [base.profile];
  const byCode = new Map<string, CrossPick>();

  for (const p of profiles) {
    let res: RankResponse;
    try {
      res = p.id === base.profile.id ? base : await fetchRank(market, p.id, limit);
    } catch {
      continue; // 한 관점을 못 받아도 나머지로 센다. 다만 개수는 그만큼 보수적이 된다.
    }
    if (res.profile?.id !== p.id) continue;
    res.rows.forEach((row, i) => {
      const cur =
        byCode.get(row.code) ??
        ({
          code: row.code,
          symbol: row.symbol,
          name: row.name,
          sector: row.sector,
          price: row.price,
          changePct: row.changePct,
          hits: [],
          bestRank: 99,
          reasons: [],
        } satisfies CrossPick);
      cur.hits.push({ profile: p.id, nameKo: p.nameKo, rank: i + 1 });
      cur.bestRank = Math.min(cur.bestRank, i + 1);
      // 근거는 기여도가 가장 큰 관점의 것을 남긴다 — 관점마다 같은 말을 조금씩 다르게 한다.
      if ((row.reasons?.length ?? 0) > cur.reasons.length) cur.reasons = row.reasons ?? [];
      byCode.set(row.code, cur);
    });
  }

  return [...byCode.values()].sort((a, b) => b.hits.length - a.hits.length || a.bestRank - b.bestRank);
}

/**
 * 관점 이름을 낭독용으로 줄인다 — "돌파(신고가+대금)" → "돌파".
 *
 * 괄호 안은 화면에서는 친절하지만 소리로 들으면 "돌파 신고가 플러스 대금" 이 되어
 * 무슨 말인지 알 수 없다.
 */
const shortProfile = (n: string) => n.replace(/\s*\(.*?\)/g, '').trim();

/**
 * 교차 종목을 발행 후보(FeedEvent)로 바꾼다.
 *
 * ★문장을 여기서 짓는다★ 사이트가 주는 headlineKo/whyNowKo 가 없는 후보라, 우리가
 * 쓴다. 대신 쓰는 재료는 전부 응답에 있던 값이다(관점 이름·순위·유니버스 크기).
 * 없는 숫자를 지어내지 않는 것이 이 채널의 유일한 자산이다.
 */
export function crossPicksToEvents(picks: CrossPick[], universe: number, minHits = 3): FeedEvent[] {
  const now = Date.now();
  return picks
    .filter((p) => p.hits.length >= minHits)
    .map((p) => {
      const detail = p.hits.map((h) => `${shortProfile(h.nameKo)} ${h.rank}위`).join(' · ');
      const all = p.hits.length >= 5;
      const cnt = ['', '한', '두', '세', '네', '다섯'][p.hits.length] ?? String(p.hits.length);
      return {
        id: `cross_${p.code}_${new Date(now).toISOString().slice(0, 10)}`,
        at: now,
        code: p.code,
        symbol: p.symbol,
        name: p.name,
        sector: p.sector,
        kind: 'cross_profile' as const,
        // ★제목·썸네일에 그대로 들어가는 문장이다★ 길면 썸네일에서 잘리고 제목에서도
        // 뒤가 안 보인다. 사실은 그대로 두고 말만 짧게 줄인다.
        headlineKo: all ? `${cnt} 관점이 모두 지목했습니다` : `서로 다른 관점 ${p.hits.length}개가 겹쳤습니다`,
        // 관점 이름을 두 번 나열하지 않는다 — 순위에서 이미 다 부르고 나서 또 부르면
        // 같은 목록을 두 번 듣게 된다.
        whyNowKo: `${detail}. ${universe}종목을 서로 다른 기준으로 훑었는데 ${cnt} 곳 모두에서 같은 이름이 나왔습니다.`,
        // 걸린 관점 수가 많을수록, 그중 최고 순위가 높을수록 먼저 다룬다.
        strength: Math.min(1, p.hits.length / 5),
        priority: Math.min(1, p.hits.length / 5) * (1 - Math.min(p.bestRank, 20) / 40),
        price: p.price,
        changePct: p.changePct,
      } satisfies FeedEvent;
    });
}
