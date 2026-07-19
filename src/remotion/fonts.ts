// 한글 폰트를 번들에 내장 (시스템 폰트 설치 여부와 무관하게 동일하게 렌더).
import { loadFont as loadPen } from '@remotion/google-fonts/NanumPenScript';
import { loadFont as loadGothic } from '@remotion/google-fonts/NanumGothic';
import { loadFont as loadBlack } from '@remotion/google-fonts/BlackHanSans';

/** 손글씨(Excalidraw 느낌) — 제목·라벨·다이어그램 텍스트 */
export const handFamily = loadPen().fontFamily;
/** 본문 — 자막 */
export const bodyFamily = loadGothic().fontFamily;
/** 강한 볼드 디스플레이 — 표지/아웃트로 큰 제목 */
export const displayFamily = loadBlack().fontFamily;
