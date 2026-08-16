import React from 'react';
import { Img, staticFile, interpolate } from 'remotion';

/**
 * 화이트보드 애니메이션 — 그림이 손으로 그려지는 것처럼 점진적으로 드러난다.
 *
 * ★기법 출처★ geeklee/srt-whiteboard-animation (MIT). 그 프로젝트의 핵심은
 * "그리는 순서를 정하고(ink-path), 그 순서대로 마스크를 키우며 손이 따라간다"이다.
 * 거기서 가져온 것은 그 발상이고, 구현은 우리 스택(Remotion)에 맞게 다시 썼다.
 *
 * ★grid 방식을 골랐다★ 원본은 ink-path 를 grid 와 skeleton 중에 고를 수 있는데,
 * skeleton(선을 따라 그리기)은 사람이 만든 주석 파일로 "무엇을 먼저 그릴지"를 지정해야
 * 제대로 나온다. 우리 파이프라인은 사람 손이 안 닿는 구조라 그 단계를 넣을 수 없다.
 * grid 는 사람이 종이를 채워 나가는 순서(왼→오, 다음 줄은 오→왼)를 그대로 흉내 내므로
 * 주석 없이도 자연스럽고, 어떤 그림에도 그냥 적용된다.
 *
 * 구현: 그림을 가로 띠(band) 여러 개로 나누고
 *   - 이미 지난 띠는 통째로 보이게
 *   - 지금 그리는 띠만 가로로 조금씩 열리게
 * clip-path 두 겹이면 끝이라 프레임마다 비싼 계산이 없다.
 */

/** 몇 줄로 나눠 그릴지. 늘리면 촘촘하지만 손이 자주 왔다갔다해 산만해진다. */
const BANDS = 9;

export interface InkRevealProps {
  /** 그릴 이미지. children 을 주면 그쪽이 우선한다. */
  src?: string;
  /** 이미지 대신 그릴 것 — 코드로 그리는 도식을 그대로 넣을 수 있다. */
  children?: React.ReactNode;
  /** 0~1. 이 값이 1 이 되면 그림이 다 그려진 상태다. */
  progress: number;
  /** 손을 그릴지 — 다 그린 뒤에는 치운다. */
  showHand?: boolean;
}

/** 현재 붓끝 위치(0~1 비율)와 띠 정보. 손 위치 계산과 클립 계산이 같은 값을 봐야 한다. */
function frontier(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const raw = p * BANDS;
  const band = Math.min(BANDS - 1, Math.floor(raw));
  const q = raw - band; // 이 띠 안에서의 진행도
  // 짝수 줄은 왼→오, 홀수 줄은 오→왼 (사람이 종이 채우는 순서)
  const leftToRight = band % 2 === 0;
  const x = leftToRight ? q : 1 - q;
  const yTop = band / BANDS;
  const yBottom = (band + 1) / BANDS;
  return { band, q, leftToRight, x, yTop, yBottom, done: p >= 1 };
}

export const InkReveal: React.FC<InkRevealProps> = ({ src, progress, showHand = true, children }) => {
  const f = frontier(progress);

  // ★클립을 한 겹으로 만든다★
  // 처음엔 "다 그린 띠"와 "지금 그리는 띠"를 두 겹으로 겹쳐 그렸는데, 그러면 내용물을
  // 두 번 렌더해야 한다. 이미지는 싸지만 도식(rough.js)은 매 프레임 경로를 새로 만들어
  // 비용이 두 배가 된다. 계단 모양 다각형 하나면 한 겹으로 같은 결과가 나온다.
  const P = (v: number) => `${(v * 100).toFixed(3)}%`;
  const yT = P(f.yTop);
  const yB = P(f.yBottom);
  const clip = f.done
    ? undefined
    : f.leftToRight
      // 위쪽은 전부 + 현재 띠는 왼쪽에서 q 까지
      ? `polygon(0% 0%, 100% 0%, 100% ${yT}, ${P(f.q)} ${yT}, ${P(f.q)} ${yB}, 0% ${yB})`
      // 위쪽은 전부 + 현재 띠는 오른쪽에서 q 만큼
      : `polygon(0% 0%, 100% 0%, 100% ${yB}, ${P(1 - f.q)} ${yB}, ${P(1 - f.q)} ${yT}, 0% ${yT})`;

  const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

  // ★흰 배경을 종이에 녹인다★
  // AI 그림은 흰 바탕으로 생성되는데 이 엔진의 배경은 종이색이다. 그대로 얹으면
  // 그려질수록 베이지 종이 위에 흰 종이가 펼쳐지는 꼴이 된다(첫 회차에서 실제로 그랬다).
  // 곱하기 블렌드를 걸면 흰색은 배경을 그대로 통과시키고 선만 남는다.
  //
  // ★반드시 이 클립 레이어에 걸어야 한다★ img 에 걸면 아무 효과가 없다 —
  // clip-path 가 쌓임 맥락(stacking context)을 만들어 블렌드가 바깥 종이까지 닿지 못한다.
  // 브라우저에서 네 경우를 그려 확인했다. 도식(children)은 배경이 이미 투명하므로 그대로 둔다.
  const blend: React.CSSProperties = children ? {} : { mixBlendMode: 'multiply' };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ ...fill, clipPath: clip, ...blend }}>
        {children ?? (src ? <Img src={staticFile(src)} style={{ ...fill, objectFit: 'contain' }} /> : null)}
      </div>
      {showHand && !f.done && <DrawingHand xRatio={f.x} yRatio={(f.yTop + f.yBottom) / 2} />}
    </div>
  );
};

/**
 * 손 그림의 알맹이(SVG 요소들만). 펜 끝이 좌표계 원점(0,0)에 오도록 그렸다.
 *
 * ★그려서 쓴다★ 원본 프로젝트는 drawing-hand.png 를 에셋으로 들고 있지만, 우리는
 * 배경음악·효과음과 같은 이유로 직접 그린다: 내려받을 것이 없고 라이선스가 따라붙지 않는다.
 *
 * ★DOM 과 SVG 양쪽에서 써야 해서 알맹이를 따로 뺐다★ 그림 씬에서는 화면 비율로,
 * 도식 씬에서는 도식과 같은 좌표계(SVG) 안에서 손을 놓는다. 그래야 손이 지금 그리는
 * 요소에 정확히 붙는다 — 예전엔 화면 전체를 훑는 띠만 따라다녀서, 도식은 저 혼자
 * 나타나고 손은 빈 종이를 쓸고 다녔다.
 */
export const HandPaths: React.FC = () => (
  <>
    {/* 펜촉 */}
    <path d="M4 6 L26 34 L38 24 L14 2 Z" fill="#2B2B2B" />
    {/* 펜대 */}
    <rect x="22" y="18" width="26" height="120" rx="9" transform="rotate(-38 22 18)" fill="#3D6EA5" />
    <rect x="60" y="86" width="26" height="46" rx="8" transform="rotate(-38 60 86)" fill="#2A4E77" />
    {/* 손 — 엄지와 검지로 펜을 쥔 모양. 단순한 실루엣으로 둔다(사실적일수록 어색해진다). */}
    <path
      d="M96 132
         C 118 118, 150 124, 162 146
         L 214 232
         C 226 252, 220 278, 200 290
         L 176 304
         C 156 316, 130 310, 118 290
         L 74 216
         C 62 196, 74 146, 96 132 Z"
      fill="#F2D3B6"
      stroke="#D8B294"
      strokeWidth="3"
    />
    {/* 검지 — 펜대를 감싸는 손가락 */}
    <path
      d="M92 148 C 108 138, 126 144, 134 158 L 158 198 C 164 210, 158 222, 146 226 C 134 230, 122 224, 116 212 L 90 170 C 84 160, 84 152, 92 148 Z"
      fill="#F7DDC4"
      stroke="#D8B294"
      strokeWidth="2.5"
    />
    {/* 소매 */}
    <path
      d="M150 268 L 214 236 L 262 320 C 268 332, 262 340, 250 340 L 176 340 C 162 340, 152 330, 148 316 Z"
      fill="#E8ECF2"
      stroke="#C9D2DE"
      strokeWidth="3"
    />
  </>
);

/**
 * SVG 좌표계 안에 놓는 손 — (x, y) 가 곧 펜 끝이다.
 * 도식과 같은 <svg> 안에 넣으면 카메라 이동·확대도 함께 따라간다.
 */
export const PenHand: React.FC<{ x: number; y: number; scale?: number }> = ({ x, y, scale = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} style={{ pointerEvents: 'none' }}>
    <HandPaths />
  </g>
);

/**
 * 사각형 테두리 위의 한 점 — t(0~1)만큼 왼쪽 위에서 시계방향으로 돈 지점.
 * 상자를 그리는 진행도를 그대로 넣으면 펜이 선을 따라가는 것처럼 보인다.
 */
export function perimeterPoint(x: number, y: number, w: number, h: number, t: number): { x: number; y: number } {
  const per = 2 * (w + h);
  let d = Math.max(0, Math.min(1, t)) * per;
  if (d <= w) return { x: x + d, y };
  d -= w;
  if (d <= h) return { x: x + w, y: y + d };
  d -= h;
  if (d <= w) return { x: x + w - d, y: y + h };
  d -= w;
  return { x, y: y + h - d };
}

/** 펜을 쥔 손 — 붓끝이 (xRatio, yRatio) 에 오도록 놓는다(그림 씬의 띠 마스크용). */
export const DrawingHand: React.FC<{ xRatio: number; yRatio: number }> = ({ xRatio, yRatio }) => (
  <div
    style={{
      position: 'absolute',
      left: `${(xRatio * 100).toFixed(2)}%`,
      top: `${(yRatio * 100).toFixed(2)}%`,
      width: 300,
      height: 340,
      // 펜 끝(SVG 의 0,0)이 지정 좌표에 오게 한다.
      transform: 'translate(-6px, -8px)',
      pointerEvents: 'none',
      filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.18))',
    }}
  >
    <svg width="300" height="340" viewBox="0 0 300 340" fill="none">
      <HandPaths />
    </svg>
  </div>
);

/**
 * 씬 길이에 대한 그리기 진행도.
 * 앞부분에 잠깐 여유를 두고(말이 시작되고 나서 그리기 시작), 씬이 끝나기 전에 다 그린다 —
 * 다 그린 그림을 잠깐이라도 보여줘야 무엇을 그린 건지 눈에 남는다.
 */
export function drawProgress(frame: number, durationInFrames: number, fps: number): number {
  const start = Math.round(fps * 0.35);
  const end = Math.max(start + fps, Math.round(durationInFrames * 0.82));
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
