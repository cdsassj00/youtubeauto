/**
 * 주식 데일리 썸네일 — 코드로 그린다.
 *
 * ★왜 AI 그림을 안 쓰나★ 생성 이미지는 매번 달라 시리즈가 안 묶이고, 한글을 못 쓰며,
 * 장당 돈이 든다. 코드로 그리면 매일 같은 자리에 같은 크기로 찍힌다.
 *
 * ★무엇을 크게 쓰는가로 조회수가 갈린다★ 예전에는 제일 큰 글씨가 "어제 4/5 적중"이었다.
 * 어제 성적은 만든 사람만 궁금한 숫자고, 목록에서 처음 보는 사람에게는 아무 뜻이 없다.
 * 실제로 그렇게 만든 회차들이 전부 조회수 0 이었다. 사람이 알고 싶은 것은 "무슨 종목을
 * 왜 봐야 하는가" 하나뿐이라, 종목 이름을 제일 크게 쓰고 그 아래에 근거를 한 줄 깐다.
 *
 * ★글자만 있으면 주식 채널로 안 보인다★ 목록에는 캔들과 곡선이 깔린 썸네일이 가득한데
 * 우리 것만 글자판이면, 내용을 읽기 전에 이미 지나간다. 그래서 진짜 주가 곡선(60거래일
 * 종가)을 배경에 깐다 — 장식이 아니라 그 종목의 실제 데이터라서 화면과 영상 내용이
 * 어긋나지 않는다. 곡선이 없는 날에는 그 자리를 비우고 글자만 쓴다.
 *
 * ★360px 로 줄어서 보인다★ 유튜브 목록의 실제 표시 폭이다. 큰 글씨는 두 줄까지만 두고,
 * 곁가지는 읽히지 않아도 되는 정보만 담는다. 주인공은 흰색·큰 글씨여야 한다.
 */
import sharp from 'sharp';

const FONT = "'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif";
const BG = '#070d1a';
const BG2 = '#111a33';
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
 * ★크기만 줄이면 화면 밖으로 나간다★ 미국편 곁가지가 실제로 오른쪽에서 잘려 "정배열"이
 * 사라졌다. 최소 크기 아래로는 줄이면 안 읽히므로, 그때부터는 글자를 버리고 말줄임표를 붙인다.
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
 * 목록에서 같은 시리즈의 다른 편이라는 것을 알 수가 없다.
 */
const SERIES = 'AI가 추천하는 주식종목';
/**
 * 썸네일 아래쪽에 크게 박는 채널 문구.
 *
 * ★자랑이 아니라 구별이다★ 유튜브 목록에서 주식 썸네일은 다 비슷하게 생겼다. 종목
 * 이름과 숫자만으로는 "또 그런 채널"로 보여서 지나간다. 이 줄은 "여기는 근거를 다
 * 까 놓는 곳"이라는 신호이고, 실제로 그렇게 만들고 있으므로 과장이 아니다.
 */
const BANNER = '진짜 작정하고 공개하는 채널';

/**
 * 곡선이 그려지는 자리 — 아래쪽 띠. 글자와 겹치지 않는 높이로 잡는다.
 *
 * ★오른쪽을 비워 둔다★ 곡선 끝점에 동그라미를 찍는데, 끝을 화면 가장자리(1280)에 두면
 * 그 동그라미가 반쯤 잘린다. 잘린 점은 실수로 보인다. 선은 안쪽에서 끝내고, 면 채우기만
 * 화면 끝까지 늘려 배경처럼 보이게 한다.
 */
const CHART = { x: -40, y: 372, w: 1256, h: 248 };
/** 채널 문구 판 — 곡선 위, 하단 정보 줄(640·690) 위. */
const BANNER_Y = 516;
const BANNER_H = 84;

/**
 * 종가 배열을 부드러운 곡선 path 로. 값이 모자라면 null.
 *
 * 점을 직선으로 이으면 톱니처럼 보이고 60개를 그대로 이으면 썸네일 크기에서 지저분하다.
 * 카트뮬-롬 방식으로 제어점을 잡아 베지에로 그린다.
 */
function sparkPaths(values: number[]): { line: string; area: string; last: { x: number; y: number } } | null {
  const v = values.filter((n) => Number.isFinite(n));
  if (v.length < 8) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pad = 30;
  const pts = v.map((n, i) => ({
    x: CHART.x + (i / (v.length - 1)) * CHART.w,
    y: CHART.y + pad + (1 - (n - min) / span) * (CHART.h - pad * 2),
  }));

  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  // 면은 화면 오른쪽 끝(1280)까지 늘려 잘린 자국이 안 보이게 한다.
  const area = `${line} L 1280 ${pts[pts.length - 1].y.toFixed(1)} L 1280 ${CHART.y + CHART.h} L ${CHART.x} ${CHART.y + CHART.h} Z`;
  return { line, area, last: pts[pts.length - 1] };
}

export async function drawStockThumbnail(opts: {
  /** 제일 크게 박을 한 덩어리 — 종목 이름. 두 줄까지 나눠 쓴다. */
  headline: string;
  /** 이름 아래 칩 한 줄 — 왜 봐야 하는지 (예: "AI 3개 중 2개가 찍었다"). */
  sub?: string;
  /** 우상단 배지 (예: "9/7 한국장"). */
  badge: string;
  /** 오른쪽에 붙는 숫자와 이름 (예: "유가 +9.38%" / "이게 움직였다"). */
  bigValue?: string;
  bigLabel?: string;
  /** 하단에 까는 실제 근거·가격. */
  foot?: string;
  /** 좌하단 (예: "9/5 마감 기준"). */
  dateLabel: string;
  /**
   * 가로로 크게 박는 채널 문구. 빈 문자열이면 안 그린다.
   *
   * ★구독자 0인 채널에서는 종목 이름만으로 안 눌린다★ 목록에 뜬 순간 시청자가 아는
   * 것은 이 채널이 처음 보는 곳이라는 사실뿐이다. 종목 이름은 그 사람이 이미 관심
   * 있는 종목일 때만 후크가 된다. 그래서 "여기는 뭘 하는 곳인가"를 한 줄로 크게 박는다.
   */
  banner?: string;
  /** 그날의 강조색. 없으면 금색. */
  accent?: string;
  /** 배경에 깔 실제 종가 시계열(60거래일). 없으면 곡선 없이 그린다. */
  spark?: number[];
  outPath: string;
}): Promise<void> {
  const { headline, sub = '', badge, bigValue = '', bigLabel = '', foot = '', dateLabel, accent, spark, outPath } = opts;
  const banner = opts.banner ?? BANNER;
  const ACC = /^#[0-9a-f]{6}$/i.test(accent ?? '') ? accent! : '#d9a441';
  const sp = spark?.length ? sparkPaths(spark) : null;

  // ★종목 이름이 길면 줄을 나눈다★ 가운뎃점을 기준으로 두 줄까지 쪼갠다.
  const parts = headline.split(/\s*[·,]\s*/).filter(Boolean);
  const lines: string[] = parts.length >= 2 ? [parts[0], parts.slice(1).join('·')] : [headline];

  const hasBig = Boolean(bigValue);
  const MAXW = hasBig ? 700 : 1150;
  // ★짧은 이름일수록 위험하다★ 상한이 168 이던 시절, "롯데웰푸드" 처럼 다섯 글자짜리
  // 이름은 폭 제한에 걸리지 않아 상한 그대로 그려졌고, 글자 윗선이 위쪽 시리즈 이름
  // ("AI가 추천하는 주식종목", 아랫선 y=96)을 뚫고 올라가 두 글자가 겹쳐 찍혔다. 긴
  // 이름은 저절로 줄어들어 멀쩡했기 때문에 눈에 잘 안 띄는 종류의 깨짐이다. 상한을
  // 겹치지 않는 크기로 낮춘다 — 1280 폭에서 132px 굵은 글씨면 여전히 충분히 크다.
  const size = Math.min(...lines.map((l) => fitSize(l, MAXW, lines.length === 1 ? 132 : 104, 60)));
  const lineH = Math.round(size * 1.1);
  // 이름은 위쪽에 모으고, 아래 띠는 곡선에 내준다. 두 줄이면 그만큼 위에서 시작한다.
  const nameTop = lines.length === 1 ? 238 : 205;
  const chipY = nameTop + (lines.length - 1) * lineH + 44;

  const subFit = sub ? fitText(sub, 900, 50, 30) : { text: '', size: 0 };
  const footFit = foot ? fitText(foot, 1010, 34, 24) : { text: '', size: 0 };
  // 배너는 폭에 맞춰 글자를 줄이고, 판 너비는 글자에 맞춘다(짧으면 판도 짧아진다).
  const bannerFit = banner ? fitText(banner, 1120, 54, 38) : { text: '', size: 0 };
  const bannerW = bannerFit.text ? Math.min(1184, Math.round(bannerFit.size * widthUnits(bannerFit.text) + 76)) : 0;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${BG2}"/><stop offset=".6" stop-color="${BG}"/><stop offset="1" stop-color="#05080f"/>
  </linearGradient>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${ACC}" stop-opacity=".5"/><stop offset="1" stop-color="${ACC}" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${ACC}" stop-opacity=".38"/><stop offset="1" stop-color="${ACC}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#05080f" stop-opacity="0"/><stop offset=".45" stop-color="#05080f" stop-opacity=".82"/><stop offset="1" stop-color="#05080f" stop-opacity=".95"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-60%" width="140%" height="240%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
</defs>

<rect width="1280" height="720" fill="url(#bg)"/>
<!-- 왼쪽 위 은은한 빛 — 완전한 평면은 싸구려로 보인다. -->
<ellipse cx="220" cy="130" rx="560" ry="380" fill="url(#glow)"/>

${
  sp
    ? `<!-- 진짜 주가 곡선(60거래일 종가). 장식이 아니라 이 종목의 실제 데이터다. -->
<path d="${sp.area}" fill="url(#fill)"/>
<path d="${sp.line}" fill="none" stroke="${ACC}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".4" filter="url(#soft)"/>
<path d="${sp.line}" fill="none" stroke="${ACC}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${sp.last.x.toFixed(1)}" cy="${sp.last.y.toFixed(1)}" r="18" fill="${ACC}" opacity=".3"/>
<circle cx="${sp.last.x.toFixed(1)}" cy="${sp.last.y.toFixed(1)}" r="9" fill="${WHITE}"/>`
    : ''
}

<!-- 아래를 덮어 글자가 곡선 위에서도 읽히게 한다. -->
<rect x="0" y="548" width="1280" height="172" fill="url(#veil)"/>

<!-- 왼쪽 세로 띠 — 그날 색. 목록에서 회차끼리 구분되는 단서다. -->
<rect x="0" y="0" width="12" height="720" fill="${ACC}"/>

<!-- 시리즈 이름: 매 회차 같은 자리·같은 글씨. -->
<rect x="60" y="52" width="9" height="44" rx="4" fill="${ACC}"/>
<text x="88" y="90" font-family="${FONT}" font-size="40" font-weight="bold" letter-spacing="2" fill="${ACC}">${esc(SERIES)}</text>

<!-- 우상단 배지: 언제·어느 장을 볼 종목인가. -->
<rect x="942" y="40" width="298" height="74" rx="16" fill="${ACC}"/>
<text x="1091" y="91" font-family="${FONT}" font-size="40" font-weight="bold" fill="#080d18" text-anchor="middle">${esc(badge)}</text>

<!-- 주인공: 종목 이름 -->
${lines
  .map(
    (l, i) =>
      `<text x="60" y="${nameTop + i * lineH}" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${WHITE}">${esc(l)}</text>`,
  )
  .join('\n')}

${
  subFit.text
    ? `<rect x="60" y="${chipY}" width="${Math.min(940, subFit.size * widthUnits(subFit.text) + 56)}" height="${subFit.size + 32}" rx="14" fill="${ACC}"/>
<text x="88" y="${chipY + subFit.size + 2}" font-family="${FONT}" font-size="${subFit.size}" font-weight="bold" fill="#080d18">${esc(subFit.text)}</text>`
    : ''
}

${
  hasBig
    ? (() => {
        // 테두리만 있는 상자로 둔다 — 칩(채운 상자)과 같은 무게로 두면 둘 다 안 보인다.
        const vs = fitSize(bigValue, 340, 72, 40);
        const w = Math.max(300, Math.min(410, vs * widthUnits(bigValue) + 64));
        const x = 1220 - w;
        const h = bigLabel ? 152 : 110;
        return `<rect x="${x}" y="146" width="${w}" height="${h}" rx="18" fill="#080d18" opacity=".72"/>
<rect x="${x}" y="146" width="${w}" height="${h}" rx="18" fill="none" stroke="${ACC}" stroke-width="3"/>
${bigLabel ? `<text x="${x + w / 2}" y="192" font-family="${FONT}" font-size="29" fill="${DIM}" text-anchor="middle">${esc(bigLabel)}</text>` : ''}
<text x="${x + w / 2}" y="${bigLabel ? 264 : 218}" font-family="${FONT}" font-size="${vs}" font-weight="bold" fill="${ACC}" text-anchor="middle">${esc(bigValue)}</text>`;
      })()
    : ''
}

${
  bannerFit.text
    ? `<!-- 채널 문구: 목록에서 이 채널을 구별하게 하는 한 줄. 흰 판에 검은 글씨가 어두운
         배경에서 제일 세게 튄다 — 칩(액센트 채움)과 무게가 겹치지 않게 색을 나눈다. -->
<rect x="48" y="${BANNER_Y}" width="${bannerW}" height="${BANNER_H}" rx="14" fill="${WHITE}"/>
<rect x="48" y="${BANNER_Y}" width="10" height="${BANNER_H}" rx="5" fill="${ACC}"/>
<text x="${48 + bannerW / 2}" y="${BANNER_Y + BANNER_H / 2 + bannerFit.size * 0.36}" font-family="${FONT}" font-size="${bannerFit.size}" font-weight="bold" fill="#0a0f1c" text-anchor="middle">${esc(bannerFit.text)}</text>`
    : ''
}
${footFit.text ? `<text x="60" y="640" font-family="${FONT}" font-size="${footFit.size}" fill="${WHITE}" opacity=".9">${esc(footFit.text)}</text>` : ''}
<text x="60" y="690" font-family="${FONT}" font-size="28" fill="${DIM}">${esc(dateLabel)}</text>
<text x="1224" y="690" font-family="${FONT}" font-size="30" font-weight="bold" fill="${ACC}" text-anchor="end">주식온톨로지</text>
</svg>`;

  // ★density 는 72★ 96 을 주면 sharp 가 1280 짜리를 1707 로 키워 버린다(썸네일 띠에서 당한 적 있다).
  const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== 1280 || meta.height !== 720) throw new Error(`썸네일 크기가 예상과 다릅니다: ${meta.width}x${meta.height}`);
  await sharp(png).toFile(outPath);
}
