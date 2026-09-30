/**
 * 편마다 썸네일 판을 바꾼다.
 *
 * ★같은 틀이 스물일곱 번 반복되면 목록에서 한 덩어리로 뭉친다★ 실제로 네 편을 나란히
 * 놓아 보니 배경과 문구가 달라도 같은 그림으로 보였다 — 글씨 자리, 인물 자리, 띠 자리,
 * 색이 전부 같았기 때문이다. 색은 일차별로 정해져 있어서 1일차·2일차뿐인 시리즈에서는
 * 두 가지밖에 안 나왔다.
 *
 * ★무엇을 바꾸고 무엇을 남기나★ 판·색·배경 자르는 자리를 바꾼다. 시리즈 띠(왼쪽 아래)는
 * 자리도 글도 고정으로 남긴다 — 다 바꿔 버리면 "이 채널 것"이라는 인식까지 같이 사라진다.
 *
 * ★연달아 같은 것이 나오지 않게 한다★ 주기를 서로소로 잡아(4·6·3) 같은 조합이 돌아오는
 * 데 열두 편이 걸리고, 바로 다음 편과는 반드시 판도 색도 다르다.
 */
export interface ThumbVariant {
  layout: 'screen' | 'bare' | 'band' | 'boxed';
  accent: string;
  cropVariant: number;
  /** 뽑아 둔 후보 프레임 중 몇 번째를 쓸지. 늘 1등만 쓰면 배경이 닮는다. */
  frameRank: number;
}

const LAYOUTS: ThumbVariant['layout'][] = ['screen', 'band', 'boxed', 'bare'];

// 목록에서 서로 구별되는 색만 골랐다. 어두운 배경 위에 얹으므로 채도가 낮은 것은 뺐다.
const ACCENTS = ['#ffd400', '#4c6ef5', '#f03e3e', '#0ca678', '#e8590c', '#22b8cf'];

export function thumbVariant(order: number): ThumbVariant {
  const n = Math.max(1, order) - 1;
  return {
    layout: LAYOUTS[n % LAYOUTS.length],
    accent: ACCENTS[n % ACCENTS.length],
    cropVariant: n % 3,
    frameRank: n % 3,
  };
}
