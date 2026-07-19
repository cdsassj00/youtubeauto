import { continueRender, delayRender, staticFile } from 'remotion';

/** 자막용 폰트 스택 (Pretendard 우선). */
export const PRETENDARD = "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

/**
 * 로컬 Pretendard woff2 를 @font-face 로 등록하고, 로드가 끝날 때까지 렌더를 지연한다.
 * (브라우저(=Remotion 렌더) 컨텍스트에서만 실행.)
 */
if (typeof document !== 'undefined') {
  const handle = delayRender('load-pretendard');
  const faces: [string, string][] = [
    ['400', 'Pretendard-Regular.woff2'],
    ['600', 'Pretendard-SemiBold.woff2'],
    ['800', 'Pretendard-Bold.woff2'],
  ];
  const style = document.createElement('style');
  style.textContent = faces
    .map(
      ([w, f]) =>
        `@font-face{font-family:'Pretendard';font-style:normal;font-weight:${w};font-display:block;src:url(${staticFile(
          'fonts/' + f,
        )}) format('woff2');}`,
    )
    .join('\n');
  document.head.appendChild(style);
  const fonts = (document as unknown as { fonts: { load: (s: string) => Promise<unknown> } }).fonts;
  Promise.all(faces.map(([w]) => fonts.load(`${w} 48px Pretendard`)))
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
}
