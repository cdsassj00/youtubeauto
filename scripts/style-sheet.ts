/**
 * 화풍 견본 시트 — 같은 소재를 화풍마다 한 장씩 그려서 나란히 비교한다.
 *
 * 만든 이유 두 가지:
 *  1) 영상 한 편은 $1.5 넘게 든다. 마음에 안 드는 화풍으로 뽑고 나서 후회하는 것보다,
 *     견본 몇 장(장당 $0.067)을 먼저 보고 고르는 편이 훨씬 싸다.
 *  2) Gemini 연동 점검. GEMINI_API_KEY 배선과 실제 API 응답 형태를 실제 호출로 확인한다
 *     (타입 정의만 보고 만든 코드라 첫 실사용 확인이 필요하다).
 *
 * 사용:
 *   tsx scripts/style-sheet.ts                 # 모든 화풍 1장씩
 *   tsx scripts/style-sheet.ts comic,clay      # 지정한 화풍만
 * 결과: out/styles/{화풍id}.png + out/styles/contact-sheet.png (한 장에 모아 붙인 비교표)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { config, OUT_DIR } from '../src/config.js';
import { ART_STYLES, buildIllustrationPrompt, type ArtStyle } from '../src/lib/artStyle.js';
import { generateImage } from '../src/lib/imagegen.js';
import { printUsage } from '../src/lib/usage.js';

const OUT = path.join(OUT_DIR, 'styles');

// 화풍 차이가 잘 드러나도록 사람·기계·화면이 모두 들어간 소재를 고정으로 쓴다.
// (소재가 화풍마다 다르면 비교가 안 된다.)
const SUBJECT =
  'a person sitting at a desk looking at a computer monitor, with a server rack standing beside the desk';

async function main() {
  const only = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const styles: ArtStyle[] = only.length ? ART_STYLES.filter((s) => only.includes(s.id)) : ART_STYLES;

  if (!styles.length) {
    console.error(`화풍을 찾지 못했습니다. 고를 수 있는 값: ${ART_STYLES.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  const provider = config.imageProvider === 'gemini' ? 'gemini' : 'openai';
  // 키가 없으면 여기서 분명하게 실패시킨다 — 조용히 건너뛰면 "왜 안 나오지"로 시간을 버린다.
  if (provider === 'gemini' && !config.geminiApiKey) {
    console.error('IMAGE_PROVIDER=gemini 인데 GEMINI_API_KEY 가 비어 있습니다.');
    console.error('GitHub → Settings → Secrets and variables → Actions → Secrets 에 GEMINI_API_KEY 를 넣으세요.');
    process.exit(1);
  }
  if (provider === 'openai' && !config.openaiApiKey) {
    console.error('OPENAI_API_KEY 가 비어 있습니다.');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  console.log(`화풍 견본 ${styles.length}종 생성 — provider=${provider}, model=${provider === 'gemini' ? config.geminiImageModel : config.openaiIllustrationModel}`);
  console.log(`소재: ${SUBJECT}\n`);

  const made: { style: ArtStyle; file: string }[] = [];
  const failed: { id: string; why: string }[] = [];

  for (const style of styles) {
    const t0 = Date.now();
    try {
      const buf = await generateImage({
        prompt: buildIllustrationPrompt(style, SUBJECT, true), // 영상 테마와 같은 dark 기준
        step: 'style-sheet',
        provider,
      });
      const file = path.join(OUT, `${style.id}.png`);
      await sharp(buf).resize(1280, 720, { fit: 'cover', position: 'centre' }).png().toFile(file);
      made.push({ style, file });
      console.log(`  ✓ ${style.id.padEnd(11)} ${style.label}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      const why = (e as Error).message;
      failed.push({ id: style.id, why });
      console.log(`  ✗ ${style.id.padEnd(11)} 실패: ${why}`);
    }
  }

  if (made.length > 1) await buildContactSheet(made);

  console.log(`\n성공 ${made.length}장 / 실패 ${failed.length}장 → ${OUT}`);
  if (failed.length) {
    console.log('실패한 화풍:');
    for (const f of failed) console.log(`  - ${f.id}: ${f.why}`);
  }
  printUsage();

  // 전부 실패했으면 배선 문제다 — 워크플로가 성공으로 끝나면 안 된다.
  if (!made.length) process.exit(1);
}

/** 견본을 한 장으로 모아 붙인다 — 파일을 하나씩 열어보는 것보다 비교가 쉽다. */
async function buildContactSheet(made: { style: ArtStyle; file: string }[]) {
  const W = 640, H = 360, COLS = 2, PAD = 8, LABEL = 34;
  const rows = Math.ceil(made.length / COLS);
  const sheetW = COLS * W + (COLS + 1) * PAD;
  const sheetH = rows * (H + LABEL) + (rows + 1) * PAD;

  const layers: OverlayOptions[] = [];
  for (let i = 0; i < made.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const left = PAD + col * (W + PAD);
    const top = PAD + row * (H + LABEL + PAD);
    layers.push({
      input: await sharp(made[i].file).resize(W, H, { fit: 'cover' }).png().toBuffer(),
      left,
      top,
    });
    // 라벨은 SVG 텍스트로 그린다(이미지 안에 글자를 넣는 게 아니라 시트 위에 얹는 것이라 안전).
    const label = `${made[i].style.label} (${made[i].style.id})`;
    layers.push({
      input: Buffer.from(
        `<svg width="${W}" height="${LABEL}"><text x="4" y="24" font-family="sans-serif" font-size="20" fill="#e6e6e6">${escapeXml(label)}</text></svg>`,
      ),
      left,
      top: top + H,
    });
  }

  const outFile = path.join(OUT, 'contact-sheet.png');
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#15161a' } })
    .composite(layers)
    .png()
    .toFile(outFile);
  console.log(`\n  비교표: ${outFile}`);
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
