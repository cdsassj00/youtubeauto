/**
 * 주식 데일리 썸네일 — 코드로 그린다.
 *
 * ★왜 AI 그림을 안 쓰나★ 이 채널의 썸네일에 들어갈 것은 그림이 아니라 숫자다("어제 3/5
 * 적중"). 생성 이미지는 매번 달라 시리즈가 안 묶이고, 글자를 못 쓰며, 장당 돈이 든다.
 * 코드로 그리면 매일 같은 자리에 같은 크기로 찍힌다.
 *
 * ★유튜브 목록에서 읽히는 크기로만 쓴다★ 썸네일은 대부분 360px 안팎으로 줄어 보인다.
 * 그래서 큰 글씨는 한 덩어리(4~8자)만 두고 나머지는 곁가지로 작게 깐다.
 */
import sharp from 'sharp';

const FONT = "'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif";
const BG = '#070d1a';
const BG2 = '#0c1730';
const CORAL = '#e8564a';
const GOLD = '#d9a441';
const WHITE = '#f2f6ff';
const DIM = '#8fa0c0';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function drawStockThumbnail(opts: {
  headline: string; // 큰 글씨 한 덩어리 (예: "어제 3/5 적중")
  badge: string; // 우상단 (예: "한국")
  names: string[]; // 아래 작은 줄에 깔 종목명
  dateLabel: string; // 좌하단 (예: "8/20")
  outPath: string;
}): Promise<void> {
  const { headline, badge, names, dateLabel, outPath } = opts;
  // 글자 수에 따라 크기를 줄인다 — 고정 크기로 두면 긴 문구가 화면 밖으로 나간다.
  const size = headline.length <= 7 ? 190 : headline.length <= 10 ? 150 : 118;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${BG}"/><stop offset=".55" stop-color="${BG2}"/><stop offset="1" stop-color="${BG}"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/>
<circle cx="80" cy="120" r="8" fill="${CORAL}"/><circle cx="190" cy="204" r="8" fill="${GOLD}"/><circle cx="300" cy="288" r="8" fill="${WHITE}"/>
<line x1="88" y1="126" x2="182" y2="198" stroke="${CORAL}" stroke-width="4" opacity=".6"/>
<line x1="198" y1="210" x2="292" y2="282" stroke="${GOLD}" stroke-width="4" opacity=".6"/>
<rect x="1020" y="52" width="200" height="66" rx="12" fill="none" stroke="${GOLD}" stroke-width="3"/>
<text x="1120" y="97" font-family="${FONT}" font-size="36" fill="${GOLD}" text-anchor="middle">${esc(badge)}</text>
<text x="640" y="400" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${WHITE}" text-anchor="middle">${esc(headline)}</text>
<text x="640" y="500" font-family="${FONT}" font-size="46" fill="${CORAL}" text-anchor="middle">${esc(names.slice(0, 3).join(' · '))}</text>
<text x="60" y="668" font-family="${FONT}" font-size="34" fill="${DIM}">${esc(dateLabel)}</text>
<text x="1220" y="668" font-family="${FONT}" font-size="34" fill="${GOLD}" text-anchor="end">주식온톨로지</text>
</svg>`;

  // ★density 는 72★ 96 을 주면 sharp 가 1280 짜리를 1707 로 키워 버린다(썸네일 띠에서 당한 적 있다).
  const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== 1280 || meta.height !== 720) throw new Error(`썸네일 크기가 예상과 다릅니다: ${meta.width}x${meta.height}`);
  await sharp(png).toFile(outPath);
}
