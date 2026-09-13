/**
 * 발행 순서 목록 — "무엇을 몇 번째로 올릴지"를 저장소에 적어 둔 것.
 *
 * ★왜 드라이브를 직접 안 읽나★ 폴더 목록 조회에는 인증이 필요한데 러너에는 그 자격이
 * 없다(내려받기는 공개 링크로 되지만 목록은 안 된다). 러너에 드라이브 자격증명을 넣으면
 * 비밀이 하나 늘고, 그 비밀은 이 파이프라인이 하는 일 전체보다 권한이 넓다. 그래서
 * "무엇이 있는지"는 폴더를 볼 수 있는 Claude 세션이 여기 적어 두고, 러너는 읽기만 한다.
 *
 * ★대가★ 드라이브에 파일이 늘면 이 목록은 저절로 안 늘어난다. 목록이 바닥나면 크론은
 * 조용히 아무것도 안 하고 끝나므로, 사람이 새 파일을 넣었다면 목록도 다시 뽑아야 한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { listPublicFolder } from './driveFolder.js';
import { pairCourseFiles } from './courseFiles.js';
import { fileURLToPath } from 'node:url';

export interface CourseModule {
  order: number;
  moduleLabel: string;
  topic: string;
  driveVideoId: string;
  driveSrtId: string;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(HERE, '../../assets/course/manifest.json');

/**
 * 드라이브 폴더를 직접 읽어 목록을 만든다. 실패하면 null 을 돌려주고 파일 목록으로 떨어진다.
 *
 * ★목록 파일을 손으로 고치는 구조가 사고를 냈다★ 파일을 폴더에 넣어도 이 목록을 같이
 * 갱신하지 않으면 그 회차는 없는 것이 되고, 순서대로 올리는 규칙 때문에 그 지점에서
 * 시리즈 전체가 멈춘다 — 실제로 28번이 빠진 채 나흘 동안 아무것도 안 올라갔다.
 * 이제 폴더가 곧 목록이다. 파일만 넣으면 된다.
 *
 * ★그래도 파일 목록은 남긴다★ 드라이브가 화면 구조를 바꾸거나 폴더 공개가 풀리면
 * 읽지 못하는데, 그날 발행이 통째로 멈추는 것보다 마지막으로 알던 목록으로 도는 편이 낫다.
 */
async function loadFromFolder(folderId: string): Promise<CourseModule[] | null> {
  try {
    const entries = await listPublicFolder(folderId);
    const { pairs, skipped } = pairCourseFiles(entries);
    for (const s of skipped) console.warn(`  ⚠ ${s}`);
    if (!pairs.length) return null;
    // ★같은 번호가 둘이면 쓰지 않는다★ 서로 다른 시리즈를 한 폴더에 넣으면 순번이 겹친다
    // (강사양성과정 1~9 와 새 시리즈 01~09 처럼). 저장된 목록 쪽은 중복을 막고 있었는데
    // 폴더를 직접 읽는 이 경로에는 검사가 없어서, 둘 중 먼저 걸린 것만 올라가고 나머지는
    // 영영 차례가 오지 않는다 — 조용히 사라지는 종류라 눈치채기 어렵다.
    const dup = new Map<number, string[]>();
    for (const p of pairs) dup.set(p.order, [...(dup.get(p.order) ?? []), p.videoName]);
    const clashes = [...dup].filter(([, names]) => names.length > 1);
    if (clashes.length) {
      for (const [order, names] of clashes) console.error(`  ✗ ${order}번이 ${names.length}개입니다: ${names.join(' / ')}`);
      console.error('  → 순번이 겹칩니다. 시리즈가 섞였는지 확인하세요. 저장된 목록으로 진행합니다.');
      return null;
    }
    console.log(`  · 드라이브 폴더에서 ${pairs.length}편을 읽었습니다 (파일 ${entries.length}개)`);
    return pairs.map((p) => ({
      order: p.order,
      moduleLabel: p.moduleLabel,
      topic: p.topic,
      driveVideoId: p.videoId,
      driveSrtId: p.srtId,
    }));
  } catch (e) {
    console.warn(`  ⚠ 드라이브 폴더를 못 읽어 저장된 목록으로 진행합니다 — ${(e as Error).message}`);
    return null;
  }
}

/** 폴더를 먼저 읽고, 안 되면 저장된 목록. COURSE_FOLDER_SYNC=false 면 저장된 목록만 쓴다. */
export async function loadCourseModules(): Promise<CourseModule[]> {
  const raw = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as { folderId?: string };
  const folderId = process.env.COURSE_FOLDER_ID?.trim() || raw.folderId;
  if (folderId && (process.env.COURSE_FOLDER_SYNC ?? 'true').toLowerCase() !== 'false') {
    const live = await loadFromFolder(folderId);
    if (live) return live.sort((a, b) => a.order - b.order);
  }
  return loadCourseManifest();
}

export async function loadCourseManifest(): Promise<CourseModule[]> {
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { modules?: unknown };
  if (!Array.isArray(parsed.modules)) throw new Error(`발행 순서 목록이 깨졌습니다: ${MANIFEST_PATH}`);

  const modules = parsed.modules as CourseModule[];
  // ★여기서 막지 않으면 엉뚱한 영상이 공개로 올라간다★ 목록은 사람이 손으로 고칠 수 있는
  // 파일이고, 이 값들은 그대로 유튜브 공개 업로드로 이어진다. 형태를 먼저 확인한다.
  const seen = new Set<number>();
  for (const m of modules) {
    if (!Number.isInteger(m.order) || m.order < 1) throw new Error(`순번이 올바르지 않습니다: ${JSON.stringify(m)}`);
    if (seen.has(m.order)) throw new Error(`순번이 중복됩니다: ${m.order}`);
    seen.add(m.order);
    if (!m.driveVideoId || !m.driveSrtId) throw new Error(`[${m.order}] 드라이브 파일 ID 가 비었습니다.`);
  }
  return modules.sort((a, b) => a.order - b.order);
}

export type NextPick =
  /** 이 회차를 올리면 된다. */
  | { kind: 'go'; module: CourseModule }
  /** 다음 차례인 순번의 파일이 아직 드라이브에 없다. 오늘은 아무것도 안 올린다. */
  | { kind: 'waiting'; order: number }
  /** 더 올릴 것이 없다. */
  | { kind: 'done' };

/**
 * 다음에 올릴 회차를 고른다.
 *
 * ★빠진 순번을 건너뛰지 않고 기다린다★ 처음에는 없는 번호를 건너뛰고 다음 것을 집게
 * 만들었다. 그러면 6~13번이 아직 없을 때 5편 다음 날 14편이 올라가고, 나중에 6번을 넣으면
 * 6번이 17번 뒤에 발행된다. 순위대로 올리는 것이 이 시리즈의 약속인데 그게 깨지고,
 * 재생목록도 올린 순서대로 쌓이므로 목록 자체가 뒤죽박죽이 된다. 순서를 지키는 편이
 * 하루 쉬는 것보다 낫다 — 어차피 파일이 들어오면 저절로 풀린다.
 *
 * ★영영 안 올 번호는 skipOrders 로 비워 준다★ 기다리기만 하면 한 번호 때문에 시리즈가
 * 영원히 멈출 수 있다. 발행하지 않기로 한 순번은 목록에 적어 두면 건너뛴다.
 */
export async function nextCourseModule(publishedOrders: Set<number>): Promise<NextPick> {
  const raw = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as { expectedTotal?: number; skipOrders?: number[] };
  const modules = await loadCourseModules();
  const skip = new Set(raw.skipOrders ?? []);
  // ★전체 편수는 실제로 읽은 목록에서 센다★ 저장된 expectedTotal 을 쓰면 폴더에 새 파일을
  // 넣어도 그 숫자를 넘는 회차는 영영 차례가 오지 않는다.
  const total = modules.length ? Math.max(...modules.map((m) => m.order)) : 0;

  for (let n = 1; n <= total; n++) {
    if (publishedOrders.has(n) || skip.has(n)) continue;
    const hit = modules.find((m) => m.order === n);
    if (!hit) return { kind: 'waiting', order: n };
    return { kind: 'go', module: hit };
  }
  return { kind: 'done' };
}

/**
 * 시리즈 전체 편수. 제목의 "[14/43]" 뒷자리에 쓴다.
 *
 * ★"14편" 보다 "14/43" 이 낫다★ 지금 어디쯤인지와 얼마나 남았는지를 한 번에 알려 준다.
 * expectedTotal 을 적어 두지 않았으면 목록에 있는 것 중 가장 큰 번호로 대신한다.
 */
export async function courseTotal(): Promise<number> {
  const modules = await loadCourseModules();
  return modules.length ? Math.max(...modules.map((m) => m.order)) : 0;
}
