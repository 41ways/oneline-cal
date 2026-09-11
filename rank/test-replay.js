/* 재생 검증 — 서버가 다시 돌린 점수가 게임이 낸 점수와 같은가
     node rank/test-replay.js
   index.html 의 진행(놓기 → 실행 → 칸 늘기 → 정비 → 후보 → 고르기 → 놓기)을
   그대로 흉내 내는 봇이 여러 날짜를 두고, 둔 수를 서버의 replay 에 넘긴다.
   봇은 일부러 서툴게(무작위 섞어서) 둔다 — 잘 두는 판만 맞으면 소용없다 */
import E from '../engine.js';
import { replay, cleanName } from './src/index.js';
import assert from 'node:assert/strict';

function playBot(day, rng) {
  const seed = E.seedForDay(day), offer = E.mulberry32(seed);
  const line = new Array(E.SLOTS_START).fill(null);
  const moves = { start: [], floors: [] };
  const rnd = n => Math.floor(rng() * n);
  const bestSlot = (id, f) => {
    if (rng() < 0.3) return rnd(line.length);            // 가끔 아무 데나
    let b = 0, bv = -Infinity;
    for (let i = 0; i < line.length; i++) {
      const k = line[i]; line[i] = { id };
      const v = E.expectedV(line, E.mulberry32(99), 3, f).L;
      line[i] = k; if (v > bv) { bv = v; b = i; }
    }
    return b;
  };
  for (const id of E.START_HAND) { const i = bestSlot(id, 1); moves.start.push(i); line[i] = { id }; }
  let floor = 1; const total = E.V(0);
  for (;;) {
    const res = E.run(line, E.execRnd(seed, floor), floor);
    E.vAdd(total, res.v);                                // 못 넘은 층 점수도 들어간다
    if (!E.passes(res.v, floor)) break;
    const step = { swap: null, pick: null, slot: -1 };
    if (E.SLOT_GAIN_ON.includes(floor) && line.length < E.SLOTS_MAX) line.push(null);
    if (E.REPAIR_ON.includes(floor) && rng() < 0.5) {
      const a = rnd(line.length); let b = rnd(line.length); if (b === a) b = (a + 1) % line.length;
      const t = line[a]; line[a] = line[b]; line[b] = t; step.swap = [a, b];
    }
    floor++;
    const choices = E.rollChoices(floor, offer, E.CHOICES);
    step.pick = choices[rnd(choices.length)];
    step.slot = bestSlot(step.pick, floor);
    line[step.slot] = { id: step.pick };
    moves.floors.push(step);
    if (floor > 80) break;
  }
  return { moves, cleared: floor - 1, total };
}

const rng = E.mulberry32(314159);
let n = 0, deepest = 0;
for (let day = 20600; day < 20720; day++) {
  for (let k = 0; k < 3; k++) {
    const bot = playBot(day, rng);
    const out = replay(day, JSON.parse(JSON.stringify(bot.moves)));    // 네트워크를 한 번 거친 셈
    assert.equal(out.cleared, bot.cleared, `day ${day}: 층 수가 다름`);
    assert.ok(E.vEq(out.total, bot.total), `day ${day}: 총점이 다름`);
    n++; deepest = Math.max(deepest, bot.cleared);
  }
}
console.log(`재생 일치 ${n}판 (가장 깊이 간 판 ${deepest}층)`);

// ── 무한 모드 깊이: 잘 두는 봇(무작위 없음)으로 되감기가 여러 번 늘어나는 층까지
function playGreedy(day) {
  const seed = E.seedForDay(day), offer = E.mulberry32(seed);
  const line = new Array(E.SLOTS_START).fill(null), moves = { start: [], floors: [] };
  const best = (id, f) => { let b = 0, bv = -Infinity; for (let i = 0; i < line.length; i++) { const k = line[i]; line[i] = { id }; const v = E.expectedV(line, E.mulberry32(7), 3, f).L; line[i] = k; if (v > bv) { bv = v; b = i; } } return { b, bv }; };
  for (const id of E.START_HAND) { const i = best(id, 1).b; moves.start.push(i); line[i] = { id }; }
  let floor = 1; const total = E.V(0);
  for (;;) {
    const res = E.run(line, E.execRnd(seed, floor), floor);
    E.vAdd(total, res.v);
    if (!E.passes(res.v, floor)) break;
    if (E.SLOT_GAIN_ON.includes(floor) && line.length < E.SLOTS_MAX) line.push(null);
    floor++;
    let pk = null, pv = -Infinity, ps = 0;
    for (const c of E.rollChoices(floor, offer, E.CHOICES)) { const r = best(c, floor); if (r.bv > pv) { pv = r.bv; pk = c; ps = r.b; } }
    line[ps] = { id: pk }; moves.floors.push({ swap: null, pick: pk, slot: ps });
    if (floor > 90) break;
  }
  return { moves, cleared: floor - 1, total };
}
let deepN = 0, deepMax = 0, deepL = 0;
for (let day = 20700; day < 20712; day++) {
  const g = playGreedy(day);
  const out = replay(day, JSON.parse(JSON.stringify(g.moves)));
  assert.equal(out.cleared, g.cleared, `day ${day}: 깊은 판 층 수가 다름`);
  assert.ok(E.vEq(out.total, g.total), `day ${day}: 깊은 판 총점이 다름`);
  deepN++; if (g.cleared > deepMax) { deepMax = g.cleared; deepL = g.total.L; }
}
console.log(`무한 모드 깊은 판 ${deepN}판 재생 일치 (최고 ${deepMax}층 · 총점 10^${deepL >= 1e6 ? deepL.toExponential(2) : Math.round(deepL)})`);

// ── 조작은 걸러지는가
const day = 20707;
let base = null;
for (let s = 1; s < 50 && !base; s++) { const b = playBot(day, E.mulberry32(s)); if (b.cleared >= 3) base = b; }
assert.ok(base, '조작 시험엔 3층 이상 간 판이 필요');
const clone = () => JSON.parse(JSON.stringify(base.moves));
const reject = (m, why) => assert.throws(() => replay(day, m), Error, why);

const firstChoices = (() => {
  const o = E.mulberry32(E.seedForDay(day));
  return E.rollChoices(2, o, E.CHOICES);
})();
const outsider = E.CARD_IDS.find(id => firstChoices.indexOf(id) < 0);
let m = clone(); m.floors[0].pick = outsider;               reject(m, '후보에 없던 카드');
m = clone(); m.floors.push({ swap: null, pick: 'add3', slot: 0 }); reject(m, '못 넘은 층 뒤의 수');
m = clone(); m.floors[0].swap = [0, 1];                     reject(m, '1층 뒤엔 정비가 없다');
m = clone(); m.floors[0].slot = 99;                         reject(m, '없는 칸');
m = clone(); m.start = [0, 0];                              reject(m, '시작 손패 수');
reject({ nope: 1 }, '형식');
console.log('조작 제출 6종 모두 거절');

// ── 이름
assert.equal(cleanName('  수달 <b>3호\t '), '수달 b3호');
assert.equal(cleanName(''), '이름없음');
assert.equal(cleanName('가나다라마바사아자차카타파하'), '가나다라마바사아자차카타');
console.log('이름 정리 OK');
