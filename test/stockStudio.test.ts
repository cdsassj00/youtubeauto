/**
 * 주식 쇼츠 대본·장면 데이터 — 사이트 응답에서 고정 틀로 만든다(scripts/stock-studio.mjs).
 *
 * ★장면 시간이 단어 번호로 걸려 있다★ 'w12' 가 엉뚱한 단어를 가리키면 목표가 선이 손절 말할 때 올라간다.
 * 그래서 시간 지정이 가리키는 단어가 맞는지, 응답 모양이 달라도(공통 1위 없음 · 지지/저항 없음) 틀이 버티는지 본다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — .mjs 스크립트(타입 없음)
import { buildEpisode, parseReason } from '../scripts/stock-studio.mjs';

const pick = (rank: number, code: string, name: string, plan: Record<string, unknown> = {}, why = '유가(WTI) +10.41% → 정유화학 민감도 +0.65') => ({
  rank, code, name, sector: '정유화학', price: 87300, changePct: -3.75, why: { ontologyKo: why },
  plan: { target: 100395, targetPct: 15, stop: 83808, stopPct: -4, ...plan },
});
const bucket = (id: string, picks: unknown[]) => ({ id, nameKo: id, ruleKo: '익절 +15% · 손절 −4%', picks, track: { winRate: 99 } });
const brief = (over: { same?: boolean; levels?: boolean } = {}) => {
  const lv = over.levels === false ? {} : { nearestSupport: { price: 84150, label: '5일선' }, nearestResistance: { price: 111900, label: '52주 최고' } };
  const a = pick(1, 'A', '이수스페셜티케미컬', lv), b = pick(2, 'B', '안랩'), c = pick(3, 'C', '펌텍코리아'), d = pick(3, 'D', '한화시스템');
  const x = pick(1, 'X', 'Marathon Petroleum');
  return {
    market: 'KR', marketKo: '한국', targetSession: '2026-10-19', dataSessionDate: '2026-10-17',
    regime: { label: '위험회피 국면 — 방어와 선별이 우선' },
    horizons: { buckets: [
      bucket('day', [a, b, c]),
      bucket('swing', [over.same === false ? x : a, b, c]),
      bucket('mid', [a, b, c]),
      bucket('long', [a, b, { ...d, plan: { target: null, targetPct: null, stop: 65475, stopPct: -25 } }].map((p: any) => ({ ...p, plan: { ...p.plan, target: null, targetPct: null, stopPct: -25 } }))),
    ] },
  };
};
const wordAt = (ep: any, spec: string) => ep.sentences.flat()[Number(spec.slice(1))];

test('근거 한 줄을 읽는다 — 민감도 이름이 있든 없든', () => {
  assert.deepEqual(parseReason('유가(WTI) +10.41% → 정유화학 민감도 +0.65', 'x'), { label: '유가 (WTI)', spoken: '유가', pct: 10.41, sector: '정유화학', sens: 0.65 });
  assert.equal(parseReason('나스닥 -4.48% → -0.25', '헬스케어')?.sector, '헬스케어');
  assert.equal(parseReason('변동성(VIX) +34.7% (위험선호 경로) → -0.55', '2차전지')?.spoken, '변동성 지수');
  assert.equal(parseReason('알 수 없는 문장', 'x'), null);
});

test('시간 지정이 말하는 그 단어를 가리킨다', () => {
  const ep = buildEpisode(brief(), '2026-10-17');
  const T = ep.D.T;
  assert.equal(wordAt(ep, T.t0), '15%,');
  assert.equal(T.s0, `e${ep.D.S.day}`);
  assert.match(wordAt(ep, T.sup), /지지선/);
  assert.match(wordAt(ep, T.res), /저항선/);
  assert.equal(wordAt(ep, T.ex0), '펌텍코리아,');
  assert.match(wordAt(ep, T.ex1), /^한화시스템/);
  assert.match(wordAt(ep, T.link), /프로필/);
  assert.equal(ep.sentences.length, 15);
  assert.ok(ep.script.endsWith('AI 전문가가 만듭니다.'));
});

test('공통 1위가 없고 지지·저항이 없어도 틀이 버틴다', () => {
  const ep = buildEpisode(brief({ same: false, levels: false }), '2026-10-17');
  assert.equal(ep.D.same, false);
  assert.match(ep.script, /구간마다 1위가 다릅니다/);
  assert.equal(ep.D.S.levels, undefined);
  assert.equal(ep.D.T.sup, null);
  assert.equal(ep.sentences.length, 14);
  // 문장 끝(. ? !)이 이름 안에서 생기지 않는다 — 장면이 문장 번호로 걸려 있다
  assert.equal(ep.script.match(/[.?!](\s|$)/g)?.length, ep.sentences.length);
});

test('백테스트 성적은 대본·장면에 들어가지 않는다', () => {
  const ep = buildEpisode(brief(), '2026-10-17');
  assert.doesNotMatch(JSON.stringify(ep), /winRate|track/);
});
