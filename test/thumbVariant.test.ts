/**
 * 편마다 썸네일 판이 실제로 달라지는지.
 *
 * ★눈으로 한 번 확인하고 끝낼 일이 아니다★ 색 목록이나 판 목록을 하나 늘리거나 줄이면
 * 주기가 맞아떨어져 "연달아 같은 것"이 조용히 돌아온다. 그때는 스물일곱 편이 다 올라간
 * 뒤에야 눈에 띈다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbVariant } from '../src/lib/thumbVariant.js';

test('바로 다음 편과는 판도 색도 다르다', () => {
  for (let o = 1; o <= 60; o++) {
    const a = thumbVariant(o);
    const b = thumbVariant(o + 1);
    assert.notEqual(a.layout, b.layout, `${o}편과 ${o + 1}편의 판이 같습니다`);
    assert.notEqual(a.accent, b.accent, `${o}편과 ${o + 1}편의 색이 같습니다`);
  }
});

test('같은 조합이 돌아오는 데 열두 편이 걸린다', () => {
  const key = (o: number) => {
    const v = thumbVariant(o);
    return `${v.layout}|${v.accent}|${v.cropVariant}`;
  };
  const seen = new Map<string, number>();
  for (let o = 1; o <= 12; o++) {
    assert.ok(!seen.has(key(o)), `${o}편이 ${seen.get(key(o))}편과 같은 조합입니다`);
    seen.set(key(o), o);
  }
  assert.equal(key(13), key(1));
});

test('회차가 0이나 음수여도 터지지 않는다', () => {
  for (const o of [0, -1, -99]) {
    const v = thumbVariant(o);
    assert.ok(LAYOUTS.includes(v.layout));
    assert.match(v.accent, /^#[0-9a-f]{6}$/);
    assert.ok(v.cropVariant >= 0 && v.frameRank >= 0);
  }
});
const LAYOUTS = ['screen', 'bare', 'band', 'boxed'];
