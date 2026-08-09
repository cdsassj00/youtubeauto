import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_DIR } from '../config.js';

/**
 * 무료 스톡 소스 세 곳(Pexels · Pixabay · Unsplash)을 하나의 인터페이스로 묶는다.
 *
 * 왜 셋인가: 한 곳만 쓰면 조금만 구체적인 검색어에서 결과가 0건이 된다. 실제로 Pexels
 * 영상만 쓰던 시절, "6초 이상"이라는 조건까지 겹쳐 그 씬이 통째로 정지 화면으로 남았다.
 * 세 곳을 순서대로 훑으면 구멍이 크게 줄어든다.
 *
 * ★소스마다 성격이 다르다★
 *   Pexels   영상 + 사진 · 출처 표기 의무 없음(권장)
 *   Pixabay  영상 + 사진 · 출처 표기 의무 없음(권장)
 *   Unsplash 사진만    · ★출처 표기 의무★ + 사용 시 download_location 호출 의무
 *
 * Unsplash 만 규정이 빡빡하다. API 가이드라인상 (1) "Photo by X on Unsplash" 형태로
 * 사진가와 Unsplash 를 함께 표기해야 하고, (2) 사진을 실제로 쓸 때 links.download_location
 * 을 한 번 호출해 다운로드를 집계시켜야 한다. 둘 다 코드에 넣어 뒀다 — 지키지 않으면
 * API 접근이 정지될 수 있다.
 */

export type StockProvider = 'pexels' | 'pixabay' | 'unsplash';

export interface StockAsset {
  /** public/ 기준 상대경로 — Remotion staticFile 로 참조 */
  relPath: string;
  kind: 'video' | 'photo';
  /** 원본 길이(초). 사진은 Infinity — 잘라 쓸 때 상한이 없다. */
  duration: number;
  provider: StockProvider;
  author: string;
  /** 출처 표기에 쓸 원본 페이지 주소 */
  sourceUrl: string;
}

export const STOCK_DIR = path.join(PUBLIC_DIR, 'stock');

/** 이 실행에서 이미 쓴 자산 — 같은 클립이 여러 씬에 반복되면 금방 티가 난다. */
const usedIds = new Set<string>();

/** 그 소스를 쓸 수 있는가(키가 있는가). */
export function availableProviders(): StockProvider[] {
  const out: StockProvider[] = [];
  if (config.pexelsApiKey) out.push('pexels');
  if (config.pixabayApiKey) out.push('pixabay');
  if (config.unsplashAccessKey) out.push('unsplash');
  return out;
}

/**
 * 검색어 하나로 자산 하나를 가져온다.
 *
 * @param wantVideo true 면 영상을 먼저 찾고 없으면 사진으로 내려간다.
 *                  false 면 사진만 찾는다(사진이 더 많고 켄번즈로 충분한 경우).
 * @param seed      같은 검색어라도 회차·씬마다 다른 결과가 걸리도록 하는 값.
 *
 * 실패해도 예외를 던지지 않는다 — 한 씬의 소재를 못 구했다고 영상 전체가 죽으면 안 된다.
 */
export async function fetchAsset(
  query: string,
  seed = 0,
  wantVideo = true,
): Promise<StockAsset | null> {
  const providers = availableProviders();
  if (!providers.length) return null;

  // 소스를 도는 순서를 seed 로 회전시킨다. 항상 Pexels 부터 훑으면 영상 전체가
  // 한 소스의 색감으로 통일돼 버린다.
  const rotated = providers.map((_, i) => providers[(i + seed) % providers.length]);

  if (wantVideo) {
    for (const p of rotated) {
      const a = await tryOne(p, query, seed, true);
      if (a) return a;
    }
  }
  for (const p of rotated) {
    const a = await tryOne(p, query, seed, false);
    if (a) return a;
  }
  return null;
}

async function tryOne(
  provider: StockProvider,
  query: string,
  seed: number,
  video: boolean,
): Promise<StockAsset | null> {
  try {
    if (provider === 'pexels') return video ? pexelsVideo(query, seed) : pexelsPhoto(query, seed);
    if (provider === 'pixabay') return video ? pixabayVideo(query, seed) : pixabayPhoto(query, seed);
    // Unsplash 는 영상이 없다 — 사진 요청일 때만 의미가 있다.
    if (provider === 'unsplash') return video ? null : unsplashPhoto(query, seed);
    return null;
  } catch (e) {
    console.warn(`    · ${provider} "${query}" 실패(무시):`, (e as Error).message);
    return null;
  }
}

/** 후보 중 아직 안 쓴 것을 seed 기준으로 고른다. 다 썼으면 그냥 seed 로 고른다. */
function pick<T>(items: T[], seed: number, idOf: (t: T) => string): T | null {
  if (!items.length) return null;
  const fresh = items.filter((t) => !usedIds.has(idOf(t)));
  const pool = fresh.length ? fresh : items;
  const chosen = pool[seed % pool.length];
  usedIds.add(idOf(chosen));
  return chosen;
}

/** 파일을 내려받아 public/stock 아래에 저장하고 상대경로를 돌려준다(이미 있으면 재사용). */
async function download(url: string, filename: string): Promise<string | null> {
  fs.mkdirSync(STOCK_DIR, { recursive: true });
  const rel = `stock/${filename}`;
  const abs = path.join(PUBLIC_DIR, rel);
  if (fs.existsSync(abs)) return rel;
  const r = await fetch(url);
  if (!r.ok) return null;
  fs.writeFileSync(abs, Buffer.from(await r.arrayBuffer()));
  return rel;
}

// ── Pexels ────────────────────────────────────────────────────────────────

interface PexelsVideoFile { link: string; width?: number | null; file_type?: string }
interface PexelsVideoHit { id: number; duration: number; url: string; user?: { name?: string }; video_files: PexelsVideoFile[] }
interface PexelsPhotoHit { id: number; url: string; photographer?: string; src?: { large2x?: string; large?: string } }

async function pexelsVideo(query: string, seed: number): Promise<StockAsset | null> {
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&per_page=15&orientation=landscape&size=medium`;
  const r = await fetch(url, { headers: { Authorization: config.pexelsApiKey } });
  if (!r.ok) return null;
  const hits = ((await r.json()) as { videos?: PexelsVideoHit[] }).videos || [];
  // 컷보다 짧은 클립은 뒤가 검은 화면이 된다(OffthreadVideo 에 loop 옵션이 없다).
  const v = pick(hits.filter((h) => h.duration >= 6), seed, (h) => `pexels-v-${h.id}`);
  if (!v) return null;
  const file = bestVideoFile(v.video_files.map((f) => ({ link: f.link, width: f.width || 0, mp4: f.file_type === 'video/mp4' })));
  if (!file) return null;
  const rel = await download(file, `pexels-${v.id}.mp4`);
  return rel
    ? { relPath: rel, kind: 'video', duration: v.duration, provider: 'pexels', author: v.user?.name || 'Pexels', sourceUrl: v.url }
    : null;
}

async function pexelsPhoto(query: string, seed: number): Promise<StockAsset | null> {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=15&orientation=landscape&size=large`;
  const r = await fetch(url, { headers: { Authorization: config.pexelsApiKey } });
  if (!r.ok) return null;
  const hits = ((await r.json()) as { photos?: PexelsPhotoHit[] }).photos || [];
  const p = pick(hits, seed, (h) => `pexels-p-${h.id}`);
  const link = p?.src?.large2x || p?.src?.large;
  if (!p || !link) return null;
  const rel = await download(link, `pexels-p${p.id}.jpg`);
  return rel
    ? { relPath: rel, kind: 'photo', duration: Infinity, provider: 'pexels', author: p.photographer || 'Pexels', sourceUrl: p.url }
    : null;
}

// ── Pixabay ───────────────────────────────────────────────────────────────

interface PixabayVideoHit {
  id: number; pageURL: string; duration: number; user?: string;
  videos?: Record<string, { url?: string; width?: number } | undefined>;
}
interface PixabayPhotoHit { id: number; pageURL: string; user?: string; largeImageURL?: string; webformatURL?: string }

async function pixabayVideo(query: string, seed: number): Promise<StockAsset | null> {
  const url =
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(config.pixabayApiKey)}` +
    `&q=${encodeURIComponent(query)}&per_page=20&safesearch=true`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const hits = ((await r.json()) as { hits?: PixabayVideoHit[] }).hits || [];
  const v = pick(hits.filter((h) => (h.duration || 0) >= 6), seed, (h) => `pixabay-v-${h.id}`);
  if (!v) return null;
  // Pixabay 는 화질별로 large/medium/small/tiny 를 준다. 1080p 근처가 목표다.
  const files = Object.values(v.videos || {})
    .filter((f): f is { url?: string; width?: number } => Boolean(f?.url))
    .map((f) => ({ link: f.url as string, width: f.width || 0, mp4: true }));
  const file = bestVideoFile(files);
  if (!file) return null;
  const rel = await download(file, `pixabay-${v.id}.mp4`);
  return rel
    ? { relPath: rel, kind: 'video', duration: v.duration, provider: 'pixabay', author: v.user || 'Pixabay', sourceUrl: v.pageURL }
    : null;
}

async function pixabayPhoto(query: string, seed: number): Promise<StockAsset | null> {
  const url =
    `https://pixabay.com/api/?key=${encodeURIComponent(config.pixabayApiKey)}` +
    `&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=20&safesearch=true`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const hits = ((await r.json()) as { hits?: PixabayPhotoHit[] }).hits || [];
  const p = pick(hits, seed, (h) => `pixabay-p-${h.id}`);
  const link = p?.largeImageURL || p?.webformatURL;
  if (!p || !link) return null;
  const rel = await download(link, `pixabay-p${p.id}.jpg`);
  return rel
    ? { relPath: rel, kind: 'photo', duration: Infinity, provider: 'pixabay', author: p.user || 'Pixabay', sourceUrl: p.pageURL }
    : null;
}

// ── Unsplash (사진만) ──────────────────────────────────────────────────────

interface UnsplashHit {
  id: string;
  urls?: { regular?: string; full?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string };
}

async function unsplashPhoto(query: string, seed: number): Promise<StockAsset | null> {
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
    `&per_page=20&orientation=landscape`;
  const r = await fetch(url, {
    headers: { Authorization: `Client-ID ${config.unsplashAccessKey}`, 'Accept-Version': 'v1' },
  });
  if (!r.ok) return null;
  const hits = ((await r.json()) as { results?: UnsplashHit[] }).results || [];
  const p = pick(hits, seed, (h) => `unsplash-${h.id}`);
  const link = p?.urls?.regular || p?.urls?.full;
  if (!p || !link) return null;

  // ★Unsplash API 규정★ 사진을 실제로 쓸 때는 download_location 을 한 번 호출해
  // 다운로드로 집계시켜야 한다. 이걸 빼먹으면 API 접근이 정지될 수 있다.
  // 실패해도 영상 제작은 계속한다 — 다만 조용히 넘기지 말고 로그로 남긴다.
  if (p.links?.download_location) {
    try {
      await fetch(p.links.download_location, {
        headers: { Authorization: `Client-ID ${config.unsplashAccessKey}` },
      });
    } catch (e) {
      console.warn('    · Unsplash download 집계 호출 실패:', (e as Error).message);
    }
  }

  const rel = await download(link, `unsplash-${p.id}.jpg`);
  return rel
    ? {
        relPath: rel,
        kind: 'photo',
        duration: Infinity,
        provider: 'unsplash',
        author: p.user?.name || 'Unsplash',
        sourceUrl: p.links?.html || 'https://unsplash.com',
      }
    : null;
}

// ── 공통 ──────────────────────────────────────────────────────────────────

/** 1080p 근처를 고른다. 4K 는 용량만 크고 최종이 1080p 라 의미가 없다. */
function bestVideoFile(files: { link: string; width: number; mp4: boolean }[]): string | null {
  const mp4 = files.filter((f) => f.mp4 && f.width > 0);
  if (!mp4.length) return null;
  const fit = mp4.filter((f) => f.width >= 1280 && f.width <= 2048).sort((a, b) => b.width - a.width)[0];
  return (fit || mp4.sort((a, b) => a.width - b.width)[0]).link;
}

/**
 * 설명란에 넣을 출처 표기.
 *
 * Pexels·Pixabay 는 의무가 아니지만 표기가 권장된다. Unsplash 는 의무이므로
 * "이름 / Unsplash" 형태로 반드시 들어가게 소스별로 나눠 적는다.
 */
export function creditBlock(assets: StockAsset[]): string {
  if (!assets.length) return '';
  const byProvider = new Map<StockProvider, Set<string>>();
  for (const a of assets) {
    if (!byProvider.has(a.provider)) byProvider.set(a.provider, new Set());
    byProvider.get(a.provider)!.add(a.author);
  }
  const LABEL: Record<StockProvider, string> = {
    pexels: 'Pexels',
    pixabay: 'Pixabay',
    unsplash: 'Unsplash',
  };
  const lines = [...byProvider.entries()].map(
    ([p, names]) => `${LABEL[p]}: ${[...names].sort().join(', ')}`,
  );
  return ['영상·사진 출처', ...lines].join('\n');
}

/** 테스트·점검용 — 이 실행에서 쓴 자산 기록을 비운다. */
export function resetUsed(): void {
  usedIds.clear();
}
