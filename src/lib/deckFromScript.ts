/**
 * 표준 대본(manifest) → SIGNAL 덱 슬라이드로 변환한다.
 *
 * ★왜 만들었나★
 * deck 엔진(signal/signal3d/deck3d)만 `deck.json` 이라는 별도 대본 형식을 썼다. 형식이
 * 다르니 다음 것들이 전부 공유되지 않았다.
 *   - 한국어 자막 분절(beats.ts) — 숫자 안 쉼표에서 안 끊기, 꾸밈말 안 매달기
 *   - 도식 4종(metric/bars/comparison/diagram)
 *   - 나레이션 생성 단계(2단계) 자체
 * deck 엔진은 렌더러가 자기 손으로 TTS 를 다시 돌렸다. 즉 같은 일을 하는 코드가 두 벌이고,
 * 한쪽을 고치면 다른 쪽은 낡았다.
 *
 * 이 변환기를 두면 1·2단계는 모든 엔진이 똑같이 쓰고, 덱은 "화면 스타일"만 담당한다.
 * 대본 형식이 하나가 되므로 앞으로 자막·도식을 고치면 덱에도 같이 적용된다.
 *
 * ★씬 하나 = 슬라이드 하나 = 비트 하나★
 * narrate-deck.mjs 는 슬라이드에 `steps` 가 있으면 그것을 여러 비트로 쪼갠다. 비트 수가
 * 오디오 클립 수와 어긋나면 화면이 소리보다 길어져 렌더가 멈춘 전례가 있다. 그래서 여기서는
 * `steps` 를 절대 만들지 않는다 — 씬과 1:1 로 유지한다.
 */
import type { RenderManifest, SceneWithAudio } from '../schema.js';

/** deck-signal.js 가 실제로 그릴 수 있는 타입만 쓴다(그 파일의 분기와 대조해 확인). */
type Slide = Record<string, unknown>;

/** 도식 노드를 화면에 고르게 눕힌다. x,y 는 0~100 백분율(deck-signal.js 규약). */
function layoutNodes(count: number): Array<{ x: number; y: number }> {
  if (count === 1) return [{ x: 50, y: 50 }];
  const left = 14;
  const span = 72;
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(left + (span * i) / (count - 1)),
    // 지그재그로 살짝 어긋내 선이 겹쳐 보이지 않게 한다.
    y: i % 2 === 0 ? 42 : 60,
  }));
}

function slideFor(scene: SceneWithAudio): Slide {
  const kicker = scene.heading;

  if (scene.visual === 'metric' && scene.metric?.value) {
    return {
      type: 'big',
      kicker,
      value: scene.metric.value,
      unit: '',
      sub: scene.metric.label ?? '',
      lead: scene.metric.note ?? '',
    };
  }

  if (scene.visual === 'bars' && scene.bars?.items?.length) {
    // deck-signal 에는 막대 타입이 없다. 값 카드(metrics)로 대신한다 —
    // 없는 타입을 지어내면 화면이 통째로 비어버린다.
    return {
      type: 'metrics',
      kicker,
      items: scene.bars.items.slice(0, 4).map((it) => [it.label, `${it.value}${scene.bars?.unit ?? ''}`, '']),
    };
  }

  if (scene.visual === 'comparison' && scene.comparison) {
    const c = scene.comparison;
    return {
      type: 'cmp',
      kicker,
      // cmp 는 배열 첫 칸이 제목, 나머지가 항목이다(deck-signal.js 285행).
      left: [c.leftTitle, ...c.leftItems],
      right: [c.rightTitle, ...c.rightItems],
      lead: '',
    };
  }

  if (scene.visual === 'diagram' && scene.diagram?.nodes?.length) {
    const nodes = scene.diagram.nodes.slice(0, 5);
    const pos = layoutNodes(nodes.length);
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const links = (scene.diagram.edges ?? [])
      .map((e) => [idx.get(e.from), idx.get(e.to)])
      .filter((p): p is [number, number] => typeof p[0] === 'number' && typeof p[1] === 'number')
      .slice(0, 8);
    return {
      type: 'nodes',
      kicker,
      points: nodes.map((n, i) => ({ label: n.label, x: pos[i].x, y: pos[i].y })),
      links,
      // ★steps 를 넣지 않는다★ 넣으면 비트가 쪼개져 오디오와 개수가 어긋난다.
    };
  }

  if (scene.bullets?.length) {
    return {
      type: 'metrics',
      kicker,
      items: scene.bullets.slice(0, 4).map((b) => [b, '', '']),
    };
  }

  // 그 밖(title/outro/quote/image 등)은 한 문장을 크게 띄운다.
  return { type: 'claim', kicker, claim: scene.heading, lead: scene.sourceNote || '' };
}

export interface DeckBuild {
  deck: { engine: string; header: string; palette?: string; slides: Slide[] };
  /** narrate-deck.mjs 에 넘길 미리 만들어진 나레이션 클립 (씬 순서와 1:1). */
  clips: Array<{ file: string; dur: number }>;
}

export function buildSignalDeck(manifest: RenderManifest, audioDir: string): DeckBuild {
  const slides = manifest.scenes.map((scene) => ({
    ...slideFor(scene),
    // 화면에 띄우는 자막 겸 나레이션 원문. 렌더러는 dur 이 있으면 TTS 길이를 추정하지 않는다.
    say: scene.narration,
    dur: scene.durationSec,
  }));

  return {
    deck: { engine: 'signal', header: manifest.title, palette: 'noir', slides },
    clips: manifest.scenes.map((s) => ({
      file: `${audioDir}/${s.id}.mp3`,
      dur: s.durationSec,
    })),
  };
}
