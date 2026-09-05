/**
 * stockontology.cc 공개 API 에서 하루치 재료를 가져온다.
 *
 * ★인증이 없다★ 공개 데이터만 나오고 계좌·주문은 애초에 포함되지 않는다. 그래서 러너에
 * 비밀을 하나도 더 넣지 않고 붙일 수 있다.
 *
 * ★화면은 SVG 로 받는다★ 예전에는 사이트를 브라우저로 열어 스크린샷 하려 했는데, 이
 * 컨테이너에서는 브라우저 접속 자체가 막힌다(같은 주소가 curl 로는 열린다). 사이트가
 * 서버에서 완성본 SVG 를 그려 주기로 해서 브라우저가 통째로 필요 없어졌다 — sharp 로
 * PNG 만 뽑으면 된다.
 */
import sharp from 'sharp';

const BASE = process.env.STOCK_API_BASE ?? 'https://stockontology.cc';

export type Market = 'KR' | 'US';

/**
 * 지지·저항과 그 근거. 사이트가 스윙 피벗 → 1.5% 클러스터링 → 2회 이상 부딪힌 자리만
 * 채택해서 계산한다.
 *
 * ★없으면 null 이다★ 근거가 없는 날은 추정으로 채우지 않는다고 사이트가 명시했다.
 * 실제로 한국 브리프는 levels 가 null 로 오는 날이 있다. 그러므로 이 값을 쓰는 자리는
 * 전부 "없으면 그 줄을 통째로 생략"으로 짜야 한다 — 빈 값을 0 원으로 읽으면 최악이다.
 */
export interface Levels {
  support: Array<{ price: number; touches: number; lastTouchDate: string }>;
  resistance: Array<{ price: number; touches: number; lastTouchDate: string }>;
  ma?: { ma5?: number; ma20?: number; ma60?: number; ma120?: number };
  week52?: { high: number; low: number };
  atr14?: number;
  volume?: { today: number; avg20: number };
  /** "36,200은 최근 3번 저항받은 자리(최근 8월)입니다" — 왜 그 가격이 의미 있는지. */
  levelNote?: string;
}

/**
 * 지금 가격에서 의미가 있는 지지선만 고른다.
 *
 * ★먼 지지선은 거짓말이 된다★ 2026-09-04 자 미국 응답에서 MPC 는 현재가 $382 인데
 * 지지선이 $190.36 으로 왔다(-50%). 52주 최저가 근처의 오래된 스윙 피벗이라 계산으로는
 * 맞지만, "다음 장에 볼 종목"의 썸네일에 "지지 $190"을 박으면 반값에 사라는 말로 읽힌다.
 * 며칠 단위로 보는 이 영상에서 닿을 수 없는 가격은 정보가 아니라 오해다.
 *
 * 그래서 현재가에서 band 안에 있는 것만 쓰고, 없으면 아무 말도 하지 않는다.
 */
export function nearSupport(levels: Levels | null | undefined, price: number, bandPct = 12) {
  if (!levels?.support?.length || !price) return null;
  const near = levels.support.filter((s) => s.price <= price && (price - s.price) / price <= bandPct / 100);
  return near.sort((a, b) => b.price - a.price)[0] ?? null; // 가장 가까운(=가장 높은) 지지
}

/** 같은 이유로 저항도 위쪽 band 안에 있는 것만. */
export function nearResistance(levels: Levels | null | undefined, price: number, bandPct = 15) {
  if (!levels?.resistance?.length || !price) return null;
  const near = levels.resistance.filter((r) => r.price >= price && (r.price - price) / price <= bandPct / 100);
  return near.sort((a, b) => a.price - b.price)[0] ?? null;
}

/**
 * 52주 최고가까지 얼마나 남았는가 — 지지선이 멀 때 쓸 수 있는 다른 사실.
 * 신고가에 가깝다는 것은 그 자체로 구체적이고 확인 가능한 숫자다.
 */
export function gapToHigh(levels: Levels | null | undefined, price: number): number | null {
  const hi = levels?.week52?.high;
  if (!hi || !price || hi < price) return null;
  return ((hi - price) / price) * 100;
}

export interface Pick {
  code: string;
  ticker?: string | null;
  name: string;
  sector: string | null;
  score: number;
  price: number;
  priceLabel: string;
  changePct: number;
  reason: string;
  reasons?: string[];
  isNew?: boolean;
  daysInList?: number;
  /** 지지·저항. 근거가 없으면 null 로 온다. */
  levels?: Levels | null;
  /**
   * 이 엔진의 백테스트 실측 평균 보유일.
   * ★예측이 아니다★ "이 종목이 며칠 유효하다"가 아니라 "이 방식은 평균 며칠 들고 있었다"다.
   * 영상에서 말할 때 이 구분을 흐리면 하지 않은 약속을 하는 셈이 된다.
   */
  horizonDays?: number | null;
  horizonNote?: string | null;
}

/** 사이트가 계산해 주는 엔진 합의. 계산을 한 곳에서만 하려고 이 값을 그대로 쓴다. */
export interface AgreementItem {
  code: string;
  ticker?: string | null;
  name: string;
  sector: string | null;
  independentCount: number;
  engines: Array<{ id: string; nameKo: string; tagKo?: string; derived: boolean; reason: string; leaguePnlPct?: number }>;
  inHeadlineList: boolean;
}

export interface Brief {
  market: Market;
  marketKo: string;
  basis: string;
  basisNote?: string;
  regime: { label: string; tone: string; riskOff: number; lines: string[] };
  causal: string[];
  sectors: {
    recommend: Array<{ sector: string; score: number; reasons: string[] }>;
    avoid: Array<{ sector: string; score: number; reasons: string[] }>;
    /** 상위 4개로 자르지 않은 전 섹터. sector:<이름> 화면이 이 목록에서 찾는다. */
    all?: Array<{ sector: string; score: number; reasons?: string[] }>;
  };
  picks: Pick[];
  avoid: Pick[];
  dropped?: Array<{ code: string; name: string; reason: string }>;
  previous?: {
    date: string;
    basisNote: string;
    picks: Array<{ code: string; name: string; recPrice: number; nowPrice: number; changePct: number }>;
    hitRate: number;
    avgChangePct: number;
  } | null;
  speech?: { opening: string; causal: string[]; picks: string[]; closing: string; narrative?: string };
  /** 국면이 며칠째인가 · 무엇이 바뀌었나 — "매일 비슷하다"에 답하는 블록. */
  narrative?: {
    regime?: { tone: string; label: string; streakDays: number; changed: boolean; prevLabel?: string };
    sectors?: { kept: string[]; entered: string[]; left: string[] };
    pickTurnover?: { changed: number; total: number };
    summaryKo: string;
    meaningKo: string;
  };
  engines?: Array<{ id: string; nameKo: string; tagKo?: string; descKo?: string; live?: boolean; leaguePnlPct?: number; derived?: boolean; picks: Pick[] }>;
  /** 사이트가 계산한 엔진 합의. 있으면 이걸 그대로 쓴다(계산은 한 곳에서만). */
  agreement?: AgreementItem[];
  /**
   * 이 계산을 실제로 매매에 쓸 수 있는 첫 거래일. 공휴일까지 반영된 값이다.
   *
   * ★직접 계산하면 틀린다★ 예전에는 주말만 건너뛰어 다음 날을 구했는데, 2026-09-04 자
   * 미국 브리프의 실제 targetSession 은 9/8 이다(9/7 이 Labor Day). 주말만 보면 9/7 로
   * 잘못 나온다. 휴장일은 사이트가 알고 있으므로 이 값을 그대로 쓴다.
   */
  targetSession?: string;
  /** 계산에 쓴 시세의 거래일. */
  dataSessionDate?: string;
  /** 이 시세가 마감 확정값인가. false 면 발행하지 않는다. */
  sessionClosed?: boolean;
  /**
   * 리그 성적을 낸 모집단 크기(KR 120 = 코스피200, US 155).
   *
   * ★순위표 모집단과 다르다★ 종목을 뽑는 순위표는 505종목(한국 350 · 미국 155)으로
   * 넓어졌는데, 리그·모의매매 성적은 여전히 좁은 목록으로만 돌린다. 검증 없이 넓힌
   * 종목을 매매 후보로 쓰지 않으려는 사이트 쪽의 의도적 분리다.
   *
   * 영상이 이 둘을 나란히 놓으면 "이 방식이 +9.7% 벌었다"는 성적이 오늘 뽑힌 코스닥
   * 종목까지 검증한 것처럼 들린다. 하지 않은 검증을 했다고 말하는 셈이라, 리그 성적을
   * 말하는 자리에서는 반드시 이 숫자를 함께 밝힌다.
   */
  leagueUniverse?: number;
  /**
   * 종목을 고르는 순위표의 모집단 크기(2026-09 기준 KR 350 · US 155).
   *
   * ★리그 모집단과 같을 수도 있다★ 미국은 둘 다 155 로 같아서, 그날 "성적을 낸 목록
   * 밖에서도 뽑힌다"고 말하면 사실이 아니다. 한국만 350 대 120 으로 벌어져 있다.
   * 그래서 단서를 달지 말지는 이 두 숫자를 비교해서 정한다 — 안전해 보인다고 아무 데나
   * 붙이는 경고도 결국 틀린 말이다.
   */
  rankUniverse?: number;
  league?: { currency: string; strategies: Array<{ nameKo: string; tagKo: string; live: boolean; pnlPct: number; equity: number }> };
  /** 시세가 마지막으로 갱신된 시각. */
  dataAsOf: number;
  /** 그게 몇 분 전인지 — 수집이 멈췄는지 판단하는 값(freshnessProblem). */
  dataAgeMinutes?: number;
  /** 이 응답을 계산한 시각. 이 사이트는 부르는 순간 계산하므로 대개 지금이다. */
  generatedAt: number;
}

export interface DailyBrief {
  version: number;
  date: string;
  briefs: Brief[];
  disclaimer: string;
}

async function getJson(url: string): Promise<unknown> {
  // ★5xx 한 번은 봐준다★ 서버 캐시가 5분 주기라 갱신 순간에 흔들릴 수 있다. 그 한 번 때문에
  // 그날 발행이 통째로 빠지는 것이 더 나쁘다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status < 500 || attempt === 1) throw new Error(`${url} → HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error('unreachable');
}

export async function fetchBrief(market: Market): Promise<{ date: string; brief: Brief; disclaimer: string }> {
  const data = (await getJson(`${BASE}/api/daily-brief?market=${market}`)) as DailyBrief;
  const brief = data.briefs?.[0];
  if (!brief) throw new Error(`daily-brief 응답에 ${market} 블록이 없습니다.`);
  [brief.leagueUniverse, brief.rankUniverse] = await Promise.all([
    fetchUniverse(`${BASE}/api/lab/overview?market=${market}`),
    fetchUniverse(`${BASE}/api/quant/rank?market=${market}&limit=1`),
  ]);
  return { date: data.date, brief, disclaimer: data.disclaimer };
}

/**
 * 리그 성적의 모집단 크기. 실패하면 undefined 를 돌려주고 영상은 숫자 없이 말한다.
 *
 * ★이것 때문에 발행이 멈추면 안 된다★ 있으면 더 정확해지는 곁가지 정보지 영상의 재료가
 * 아니다. 그래서 여기서만 예외를 삼킨다 — 다른 호출은 실패하면 그대로 터뜨린다.
 */
async function fetchUniverse(url: string): Promise<number | undefined> {
  try {
    const d = (await getJson(url)) as { universe?: number };
    return typeof d.universe === 'number' ? d.universe : undefined;
  } catch {
    return undefined;
  }
}

/** 오늘 날짜(KST). 사이트의 date 가 KST 기준이라 UTC 로 비교하면 새벽 회차가 하루 어긋난다. */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 이 브리프로 영상을 만들어도 되는가. 문제가 있으면 사람이 읽을 이유를, 없으면 null.
 *
 * ★자동 발행에서 제일 위험한 실패는 "조용히 어제 것을 오늘 것이라고 내보내는 것"이다★
 * 이 사이트는 밤에 도는 배치가 없고 API 를 부르는 순간 계산하므로 "어제 파일이 남는"
 * 형태의 실패는 없다. 하지만 시세 수집이 멈춘 채로도 계산은 되기 때문에, 낡은 시세로
 * 만들어진 오늘치 응답이 나올 수 있다. 그건 눈으로 구별이 안 된다 — 필드로 봐야 한다.
 *
 * 규칙은 사이트 쪽과 맞춘 것이다(docs/DAILY-BRIEF-API.md 3-1):
 *   · date 가 오늘(KST)일 것
 *   · basis 가 intraday 가 아닐 것 — 장중 값은 종가가 아니라서 내일 채점 기준이 흔들린다
 *   · dataAgeMinutes 가 12시간 미만일 것
 *
 * ★미국이 prev_close 로 오는 것은 정상이다★ 미국장은 그날 아침(KST)에 이미 끝나 있어
 * 저녁에 부르면 "직전 종가"가 최신이다. 이건 낡은 값이 아니라 확정된 값이다.
 */
export function freshnessProblem(date: string, brief: Brief, maxAgeMinutes = 720): string | null {
  const today = todayKst();
  if (date !== today) return `브리프 날짜가 ${date} 입니다(오늘은 ${today}).`;
  // ★sessionClosed 가 공식 판정이다★ basis 는 값이 셋(prev_close/intraday/post_close)이고
  // 앞으로 늘 수도 있어서, 문자열 하나만 걸러 내는 방식은 새 값이 생기면 조용히 통과시킨다.
  // 사이트가 "마감 확정인가"를 불리언으로 따로 주기로 해서 그것을 먼저 본다.
  if (brief.sessionClosed === false) return '아직 장이 끝나지 않았습니다(sessionClosed=false) — 마감 확정 뒤에 만들어야 합니다.';
  if (brief.basis === 'intraday') return '장중(intraday) 기준 값입니다 — 종가가 확정된 뒤에 만들어야 합니다.';
  const age = brief.dataAgeMinutes;
  if (typeof age === 'number' && age >= maxAgeMinutes) {
    return `시세가 ${Math.round(age / 60)}시간 전 값입니다(허용 ${maxAgeMinutes / 60}시간) — 수집이 멈춘 것으로 보입니다.`;
  }
  return null;
}

/** 사이트가 서버에서 그려 주는 1920×1080 완성 화면. view 는 overview / sector:X / stock:CODE / league / backtest. */
export async function fetchSceneImage(market: Market, view: string, outPath: string): Promise<void> {
  const url = `${BASE}/api/scene.svg?market=${market}&view=${encodeURIComponent(view)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const svg = Buffer.from(await res.arrayBuffer());
  // ★density 는 72★ sharp 는 density/72 배로 SVG 를 키운다. 96 을 주면 1920 짜리가 조용히
  // 2560 으로 커져서 나중에 잘린다. 예전에 썸네일 띠에서 똑같이 당했다.
  const png = await sharp(svg, { density: 72 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== 1920 || meta.height !== 1080) {
    throw new Error(`장면 이미지 크기가 예상과 다릅니다: ${meta.width}x${meta.height} (${view})`);
  }
  await sharp(png).toFile(outPath);
}
