/**
 * 하루치 브리프를 미드폼 대본(씬 배열)으로 조립한다.
 *
 * ★값과 말을 나눈다★ 숫자는 이 파일이 응답에서 그대로 옮긴다 — 계산도 반올림도 하지
 * 않는다. 하지만 값만 옮기면 나레이션이 API 를 소리 내어 읽는 것이 되어서, "왜 유가가
 * 오르면 정유화학이 좋아지는가" 를 아무도 말해 주지 않는다. 그 설명은 Claude 가 쓰고
 * (stockNarrate.ts), 모델이 쓴 문장에 화면에 없는 숫자가 있으면 코드가 잡아 버린다.
 * 조립은 여전히 순수 함수다 — 설명이 실패해도 이 파일의 문장이 그대로 나간다.
 *
 * ★화풍을 씬마다 바꾼다★ 8분을 한 화면으로 버틸 수 없다. 사이트가 그려 준 실제 화면
 * (illustrated 엔진으로 전체화면 표시)과 손그림·목록·도식을 번갈아 놓는다.
 */
import type { Brief } from './stockBrief.js';
import { speakNumbers, ordinal } from './koreanNumber.js';
import type { Scene } from '../schema.js';
import { narrateStock } from './stockNarrate.js';

/** 한국어 나레이션 속도 — 320자/분으로 잡는다(실측 TTS 로 다시 측정되므로 계획용 값). */
const CHARS_PER_SEC = 320 / 60;

export interface PlannedScene {
  scene: Scene;
  /** 이 씬 배경으로 깔 사이트 화면 (없으면 엔진이 자체 렌더). */
  sceneView?: string;
  estSec: number;
  /**
   * 이 씬 화면에 떠 있는 값 — 설명 나레이션을 쓸 때 모델에게 주는 사실 전부이자,
   * 모델이 쓸 수 있는 숫자의 허용 목록이다(stockNarrate.ts 가 이걸로 대조한다).
   * 비어 있으면 그 씬은 설명을 붙이지 않고 조립본 그대로 나간다.
   */
  facts?: string;
}

/**
 * 짧게 만들 때 남길 순서.
 *
 * ★무엇을 버릴지는 미리 정해 둔다★ 길이를 줄일 때 뒤에서부터 자르면 클로징과 면책이
 * 먼저 날아간다. 오늘 무엇을 뽑았는가(pick)가 이 영상의 상품이므로 채점(open·prev)보다
 * 앞선다 — 채점은 신뢰의 근거지 인사말이 아니라서, 오늘 것을 본 다음에야 뜻이 생긴다.
 *
 * ★종목과 논리를 번갈아 둔다★ 종목만 이어 붙이면 이름 부르기가 되고, 논리만 모으면
 * 강의가 된다. 종목 → 왜 그런 인과가 나왔나 → 종목 순으로 엮어야 회차가 지루하지 않다.
 *
 * ★narrative(같은 국면 N일째)를 아래로 내렸다★ 44초짜리인데 "어제와 왜 비슷한지"를
 * 해명하는 씬이라, 어제 것을 본 적 없는 사람에게는 없는 질문에 답하는 꼴이다.
 * 단골에게는 값이 있으므로 긴 회차에서는 살린다.
 */
const KEEP_ORDER = [
  'pick1', 'causal1', 'pick2', 'agree', 'causal2', 'engines', 'principle', 'pick3', 'causal3',
  'open', 'prev', 'league', 'regime', 'pick4', 'causal4', 'sector', 'narrative', 'delta', 'pick5',
];

/**
 * 어떤 길이에서도 반드시 남는 씬.
 *
 * ★후크와 사이트 소개는 길이와 무관하게 넣는다★ 3분 컷이라고 이 둘을 빼면 시청자는
 * 이게 누가 뽑은 종목인지, 어디서 온 숫자인지 모른 채로 이름만 듣게 된다. 면책도 여기 있다.
 */
const MANDATORY = ['hook', 'site', 'outro'];

/**
 * 짝이 맞아야 뜻이 통하는 씬. 왼쪽이 남았는데 오른쪽이 잘리면 왼쪽도 버린다.
 *
 * ★실제로 이 사고가 났다★ 3분 예산에서 "어제 5종목 중 3개"(open)는 들어가고 그 근거인
 * 표(prev)는 몇 초 차이로 밀려났다. 숫자만 던지고 내역을 안 보여주는 꼴이 된다.
 */
const NEEDS: Record<string, string> = { open: 'prev' };

/**
 * 목표 길이(분) 안에 들어오도록 씬을 고른다. 0 이면 전부 쓴다.
 *
 * ★면책은 예산에서 먼저 뗀다★ 우선순위로만 채우면 짧은 회차에서 클로징이 밀려 나가고,
 * 그러면 투자 자문이 아니라는 고지 없이 종목 이름만 부르는 영상이 된다.
 *
 * ★15% 넘침을 허용한다★ 딱 맞게 자르면 마지막 한 씬이 몇 초 차이로 빠진다. 3분 목표에서
 * 사이트 화면이 한 장밖에 안 들어가 화면이 단조로워지는 일이 실제로 생겼다. 몇 초 길어지는
 * 것보다 화면이 하나 더 바뀌는 편이 낫다.
 */
export function trimScenes(planned: PlannedScene[], maxMinutes: number): PlannedScene[] {
  if (!maxMinutes || maxMinutes <= 0) return planned;
  const budget = maxMinutes * 60 * 1.15;
  const rank = (id: string) => {
    const i = KEEP_ORDER.indexOf(id);
    return i === -1 ? KEEP_ORDER.length : i;
  };
  const keep = new Set<string>(planned.filter((p) => MANDATORY.includes(p.scene.id)).map((p) => p.scene.id));
  let used = planned.filter((p) => keep.has(p.scene.id)).reduce((a, p) => a + p.estSec, 0);
  for (const p of [...planned].sort((a, b) => rank(a.scene.id) - rank(b.scene.id))) {
    if (keep.has(p.scene.id)) continue;
    if (used + p.estSec > budget) continue;
    keep.add(p.scene.id);
    used += p.estSec;
  }
  for (const [id, needs] of Object.entries(NEEDS)) {
    if (keep.has(id) && !keep.has(needs)) keep.delete(id);
  }
  return planned.filter((p) => keep.has(p.scene.id));
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/**
 * 사람이 쓴/모델이 쓴 문장을 TTS 가 읽을 수 있는 형태로 바꾼다.
 * 조사 보정 → 기호 정리 → 숫자 한글화. 나레이션은 반드시 여기를 지나간다.
 */
export function toSpeech(text: string): string {
  return speakNumbers(speakable(fixParticles(text))).replace(/\s{2,}/g, ' ').trim();
}

/**
 * "정유화학이(가)" 같은 미해결 조사를 앞 글자 받침에 맞춰 하나로 고른다.
 *
 * ★TTS 가 괄호를 읽는다★ 사이트가 보내는 완성 문장에 이(가)·은(는)·을(를) 형태가 남아 있는데,
 * 음성으로는 "정유화학이 괄호 가"로 나간다. 화면 자막에도 그대로 박힌다. 받침 유무만 보면
 * 되는 규칙이라 여기서 고친다(원문을 고쳐 달라고 하는 것보다 우리 쪽이 즉시 안전하다).
 */
/** 앞말 받침을 보고 조사를 붙인다. 이름이 데이터에서 오므로 하드코딩할 수 없다. */
export function attach(word: string, withFinal: string, without: string): string {
  const ch = word[word.length - 1] ?? '';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return word + ((code - 0xac00) % 28 !== 0 ? withFinal : without);
  // ★라틴 문자로 끝나는 이름★ 한글로 읽었을 때 받침이 생기는 글자가 있다 — S-Oil 은
  // "에스오일" 이라 "S-Oil이" 가 맞는데, 한글이 아니라고 넘기면 "S-Oil가" 가 된다.
  // l·m·n·r 로 끝나면 받침이 생기고, 나머지 알파벳은 "에스·비·티"처럼 모음으로 끝난다.
  const latin = /[A-Za-z]/.test(ch);
  if (latin) return word + (/[lmnrLMNR]/.test(ch) ? withFinal : without);
  // 숫자로 끝나면 읽는 소리로 판단한다(1 일, 3 삼, 6 육, 7 칠, 8 팔, 0 영 → 받침).
  if (/[0-9]/.test(ch)) return word + ('1367880'.includes(ch) ? withFinal : without);
  return word + without;
}

/**
 * 소리 내어 읽을 수 있게 기호를 다듬는다.
 *
 * ★근거 문자열은 화면용이다★ "추세 — 20일선 +20.4% · 20/60선 정배열(13.2%)" 처럼
 * 줄표·가운뎃점·괄호가 섞여 있는데, TTS 는 이걸 끊어 읽지 못하거나 기호를 그대로 발음한다.
 * 화면에는 원문을 두고 나레이션에서만 쉼표로 바꾼다.
 */
export function speakable(text: string): string {
  return (
    text
      // ★붙임표는 양쪽이 띄어져 있을 때만 구분자다★ 처음에 [—–-] 를 한꺼번에 바꿨더니
      // "-1.57%" 의 음수 부호까지 쉼표가 되어 "1.57%" 로 읽혔다. 부호가 뒤집히는 것은
      // 이 채널에서 가장 위험한 종류의 버그다 — 긴 줄표는 그대로, 짧은 붙임표는 띄어쓰기가
      // 양쪽에 있을 때만 구분자로 본다.
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/ +- +/g, ', ')
      // 화살표는 소리로 읽히지 않는다. 쉼표로 끊어 준다.
      .replace(/\s*[→⇒]\s*/g, ', ')
      .replace(/\s*·\s*/g, ', ')
      .replace(/\s*\(([^)]*)\)/g, ', $1')
      .replace(/(\s*,\s*){2,}/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*$/, '')
      .trim()
  );
}

export function fixParticles(text: string): string {
  const hasFinal = (ch: string) => {
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return false; // 한글 음절이 아니면 판단하지 않는다
    return (code - 0xac00) % 28 !== 0;
  };
  return text.replace(/(.)(이\(가\)|가\(이\)|은\(는\)|는\(은\)|을\(를\)|를\(을\)|와\(과\)|과\(와\))/g, (_m, prev: string, pair: string) => {
    // 쌍은 "이(가)" 또는 뒤집힌 "가(이)" 두 형태로 온다. 받침 있을 때 쓰는 글자는
    // 앞이면 0번, 뒤집혔으면 괄호 안(2번)이다. 예전에 3번(닫는 괄호)을 짚어서
    // "금리를(을)" 이 "금리와" 로 바뀌었다 — 자체 테스트에서 잡혔다.
    const withFinal = ' 이은을과 '.includes(pair[0]) ? pair[0] : pair[2];
    const without = withFinal === '이' ? '가' : withFinal === '은' ? '는' : withFinal === '을' ? '를' : '와';
    return prev + (hasFinal(prev) ? withFinal : without);
  });
}


/**
 * "코스피 +4.53% → 유통소비 민감도 +0.35" 를 화면용 두 조각으로 가른다.
 *
 * ★근거 문자열이 이미 인과 구조다★ 왼쪽이 움직인 거시, 오른쪽이 그것이 섹터에 준 힘이다.
 * 따로 필드를 달라고 하지 않아도 이 문자열만으로 전파 도식을 그릴 수 있다.
 */
function splitReason(r: string): { from: string; to: string } | null {
  const i = r.indexOf('→');
  if (i === -1) return null;
  return { from: r.slice(0, i).trim(), to: r.slice(i + 1).trim() };
}

export function buildStockScenes(b: Brief, date?: string): PlannedScene[] {
  const out: PlannedScene[] = [];
  // ★나레이션은 날것으로 담아 두고 마지막에 한 번 변환한다★ 예전에는 여기서 바로
  // 조사·기호·숫자를 처리했는데, 그러면 설명 나레이션(Claude)이 나중에 갈아 끼워질 때
  // 그 문장만 변환을 안 거치고 나가게 된다. 길이 추정만 변환본으로 하고, 실제 변환은
  // finalizeSpeech 가 전부 한 곳에서 한다.
  /**
   * facts 가 붙은 씬은 조립본 길이로 예산을 잡으면 안 된다.
   *
   * ★설명은 값 읽기보다 훨씬 길다★ 실측해 보니 종목 씬은 1.5배, 인과 씬은 2배로 늘었고,
   * 3분으로 자른 회차가 4분 49초로 나왔다. 조립본 길이로 자르고 나서 설명을 붙이면
   * 목표 길이가 무의미해진다. 설명이 붙을 씬은 붙은 뒤의 길이로 미리 잡고, 같은 값을
   * 모델에게 목표 길이로도 준다.
   */
  const add = (
    scene: Omit<Scene, 'bullets' | 'illustration' | 'sourceNote'> & Partial<Scene>,
    sceneView?: string,
    facts?: string,
    targetSec?: number,
  ) => {
    const full: Scene = { bullets: [], illustration: '', sourceNote: '', ...scene } as Scene;
    const spoken = toSpeech(full.narration);
    out.push({ scene: full, sceneView, estSec: facts && targetSec ? targetSec : spoken.length / CHARS_PER_SEC, facts });
  };

  /** 설명이 붙는 씬의 목표 길이(초). 이 값으로 자르고, 이 값을 모델에게도 준다. */
  const PICK_SEC = 42;
  const CAUSAL_SEC = 24;

  const mk = b.marketKo;

  // ── 0. 후크 — 무엇을, 누가, 언제 뽑았는지를 첫 10초에 다 말한다 ──────────
  // ★어제 성적으로 열면 안 된다★ 처음 보는 사람에게 "어제 5종목 중 3개"는 아무 뜻이 없다.
  // 어제 뭘 골랐는지도, 이 채널이 뭔지도 모르는 상태이기 때문이다. 채점은 신뢰의 근거지
  // 인사말이 아니라서, 오늘 뭘 뽑았는지를 본 다음에야 의미가 생긴다. 뒤로 옮겼다.
  const md = date ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일` : '오늘';
  const topNames = b.picks.slice(0, 3).map((p) => p.name);
  add({
    id: 'hook',
    heading: `AI 온톨로지가 뽑은 ${mk} 주식 · ${md}`,
    // ★후크는 짧아야 후크다★ 처음엔 24초짜리를 썼는데, 그건 후크가 아니라 서론이다.
    // 무엇을·누가·언제까지만 말하고 곧장 넘긴다. 주소는 화면에 박혀 있다.
    narration: `AI 온톨로지가 뽑은 ${md} ${mk} 주식입니다. ${topNames.join(', ')}. 왜 이 ${topNames.length === 3 ? '셋' : '종목들'}인지, 3분 안에 보여드리겠습니다.`,
    visual: 'metric',
    engine: 'stock',
    stock: {
      kind: 'headline',
      cards: [],
      big: '',
      caption: b.regime.label,
      // 종목 이름은 칩으로 크게, 주소는 그 아래 금색 한 줄.
      groups: [{ label: '', items: topNames, tone: 'in' }],
      rows: [{ name: 'stockontology.cc', from: '', to: '', pct: 0, note: 'link' }],
    },
  });

  // ── 0-1. 사이트가 이렇게 생겼다 — 말이 아니라 화면으로 보여준다 ──────────
  // ★overview 화면이 이 채널의 설명 전부다★ 거시 다섯 → 섹터 넷 → 종목 여섯이 선으로
  // 이어져 있고 주소까지 박혀 있다. 이걸 앞에 깔지 않으면 뒤에 나오는 점수와 도식이
  // 어디서 온 숫자인지 알 수 없다.
  add(
    {
      id: 'site',
      heading: '온톨로지 주식 사이트는 이렇게 생겼습니다',
      narration:
        `주식온톨로지 사이트는 이렇게 생겼습니다. 왼쪽이 오늘 움직인 거시 지표, 가운데가 그 힘을 받은 업종, ` +
        `오른쪽이 뽑힌 종목입니다. 선의 굵기가 영향의 크기입니다. ` +
        `이 화면이 스톡온톨로지 닷 씨씨에 매일 그대로 올라갑니다.`,
      visual: 'image',
      engine: 'illustrated',
    },
    'overview',
  );

  const prev = b.previous;
  const hitCount = prev ? Math.round(prev.hitRate * prev.picks.length) : 0;

  /**
   * 어제 뽑은 것을 오늘 채점한다. 오늘의 종목을 보여준 뒤에 부른다.
   *
   * ★"이 채널이 고른"이라고 쓰면 안 된다★ previous 는 사이트 알고리즘이 어제 계산한
   * 결과지 채널이 시청자에게 한 약속이 아니다. 첫 회차이거나 하루라도 건너뛴 날에는
   * 하지도 않은 말을 했다고 하는 셈이 된다. 주체를 사이트로 정확히 적는다.
   */
  const addPrevBlock = () => {
    if (!prev || !prev.picks.length) return;
    const hit = hitCount;
    add({
      id: 'open',
      heading: `어제 ${prev.picks.length}종목 중 ${hit}개`,
      narration: `그러면 어제는 어땠는지 보겠습니다. 주식온톨로지가 어제 뽑은 ${mk} ${prev.picks.length}종목 가운데 ${hit}개가 올랐습니다. 평균 ${pct(prev.avgChangePct)}입니다. 맞은 것도 틀린 것도 그대로 보여드립니다.`,
      visual: 'metric',
      metric: { value: `${hit}/${prev.picks.length}`, label: '어제 추천 적중', note: `평균 ${pct(prev.avgChangePct)}` },
      engine: 'stock',
      stock: {
        kind: 'headline',
        cards: [],
        big: `${hit}/${prev.picks.length}`,
        caption: `평균 ${pct(prev.avgChangePct)}`,
        groups: [],
        rows: [{ name: `어제 고른 ${b.marketKo} ${prev.picks.length}종목 중`, from: '', to: '', pct: 0, note: 'dim' }],
      },
    });

    add({
      id: 'prev',
      heading: '어제 추천, 오늘 결과',
      narration:
        `종목별로 보겠습니다. ` +
        prev.picks.map((p) => `${attach(p.name, '은', '는')} ${p.recPrice.toLocaleString()}원에서 ${p.nowPrice.toLocaleString()}원, ${pct(p.changePct)}입니다.`).join(' ') +
        ` 기준은 추천한 시점의 시세와 오늘 계산 시점의 시세입니다.`,
      bullets: prev.picks.slice(0, 5).map((p) => `${p.name} ${pct(p.changePct)}`),
      visual: 'bullets',
      engine: 'stock',
      stock: {
        kind: 'prevTable',
        big: `${hit}/${prev.picks.length}`,
        caption: `어제 추천 적중 · 평균 ${pct(prev.avgChangePct)}`,
        cards: [],
        rows: prev.picks.slice(0, 6).map((p) => ({
          name: p.name,
          from: `${p.recPrice.toLocaleString()}원`,
          to: `${p.nowPrice.toLocaleString()}원`,
          pct: p.changePct,
          note: '',
        })),
        groups: [],
      },
    });
  };

  // ── 0-2. 국면이 며칠째인가 — "매일 비슷하다"에 먼저 답한다 ──────────────
  // ★이 채널의 가장 흔한 이탈 사유를 선제적으로 막는다★ 온톨로지는 국면 추종이라 국면이
  // 유지되는 동안 같은 섹터가 반복된다. 설명 없이 보면 "어제랑 똑같네" 로 읽혀 이틀이면
  // 떠난다. 며칠째인지, 무엇이 바뀌었는지, 왜 그게 정상인지를 숫자로 먼저 말한다.
  const nar = b.narrative;
  if (nar) {
    const changed = nar.regime?.changed;
    add({
      id: 'narrative',
      heading: changed ? '국면이 바뀌었습니다' : `같은 국면 ${nar.regime?.streakDays ?? 1}일째`,
      narration: fixParticles(`${b.speech?.narrative ?? nar.summaryKo} ${nar.meaningKo}`),
      bullets: [
        ...(nar.sectors?.kept?.length ? [`유지 · ${nar.sectors.kept.join('·')}`] : []),
        ...(nar.sectors?.entered?.length ? [`진입 · ${nar.sectors.entered.join('·')}`] : []),
        ...(nar.sectors?.left?.length ? [`이탈 · ${nar.sectors.left.join('·')}`] : []),
        ...(nar.pickTurnover ? [`종목 교체 ${nar.pickTurnover.changed}/${nar.pickTurnover.total}`] : []),
      ].slice(0, 5),
      visual: 'bullets',
      engine: 'stock',
      stock: {
        kind: 'rotation',
        cards: [],
        big: changed ? '전환' : `${nar.regime?.streakDays ?? 1}일째`,
        caption: changed ? '국면이 바뀐 날' : '같은 국면 연속',
        rows: [],
        groups: [
          ...(nar.sectors?.kept?.length ? [{ label: '유지된 섹터', items: nar.sectors.kept, tone: 'keep' as const }] : []),
          ...(nar.sectors?.entered?.length ? [{ label: '새로 들어온 섹터', items: nar.sectors.entered, tone: 'in' as const }] : []),
          ...(nar.sectors?.left?.length ? [{ label: '빠진 섹터', items: nar.sectors.left, tone: 'out' as const }] : []),
        ],
      },
    });
  }

  // ── 1. 오늘의 국면 — 사이트 전체 그래프를 그대로 ────────────────────────
  add(
    {
      id: 'regime',
      heading: b.regime.label,
      narration: `오늘 ${mk} 시장은 ${b.regime.label}입니다. ` + b.regime.lines.slice(0, 3).join(' ') + ' 이 판단은 사람이 고른 것이 아니라 거시 지표에서 계산된 값입니다.',
      visual: 'image',
      engine: 'stock',
      stock: {
        kind: 'flow',
        cards: [],
        big: '',
        caption: '',
        rows: [],
        groups: [
          {
            label: '거시요인',
            // 오늘 실제로 움직인 것만 — 인과 문장의 왼쪽에서 뽑는다.
            items: [...new Set(b.causal.map((c) => splitReason(c)?.from).filter(Boolean) as string[])].slice(0, 3),
            tone: 'keep',
          },
          { label: '섹터', items: b.sectors.recommend.slice(0, 3).map((x) => `${x.sector} ${pct(x.score * 100).replace('%', '')}`), tone: 'in' },
          { label: '종목', items: b.picks.slice(0, 3).map((p) => `${p.name} ${p.score.toFixed(2)}`), tone: 'in' },
        ],
      },
    },
  );

  // ── 2. 왜 그렇게 됐나 — 인과를 하나씩 따로 떼어 회차 중간중간에 끼운다 ───
  //
  // ★넷을 한 씬에 몰아 넣으면 58초짜리 벽이 된다★ 그리고 그 58초 동안 화면은 한 번
  // 채워진 뒤 그대로 멈춘다. 종목과 종목 사이에 하나씩 끼워 넣으면 같은 정보가 리듬이 된다.
  //
  // ★설명문은 오늘 방향과 반대일 수 있다★ 사이트가 주는 문장은 일반 법칙이라
  // "달러인덱스 -1.18% → 금 +4.16% — 달러 강세는 금 가격에 부담입니다" 처럼 온다.
  // 오늘 달러는 내렸는데 "강세"라고 읽히면 시청자가 숫자를 의심한다. "원리는 이렇습니다"를
  // 앞에 붙여 오늘의 움직임이 아니라 법칙이라는 것을 분명히 한다.
  const addCausal = (i: number) => {
    const c = b.causal[i];
    if (!c) return;
    const parts = splitReason(c);
    const right = parts?.to ?? '';
    const dash = right.indexOf('—');
    const effect = (dash === -1 ? right : right.slice(0, dash)).trim();
    const law = dash === -1 ? '' : right.slice(dash + 1).trim();
    add(
      {
        id: `causal${i + 1}`,
        heading: '오늘 작동한 인과',
        narration: `${parts?.from ?? c}, ${effect}.` + (law ? ` 원리는 이렇습니다. ${law}.` : ''),
        bullets: [c.split('—')[0].trim()],
        visual: 'diagram',
        engine: 'stock',
        stock: {
          kind: 'chains',
          cards: [],
          big: '',
          caption: '',
          groups: [],
          // 화면의 설명문에도 "원리"를 붙인다. 안 붙이면 오늘 달러가 내렸는데 "달러 강세"라고
          // 적혀 있어 시청자가 위의 숫자를 의심하게 된다.
          rows: [{ name: parts?.from ?? c, from: '', to: effect, pct: 0, note: law ? `원리 · ${law}` : '' }],
        },
      },
      undefined,
      [
        `화면 왼쪽 상자: ${parts?.from ?? c}`,
        `화면 오른쪽 상자: ${effect}`,
        law ? `사이트가 준 원리 설명: ${law}` : '',
        `오늘 국면: ${b.regime.label}`,
        '',
        '★이 설명문은 오늘 방향과 반대일 수 있다★ 사이트는 일반 법칙을 그대로 붙여 주므로',
        '달러가 내린 날에도 "달러 강세는 ~" 이라고 온다. 오늘 실제 움직임(왼쪽 상자의 부호)을',
        '보고, 그 방향으로 원리를 다시 풀어서 설명해라. 두 값이 서로 반대 부호면 반대로 움직이는',
        '관계이고, 같은 부호면 같이 움직이는 관계다.',
        '이 씬은 인과 하나만 다룬다. 왜 왼쪽이 움직이면 오른쪽이 그렇게 되는지를 사람 말로 설명하는 것이 전부다.',
      ]
        .filter(Boolean)
        .join('\n'),
      CAUSAL_SEC,
    );
  };

  // ── 3. 오늘 순풍이 붙은 섹터 ────────────────────────────────────────────
  const topSector = b.sectors.recommend[0];
  if (topSector) {
    add(
      {
        id: 'sector',
        heading: `${topSector.sector} +${topSector.score.toFixed(2)}`,
        narration: `오늘 가장 순풍이 센 업종은 ${topSector.sector}입니다. ` + topSector.reasons.join(' ') + ` 이 세 갈래가 합쳐져 ${topSector.score.toFixed(2)}점이 됐습니다.`,
        visual: 'image',
        engine: 'illustrated',
      },
      `sector:${topSector.sector}`,
    );
  }

  // ── 4. 빠진 것과 들어온 것 ──────────────────────────────────────────────
  // ★매일 3/5는 그대로다★ "오늘의 5종목"만 읽으면 회차마다 60%가 겹쳐 이틀이면 지겨워진다.
  // 어제와 달라진 지점을 따로 떼어 놓아야 매 회차가 다른 영상이 된다.
  const fresh = b.picks.filter((p) => p.isNew);
  const gone = b.dropped ?? [];
  if (fresh.length || gone.length) {
    add({
      id: 'delta',
      heading: '어제와 달라진 것',
      narration:
        (gone.length ? `어제 목록에 있던 ${attach(gone.map((g) => g.name).join(', '), '이', '가')} 오늘 빠졌습니다. ${gone[0].reason}. ` : '') +
        (fresh.length ? `대신 ${attach(fresh.map((f) => f.name).join(', '), '이', '가')} 새로 들어왔습니다.` : ''),
      bullets: [...gone.map((g) => `빠짐 · ${g.name}`), ...fresh.map((f) => `신규 · ${f.name}`)].slice(0, 5),
      visual: 'comparison',
      comparison: {
        leftTitle: '빠진 종목',
        leftItems: gone.map((g) => g.name).slice(0, 4),
        rightTitle: '새로 들어온 종목',
        rightItems: fresh.map((f) => f.name).slice(0, 4),
      },
      // ★기본 비교 화면이 항목을 다 못 담았다★ 렌더해 보니 빠진 종목 넷 중 하나만 나오고
      // 새로 들어온 쪽은 통째로 비어 있었다. 게다가 종이 배경이라 앞뒤 어두운 화면과 튄다.
      engine: 'stock',
      stock: {
        kind: 'rotation',
        cards: [],
        big: `${fresh.length}↔${gone.length}`,
        caption: '들어옴 ↔ 빠짐',
        rows: [],
        groups: [
          ...(gone.length ? [{ label: '빠진 종목', items: gone.map((g) => g.name), tone: 'out' as const }] : []),
          ...(fresh.length ? [{ label: '새로 들어온 종목', items: fresh.map((f) => f.name), tone: 'in' as const }] : []),
        ],
      },
    });
  }

  /**
   * 같은 종목을 다른 엔진들은 어떻게 봤나.
   *
   * ★네 엔진 중 하나만 쓰고 있었다★ 응답에 온톨로지 말고도 수급·차트(quant), 차트 거장(ta),
   * 융합(fusion)이 각자의 점수와 근거를 담아 온다. 온톨로지는 "오를 이유가 있나"만 보고
   * 실제로 돈이 들어오고 있는지는 안 본다 — 그걸 보는 값이 이미 와 있는데 버리고 있었다.
   */
  const otherViews = (name: string) =>
    (b.engines ?? [])
      .filter((e) => e.id !== 'onto')
      .map((e) => {
        const hit = (e.picks ?? []).find((x) => x.name === name);
        return hit ? { engine: e, pick: hit } : null;
      })
      .filter(Boolean) as { engine: NonNullable<Brief['engines']>[number]; pick: Brief['picks'][number] }[];

  // ── 5. 오늘의 종목 — 사이트의 점수 분해 화면을 종목마다 ──────────────────
  b.picks.forEach((p, i) => {
    const days = p.daysInList && p.daysInList > 1 ? ` 이 종목은 ${p.daysInList}일째 목록에 남아 있습니다.` : p.isNew ? ' 오늘 새로 들어온 종목입니다.' : '';
    const others = otherViews(p.name);
    add(
      {
        id: `pick${i + 1}`,
        heading: `${i + 1}. ${p.name}`,
        // ★근거를 셋 다 읽으면 한 종목이 43초다★ 그동안 화면은 5초쯤 채워지고 멈춘다.
        // 가장 큰 둘만 말하고 나머지는 화면에 남긴다 — 30초 아래로 떨어진다.
        narration:
          `${ordinal(i + 1)}는 ${p.name}입니다. ${p.sector ?? '미분류'} 업종, ${p.priceLabel}, ${pct(p.changePct)}. ` +
          (p.reasons ?? []).slice(0, 2).map(speakable).join('. ') + '.' +
          `${days} 종합 점수 ${p.score.toFixed(2)}입니다.`,
        visual: 'image',
        engine: 'stock',
        stock: {
          kind: 'flow',
          cards: [],
          big: p.score.toFixed(2),
          caption: `${p.name} · 온톨로지 점수`,
          // 아래 띠 — 같은 종목을 수급·차트가 몇 점으로 봤는가.
          rows: others.map((o) => ({
            name: o.engine.nameKo,
            from: o.pick.score.toFixed(2),
            to: o.engine.tagKo ?? '',
            pct: o.pick.score,
            note: '',
          })),
          groups: [
            { label: '움직인 거시', items: (p.reasons ?? []).map(splitReason).filter(Boolean).map((x) => x!.from).slice(0, 3), tone: 'keep' },
            {
              // ★섹터 이름을 열 제목으로 올린다★ 상자마다 "정유화학 민감도"를 반복하면
              // 세 줄이 똑같아 보여서 정작 다른 값(+0.35 / +0.65 / -0.2)이 안 읽힌다.
              label: `${p.sector ?? '업종'}에 준 힘`,
              items: (p.reasons ?? [])
                .map(splitReason)
                .filter(Boolean)
                .map((x) => x!.to.replace(`${p.sector ?? ''} `, ''))
                .slice(0, 3),
              tone: 'in',
            },
            { label: '종목', items: [`${p.name} ${pct(p.changePct)}`], tone: 'in' },
          ],
        },
      },
      undefined,
      [
        `순번: ${ordinal(i + 1)}`,
        `종목: ${p.name}`,
        `업종: ${p.sector ?? '미분류'}`,
        `현재가: ${p.priceLabel}`,
        `등락률: ${pct(p.changePct)}`,
        `종합 점수: ${p.score.toFixed(2)}`,
        p.daysInList && p.daysInList > 1 ? `목록에 남은 일수: ${p.daysInList}일째` : p.isNew ? '오늘 새로 들어온 종목' : '',
        `오늘 국면: ${b.regime.label}`,
        '화면 도식(왼쪽 → 오른쪽 세 열, 왼쪽이 움직인 거시, 가운데가 업종에 준 힘, 오른쪽이 이 종목):',
        ...(p.reasons ?? []).map((r) => `  ${r}`),
        '',
        '',
        ...(others.length
          ? [
              '같은 종목을 다른 방식들은 이렇게 봤다(화면 아래 띠에 뜬다):',
              ...others.map((o) => `  ${o.engine.nameKo}(${o.engine.tagKo ?? ''}) ${o.pick.score.toFixed(2)} — ${(o.pick.reasons ?? []).join(' / ')}`),
              '',
              '★온톨로지와 수급이 갈리면 그게 이야깃거리다★ 온톨로지는 "오를 이유가 있나"를 보고,',
              '수급·차트는 "실제로 돈이 들어오고 있나"를 본다. 둘이 같은 방향이면 왜 겹쳤는지,',
              '엇갈리면 무엇이 어긋난 것인지 한 문장으로 짚어라. 값을 나열하지는 마라.',
            ]
          : []),
        '★값을 읽지 말고 경로를 설명해라★ 왼쪽 거시가 왜 이 업종을 밀어 올리는지(또는 끌어내리는지),',
        `그 업종 안에서 ${p.name}이 왜 그 힘을 받는지를 사람 말로 풀어라. 민감도 숫자는 그 설명의 근거로만 쓴다.`,
        '민감도가 음수인 항목이 섞여 있으면 그것도 짚어라 — 다 좋다고만 하면 안 된다.',
      ]
        .filter(Boolean)
        .join('\n'),
      PICK_SEC,
    );
    // 종목 하나 뒤에 인과 하나. 이름 부르기와 논리가 번갈아 나온다.
    addCausal(i);
  });

  // 종목보다 인과가 많이 남았으면 뒤에 붙인다(종목이 3개뿐인 날 등).
  for (let i = b.picks.length; i < Math.min(4, b.causal.length); i++) addCausal(i);

  // ── 5-0. 네 방식이 다 같은 것을 가리킨 종목 ─────────────────────────────
  //
  // ★이게 이 사이트에서 제일 센 이야기다★ 거시 인과, 수급·차트, 차트 거장 13종 합의,
  // 융합 — 서로 보는 것이 완전히 다른 네 방식이 같은 종목을 집었다면 그건 우연이 아니다.
  // 값은 이미 응답에 다 있는데 쓰지 않고 있었다.
  const engines = b.engines ?? [];
  if (engines.length >= 3) {
    const tally = new Map<string, { name: string; hits: { nameKo: string; tagKo?: string; score: number }[] }>();
    for (const e of engines) {
      for (const p of (e.picks ?? []).slice(0, 5)) {
        const cur = tally.get(p.name) ?? { name: p.name, hits: [] };
        cur.hits.push({ nameKo: e.nameKo, tagKo: e.tagKo, score: p.score });
        tally.set(p.name, cur);
      }
    }
    const agreed = [...tally.values()].filter((t) => t.hits.length >= 3).sort((a, b) => b.hits.length - a.hits.length).slice(0, 3);
    if (agreed.length) {
      add(
        {
          id: 'agree',
          heading: `${engines.length}가지 방식이 겹쳐 고른 종목`,
          narration:
            `보는 방식이 완전히 다른 ${engines.length}가지가 같은 종목을 집었습니다. ` +
            agreed.map((t) => `${attach(t.name, '은', '는')} ${t.hits.length}가지에서 나왔습니다.`).join(' '),
          bullets: agreed.map((t) => `${t.name} — ${t.hits.length}/${engines.length}`),
          visual: 'bullets',
          engine: 'stock',
          stock: {
            kind: 'cards',
            big: '',
            caption: '',
            rows: [],
            groups: [],
            cards: agreed.map((t) => ({
              title: t.name,
              sub: `${t.hits.length}/${engines.length} 방식에서 선정`,
              value: '',
              items: t.hits.map((h) => `${h.nameKo} ${h.score.toFixed(2)}`),
              highlight: t.hits.length === engines.length,
            })),
          },
        },
        undefined,
        [
          `엔진 수: ${engines.length}`,
          ...engines.map((e) => `${e.nameKo}(${e.tagKo ?? ''}) — ${e.descKo ?? ''} · 리그 수익률 ${pct(e.leaguePnlPct ?? 0)}`),
          '',
          '겹쳐 나온 종목:',
          ...agreed.map((t) => `  ${t.name}: ${t.hits.map((h) => `${h.nameKo} ${h.score.toFixed(2)}`).join(', ')}`),
          '',
          '★왜 이게 의미가 있는지를 설명해라★ 네 방식은 보는 것이 서로 완전히 다르다.',
          '거시 인과는 이유를 보고, 수급·차트는 돈의 흐름만 보고, 차트 거장은 가격 패턴만 본다.',
          '근거가 겹치지 않는 방식들이 같은 답을 낸 것이 무슨 뜻인지 한두 문장으로 풀어라.',
          '다만 단정하지 마라 — 겹쳤다고 오른다는 보장은 없다.',
        ].join('\n'),
        30,
      );
    }
  }

  // ── 5-1. 어제 뽑은 것을 채점한다 ────────────────────────────────────────
  // 오늘의 종목을 다 보여준 다음에 온다. 순서가 뒤바뀌면 "어제 5종목 중 3개"가
  // 무슨 말인지 알 수 없는 채로 첫 1분이 지나간다.
  addPrevBlock();

  // ── 5-2. 이 점수가 어떻게 나오는가 — 원리를 매 회차 짧게 되짚는다 ────────
  // ★매일 넣는다★ 대표 영상에서 길게 설명하더라도, 데일리를 처음 보는 사람은 대표 영상을
  // 안 봤다. 그렇다고 매일 3분씩 원리를 반복하면 단골이 떠난다. 그래서 20초짜리 한 씬으로
  // 고정하고, 자세한 것은 사이트로 보낸다.
  add({
    id: 'principle',
    heading: '점수는 이렇게 나옵니다',
    // 42초 → 25초 → 다시 줄였다. 점수 계산법은 짚고만 넘어간다.
    narration:
      '점수는 세 가지를 섞어서 냅니다. 거시 인과에 0.35, 최근 가격 흐름에 0.45, 뉴스 감성에 0.2입니다. ' +
      '예측이 아니라, 이미 일어난 거시의 움직임이 종목까지 도달하는 시차를 노리는 방식입니다.',
    bullets: ['거시 인과 ×0.35', '가격 흐름 ×0.45', '뉴스 감성 ×0.2'],
    visual: 'diagram',
    // ★화이트보드를 시도했다가 되돌렸다★ 어두운 화면만 이어지는 게 답답해서 이 씬을
    // 손그림으로 뺐는데, rough.js 가 상자 넷을 2×2 로 놓고 화살표가 서로를 가로지르면서
    // 가중치 글자를 선이 덮었다. 종이 질감은 좋았지만 읽히지 않으면 소용이 없다.
    // 화면 변화는 인과 씬과 사이트 화면이 이미 만들어 준다.
    engine: 'stock',
    stock: {
      kind: 'scoreBars',
      cards: [],
      big: '1.00',
      caption: '세 축을 합치면',
      groups: [],
      rows: [
        { name: '거시 인과', from: '온톨로지 점수 × 0.35', to: '', pct: 0.35, note: '' },
        { name: '가격 흐름', from: '최근 추세 × 0.45', to: '', pct: 0.45, note: '' },
        { name: '뉴스 감성', from: '뉴스 점수 × 0.20', to: '', pct: 0.2, note: '' },
      ],
    },
  });

  // ── 5-3. 다른 방식들은 뭐라고 하나 — 수급·차트·융합 ──────────────────────
  // ★engines 블록이 이 API 에서 제일 큰 덩어리다(약 4,900자)★ 그런데 리그 성적 한 줄씩만
  // 쓰고 버리고 있었다. 같은 날 같은 시장을 보고도 방식마다 다른 종목을 고르는 장면이라,
  // "왜 이 종목인가"를 한 번 더 다른 각도에서 설명해 준다.
  const others = (b.engines ?? []).filter((e) => e.id !== 'onto' && e.picks?.length);
  if (others.length) {
    add({
      id: 'engines',
      heading: '다른 방식은 뭐라고 하나',
      narration:
        '이 사이트에는 온톨로지 말고도 세 가지 방식이 더 돌아갑니다. ' +
        others
          .map((e, i) => {
            const top = e.picks[0];
            const why = speakable((top.reasons ?? [])[0] ?? '');
            // ★문장 틀을 돌린다★ 같은 틀로 세 번 이어 붙이면 "오늘 이 방식이 고른 것은…"이
            // 세 번 반복돼 듣는 사람이 바로 지친다. 회차마다가 아니라 한 씬 안에서도 마찬가지다.
            const lead = [`${attach(e.nameKo, '은', '는')} ${e.descKo ?? e.tagKo ?? ''}`, `${attach(e.nameKo, '은', '는')} ${e.descKo ?? e.tagKo ?? ''}`, `${attach(e.nameKo, '은', '는')} ${e.descKo ?? e.tagKo ?? ''}`][i] ?? '';
            const body = [
              `이 방식이 오늘 고른 종목은 ${top.name}입니다. ${why}.`,
              `여기서는 ${attach(top.name, '이', '가')} 1위입니다. ${why}.`,
              `오늘의 선택은 ${top.name}. ${why}.`,
            ][i % 3];
            return `${lead} ${body}`;
          })
          .join(' ') +
        ' 같은 날 같은 시장을 보고도 고르는 종목이 갈립니다.',
      bullets: others.map((e) => `${e.nameKo} · ${e.picks[0].name}`).slice(0, 5),
      visual: 'bullets',
      engine: 'stock',
      stock: {
        kind: 'cards',
        big: '',
        caption: '',
        rows: [],
        groups: [],
        cards: (b.engines ?? []).map((e) => ({
          title: e.nameKo,
          sub: e.descKo ?? e.tagKo ?? '',
          value: e.leaguePnlPct == null ? '' : pct(e.leaguePnlPct),
          items: (e.picks ?? []).slice(0, 3).map((p) => `${p.name} ${p.score.toFixed(2)}`),
          highlight: Boolean(e.live),
        })),
      },
    });
  }

  // ── 6. 네 엔진의 성적 — 이 채널의 킬러 구간 ─────────────────────────────
  if (b.league?.strategies?.length) {
    const s = b.league.strategies;
    add(
      {
        id: 'league',
        heading: '네 방식이 같은 조건으로 싸운다',
        narration:
          `그럼 어느 방식이 실제로 벌고 있을까요. ` +
          s.map((x) => `${attach(x.nameKo, '은', '는')} ${pct(x.pnlPct)}.`).join(' ') +
          ` 네 방식 모두 같은 원금에 같은 매매 규칙으로 돌고, 다른 것은 무엇을 살까 하나뿐입니다. ` +
          `그래서 이 비교는 공정합니다. 지는 방식도 그대로 공개합니다.`,
        visual: 'image',
        engine: 'stock',
        stock: {
          kind: 'cards',
          big: '',
          caption: '',
          rows: [],
          groups: [],
          cards: s.map((x) => ({ title: x.nameKo, sub: x.tagKo, value: pct(x.pnlPct), items: x.live ? ['실계좌 운용 중'] : [], highlight: x.live })),
        },
      },
    );
  }

  // ── 7. 클로징 ───────────────────────────────────────────────────────────
  add({
    id: 'outro',
    heading: '내일 또 채점합니다',
    narration:
      `오늘 고른 종목은 내일 이 자리에서 그대로 채점합니다. 맞으면 맞았다고, 틀리면 틀렸다고 숫자로 보여드립니다. ` +
      `계산 과정 전체는 사이트에서 직접 보실 수 있습니다. 주소는 설명란에 적어 뒀습니다. ` +
      `이 채널은 광고 수익을 받지 않습니다. 투자 자문이나 권유가 아니고, 판단과 책임은 보시는 분께 있습니다.`,
    visual: 'outro',
    icon: 'search',
    // ★클로징이 흰 배경에 돋보기 아이콘 하나였다★ 채널명도 사이트 주소도 없었다.
    engine: 'stock',
    stock: {
      kind: 'headline',
      cards: [],
      big: '',
      caption: '오늘 고른 종목은 내일 이 자리에서 채점합니다',
      groups: [],
      rows: [
        { name: 'stockontology.cc', from: '', to: '', pct: 0, note: 'link' },
        { name: '광고 수익을 받지 않는 무료 채널입니다', from: '', to: '', pct: 0, note: 'dim' },
        { name: '투자 자문·권유가 아니며 판단과 책임은 이용자 본인에게 있습니다', from: '', to: '', pct: 0, note: 'dim' },
      ],
    },
  });

  return out;
}

export function planSummary(scenes: PlannedScene[]): string {
  const total = scenes.reduce((a, s) => a + s.estSec, 0);
  const lines = scenes.map(
    (s) =>
      `  ${String(s.scene.id).padEnd(8)} ${String(s.scene.engine ?? 'standard').padEnd(12)} ${String(s.sceneView ?? '-').padEnd(18)} ${s.estSec.toFixed(0).padStart(4)}초  ${s.scene.heading}`,
  );
  return (
    `씬 ${scenes.length}개 · 예상 ${Math.floor(total / 60)}분 ${Math.round(total % 60)}초\n` +
    `  ${'id'.padEnd(8)} ${'engine'.padEnd(12)} ${'사이트 화면'.padEnd(16)} ${'길이'.padStart(5)}  제목\n` +
    lines.join('\n')
  );
}

/**
 * 씬 배열을 유튜브 업로드까지 갈 수 있는 Script 로 감싼다.
 *
 * ★제목에 날짜를 앞세우지 않는다★ 본 채널 실측에서 자체 용어·날짜가 앞에 온 제목은
 * 조회 50~100회, 고유명사가 앞에 온 제목은 2,900~7,100회였다. 그래서 업종명과 종목명을
 * 앞에 두고 날짜는 괄호로 뒤에 붙인다.
 */
export async function buildStockScript(b: Brief, date: string, disclaimer: string, maxMinutes = 0) {
  const planned = trimScenes(buildStockScenes(b, date), maxMinutes);

  // ★설명을 붙이는 것은 자를 것을 다 자른 뒤다★ 이번 회차에 안 나가는 씬까지 설명을
  // 받아 오면 그만큼 돈이 새고, 3분 컷에서는 나가는 씬보다 잘리는 씬이 더 많다.
  const explainable = planned.filter((p) => p.facts);
  const written = await narrateStock(
    explainable.map((p) => ({ id: p.scene.id, heading: p.scene.heading, facts: p.facts!, fallback: p.scene.narration, targetSec: p.estSec })),
  );
  for (const p of planned) {
    const better = written.get(p.scene.id);
    if (better) p.scene.narration = better;
    // ★변환은 여기 한 곳에서만★ 조립본이든 모델이 쓴 문장이든 똑같이 통과시킨다.
    // 씬마다 따로 하면 언젠가 한 갈래를 빠뜨리고 그 씬만 "102,000원"을 날것으로 읽는다.
    p.scene.narration = toSpeech(p.scene.narration);
    p.estSec = p.scene.narration.length / CHARS_PER_SEC;
  }

  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const top = b.sectors.recommend[0]?.sector ?? b.regime.label;
  const names = b.picks.map((p) => p.name);
  const prev = b.previous;
  const hit = prev ? Math.round(prev.hitRate * prev.picks.length) : 0;

  // ★국면이 꺾인 날이 시리즈의 하이라이트다★ 그날은 적중률보다 전환을 앞세운다 —
  // 온톨로지가 갈아타는 장면이 이 전략의 존재 이유이기 때문이다.
  const turned = b.narrative?.regime?.changed;
  // ★제목이 곧 후크다★ 예전에는 "어제 3/5 적중"으로 시작했는데, 목록에서 이 영상을 처음
  // 보는 사람에게 어제 성적은 아무 뜻이 없다. 누가 · 언제 · 무엇을 뽑았는지를 앞에 둔다.
  const head = turned ? '국면 전환 · ' : '';
  const title = `${head}AI 온톨로지가 뽑은 ${md} ${b.marketKo} 주식 — ${names.slice(0, 3).join('·')} · ${top} 순풍`.slice(0, 100);

  const lines: string[] = [];
  lines.push(
    `AI 온톨로지가 매일 아침 뽑는 ${b.marketKo} 종목입니다. ${md} 오늘은 ${top}에 순풍이 붙었습니다.`,
    '',
    `▸ 계산 결과 전체·근거·전 종목 점수 : https://stockontology.cc`,
    '',
  );
  if (prev && prev.picks.length) {
    lines.push(`어제 뽑은 ${prev.picks.length}종목 중 ${hit}개가 올랐습니다. 평균 ${pct(prev.avgChangePct)}.`, '');
  }
  if (prev && prev.picks.length) {
    lines.push(`■ 어제 추천, 오늘 결과 (적중 ${hit}/${prev.picks.length} · 평균 ${pct(prev.avgChangePct)})`);
    for (const p of prev.picks) lines.push(`${p.name}  ${p.recPrice.toLocaleString()} → ${p.nowPrice.toLocaleString()}  ${pct(p.changePct)}`);
    lines.push(`※ ${prev.basisNote}`, '');
  }
  lines.push('■ 오늘의 추천');
  b.picks.forEach((p, i) => lines.push(`${i + 1}. ${p.name} (${p.sector ?? '미분류'}) ${p.score.toFixed(2)} — ${(p.reasons ?? [])[0] ?? p.reason}`));
  if (b.dropped?.length) lines.push('', '■ 오늘 빠진 종목', b.dropped.map((d) => `${d.name} — ${d.reason}`).join('\n'));
  lines.push('', '■ 오늘 작동한 인과', ...b.causal.slice(0, 4).map((c) => `· ${c}`));
  if (b.league?.strategies?.length) {
    lines.push('', '■ 네 엔진의 성적', ...b.league.strategies.map((s) => `${s.nameKo}(${s.tagKo}) ${pct(s.pnlPct)}`));
  }
  lines.push('', '■ 기준', `${b.basisNote ?? b.basis} · 데이터 시각 ${new Date(b.dataAsOf).toISOString()}`, '', '─'.repeat(20), disclaimer);

  const tags = ['주식온톨로지', '종목추천', '매크로', 'AI투자', b.marketKo === '한국' ? '코스피' : '나스닥', top, ...names].slice(0, 15);

  return {
    script: {
      title,
      description: lines.join('\n').slice(0, 4900),
      tags,
      topic: `${date} ${b.marketKo} 온톨로지 브리프`,
      thumbnailHeadline: prev && prev.picks.length ? `어제 ${hit}/${prev.picks.length} 적중` : `${top} 순풍`,
      thumbnailBadge: b.marketKo,
      scenes: planned.map((p) => p.scene),
    },
    views: Object.fromEntries(planned.filter((p) => p.sceneView).map((p) => [p.scene.id, p.sceneView!])) as Record<string, string>,
  };
}
