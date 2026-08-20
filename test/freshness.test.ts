/**
 * 신선도 검사 — 자동 발행에서 제일 위험한 실패를 막는 곳.
 *
 * ★조용히 어제 것을 오늘 것이라고 내보내는 사고★ 사이트는 부르는 순간 계산하므로
 * "어제 파일이 남는" 실패는 없지만, 시세 수집이 멈춘 채로도 계산은 된다. 그렇게 나온
 * 응답은 눈으로 구별이 안 된다 — 필드로 봐야 한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshnessProblem, todayKst, type Brief } from '../src/lib/stockBrief.js';

const brief = (over: Partial<Brief> = {}) => ({ basis: 'post_close', dataAgeMinutes: 30, ...over }) as Brief;

test('신선하면 통과한다', () => {
  assert.equal(freshnessProblem(todayKst(), brief()), null);
});

test('미국이 prev_close 로 오는 것은 정상이다', () => {
  // 미국장은 그날 아침(KST)에 이미 끝나 있어 저녁에 부르면 직전 종가가 최신이다.
  // 낡은 값이 아니라 확정된 값이라 막으면 안 된다.
  assert.equal(freshnessProblem(todayKst(), brief({ basis: 'prev_close', dataAgeMinutes: 213 })), null);
});

test('날짜가 어긋나면 막는다', () => {
  const problem = freshnessProblem('2020-01-01', brief());
  assert.match(String(problem), /브리프 날짜가 2020-01-01/);
});

test('장중 값이면 막는다', () => {
  // 종가가 아니라서 내일 채점의 기준가가 흔들린다.
  assert.match(String(freshnessProblem(todayKst(), brief({ basis: 'intraday' }))), /장중/);
});

test('시세가 12시간 넘게 안 갱신되면 막는다', () => {
  assert.equal(freshnessProblem(todayKst(), brief({ dataAgeMinutes: 719 })), null);
  assert.match(String(freshnessProblem(todayKst(), brief({ dataAgeMinutes: 720 }))), /시세가 12시간 전/);
});

test('dataAgeMinutes 가 없으면 나이로는 막지 않는다', () => {
  // 사이트가 필드를 안 주던 시절 응답이 섞여 와도 발행이 통째로 멈추면 안 된다.
  // 날짜와 basis 검사는 그대로 걸린다.
  assert.equal(freshnessProblem(todayKst(), brief({ dataAgeMinutes: undefined })), null);
});
