/**
 * 컷아웃 판화 견본 — VOX 스타일 엔진을 만들기 전에 "그림이 쓸 만한가"부터 확인한다.
 *
 * 엔진 전체(종이 배경·타자기·영사기 전환·순차 등장)를 다 만들어놓고 그림이 안 나오면
 * 전부 헛일이다. 그래서 가장 불확실한 것 하나를 먼저 싸게 확인한다.
 *
 * 결과: out/cutout/{이름}.png (투명 배경) + contact-sheet.png (종이 위에 얹은 비교표)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { config, OUT_DIR } from '../src/config.js';
import { generateImage } from '../src/lib/imagegen.js';
import { makeCutout, engravingPrompt } from '../src/lib/cutout.js';
import { printUsage } from '../src/lib/usage.js';

const OUT = path.join(OUT_DIR, 'cutout');

/**
 * 이 채널이 실제로 다루는 소재로 고른다 — 데이터센터·반도체·공장·사람.
 * 기계뿐 아니라 인물도 넣어야 "사람이 나오는 장면"이 되는지 확인할 수 있다.
 */
const SUBJECTS: { id: string; subject: string }[] = [
  { id: 'datacenter', subject: 'a row of tall server racks in a data center hall' },
  { id: 'wafer', subject: 'a semiconductor wafer being held with tweezers' },
  { id: 'factory', subject: 'a large industrial factory building with smokestacks' },
  { id: 'engineer', subject: 'an engineer sitting at a desk working at a computer terminal' },
  { id: 'robotarm', subject: 'an industrial robotic arm on an assembly line' },
  { id: 'ship', subject: 'a cargo ship loaded with shipping containers at a dock' },
];

async function main() {
  const only = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = only.length ? SUBJECTS.filter((s) => only.includes(s.id)) : SUBJECTS;

  const provider = config.imageProvider === 'gemini' ? 'gemini' : 'openai';
  if (provider === 'gemini' && !config.geminiApiKey) {
    console.error('IMAGE_PROVIDER=gemini 인데 GEMINI_API_KEY 가 비어 있습니다.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`컷아웃 판화 ${list.length}장 — provider=${provider}\n`);

  const made: { id: string; file: string }[] = [];
  for (const s of list) {
    const t0 = Date.now();
    try {
      const raw = await generateImage({ prompt: engravingPrompt(s.subject), step: 'cutout-sheet', provider });
      // 원본도 남긴다 — 컷아웃이 이상할 때 "그림이 문제인지 키잉이 문제인지" 구분해야 한다.
      fs.writeFileSync(path.join(OUT, `${s.id}-raw.png`), raw);
      const cut = await makeCutout(raw, { width: 900, border: 16, shadow: 0.3 });
      const file = path.join(OUT, `${s.id}.png`);
      fs.writeFileSync(file, cut);
      made.push({ id: s.id, file });
      console.log(`  ✓ ${s.id.padEnd(11)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.log(`  ✗ ${s.id.padEnd(11)} 실패: ${(e as Error).message}`);
    }
  }

  if (made.length) await contactSheet(made);
  console.log(`\n성공 ${made.length}/${list.length} → ${OUT}`);
  printUsage();
  if (!made.length) process.exit(1);
}

/** 종이 배경 위에 얹어 실제로 영상에서 보일 모습으로 비교표를 만든다. */
async function contactSheet(made: { id: string; file: string }[]) {
  const W = 640, H = 400, COLS = 2, PAD = 14;
  const rows = Math.ceil(made.length / COLS);
  const sheetW = COLS * W + (COLS + 1) * PAD;
  const sheetH = rows * H + (rows + 1) * PAD;

  const layers: OverlayOptions[] = [];
  for (let i = 0; i < made.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const left = PAD + col * (W + PAD);
    const top = PAD + row * (H + PAD);
    // 칸마다 종이색을 번갈아 — 겨자색/모눈종이 어느 쪽에서 잘 붙는지 같이 본다.
    const bg = i % 2 === 0 ? '#d9cfa8' : '#eeeae0';
    const cell = await sharp({ create: { width: W, height: H, channels: 3, background: bg } })
      .composite([{ input: await sharp(made[i].file).resize(W - 60, H - 60, { fit: 'inside' }).toBuffer(), gravity: 'center' }])
      .png()
      .toBuffer();
    layers.push({ input: cell, left, top });
  }

  const out = path.join(OUT, 'contact-sheet.png');
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#1a1a1a' } })
    .composite(layers)
    .png()
    .toFile(out);
  console.log(`\n  비교표: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
