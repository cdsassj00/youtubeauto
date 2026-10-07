/**
 * 책 문장 하나로 쇼츠 한 편의 대본을 짠다.
 *
 * ★훅은 지어내지 않고 고른다★ assets/shorts/hooks.json 의 틀 50가지 중 하나를 골라
 * 대괄호를 이 책의 실제 내용으로 채운다. 빈 화면에서 쓰게 하면 "인생을 바꾸는 한 문장!"
 * 같은 말이 나오는데, 고르게 하면 구조가 남는다.
 *
 * ★인용은 짧게, 나머지는 내 말로★ 책의 문장을 길게 옮기면 인용이 아니라 복제다. 문장은
 * 한두 줄만 그대로 쓰고, 그 앞뒤는 "그래서 뭐가 달라지는가"를 내 말로 채운다. 그 편이
 * 저작권에서도 안전하고, 쇼츠로서도 낫다 — 사람들은 문장이 아니라 해석을 보러 온다.
 *
 * ★컷마다 배경 검색어를 영어로 받는다★ Pexels 는 한국어 검색이 사실상 안 된다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { recordUsage } from './usage.js';
import { loadHookTemplates, type HookTemplate } from './shortPlan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_PATH = path.resolve(HERE, '../../assets/shorts/books.json');

export interface Book {
  id: string;
  title: string;
  author: string;
  link?: string;
  note?: string;
  quotes: string[];
}

export async function loadBooks(): Promise<Book[]> {
  const raw = JSON.parse(await fs.readFile(BOOKS_PATH, 'utf8')) as { books: Book[] };
  const books = (raw.books ?? []).filter((b) => b.id && b.quotes?.length);
  if (!books.length) throw new Error('assets/shorts/books.json 에 쓸 만한 책이 없습니다.');
  return books;
}

export const BeatSchema = z.object({
  /** 화면에 뜨는 글. 한 줄 12자 안쪽, 줄바꿈으로 최대 세 줄. 강조는 ** 로 감싼다. */
  text: z.string(),
  /** 이 컷이 머무는 시간(초). 2.0~4.5. */
  sec: z.number(),
  /** 배경으로 쓸 스톡 검색어 — 영어로, 두세 낱말. */
  query: z.string(),
});
export type Beat = z.infer<typeof BeatSchema>;

export const BookShortSchema = z.object({
  hookTemplateId: z.number(),
  /** 첫 컷에 뜨는 훅. 다른 컷보다 크게 나간다. */
  hook: z.string(),
  /** 첫 컷 배경 검색어. */
  hookQuery: z.string(),
  /** 훅 다음 컷들 — 문장 인용과 해석. 3~6개. */
  beats: z.array(BeatSchema),
  /** 마지막 컷 — 책을 집어 들게 하는 한 줄. */
  closer: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
});
export type BookShort = z.infer<typeof BookShortSchema>;

export interface BookShortInput {
  book: Book;
  quote: string;
  /** 이미 만든 쇼츠의 훅 틀 번호 — 같은 틀이 연달아 나오지 않게 피한다. */
  avoidTemplates?: number[];
}

export async function planBookShort(
  input: BookShortInput,
): Promise<{ plan: BookShort; template: HookTemplate }> {
  const templates = await loadHookTemplates();
  const avoid = new Set(input.avoidTemplates ?? []);
  const usable = templates.filter((t) => !avoid.has(t.id));
  const pool = usable.length >= 10 ? usable : templates;

  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  const system = [
    '너는 책 한 문장으로 세로 쇼츠를 만드는 작가다.',
    '★인용은 짧게, 나머지는 네 말로★ 책의 문장은 주어진 한두 줄만 그대로 쓴다. 책에 있는 다른 내용을 더 옮겨 적지 마라 — 네가 읽지 않은 책이고, 지어내면 거짓말이 된다. 주어진 문장을 어떻게 읽을 것인지, 그래서 오늘 무엇이 달라지는지를 네 말로 채워라.',
    '★말투★ 가르치는 사람이 아니라 옆자리에서 먼저 읽어 본 사람이 건네는 말투로 써라. 음슴체("~됨"), 해요체, 명사로 끝내기, 되묻기 중에서 고른다. 명령형("~해라")과 평생·완벽·마스터·총정리·핵심·제대로·반드시·필수·비법·노하우·충격·99% 는 쓰지 마라 — 훈계로 읽힌다. 책 소개 문구나 광고 문구처럼 부풀리지 마라.',
    '★화면에 뜨는 글이다★ 귀로 듣는 말이 아니라 눈으로 읽는 글이다. 한 컷에 한 생각만 담고, 짧게 끊어라.',
  ].join(' ');

  const user = [
    `책: ${input.book.title} — ${input.book.author}`,
    input.book.note ? `이 책을 권하는 이유: ${input.book.note}` : '',
    '',
    `오늘 쓸 문장: "${input.quote}"`,
    '',
    '=== 훅 틀 (이 중 하나를 골라 쓴다) ===',
    ...pool.map((t) => `${t.id}. ${t.pattern}\n   예) ${t.example}`),
    '=== 훅 틀 끝 ===',
    '',
    '요구사항:',
    '- hookTemplateId: 이 문장에 맞는 틀 번호 하나.',
    '- hook: 그 틀을 채운 두 줄. 줄바꿈(\\n)으로 나누고 한 줄 12자 이내. ★예시 문장을 베끼지 마라★ 예시의 숫자와 사례는 이 책 것이 아니다. 강조할 한 덩어리를 ** 로 감싼다.',
    '- beats: 3~6개. 훅 다음에 이어지는 컷들이다. 이 흐름으로 짜라 — (1) 왜 이 말이 걸리는지, (2) 책의 그 문장 그대로(주어진 문장만), (3) 그 말이 무슨 뜻인지 내 말로, (4) 그래서 오늘 무엇이 달라지는지.',
    '  · text: 한 줄 12자 이내, 줄바꿈으로 최대 세 줄. 강조는 ** 로.',
    '  · sec: 2.0~4.5. 글이 길수록 길게. 전부 더해 20~35초가 되게 하라.',
    '  · query: 그 컷 배경으로 쓸 스톡 영상 검색어. ★영어로 두세 낱말★ 한국어는 안 걸린다. 글자를 읽을 수 있게 단순하고 어두운 장면을 골라라 — "slow ocean waves night", "rain on window", "walking city street alone". 사람 얼굴이 크게 나오는 장면은 글씨와 겹치니 피하라.',
    '- closer: 마지막 컷 한 줄. 책을 집어 들게 하되 "사세요" 라고 하지 마라 — 무엇을 얻는지만 말한다. 20자 이내.',
    '- title: 40자 이내. 책 제목과 지은이를 넣어라(검색으로 찾아 들어온다).',
    '- summary: 2~3문장. 설명란에 들어간다.',
    '- tags: 6~10개. 책 제목, 지은이, 주제.',
  ]
    .filter(Boolean)
    .join('\n');

  const stream = client.messages.stream({
    model: config.claudeModel,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(BookShortSchema) },
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

  const block = final.content.find((c) => c.type === 'text');
  if (!block || block.type !== 'text') throw new Error('쇼츠 대본 응답이 비었습니다.');
  const plan = BookShortSchema.parse(JSON.parse(block.text));
  const template = templates.find((t) => t.id === plan.hookTemplateId) ?? templates[0];
  return { plan, template };
}
