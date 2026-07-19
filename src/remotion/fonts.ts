// 한글 폰트를 번들에 내장 (시스템 폰트 설치 여부와 무관하게 동일하게 렌더).
import { loadFont as loadPen } from '@remotion/google-fonts/NanumPenScript';
import { loadFont as loadGothic } from '@remotion/google-fonts/NanumGothic';
import { loadFont as loadBlack } from '@remotion/google-fonts/BlackHanSans';

// 오프라인/로컬 렌더 시 폰트 네트워크 로딩을 건너뛰는 탈출구(REMOTION_SKIP_FONT_LOAD=1).
// CI/프로덕션에선 설정하지 않으므로 기존 동작 그대로 번들 폰트를 사용한다.
const skip =
  typeof process !== 'undefined' && process.env && process.env.REMOTION_SKIP_FONT_LOAD === '1';

/** 손글씨(Excalidraw 느낌) — 제목·라벨·다이어그램 텍스트 */
export const handFamily = skip ? '"Comic Sans MS"' : loadPen().fontFamily;
/** 본문 — 자막 */
export const bodyFamily = skip ? '"Malgun Gothic"' : loadGothic().fontFamily;
/** 강한 볼드 디스플레이 — 표지/아웃트로 큰 제목 */
export const displayFamily = skip ? 'sans-serif' : loadBlack().fontFamily;
