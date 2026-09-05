/**
 * 이벤트 하나 → 종목 한 편 대본 (수시 발행).
 *
 * ★데일리와 씬 구성이 다르다★ 데일리는 "오늘 시장에서 무엇이 움직였나 → 그래서 이
 * 종목들"이라 국면·섹터·어제 채점이 앞에 온다. 수시 발행은 시작점이 종목 하나이고,
 * 그 종목을 지금 다루는 이유(이벤트)가 첫 문장이다. 데일리 대본을 그대로 쓰면
 * "어제 채점"·"오늘의 국면" 같이 맥락이 안 맞는 씬이 섞인다.
 *
 * ★말할 수 있는 것만 말한다★ 유니버스 밖 종목은 ontology·flow·views 가 null 로 온다
 * (사이트가 "하지 않은 분석을 한 것처럼 보이지 않게" 비워서 준다). 그런 종목은 그 축을
 * 통째로 빼고, 있는 축(차트·플랜)만으로 만든다.
 */
import type { Scene } from '../schema.js';
import type { Bundle, FeedEvent, SessionState } from './stockFeed.js';
import { sessionLabel, sessionBadge } from './stockFeed.js';
import { attach, fixParticles } from './stockScript.js';
import { nearSupport, nearResistance, gapToHigh } from './stockBrief.js';
import { speakNumbers, speakLatinAcronyms } from './koreanNumber.js';
import type { PlannedScene } from './stockScript.js';

/** 이벤트 종류별로 화면 제목에 쓸 짧은 말. 내부 용어를 쓰지 않는다. */
const KIND_LABEL: Record<string, string> = {
  new_agreement: '분석이 겹쳤습니다',
  agreement_lost: '겹쳤던 것이 풀렸습니다',
  breakout: '돌파했습니다',
  volume_surge: '거래가 몰렸습니다',
  support_test: '지지선에 닿았습니다',
  plan_upgrade: '매수 구간에 들어왔습니다',
  plan_downgrade: '조건이 나빠졌습니다',
  regime_shift: '국면이 바뀌었습니다',
  streak: '며칠째 남아 있습니다',
  cross_profile: '여러 관점이 겹쳤습니다',
};

const CHARS_PER_SEC = 320 / 60;

/**
 * 이벤트 문장에 섞여 오는 엔진 id 를 사람 말로 바꾼다.
 *
 * ★"빠진 쪽: onto" 가 그대로 나갔다★ 사이트의 whyNowKo 에 내부 id 가 섞여 오는 자리가
 * 있다. 그대로 읽으면 "빠진 쪽 온토" 가 되어 아무도 못 알아듣는다. 화면에 나가는 말에
 * 내부 이름이 남으면 안 된다.
 */
const ENGINE_KO: Record<string, string> = {
  onto: '온톨로지',
  quant: '수급·차트',
  ta: '차트 거장',
  fusion: '융합',
};
const humanize = (t: string) =>
  // ★조사 자리표시자가 그대로 나갔다★ 사이트 문장에 "차트 거장이(가) 새로 들어왔습니다"
  // 처럼 고르지 않은 쌍이 섞여 온다. 데일리에는 fixParticles 를 통과시키고 있었는데
  // 수시 발행에는 안 걸어 둬서, 자막에도 나레이션에도 괄호가 그대로 찍혔다.
  fixParticles(t.replace(/\b(onto|quant|ta|fusion)\b/g, (m) => ENGINE_KO[m] ?? m));

/** 전략 판정 영문 코드를 화면에 쓸 말로. 내부 값이 그대로 나가지 않게 한다. */
const VERDICT_KO: Record<string, string> = { buy: '매수', sell: '매도', neutral: '중립', wait: '대기' };

/** "일목균형표 (一目均衡表)" 처럼 괄호 설명이 붙은 이름을 말할 때는 앞부분만 읽는다. */
const shortName = (n: string) => n.split(' (')[0].trim();

/** "RSI는 RSI 67.7 —" 처럼 이름이 본문 앞에 또 나오면 뗀다. */
const bodyOf = (s: { nameKo: string; text: string }) => {
  const n = shortName(s.nameKo);
  return readable(s.text).replace(new RegExp(`^${n.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*`), '');
};

/**
 * 화면 문구를 낭독용으로 다듬는다.
 *
 * ★화살표는 읽을 수 없다★ 사이트 문구에는 "원/달러 -2.26% → 유통소비 민감도 -0.35"
 * 처럼 표에서 온 기호가 섞여 있다. 눈으로는 읽히지만 TTS 는 그냥 건너뛰어 두 값이
 * 한 문장으로 붙어 버린다. 쉼표로 바꿔 숨 쉴 자리를 만든다.
 */
const readable = (t: string) => fixParticles(t.replace(/\s*[→⇒]\s*/g, ', ').replace(/\s{2,}/g, ' ')).trim();

/** 지금 값에서 어느 쪽으로 몇 % 떨어져 있는지. 부호는 말로 붙이므로 절댓값만 준다. */
const pctAway = (price: number, level: number) => `${(Math.abs(level - price) / price * 100).toFixed(1)}%`;

/** 문장 끝에 마침표가 없으면 붙인다 — 이어 붙일 때 두 문장이 한 문장으로 뭉친다. */
const period = (t: string) => (/[.!?。]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/**
 * 근거 셋을 소개한 뒤 맺는 말. 이벤트 종류에 따라 뜻이 정반대가 된다.
 *
 * ★한 문장으로 고정하면 거짓말이 된다★ 처음에는 어떤 이벤트에서든 "같은 종목에서
 * 만났다면 그 자체가 신호입니다" 로 맺었는데, 겹쳤던 것이 풀린 이벤트(agreement_lost)
 * 에서도 그 문장이 나갔다. 정반대의 상황을 같은 말로 맺은 셈이다.
 */
function whyClosing(kind: string): string {
  if (kind === 'agreement_lost') {
    return '서로 보는 것이 다른 분석들입니다. 그중 하나가 손을 뗐다는 것은 근거 하나가 사라졌다는 뜻입니다.';
  }
  if (kind === 'new_agreement' || kind === 'cross_profile') {
    return '서로 보는 것이 다른 분석들이라, 같은 종목에서 만났다는 것 자체가 신호입니다.';
  }
  return '이 셋은 서로 다른 것을 봅니다. 어느 쪽이 이 종목을 들고 있는지가 판단의 재료입니다.';
}
/**
 * 읽을 금액. 달러는 "삼백칠십팔 달러"로 읽히도록 기호를 뒤로 빼고 의미 없는 소수점을 지운다
 * (데일리에서 "$378.00"이 "달러 삼백칠십팔 점 영영"으로 읽힌 적이 있다).
 */
const money = (mk: 'KR' | 'US', n: number) =>
  mk === 'US' ? `${n.toFixed(2).replace(/\.00$/, '')} 달러` : `${Math.round(n).toLocaleString()}원`;

/** 사이트가 market 을 주면 그것을, 없으면 심볼로 가른다("285130.KS" 는 한국, "RIVN" 은 미국). */
const marketOf = (b: Bundle): 'KR' | 'US' => b.market ?? (/\.(KS|KQ)$/i.test(b.symbol ?? '') ? 'KR' : 'US');

export interface SpotScript {
  title: string;
  description: string;
  tags: string[];
  topic: string;
  thumbnailHeadline: string;
  thumbnailSub: string;
  thumbnailFoot: string;
  thumbnailBadge: string;
  thumbnailBigValue: string;
  thumbnailBigLabel: string;
  thumbnailAccent: string;
  thumbnailSpark: number[];
  scenes: Scene[];
  views: Record<string, string>;
}

/**
 * 이벤트와 번들로 씬을 짠다.
 *
 * 순서: 왜 지금(이벤트) → 무엇을 보고 그렇게 말하나(거시·수급·차트) → 얼마에(플랜) → 마무리.
 */
export function buildSpotScenes(ev: FeedEvent, b: Bundle): PlannedScene[] {
  const mk = marketOf(b);
  const m = (n: number) => money(mk, n);
  const out: PlannedScene[] = [];
  const add = (scene: Omit<Scene, 'bullets' | 'illustration' | 'sourceNote'> & Partial<Scene>, view?: string, facts?: string, sec?: number) => {
    const full: Scene = { bullets: [], illustration: '', sourceNote: '', ...scene } as Scene;
    out.push({ scene: full, sceneView: view, estSec: sec ?? full.narration.length / CHARS_PER_SEC, facts });
  };

  const stamp = sessionLabel(b.sessionState as SessionState, b.asOf, mk);

  // ── 1. 왜 지금 이 종목인가 ────────────────────────────────────────────
  // ★이벤트 문장이 이 영상의 존재 이유다★ whyNowKo 는 "직전까지는 온톨로지만 들고
  // 있었는데 수급이 새로 들어왔습니다" 처럼 어제와 오늘의 차이를 말해 준다. 값이 큰
  // 것이 아니라 바뀐 것이라서, 이 문장이 없으면 아무 때나 할 수 있는 말이 되어 버린다.
  add(
    {
      id: 'why',
      heading: `${b.name} — ${KIND_LABEL[ev.kind] ?? '지금 볼 이유'}`,
      // ★headlineKo 는 그 자체로 완성된 문장이다★ 앞에 "롯데웰푸드는" 을 붙이면
      // "롯데웰푸드는 겹쳤던 분석 중 하나가 손을 뗐습니다" 가 되어 주어가 둘이 된다.
      // ★"오늘 마감하고 분석했습니다"가 아니다★ 이 채널은 종가를 기다렸다가 하루치를
      // 몰아 내보내는 곳이 아니라, 조건이 맞는 종목이 나오면 그때 한 편씩 내보내는
      // 곳이다. 도입부가 "오늘은 X입니다"로 시작하면 하루 한 번짜리 코너로 들리고,
      // 그러면 같은 날 두 번째 영상이 이상해진다.
      narration:
        `지금 시점에서 볼 만한 종목 하나를 짚어 보겠습니다. ${attach(b.name, '은', '는')} ` +
        `${period(humanize(ev.headlineKo))} ${period(humanize(ev.whyNowKo))} ` +
        `며칠에서 몇 주를 보는 스윙 관점이고, 값 기준은 ${period(stamp)}`,
      visual: 'metric',
      engine: 'stock',
      stock: {
        kind: 'headline',
        cards: [],
        big: '',
        caption: humanize(ev.headlineKo),
        groups: [{ label: '', items: [b.name, b.priceLabel], tone: 'in' }],
        rows: [{ name: 'stockontology.cc', from: '', to: '', pct: 0, note: 'link' }],
      },
    },
    undefined,
    [`종목: ${b.name}(${b.sector ?? '미분류'}) ${b.priceLabel}`, `이벤트: ${humanize(ev.headlineKo)}`, `왜 지금: ${humanize(ev.whyNowKo)}`, `기준 시점: ${stamp}`].join('\n'),
    26,
  );

  // ── 2. 근거를 한 화면에 하나씩 ────────────────────────────────────────
  // ★세 갈래를 한 씬에 몰지 않는다★ 처음에는 거시·수급·차트를 한 씬에 불릿 셋으로
  // 넣었는데, 40초 동안 같은 화면을 보며 성격이 다른 이야기 셋을 듣게 된다. 사이트가
  // 갈래마다 다른 화면(overview·stock·chart)을 그려 주므로 씬을 쪼개면 말과 화면이
  // 맞는다. 없는 갈래는 통째로 빼서, 하지 않은 분석을 한 것처럼 보이지 않게 한다.
  const reasonIds: string[] = [];
  if (b.why?.macroKo) {
    reasonIds.push('macro');
    add(
      {
        id: 'macro',
        heading: '바깥에서 무슨 일이 있었나',
        narration: `먼저 바깥 상황입니다. ${period(readable(String(b.why.macroKo)))}`,
        visual: 'image',
        engine: 'illustrated',
      },
      b.views?.overview,
      `거시: ${b.why.macroKo}`,
      20,
    );
  }
  if (b.why?.flowKo) {
    reasonIds.push('flow');
    add(
      {
        id: 'flow',
        heading: '돈은 어디로 움직였나',
        narration: `다음은 수급입니다. ${period(readable(String(b.why.flowKo)))}`,
        visual: 'image',
        engine: 'illustrated',
      },
      b.views?.stock,
      `수급: ${b.why.flowKo}`,
      20,
    );
  }

  // ── 3. 차트 — 근거와 지지·저항을 한 화면에서 ──────────────────────────
  // 차트 이야기는 "정배열이다" 와 "지지선이 얼마다" 가 같은 그림을 두고 하는 말이라
  // 나누면 같은 화면을 두 번 띄우게 된다. 그래서 한 씬으로 합친다.
  {
    const lv = b.levels;
    const sup = nearSupport(lv, b.price);
    const res = nearResistance(lv, b.price);
    const parts: string[] = [];
    // ★같은 말을 두 번 하지 않는다★ chartKo 에 "전략 13종 중 매수 9 · 중립 2 · 매도 2"
    // 가 섞여 오는데, 뒤에 전략 씬이 그 이야기를 통째로 한다. 여기서 미리 말해 버리면
    // 두 화면에 걸쳐 같은 문장을 두 번 듣게 된다.
    const chartKo = String(b.why?.chartKo ?? '')
      .split(/(?<=\.)\s+/)
      .filter((sent) => !((b.strategies?.length ?? 0) >= 5 && /전략\s*\d+\s*종/.test(sent)))
      .join(' ')
      .trim();
    if (chartKo) parts.push(`차트를 보겠습니다. ${period(readable(chartKo))}`);
    else parts.push('차트에서 지금 어디쯤인지 보겠습니다.');
    // ★거리를 같이 말하지 않으면 거짓 안심을 준다★ 145,500원짜리 종목에 "아래쪽 지지는
    // 109,333원" 이라고만 하면 바로 밑에 받침이 있는 것처럼 들린다. 실제로는 25% 아래다.
    if (sup) parts.push(`아래쪽에는 ${m(sup.price)}이 있습니다. ${sup.touches}번 지지받았고, 지금 값에서 ${pctAway(b.price, sup.price)} 아래입니다.`);
    if (res) parts.push(`위쪽에는 ${m(res.price)}이 있습니다. ${res.touches}번 막혔고, ${pctAway(b.price, res.price)} 위입니다.`);
    else {
      // 저항선이 비어 있으면(신고가 부근) 52주 최고가까지의 거리로 대신한다.
      const gap = gapToHigh(lv, b.price);
      if (gap !== null && lv?.week52?.high) parts.push(`위쪽에 걸린 저항은 없고, 52주 최고가 ${m(lv.week52.high)}까지 ${gap.toFixed(1)}% 남았습니다.`);
    }
    if (parts.length > 1) {
      reasonIds.push('levels');
      add(
        { id: 'levels', heading: '지금 어디쯤인가', narration: parts.join(' '), visual: 'image', engine: 'illustrated' },
        b.views?.chart,
        [
          chartKo ? `차트: ${chartKo}` : '',
          sup ? `지지 ${m(sup.price)} (${sup.touches}번, ${pctAway(b.price, sup.price)} 아래)` : '',
          res ? `저항 ${m(res.price)} (${res.touches}번)` : '',
          lv?.levelNote ?? '',
        ]
          .filter(Boolean)
          .join('\n'),
        32,
      );
    }
  }

  // ★맺는 말은 근거 씬의 마지막에 붙인다★ 고정된 씬에 두면 그 씬이 빠진 회차에서
  // 통째로 사라진다. 이벤트 종류에 따라 뜻이 정반대라 아무 데나 둘 수도 없다.
  if (reasonIds.length) {
    const last = out.find((p) => p.scene.id === reasonIds[reasonIds.length - 1]);
    if (last) {
      last.scene.narration = `${last.scene.narration} ${whyClosing(ev.kind)}`;
      last.estSec = (last.estSec ?? 0) + 8;
    }
  }
  // ── 4. 얼마에 사고 어디서 손절하나 ────────────────────────────────────
  const p = b.plan;
  if (p) {
    const t1 = p.targets?.[0];
    // ★좋은 쪽만 읽으면 거짓말이 된다★ biasKo 가 "매수 검토 가능" 인데 gradeKo 는
    // "나쁨 — 진입 보류 권장" 이고 손익비가 1 아래인 날이 있었다. 판정만 읽으면 사라고
    // 한 것이 되고, 그 값은 화면(설명란)에는 그대로 남아 있어 앞뒤가 안 맞는다.
    const say: string[] = [
      p.gradeKo
        ? `그래서 지금 어떤 자리일까요. 판정은 "${p.biasKo}", 자리 등급은 "${p.gradeKo}"입니다.`
        : `그래서 지금 어떤 자리일까요. 판정은 "${p.biasKo}"입니다.`,
    ];
    if (p.entry) say.push(`진입은 ${m(p.entry.low)}에서 ${m(p.entry.high)} 사이입니다.`);
    if (p.stop) say.push(`손절은 ${m(p.stop.price)}입니다.`);
    if (t1) say.push(`1차 목표는 ${m(t1.price)}입니다.`);
    if (typeof p.rr === 'number') {
      say.push(
        p.rr < 1
          ? `손익비는 ${p.rr.toFixed(2)}로 1보다 낮습니다 — 잃을 수 있는 폭이 노릴 수 있는 폭보다 크다는 뜻입니다.`
          : `손익비는 ${p.rr.toFixed(2)}입니다.`,
      );
    }
    if (p.invalidation) say.push(p.invalidation);
    add(
      {
        id: 'plan',
        heading: `${b.name} — ${p.biasKo}`,
        narration: say.join(' '),
        bullets: [
          p.entry ? `진입 ${m(p.entry.low)}~${m(p.entry.high)}` : '',
          p.stop ? `손절 ${m(p.stop.price)}` : '',
          t1 ? `목표 ${m(t1.price)}` : '',
          typeof p.rr === 'number' ? `손익비 ${p.rr.toFixed(2)}` : '',
        ].filter(Boolean),
        visual: 'bullets',
        engine: 'stock',
        stock: {
          kind: 'prevTable',
          big: p.biasKo.split('—')[0].trim(),
          caption: p.gradeKo ?? '',
          cards: [],
          rows: [
            p.entry ? { name: '진입', from: m(p.entry.low), to: m(p.entry.high), pct: 0, note: '' } : null,
            p.stop ? { name: '손절', from: m(p.stop.price), to: '', pct: p.stop.pct, note: '' } : null,
            t1 ? { name: '1차 목표', from: m(t1.price), to: '', pct: t1.pct, note: '' } : null,
          ].filter(Boolean) as Array<{ name: string; from: string; to: string; pct: number; note: string }>,
          groups: [],
        },
      },
      // ★전략 씬과 같은 화면을 두 번 깔지 않는다★ 플랜은 stock 엔진이 표로 직접 그린다.
      undefined,
      [
        `판정 ${p.biasKo}${p.gradeKo ? ` · ${p.gradeKo}` : ''}`,
        p.entry ? `진입 ${m(p.entry.low)}~${m(p.entry.high)} — ${p.entry.note ?? ''}` : '',
        p.stop ? `손절 ${m(p.stop.price)} — ${p.stop.note ?? ''}` : '',
        t1 ? `목표1 ${m(t1.price)} — ${t1.note ?? ''}` : '',
        typeof p.rr === 'number' ? `손익비 ${p.rr.toFixed(2)}` : '',
        p.invalidation ? `계획이 깨지는 조건: ${p.invalidation}` : '',
        ...(p.checklist ?? []).map((c) => `점검: ${c.text} → ${c.pass ? '충족' : '미충족'}`),
      ]
        .filter(Boolean)
        .join('\n'),
      40,
    );
  }

  // ── 5. 전략 13종은 뭐라고 하나 ────────────────────────────────────────
  // ★"AI 가 말했다"로 끝내지 않는다★ 이 판정은 MACD·RSI·볼린저처럼 이름과 만든 사람이
  // 있는 규칙 열세 개를 각각 돌린 결과다. 몇 대 몇인지와 대표 두 개의 근거를 보여 주면
  // 시청자가 결론이 아니라 계산을 본다. 만장일치가 아니라는 것도 그대로 말한다.
  const st = b.strategies ?? [];
  if (st.length >= 5) {
    const buy = st.filter((x) => /buy/.test(x.verdict)).length;
    const sell = st.filter((x) => /sell/.test(x.verdict)).length;
    const neutral = st.length - buy - sell;
    const named = st
      .filter((x) => x.author && /buy/.test(x.verdict))
      .sort((a, x) => x.score - a.score)
      .slice(0, 2);
    // 반대쪽은 가장 강하게 반대하는 것 하나만. 점수가 낮을수록 반대가 세다.
    const dissent = st.filter((x) => /sell/.test(x.verdict)).sort((a, x) => a.score - x.score)[0];
    const say = [`이 판정은 한 사람의 의견이 아니라 규칙 ${st.length}개를 각각 돌린 결과입니다.`, `매수 ${buy}개, 중립 ${neutral}개, 매도 ${sell}개입니다.`];
    for (const s of named) say.push(`${attach(shortName(s.nameKo), '은', '는')} ${period(bodyOf(s))}`);
    // ★반대 의견을 빼면 만장일치처럼 들린다★ 매도 쪽이 있는데 안 읽으면 숫자만 정직하고
    // 말은 거짓이 된다.
    // ★반대라면서 "중립 구간" 이라고 읽으면 앞뒤가 안 맞는다★ RSI 가 매도 판정인데
    // 본문은 "RSI 67.7 — 중립 구간" 으로 오는 날이 있다. 그런 문장은 반대 근거로 읽히지
    // 않으니, 몇 개가 반대했는지만 말하고 넘어간다.
    if (dissent && !/중립/.test(dissent.text)) {
      say.push(`반대쪽도 있습니다. ${attach(shortName(dissent.nameKo), '은', '는')} ${period(bodyOf(dissent))}`);
    } else if (sell > 0) {
      say.push(`만장일치는 아닙니다. ${sell}개는 반대쪽입니다.`);
    }
    add(
      {
        id: 'strategies',
        heading: `전략 ${st.length}종 — 매수 ${buy} · 중립 ${neutral} · 매도 ${sell}`,
        narration: say.join(' '),
        bullets: st.slice(0, 5).map((s) => `${shortName(s.nameKo)} ${VERDICT_KO[s.verdict] ?? s.verdict}`),
        // ★사이트 화면을 깔려면 illustrated 여야 한다★ stock 엔진은 imagePath 를 보지
        // 않아서, 아래 sceneView 로 받아 둔 전략 13종 화면이 화면에 나오지 않았다. 그
        // 화면에는 MACD·RSI·ADX 판정이 카드로 다 들어 있어 이 나레이션과 그대로 맞는다.
        visual: 'image',
        engine: 'illustrated',
        stock: {
          kind: 'cards',
          big: `${buy} : ${sell}`,
          caption: b.consensus?.text ?? '',
          rows: [],
          groups: [],
          cards: st.slice(0, 6).map((s) => ({
            title: shortName(s.nameKo),
            sub: s.author ?? '',
            value: VERDICT_KO[s.verdict] ?? s.verdict,
            items: [s.text],
            highlight: /buy/.test(s.verdict),
          })),
        },
      },
      b.views?.strategies,
      [b.consensus?.text ?? `전략 ${st.length}종 중 매수 ${buy} · 중립 ${neutral} · 매도 ${sell}`, ...st.slice(0, 6).map((s) => `${s.nameKo}${s.author ? `(${s.author})` : ''} ${VERDICT_KO[s.verdict] ?? s.verdict}: ${s.text}`)].join('\n'),
      34,
    );
  }
  // ── 6. 마무리 ─────────────────────────────────────────────────────────
  add({
    id: 'outro',
    heading: '기준과 면책',
    // ★"마감 뒤에만 하는 채널"로 들리지 않게 한다★ 기준 시점을 밝히는 것과, 마감을
    // 기다려야만 종목을 다룬다는 인상을 주는 것은 다르다. 실제로 이 채널은 분석이 바뀌면
    // 장중에도 올린다 — 그러면 그렇게 말해야 한다.
    narration:
      `여기까지 ${attach(b.name, '이었습니다', '였습니다')}. 값은 전부 스톡온톨로지 닷 씨씨의 계산 결과이고, ` +
      `기준 시점은 ${stamp}. 이 채널은 마감을 기다렸다가 하루치를 몰아 올리지 않습니다. ` +
      `조건이 맞는 종목이 나오면 장중이든 마감 뒤든 그때 한 편씩, 같은 종목을 반복하지 않고 돌아가며 다룹니다. ` +
      `특정 종목의 매수나 매도를 권유하는 것이 아니며, 투자 판단과 책임은 보는 분에게 있습니다.`,
    visual: 'outro',
    engine: 'stock',
    icon: 'chart',
    stock: { kind: 'headline', cards: [], big: '', caption: 'stockontology.cc', groups: [], rows: [] },
  });

  return out;
}

/** TTS 로 넘길 형태로. 숫자와 라틴 약어를 읽을 수 있게 바꾼다. */
const toSpeech = (s: string) => speakLatinAcronyms(speakNumbers(s));

export function buildSpotScript(ev: FeedEvent, b: Bundle, disclaimer = ''): SpotScript {
  const mk = marketOf(b);
  const planned = buildSpotScenes(ev, b);
  const views: Record<string, string> = {};
  for (const p of planned) if (p.sceneView) views[p.scene.id] = p.sceneView;

  for (const p of planned) {
    p.scene.captionText = p.scene.narration.replace(/\s{2,}/g, ' ').trim();
    p.scene.narration = toSpeech(p.scene.narration);
  }

  // ★제목에 같은 말을 두 번 넣지 않는다★ KIND_LABEL 과 headlineKo 는 대개 같은 사실을
  // 말한다("겹쳤던 것이 풀렸습니다 — 겹쳤던 분석 중 하나가 손을 뗐습니다"). 종류 딱지는
  // headline 이 그 사실을 이미 담고 있지 않을 때만 붙인다.
  const kindKo = KIND_LABEL[ev.kind] ?? '지금 볼 이유';
  const head = humanize(ev.headlineKo).replace(/\s*$/, '');
  const kindStem = kindKo.replace(/(습니다|합니다)\.?$/, '');
  // 이미 충분히 긴 headline 뒤에 딱지를 또 붙이면 제목이 두 문장이 된다.
  // cross_profile 의 headline 은 우리가 쓴 것이라 언제나 스스로를 설명한다 — 딱지가 필요 없다.
  const enough = ev.kind === 'cross_profile' || head.length >= 18 || head.includes(kindStem.slice(0, 4));
  const title = (enough ? `${b.name}, ${head}` : `${b.name}, ${head} — ${kindKo}`).slice(0, 100);

  const lines = [
    humanize(ev.headlineKo),
    humanize(ev.whyNowKo),
    '',
    `기준 시점 ${sessionLabel(b.sessionState as SessionState, b.asOf, mk).replace(/ 기준입니다$/, '')}`,
    `▸ 계산 근거 전체 : https://stockontology.cc`,
    '',
    '─────────────────────────────',
    '',
    `■ ${b.name} (${b.sector ?? '미분류'}) ${b.priceLabel}`,
    '',
    b.why?.macroKo ? `   거시  ${b.why.macroKo}` : '',
    b.why?.flowKo ? `   수급  ${b.why.flowKo}` : '',
    b.why?.chartKo ? `   차트  ${b.why.chartKo}` : '',
    '',
  ];
  if (b.plan) {
    const p = b.plan;
    lines.push('─────────────────────────────', '', '■ 매매 계획', '');
    lines.push(`   판정 ${p.biasKo}${p.gradeKo ? ` · ${p.gradeKo}` : ''}`);
    if (p.entry) lines.push(`   진입 ${money(mk, p.entry.low)} ~ ${money(mk, p.entry.high)}`);
    if (p.stop) lines.push(`   손절 ${money(mk, p.stop.price)}`);
    (p.targets ?? []).slice(0, 2).forEach((t, i) => lines.push(`   목표${i + 1} ${money(mk, t.price)}`));
    if (typeof p.rr === 'number') lines.push(`   손익비 ${p.rr.toFixed(2)}`);
    if (p.invalidation) lines.push(`   ${p.invalidation}`);
    lines.push('');
  }
  // ★설명란 끝에 이 채널이 무엇을 하는 곳인지 적는다★ 처음 들어온 사람은 영상 하나만
  // 보고 나간다. 값이 어디서 왔고 왜 믿을 만한지, 다음에 뭘 더 볼 수 있는지가 없으면
  // 구독할 이유가 없다. 여기 적는 것은 전부 실제로 하고 있는 것들이다 — 하지 않는 것을
  // 적으면 그 순간 이 채널의 유일한 자산이 사라진다.
  lines.push(
    '─────────────────────────────',
    '',
    '■ 이 채널이 하는 일',
    '',
    `   · 한국 350종목 + 미국 155종목을 서로 다른 다섯 관점으로 매일 훑습니다`,
    `     (차트 중심 · 수급 중심 · 수급+차트 · 돌파 · 역추세)`,
    `   · 관점이 겹치는 종목만 다룹니다. 순위 1위라서가 아니라, 보는 기준이 다른`,
    `     분석들이 같은 이름에 모였을 때가 드물기 때문입니다.`,
    `   · 차트 판정은 이름과 창시자가 있는 규칙 13종을 각각 돌린 결과입니다.`,
    `     MACD(Gerald Appel, 1979) · RSI(J. Welles Wilder, 1978) · 일목균형표 ·`,
    `     스테이지 분석(Stan Weinstein) · 터틀 · 볼린저밴드 …`,
    `   · 진입·손절·목표·손익비를 숫자로 밝히고, "이 계획이 틀렸다고 인정할 조건"까지`,
    `     같이 말합니다. 손익비가 1 아래면 1 아래라고 말합니다.`,
    `   · 계산 과정 전체가 사이트에 그대로 공개돼 있습니다. 영상에 나온 화면이 곧 그 사이트 화면입니다.`,
    `   · 마감을 기다렸다가 하루치를 몰아 올리지 않습니다. 조건이 맞는 종목이 나오면`,
    `     장중이든 마감 뒤든 그때 한 편씩, 같은 종목을 반복하지 않고 돌아가며 다룹니다.`,
    `   · 광고·협찬·유료방 없습니다. 특정 종목을 밀어 줄 이유가 없습니다.`,
    '',
    '   종목 이야기를 "느낌"이 아니라 숫자와 규칙으로 듣고 싶으셨다면,',
    '   구독해 두시면 후회 안 하실 겁니다. 다음 종목도 같은 방식으로 나갑니다.',
    '',
    `   ▸ 계산 근거 전체 : https://stockontology.cc`,
    '',
  );
  lines.push('─'.repeat(20), b.disclaimerKo ?? disclaimer);

  return {
    title,
    description: lines.filter((l) => l !== undefined).join('\n').slice(0, 4900),
    tags: ['주식온톨로지', '종목분석', b.name, b.sector ?? '주식', mk === 'KR' ? '코스피' : '미국주식', 'AI투자'].slice(0, 15),
    topic: `${b.name} ${ev.kind}`,
    thumbnailHeadline: mk === 'US' && /\d/.test(b.name) ? b.symbol.replace(/\..*$/, '') : b.name,
    // ★글자 수로 자르면 말이 잘린다★ 26자로 끊으니 "지목했습니다"가 "지목했습니"가 됐다.
    // 폭에 맞춰 글자 크기를 줄이는 일은 그리는 쪽(fitText)이 이미 한다.
    thumbnailSub: humanize(ev.headlineKo),
    // ★썸네일에 판정만 박으면 등급이 나쁜 날에도 "매수 검토 가능" 만 보인다★ 그림에는
    // 다툼의 여지가 없는 값을 쓴다 — 지금 값과 규칙 몇 개가 매수라고 했는지.
    thumbnailFoot: [
      b.priceLabel,
      typeof b.consensus?.buy === 'number' ? `전략 매수 ${b.consensus.buy} · 매도 ${b.consensus.sell ?? 0}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    thumbnailBadge: sessionBadge(b.sessionState as SessionState),
    thumbnailBigValue: '',
    thumbnailBigLabel: '',
    thumbnailAccent: '#e8564a',
    thumbnailSpark: (b.chart?.close ?? []).slice(-60).filter((n) => Number.isFinite(n)),
    scenes: planned.map((p) => p.scene),
    views,
  };
}

