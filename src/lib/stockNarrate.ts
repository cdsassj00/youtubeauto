/**
 * 조립된 씬에 "왜 그런가"를 붙인다 — 숫자는 그대로 두고 논리만 Claude 가 쓴다.
 *
 * ★조립만으로는 부족했다★ 처음에는 LLM 을 아예 부르지 않았다. 없는 숫자를 지어낼
 * 여지를 없애려고 그랬는데, 그 결과 나레이션이 API 응답을 소리 내어 읽는 것이 됐다.
 * "유가 플러스 삼 점 구구 퍼센트, 정유화학 민감도 플러스 영 점 육오" — 값은 정확하지만
 * 왜 유가가 오르면 정유화학이 좋아지는지는 아무도 말해 주지 않는다. 도식이 떠 있는
 * 동안 그 도식을 설명하는 목소리가 있어야 한다.
 *
 * ★그래서 역할을 나눈다★ 숫자는 사이트가, 논리는 Claude 가, 검사는 코드가 한다.
 *   · 값이 될 수 있는 것은 전부 facts 로 넘긴다(모델이 계산하거나 기억할 일이 없다).
 *   · 모델이 쓴 문장에서 숫자를 전부 뽑아, facts 에 없는 숫자가 하나라도 있으면
 *     그 씬은 통째로 버리고 조립된 원문을 쓴다.
 *
 * ★프롬프트로만 막지 않는 이유★ "숫자를 지어내지 마라"는 지시는 대개 지켜지지만
 * 가끔 샌다. 그리고 새는 날은 매일 나가는 영상 중 어느 하루라서 사람이 못 잡는다.
 * 주식 채널에서 틀린 숫자는 영상 하나를 버리는 정도가 아니라 채널을 버리는 일이다.
 * 지시와 사후 검사를 둘 다 둔다 — 실제로 나가는 문장을 검사하는 쪽이 최후 방어선이다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from '../config.js';
import { recordUsage } from './usage.js';

export interface NarrateItem {
  id: string;
  /** 화면 제목 — 모델이 무엇을 설명하는 중인지 알도록. */
  heading: string;
  /** 이 씬 화면에 실제로 떠 있는 값들. 모델이 쓸 수 있는 숫자는 여기 있는 것이 전부다. */
  facts: string;
  /** 조립된 기본 나레이션 — 실패 시 이것을 그대로 쓴다. */
  fallback: string;
  /** 목표 길이(초). */
  targetSec: number;
}

const NarrationSchema = z.object({
  narrations: z.array(z.object({ id: z.string(), text: z.string() })),
});

/**
 * 문장에서 숫자를 전부 뽑는다. 천단위 쉼표는 지우고 비교한다(49,200 과 49200 은 같다).
 *
 * 앞의 부호는 일부러 떼지 않는다 — "+3.99" 를 "-3.99" 로 바꿔 쓰는 것이 이 채널에서
 * 가장 위험한 조작이라, 부호까지 붙여 대조해야 잡힌다.
 */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  const re = /([+-]?)(\d[\d,]*)(?:\.(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sign = m[1] === '-' ? '-' : '';
    const int = m[2].replace(/,/g, '').replace(/^0+(?=\d)/, '');
    out.push(`${sign}${int}${m[3] ? `.${m[3].replace(/0+$/, '')}` : ''}`.replace(/\.$/, ''));
  }
  return out;
}

/**
 * 모델이 쓴 문장에 facts 에 없는 숫자가 있는가.
 *
 * ★연도·순번 같은 흔한 작은 수는 통과시키지 않는다★ 예외를 두기 시작하면 "1위",
 * "3개월" 같은 말로 없는 사실이 슬며시 들어온다. 필요하면 facts 에 넣어서 주면 된다.
 */
export function unknownNumbers(text: string, facts: string): string[] {
  const allowed = new Set<string>();
  for (const n of numbersIn(facts)) {
    allowed.add(n);
    // ★음수는 부호를 뗀 형태도 허용한다★ 한국어로 "-1.57%" 를 자연스럽게 말하면
    // "1.57% 내렸습니다" 가 된다. 부호를 동사가 지고 숫자에는 안 남는다. 이것까지
    // 막으면 멀쩡한 문장이 전부 버려지고 결국 값을 읽는 문장만 살아남는다.
    //
    // 반대 방향(facts 가 양수인데 문장이 음수)은 계속 막는다 — 오른 종목을 내렸다고
    // 하는 쪽이 이 채널에서 위험한 조작이고, 그건 여기서 잡힌다.
    // 부호를 말로 뒤집는 것(내린 값을 "올랐습니다"라고 쓰는 것)은 정규식으로 잡을 수
    // 없어 프롬프트로 막는다. 다만 화면에 -1.57% 가 같이 떠 있어 어긋나면 바로 보인다.
    allowed.add(n.replace(/^-/, ''));
  }
  return [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
}

const SYSTEM = [
  '너는 주식 데이터 영상의 나레이션을 쓰는 사람이다. 화면에는 이미 도식과 숫자가 떠 있고, 너는 그 도식을 말로 설명한다.',
  '',
  '★네가 하는 일은 숫자를 읽는 것이 아니다★ 값은 화면에 이미 적혀 있다. 너는 "왜 그것이 그렇게 되는가"를 말한다.',
  '나쁜 예: "유가 +3.99%, 정유화학 민감도 +0.65입니다." — 화면에 있는 것을 소리 내어 읽었을 뿐이다.',
  '좋은 예: "유가가 4% 가까이 올랐습니다. 정유화학은 원유를 사다 가공해 파는 업종이라, 원재료 값이 오르면 이미 사둔 재고의 평가액이 먼저 올라갑니다. 그래서 이 업종은 유가에 +0.65로 가장 민감하게 반응합니다."',
  '',
  '★숫자 규칙 — 어기면 그 씬은 통째로 버려진다★',
  '- facts 에 있는 숫자만 쓴다. facts 에 없는 숫자는 단 하나도 쓰지 마라.',
  '- 반올림·근사·환산하지 마라. "3.99%" 를 "약 4%" 나 "4%" 로 바꾸면 버려진다. 굳이 뭉개고 싶으면 "4% 가까이" 처럼 숫자를 그대로 두고 말로 표현해라.',
  '- ★부호를 말로 뒤집지 마라★ facts 에서 마이너스인 값은 반드시 "내렸다 / 하락했다 / 약해졌다" 로 쓴다. "-1.57%" 를 "1.57% 내렸습니다" 라고 쓰는 것은 맞고, "1.57% 올랐습니다" 는 거짓말이다. 화면에는 부호가 그대로 떠 있어서 어긋나면 시청자가 바로 본다.',
  '- 계산하지 마라. 합계·평균·차이를 네가 구해서 쓰면 버려진다.',
  '- 숫자를 꼭 다 쓸 필요는 없다. 오히려 핵심 한둘만 말하고 나머지는 화면에 맡기는 편이 낫다.',
  '',
  '★없는 사실을 만들지 마라★ facts 에 없는 기업 정보, 뉴스, 실적, 전망을 덧붙이지 마라. 업종이 어떤 원리로 돌아가는지 같은 일반 상식은 괜찮지만, 그것도 단정하지 말고 "보통 ~합니다" 로 써라.',
  '★투자 권유가 아니다★ "사세요", "오를 겁니다", "지금이 기회" 같은 말은 절대 쓰지 마라. 관찰과 설명만 한다.',
  '',
  '문체: 존댓말(합니다체), 담백하게. 감탄사·과장·수사 금지. 한 문장은 짧게.',
  'TTS 로 읽히므로 괄호·기호·불릿을 쓰지 마라. 읽을 수 있는 문장만 쓴다.',
].join('\n');

/**
 * 씬별 설명 나레이션을 받아 온다. 키가 없거나 실패하면 빈 Map — 호출자는 조립본을 쓴다.
 */
export async function narrateStock(items: NarrateItem[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!items.length) return out;

  let key: string;
  try {
    key = config.anthropicApiKey();
  } catch {
    console.warn('  · 설명 나레이션 건너뜀 — ANTHROPIC_API_KEY 가 없습니다(조립본 그대로 나갑니다)');
    return out;
  }

  const user = [
    '아래 각 씬의 나레이션을 써라. 씬마다 화면에 떠 있는 값(facts)과, 지금 쓰고 있는 밋밋한 문장(fallback)을 함께 준다.',
    'fallback 은 값을 그대로 읽기만 해서 못 쓴다. 같은 값을 놓고 "왜 그런가"를 설명하는 문장으로 다시 써라.',
    '',
    ...items.map((it) =>
      [
        `=== 씬 ${it.id} ===`,
        `화면 제목: ${it.heading}`,
        `목표 길이: ${Math.round(it.targetSec)}초 (한국어 약 ${Math.round((it.targetSec * 320) / 60)}자)`,
        `화면에 떠 있는 값:`,
        it.facts,
        `지금 문장(다시 쓸 대상): ${it.fallback}`,
        '',
      ].join('\n'),
    ),
    '각 씬마다 id 와 text 를 돌려줘라. text 는 목표 길이에 맞춘 한국어 나레이션이다.',
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey: key });
    const stream = client.messages.stream({
      model: config.claudeModel,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { format: zodOutputFormat(NarrationSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    });
    const final = await stream.finalMessage();
    recordUsage({
      kind: 'claude',
      step: 'script',
      model: config.claudeModel,
      inputTokens: final.usage?.input_tokens,
      outputTokens: final.usage?.output_tokens,
    });

    const block = final.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') throw new Error('응답이 비었습니다');
    const parsed = NarrationSchema.parse(JSON.parse(block.text));

    const byId = new Map(items.map((it) => [it.id, it]));
    let kept = 0;
    let dropped = 0;
    for (const n of parsed.narrations) {
      const it = byId.get(n.id);
      if (!it) continue;
      const bad = unknownNumbers(n.text, it.facts);
      if (bad.length) {
        // ★버리고 조립본으로 돌아간다★ 고쳐 쓰려고 하지 않는다. 어떤 숫자가 왜 나왔는지
        // 모르는 채로 문장을 손보면 틀린 문장을 그럴듯하게 만들 뿐이다.
        console.warn(`  · ${n.id}: 화면에 없는 숫자 ${bad.join(', ')} — 조립본을 씁니다`);
        dropped++;
        continue;
      }
      if (n.text.trim().length < 20) {
        dropped++;
        continue;
      }
      out.set(n.id, n.text.trim());
      kept++;
    }
    console.log(`  · 설명 나레이션 ${kept}개 적용${dropped ? `, ${dropped}개는 조립본 유지` : ''}`);
  } catch (e) {
    // 설명이 없어도 영상은 나가야 한다. 값은 이미 조립본에 정확히 들어 있다.
    console.warn(`  · 설명 나레이션 실패(무시, 조립본 사용): ${(e as Error).message}`);
  }
  return out;
}
