/**
 * 책 문장 쇼츠를 ffmpeg 로 만든다 — 컷마다 배경이 바뀌고 큰 글씨가 가운데 뜬다.
 *
 * ★참고한 형식★ 세로 화면에 스톡 영상을 깔고, 한 컷에 한 생각만 큰 글씨로 얹는다.
 * 낱말 하나만 색을 달리해 눈이 어디를 읽을지 알려 준다. 컷이 2~4초마다 바뀌어서 손가락이
 * 멈춘다. 참고한 것은 이 짜임새뿐이고 글과 그림은 전부 우리 것이다.
 *
 * ★컷을 따로 만들어 이어 붙인다★ 한 번의 필터 그래프로 대여섯 컷을 처리하려면 식이
 * 길어져 어디가 틀렸는지 알 수 없게 된다. 컷 하나씩 mp4 로 굽고 concat 으로 잇는다 —
 * 중간에 실패해도 어느 컷인지 바로 보이고, 한 컷만 다시 만들 수 있다.
 *
 * ★배경은 어둡게 깐다★ 스톡 영상은 밝기가 제각각이라, 흰 글씨를 그냥 얹으면 어떤 컷에서는
 * 사라진다. 전부 어둡게 덮고 그 위에 쓴다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { run, SHORT_W, SHORT_H } from './shortRender.js';

const FONT = "Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif";
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const widthUnits = (s: string) =>
  [...s].reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 1 : /[A-Za-z0-9%$+.,]/.test(ch) ? 0.56 : 0.4), 0);

export interface CutSpec {
  /** 화면에 뜨는 글. 줄바꿈으로 나누고 **강조** 를 쓸 수 있다. */
  text: string;
  sec: number;
  /** 배경 파일(mp4 또는 jpg/png). 없으면 검은 배경. */
  bgPath?: string;
  /** 첫 컷은 더 크게 — 손가락을 멈추는 자리다. */
  big?: boolean;
}

/** 한 컷의 글자판(투명 png). */
export function cutTextSvg(text: string, accent: string, big: boolean, badge = ''): string {
  const lines = text
    .split(/\s*\n\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const plain = (t: string) => t.replace(/\*\*/g, '');
  const maxW = 920;
  const cap = big ? 128 : 100;
  const size = Math.min(...lines.map((l) => Math.max(52, Math.min(cap, Math.floor(maxW / (widthUnits(plain(l)) || 1))))));
  const lineH = Math.round(size * 1.22);
  // 가운데 정렬. 글이 몇 줄이든 화면 한가운데에 덩어리로 앉게 한다.
  const top = Math.round(SHORT_H / 2 - ((lines.length - 1) * lineH) / 2);

  const body = lines
    .map((l, i) => {
      const spans = l
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map((p) =>
          p.startsWith('**')
            ? `<tspan fill="${accent}">${esc(p.slice(2, -2))}</tspan>`
            : `<tspan>${esc(p)}</tspan>`,
        )
        .join('');
      // 강조 경계의 띄어쓰기가 사라지지 않게 한다(썸네일에서 실제로 겪었다).
      return `<text xml:space="preserve" x="${SHORT_W / 2}" y="${top + i * lineH}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="900" letter-spacing="-2" fill="#ffffff" stroke="#05070d" stroke-width="${Math.round(size * 0.09)}" paint-order="stroke" stroke-linejoin="round">${spans}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHORT_W}" height="${SHORT_H}">
${
    // ★배지도 테두리를 두른다★ 밝은 배경 컷에서는 가는 글씨가 그대로 묻힌다.
    badge
      ? `<text x="${SHORT_W / 2}" y="${top - lineH - 64}" text-anchor="middle" font-family="${FONT}" font-size="46" font-weight="900" fill="${accent}" stroke="#05070d" stroke-width="7" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${esc(badge)}</text>`
      : ''
  }
${body}
</svg>`;
}

export interface BookShortRenderOpts {
  cuts: CutSpec[];
  accent: string;
  /** 첫 컷 위에 작게 올릴 말 — 보통 책 제목. */
  badge?: string;
  /** 배경 음악(없으면 무음). */
  bgmPath?: string;
  workDir: string;
  outPath: string;
}

export async function renderBookShort(opts: BookShortRenderOpts): Promise<void> {
  const bin = ffmpegPath;
  if (!bin) throw new Error('ffmpeg 를 찾지 못했습니다.');
  await fs.mkdir(opts.workDir, { recursive: true });

  const parts: string[] = [];
  for (const [i, cut] of opts.cuts.entries()) {
    const sec = Math.max(1.2, Math.min(8, cut.sec));
    const textPng = path.join(opts.workDir, `t${i}.png`);
    await sharp(Buffer.from(cutTextSvg(cut.text, opts.accent, !!cut.big, i === 0 ? opts.badge ?? '' : '')))
      .png()
      .toFile(textPng);

    const out = path.join(opts.workDir, `cut${i}.mp4`);
    const isVideo = !!cut.bgPath && /\.(mp4|mov|m4v|webm)$/i.test(cut.bgPath);

    // 배경: 세로 틀을 꽉 채우도록 잘라 넣고(cover), 어둡게 덮는다.
    const bgChain =
      `scale=${SHORT_W}:${SHORT_H}:force_original_aspect_ratio=increase,` +
      `crop=${SHORT_W}:${SHORT_H},` +
      // 사진은 가만히 있으면 정지 화면으로 보인다 — 아주 느리게 확대해 숨을 넣는다.
      (isVideo ? '' : `zoompan=z='min(zoom+0.0008,1.12)':d=${Math.round(sec * 30)}:s=${SHORT_W}x${SHORT_H}:fps=30,`) +
      `eq=brightness=-0.16:saturation=0.9,setsar=1,fps=30`;

    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    if (cut.bgPath) {
      if (isVideo) args.push('-stream_loop', '-1', '-t', String(sec), '-i', path.resolve(cut.bgPath));
      else args.push('-loop', '1', '-t', String(sec), '-i', path.resolve(cut.bgPath));
    } else {
      args.push('-f', 'lavfi', '-t', String(sec), '-i', `color=c=#05070d:s=${SHORT_W}x${SHORT_H}:r=30`);
    }
    args.push('-i', textPng);
    args.push(
      '-filter_complex',
      `[0:v]${bgChain}[bg];[bg][1:v]overlay=0:0:format=auto[v]`,
      '-map', '[v]',
      '-an',
      '-t', String(sec),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      out,
    );
    await run(bin, args, opts.workDir);
    parts.push(out);
  }

  // ★concat 목록은 파일로 준다★ 컷 수가 늘면 명령줄이 길어지고, 경로에 특수문자가 있으면
  // 필터 문법으로 읽혀 깨진다.
  const listPath = path.join(opts.workDir, 'parts.txt');
  await fs.writeFile(listPath, parts.map((p) => `file '${path.basename(p)}'`).join('\n') + '\n', 'utf8');

  const total = opts.cuts.reduce((a, c) => a + Math.max(1.2, Math.min(8, c.sec)), 0);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'parts.txt'];
  if (opts.bgmPath) {
    args.push('-stream_loop', '-1', '-i', path.resolve(opts.bgmPath));
    // 끝에서 1.2초 동안 음악을 줄인다 — 뚝 끊기면 다 본 느낌이 안 난다.
    args.push('-filter_complex', `[1:a]volume=0.28,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[a]`);
    args.push('-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-shortest');
  } else {
    args.push('-map', '0:v', '-an');
  }
  args.push('-c:v', 'copy', '-movflags', '+faststart', path.resolve(opts.outPath));
  await run(bin, args, opts.workDir);
}
