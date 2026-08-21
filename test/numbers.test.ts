/**
 * 숫자를 소리 나는 대로 읽는지 — 실제로 나갔던 문장으로 확인한다.
 *
 * ★이걸 놓쳐서 첫 영상이 못 쓰게 됐다★ "102,000원"과 "-2.04%"를 TTS 에 날것으로 넘겼고,
 * 음성은 쉼표에서 끊고 마이너스를 빼먹었다. 주식 채널에서 부호가 사라지는 것은 치명적이다.
 */
import { sino, speakNumbers, ordinal, speakLatinAcronyms } from '../src/lib/koreanNumber.js';

let fail = 0;
const eq = (got: string, want: string, label: string) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? '  ✓' : '  ✗', label, ok ? '' : `\n      받음: ${JSON.stringify(got)}\n      기대: ${JSON.stringify(want)}`);
};

console.log('■ sino — 정수');
eq(sino(0), '영', '0');
eq(sino(7), '칠', '7');
eq(sino(10), '십', '10');
eq(sino(20), '이십', '20');
eq(sino(102000), '십만 이천', '102000');
eq(sino(127000), '십이만 칠천', '127000');
eq(sino(1544000), '백오십사만 사천', '1544000');
eq(sino(13), '십삼', '13');

console.log('■ speakNumbers — 실제로 나갔던 문장들');
eq(speakNumbers('현재 102,000원'), '현재 십만 이천원', '원 금액');
eq(speakNumbers('127,000원, +2.92%입니다'), '십이만 칠천원, 플러스 이 점 구이 퍼센트입니다', '금액 + 등락률');
eq(speakNumbers('-2.04%'), '마이너스 이 점 영사 퍼센트', '음수 퍼센트');
eq(speakNumbers('코스피 +4.53%'), '코스피 플러스 사 점 오삼 퍼센트', '양수 퍼센트');
eq(speakNumbers('민감도 -0.35'), '민감도 마이너스 영 점 삼오', '음수 소수');
eq(speakNumbers('종합 점수는 0.49입니다'), '종합 점수는 영 점 사구입니다', '점수');
eq(speakNumbers('5개 중 4개가 교체'), '다섯 개 중 네 개가 교체', '개 = 고유어');
eq(speakNumbers('20일선 +20.4%'), '이십일선 플러스 이십 점 사 퍼센트', '20일선');
eq(speakNumbers('20/60선 정배열'), '이십/육십선 정배열', '20/60선');
eq(speakNumbers('2일째 이어지고'), '이일째 이어지고', '일째');
eq(speakNumbers('전략 13종의 합의'), '전략 십삼종의 합의', '종');

console.log('■ ordinal');
eq(ordinal(1), '첫 번째', '1번째 — 한 번째가 아니라 첫 번째');
eq(ordinal(3), '세 번째', '3번째');

console.log('■ 범위·고유어 단위');
// 단위는 앞 숫자에도 붙여 준다 — "육에서 십삼일" 은 앞이 무엇의 6인지 알 수 없다.
eq(speakNumbers('평균 보유 6~13일'), '평균 보유 육일에서 십삼일', '물결표 = 범위, 단위 복사');
eq(speakNumbers('3~5%'), '삼 퍼센트에서 오 퍼센트', '범위에 퍼센트');
eq(speakNumbers('2~3배로'), '이에서 삼배로', '단위 목록에 없으면 복사하지 않는다');

console.log('■ 라틴 약어 낱글자 읽기');
// TTS 가 영어 단어로 읽으려다 실패해 어색해지는 것을 막는다 — 한국어로 실제 읽는
// 방식(낱글자 이름을 이어 붙임)을 그대로 텍스트에 박는다.
eq(speakLatinAcronyms('변동성, VIX 플러스 십일'), '변동성, 브이아이엑스 플러스 십일', 'VIX');
eq(speakLatinAcronyms('이평·MACD·일목'), '이평·엠에이씨디·일목', 'MACD');
eq(speakLatinAcronyms('GS는 정유화학'), '지에스는 정유화학', '두 글자 티커');
// 한 글자만 대문자이거나 소문자가 섞이면 건드리지 않는다 — 다른 규칙(attach)의 자리다.
eq(speakLatinAcronyms('S-Oil은 정유'), 'S-Oil은 정유', '회사명 일부는 손대지 않는다');
eq(speakLatinAcronyms('Pretendard 폰트'), 'Pretendard 폰트', '소문자 섞인 단어는 손대지 않는다');
eq(speakNumbers('한국 5종목 가운데'), '한국 다섯 종목 가운데', '종목 = 고유어');

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
