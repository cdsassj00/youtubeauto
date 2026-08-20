/**
 * 설명 나레이션의 숫자 검사.
 *
 * ★이 검사가 LLM 을 쓸 수 있게 해 주는 유일한 근거다★ 프롬프트로 "지어내지 마라"고
 * 해 두면 대개 지켜지지만 가끔 샌다. 그리고 새는 날은 매일 나가는 영상 중 어느 하루라서
 * 사람이 못 잡는다. 여기서 잡혀야 한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { numbersIn, unknownNumbers } from '../src/lib/stockNarrate.js';

test('숫자 추출', () => {
  assert.deepEqual(numbersIn('유가 +3.99%'), ['3.99']);
  // 천단위 쉼표는 지우고 본다 — 49,200 과 49200 은 같은 값이다.
  assert.deepEqual(numbersIn('49,200원'), ['49200']);
  // 음수 부호는 값의 일부다. 부호가 뒤집히는 것이 이 채널에서 가장 위험한 조작이다.
  assert.deepEqual(numbersIn('원/달러 -1.57%'), ['-1.57']);
  assert.deepEqual(numbersIn('숫자 없음'), []);
  // 뒤에 붙은 0 은 값이 같다 — "0.20" 과 "0.2" 를 다르다고 하면 멀쩡한 문장이 버려진다.
  assert.deepEqual(numbersIn('0.20'), ['0.2']);
  assert.deepEqual(numbersIn('05'), ['5']);
});

test('facts 에 있는 숫자만 통과한다', () => {
  const facts = '등락률: +2.50%\n종합 점수: 0.57\n현재가: 49,200원';

  // 그대로 쓴 것은 통과
  assert.deepEqual(unknownNumbers('49,200원에 종합 점수 0.57입니다.', facts), []);
  assert.deepEqual(unknownNumbers('49200원입니다.', facts), []);
  // 숫자를 아예 안 쓴 설명도 통과 — 오히려 이쪽이 바람직하다
  assert.deepEqual(unknownNumbers('원유를 사다 가공해 파는 업종이라 재고 평가액이 먼저 오릅니다.', facts), []);

  // ★반올림은 막는다★ 2.50 을 "약 3%" 로 뭉개면 화면과 소리가 어긋난다.
  assert.deepEqual(unknownNumbers('약 3% 올랐습니다.', facts), ['3']);
  // ★부호를 뒤집으면 잡힌다★
  assert.deepEqual(unknownNumbers('-2.50% 입니다.', facts), ['-2.5']);
  // ★없는 값을 계산해 넣으면 잡힌다★
  assert.deepEqual(unknownNumbers('세 종목 합쳐 1.71%입니다.', facts), ['1.71']);
  // ★없는 사실(연도·순위 등)도 예외 없이 잡는다★ 예외를 두면 그 틈으로 들어온다.
  assert.deepEqual(unknownNumbers('2024년 이후 처음입니다.', facts), ['2024']);
});

test('여러 개가 섞여 있으면 전부 돌려준다', () => {
  const facts = '점수: 0.57';
  assert.deepEqual(unknownNumbers('0.57 인데 1.2 배이고 3위입니다.', facts).sort(), ['1.2', '3']);
});
