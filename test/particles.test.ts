import { fixParticles } from '../src/lib/stockScript.js';
const cases: Array<[string, string]> = [
  ['정유화학이(가) 유지되고', '정유화학이 유지되고'],
  ['증권·2차전지·인터넷이(가) 새로', '증권·2차전지·인터넷이 새로'],
  ['코스맥스이(가)', '코스맥스가'],
  ['농심은(는) 올랐다', '농심은 올랐다'],
  ['GS은(는) 올랐다', 'GS는 올랐다'],
  ['금리를(을) 본다', '금리를 본다'],
  ['한국콜마을(를) 본다', '한국콜마를 본다'],
  ['괄호 없는 문장', '괄호 없는 문장'],
];
let fail = 0;
for (const [inp, want] of cases) {
  const got = fixParticles(inp);
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', JSON.stringify(inp), '→', JSON.stringify(got), ok ? '' : `(기대: ${want})`);
}
console.log(fail ? `실패 ${fail}건` : '전부 통과');
process.exit(fail ? 1 : 0);
