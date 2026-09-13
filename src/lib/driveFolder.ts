/**
 * 공개 드라이브 폴더의 파일 목록을 자격증명 없이 읽는다.
 *
 * ★러너에는 드라이브 자격증명이 없다★ 그래서 지금까지 "무엇을 몇 번째로 올릴지"를
 * assets/course/manifest.json 에 손으로 적어 두고 있었다. 파일이 늘 때마다 사람이 다시
 * 뽑아 넣어야 했고, 실제로 그것을 잊어 28번이 빠진 채로 남았다 — 순서대로 올리는
 * 구조라 그 지점에서 시리즈 전체가 멈췄다.
 *
 * ★폴더 화면(drive/folders/…)은 50개까지만 준다★ 나머지는 스크롤할 때 따로 받아 오므로
 * 처음 HTML 에는 없다. 87개짜리 폴더가 49개로 읽혀서 목록을 다시 뽑을 수가 없었다.
 *
 * ★embeddedfolderview 는 전부 준다★ 드라이브가 예전부터 열어 둔 임베드용 화면으로,
 * 인증도 없고 지연 로딩도 없이 폴더의 모든 파일을 평범한 HTML 목록으로 내려 준다.
 * 87개 폴더에서 87개가 그대로 나왔고, 기존 매니페스트의 파일 ID 86개와 하나도
 * 어긋나지 않았다.
 */
import type { DriveEntry } from './courseFiles.js';

/**
 * ★항목 단위로 자른다★ 파일 ID 목록과 제목 목록을 따로 뽑아 짝지으면 한 칸씩 밀린다 —
 * 맨 앞 제목이 파일이 아니라 폴더 이름이기 때문이다. 그렇게 밀리면 영상마다 남의 자막이
 * 붙는데, 올라가기 전에는 아무도 눈치채지 못한다.
 */
const ENTRY = /\/file\/d\/([A-Za-z0-9_-]{20,})\/view.*?flip-entry-title">([^<]+)</gs;

export async function listPublicFolder(folderId: string): Promise<DriveEntry[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; youtubeauto/1.0)' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const html = await res.text();

  const out: DriveEntry[] = [];
  for (const m of html.matchAll(ENTRY)) out.push({ id: m[1], title: m[2].trim() });

  // ★빈 목록은 성공으로 치지 않는다★ 드라이브가 화면 구조를 바꾸면 정규식이 아무것도
  // 못 잡는데, 그대로 두면 "폴더에 파일이 없다"로 읽혀 매니페스트를 통째로 비워 버린다.
  if (!out.length) throw new Error('폴더에서 파일을 하나도 읽지 못했습니다 — 공개 설정이나 화면 구조가 바뀌었을 수 있습니다.');
  return out;
}
