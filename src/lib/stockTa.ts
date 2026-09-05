/**
 * 종목 하나의 차트 분석과 매매 플랜을 가져온다 (/api/ta).
 *
 * ★이 파일의 존재 이유는 검증이다★ 이 API 는 야후 심볼로 부르는데, 한국 종목은 코드에
 * 접미사를 붙여야 한다(코스피 .KS, 코스닥 .KQ). 그런데 틀린 접미사를 넣어도 404 가 아니라
 * 200 이 온다 — 야후가 엉뚱한 종목을 잡아 주기 때문이다. 실제로 코스닥 종목인 네오셈
 * (253590)을 .KS 로 부르면 이름이 "253590.KS,0P0001CSPE,10057028", 가격 14,450 인 응답이
 * 200 으로 돌아온다(진짜 값은 .KQ 의 11,290). 이걸 그대로 쓰면 다른 종목의 가격으로
 * 매수가·손절가를 말하게 된다. 투자 영상에서 그보다 나쁜 사고는 없다.
 *
 * 그래서 후보 심볼을 차례로 불러 보고, 브리프가 알려 준 가격과 맞는 것만 받아들인다.
 * 어느 것도 맞지 않으면 null 을 돌려주고, 호출부는 매매 플랜 없이 영상을 만든다 —
 * 확인되지 않은 숫자를 내보내느니 그 자리를 비우는 편이 낫다.
 */
import type { Market } from './stockBrief.js';

const BASE = process.env.STOCK_API_BASE ?? 'https://stockontology.cc';

/** 시세 스냅샷 시각이 달라 생기는 오차는 봐준다. 잘못된 종목은 이보다 훨씬 크게 벌어진다. */
const PRICE_TOLERANCE = 0.03;

export interface TaPlan {
  /** long | wait | avoid — 지금 사도 되는가에 대한 판정. */
  bias: string;
  biasKo: string;
  entry?: { low: number; high: number; note?: string };
  stop?: { price: number; pct: number; note?: string };
  targets?: Array<{ price: number; pct: number; note?: string }>;
  /** 손익비. */
  rr?: number;
  /** "종가가 52,501 아래로 마감하면 이 계획은 틀린 것입니다" — 언제 틀린 것인지. */
  invalidation?: string;
  grade?: string;
  gradeKo?: string;
  checklist?: Array<{ text: string; pass: boolean }>;
}

export interface TaResult {
  symbol: string;
  name: string;
  price: number;
  plan?: TaPlan;
  strategies?: Array<{ id: string; nameKo: string; author?: string; verdict: string; score: number; text: string }>;
  consensus?: { score?: number; verdict?: string; textKo?: string };
  trend?: unknown;
}

/** 부를 심볼 후보. 한국은 접미사를 알 수 없어 둘 다 시도하고, 가격으로 가린다. */
function candidates(market: Market, code: string, ticker?: string | null): string[] {
  if (market === 'US') return ticker ? [ticker] : [];
  return [`${code}.KS`, `${code}.KQ`];
}

/**
 * 가격이 맞는 심볼의 분석 결과만 돌려준다. 확인 못 하면 null.
 *
 * @param expectedPrice 브리프가 알려 준 그 종목의 현재가. 이것이 정답지 역할을 한다.
 */
export async function fetchTaVerified(
  market: Market,
  code: string,
  ticker: string | null | undefined,
  expectedPrice: number,
): Promise<TaResult | null> {
  if (!expectedPrice) return null;
  for (const symbol of candidates(market, code, ticker)) {
    try {
      // ★캐시를 우회한다★ scene·카드 SVG 는 5분 엣지 캐시라 같은 URL 을 다시 부르면
      // 갱신 전 값이 온다(사이트 쪽에서 알려 준 함정). JSON 도 같은 앞단을 지나므로 붙인다.
      const res = await fetch(`${BASE}/api/ta?symbol=${encodeURIComponent(symbol)}&cb=${Date.now()}`);
      if (!res.ok) continue;
      const d = (await res.json()) as TaResult;
      const gap = Math.abs((d.price ?? 0) - expectedPrice) / expectedPrice;
      if (Number.isFinite(gap) && gap <= PRICE_TOLERANCE) return { ...d, symbol };
      console.warn(`  · ${symbol} 은 가격이 맞지 않아 버립니다 (응답 ${d.price} vs 브리프 ${expectedPrice})`);
    } catch (e) {
      console.warn(`  · ${symbol} 조회 실패(무시):`, (e as Error).message);
    }
  }
  return null;
}

/**
 * 매매 플랜을 사람이 읽는 문장으로. 없는 값은 말하지 않는다.
 *
 * ★bias 를 감추지 않는다★ 오늘 1등 합의 종목(SK케미칼)의 플랜이 "대기 — 조건 미충족"
 * 이었다. 합의로 뽑혔다고 해서 지금 사도 되는 자리라는 뜻은 아니다. 둘은 다른 질문인데,
 * 영상이 뽑힌 것만 말하고 대기라는 판정을 빼면 사도 된다는 말로 들린다.
 */
export function planLines(ta: TaResult, money: (n: number) => string): string[] {
  const p = ta.plan;
  if (!p) return [];
  const out: string[] = [`판정: ${p.biasKo}${p.gradeKo ? ` · ${p.gradeKo}` : ''}`];
  if (p.entry) out.push(`진입 ${money(p.entry.low)}~${money(p.entry.high)}`);
  if (p.stop) out.push(`손절 ${money(p.stop.price)} (${p.stop.pct.toFixed(1)}%)`);
  for (const [i, t] of (p.targets ?? []).slice(0, 2).entries()) {
    out.push(`목표${i + 1} ${money(t.price)} (+${t.pct.toFixed(1)}%)`);
  }
  if (typeof p.rr === 'number') out.push(`손익비 ${p.rr.toFixed(2)}`);
  return out;
}
