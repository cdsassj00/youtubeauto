/**
 * 영상 제목 문자열로부터 결정적으로(같은 제목이면 항상 같은 결과) light/dark 시각 테마를 고른다.
 * "다크/화이트를 적절히 반전 활용해달라"는 요청에 따라 영상마다 한 번씩 팔레트를 바꿔주기 위함 —
 * 영상 생성 파이프라인(Node, run.ts)에서 한 번 정해 manifest.theme 에 저장하고, Remotion 렌더는
 * 그 값을 그대로 읽기만 한다. Math.random 대신 해시를 쓰는 이유는 재렌더 시에도 같은 결과가
 * 나와야 하기 때문(Remotion 프레임은 순수해야 함).
 */
export function pickVisualThemeMode(seedText: string): 'light' | 'dark' {
  let h = 0;
  for (let i = 0; i < seedText.length; i++) {
    h = (h * 31 + seedText.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2 === 0 ? 'light' : 'dark';
}
