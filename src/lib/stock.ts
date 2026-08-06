import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_DIR } from '../config.js';

/**
 * Pexels 스톡 영상 B롤.
 *
 * 왜 넣는가: 지금 영상은 한 화면이 15~20초씩 정지해 있어서 프리젠테이션처럼 보인다.
 * 실제 유튜브 설명 영상은 2~5초마다 화면이 바뀐다. 그 리듬을 만들려면 "움직이는 그림"이
 * 필요한데, 매 컷을 AI 영상으로 만들면 10분짜리에 수십~수백 달러가 든다. 스톡은 무료다.
 *
 * ★쓰는 방식이 중요하다★
 * 스톡 클립을 전체화면으로 쭉 트는 채널은 유튜브 "재사용 콘텐츠" 판정으로 수익화가
 * 거절될 수 있다. 그래서 여기서는 스톡을 주역으로 쓰지 않는다:
 *  - 원본(대본·도식·모션그래픽) 위에 2.5~4초짜리 컷으로만 얹는다
 *  - 전체 씬의 일부에만 넣고(BROLL_MAX_RATIO), 코드·인용 씬에는 아예 안 넣는다
 * 즉 편집 소재이지 콘텐츠 본체가 아니다.
 *
 * 라이선스: Pexels 라이선스는 상업적 사용을 허용하고 출처 표기를 요구하지 않는다.
 * 다만 표기하는 것이 권장되므로 작가명을 모아 두었다가 설명란에 넣는다(creditLine).
 */

const API = 'https://api.pexels.com';
export const STOCK_DIR = path.join(PUBLIC_DIR, 'stock');

export interface StockClip {
  /** public/ 기준 상대경로 — Remotion staticFile 로 참조 */
  relPath: string;
  /** 원본 클립 길이(초). 잘라 쓸 때 상한이 된다. */
  duration: number;
  photographer: string;
  pexelsUrl: string;
}

interface PexelsVideoFile {
  link: string;
  width?: number | null;
  height?: number | null;
  file_type?: string;
}
interface PexelsVideo {
  id: number;
  duration: number;
  url: string;
  user?: { name?: string };
  video_files: PexelsVideoFile[];
}

/**
 * 키워드로 가로 영상 하나를 찾아 내려받는다.
 * 실패하면 null — B롤은 있으면 좋고 없어도 영상은 나와야 하므로 절대 예외를 던지지 않는다.
 */
export async function fetchClip(query: string, seed = 0): Promise<StockClip | null> {
  const key = config.pexelsApiKey;
  if (!key) return null;

  try {
    const url =
      `${API}/videos/search?query=${encodeURIComponent(query)}` +
      `&per_page=15&orientation=landscape&size=medium`;
    const r = await fetch(url, { headers: { Authorization: key } });
    if (!r.ok) {
      console.warn(`    · 스톡 검색 실패(${r.status}) "${query}"`);
      return null;
    }
    const data = (await r.json()) as { videos?: PexelsVideo[] };
    // 컷 최대 길이(4초)보다 넉넉히 긴 것만 받는다. 클립이 컷보다 짧으면 남는 구간이
    // 검은 화면으로 뜨는데, Remotion 의 OffthreadVideo 에는 loop 옵션이 없어 코드로 메울 수 없다.
    const videos = (data.videos || []).filter((v) => v.duration >= 6);
    if (!videos.length) return null;

    // 같은 키워드라도 회차마다 다른 클립이 걸리도록 seed 로 고른다.
    // (항상 1등만 쓰면 여러 영상에 같은 장면이 반복돼 금방 티가 난다.)
    const v = videos[seed % videos.length];

    // 1080p 근처를 고른다. 4K 는 용량만 크고 최종이 1080p 라 의미가 없다.
    const files = v.video_files.filter((f) => f.width && f.height && f.file_type === 'video/mp4');
    if (!files.length) return null;
    const pick =
      files
        .filter((f) => (f.width || 0) >= 1280 && (f.width || 0) <= 2048)
        .sort((a, b) => (b.width || 0) - (a.width || 0))[0] ||
      files.sort((a, b) => (a.width || 0) - (b.width || 0))[0];

    fs.mkdirSync(STOCK_DIR, { recursive: true });
    const rel = `stock/${v.id}.mp4`;
    const abs = path.join(PUBLIC_DIR, rel);
    // 같은 클립을 두 번 받지 않는다(같은 영상 안에서 키워드가 겹칠 수 있다).
    if (!fs.existsSync(abs)) {
      const vr = await fetch(pick.link);
      if (!vr.ok) return null;
      fs.writeFileSync(abs, Buffer.from(await vr.arrayBuffer()));
    }
    return {
      relPath: rel,
      duration: v.duration,
      photographer: v.user?.name || 'Pexels',
      pexelsUrl: v.url,
    };
  } catch (e) {
    console.warn(`    · 스톡 "${query}" 실패(무시):`, (e as Error).message);
    return null;
  }
}

/** 설명란에 넣을 출처 표기. Pexels 는 의무는 아니지만 표기하는 게 예의이고 분쟁 예방도 된다. */
export function creditLine(clips: StockClip[]): string {
  if (!clips.length) return '';
  const names = [...new Set(clips.map((c) => c.photographer))].sort();
  return `영상 소스: Pexels (${names.join(', ')})`;
}
