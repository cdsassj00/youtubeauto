/**
 * 오늘 브리프로 대본을 조립해서 계획만 찍어 본다 — 돈이 드는 것은 아무것도 하지 않는다.
 *
 * 발행 전에 "오늘 재료로 몇 분짜리가 나오는가"를 사람이 눈으로 확인하는 자리다.
 * TTS·렌더·업로드는 이 스크립트에서 절대 하지 않는다.
 */
import { fetchBrief } from '../lib/stockBrief.js';
import { buildStockScenes, planSummary } from '../lib/stockScript.js';

const market = (process.env.STOCK_MARKET ?? 'KR').toUpperCase() as 'KR' | 'US';

const { date, brief, disclaimer } = await fetchBrief(market);
const scenes = buildStockScenes(brief);

console.log(`■ ${date} ${brief.marketKo} · ${brief.regime.label} · basis=${brief.basis}`);
console.log(`  데이터 시각 ${new Date(brief.dataAsOf).toISOString()}`);
console.log(`  어제 채점: ${brief.previous ? `적중 ${brief.previous.hitRate} · 평균 ${brief.previous.avgChangePct}%` : '아직 없음'}\n`);
console.log(planSummary(scenes));
console.log(`\n  면책: ${disclaimer.slice(0, 60)}…`);

// ★섹터가 비어 있으면 음성으로 "미분류 업종"이 나간다★ 그대로 내보내면 이상하게 들리므로
// 발행 전에 사람이 알아야 한다. 실패로 끝내지는 않는다 — 하루 쉬는 것보다 아는 게 낫다.
const noSector = [...brief.picks, ...brief.avoid].filter((p) => !p.sector);
if (noSector.length) console.log(`\n  ⚠ 섹터가 비어 있는 종목: ${noSector.map((p) => p.name).join(', ')}`);
