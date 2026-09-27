/**
 * 파일 이름에서 순번·모듈·주제를 떼어내는 규칙.
 *
 * ★여기가 조용히 틀리는 자리다★ 순번을 못 읽으면 그 파일은 "올릴 의사가 없는 것"으로
 * 취급해 건너뛴다. 라벨 문구가 [유튜브추천_1순위] 에서 [추천순위02] 로 바뀌었을 때
 * 40개 중 39개가 통째로 빠졌고, 아무 오류도 나지 않았다. 폴더마다 이름 규칙이 조금씩
 * 다르니 실제로 쓰는 세 폴더의 표기를 그대로 박아 둔다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourseFileName } from '../src/lib/courseFiles.js';

test('[추천순위NN] — 숫자가 "순위" 뒤에 오는 표기', () => {
  const f = parseCourseFileName('[추천순위02]_2일차오전_M04_스킬과_컨텍스트_엔지니어링.mp4');
  assert.equal(f?.order, 2);
  assert.equal(f?.moduleLabel, '2일차 오전 M04');
  assert.equal(f?.topic, '스킬과 컨텍스트 엔지니어링');
});

test('[유튜브추천_N순위] — 숫자가 "순위" 앞에 오는 표기', () => {
  const f = parseCourseFileName('[유튜브추천_1순위]_1일차_M09_LLM은_어떻게_답을_만드는가.mp4');
  assert.equal(f?.order, 1);
  assert.equal(f?.moduleLabel, '1일차 M09');
});

test('발주 기관 이름이 앞에 붙어도 모듈 라벨을 떼어낸다', () => {
  // 환경부 폴더의 실제 이름. 기관 이름을 못 넘기면 라벨이 빈칸이 되고 배지와 색 묶음이
  // 같이 망가진다. 기관 이름은 공개 제목에 넣을 것도 아니라 주제에서도 빠져야 한다.
  const f = parseCourseFileName('[추천순위01]_환경부_1일차_M04_RAG와_컨텍스트로_기관_문서를_정확하게_활용하는_법.mp4');
  assert.equal(f?.order, 1);
  assert.equal(f?.moduleLabel, '1일차 M04');
  assert.equal(f?.topic, 'RAG와 컨텍스트로 기관 문서를 정확하게 활용하는 법');
  assert.ok(!f?.topic.includes('환경부'));
});

test('대괄호가 없는 01_ 표기도 받는다', () => {
  const f = parseCourseFileName('07_2일차_M03_Git과_GitHub.mp4');
  assert.equal(f?.order, 7);
  assert.equal(f?.moduleLabel, '2일차 M03');
});

test('순번이 없으면 건너뛴다 — 폴더에 섞인 안내문이 발행되지 않게', () => {
  assert.equal(parseCourseFileName('안내.txt'), null);
  assert.equal(parseCourseFileName('[초안]_1일차_M01_제목.mp4'), null);
});

test('일차·모듈 형식이 아니어도 순번이 있으면 버리지 않는다', () => {
  const f = parseCourseFileName('[추천순위03]_직원의_AI_시도를_조직_혁신으로_연결하는_리더십.mp4');
  assert.equal(f?.order, 3);
  assert.equal(f?.moduleLabel, '');
  assert.equal(f?.topic, '직원의 AI 시도를 조직 혁신으로 연결하는 리더십');
});

/**
 * 발행 전 중복 확인의 닮음 척도. 사람이 보고 판단할 목록을 뽑는 도구라, 불용어 몇 개를
 * 고치면 결과가 조용히 달라진다. 실제로 마주친 세 가지 경우를 박아 둔다.
 */
import { similarity } from '../src/lib/courseOverlap.js';

test('같은 강의는 글자가 달라도 닮음이 높다', () => {
  const s = similarity(
    'Git과 GitHub로 AI 코드를 클라우드에 저장하기',
    'AI 에이전트 업무자동화[16/27] Git과 GitHub로 AI 코드를 클라우드에 저장하기',
  );
  assert.ok(s >= 0.8, `닮음 ${s}`);
});

test('주제만 같고 다른 녹화는 중간쯤 — 판정하지 않고 사람에게 넘긴다', () => {
  const s = similarity('생성형 AI와 LLM은 어떻게 학습하고 답을 만들까', 'LLM은 어떻게 답을 만드는가');
  assert.ok(s > 0.4 && s < 1, `닮음 ${s}`);
});

test('무관한 강의는 낮다 — 목록이 전부 걸리면 쓸모가 없다', () => {
  const s = similarity('Supabase에 API 키를 숨겨 AI 기능 연결하기', '리더가 AI를 알아야 하는 이유와 ChatGPT 업무 활용');
  assert.ok(s < 0.3, `닮음 ${s}`);
});
