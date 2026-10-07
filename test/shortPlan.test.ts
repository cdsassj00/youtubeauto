/**
 * 모델이 준 시각을 자막 경계로 당기는 부분.
 *
 * ★첫 음절이 잘리면 그 편은 거기서 끝이다★ 모델은 30초 단위 묶음을 보고 답하므로 시각이
 * 대충 맞는다. 쇼츠는 첫 1초가 전부라 "…셀에서 십만 줄" 로 시작하면 아무도 안 본다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapToCues, type ShortPlan } from '../src/lib/shortPlan.js';
import type { ParsedSrt } from '../src/lib/srt.js';

const cue = (start: number, end: number) => ({ start, end, text: 'x' });
const parsed: ParsedSrt = {
  cues: [cue(0, 4), cue(10, 14), cue(14.5, 19), cue(20, 26), cue(26.5, 33), cue(34, 41), cue(42, 50), cue(51, 60)],
  transcript: '',
  durationSec: 60,
};
const base: ShortPlan = {
  hookTemplateId: 1, hook: 'a\nb', startSec: 0, endSec: 0, why: '', title: '', summary: '', tags: [], outro: '',
};

test('말이 시작되는 자막으로 당긴다 — 중간에서 시작하지 않는다', () => {
  // 12초를 달라고 했지만 그 대사는 10초에 시작한다. 중간부터 틀면 첫 음절이 잘린다.
  const p = snapToCues({ ...base, startSec: 12, endSec: 45 }, parsed, 20, 40);
  assert.ok(Math.abs(p.startSec - 9.85) < 0.01, `시작 ${p.startSec}`);
});

test('말이 끝나는 자막에서 자른다 — 설명이 중간에 안 끊기게', () => {
  const p = snapToCues({ ...base, startSec: 10, endSec: 38 }, parsed, 20, 32);
  // 9.85 + 32 = 41.85 안에서 끝나는 마지막 대사는 34~41 이다.
  assert.ok(Math.abs(p.endSec - 41.25) < 0.01, `끝 ${p.endSec}`);
});

test('상한을 넘기지 않는다', () => {
  const p = snapToCues({ ...base, startSec: 0, endSec: 999 }, parsed, 20, 30);
  assert.ok(p.endSec - p.startSec <= 30.5, `길이 ${p.endSec - p.startSec}`);
});

test('자막이 띄엄띄엄해도 최소 길이는 채운다', () => {
  const sparse: ParsedSrt = { cues: [cue(0, 2), cue(50, 52)], transcript: '', durationSec: 60 };
  const p = snapToCues({ ...base, startSec: 0, endSec: 5 }, sparse, 30, 45);
  assert.ok(p.endSec - p.startSec >= 30, `길이 ${p.endSec - p.startSec}`);
});

test('자막이 없으면 그대로 돌려준다 — 터지지 않는다', () => {
  const empty: ParsedSrt = { cues: [], transcript: '', durationSec: 0 };
  assert.deepEqual(snapToCues({ ...base, startSec: 3, endSec: 9 }, empty, 10, 20), { ...base, startSec: 3, endSec: 9 });
});
