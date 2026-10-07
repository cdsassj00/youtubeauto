/**
 * 가로 강의 영상의 한 토막을 세로 쇼츠로 만든다. ffmpeg 만 쓴다 — 렌더 비용이 없다.
 *
 * ★가운데를 잘라 쓰면 안 된다★ 1920x1080 에서 9:16 을 가운데로 뽑으면 폭이 607px 이라
 * 화면의 3분의 1만 남는다. 강의 화면은 글자가 있어서 그렇게 자르면 읽을 수가 없다.
 * 위아래로 쌓는다 — 위에 훅과 자막, 가운데에 강의 화면 전체, 아래에 마무리.
 *
 * ★첫 1초가 전부다★ 훅은 영상이 시작하자마자 떠 있어야 한다. 페이드인으로 0.5초를
 * 쓰면 그 사이에 넘어간다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { parseSrt, type SrtCue } from './srt.js';

export const SHORT_W = 1080;
export const SHORT_H = 1920;
// 강의 화면이 앉는 자리 — 폭을 꽉 채우고 16:9 비율을 지킨다.
const STAGE_H = Math.round((SHORT_W * 9) / 16); // 607
const STAGE_Y = 560;

const FONT = "Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif";
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const widthUnits = (s: string) =>
  [...s].reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 1 : /[A-Za-z0-9%$+.,]/.test(ch) ? 0.56 : 0.4), 0);

export function run(bin: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], cwd });
    let err = '';
    p.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(bin)} 실패 (${code})\n${err.slice(-1600)}`)),
    );
  });
}

/** 훅 카드 — 영상 맨 위에 늘 떠 있는 두 줄. */
export function hookCardSvg(hook: string, accent: string, outro: string, strip: string): string {
  const lines = hook
    .split(/\s*\n\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const plain = (t: string) => t.replace(/\*\*/g, '');
  const size = Math.min(
    ...lines.map((l) => Math.max(54, Math.min(96, Math.floor(980 / (widthUnits(plain(l)) || 1))))),
  );
  const lineH = Math.round(size * 1.2);
  const top = 190;

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
      return `<text xml:space="preserve" x="54" y="${top + i * lineH}" font-family="${FONT}" font-size="${size}" font-weight="900" letter-spacing="-2" fill="#ffffff" stroke="#05070d" stroke-width="${Math.round(size * 0.1)}" paint-order="stroke" stroke-linejoin="round">${spans}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHORT_W}" height="${SHORT_H}">
<rect x="0" y="0" width="${SHORT_W}" height="${SHORT_H}" fill="#05070d"/>
<rect x="0" y="0" width="${SHORT_W}" height="10" fill="${accent}"/>
<text x="54" y="104" font-family="${FONT}" font-size="34" font-weight="bold" fill="${accent}" letter-spacing="2">${esc(strip)}</text>
${body}
<text x="54" y="${SHORT_H - 96}" font-family="${FONT}" font-size="40" font-weight="bold" fill="#aeb8c8">${esc(outro)}</text>
</svg>`;
}

/**
 * 자막을 ASS 로 만든다.
 *
 * ★SRT 가 아니라 ASS 로 굽는다★ SRT 를 그대로 태우면 ffmpeg 의 기본 스타일(작은 흰 글씨,
 * 아래 끝)로 나온다. 쇼츠는 손에 들고 보는 화면이라 그 크기로는 안 읽힌다. 자리와 크기를
 * 직접 정해야 해서 ASS 를 쓴다.
 */
export function buildAss(cues: SrtCue[], offset: number, accent: string): string {
  const stamp = (t: number) => {
    const s = Math.max(0, t);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = (s % 60).toFixed(2).padStart(5, '0');
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  };
  const bgr = (hex: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? `&H00${m[3]}${m[2]}${m[1]}`.toUpperCase() : '&H0000D4FF';
  };
  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${SHORT_W}`,
    `PlayResY: ${SHORT_H}`,
    // ★0 이 아니면 긴 자막이 안 접힌다★ 2 는 수동 줄바꿈(\\N)만 받아서, 한 줄짜리 긴
    // 대사가 화면 밖으로 삐져나가 양끝 글자가 잘린다(실제로 그렇게 나왔다).
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Alignment 8 = 위 가운데. 강의 화면 아래에 두면 화면 안의 자막과 겹친다.
    `Style: Cap,Noto Sans CJK KR,58,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,8,60,60,${STAGE_Y + STAGE_H + 60},1`,
    `Style: CapHi,Noto Sans CJK KR,58,${bgr(accent)},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,8,60,60,${STAGE_Y + STAGE_H + 60},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const body = cues.map((c) => {
    const t = c.text.replace(/\s*\n\s*/g, ' ').replace(/\{|\}/g, '').trim();
    return `Dialogue: 0,${stamp(c.start - offset)},${stamp(c.end - offset)},Cap,,0,0,0,,${t}`;
  });
  return [...head, ...body].join('\n') + '\n';
}

export interface ShortRenderOpts {
  sourceVideo: string;
  srt: string;
  startSec: number;
  endSec: number;
  hook: string;
  outro: string;
  strip: string;
  accent: string;
  workDir: string;
  outPath: string;
}

export async function renderShort(opts: ShortRenderOpts): Promise<void> {
  const bin = ffmpegPath;
  if (!bin) throw new Error('ffmpeg 를 찾지 못했습니다.');
  await fs.mkdir(opts.workDir, { recursive: true });

  const dur = Math.max(3, opts.endSec - opts.startSec);

  // 1) 배경판(훅 + 마무리 줄)을 png 로 굽는다.
  const cardPath = path.join(opts.workDir, 'card.png');
  await sharp(Buffer.from(hookCardSvg(opts.hook, opts.accent, opts.outro, opts.strip)))
    .png()
    .toFile(cardPath);

  // 2) 자막은 자른 구간에 걸치는 것만, 시작을 0 으로 당겨 쓴다.
  const parsed = parseSrt(opts.srt);
  const cues = parsed.cues.filter((c) => c.end > opts.startSec && c.start < opts.endSec);
  const assPath = path.join(opts.workDir, 'cap.ass');
  await fs.writeFile(assPath, buildAss(cues, opts.startSec, opts.accent), 'utf8');

  // ★필터 안에서 경로를 그대로 쓰면 깨진다★ ass= 뒤의 콜론과 역슬래시는 필터 문법으로
  // 읽힌다. 작업 폴더에서 파일 이름만 넘기는 쪽이 어느 운영체제에서나 안전하다.
  const assName = path.basename(assPath);

  const filter = [
    `[1:v]scale=${SHORT_W}:${STAGE_H}:force_original_aspect_ratio=decrease,pad=${SHORT_W}:${STAGE_H}:(ow-iw)/2:(oh-ih)/2:color=#05070d[stage]`,
    `[0:v][stage]overlay=0:${STAGE_Y}[v0]`,
    `[v0]ass=${assName}[v]`,
  ].join(';');

  await run(bin, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-loop', '1', '-framerate', '30', '-t', String(dur), '-i', cardPath,
    '-ss', String(opts.startSec), '-t', String(dur), '-i', path.resolve(opts.sourceVideo),
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '1:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-r', '30',
    '-movflags', '+faststart',
    path.resolve(opts.outPath),
  ], opts.workDir);
}
