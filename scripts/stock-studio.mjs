// 주식 쇼츠 — "매일 AI 뉴스" 모양(video-studio 모션 ainews 프리셋)으로: 나레이션 + 장면 14개 + 단어 자막.
//
//   STOCK_MARKET=KR npx tsx scripts/stock-studio.mjs                 # 만들고 올린다(TARGET_CHANNEL 채널)
//   STOCK_MARKET=US DO_UPLOAD=false npx tsx scripts/stock-studio.mjs # 만들기만
//   STOCK_BRIEF_FILE=brief.json STOCK_FAKE_TTS=1 DO_UPLOAD=false ... # 시험: 저장한 응답 + 무음 가짜 나레이션(돈 안 듦)
//
// ★영상 엔진은 video-studio 저장소★ (VIDEO_STUDIO_DIR, 워크플로우가 고정 커밋으로 받아 둔다). 여기서는
// 사이트 응답 → 대본·장면 데이터만 만들고, 나레이션·렌더·소리·QA 는 `python -m studio` 가 한다.
// ★대본도 AI 가 쓰지 않는다★ 문장 틀은 고정, 숫자·종목만 응답에서 채운다 — 대본 비용 0, 사이트와 영상이 늘 같은 말.
// ★비용★ 나레이션(ElevenLabs) 300자 안팎 한 번뿐. 배경음악은 합성(무료) — STOCK_MUSIC=api 일 때만 ElevenLabs 음악.
// ★성적 숫자는 쓰지 않는다★ track·league·previous·backtestMeasuredAt·holdKo 는 공개 콘텐츠에 넣지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freshnessProblem } from '../src/lib/stockBrief.js';
import { uploadVideo, listRecentVideoTitles } from '../src/lib/youtube.js';
import { config } from '../src/config.js';
import { buildShortData, buildMeta, fetchBrief, skip, money } from './stock-shorts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKET = (process.env.STOCK_MARKET ?? 'KR').toUpperCase();
const VS = path.resolve(process.env.VIDEO_STUDIO_DIR ?? path.join(ROOT, '.video-studio'));
const PY = process.env.PYTHON ?? 'python3';
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const TABS = ['단타', '스윙', '중기', '장기'];
const STYLES = ['motion:ainews', 'whiteboard', 'scrapbook'];
const KOR_COUNT = { 2: '두', 3: '세', 4: '네' };

/** 말로 읽을 이름 — 마침표·쉼표가 들어가면 문장·자막이 거기서 끊긴다. */
const say = (name) => String(name).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
/** 말로 읽을 금액 — 미국은 센트까지 읽으면 길어서 달러 반올림. */
const sayMoney = (m, v) => (m === 'US' ? `${Math.round(v)}달러` : `${Math.round(v).toLocaleString('ko-KR')}원`);

/**
 * 근거 한 줄 why.ontologyKo 를 읽는다. 모양: "유가(WTI) +10.41% → 정유화학 민감도 +0.65",
 * "나스닥 -4.48% → -0.25", "변동성(VIX) +34.7% (위험선호 경로) → -0.55". 못 읽으면 null(근거 장면은 1위 카드로 대신).
 */
export function parseReason(s, sector) {
  const m = /^(.+?)\s*([+\-−]?\d+(?:\.\d+)?)%.*?→\s*(?:(.+?)\s*민감도\s*)?([+\-−]?\d+(?:\.\d+)?)\s*$/.exec(s ?? '');
  if (!m) return null;
  const num = (x) => Number(x.replace('−', '-'));
  const raw = m[1].trim();
  const base = raw.replace(/\(.*?\)/g, '').trim();
  const spoken = { 변동성: '변동성 지수', '원/달러': '원달러 환율' }[base] ?? base;
  return { label: raw.replace('(', ' ('), spoken, pct: num(m[2]), sector: (m[3] ?? sector ?? '').trim() || sector, sens: num(m[4]) };
}

/** 응답 → 대본(문장별 단어) + 장면 데이터 D. 순수 함수. */
export function buildEpisode(brief, date) {
  const m = brief.market;
  const B = Object.fromEntries((brief.horizons?.buckets ?? []).map((b) => [b.id, b]));
  for (const id of ['day', 'swing', 'mid', 'long']) if (!B[id]?.picks?.length) throw new Error(`horizons.${id} 가 비어 있습니다.`);
  const order = [B.day, B.swing, B.mid, B.long];
  const tops = order.map((b) => b.picks[0]);
  const same = tops.every((p) => p.code === tops[0].code);
  const top = B.day.picks[0];
  const second = B.day.picks[1] ?? B.day.picks[0];
  const inBucket = order.map((b) => b.picks.some((p) => p.code === second.code));
  const count = inBucket.filter(Boolean).length;
  const target = brief.targetSession ?? date;
  const wd = WEEKDAY[new Date(`${target}T00:00:00Z`).getUTCDay()];
  const marketWord = m === 'US' ? '미국장' : '한국장';
  const reason = parseReason(top.why?.ontologyKo, top.sector);
  const dayPlan = top.plan ?? {};
  const midTop = B.mid.picks[0];
  const longTop = B.long.picks[0];
  const longStop = Math.abs(Math.round(longTop.plan?.stopPct ?? -25));
  const sup = dayPlan.nearestSupport ?? null;
  const res = dayPlan.nearestResistance ?? null;
  // 구간별로 아직 말하지 않은 종목 하나씩(스윙·장기) — 같은 이름만 되풀이하지 않게
  const said = new Set([top.code, second.code]);
  const pickNew = (b) => { const p = b.picks.find((x) => !said.has(x.code)) ?? b.picks[Math.min(2, b.picks.length - 1)]; said.add(p.code); return p; };
  const exSwing = pickNew(B.swing);
  const exLong = pickNew(B.long);
  const [p1, p2] = String(brief.regime?.label ?? '').split('—').map((x) => x.trim());
  const pctWord = (v) => `${Math.abs(Math.round(v))}%`;

  // ── 대본: 문장 틀은 고정, 값만 채운다. S = 문장 이름 → 번호(장면이 이 번호로 시작한다)
  const sentences = [];
  const S = {};
  const add = (key, text) => { if (key) S[key] = sentences.length; sentences.push(text.split(/\s+/).filter(Boolean)); };
  add(null, '단타, 스윙, 중기, 장기.');
  add('hook', same ? '네 구간 모두 1위가 같은 종목입니다.' : '구간마다 1위가 다릅니다.');
  add('site', `${wd}요일 ${marketWord}, 주식온톨로지 추천입니다.`);
  add('top', same ? `1위는 ${say(top.name)}.` : `단타 1위는 ${say(top.name)}.`);
  add('reason', reason
    ? `근거는 ${reason.spoken} ${Math.abs(reason.pct).toFixed(1)}% ${reason.pct >= 0 ? '상승,' : '하락,'} ${reason.sector} 민감도입니다.`
    : `${top.sector} 업종입니다.`);
  add('second', count === 4 ? `2위 ${say(second.name)}도 네 구간 공통입니다.`
    : count >= 2 ? `2위 ${say(second.name)}도 ${KOR_COUNT[count]} 구간에 올랐습니다.` : `2위는 ${say(second.name)}입니다.`);
  add('day', `단타는 목표 ${pctWord(dayPlan.targetPct)}, 손절 ${pctWord(dayPlan.stopPct)}.`);
  if (sup || res) {
    add('levels', sup && res ? `바로 아래 지지선은 ${sayMoney(m, sup.price)}, 위 저항선은 ${sayMoney(m, res.price)}입니다.`
      : sup ? `바로 아래 지지선은 ${sayMoney(m, sup.price)}입니다.` : `위 저항선은 ${sayMoney(m, res.price)}입니다.`);
  }
  add('mid', `중기는 목표 ${pctWord(midTop.plan.targetPct)}, 손절 ${pctWord(midTop.plan.stopPct)}.`);
  add('longNo', '장기는 목표가 없습니다.');
  add('trail', `고점에서 ${longStop}% 빠지면 정리합니다.`);
  add('extras', `스윙 ${exSwing.rank}위는 ${say(exSwing.name)}, 장기 ${exLong.rank}위는 ${say(exLong.name)}입니다.`);
  add('regime', p2 ? `지금 시장은 ${p1}, ${p2}입니다.` : `지금 시장은 ${p1 || '관망 국면'}입니다.`);
  // 마무리 — 자세한 분석은 사이트·텔레그램(프로필 링크)으로 보낸다. 화면에 두 주소를 크게 띄운다.
  add('ask', '더 자세한 종목 분석은 프로필 링크에서 보세요.');
  add('end', 'AI 전문가가 만듭니다.');

  // ── 단어 번호(words.json 순서 = 대본 단어 순서) → 장면 시간 지정 'wN'
  const flat = sentences.flat();
  const base = sentences.map((_, i) => sentences.slice(0, i).reduce((a, s) => a + s.length, 0));
  const w = (key, pred) => { const i = sentences[S[key]].findIndex(pred); return i < 0 ? `s${S[key]}` : `w${base[S[key]] + i}`; };
  const has = (s) => (t) => t.includes(s);
  const firstOf = (name) => has(say(name).split(' ')[0]);
  const T = {
    w0: 'w0', w1: 'w1', w2: 'w2', w3: 'w3',
    same: w('hook', same ? has('같은') : has('다릅니다')),
    site: w('site', has('주식온톨로지')),
    move: reason ? w('reason', has('%')) : null,
    fill: reason ? w('reason', has('민감도')) : null,
    second: w('second', firstOf(second.name)),
    t0: w('day', has(pctWord(dayPlan.targetPct))),
    s0: `e${S.day}`,
    sup: sup ? w('levels', has('지지선')) : null,
    res: res ? w('levels', has('저항선')) : null,
    t1: w('mid', has(pctWord(midTop.plan.targetPct))),
    s1: `e${S.mid}`,
    ex0: w('extras', firstOf(exSwing.name)),
    ex1: w('extras', (t, i, arr) => i > arr.findIndex(has('장기')) && firstOf(exLong.name)(t)),
    regime: w('regime', has((p1 || '관망').split(' ')[0])),
    link: w('ask', has('프로필')),
  };

  const level = (lv) => (lv ? { price: lv.price, label: lv.label ?? '' } : null);
  const ladder = (tab, p, extra = {}) => ({ tab, name: p.name, now: p.price, target: p.plan.target, tp: Math.round(p.plan.targetPct), stop: p.plan.stop, sp: Math.round(p.plan.stopPct), ...extra });
  const D = {
    market: m,
    month: `${Number(target.slice(5, 7))}월`,
    day: String(Number(target.slice(8, 10))),
    dayLabel: `${wd}요일 · ${marketWord}`,
    dataLabel: `${Number((brief.dataSessionDate ?? date).slice(5, 7))}/${Number((brief.dataSessionDate ?? date).slice(8, 10))} 마감 기준`,
    tops: tops.map((p) => p.name),
    same,
    top: { name: top.name, sector: top.sector ?? '', price: money(m, top.price) },
    topLabel: same ? '네 구간 1위' : '단타 1위',
    reason,
    second: { name: second.name, in: inBucket, count },
    secondLabel: count >= 2 ? `2위 · ${count}구간 공통` : '단타 2위',
    ladders: [ladder('단타', top, { sup: level(sup), res: level(res) }), ladder('중기', midTop)],
    longStop,
    extras: [
      { tab: '스윙', rank: exSwing.rank, name: exSwing.name, line: `${money(m, exSwing.price)} → 목표 ${money(m, exSwing.plan.target)}` },
      { tab: '장기', rank: exLong.rank, name: exLong.name, line: `${money(m, exLong.price)} · 추적손절 ${money(m, exLong.plan.stop)}` },
    ],
    regime: { dir: /회피/.test(p1 ?? '') ? 1 : /선호/.test(p1 ?? '') ? -1 : 0, stamp: p2 ?? '' },
    T, S,
  };
  const keywords = flat.filter((t) => /%|위가|원,?$|달러/.test(t) || t.startsWith(say(top.name).split(' ')[0]) || t.startsWith(say(second.name).split(' ')[0]));
  const titleLines = [`${md(target)} ${wd} ${marketWord}`, same ? '<y>네 구간 모두 1위</y>' : '<y>구간별 1위 종목</y>'];
  return { script: sentences.map((s) => s.join(' ')).join(' '), sentences, D, keywords: [...new Set(keywords)], titleLines };
}
/**
 * 오늘의 화면 스타일 — 한 가지만 고집하지 않는다. 날짜(+시장)로 돌려서 같은 날 한국·미국편도 다르게.
 * STOCK_STYLE 로 고정할 수 있다(시험·재발행). 후보는 STOCK_STYLES(쉼표) 로 바꿀 수 있다.
 */
export function pickStyle(date, market = MARKET) {
  if (process.env.STOCK_STYLE) return process.env.STOCK_STYLE;
  const list = (process.env.STOCK_STYLES ?? STYLES.join(',')).split(',').map((x) => x.trim()).filter(Boolean);
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return list[(day + (market === 'US' ? 1 : 0)) % list.length];
}
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

function factsMd(brief, date, ep) {
  const rows = ep.sentences.map((s, i) => `| ${i} | ${s.join(' ')} |`).join('\n');
  return `# Facts — 주식 쇼츠 (주식온톨로지 공식 추천 그대로)\n출처: https://stockontology.cc/api/daily-brief?market=${brief.market} ` +
    `(date ${date}, dataSessionDate ${brief.dataSessionDate}, targetSession ${brief.targetSession})\n` +
    '모든 숫자는 응답 값을 그대로 옮겼다(대본은 고정 틀). 백테스트 성적은 쓰지 않는다.\n\n| # | 문장 |\n|---|---|\n' + rows + '\n';
}

/** 시험용 — 나레이션 없이 화면만 볼 때. 글자당 0.11초 가짜 정렬 + 무음 mp3(ElevenLabs 를 부르지 않는다). */
function fakeTts(script) {
  const ch = [], st = [], en = []; let t = 0;
  for (const c of script) { ch.push(c); st.push(+t.toFixed(3)); t += c === ' ' ? 0.06 : /[.?!]/.test(c) ? 0.3 : 0.11; en.push(+t.toFixed(3)); }
  return { alignment: { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en }, dur: t + 0.3 };
}

async function main() {
  const { date, brief, fromFile } = await fetchBrief();
  if (!fromFile) {
    const stale = freshnessProblem(date, brief);
    if (stale) await skip(stale);
  }
  const data = buildShortData(brief, date);
  const meta = buildMeta(brief, data);
  const ep = buildEpisode(brief, date);
  console.log(`▶ ${MARKET} ${date} · ${data.regime}`);
  console.log(`  · 대본(${ep.script.length}자): ${ep.script}`);
  console.log(`  · 제목: ${meta.title}`);

  if (config.doUpload) {
    try {
      const recent = await listRecentVideoTitles(100);
      if (recent.some((t) => t.slice(0, 100) === meta.title)) await skip('같은 제목이 이미 채널에 있습니다.');
    } catch (e) {
      console.warn(`  · 최근 제목을 못 읽어 중복 검사를 건너뜁니다 — ${e.message}`);
    }
  }

  // ── video-studio 에피소드 폴더
  const slug = `stock-${date}-${MARKET.toLowerCase()}`;
  const rel = path.join('episodes', slug);
  const epDir = path.join(VS, rel);
  const studio = (args, env = process.env) => execFileSync(PY, ['-m', 'studio', ...args], { cwd: VS, env, stdio: ['ignore', 'inherit', 'inherit'] });
  await fs.rm(epDir, { recursive: true, force: true });
  const [style, preset] = pickStyle(date).split(':');
  console.log(`  · 오늘 스타일: ${style}${preset ? ':' + preset : ''}`);
  studio(['new', rel, '--style', style, ...(preset ? ['--preset', preset] : [])]);
  const json = async (f) => JSON.parse(await fs.readFile(path.join(epDir, f), 'utf8'));
  const save = (f, v) => fs.writeFile(path.join(epDir, f), typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  await save('script.txt', ep.script + '\n');
  await save('facts.md', factsMd(brief, date, ep));
  await save('metadata.json', { ...(await json('metadata.json')), title: meta.title, description: meta.description, tags: meta.tags,
    video_title_lines: ep.titleLines, subtitle_keywords: ep.keywords, thumbnail_time: 3.0, categoryId: '27' });
  await save('episode.json', { ...(await json('episode.json')), keywords: ep.keywords,
    footer: ['주식온톨로지 · Work by AX', '※ 투자 권유 아님 · 판단과 책임은 본인에게'] });
  const tpl = await fs.readFile(path.join(ROOT, 'scripts', 'stock-studio', 'scenes.template.js'), 'utf8');
  const D = { ...ep.D, theme: style === 'motion' ? 'dark' : 'light' };
  await save('scenes.js', tpl.replace('/*__DATA__*/', `const D = ${JSON.stringify(D)};`));

  // ── 나레이션 → 단어 시간·자막. 시험 모드는 가짜 정렬 + 무음.
  if (process.env.STOCK_FAKE_TTS === '1') {
    const { alignment, dur } = fakeTts(ep.script);
    await save('alignment.json', alignment);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(dur), '-c:a', 'libmp3lame', path.join(epDir, 'narration.mp3')]);
    studio(['tts', rel, '--words-only']);
  } else {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY 가 없습니다 — 나레이션을 만들 수 없습니다.');
    studio(['tts', rel]);
  }
  const words = (await json('words.json')).map((x) => x.word);
  const want = ep.sentences.flat();
  if (words.join(' ') !== want.join(' ')) throw new Error(`나레이션 단어가 대본과 다릅니다 (${words.length} vs ${want.length}) — 장면 시간이 어긋납니다.`);

  if (process.env.STOCK_STOP === 'preview') { studio(['preview', rel, '--at', process.env.STOCK_PREVIEW_AT ?? '1.5,5,9,13,17,22,27,31,36,40']); return; }
  // ── 음악: 기본은 합성(무료). build 가 API 음악을 다시 시도하지 않게 키를 뺀 환경으로 돌린다.
  const noKey = { ...process.env }; if (process.env.STOCK_MUSIC !== 'api') delete noKey.ELEVENLABS_API_KEY;
  studio(['music', rel, ...(process.env.STOCK_MUSIC === 'api' ? [] : ['--synth'])], noKey);
  try { studio(['build', rel], noKey); } catch (e) {
    // 시험 모드(무음 나레이션)는 음량 검사만 걸린다 — 파일이 나왔으면 계속. 실제 발행은 경고도 실패로 본다.
    if (process.env.STOCK_FAKE_TTS !== '1') throw e;
  }

  const outDir = path.join(ROOT, 'out', 'stock-shorts');
  await fs.mkdir(outDir, { recursive: true });
  const final = path.join(outDir, `${MARKET}-${date}.mp4`);
  await fs.copyFile(path.join(epDir, 'out', `${slug}.mp4`), final);
  const thumb = path.join(epDir, 'out', 'thumb.png');
  await fs.copyFile(path.join(epDir, 'out', 'frames', 'contact.png'), path.join(outDir, `${MARKET}-${date}-contact.png`)).catch(() => {});
  await fs.writeFile(path.join(outDir, `${MARKET}-${date}.json`), JSON.stringify({ meta, script: ep.script, D: ep.D }, null, 2));
  console.log(`  · 영상: ${path.relative(ROOT, final)}`);

  if (!config.doUpload) {
    console.log('  · DO_UPLOAD=false → 업로드 건너뜀');
    return;
  }
  const hasThumb = await fs.stat(thumb).then(() => true, () => false);
  const videoId = await uploadVideo({ videoPath: final, script: meta, ...(hasThumb ? { thumbnailPath: thumb } : {}) });
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
