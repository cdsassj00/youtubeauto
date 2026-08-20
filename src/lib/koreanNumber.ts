/**
 * 나레이션에 들어가는 숫자를 소리 나는 대로 바꾼다.
 *
 * ★TTS 는 숫자를 알아서 읽어 주지 않는다★ "102,000원"을 넘기면 쉼표에서 끊기거나 자릿수를
 * 뭉개고, "-2.04%"의 마이너스는 아예 빠지거나 "대시"로 읽힌다. 주식 채널에서 부호가 사라지면
 * 오르는 종목과 내리는 종목이 뒤바뀐다. 그래서 음성으로 넘기기 전에 한국어 수사로 바꾼다.
 * 화면 자막에는 원래 숫자를 그대로 두는 것이 맞으므로, 이 변환은 나레이션에만 쓴다.
 *
 * ★한자어와 고유어를 가려 쓴다★ "5개"는 "오 개"가 아니라 "다섯 개"다. 단위(의존명사)에 따라
 * 어느 쪽을 쓰는지가 정해져 있어서, 한쪽으로 통일하면 절반이 어색해진다.
 */

const SINO_DIGIT = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const NATIVE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
/** 고유어 수사를 쓰는 단위. "다섯 개"는 맞지만 "오 개"는 어색하다. */
const NATIVE_UNITS = ['개', '가지', '곳', '장', '명', '번째', '달', '살', '종목'];

/** 0~9999 를 한자어로. (만 단위 묶음 하나) */
function sinoUnder10k(n: number): string {
  if (n === 0) return '';
  const digits = [
    [1000, '천'],
    [100, '백'],
    [10, '십'],
  ] as const;
  let out = '';
  let rest = n;
  for (const [base, label] of digits) {
    const q = Math.floor(rest / base);
    if (q > 0) {
      // 1천·1백·1십은 "천·백·십"으로 읽는다 — "일천"은 어색하다.
      out += (q === 1 ? '' : SINO_DIGIT[q]) + label;
      rest -= q * base;
    }
  }
  if (rest > 0) out += SINO_DIGIT[rest];
  return out;
}

/** 정수를 한자어 수사로. 만·억·조 단위로 끊어 읽는다. */
export function sino(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return '영';
  const neg = n < 0;
  let rest = Math.floor(Math.abs(n));
  const groups = ['', '만', '억', '조', '경'];
  const parts: string[] = [];
  let g = 0;
  while (rest > 0 && g < groups.length) {
    const chunk = rest % 10000;
    if (chunk > 0) parts.unshift(sinoUnder10k(chunk) + groups[g]);
    rest = Math.floor(rest / 10000);
    g++;
  }
  return (neg ? '마이너스 ' : '') + parts.join(' ');
}

/** 소수점 아래는 자릿수를 하나씩 읽는다 — "이 점 영사". */
function decimals(frac: string): string {
  return frac
    .split('')
    .map((d) => SINO_DIGIT[Number(d)] ?? d)
    .join('');
}

/**
 * 문장 안의 숫자를 전부 읽을 수 있는 말로 바꾼다.
 *
 * 부호(+/-)·천단위 쉼표·소수점·단위를 한 덩어리로 잡아 처리한다. 붙어 있는 단위를 같이
 * 봐야 "5개"(다섯 개)와 "5%"(오 퍼센트)를 가를 수 있다.
 */
export function speakNumbers(text: string): string {
  // 물결표는 범위다. "6~13일" 이 "육 물결 십삼일" 로 읽히지 않게 먼저 푼다.
  text = text.replace(/(\d)\s*[~∼]\s*(\d)/g, '$1에서 $2');

  // ★숫자만 바꾸고 뒤 글자는 손대지 않는다★ 처음에는 뒤에 붙은 한글을 "단위"로 같이 잡아
  // 다시 붙였는데, "0.49입니다" 의 "입니다"까지 단위로 보고 "영 점 사구 입니다" 로 띄워
  // 버렸다. 뒤 글자는 원문 그대로 두고, 고유어를 쓸지 정할 때만 들여다본다.
  return text.replace(
    /([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%)?/g,
    (m, sign: string, intRaw: string, frac: string | undefined, pct: string | undefined, offset: number, whole: string) => {
      const digits = intRaw.replace(/,/g, '');
      const n = Number(digits);
      const signWord = sign === '-' ? '마이너스 ' : sign === '+' ? '플러스 ' : '';
      const tail = pct ? ' 퍼센트' : '';
      const next = whole.slice(offset + m.length);

      // 소수는 언제나 한자어 + "점".
      if (frac) return `${signWord}${sino(n)} 점 ${decimals(frac)}${tail}`;

      // 바로 뒤에 오는 의존명사가 고유어를 쓰는 것이면 고유어로 읽는다("오 개"가 아니라 "다섯 개").
      // 열 이하만 바꾼다 — 그 위는 한자어가 더 자연스럽다.
      if (!pct && n >= 1 && n <= 10 && NATIVE_UNITS.some((u) => next.startsWith(u))) {
        return `${signWord}${NATIVE[n]} `;
      }
      return `${signWord}${sino(n)}${tail}`;
    },
  );
}

/** "1번째" 처럼 서수로 읽어야 하는 자리. */
export function ordinal(n: number): string {
  // "한 번째" 가 아니라 "첫 번째" 다 — 1 만 예외다.
  if (n === 1) return '첫 번째';
  return n >= 2 && n <= 10 ? `${NATIVE[n]} 번째` : `${sino(n)} 번째`;
}
