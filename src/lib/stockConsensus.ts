/**
 * 서로 다른 엔진이 같은 종목을 동시에 지목했는지 센다.
 *
 * ★이게 이 채널이 팔아야 할 정보다★ 사이트는 방식이 다른 엔진을 여러 개 돌린다 —
 * 거시 인과(온톨로지), 돌파+거래대금(수급·차트), 전략 13종 합의(차트 거장). 근거가 다른
 * 방식이 같은 종목에서 만나면 그 자체가 신호다. 그런데 영상은 온톨로지 한 엔진의 점수만
 * 읊고 있었다. 2026-09-04 자 데이터로 보면 온톨로지 대표 목록(한미사이언스·SK이노베이션·
 * S-Oil·아난티·JB금융지주)과, 엔진들이 실제로 겹친 종목(SK케미칼·롯데웰푸드·현대해상)이
 * 아예 다르다. 시청자가 알고 싶은 것은 후자다.
 *
 * ★융합 엔진은 따로 센다★ fusion 은 설명부터가 "온톨로지+수급"이다. 온톨로지와 수급이
 * 고른 종목을 융합이 또 고르는 것은 독립된 세 번째 의견이 아니라 같은 근거를 두 번 세는
 * 것이다. 그대로 세면 "세 방식이 동시에 지목"이라고 부풀려 말하게 된다 — 종목 추천에서
 * 근거를 부풀리는 것은 그냥 거짓말이다. 그래서 파생 엔진을 뺀 수(independentCount)를
 * 따로 두고, 화면과 나레이션이 주장하는 숫자는 언제나 이 값을 쓴다.
 */
import type { Brief, Pick } from './stockBrief.js';

/** 다른 엔진의 결과를 재료로 쓰는 엔진. 독립된 한 표로 세지 않는다. */
const DERIVED_ENGINE_IDS = new Set(['fusion']);

export interface ConsensusEngine {
  id: string;
  nameKo: string;
  tagKo?: string;
  /** 이 엔진이 그 종목을 뽑은 이유 한 줄. */
  reason: string;
  /** 리그 누적 수익률 — 어느 엔진의 표가 실적으로 뒷받침되는지. */
  pnlPct?: number;
  /** 다른 엔진의 결과를 재조합한 엔진인가. */
  derived: boolean;
}

export interface ConsensusPick {
  code: string;
  name: string;
  sector: string | null;
  price: number;
  priceLabel: string;
  changePct: number;
  /** 이 종목을 뽑은 엔진들 (파생 포함). */
  engines: ConsensusEngine[];
  /** 파생 엔진을 뺀 수 — 화면·나레이션이 주장해도 되는 숫자. */
  independentCount: number;
  /** 대표 목록(사이트 첫 화면)에도 올라 있는가. */
  inHeadlineList: boolean;
  /** 엔진들이 매긴 점수 중 가장 높은 값. */
  bestScore: number;
}

/** 독립 엔진이 몇 개인지 — "N개 중 M개가 겹쳤다"의 N. */
export function independentEngineCount(brief: Brief): number {
  return (brief.engines ?? []).filter((e) => !DERIVED_ENGINE_IDS.has(e.id)).length;
}

/**
 * 엔진별 목록을 종목 기준으로 뒤집어, 많이 겹친 순서로 돌려준다.
 *
 * 정렬은 (1) 독립 엔진 수, (2) 그 엔진들의 리그 성적 합, (3) 최고 점수 순이다.
 * 성적을 두 번째에 두는 이유: 같은 두 표라도 누적 +9.7% 인 엔진의 표와 -0.6% 인 엔진의
 * 표를 같은 무게로 두면, 못 맞히는 엔진끼리 겹친 종목이 앞으로 온다.
 */
export function consensusPicks(brief: Brief): ConsensusPick[] {
  const engines = brief.engines ?? [];
  if (engines.length < 2) return []; // 엔진이 하나뿐이면 "합의"라는 말 자체가 성립하지 않는다.

  const headline = new Set(brief.picks.map((p) => p.code));
  const byCode = new Map<string, ConsensusPick>();

  for (const e of engines) {
    const derived = DERIVED_ENGINE_IDS.has(e.id);
    for (const p of e.picks ?? []) {
      let hit = byCode.get(p.code);
      if (!hit) {
        hit = {
          code: p.code,
          name: p.name,
          sector: p.sector,
          price: p.price,
          priceLabel: p.priceLabel,
          changePct: p.changePct,
          engines: [],
          independentCount: 0,
          inHeadlineList: headline.has(p.code),
          bestScore: p.score,
        };
        byCode.set(p.code, hit);
      }
      hit.engines.push({
        id: e.id,
        nameKo: e.nameKo,
        tagKo: e.tagKo,
        reason: (p.reasons ?? [])[0] ?? p.reason,
        pnlPct: e.leaguePnlPct,
        derived,
      });
      if (!derived) hit.independentCount++;
      hit.bestScore = Math.max(hit.bestScore, p.score);
    }
  }

  const pnlSum = (c: ConsensusPick) =>
    c.engines.filter((e) => !e.derived).reduce((s, e) => s + (e.pnlPct ?? 0), 0);

  return [...byCode.values()].sort(
    (a, b) =>
      b.independentCount - a.independentCount ||
      pnlSum(b) - pnlSum(a) ||
      b.bestScore - a.bestScore,
  );
}

/** 서로 다른 방식이 둘 이상 겹친 종목만. 없으면 빈 배열 — 없는 날은 없다고 말해야 한다. */
export function agreedPicks(brief: Brief, minEngines = 2): ConsensusPick[] {
  return consensusPicks(brief).filter((c) => c.independentCount >= minEngines);
}

/** "온톨로지·수급·차트 거장" 처럼 엔진 이름을 잇는다(파생 엔진은 뺀다). */
export function engineNames(c: ConsensusPick): string[] {
  return c.engines.filter((e) => !e.derived).map((e) => e.nameKo);
}

/** 대표 목록에만 있고 다른 엔진은 아무도 안 든 종목 — "온톨로지 단독"임을 밝혀야 하는 자리. */
export function soloPicks(brief: Brief): Pick[] {
  const agreed = new Set(agreedPicks(brief).map((c) => c.code));
  return brief.picks.filter((p) => !agreed.has(p.code));
}
