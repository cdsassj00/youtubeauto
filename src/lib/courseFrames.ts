/**
 * 강의 영상에서 썸네일 배경으로 쓸 "화면" 한 장을 고른다.
 *
 * ★왜 실제 화면인가★ 같은 분야에서 잘 되는 채널들(조코딩·노마드코더·코딩애플)은 썸네일에
 * 클립아트를 쓰지 않는다. 실제 앱 화면, 실제 파일 아이콘, 실제 코드가 그림의 주인공이다.
 * 자물쇠·로켓·퍼즐 아이콘은 "무엇을 배우는 영상인지"를 하나도 알려주지 못한다 — 보안
 * 영상이든 배포 영상이든 자물쇠를 그릴 수 있기 때문이다. 반면 엑셀 시트가 깔려 있으면
 * 0.5초에 "엑셀 다루는 영상"이 전달된다.
 *
 * ★고르는 것이 어렵다★ 강의 영상 대부분은 말하는 사람 얼굴이거나 표지 슬라이드다.
 * 아무 프레임이나 뽑으면 흰 슬라이드 한 장이 나온다. 그래서 여러 장을 뽑아 놓고
 * "화면다움"을 점수로 매긴다 — 글자와 선이 많고(경계 밀도), 한 색으로 덮여 있지 않고,
 * 너무 어둡거나 밝지 않은 것.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

export interface FrameCandidate {
  file: string;
  atSec: number;
  score: number;
  /** 점수를 어떻게 받았는지 — 왜 이 장면이 뽑혔는지 로그로 남긴다. */
  detail: string;
}

/**
 * 영상 길이(초). ffprobe 없이 ffmpeg 헤더만 읽는다.
 *
 * ★출력을 안 주면 ffmpeg 는 헤더만 찍고 바로 끝난다★ 처음에 `-f null -` 을 붙였더니
 * 영상 전체를 디코딩했고(100MB 짜리에 수십 초), 게다가 성공으로 끝나 catch 가 안 돌아
 * 길이를 못 읽었다. 출력 파일을 안 주면 ffmpeg 는 "출력이 없다"며 1 로 끝내는데,
 * 그 전에 Duration 을 이미 stderr 에 찍어 놓는다. 성공·실패 양쪽에서 다 읽는다.
 */
async function durationSec(video: string): Promise<number> {
  if (!ffmpegPath) throw new Error('ffmpeg-static 을 찾지 못했습니다.');
  let err = '';
  try {
    const r = await run(ffmpegPath, ['-hide_banner', '-i', video]);
    err = r.stderr;
  } catch (e) {
    err = String((e as { stderr?: string }).stderr ?? '');
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(err);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/**
 * "화면다움" 점수.
 *
 * ★한 장의 밝기만 봐서는 못 고른다★ 처음엔 밝기 분산만 봤는데, 강사 얼굴이 배경과
 * 대비가 커서 1등으로 뽑혔다. 화면(코드·표·UI)의 특징은 밝기가 아니라 **잔 경계가 많다는
 * 것**이다 — 글자 획과 표 선이 픽셀 단위로 밝기를 계속 뒤집는다. 그래서 가로·세로
 * 이웃 픽셀 차이의 평균을 쓴다.
 */
async function scoreFrame(file: string): Promise<{ score: number; detail: string }> {
  // 작게 줄여서 본다 — 원본 해상도로 재면 노이즈까지 경계로 세어 버린다.
  const W = 160;
  const H = 90;
  const { data } = await sharp(file).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });

  let edge = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W; x++) edge += Math.abs(data[y * W + x] - data[y * W + x - 1]);
  }
  for (let y = 1; y < H; y++) {
    for (let x = 0; x < W; x++) edge += Math.abs(data[y * W + x] - data[(y - 1) * W + x]);
  }
  const edgeAvg = edge / (W * H * 2);

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;

  // 한 색으로 덮인 화면(표지 슬라이드·암전)은 경계가 거의 없다.
  // 너무 어둡거나(암전) 너무 밝은(흰 슬라이드) 것도 배경으로 쓰면 글자가 안 읽힌다.
  let score = edgeAvg;
  const notes = [`경계 ${edgeAvg.toFixed(1)}`, `밝기 ${mean.toFixed(0)}`];
  if (mean < 24) {
    score *= 0.2;
    notes.push('너무 어두움');
  }
  if (mean > 232) {
    score *= 0.35;
    notes.push('너무 밝음(흰 슬라이드)');
  }
  return { score, detail: notes.join(' · ') };
}

/**
 * 영상에서 후보 프레임을 뽑고 점수를 매겨 좋은 순으로 돌려준다.
 *
 * ★앞뒤는 버린다★ 도입부는 표지·인사, 끝부분은 정리·인사라 화면이 없다. 가운데
 * 15~88% 구간에서만 고른다.
 */
export async function pickFrames(video: string, outDir: string, count = 10): Promise<FrameCandidate[]> {
  if (!ffmpegPath) throw new Error('ffmpeg-static 을 찾지 못했습니다.');
  await fs.mkdir(outDir, { recursive: true });
  const dur = await durationSec(video);
  if (!dur) throw new Error('영상 길이를 읽지 못했습니다.');

  const from = dur * 0.15;
  const to = dur * 0.88;
  const step = (to - from) / Math.max(1, count - 1);

  const out: FrameCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const at = from + step * i;
    const file = path.join(outDir, `frame${String(i).padStart(2, '0')}.png`);
    // -ss 를 -i 앞에 두면 키프레임 단위로 건너뛰어 훨씬 빠르다(정확도는 이 용도에 충분).
    await run(ffmpegPath, ['-y', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '2', file]);
    const { score, detail } = await scoreFrame(file);
    out.push({ file, atSec: at, score, detail });
  }
  return out.sort((a, b) => b.score - a.score);
}
