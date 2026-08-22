// AI 생성 클립 3편(다비드·자유의여신상·모아이) 을 CDSA 홍보 카드까지 붙여 쇼츠로 올린다.
//
// ★일회성 스크립트다★ 데일리 파이프라인(run.ts)과 달리 대본·씬 개념이 없는 완성 클립을
// 그대로 다룬다. run.ts 의 loadMeta() 는 ScriptSchema(최소 6씬)를 요구해서 이 용도에
// 맞지 않는다 — 그래서 uploadVideo() 를 직접 부른다.
//
//   npx tsx scripts/upload-shorts.mjs            # 3편 전부
//   ONLY=2,3 npx tsx scripts/upload-shorts.mjs    # 일부만
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { uploadVideo } from '../src/lib/youtube.js';
import { config } from '../src/config.js';

const W = 1080;
const FONT = "'Noto Sans CJK KR','Pretendard',sans-serif";
const WORK = path.join('out', 'shorts');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function outroPng(title, engine, outPath) {
  const svg = `
  <svg width="${W}" height="1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0d16"/><stop offset="55%" stop-color="#0d1220"/><stop offset="100%" stop-color="#0a0d16"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="1920" fill="url(#bg)"/>
    <text x="${W / 2}" y="740" text-anchor="middle" font-family="${FONT}" font-size="34" letter-spacing="6" fill="#d9a441">${esc(engine)}</text>
    <text x="${W / 2}" y="830" text-anchor="middle" font-family="${FONT}" font-size="66" font-weight="800" fill="#f2f6ff">${esc(title)}</text>
    <rect x="${W / 2 - 90}" y="900" width="180" height="3" fill="#d9a441"/>
    <text x="${W / 2}" y="1060" text-anchor="middle" font-family="${FONT}" font-size="88" font-weight="800" fill="#ffffff">CDSA.kr</text>
    <text x="${W / 2}" y="1150" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="700" fill="#e8e8ec">AX교육은 역시 CDSA와 함께</text>
    <text x="${W / 2}" y="1220" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#9aa3b5">네이버·구글에 "CDSA" 검색</text>
  </svg>`;
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(outPath);
}

async function labelPng(title, engine, outPath) {
  const svg = `
  <svg width="${W}" height="240" xmlns="http://www.w3.org/2000/svg">
    <rect x="40" y="40" width="620" height="120" rx="16" fill="rgba(7,13,26,0.55)" stroke="rgba(217,164,65,0.5)" stroke-width="2"/>
    <text x="70" y="90" font-family="${FONT}" font-size="26" letter-spacing="3" fill="#d9a441">${esc(engine)}</text>
    <text x="70" y="135" font-family="${FONT}" font-size="34" font-weight="800" fill="#ffffff">${esc(title)}</text>
  </svg>`;
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(outPath);
}

function ffmpeg(args) {
  execFileSync(ffmpegPath, args, { stdio: 'inherit' });
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** 원본 클립 + 상단 라벨 + CDSA 마무리 카드(3초)를 합쳐 out/shorts/<id>_final.mp4 를 만든다. */
async function build(item) {
  const p = (name) => path.join(WORK, `${item.id}_${name}`);
  await downloadTo(item.url, p('src.mp4'));
  await outroPng(item.titleKo, item.engineTag, p('outro.png'));
  await labelPng(item.titleKo, item.engineTag, p('label.png'));

  ffmpeg(['-y', '-loop', '1', '-i', p('outro.png'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '3',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-shortest', p('outro.mp4')]);

  ffmpeg(['-y', '-i', p('src.mp4'), '-i', p('label.png'), '-filter_complex',
    "[1:v]fade=in:st=0.3:d=0.4:alpha=1[lbl];[0:v][lbl]overlay=0:0:enable='between(t,0.3,14.6)'[v]",
    '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', p('labeled.mp4')]);

  const listPath = p('concat.txt');
  await fs.writeFile(listPath, `file '${path.resolve(p('labeled.mp4'))}'\nfile '${path.resolve(p('outro.mp4'))}'\n`);
  ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-movflags', '+faststart', p('final.mp4')]);

  return p('final.mp4');
}

function buildDescription(item) {
  // ★프롬프트를 그대로 공개한다★ 사용자 요청 — "이런 프롬프트로 AI가 만들었다"를
  // 그대로 보여주는 것 자체가 AX교육 채널의 콘텐츠다. uploadVideo() 가 이 뒤에
  // YOUTUBE_DESC_FOOTER(기본 "AX전환은 CDSA와 함께\nhttps://cdsa.kr")를 자동으로 붙인다.
  return [
    `AI(Seedance)로 만든 15초 영상입니다. 실제로 쓴 프롬프트를 그대로 공개합니다.`,
    '',
    '■ 프롬프트',
    item.prompt,
    '',
    'AX교육은 역시 CDSA와 함께 — 네이버·구글에 "CDSA" 검색',
  ].join('\n');
}

async function main() {
  await fs.mkdir(WORK, { recursive: true });
  const manifest = JSON.parse(await fs.readFile('scripts/shorts-manifest.json', 'utf8'));
  const only = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
  const items = only.length ? manifest.filter((m) => only.includes(m.id)) : manifest;
  if (!items.length) throw new Error('업로드할 항목이 없습니다(ONLY 필터 확인).');

  console.log(`▶ 쇼츠 ${items.length}편 처리 (채널: ${config.targetChannel}, 공개: ${config.youtubePrivacyStatus})`);

  for (const item of items) {
    console.log(`\n=== [${item.id}] ${item.titleKo} ===`);
    const videoPath = await build(item);
    console.log(`  · 합성 완료: ${videoPath} (${(((await fs.stat(videoPath)).size) / 1e6).toFixed(1)}MB)`);

    if (!config.doUpload) {
      console.log('  · DO_UPLOAD=false → 업로드 건너뜀');
      continue;
    }
    const videoId = await uploadVideo({
      videoPath,
      script: {
        title: item.youtubeTitle,
        description: buildDescription(item),
        tags: ['AI영상', 'AI숏폼', 'Seedance', 'CDSA', 'AX교육', 'Shorts'],
      },
    });
    console.log(`  · 업로드 완료: https://youtu.be/${videoId} (${config.youtubePrivacyStatus})`);
  }
  console.log('\n✅ 완료');
}

main().catch((e) => {
  console.error('\n❌ 실패:', e);
  process.exit(1);
});
