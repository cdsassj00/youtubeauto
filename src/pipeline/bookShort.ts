/**
 * 책 문장 하나로 세로 쇼츠를 만들어 올린다.
 *
 * ★어느 문장으로 만들지★ books.json 을 위에서부터 돌되, 이미 만든 것은 건너뛴다. 무엇을
 * 만들었는지는 쇼츠 태그(`book-<책id>-<문장번호>`)에 박아 둔다 — 저장소에 발행 이력을
 * 두지 않는 이 저장소의 원칙("유튜브가 사실이다")을 그대로 따른다.
 *
 * ★상품 태그는 여기서 못 붙인다★ 유튜브 데이터 API 에는 쇼핑 상품을 다는 길이 없다.
 * 영상을 올리는 데까지가 이 파이프라인의 몫이고, 상품은 스튜디오에서 손으로 단다.
 * 그래서 올린 뒤 그 주소를 로그에 크게 남긴다.
 *
 * 드는 쿼터: 업로드 1,600. 스톡은 Pexels 무료 API, 음악은 코드로 만든다 — 둘 다 0원.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { loadBooks, planBookShort, type Book } from '../lib/bookShort.js';
import { renderBookShort, type CutSpec } from '../lib/bookShortRender.js';
import { fetchStock } from '../lib/stock.js';
import { fetchAsset, availableProviders } from '../lib/stockProviders.js';
import { drawBackdrop, BACKDROP_STYLES, type BackdropStyle } from '../lib/shortBackdrop.js';
import { generateBgm, bgmStyleFromEnv } from '../lib/bgm.js';
import { thumbVariant } from '../lib/thumbVariant.js';
import { uploadVideo, listPublishedOrders, apiErrorDetail } from '../lib/youtube.js';
import { flagScolding } from '../lib/courseMeta.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../../out/bookshort');
const PUBLIC_DIR = path.resolve(HERE, '../../public');

const env = (k: string, d = '') => process.env[k]?.trim() || d;

/** 이 실행에서 이미 만든 것 — 유튜브 목록에 뜨기까지 시차가 있다(강의에서 겪었다). */
const justMade = new Set<string>();

interface Pick {
  book: Book;
  quoteIndex: number;
  quote: string;
  tag: string;
}

async function nextPick(): Promise<Pick | null> {
  const books = await loadBooks();
  const wantBook = env('BOOK_ID');
  const list = wantBook ? books.filter((b) => b.id === wantBook) : books;
  if (!list.length) throw new Error(`책을 못 찾았습니다 (BOOK_ID=${wantBook}).`);

  for (const book of list) {
    // 태그는 `book-<책id>-<문장번호>` 꼴이다. listPublishedOrders 는 `<앞부분>-<숫자>`
    // 에서 숫자를 모아 주므로 그대로 쓸 수 있다.
    const prefix = `book-${book.id}`;
    const done = await listPublishedOrders('', prefix);
    for (let i = 0; i < book.quotes.length; i++) {
      const tag = `${prefix}-${i + 1}`;
      if (done.has(i + 1) || justMade.has(tag)) continue;
      return { book, quoteIndex: i, quote: book.quotes[i], tag };
    }
  }
  return null;
}

export async function makeOne(): Promise<'ok' | 'stop'> {
  const pick = await nextPick();
  if (!pick) {
    console.log('· 만들 문장이 없습니다 — books.json 의 문장을 다 썼습니다.');
    return 'stop';
  }
  console.log(`▶ ${pick.book.title} — 문장 ${pick.quoteIndex + 1}/${pick.book.quotes.length}`);
  console.log(`  · "${pick.quote.slice(0, 60)}${pick.quote.length > 60 ? '…' : ''}"`);

  console.log('▶ [1/4] 대본 짜기');
  const { plan, template } = await planBookShort({ book: pick.book, quote: pick.quote });
  console.log(`  · 훅 틀 ${template.id}번: ${template.pattern.slice(0, 46)}…`);
  console.log(`  · 훅: ${plan.hook.replace(/\n/g, ' / ')}`);
  const scold = flagScolding([plan.hook, plan.title, plan.closer, ...plan.beats.map((b) => b.text)].join('\n'));
  if (scold.length) console.warn(`  ⚠ 훈계조로 읽힐 수 있는 말: ${scold.join(', ')}`);

  const accent = thumbVariant(pick.quoteIndex + 1).accent;
  await fs.mkdir(OUT_DIR, { recursive: true });
  const workDir = path.join(OUT_DIR, 'work');
  await fs.rm(workDir, { recursive: true, force: true });

  console.log('▶ [2/4] 배경 마련하기');
  // ★배경을 구하는 길을 셋 둔다★
  //  1) Pexels 세로 영상 — 가장 보기 좋다. 세로를 따로 달라고 해야 한다.
  //  2) 픽사베이·언스플래시까지 돌려 본다(fetchAsset 이 소스를 돌아가며 찾는다).
  //     가로만 걸리면 세로 틀에 맞춰 잘라 쓴다 — 어둡게 깔린 배경이라 가장자리가
  //     잘려도 티가 안 난다.
  //  3) 그래도 없으면 코드로 그린다. 공짜이고 회차마다 다르며, 무엇보다 글씨가 반드시
  //     읽힌다 — 밝기를 우리가 정하기 때문이다.
  // BACKDROP=code 로 두면 1·2 를 건너뛰고 처음부터 코드로 그린다.
  const mode = env('BACKDROP', 'auto').toLowerCase();
  const styleEnv = env('BACKDROP_STYLE') as BackdropStyle | '';
  const providers = availableProviders();
  console.log(`  · 방식 ${mode}${providers.length ? ` · 스톡 ${providers.join(', ')}` : ' · 스톡 키 없음'}`);

  const queries = [plan.hookQuery, ...plan.beats.map((b) => b.query), plan.hookQuery];
  const texts = [plan.hook, ...plan.beats.map((b) => b.text), plan.closer];
  const bgDir = path.join(OUT_DIR, 'bg');
  await fs.mkdir(bgDir, { recursive: true });

  const bgs: (string | undefined)[] = [];
  for (const [i, q] of queries.entries()) {
    const seed = pick.quoteIndex + i;
    if (mode !== 'code') {
      const portrait = await fetchStock(q, seed, 'portrait');
      if (portrait) {
        bgs.push(path.join(PUBLIC_DIR, portrait.relPath));
        console.log(`  · "${q}" → 세로 ${portrait.kind}`);
        continue;
      }
      const any = await fetchAsset(q, seed, true);
      if (any) {
        bgs.push(path.join(PUBLIC_DIR, any.relPath));
        console.log(`  · "${q}" → ${any.provider} ${any.kind}(가로, 잘라 씀)`);
        continue;
      }
      if (mode === 'stock') {
        console.log(`  · "${q}" — 못 찾음(검은 배경)`);
        bgs.push(undefined);
        continue;
      }
    }
    // ★판을 컷마다 돌린다★ 한 가지로 다 깔면 썸네일에서 겪은 일이 그대로 반복된다.
    const style: BackdropStyle = styleEnv && BACKDROP_STYLES.includes(styleEnv)
      ? styleEnv
      : BACKDROP_STYLES[(seed + i) % BACKDROP_STYLES.length];
    bgs.push(await drawBackdrop(style, texts[i] ?? q, accent, path.join(bgDir, `bg${i}.png`)));
    console.log(`  · "${q}" → 코드로 그림(${style})`);
  }

  const cuts: CutSpec[] = [
    { text: plan.hook, sec: 3.0, big: true, bgPath: bgs[0] },
    ...plan.beats.map((b, i) => ({ text: b.text, sec: b.sec, bgPath: bgs[i + 1] })),
    { text: plan.closer, sec: 2.6, bgPath: bgs[bgs.length - 1] },
  ];
  const total = cuts.reduce((a, c) => a + c.sec, 0);
  console.log(`  · 컷 ${cuts.length}개 · ${total.toFixed(1)}초`);

  console.log('▶ [3/4] 만들기');
  const bgmPath = path.join(OUT_DIR, 'bgm.wav');
  let bgm: string | undefined;
  try {
    generateBgm(bgmPath, bgmStyleFromEnv());
    bgm = bgmPath;
  } catch (e) {
    console.warn(`  · 음악 없이 갑니다: ${(e as Error).message}`);
  }
  const outPath = path.join(OUT_DIR, 'short.mp4');
  await renderBookShort({
    cuts,
    accent,
    badge: pick.book.title,
    bgmPath: bgm,
    workDir,
    outPath,
  });

  console.log('▶ [4/4] 업로드');
  if (env('DRY_RUN', 'true').toLowerCase() !== 'false') {
    console.log('\n예행 모드라 올리지 않았습니다. 만든 영상은 아티팩트로 받아 보십시오.');
    return 'stop';
  }
  const description = [
    plan.summary.trim(),
    '',
    `『${pick.book.title}』 — ${pick.book.author}`,
    pick.book.link ? pick.book.link : '',
    '#Shorts',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const videoId = await uploadVideo({
      videoPath: outPath,
      script: { title: plan.title.slice(0, 90), description, tags: [...plan.tags, 'Shorts', pick.tag] },
    });
    justMade.add(pick.tag);
    console.log(`\n✅ https://youtu.be/${videoId}`);
    // ★상품은 손으로 단다★ 데이터 API 에 상품 태그를 붙이는 길이 없다. 올려 놓고
    // 잊어버리면 파는 영상이 아니라 그냥 영상이 된다.
    console.log('\n──────── 남은 일(스튜디오에서) ────────');
    console.log(`스튜디오 → 콘텐츠 → 이 영상 → 수익 창출 → 쇼핑에서 『${pick.book.title}』 을 답니다.`);
    console.log('데이터 API 로는 상품을 달 수 없어 이 한 단계는 사람이 합니다.');
    return 'ok';
  } catch (e) {
    const msg = apiErrorDetail(e);
    if (/quota/i.test(msg)) {
      console.error('\n⏭ 오늘 업로드 한도를 다 썼습니다 — 여기서 멈춥니다.');
      console.error(`   ${msg.split('\n')[0]}`);
      return 'stop';
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const budget = Math.max(1, Number(env('BOOK_BUDGET', '1')));
  console.log(`▶ 책 쇼츠 ${budget}편 · 공개 범위 ${config.youtubePrivacyStatus}`);
  for (let i = 0; i < budget; i++) {
    if ((await makeOne()) === 'stop') break;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
