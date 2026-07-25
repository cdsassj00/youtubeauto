/* 주제 → deck.json (Claude). system-prompt-deck.md 를 시스템 프롬프트로 사용.
   사용: ANTHROPIC_API_KEY=... node gen-deck.mjs "주제" [preset] [out.json]
   preset(선택): tunnel|orbit|rise|spiral|editorial (기본 editorial=중후). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [topic, presetArg, outArg] = process.argv.slice(2);
if (!topic) { console.error('사용: node gen-deck.mjs "주제" [preset] [out.json]'); process.exit(1); }
const preset = presetArg || 'editorial';
const out = outArg || 'deck.json';
const model = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 필요'); process.exit(1); }

const sys = fs.readFileSync(path.join(HERE, 'system-prompt-deck.md'), 'utf8');
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const msg = await client.messages.create({
  model, max_tokens: 8000,
  system: sys,
  messages: [{ role: 'user', content: `주제: "${topic}"\n이 주제로 deck.json 을 출력하라. preset 은 "${preset}" 로 하되, 내용 성격에 더 맞는 게 있으면 바꿔도 된다. 순수 JSON만 출력.` }],
});
const block = msg.content.find(b => b.type === 'text');
let text = (block && 'text' in block ? block.text : '').trim();
// 코드펜스 제거
text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
let deck;
try { deck = JSON.parse(text); } catch (e) { console.error('JSON 파싱 실패:\n', text.slice(0, 500)); process.exit(1); }
if (!deck.preset) deck.preset = preset;      // 프리셋 강제 반영(모델이 빼먹어도)
if (!deck.slides || !deck.slides.length) { console.error('slides 비어있음'); process.exit(1); }
fs.writeFileSync(out, JSON.stringify(deck, null, 2));
console.log(`OK: ${out} (preset=${deck.preset}, slides=${deck.slides.length}, title=${deck.title || ''})`);
