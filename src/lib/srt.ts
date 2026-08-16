/**
 * SRT 자막 파싱 — 강의 영상 업로드용.
 *
 * 왜 필요한가: 직접 만든 강의 영상에는 대본(script.json)이 없다. 대신 자막이 있고,
 * 자막에는 강의 내용 전체와 시간이 들어 있다. 이것이 제목·설명·챕터를 만드는 재료다.
 * 음성인식(STT)을 새로 붙일 필요가 없다 — 이미 사람이 만들어 둔 정확한 텍스트가 있다.
 */

export interface SrtCue {
  /** 시작 시각(초) */
  start: number;
  /** 끝 시각(초) */
  end: number;
  text: string;
}

export interface ParsedSrt {
  cues: SrtCue[];
  /** 자막 전체를 이어 붙인 글. 대사에 줄바꿈이 있어도 한 문단으로 합친다. */
  transcript: string;
  /** 마지막 자막이 끝나는 시각(초) — 영상 길이의 근사값이다. */
  durationSec: number;
}

/** "00:01:02,345" → 62.345 */
function toSeconds(stamp: string): number {
  const m = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(stamp.trim());
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

/** 초 → "1:02:03" 또는 "12:34" (유튜브 챕터 표기) */
export function stampFromSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(ss)}` : `${m}:${two(ss)}`;
}

/**
 * SRT 문자열을 파싱한다.
 *
 * ★BOM 을 반드시 걷어낸다★ 윈도우에서 만든 자막은 파일 맨 앞에 U+FEFF 가 붙는 경우가
 * 흔한데(실제로 이 강의 자막이 그랬다), 그러면 첫 블록의 번호가 "﻿1" 이 되어
 * 정규식이 안 맞고 첫 자막이 통째로 사라진다. 줄바꿈도 CRLF 를 함께 받는다.
 */
export function parseSrt(raw: string): ParsedSrt {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    // 번호 줄은 있을 수도 없을 수도 있다 — 시간 줄을 직접 찾는다.
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const start = toSeconds(a);
    const end = toSeconds(b);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const body = lines
      .slice(timeIdx + 1)
      .join(' ')
      // 자막 서식 태그(<i>, {\an8} 등)는 읽을 글에 방해만 된다.
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body) cues.push({ start, end, text: body });
  }

  return {
    cues,
    transcript: cues.map((c) => c.text).join(' '),
    durationSec: cues.length ? cues[cues.length - 1].end : 0,
  };
}

/**
 * 자막을 시간 구간으로 묶어 "몇 분에 무슨 이야기를 하는지" 형태로 만든다.
 * 대본 전체를 그대로 모델에 넘기면 챕터 시각을 지어내기 쉬운데, 이렇게 시각을 붙여 주면
 * 있는 시각 중에서 고르게 된다.
 */
export function timedOutline(parsed: ParsedSrt, bucketSec = 60): string {
  const out: string[] = [];
  let bucketStart = 0;
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    out.push(`[${stampFromSeconds(bucketStart)}] ${buf.join(' ')}`);
    buf = [];
  };
  for (const c of parsed.cues) {
    if (c.start >= bucketStart + bucketSec) {
      flush();
      bucketStart = Math.floor(c.start / bucketSec) * bucketSec;
    }
    buf.push(c.text);
  }
  flush();
  return out.join('\n');
}
