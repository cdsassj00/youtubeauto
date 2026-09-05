/**
 * 기준 시점 문구 — "오늘"이라고 말하면 며칠 뒤 이 영상은 거짓말이 된다.
 *
 * ★실제로 틀린 문장이 나갈 뻔했다★ 사이트가 주는 sessionKo 는 토요일에도 "장 마감 —
 * 오늘 종가 기준입니다" 였다. 그날 종가는 없었고 값은 금요일 것이었다. 영상은 올린 날에만
 * 보는 것도 아니라, 일주일 뒤에 본 사람에게 "오늘"은 그 사람의 오늘이 된다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionLabel, sessionBadge } from '../src/lib/stockFeed.js';

// 2026-09-04 15:30 KST = 2026-09-04T06:30:00Z (금요일 한국장 마감)
const FRI_CLOSE_KST = Date.parse('2026-09-04T06:30:00Z');

test('마감 뒤에는 날짜를 박는다 — "오늘"이라고 하지 않는다', () => {
  const s = sessionLabel('closed', FRI_CLOSE_KST, 'KR');
  assert.equal(s, '9월 4일 종가 기준입니다');
  assert.ok(!s.includes('오늘'));
});

test('장중이면 시각까지 말한다 — 몇 분 뒤면 달라지는 값이다', () => {
  // 2026-09-04 13:05 KST
  const s = sessionLabel('open', Date.parse('2026-09-04T04:05:00Z'), 'KR');
  assert.equal(s, '9월 4일 13시 05분 기준입니다');
});

test('장 시작 전이면 직전 거래일 종가임을 밝힌다', () => {
  const s = sessionLabel('pre', FRI_CLOSE_KST, 'KR');
  assert.ok(s.includes('직전 거래일 종가'));
});

test('미국은 뉴욕 시간으로 읽는다', () => {
  // 2026-09-04 16:00 ET = 20:00Z (서머타임). 한국 시간으로 읽으면 9월 5일이 되어 하루 어긋난다.
  const s = sessionLabel('closed', Date.parse('2026-09-04T20:00:00Z'), 'US');
  assert.equal(s, '9월 4일 종가 기준입니다');
});

test('배지는 짧게 — 날짜는 옆 줄이 따로 들고 있다', () => {
  assert.equal(sessionBadge('open'), '장중');
  assert.equal(sessionBadge('closed'), '종가 기준');
  assert.equal(sessionBadge('pre'), '장 시작 전');
});
