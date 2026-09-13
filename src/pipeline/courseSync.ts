/**
 * 드라이브 폴더를 읽어 발행 순서 목록(assets/course/manifest.json)을 다시 만든다.
 *
 * ★새 영상을 넣어도 자동으로 안 올라가고 있었다★ 러너에 드라이브 자격증명이 없어
 * 폴더를 못 읽으니, 순서와 파일 ID 를 저장소 안 목록 파일에 손으로 적어 두는 구조였다.
 * 파일이 늘 때마다 사람이 다시 뽑아 넣어야 했고, 그것을 잊으면 그 자리에서 시리즈가
 * 멈춘다 — 실제로 28번이 빠진 채 나흘 동안 아무것도 올라가지 않았다.
 *
 * 이제 공개 폴더를 직접 읽으므로(driveFolder.ts) 파일만 넣어 두면 이 스크립트가 목록을
 * 맞춰 준다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPublicFolder } from '../lib/driveFolder.js';
import { pairCourseFiles } from '../lib/courseFiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.resolve(HERE, '../../assets/course/manifest.json');

interface Manifest {
  note?: string;
  folderId: string;
  expectedTotal?: number;
  skipOrders?: number[];
  generatedFrom?: string;
  modules: Array<{ order: number; moduleLabel: string; topic: string; driveVideoId: string; driveSrtId: string }>;
}

export async function runCourseSync(): Promise<void> {
  const cur = JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as Manifest;
  const folderId = process.env.COURSE_FOLDER_ID?.trim() || cur.folderId;
  const write = (process.env.DRY_RUN ?? 'true').toLowerCase() === 'false';

  console.log(`▶ 폴더 읽기 ${folderId}`);
  const entries = await listPublicFolder(folderId);
  console.log(`  · 파일 ${entries.length}개`);

  const { pairs, skipped } = pairCourseFiles(entries);
  console.log(`  · 짝지어진 회차 ${pairs.length}개`);
  for (const s of skipped) console.warn(`  ⚠ ${s}`);

  // ★같은 번호가 둘이면 멈춘다★ 파일 이름을 복사해 만들다 보면 순번이 겹치기 쉬운데,
  // 그대로 두면 둘 중 하나가 조용히 사라지고 그 회차는 영영 안 올라간다.
  const dup = new Map<number, string[]>();
  for (const p of pairs) dup.set(p.order, [...(dup.get(p.order) ?? []), p.videoName]);
  const clashes = [...dup].filter(([, names]) => names.length > 1);
  if (clashes.length) {
    for (const [order, names] of clashes) console.error(`  ✗ ${order}번이 ${names.length}개입니다: ${names.join(' / ')}`);
    throw new Error('순번이 겹칩니다 — 파일 이름을 고친 뒤 다시 돌리세요.');
  }

  const before = new Map(cur.modules.map((m) => [m.order, m]));
  const added = pairs.filter((p) => !before.has(p.order));
  const changed = pairs.filter((p) => {
    const b = before.get(p.order);
    return b && (b.driveVideoId !== p.videoId || b.driveSrtId !== p.srtId);
  });
  const gone = cur.modules.filter((m) => !pairs.some((p) => p.order === m.order));

  const total = pairs.length ? Math.max(...pairs.map((p) => p.order)) : 0;
  const missing: number[] = [];
  const skipSet = new Set(cur.skipOrders ?? []);
  for (let n = 1; n <= total; n++) if (!pairs.some((p) => p.order === n) && !skipSet.has(n)) missing.push(n);

  console.log('\n──────── 달라지는 것 ────────');
  console.log(`  새로 생김 ${added.length}개${added.length ? `: ${added.map((a) => `${a.order}(${a.topic})`).join(', ')}` : ''}`);
  console.log(`  파일 바뀜 ${changed.length}개${changed.length ? `: ${changed.map((c) => c.order).join(', ')}` : ''}`);
  console.log(`  사라짐   ${gone.length}개${gone.length ? `: ${gone.map((g) => g.order).join(', ')}` : ''}`);
  console.log(`  전체 ${total}편 · 빠진 번호: ${missing.length ? missing.join(', ') : '없음'}`);
  if (missing.length) {
    console.log('  ※ 순서대로 올리는 구조라, 빠진 번호에서 시리즈가 멈춥니다.');
    console.log('     그 번호 파일을 넣거나, 건너뛸 번호면 manifest 의 skipOrders 에 적으세요.');
  }

  const next: Manifest = {
    ...cur,
    folderId,
    expectedTotal: total,
    generatedFrom: `드라이브 파일 ${entries.length}개`,
    modules: pairs.map((p) => ({
      order: p.order,
      moduleLabel: p.moduleLabel,
      topic: p.topic,
      driveVideoId: p.videoId,
      driveSrtId: p.srtId,
    })),
  };

  if (!write) {
    console.log('\n예행 모드라 파일을 바꾸지 않았습니다. DRY_RUN=false 로 실제 반영합니다.');
    return;
  }
  await fs.writeFile(MANIFEST, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`\n✅ ${MANIFEST} 갱신 — ${pairs.length}편`);
}

await runCourseSync();
