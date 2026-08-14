/**
 * 목록형(카드형) 영상 — 항목 N개를 사진과 함께 하나씩 소개한다.
 *
 * ★왜 만들었나★
 * 카페 23곳처럼 "목록" 자료를 받아 놓고 개념 설명 영상을 만든 적이 있다. 자료의 형태를
 * 무시하고 채널 포맷에 끼워 맞춘 것이다. 목록 자료는 목록 영상이어야 한다 —
 * 사진 한 장과 이름이 하나씩 지나가는 형태.
 *
 * ★사실은 데이터, 문장만 Claude★
 * 이름·위치·수치는 items.json 에 적힌 것을 그대로 쓴다. Claude 에게는 나레이션 문장만
 * 맡긴다. 대본 생성기에 전부 맡기면 자료에 없는 걸 지어내거나, 있는 걸 빠뜨린다.
 * 지난 실패의 핵심 원인이 그것이었다.
 *
 * ★사진은 저장소로 옮긴다★
 * 사진은 dispatch 페이로드로 못 보낸다(JSON 이라 바이너리가 안 실린다). 그래서
 * assets/listing/<슬러그>/ 에 넣어 커밋하고, 발행할 때는 슬러그 이름만 넘긴다.
 * 렌더 단계에서 public/img/ 로 복사해 Remotion 이 staticFile 로 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config, ROOT } from '../config.js';
// IMG_DIR 은 illustrate.ts 가 유일한 정의처다 — 여기서 다시 선언하면 두 벌이 된다.
import { IMG_DIR } from './illustrate.js';
import { recordUsage } from './usage.js';
import type { Script } from '../schema.js';

export const LISTING_DIR = path.join(ROOT, 'assets', 'listing');

/** 한 항목 — 화면에 그대로 찍히는 값들이다. 여기 없는 건 영상에도 없다. */
const ItemSchema = z.object({
  /** 화면에 붙는 번호. 없으면 순서대로 매긴다. */
  no: z.number().optional(),
  name: z.string(),
  /** 지역·분류 (예: '강남') */
  area: z.string().default(''),
  /** 접근 정보 (예: '신논현역 6번 출구 330m') */
  access: z.string().default(''),
  /** 한 줄 특징 (예: '★4.47 · 리뷰 6,785 · 24시간') */
  note: z.string().default(''),
  /** 폴더 안 사진 파일명. 없으면 그 항목은 사진 없이 카드만 나온다. */
  photo: z.string().default(''),
  /** 묶음 이름 (예: '24시간'). 바뀌는 지점에 구분 화면이 들어간다. */
  group: z.string().default(''),
});

export const ListingSpecSchema = z.object({
  title: z.string(),
  subtitle: z.string().default(''),
  /** 영상 안에서 반드시 한 번 말해야 하는 주의사항(자료의 한계 등). */
  caveat: z.string().default(''),
  source: z.string().default(''),
  items: z.array(ItemSchema).min(1).max(60),
});
export type ListingSpec = z.infer<typeof ListingSpecSchema>;
export type ListingItem = z.infer<typeof ItemSchema>;

/** Claude 에게 맡기는 것 — 문장뿐이다. 수치·이름은 요청하지 않는다. */
const NarrationSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(15),
  thumbnailHeadline: z.string(),
  thumbnailBadge: z.string(),
  /** 도입부 — 왜 이 목록이 필요한가. 2~4문장. */
  intro: z.string(),
  /** 항목별 한 마디. no 는 입력과 같아야 한다. */
  items: z.array(z.object({ no: z.number(), say: z.string() })),
  /** 마무리 — 고를 때 무엇을 보면 되는가. 2~4문장. */
  outro: z.string(),
});

export function loadListingSpec(slug: string): { spec: ListingSpec; dir: string } {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error(`목록 슬러그가 비어 있습니다: ${JSON.stringify(slug)}`);
  const dir = path.join(LISTING_DIR, safe);
  const file = path.join(dir, 'items.json');
  if (!fs.existsSync(file)) {
    const have = fs.existsSync(LISTING_DIR) ? fs.readdirSync(LISTING_DIR).join(', ') : '(폴더 없음)';
    throw new Error(`목록 자료를 찾지 못했습니다: ${file}\n있는 목록: ${have}`);
  }
  const spec = ListingSpecSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));

  // ★사진이 실제로 있는지 여기서 확인한다★ 렌더 도중에 알면 이미 돈을 다 쓴 뒤다.
  const missing = spec.items.filter((it) => it.photo && !fs.existsSync(path.join(dir, it.photo)));
  if (missing.length) {
    throw new Error(`사진 파일이 없습니다(${missing.length}개): ${missing.map((m) => m.photo).join(', ')}`);
  }
  return { spec, dir };
}

/** 사진을 public/img/ 로 복사하고 staticFile 상대경로를 돌려준다. */
export function stageListingPhotos(spec: ListingSpec, dir: string): Map<number, string> {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const map = new Map<number, string>();
  spec.items.forEach((it, i) => {
    if (!it.photo) return;
    const ext = path.extname(it.photo) || '.jpg';
    const name = `listing-${String(i + 1).padStart(2, '0')}${ext}`;
    fs.copyFileSync(path.join(dir, it.photo), path.join(IMG_DIR, name));
    map.set(i, `img/${name}`);
  });
  return map;
}

/**
 * 항목 목록 → 대본. 나레이션만 Claude 가 쓰고 나머지는 자료 그대로다.
 */
export async function generateListingScript(spec: ListingSpec, targetMinutes: number): Promise<Script> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  // 항목당 말할 수 있는 글자 수 — 전체 분량에서 도입·마무리를 빼고 나눈다.
  // 한국어 나레이션은 분당 약 460자로 잡는다(anthropic.ts 와 같은 기준).
  const totalChars = Math.round(targetMinutes * 460);
  const perItem = Math.max(40, Math.floor((totalChars * 0.82) / spec.items.length));

  const itemLines = spec.items
    .map((it, i) => {
      const no = it.no ?? i + 1;
      const bits = [it.area, it.access, it.note].filter(Boolean).join(' · ');
      return `${no}. ${it.name}${bits ? ` — ${bits}` : ''}${it.group ? ` [묶음: ${it.group}]` : ''}`;
    })
    .join('\n');

  const system = [
    '너는 한국어 유튜브 나레이션 작가다. 목록형 소개 영상의 대사를 쓴다.',
    '',
    '★가장 중요한 규칙★',
    '- 아래 목록에 적힌 사실만 쓴다. 이름·지역·거리·평점·리뷰 수를 바꾸거나 새로 만들지 마라.',
    '- 목록에 없는 정보(가격, 좌석 수, 영업시간, 주차, 와이파이, 분위기 평가)를 지어내지 마라.',
    '- 항목마다 순위를 매기거나 "여기가 최고"라고 단정하지 마라.',
    '- 광고 문구처럼 띄우지도, 깎아내리지도 마라. 담담하게 소개한다.',
    '',
    '문장 규칙',
    `- 항목 하나당 ${perItem}자 안팎. 번호와 이름을 자연스럽게 말하고, 목록에 적힌 정보를 풀어 말한다.`,
    '- "~입니다" 체. 라디오에서 편하게 읽어주듯이.',
    '- 항목마다 같은 문형을 반복하지 마라. 어떤 곳은 위치부터, 어떤 곳은 특징부터 시작한다.',
    '- 숫자는 읽는 대로 쓴다(330m → "330미터", ★4.47 → "평점 4.47").',
  ].join('\n');

  const user = [
    `제목 후보: ${spec.title}${spec.subtitle ? ` / ${spec.subtitle}` : ''}`,
    '',
    '=== 항목 목록 (이것만 쓴다) ===',
    itemLines,
    '=== 목록 끝 ===',
    '',
    spec.caveat ? `★도입부나 마무리에 이 주의사항을 반드시 자연스럽게 한 번 담아라★\n${spec.caveat}` : '',
    '',
    `총 ${spec.items.length}개 항목 전부에 대해 items 를 채워라. no 는 위 번호와 정확히 같아야 한다.`,
    'intro 는 이 목록이 왜 필요한지, outro 는 고를 때 무엇을 보면 되는지로 마무리한다.',
    'thumbnailHeadline 은 8~14자 한글, thumbnailBadge 는 짧은 영어.',
  ]
    .filter(Boolean)
    .join('\n');

  const stream = client.messages.stream({
    model: config.claudeModel,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(NarrationSchema) },
    system,
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
  const narration = NarrationSchema.parse(
    (final as unknown as { parsed_output?: unknown }).parsed_output ??
      JSON.parse(final.content.map((c) => ('text' in c ? c.text : '')).join('')),
  );

  // ★나레이션을 번호로 맞춘다★ 순서대로 믿으면 하나가 빠졌을 때 전부 밀린다.
  const byNo = new Map(narration.items.map((i) => [i.no, i.say]));

  const scenes: Script['scenes'] = [];
  scenes.push({
    id: 's0',
    heading: spec.title,
    narration: narration.intro,
    bullets: [],
    sourceNote: '',
    visual: 'title',
  } as unknown as Script['scenes'][number]);

  spec.items.forEach((it, i) => {
    const no = it.no ?? i + 1;
    const say = byNo.get(no);
    if (!say) throw new Error(`${no}번 항목의 나레이션이 비었습니다 — 대본 생성 실패`);
    scenes.push({
      id: `s${i + 1}`,
      // heading 은 화면 카드에 쓰인다. 자료의 이름을 그대로 쓴다(모델을 거치지 않는다).
      heading: it.name,
      narration: say,
      bullets: [it.access, it.note].filter(Boolean),
      sourceNote: it.area,
      visual: 'image',
    } as unknown as Script['scenes'][number]);
  });

  scenes.push({
    id: `s${spec.items.length + 1}`,
    heading: '오늘 밤, 어디로',
    narration: narration.outro,
    bullets: [],
    sourceNote: spec.source,
    visual: 'outro',
  } as unknown as Script['scenes'][number]);

  return {
    title: narration.title,
    description: narration.description + (spec.source ? `\n\n출처: ${spec.source}` : ''),
    tags: narration.tags,
    topic: spec.title,
    thumbnailHeadline: narration.thumbnailHeadline,
    thumbnailBadge: narration.thumbnailBadge,
    scenes,
  } as unknown as Script;
}
