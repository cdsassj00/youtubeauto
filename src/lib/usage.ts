import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from '../config.js';

/**
 * 사용량 장부 — 한 번의 실행에서 무엇을 얼마나 썼는지 기록한다.
 *
 * 지금까지는 "이번 영상에 얼마 들었냐"는 질문에 추정으로만 답할 수 있었다.
 * API 응답에 실제 토큰 수·글자 수가 들어 있으니 그걸 그대로 적어두면 추정이 필요 없다.
 * 단가는 여기 두지 않는다(계정 요금제마다 다름) — 합산할 때 환경변수로 받는다.
 */

export type UsageKind = 'claude' | 'openai-text' | 'openai-image' | 'gemini-image' | 'elevenlabs';

export interface UsageEntry {
  kind: UsageKind;
  /** 어느 단계에서 났는지 — script / research / thumbnail / narration 등 */
  step: string;
  /** 모델 이름(있으면). 단가가 모델마다 다르므로 남겨둔다. */
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** TTS 는 글자 수로 과금된다. */
  chars?: number;
  /** 이미지는 장 수로 과금된다. */
  images?: number;
}

const USAGE_PATH = path.join(OUT_DIR, 'usage.json');

/** 실행 중 누적 — 프로세스가 단계마다 따로 뜨므로 파일에 이어 쓴다. */
export function recordUsage(entry: UsageEntry): void {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const list: UsageEntry[] = fs.existsSync(USAGE_PATH)
      ? JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'))
      : [];
    list.push(entry);
    fs.writeFileSync(USAGE_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    // 사용량 기록 실패가 영상 제작을 막아서는 안 된다.
    console.warn('  · 사용량 기록 실패(무시):', (e as Error).message);
  }
}

/** 항목별 합계 — 사람이 읽는 요약과 웹앱 누적 집계에 함께 쓴다. */
export function summarize(list: UsageEntry[]) {
  const by: Record<string, { inputTokens: number; outputTokens: number; chars: number; images: number }> = {};
  for (const e of list) {
    const key = `${e.kind}${e.model ? ':' + e.model : ''}`;
    by[key] ??= { inputTokens: 0, outputTokens: 0, chars: 0, images: 0 };
    by[key].inputTokens += e.inputTokens || 0;
    by[key].outputTokens += e.outputTokens || 0;
    by[key].chars += e.chars || 0;
    by[key].images += e.images || 0;
  }
  return by;
}

export function readUsage(): UsageEntry[] {
  try {
    return fs.existsSync(USAGE_PATH) ? JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8')) : [];
  } catch {
    return [];
  }
}

/** 실행 끝에 콘솔로 남기는 요약 — 로그만 봐도 이번 실행이 뭘 얼마나 썼는지 알 수 있게. */
export function printUsage(): void {
  const list = readUsage();
  if (!list.length) return;
  console.log('\n── 이번 실행 사용량 ──');
  for (const [k, v] of Object.entries(summarize(list))) {
    const parts: string[] = [];
    if (v.inputTokens || v.outputTokens) parts.push(`입력 ${v.inputTokens.toLocaleString()} / 출력 ${v.outputTokens.toLocaleString()} 토큰`);
    if (v.chars) parts.push(`${v.chars.toLocaleString()}자`);
    if (v.images) parts.push(`이미지 ${v.images}장`);
    console.log(`  ${k.padEnd(28)} ${parts.join(' · ')}`);
  }
  printBrollSummary();
}

/**
 * B롤이 실제로 몇 컷 들어갔는지 실행 끝에 찍는다.
 *
 * ★이게 없어서 문제를 놓쳤다★
 * 3분짜리를 뽑았는데 B롤이 한 컷도 안 들어갔고, 그 사실이 로그 어디에도 요약돼 있지
 * 않아서 영상을 눈으로 볼 때까지 아무도 몰랐다(원인은 검색어 없는 씬 제외 + 8초 이상
 * 씬만 허용이었다). B롤은 실패해도 조용히 넘어가는 기능이라 이런 요약이 반드시 필요하다.
 * 사용량 요약과 같은 자리에 찍어야 로그 끝부분만 봐도 확인된다.
 */
function printBrollSummary(): void {
  try {
    const p = path.join(OUT_DIR, 'manifest.json');
    if (!fs.existsSync(p)) return;
    const m = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      scenes?: { broll?: { kind?: string }[] }[];
    };
    const scenes = m.scenes || [];
    if (!scenes.length) return;
    const withBroll = scenes.filter((s) => (s.broll || []).length > 0);
    const cuts = scenes.flatMap((s) => s.broll || []);
    const video = cuts.filter((c) => c.kind === 'video').length;
    const photo = cuts.filter((c) => c.kind === 'photo').length;
    if (!cuts.length) {
      console.log(`  ${'B롤'.padEnd(28)} 0컷 — 이번 영상에는 실사 컷이 하나도 안 들어갔습니다`);
      return;
    }
    console.log(
      `  ${'B롤'.padEnd(28)} ${cuts.length}컷 (영상 ${video} · 사진 ${photo}) / ${withBroll.length}개 씬 · 전체 ${scenes.length}개 씬`,
    );
  } catch {
    // 요약은 부가 정보다 — 여기서 실패해도 파이프라인을 막지 않는다.
  }
}
