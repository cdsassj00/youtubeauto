// 누적 비용 — 실행마다 남긴 "사용량 아티팩트"의 이름을 합산한다.
// 아티팩트 이름에 숫자를 넣어두면 zip 을 풀지 않고 목록 조회만으로 집계할 수 있다
// (서버리스 함수에서 파일을 내려받아 압축을 푸는 건 느리고 비싸다).
//
// 단가는 계정 요금제마다 다르므로 환경변수로 받는다. 아래 기본값은 공개 정가 기준의
// "대략치"이므로, 정확한 금액이 필요하면 Vercel 환경변수로 실제 단가를 넣어야 한다.
const PRICE = {
  // Claude Opus 4.8 — 100만 토큰당 달러
  claudeIn: Number(process.env.PRICE_CLAUDE_IN || 5),
  claudeOut: Number(process.env.PRICE_CLAUDE_OUT || 25),
  // 리서치용 저가 모델 — 100만 토큰당 달러
  openaiIn: Number(process.env.PRICE_OPENAI_IN || 0.4),
  openaiOut: Number(process.env.PRICE_OPENAI_OUT || 1.6),
  // 썸네일 이미지 — 장당 달러
  image: Number(process.env.PRICE_IMAGE || 0.19),
  // TTS — 1000자당 달러
  tts1k: Number(process.env.PRICE_TTS_1K || 0.22),
  usdKrw: Number(process.env.USD_KRW || 1380),
};

export default async function handler(req, res) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }

  // 아티팩트는 보존기간이 지나면 사라진다 — 그 이전 실행은 집계에서 빠진다는 뜻이라 함께 알린다.
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/artifacts?per_page=100`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `아티팩트 조회 실패 (${r.status})`, detail: detail.slice(0, 200) });
  }
  const { artifacts = [] } = await r.json();

  const num = (name, key) => {
    const m = name.match(new RegExp(`__${key}-(\\d+)`));
    return m ? Number(m[1]) : 0;
  };

  const runs = [];
  let ci = 0, co = 0, oi = 0, oo = 0, img = 0, tts = 0;
  for (const a of artifacts) {
    if (!a.name.startsWith('usage__') || a.expired) continue;
    const e = {
      at: a.created_at,
      claudeIn: num(a.name, 'ci'), claudeOut: num(a.name, 'co'),
      openaiIn: num(a.name, 'oi'), openaiOut: num(a.name, 'oo'),
      images: num(a.name, 'img'), ttsChars: num(a.name, 'tts'),
    };
    e.usd = cost(e);
    runs.push(e);
    ci += e.claudeIn; co += e.claudeOut; oi += e.openaiIn; oo += e.openaiOut;
    img += e.images; tts += e.ttsChars;
  }

  const total = { claudeIn: ci, claudeOut: co, openaiIn: oi, openaiOut: oo, images: img, ttsChars: tts };
  const usd = cost(total);

  return res.status(200).json({
    runs: runs.length,
    total,
    breakdown: {
      claude: r6(((ci * PRICE.claudeIn) + (co * PRICE.claudeOut)) / 1e6),
      openai: r6(((oi * PRICE.openaiIn) + (oo * PRICE.openaiOut)) / 1e6),
      image: r6(img * PRICE.image),
      tts: r6((tts / 1000) * PRICE.tts1k),
    },
    usd: r6(usd),
    krw: Math.round(usd * PRICE.usdKrw),
    price: PRICE,
    note: '아티팩트 보존기간(90일)이 지난 실행은 집계에서 빠집니다. 단가는 환경변수로 조정하세요.',
    recent: runs.slice(0, 20),
  });
}

function cost(t) {
  return (
    ((t.claudeIn * PRICE.claudeIn + t.claudeOut * PRICE.claudeOut) / 1e6) +
    ((t.openaiIn * PRICE.openaiIn + t.openaiOut * PRICE.openaiOut) / 1e6) +
    (t.images * PRICE.image) +
    ((t.ttsChars / 1000) * PRICE.tts1k)
  );
}
const r6 = (n) => Math.round(n * 1e6) / 1e6;
