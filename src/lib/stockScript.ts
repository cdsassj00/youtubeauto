/**
 * 하루치 브리프를 미드폼 대본(씬 배열)으로 조립한다.
 *
 * ★Claude 를 부르지 않는다★ 처음에는 LLM 에게 대본을 맡기려 했는데, 이 브리프는 이미
 * 문장(speech)과 근거(reasons)를 완성해서 준다. 거기에 LLM 을 한 번 더 통과시키면
 *  (1) 매일 돈이 들고 (2) 없는 숫자를 지어낼 여지가 생긴다. 숫자를 다루는 채널에서
 * 후자는 치명적이다. 그래서 조립은 순수 함수로 두고, 값은 응답에 있는 것만 쓴다.
 *
 * ★화풍을 씬마다 바꾼다★ 8분을 한 화면으로 버틸 수 없다. 사이트가 그려 준 실제 화면
 * (illustrated 엔진으로 전체화면 표시)과 손그림·목록·도식을 번갈아 놓는다.
 */
import type { Brief } from './stockBrief.js';
import type { Scene } from '../schema.js';

/** 한국어 나레이션 속도 — 320자/분으로 잡는다(실측 TTS 로 다시 측정되므로 계획용 값). */
const CHARS_PER_SEC = 320 / 60;

export interface PlannedScene {
  scene: Scene;
  /** 이 씬 배경으로 깔 사이트 화면 (없으면 엔진이 자체 렌더). */
  sceneView?: string;
  estSec: number;
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/**
 * "정유화학이(가)" 같은 미해결 조사를 앞 글자 받침에 맞춰 하나로 고른다.
 *
 * ★TTS 가 괄호를 읽는다★ 사이트가 보내는 완성 문장에 이(가)·은(는)·을(를) 형태가 남아 있는데,
 * 음성으로는 "정유화학이 괄호 가"로 나간다. 화면 자막에도 그대로 박힌다. 받침 유무만 보면
 * 되는 규칙이라 여기서 고친다(원문을 고쳐 달라고 하는 것보다 우리 쪽이 즉시 안전하다).
 */
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

export function buildStockScenes(b: Brief): PlannedScene[] {
  const out: PlannedScene[] = [];
  const add = (scene: Omit<Scene, 'bullets' | 'illustration' | 'sourceNote'> & Partial<Scene>, sceneView?: string) => {
    const full: Scene = { bullets: [], illustration: '', sourceNote: '', ...scene } as Scene;
    out.push({ scene: full, sceneView, estSec: full.narration.length / CHARS_PER_SEC });
  };

  const mk = b.marketKo;

  // ── 0. 오프닝 — 어제 성적을 첫 문장에 둔다 ──────────────────────────────
  // ★자랑이 아니라 채점이 먼저다★ "오늘 이걸 사세요"로 시작하는 채널은 널렸다. 이 채널이
  // 다른 점은 어제 한 말을 오늘 채점한다는 것뿐이라, 그걸 맨 앞에 두지 않으면 차별점이 없다.
  const prev = b.previous;
  if (prev && prev.picks.length) {
    const hit = Math.round(prev.hitRate * prev.picks.length);
    add({
      id: 'open',
      heading: `어제 ${prev.picks.length}종목 중 ${hit}개`,
      narration: `어제 이 채널이 고른 ${mk} ${prev.picks.length}종목 가운데 ${hit}개가 올랐습니다. 평균 ${pct(prev.avgChangePct)}입니다. 맞은 것도 틀린 것도 그대로 보여드리고 시작하겠습니다.`,
      visual: 'metric',
      metric: { value: `${hit}/${prev.picks.length}`, label: '어제 추천 적중', note: `평균 ${pct(prev.avgChangePct)}` },
      engine: 'standard',
    });

    add({
      id: 'prev',
      heading: '어제 추천, 오늘 결과',
      narration:
        `종목별로 보겠습니다. ` +
        prev.picks.map((p) => `${p.name}은 ${p.recPrice.toLocaleString()}원에서 ${p.nowPrice.toLocaleString()}원, ${pct(p.changePct)}입니다.`).join(' ') +
        ` 기준은 추천한 시점의 시세와 오늘 계산 시점의 시세입니다.`,
      bullets: prev.picks.slice(0, 5).map((p) => `${p.name} ${pct(p.changePct)}`),
      visual: 'bullets',
      engine: 'listing',
    });
  }

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
      engine: 'scrapbook',
    });
  }

  // ── 1. 오늘의 국면 — 사이트 전체 그래프를 그대로 ────────────────────────
  add(
    {
      id: 'regime',
      heading: b.regime.label,
      narration: `오늘 ${mk} 시장은 ${b.regime.label}입니다. ` + b.regime.lines.slice(0, 3).join(' ') + ' 이 판단은 사람이 고른 것이 아니라 거시 지표에서 계산된 값입니다.',
      visual: 'image',
      engine: 'illustrated',
    },
    'overview',
  );

  // ── 2. 왜 그렇게 됐나 — 손그림으로 인과를 그린다 ────────────────────────
  add({
    id: 'causal',
    heading: '지금 작동 중인 인과',
    narration: (b.speech?.causal?.length ? b.speech.causal : b.causal).slice(0, 4).join(' '),
    bullets: b.causal.slice(0, 4).map((c) => c.split('—')[0].trim()),
    visual: 'diagram',
    diagram: {
      nodes: [
        { id: 'macro', label: '거시요인' },
        { id: 'sector', label: '섹터' },
        { id: 'stock', label: '종목' },
      ],
      edges: [
        { from: 'macro', to: 'sector' },
        { from: 'sector', to: 'stock' },
      ],
    },
    engine: 'whiteboard',
  });

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
        (gone.length ? `어제 목록에 있던 ${gone.map((g) => g.name).join(', ')}가 오늘 빠졌습니다. ${gone[0].reason}. ` : '') +
        (fresh.length ? `대신 ${fresh.map((f) => f.name).join(', ')}가 새로 들어왔습니다.` : ''),
      bullets: [...gone.map((g) => `빠짐 · ${g.name}`), ...fresh.map((f) => `신규 · ${f.name}`)].slice(0, 5),
      visual: 'comparison',
      comparison: {
        leftTitle: '빠진 종목',
        leftItems: gone.map((g) => g.name).slice(0, 4),
        rightTitle: '새로 들어온 종목',
        rightItems: fresh.map((f) => f.name).slice(0, 4),
      },
      engine: 'standard',
    });
  }

  // ── 5. 오늘의 종목 — 사이트의 점수 분해 화면을 종목마다 ──────────────────
  b.picks.forEach((p, i) => {
    const days = p.daysInList && p.daysInList > 1 ? ` 이 종목은 ${p.daysInList}일째 목록에 남아 있습니다.` : p.isNew ? ' 오늘 새로 들어온 종목입니다.' : '';
    add(
      {
        id: `pick${i + 1}`,
        heading: `${i + 1}. ${p.name} ${p.score.toFixed(2)}`,
        narration:
          `${i + 1}번째는 ${p.name}입니다. ${p.sector ?? '미분류'} 업종이고 현재 ${p.priceLabel}, ${pct(p.changePct)}입니다. ` +
          (p.reasons ?? []).join(' ') +
          `${days} 종합 점수는 ${p.score.toFixed(2)}점입니다.`,
        visual: 'image',
        engine: 'illustrated',
      },
      `stock:${p.code}`,
    );
  });

  // ── 6. 네 엔진의 대결 — 이 채널의 킬러 구간 ─────────────────────────────
  if (b.league?.strategies?.length) {
    const s = b.league.strategies;
    add(
      {
        id: 'league',
        heading: '네 방식이 같은 조건으로 싸운다',
        narration:
          `이 사이트에는 서로 철학이 다른 분석 방식이 네 개 있습니다. ` +
          s.map((x) => `${x.nameKo}는 ${x.tagKo}로 고르고 지금 ${pct(x.pnlPct)}입니다.`).join(' ') +
          ` 같은 원금, 같은 매매 규칙이고 다른 것은 무엇을 살까 하나뿐입니다. 그래서 어느 철학이 실제로 버는지가 공정하게 비교됩니다.`,
        visual: 'image',
        engine: 'illustrated',
      },
      'league',
    );
  }

  // ── 7. 클로징 ───────────────────────────────────────────────────────────
  add({
    id: 'outro',
    heading: '내일 또 채점합니다',
    narration:
      `오늘 고른 종목은 내일 이 자리에서 그대로 채점합니다. 맞으면 맞았다고, 틀리면 틀렸다고 숫자로 보여드립니다. ` +
      `계산 과정 전체는 스톡온톨로지 점 시시에서 직접 보실 수 있습니다. ` +
      `이 채널은 광고 수익을 받지 않습니다. 투자 자문이나 권유가 아니고, 판단과 책임은 보시는 분께 있습니다.`,
    visual: 'outro',
    icon: 'search',
    engine: 'illustrated',
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
export function buildStockScript(b: Brief, date: string, disclaimer: string) {
  const planned = buildStockScenes(b);
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const top = b.sectors.recommend[0]?.sector ?? b.regime.label;
  const names = b.picks.map((p) => p.name);
  const prev = b.previous;
  const hit = prev ? Math.round(prev.hitRate * prev.picks.length) : 0;

  // ★국면이 꺾인 날이 시리즈의 하이라이트다★ 그날은 적중률보다 전환을 앞세운다 —
  // 온톨로지가 갈아타는 장면이 이 전략의 존재 이유이기 때문이다.
  const turned = b.narrative?.regime?.changed;
  const head = turned ? '국면 전환 · ' : prev && prev.picks.length ? `어제 ${hit}/${prev.picks.length} 적중 · ` : '';
  const title = `${head}${top} 순풍 — ${names.slice(0, 3).join('·')} (${md} ${b.marketKo})`.slice(0, 100);

  const lines: string[] = [];
  if (prev && prev.picks.length) {
    lines.push(`어제 추천한 ${prev.picks.length}종목 중 ${hit}개가 올랐습니다. 평균 ${pct(prev.avgChangePct)}.`);
  }
  lines.push(`오늘은 ${top}에 순풍이 붙었습니다.`, '', `계산 결과 전체 ▸ https://stockontology.cc`, '');
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
