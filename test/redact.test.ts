/**
 * 발주 기관 이름 지우기.
 *
 * ★채널 앞면에 박히는 글자다★ 프롬프트에 "쓰지 마라"고 적어 두었지만 그런 지시는 가끔
 * 새고, 27편 중 하나에서 조용히 새면 사람이 눈치채기 어렵다. 그래서 나가는 글자를 실제로
 * 확인하는 쪽을 최후 방어선으로 둔다 — 그 방어선이 제대로 도는지를 여기서 본다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactClient, type CourseMeta } from '../src/lib/courseMeta.js';

const base: CourseMeta = {
  title: '',
  summary: '',
  keyPoints: [],
  tags: [],
  chapters: [],
  hookSource: '',
  thumbnailHeadline: '',
  thumbnailBadge: '',
  thumbnailBadge2: '',
};

const only = (over: Partial<CourseMeta>) => redactClient({ ...base, ...over });

test('대체어를 넣지 않고 뺀다 — "공공기관"이 박히면 회사원은 자기 얘기로 안 읽는다', () => {
  const out = only({ title: '환경부 문서를 정확하게 활용하는 법' });
  assert.ok(!out.title.includes('환경부'));
  assert.ok(!out.title.includes('공공기관'));
  assert.equal(out.title, '문서를 정확하게 활용하는 법');
});

test('뒤에 붙은 조사까지 떼어 낸다 — "의 문서" 가 남으면 그대로 보인다', () => {
  assert.equal(only({ title: '환경부의 문서 정리' }).title, '문서 정리');
  assert.equal(only({ title: '환경부에서 쓰는 방법' }).title, '쓰는 방법');
  assert.equal(only({ summary: '환경부는 이렇게 씁니다.' }).summary, '이렇게 씁니다.');
});

test('겹친 공백과 문장부호 앞 공백을 정리한다', () => {
  assert.equal(only({ summary: 'AI 를 환경부 업무에 쓴다.' }).summary, 'AI 를 업무에 쓴다.');
  assert.equal(only({ summary: '대상은 환경부, 그리고 현장.' }).summary, '대상은, 그리고 현장.');
});

test('제목·설명뿐 아니라 태그·챕터·썸네일 문구까지 본다 — 빈 태그는 버린다', () => {
  const out = only({
    tags: ['환경부', 'AI'],
    chapters: [{ at: '0:00', label: '환경부 소개' }],
    thumbnailHeadline: '**환경부 문서**\n3줄만 붙여라',
    thumbnailBadge2: '환경부',
  });
  assert.deepEqual(out.tags, ['AI']);
  assert.equal(out.chapters[0].label, '소개');
  assert.ok(!out.thumbnailHeadline.includes('환경부'));
  assert.equal(out.thumbnailBadge2, '');
});

test('COURSE_REDACT_AS 를 주면 그 말로 갈아 끼운다 — 조사는 건드리지 않는다', () => {
  process.env.COURSE_REDACT_AS = '우리 기관';
  try {
    assert.equal(only({ title: '환경부의 문서' }).title, '우리 기관의 문서');
  } finally {
    delete process.env.COURSE_REDACT_AS;
  }
});

test('지울 말이 없으면 그대로 둔다', () => {
  process.env.COURSE_REDACT = '';
  try {
    assert.equal(only({ title: '환경부 문서' }).title, '환경부 문서');
  } finally {
    delete process.env.COURSE_REDACT;
  }
});

/**
 * 훈계조 검사. 강의 자막 자체가 가르치는 말이라 그 어조가 문구로 딸려 오기 쉽다.
 */
import { flagScolding } from '../src/lib/courseMeta.js';

test('훈계로 읽히는 말을 잡아낸다', () => {
  assert.deepEqual(flagScolding('**양식 하나로**\n평생 재사용'), ['평생']);
  assert.deepEqual(flagScolding('API 키는\n제대로 숨겨라'), ['제대로', '명령형']);
  assert.deepEqual(flagScolding('엑셀 **총정리**\n핵심만'), ['총정리', '핵심']);
});

test('유튜브 말투는 걸리지 않는다', () => {
  assert.deepEqual(flagScolding('**API 키** 여기 두면\n털립니다'), []);
  assert.deepEqual(flagScolding('이걸 아직\n**손으로** 하고 있었음'), []);
  assert.deepEqual(flagScolding('노트북 날아가도\n**코드는 삽니다**'), []);
  assert.deepEqual(flagScolding('아직 손으로 해요?'), []);
});
