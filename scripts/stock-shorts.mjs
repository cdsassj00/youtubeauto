// 주식 쇼츠 — 사이트 공식 추천(/api/daily-brief 의 horizons) 을 30초 세로 영상으로 만들어 올린다.
//
//   STOCK_MARKET=KR npx tsx scripts/stock-shorts.mjs            # 만들고 올린다(TARGET_CHANNEL 채널)
//   STOCK_MARKET=US DO_UPLOAD=false npx tsx scripts/stock-shorts.mjs   # 만들기만
//   STOCK_BRIEF_FILE=brief.json ... — 저장해 둔 응답으로(시험용, 날짜 검사 생략)
//
// ★미드폼을 대신한다★ 8분짜리는 나레이션(ElevenLabs)과 대본(Claude) 비용만 들고 보는 사람이 적었다.
// 이 쇼츠는 AI 대본도 목소리도 쓰지 않는다 — 화면과 합성 비트뿐이라 한 편에 드는 돈이 없다.
//
// ★사이트 추천을 그대로 쓴다★ 종목·목표가·손절가는 horizons.buckets[].picks[].plan 에서 옮기고,
// 영상이 따로 고르거나 계산하지 않는다. 사이트 화면과 영상이 다른 종목을 말하는 일이 없게.
// ★성적 숫자는 쓰지 않는다★ buckets[].track(백테스트 수익률)·league·previous·backtestMeasuredAt 은
// 과거 시세로 흉내 낸 성적이라 공개 콘텐츠에 넣지 않기로 했다. holdKo("실측 평균 2~3일")도 같은 이유로 뺀다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freshnessProblem } from '../src/lib/stockBrief.js';
import { uploadVideo, listRecentVideoTitles } from '../src/lib/youtube.js';
import { config } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.STOCK_API_BASE ?? 'https://stockontology.cc';
const MARKET = (process.env.STOCK_MARKET ?? 'KR').toUpperCase();
const PER_BUCKET = 3; // 30초에 읽히는 양 — 구간당 3종목, 나머지는 사이트로 보낸다
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 금액 — 응답의 priceLabel 은 미국이 "94.76$" 로 와서 쓰지 않고 시장 관례대로 다시 쓴다(값은 그대로). */
const money = (m, n) => (m === 'US' ? `$${Number(n).toFixed(2)}` : `${Math.round(n).toLocaleString('ko-KR')}원`);
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const mdDay = (iso) => `${md(iso)} ${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]}요일`;

/** 규칙 첫 두 마디만 — "익절 +15% · 손절 −4%", 장기는 "익절 없음 · 고점 대비 −25% 추적손절". */
const ruleShort = (b) => (b.ruleKo ?? '').split('·').slice(0, 2).map((s) => s.trim()).join(' · ');

/** 응답 → 화면 데이터. 순수 함수(파일·네트워크 없음). */
export function buildShortData(brief, date) {
  const m = brief.market;
  const buckets = brief.horizons?.buckets ?? [];
  if (!buckets.length) throw new Error('horizons.buckets 가 비어 있습니다 — 사이트 응답 모양을 확인하세요.');
  // 여러 구간에 동시에 오른 종목 — 구간마다 상위 8개 기준으로 센다(화면에는 "N구간 공통" 표시).
  const seen = new Map();
  for (const b of buckets) for (const p of b.picks ?? []) seen.set(p.code, (seen.get(p.code) ?? 0) + 1);
  const target = brief.targetSession ?? date;
  return {
    market: m,
    marketKo: brief.marketKo,
    nextLabel: mdDay(target),
    dataLabel: `${md(brief.dataSessionDate ?? date)} 마감 기준`,
    regime: brief.regime?.label ?? '',
    buckets: buckets.map((b) => ({
      id: b.id,
      nameKo: b.nameKo,
      rule: ruleShort(b),
      picks: (b.picks ?? []).slice(0, PER_BUCKET).map((p) => ({
        rank: p.rank,
        name: p.name,
        ticker: m === 'US' ? p.code : '',
        sector: p.sector ?? '',
        priceLabel: money(m, p.price),
        changePct: p.changePct,
        target: p.plan?.target != null ? money(m, p.plan.target) : '',
        targetPct: p.plan?.targetPct ?? null,
        stop: p.plan?.stop != null ? money(m, p.plan.stop) : '',
        stopPct: p.plan?.stopPct ?? null,
        trailing: b.id === 'long',
        common: (seen.get(p.code) ?? 0) >= 2 ? seen.get(p.code) : 0,
      })),
    })),
  };
}

/** 제목·설명·태그. 성적 숫자 없이 "언제 · 무엇을 · 얼마에" 만. */
export function buildMeta(brief, data) {
  const m = brief.market;
  const short = (p) => (m === 'US' && p.ticker ? p.ticker : p.name);
  // 제목의 종목 — 단타 1·2위(가장 먼저 보이는 구간). 미국은 티커가 짧아 셋까지.
  const lead = data.buckets[0].picks.slice(0, m === 'US' ? 3 : 2).map(short);
  const title = `${data.nextLabel.replace('요일', '')} ${data.marketKo}장 볼 종목 — ${lead.join('·')} | 목표가·손절가 #Shorts`.slice(0, 100);
  const lines = [
    `${data.nextLabel} ${data.marketKo}장에서 볼 종목입니다. (${data.dataLabel})`,
    `stockontology.cc 공식 추천을 단타·스윙·중기·장기 네 구간으로 그대로 옮겼습니다.`,
    '',
  ];
  for (const b of brief.horizons.buckets) {
    lines.push(`■ ${b.nameKo} — ${ruleShort(b)}`);
    for (const p of (b.picks ?? []).slice(0, 5)) {
      const pl = p.plan ?? {};
      const tgt = pl.target != null ? `목표 ${money(m, pl.target)}(${pl.targetPct > 0 ? '+' : ''}${pl.targetPct}%)` : '목표가 없음';
      const stp = pl.stop != null ? `${b.id === 'long' ? '추적손절' : '손절'} ${money(m, pl.stop)}(${pl.stopPct}%)` : '';
      lines.push(`${p.rank}. ${p.name}${m === 'US' ? ` (${p.code})` : ''} ${money(m, p.price)} · ${tgt} · ${stp}`);
    }
    lines.push('');
  }
  lines.push(
    '구간마다 8종목 전체와 고른 근거: https://stockontology.cc',
    '',
    '공개 데이터를 그대로 옮긴 것이며 투자 자문·권유가 아닙니다. 판단과 책임은 보시는 분께 있습니다.',
  );
  const names = [...new Set(data.buckets.flatMap((b) => b.picks.map(short)))];
  const tags = ['주식온톨로지', '종목추천', '목표가', '손절가', m === 'US' ? '미국주식' : '한국주식', 'Shorts', ...names].slice(0, 15);
  return { title, description: lines.join('\n').slice(0, 4800), tags };
}

async function fetchBrief() {
  if (process.env.STOCK_BRIEF_FILE) {
    const d = JSON.parse(await fs.readFile(process.env.STOCK_BRIEF_FILE, 'utf8'));
    return { date: d.date, brief: d.briefs[0], fromFile: true };
  }
  // ★cb 를 붙인다★ 앞단 5분 캐시 때문에 갱신 직전 값을 받을 수 있다.
  const url = `${BASE}/api/daily-brief?market=${MARKET}&cb=${Date.now()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const d = await res.json();
      const brief = d.briefs?.[0];
      if (!brief) throw new Error(`daily-brief 응답에 ${MARKET} 블록이 없습니다.`);
      return { date: d.date, brief, fromFile: false };
    }
    if (res.status < 500 || attempt === 1) throw new Error(`${url} → HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error('unreachable');
}

async function skip(reason) {
  console.log(`⏭ 오늘은 올리지 않습니다 — ${reason}`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `⏭ ${MARKET} 건너뜀 — ${reason}\n`);
  process.exit(0);
}

async function main() {
  const { date, brief, fromFile } = await fetchBrief();
  // ★낡은 값으로 내보내지 않는다★ 데일리와 같은 규칙: 오늘 날짜 · 마감 확정 · 장중 아님 · 시세 12시간 이내.
  if (!fromFile) {
    const stale = freshnessProblem(date, brief);
    if (stale) await skip(stale);
  }
  const data = buildShortData(brief, date);
  const meta = buildMeta(brief, data);
  console.log(`▶ ${MARKET} ${date} · ${data.regime}`);
  for (const b of data.buckets) console.log(`  · ${b.nameKo}: ${b.picks.map((p) => p.name).join(', ')}`);
  console.log(`  · 제목: ${meta.title}`);

  if (config.doUpload) {
    try {
      const recent = await listRecentVideoTitles(100);
      if (recent.some((t) => t.slice(0, 100) === meta.title)) await skip('같은 제목이 이미 채널에 있습니다.');
    } catch (e) {
      console.warn(`  · 최근 제목을 못 읽어 중복 검사를 건너뜁니다 — ${e.message}`);
    }
  }

  // 화면 데이터 → 차트 HTML 옆에 둔다(render.mjs 가 file:// 로 연다)
  const chartDir = path.join(ROOT, 'shorts-charts', 'charts');
  await fs.writeFile(path.join(chartDir, 'stock-data.js'), `window.STOCK = ${JSON.stringify(data)};\n`);
  const outDir = path.join(ROOT, 'out', 'stock-shorts');
  await fs.mkdir(outDir, { recursive: true });
  const silent = path.join(outDir, `${MARKET}-${date}-silent.mp4`);
  const final = path.join(outDir, `${MARKET}-${date}.mp4`);
  const run = (args) => execFileSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  const log = run(['shorts-charts/render.mjs', 'shorts-charts/charts/stock-horizons.html', silent]);
  const hits = (/임팩트 시각\(bgm\.hits\): (\[[^\]]*\])/.exec(log)?.[1]) ?? '[]';
  // 한국·미국편 비트를 다르게 — 같은 시리즈라도 소리가 겹치지 않게
  run(['shorts-charts/finish.mjs', silent, final, '--hits', JSON.parse(hits).join(','), '--bpm', MARKET === 'US' ? '112' : '120', '--key', MARKET === 'US' ? '-2' : '0']);
  await fs.rm(silent, { force: true });
  await fs.writeFile(path.join(outDir, `${MARKET}-${date}.json`), JSON.stringify({ meta, data }, null, 2));
  console.log(`  · 영상: ${path.relative(ROOT, final)}`);

  if (!config.doUpload) {
    console.log('  · DO_UPLOAD=false → 업로드 건너뜀');
    return;
  }
  const videoId = await uploadVideo({ videoPath: final, script: meta });
  console.log(`  · 업로드 완료: https://youtu.be/${videoId} (${config.youtubePrivacyStatus})`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `- ${MARKET} ${meta.title} → https://youtu.be/${videoId}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
}
