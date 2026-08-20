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
}

export interface Brief {
  market: Market;
  marketKo: string;
  basis: string;
  basisNote?: string;
  regime: { label: string; tone: string; riskOff: number; lines: string[] };
  causal: string[];
  sectors: { recommend: Array<{ sector: string; score: number; reasons: string[] }>; avoid: Array<{ sector: string; score: number; reasons: string[] }> };
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
  engines?: Array<{ id: string; nameKo: string; tagKo?: string; descKo?: string; live?: boolean; leaguePnlPct?: number; picks: Pick[] }>;
  league?: { currency: string; strategies: Array<{ nameKo: string; tagKo: string; live: boolean; pnlPct: number; equity: number }> };
  dataAsOf: number;
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
  return { date: data.date, brief, disclaimer: data.disclaimer };
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
