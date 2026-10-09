// 완성된 세로 클립을 CDSA 홍보 카드까지 붙여 쇼츠로 올린다.
// 처음엔 AI 생성 클립 3편(다비드·자유의여신상·모아이) 용이었고, 지금은 모션차트 쇼츠도 같은 길로 간다.
//
// ★일회성 스크립트다★ 데일리 파이프라인(run.ts)과 달리 대본·씬 개념이 없는 완성 클립을
// 그대로 다룬다. run.ts 의 loadMeta() 는 ScriptSchema(최소 6씬)를 요구해서 이 용도에
// 맞지 않는다 — 그래서 uploadVideo() 를 직접 부른다.
//
//   npx tsx scripts/upload-shorts.mjs            # 3편 전부
//   ONLY=2,3 npx tsx scripts/upload-shorts.mjs    # 일부만
//   MANIFEST=scripts/chart-shorts-manifest.json npx tsx scripts/upload-shorts.mjs   # 모션차트 쇼츠
//
// 항목 필드: url(내려받기) 또는 file(저장소 안 경로), label(false 면 상단 라벨 생략 — 제목이 화면에
// 이미 박혀 있는 차트용), fps(기본 24), bgm(소리 없는 클립에 깔 비트: {bpm,key,hits}),
// description·tags(없으면 프롬프트 공개형 설명).
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { uploadVideo } from '../src/lib/youtube.js';
import { makeTrack } from '../shorts-charts/music.mjs';
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

function hasAudio(file) {
  try {
    execFileSync(ffmpegPath, ['-v', 'error', '-i', file, '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function durationOf(file) {
  // ffprobe 가 없을 수도 있어 ffmpeg 의 stderr 에서 Duration 을 읽는다.
  let err = '';
  try {
    execFileSync(ffmpegPath, ['-i', file], { stdio: 'pipe' });
  } catch (e) {
    err = String(e.stderr || '');
  }
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`길이를 읽지 못함: ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** 원본 클립 + 상단 라벨 + CDSA 마무리 카드(3초)를 합쳐 out/shorts/<id>_final.mp4 를 만든다. */
async function build(item) {
  const p = (name) => path.join(WORK, `${item.id}_${name}`);
  const fps = String(item.fps || 24);
  if (item.file) await fs.copyFile(item.file, p('src.mp4'));
  else await downloadTo(item.url, p('src.mp4'));
  await outroPng(item.titleKo, item.engineTag, p('outro.png'));

  // 소리 없는 클립(모션차트 등)은 합성 비트를 깐다 — 무음 쇼츠는 첫 1초에 넘겨진다.
  let src = p('src.mp4');
  if (!hasAudio(src)) {
    const dur = durationOf(src);
    makeTrack(p('bgm.wav'), dur, item.bgm || {});
    ffmpeg(['-y', '-i', src, '-i', p('bgm.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', p('withbgm.mp4')]);
    src = p('withbgm.mp4');
  }

  ffmpeg(['-y', '-loop', '1', '-i', p('outro.png'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '3',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', fps, '-c:a', 'aac', '-ar', '44100', '-shortest', p('outro.mp4')]);

  if (item.label === false) {
    ffmpeg(['-y', '-i', src, '-map', '0:v', '-map', '0:a', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', fps, '-c:a', 'aac', '-ar', '44100', p('labeled.mp4')]);
  } else {
    await labelPng(item.titleKo, item.engineTag, p('label.png'));
    ffmpeg(['-y', '-i', src, '-i', p('label.png'), '-filter_complex',
      "[1:v]fade=in:st=0.3:d=0.4:alpha=1[lbl];[0:v][lbl]overlay=0:0:enable='between(t,0.3,14.6)'[v]",
      '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', fps, '-c:a', 'aac', '-ar', '44100', p('labeled.mp4')]);
  }

  const listPath = p('concat.txt');
  await fs.writeFile(listPath, `file '${path.resolve(p('labeled.mp4'))}'\nfile '${path.resolve(p('outro.mp4'))}'\n`);
  ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', fps, '-c:a', 'aac', '-movflags', '+faststart', p('final.mp4')]);

  return p('final.mp4');
}

function buildDescription(item) {
  if (item.description) return item.description;
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
  const manifestPath = process.env.MANIFEST || 'scripts/shorts-manifest.json';
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
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
        tags: item.tags || ['AI영상', 'AI숏폼', 'Seedance', 'CDSA', 'AX교육', 'Shorts'],
      },
    });
    console.log(`  · 업로드 완료: https://youtu.be/${videoId} (${config.youtubePrivacyStatus})`);
    // 같은 실행에서 여러 편을 올리면 결과를 한곳에 남겨 Actions 요약에서 바로 보이게 한다.
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `- [${item.id}] ${item.youtubeTitle} → https://youtu.be/${videoId}\n`);
    }
  }
  console.log('\n✅ 완료');
}

main().catch((e) => {
  console.error('\n❌ 실패:', e);
  process.exit(1);
});
