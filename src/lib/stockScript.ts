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
      engine: 'scrapbook',
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
