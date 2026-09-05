/**
 * 주식 데일리 썸네일 — 코드로 그린다.
 *
 * ★왜 AI 그림을 안 쓰나★ 생성 이미지는 매번 달라 시리즈가 안 묶이고, 한글을 못 쓰며,
 * 장당 돈이 든다. 코드로 그리면 매일 같은 자리에 같은 크기로 찍힌다.
 *
 * ★무엇을 크게 쓰는가로 조회수가 갈린다★ 예전에는 제일 큰 글씨가 "어제 4/5 적중"이었다.
 * 어제 성적은 만든 사람만 궁금한 숫자고, 목록에서 처음 보는 사람에게는 아무 뜻이 없다.
 * 실제로 그렇게 만든 회차들이 전부 조회수 0 이었다. 사람이 알고 싶은 것은 "무슨 종목을
 * 왜 봐야 하는가" 하나뿐이라, 이제 종목 이름을 제일 크게 쓰고 그 아래에 근거를 한 줄 깐다.
 *
 * ★360px 로 줄어서 보인다★ 유튜브 목록의 실제 표시 폭이다. 그래서 큰 글씨는 두 줄까지만
 * 두고, 곁가지는 읽히지 않아도 되는 정보만 담는다. 종목 이름을 흐린 빨강으로 작게 깔던
 * 예전 판은 줄이면 아예 안 읽혔다 — 주인공은 흰색·큰 글씨여야 한다.
 */
import sharp from 'sharp';

const FONT = "'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif";
const BG = '#070d1a';
const BG2 = '#0c1730';
const WHITE = '#f2f6ff';
const DIM = '#93a3c2';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 한글은 글자당 폭이 라틴보다 넓다 — 대략 폭을 재서 큰 글씨 크기를 정한다. */
const widthUnits = (s: string) => [...s].reduce((n, ch) => n + (/[\x00-\x7F]/.test(ch) ? 0.55 : 1), 0);

/** 주어진 폭에 들어가는 최대 글자 크기. */
function fitSize(text: string, maxWidth: number, max: number, min: number): number {
  const u = widthUnits(text);
  return Math.max(min, Math.min(max, Math.floor(maxWidth / Math.max(u, 1))));
}

/**
 * 폭에 맞춰 크기를 줄이고, 최소 크기로도 안 들어가면 잘라 낸다.
 *
 * ★크기만 줄이면 화면 밖으로 나간다★ 미국편 곁가지("Marathon Petroleum · Valero Energy |
 * 유가 +6.7% 수혜 · 20일선 +8.3% 정배열")가 실제로 오른쪽에서 잘려 "정배열"이 사라졌다.
 * 최소 크기 아래로는 줄이면 안 읽히므로, 그때부터는 글자를 버리고 말줄임표를 붙인다.
 */
function fitText(text: string, maxWidth: number, max: number, min: number): { text: string; size: number } {
  const size = fitSize(text, maxWidth, max, min);
  if (widthUnits(text) * size <= maxWidth) return { text, size };
  let cut = text;
  while (cut.length > 1 && widthUnits(`${cut}…`) * size > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size };
}

/**
 * 시리즈 이름 — 매 회차 같은 자리에 같은 글씨로 박힌다.
 *
 * ★이름이 있어야 시리즈가 된다★ 회차마다 종목 이름이 바뀌니, 고정된 표식이 없으면
 * 목록에서 같은 시리즈의 다른 편이라는 것을 알 수가 없다. 구독자가 "그 채널의 그 코너"로
 * 기억하려면 매번 같은 문구가 같은 자리에 있어야 한다.
 */
const SERIES = 'AI가 추천하는 주식종목';

export async function drawStockThumbnail(opts: {
  /** 제일 크게 박을 한 덩어리 — 종목 이름. 두 줄까지 나눠 쓴다. */
  headline: string;
  /** 이름 아래 칩 한 줄 — 왜 봐야 하는지 (예: "AI 3개 중 2개가 찍었다"). */
  sub?: string;
  /** 우상단 배지 (예: "9/7 한국장"). */
  badge: string;
  /**
   * 오른쪽에 크게 박을 숫자와 그 이름 (예: "+6.3%" / "1차 목표").
   *
   * ★주식 썸네일에서 제일 먼저 보이는 것은 숫자다★ 글자만 있으면 읽어야 알 수 있는데,
   * 목록을 훑는 사람은 읽지 않는다. 큰 숫자 하나가 있어야 눈이 멈춘다. 다만 이 숫자는
   * 약속이 아니라 계산된 목표라서, 무엇의 숫자인지(label) 를 반드시 위에 붙인다.
   */
  bigValue?: string;
  bigLabel?: string;
  /** 하단에 까는 실제 가격 (예: "진입 192,388원 · 손절 187,236원"). */
  foot?: string;
  /** 좌하단 (예: "9/5 마감 기준"). */
  dateLabel: string;
  /** 그날의 강조색. 없으면 금색. */
  accent?: string;
  outPath: string;
}): Promise<void> {
  const { headline, sub = '', badge, bigValue = '', bigLabel = '', foot = '', dateLabel, accent, outPath } = opts;
  const ACC = /^#[0-9a-f]{6}$/i.test(accent ?? '') ? accent! : '#d9a441';

  // ★종목 이름이 길면 줄을 나눈다★ "롯데웰푸드·현대해상"을 한 줄에 우겨넣으면 글자가
  // 작아져 360px 에서 안 읽힌다. 가운뎃점을 기준으로 두 줄까지 쪼갠다.
  const parts = headline.split(/\s*[·,]\s*/).filter(Boolean);
  const lines: string[] = parts.length >= 2 ? [parts[0], parts.slice(1).join('·')] : [headline];

  // ★오른쪽 숫자 블록이 있으면 이름이 쓸 폭이 줄어든다★ 폭을 안 줄이면 이름이 숫자
  // 위로 올라타 둘 다 못 읽는다.
  const hasBig = Boolean(bigValue);
  const MAXW = hasBig ? 690 : 1150;
  // 한 줄이면 큼직하게, 두 줄이면 조금 줄여 둘 다 같은 크기로 맞춘다.
  const size = Math.min(...lines.map((l) => fitSize(l, MAXW, lines.length === 1 ? (hasBig ? 160 : 210) : (hasBig ? 120 : 150), 62)));
  const lineH = Math.round(size * 1.12);
  // 큰 글씨 덩어리 — 위에는 시리즈 이름, 아래에는 근거 줄이 붙으므로 그 사이에 놓는다.
  const blockTop = 348 - ((lines.length - 1) * lineH) / 2;

  // 칩 안쪽 여백(좌우 28씩)을 뺀 폭에 맞춘다.
  const subFit = sub ? fitText(sub, hasBig ? 640 : 1094, hasBig ? 48 : 60, 30) : { text: '', size: 0 };
  const subText = subFit.text;
  const subSize = subFit.size;
  // 곁가지는 좌우 64 여백 안에서.
  const footFit = foot ? fitText(foot, 1152, 38, 26) : { text: '', size: 0 };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${BG}"/><stop offset=".55" stop-color="${BG2}"/><stop offset="1" stop-color="${BG}"/></linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#g)"/>

<!-- 왼쪽 세로 띠 — 그날 색. 목록에서 회차끼리 구분되는 유일한 단서다. -->
<rect x="0" y="0" width="14" height="720" fill="${ACC}"/>

<!-- 시리즈 이름: 매 회차 같은 자리·같은 글씨. 이것이 있어야 "그 코너"로 기억된다. -->
<rect x="64" y="56" width="10" height="46" fill="${ACC}"/>
<text x="92" y="94" font-family="${FONT}" font-size="42" font-weight="bold" letter-spacing="2" fill="${ACC}">${esc(SERIES)}</text>

<!-- 우상단 배지: 언제 볼 종목인가. 지난 성적이 아니라 다음 장을 가리킨다. -->
<rect x="946" y="44" width="290" height="76" rx="14" fill="${ACC}"/>
<text x="1091" y="96" font-family="${FONT}" font-size="42" font-weight="bold" fill="#0b1020" text-anchor="middle">${esc(badge)}</text>

<!-- 주인공: 종목 이름 -->
${lines
  .map(
    (l, i) =>
      `<text x="64" y="${blockTop + i * lineH}" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${WHITE}">${esc(l)}</text>`,
  )
  .join('\n')}

${
  subText
    ? `<rect x="64" y="${blockTop + (lines.length - 1) * lineH + 52}" width="${Math.min(1150, subSize * widthUnits(subText) + 56)}" height="${subSize + 40}" rx="12" fill="${ACC}"/>
<text x="92" y="${blockTop + (lines.length - 1) * lineH + 52 + subSize + 6}" font-family="${FONT}" font-size="${subSize}" font-weight="bold" fill="#0b1020">${esc(subText)}</text>`
    : ''
}

${
  hasBig
    ? (() => {
        // 숫자 폭에 맞춰 블록을 넓힌다 — "+6.3%" 와 "대기" 는 길이가 크게 다르다.
        const vs = fitSize(bigValue, 380, 132, 64);
        const w = Math.max(300, Math.min(440, vs * widthUnits(bigValue) + 80));
        const x = 1216 - w;
        return `<rect x="${x}" y="196" width="${w}" height="286" rx="20" fill="${ACC}"/>
${bigLabel ? `<text x="${x + w / 2}" y="262" font-family="${FONT}" font-size="38" font-weight="bold" fill="#0b1020" text-anchor="middle" opacity=".8">${esc(bigLabel)}</text>` : ''}
<text x="${x + w / 2}" y="${bigLabel ? 392 : 370}" font-family="${FONT}" font-size="${vs}" font-weight="bold" fill="#0b1020" text-anchor="middle">${esc(bigValue)}</text>`;
      })()
    : ''
}

${footFit.text ? `<text x="64" y="646" font-family="${FONT}" font-size="${footFit.size}" fill="${DIM}">${esc(footFit.text)}</text>` : ''}
<text x="64" y="694" font-family="${FONT}" font-size="30" fill="${DIM}">${esc(dateLabel)}</text>
<text x="1224" y="694" font-family="${FONT}" font-size="32" fill="${ACC}" text-anchor="end">주식온톨로지</text>
</svg>`;

  // ★density 는 72★ 96 을 주면 sharp 가 1280 짜리를 1707 로 키워 버린다(썸네일 띠에서 당한 적 있다).
  const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== 1280 || meta.height !== 720) throw new Error(`썸네일 크기가 예상과 다릅니다: ${meta.width}x${meta.height}`);
  await sharp(png).toFile(outPath);
}
