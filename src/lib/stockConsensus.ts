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
  /** 야후 심볼("253590.KQ"). 사이트가 주므로 추측하지 않는다. */
  symbol?: string | null;
  /** 미국 종목의 티커. 한국은 없다(code 가 숫자라 화면에 쓸 수 없다). */
  ticker?: string | null;
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

/** 파생 엔진인가. 사이트가 derived 를 주면 그 값을, 없으면 id 로 판단한다. */
const isDerived = (e: { id: string; derived?: boolean }) => e.derived ?? DERIVED_ENGINE_IDS.has(e.id);

/** 독립 엔진이 몇 개인지 — "N개 중 M개가 겹쳤다"의 N. */
export function independentEngineCount(brief: Brief): number {
  return (brief.engines ?? []).filter((e) => !isDerived(e)).length;
}

/**
 * 엔진별 목록을 종목 기준으로 뒤집어, 많이 겹친 순서로 돌려준다.
 *
 * 정렬은 (1) 독립 엔진 수, (2) 그 엔진들의 리그 성적 합, (3) 최고 점수 순이다.
 * 성적을 두 번째에 두는 이유: 같은 두 표라도 누적 +9.7% 인 엔진의 표와 -0.6% 인 엔진의
 * 표를 같은 무게로 두면, 못 맞히는 엔진끼리 겹친 종목이 앞으로 온다.
 */
export function consensusPicks(brief: Brief): ConsensusPick[] {
  // ★사이트가 계산해 주면 그것을 쓴다★ 같은 숫자를 두 곳에서 계산하면 언젠가 갈라지고,
  // 그날 사이트 화면과 영상이 서로 다른 말을 하게 된다. 사이트에 agreement 가 생겼으므로
  // 그것이 정답이고, 아래 자체 계산은 옛 응답을 위한 대비책으로만 남긴다.
  if (brief.agreement?.length) {
    const priced = new Map(
      [...brief.picks, ...(brief.engines ?? []).flatMap((e) => e.picks ?? [])].map((p) => [p.code, p]),
    );
    return brief.agreement.map((a) => {
      const p = priced.get(a.code);
      return {
        code: a.code,
        symbol: a.symbol ?? p?.symbol ?? null,
        ticker: a.ticker ?? p?.ticker ?? null,
        name: a.name,
        sector: a.sector,
        price: p?.price ?? 0,
        priceLabel: p?.priceLabel ?? '',
        changePct: p?.changePct ?? 0,
        engines: a.engines.map((e) => ({
          id: e.id,
          nameKo: e.nameKo,
          tagKo: e.tagKo,
          reason: e.reason,
          pnlPct: e.leaguePnlPct,
          derived: e.derived,
        })),
        independentCount: a.independentCount,
        inHeadlineList: a.inHeadlineList,
        bestScore: p?.score ?? 0,
      };
    });
  }

  const engines = brief.engines ?? [];
  if (engines.length < 2) return []; // 엔진이 하나뿐이면 "합의"라는 말 자체가 성립하지 않는다.

  const headline = new Set(brief.picks.map((p) => p.code));
  const byCode = new Map<string, ConsensusPick>();

  for (const e of engines) {
    const derived = isDerived(e);
    for (const p of e.picks ?? []) {
      let hit = byCode.get(p.code);
      if (!hit) {
        hit = {
          code: p.code,
          symbol: p.symbol,
          ticker: p.ticker,
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

/**
 * 엔진이 든 이유를 썸네일에 박을 수 있는 사람 말로 줄인다.
 *
 * ★썸네일에 내부 용어를 쓰면 아무도 안 누른다★ "온톨로지 + 수급·차트 동시 지목",
 * "현대해상도 방식 합의" 같은 말은 이 파이프라인을 만든 사람만 아는 말이다. 목록에서
 * 1초 보고 지나가는 사람에게는 무슨 소리인지 알 수 없는 글자 덩어리다. 엔진이 실제로 든
 * 근거는 "유가가 8.85% 올랐다", "20일선 위에 있고 정배열이다" 처럼 그 자체로 알아들을 수
 * 있는 말이라, 그것을 그대로 꺼내 쓴다.
 *
 * 응답의 이유 문장은 엔진마다 형식이 일정하다(양쪽 시장 모두 확인).
 *   onto  : "유가(WTI) +8.85% → 정유화학 민감도 +0.65"
 *   quant : "추세 — 20일선 +12.3% · 20/60선 정배열(12.4%)"
 *   ta    : "차트 거장 13종 전략 합의 점수 +0.40 (이평·MACD·일목·터틀 등)"
 * 형식이 바뀌면 빈 문자열이 나오고 호출부가 알아서 곁가지를 생략한다 — 이상한 글자가
 * 썸네일에 박히는 것보다 아무것도 없는 편이 낫다.
 */
export function plainReason(c: ConsensusPick, max = 2, skipOnto = false): string {
  const out: string[] = [];
  for (const e of c.engines) {
    if (e.derived) continue;
    // 같은 사실을 썸네일에 두 번 쓰지 않는다 — 거시 원인을 큰 블록에 이미 박은 날은 뺀다.
    if (skipOnto && e.id === 'onto') continue;
    const r = e.reason ?? '';
    if (e.id === 'onto') {
      // 화살표 앞이 원인이다. 괄호 안 약어(WTI)는 빼야 짧고 읽힌다.
      const cause = r.split('→')[0].replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      // ★오른 것만 "수혜"라고 쓴다★ "코스피 -4.82% 수혜" 는 말이 안 된다. 실제로는
      // 지수가 빠질 때 오히려 강한 업종이라는 뜻인데(민감도가 양수), 그 이야기는 한
      // 조각으로 줄일 수 없다. 줄여서 이상해지느니 이 조각은 버리고 차트 쪽 근거를 쓴다.
      if (/\+[\d.]+%/.test(cause)) out.push(`${cause} 수혜`);
    } else if (e.id === 'quant') {
      const ma = /20일선\s*([+-][\d.]+%)/.exec(r);
      if (/정배열/.test(r)) out.push(ma ? `20일선 ${ma[1]} 정배열` : '차트 정배열');
      else if (ma) out.push(`20일선 ${ma[1]}`);
    } else if (e.id === 'ta') {
      const n = /(\d+)종/.exec(r);
      out.push(n ? `차트전략 ${n[1]}종 합의` : '차트전략 합의');
    }
  }
  return out.slice(0, max).join(' · ');
}

/** 대표 목록에만 있고 다른 엔진은 아무도 안 든 종목 — "온톨로지 단독"임을 밝혀야 하는 자리. */
export function soloPicks(brief: Brief): Pick[] {
  const agreed = new Set(agreedPicks(brief).map((c) => c.code));
  return brief.picks.filter((p) => !agreed.has(p.code));
}
