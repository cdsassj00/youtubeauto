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

/**
 * 아직 안 올라간 것 중 순번이 가장 빠른 회차를 고른다. 없으면 null.
 *
 * 빠진 순번(예: 6~13번이 아직 드라이브에 없음)은 건너뛰고 다음 것을 집는다 — 없는 번호를
 * 기다리며 멈춰 있으면 그 뒤가 통째로 막힌다.
 */
export async function nextCourseModule(publishedOrders: Set<number>): Promise<CourseModule | null> {
  const modules = await loadCourseManifest();
  return modules.find((m) => !publishedOrders.has(m.order)) ?? null;
}
