import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/**
 * 구글드라이브 공개 파일 내려받기.
 *
 * ★큰 파일은 그냥 받으면 HTML 이 온다★ 드라이브는 100MB 가 넘는 파일에 대해
 * "바이러스 검사를 할 수 없습니다" 안내 페이지를 먼저 돌려준다. 그걸 모르고 저장하면
 * 영상 대신 몇 KB 짜리 HTML 이 저장되고, 그 다음 단계(업로드)에서야 이상하다는 걸 알게 된다.
 * 그래서 확인 토큰을 찾아 한 번 더 요청하고, 받은 것이 정말 영상인지 크기와 앞부분을
 * 검사한 뒤에야 성공으로 친다.
 */

const UA = 'Mozilla/5.0 (compatible; youtubeauto/1.0)';

/** 드라이브 링크나 ID 문자열에서 파일 ID만 뽑는다. */
export function driveFileId(input: string): string {
  const s = input.trim();
  const m =
    /\/file\/d\/([A-Za-z0-9_-]{20,})/.exec(s) ||
    /[?&]id=([A-Za-z0-9_-]{20,})/.exec(s) ||
    /^([A-Za-z0-9_-]{20,})$/.exec(s);
  if (!m) throw new Error(`구글드라이브 파일 ID 를 찾을 수 없습니다: ${s.slice(0, 80)}`);
  return m[1];
}

/**
 * 공개(링크가 있는 모든 사용자) 파일을 내려받아 저장한다.
 * @param minBytes 이보다 작으면 실패로 본다 — 안내 페이지(HTML)를 받은 경우를 걸러낸다.
 */
export async function downloadDriveFile(idOrUrl: string, outPath: string, minBytes = 1024): Promise<number> {
  const id = driveFileId(idOrUrl);
  const base = `https://drive.usercontent.google.com/download?id=${id}&export=download`;

  let res = await fetch(base, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  let cookie = res.headers.get('set-cookie') || '';

  // 안내 페이지가 오면 그 안의 확인 토큰으로 다시 요청한다.
  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    const html = await res.text();
    const token =
      /name="confirm"\s+value="([^"]+)"/.exec(html)?.[1] ||
      /confirm=([0-9A-Za-z_-]+)/.exec(html)?.[1] ||
      't';
    const uuid = /name="uuid"\s+value="([^"]+)"/.exec(html)?.[1];
    const url = `${base}&confirm=${encodeURIComponent(token)}${uuid ? `&uuid=${encodeURIComponent(uuid)}` : ''}`;
    res = await fetch(url, {
      headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie.split(';')[0] } : {}) },
      redirect: 'follow',
    });
  }

  if (!res.ok || !res.body) throw new Error(`드라이브 내려받기 실패 (${res.status}) — 공유 설정이 "링크가 있는 모든 사용자"인지 확인하세요`);

  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(outPath));
  const size = (await fsp.stat(outPath)).size;

  // ★크기만 보면 안 된다★ 처음엔 "작으면 실패"로만 걸렀는데, 공유가 안 된 파일을 받으니
  // 구글 로그인 페이지 928KB 가 내려와 검사를 그대로 통과했다(실제로 겪었다).
  // 크기와 무관하게 앞부분을 열어 HTML 인지 본다.
  const fh = await fsp.open(outPath, 'r');
  const buf = Buffer.alloc(Math.min(512, size));
  await fh.read(buf, 0, buf.length, 0);
  await fh.close();
  const head = buf.toString('utf8');
  if (/^\s*(<!doctype html|<html|<\?xml)/i.test(head) || /<title>[^<]*(Sign-in|로그인|Google Drive)/i.test(head)) {
    const why = /Sign-in|로그인|accounts\.google/i.test(head)
      ? '구글 로그인 페이지가 내려왔습니다 — 이 파일은 아직 공개 공유가 아닙니다.'
      : '드라이브 안내 페이지가 내려왔습니다.';
    throw new Error(
      `${why} (${size}바이트) 폴더나 파일의 공유를 "링크가 있는 모든 사용자 · 뷰어"로 바꿔주세요.`,
    );
  }
  if (size < minBytes) throw new Error(`내려받은 파일이 너무 작습니다(${size}바이트, 최소 ${minBytes})`);
  return size;
}
