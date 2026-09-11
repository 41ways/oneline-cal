"use strict";
/* ══════════════════════════════════════════════════════════════════
   밸런스 시뮬레이터 — 원형(archetype)별 층 통과율
   ─ engine.js를 그대로 불러다 화면 없이 수천 판 돌린다
   ─ 배치는 어느 원형이든 탐욕(가능한 칸을 전부 넣어보고 제일 높은 곳)으로 둔다.
     이 게임에서 "무엇을 집나"와 "어디에 두나"는 다른 결정이고,
     비교하고 싶은 건 앞쪽이라 뒤쪽은 고정시켜 뒀다
   ─ 핵심 지표는 층별 통과율 — 그 층에 도달한 판 중 몇 %가 넘었나
   실행: node sim/balance.js [판수]
   ══════════════════════════════════════════════════════════════════ */

var E = require('../engine.js');

/* 곡선을 바꿔가며 원형 스프레드를 비교할 때 쓴다.
   TARGETS='[20,40,...]' node sim/balance.js 400 */
if (process.env.TARGETS) E.setTargets(JSON.parse(process.env.TARGETS),
                                      process.env.ENDLESS ? +process.env.ENDLESS : 0);

/* 난수 세 갈래로 나눠 쓴다.
     offer  카드가 무엇이 나오나
     exec   층을 실제로 굴릴 때 (층마다 독립 — 미리보기가 결과를 흔들면 안 됨)
     evalR  배치를 고를 때 머릿속으로 굴려보는 용도
   index.html도 똑같이 나눠 쓴다. 안 그러면 같은 시드인데 사람마다
   미리보기를 몇 번 했느냐로 결과가 갈려서 데일리 비교가 깨진다 */
var execRnd = E.execRnd;

// ══════════════════════════════════ 원형
/* pick에 적힌 카드만 집는다. 값이 클수록 먼저. 없는 카드는 최후순위.
   탐욕은 pick이 없고 순수하게 "이번 층 점수가 제일 오르는 것"만 본다 */
var ARCH = {
  곱셈: { pick:{ mul5:20, square:19, mul3:16, chain:15, mul2:12, over:10, even3:8 } },
  조건: { pick:{ dense:20, edge:18, mid:17, front:17, over:16, even3:15, twin:14, under:13, odd15:12, pos:10, gap:9 } },
  루프: { pick:{ rew4:20, rew2:19, breath:19, dup:18, mem:12, recall:12, skip:8 } },
  기억: { pick:{ swap:20, recall:19, bank:18, mem:17, invert:16, add50:14, add30:12, dup:9 } },
  도박: { pick:{ jackpot:20, coin:19, invert:14, mul5:12, square:10 } },
  성장: { pick:{ veteran:20, census:18, ceil:16, add50:14, add30:12, mul3:10 } },
  탐욕: { pick:null },
  무작위:{ pick:null, blind:true },   // 대조군 — 아무 카드나 아무 칸에
};

// ══════════════════════════════════ 배치
/* 카드는 빈 칸에도, 이미 찬 칸에도 놓을 수 있다 (찬 칸은 덮어쓴다).
   덮어쓰기가 유일한 제거 수단이라 "실수를 지우려면 미래의 카드 한 장을 쓴다" */
var floorHint = 1;   // 고참 카드처럼 층을 읽는 카드가 있어서 미리보기도 층을 알아야 한다
function bestSlot(line, id, evalR){
  var best = -1, bestV = -Infinity;
  for (var i=0;i<line.length;i++){
    var keep = line[i];
    line[i] = { id:id };
    var v = E.expectedV(line, evalR, 5, floorHint).L;   // 자릿수로 비교
    line[i] = keep;
    if (v > bestV){ bestV = v; best = i; }
  }
  return { idx:best, score:bestV };
}

function chooseCard(choices, arch, line, evalR){
  if (arch.blind) return choices[Math.floor(evalR()*choices.length)];
  if (arch.pick){
    var best = null, bestP = -1;
    for (var k=0;k<choices.length;k++){
      var p = arch.pick[choices[k]] || 0;
      if (p > bestP){ bestP = p; best = choices[k]; }
    }
    if (bestP > 0) return best;          // 자기 축에 있는 게 하나라도 있으면 그걸
  }
  var win = null, winV = -Infinity;      // 없으면(또는 탐욕이면) 점수로 고른다
  for (var j=0;j<choices.length;j++){
    var r = bestSlot(line, choices[j], evalR);
    if (r.score > winV){ winV = r.score; win = choices[j]; }
  }
  return win;
}

function place(line, id, arch, evalR){
  if (arch.blind){ line[Math.floor(evalR()*line.length)] = { id:id }; return; }
  line[bestSlot(line, id, evalR).idx] = { id:id };
}

/* 정비 — 두 칸을 맞바꾼다. 전부 시험해보고 좋아질 때만 */
function repair(line, arch, evalR){
  if (arch.blind) return;
  var base = E.expectedV(line, evalR, 5, floorHint).L, bi=-1, bj=-1;
  for (var i=0;i<line.length;i++) for (var j=i+1;j<line.length;j++){
    var a=line[i], b=line[j];
    if (!a && !b) continue;
    line[i]=b; line[j]=a;
    var v = E.expectedV(line, evalR, 5, floorHint).L;
    line[i]=a; line[j]=b;
    if (v > base){ base = v; bi=i; bj=j; }
  }
  if (bi>=0){ var t=line[bi]; line[bi]=line[bj]; line[bj]=t; }
}

// ══════════════════════════════════ 한 판
var MAX_FLOOR = 30;
function playRun(seed, arch){
  var offer = E.mulberry32(seed);
  var evalR = E.mulberry32((seed * 31 + 17) >>> 0);
  var line  = new Array(E.SLOTS_START).fill(null);

  for (var h=0; h<E.START_HAND.length; h++) place(line, E.START_HAND[h], arch, evalR);

  var floor = 1, total = E.V(0), hist = [];
  while (floor <= MAX_FLOOR){
    floorHint = floor;
    var res = E.run(line, execRnd(seed, floor), floor);
    var ok = E.passes(res.v, floor);
    hist.push({ floor:floor, score:res.v, target:E.targetV(floor), ok:ok });
    E.vAdd(total, res.v);                               // 못 넘은 층 점수도 총점에
    if (!ok) break;

    if (E.SLOT_GAIN_ON.indexOf(floor) >= 0 && line.length < E.SLOTS_MAX) line.push(null);
    if (E.REPAIR_ON.indexOf(floor) >= 0) repair(line, arch, evalR);
    place(line, chooseCard(E.rollChoices(floor+1, offer, E.CHOICES), arch, line, evalR), arch, evalR);
    floor++;
  }
  return { reached: hist[hist.length-1].ok ? floor : floor-1, total:total, hist:hist, line:line };
}

// ══════════════════════════════════ 집계
function pct(x){ return (x*100).toFixed(0).padStart(3) + '%'; }
function pad(s,n){ s = String(s); while (s.length<n) s = ' '+s; return s; }
function padR(s,n){ s = String(s); while (s.length<n) s = s+' '; return s; }

var RUNS = parseInt(process.argv[2] || '400', 10);
var SHOW = 12;   // 표에 보여줄 층 수

console.log('\n한 줄 — 밸런스 ' + RUNS + '판 x ' + Object.keys(ARCH).length + '원형\n');
console.log(padR('원형',8) + pad('평균층',6) + pad('최고',5) + pad('8층',5) + '   층별 통과율 (그 층에 도달한 판 기준)');
console.log(padR('',8) + pad('',6) + pad('',5) + pad('',5) + '   ' +
  Array.from({length:SHOW}, function(_,i){ return pad(i+1,4); }).join(''));

var lines = [];
Object.keys(ARCH).forEach(function(name){
  var arch = ARCH[name];
  var reach = new Array(MAX_FLOOR+2).fill(0), pass = new Array(MAX_FLOOR+2).fill(0);
  var sum = 0, max = 0, clear8 = 0, totals = [];
  for (var r=0;r<RUNS;r++){
    var run = playRun((r*2654435761 + 12345) >>> 0, arch);
    sum += run.reached; if (run.reached > max) max = run.reached;
    if (run.reached >= 8) clear8++;
    totals.push(run.total.L);
    run.hist.forEach(function(h){ reach[h.floor]++; if (h.ok) pass[h.floor]++; });
  }
  totals.sort(function(a,b){ return a-b; });
  var row = padR(name,8) + pad((sum/RUNS).toFixed(1),6) + pad(max,5) + pad(pct(clear8/RUNS).trim(),5) + '   ';
  for (var f=1; f<=SHOW; f++) row += pad(reach[f] ? Math.round(pass[f]/reach[f]*100) : '-', 4);
  console.log(row);
  lines.push({ name:name, med: totals[Math.floor(totals.length/2)], p90: totals[Math.floor(totals.length*0.9)] });
});

console.log('\n총점 (모든 층 점수의 합)');
console.log(padR('원형',8) + pad('중앙값',14) + pad('상위 10%',16));
lines.forEach(function(l){
  var f = function(L){ return L === -Infinity ? '0' : (L < 12 ? Math.round(Math.pow(10,L)).toLocaleString('en-US') : '10^' + L.toFixed(1)); };
  console.log(padR(l.name,8) + pad(f(l.med),14) + pad(f(l.p90),16));
});

// ══════════════════════════════════ 표본 한 판 들여다보기
var demo = playRun(777, ARCH['탐욕']);
console.log('\n표본 한 판 (탐욕, 시드 777) — ' + demo.reached + '층 도달');
console.log('  줄  ' + demo.line.map(function(c){ return c ? E.CARDS[c.id].g : '·'; }).join(' | '));
demo.hist.forEach(function(h){
  var g = function(v){ return (v.L < 12 && v.L > -Infinity) ? Math.round(Math.pow(10,v.L)).toLocaleString('en-US') : (v.L === -Infinity ? '0' : '10^' + v.L.toFixed(1)); };
  console.log('  ' + pad(h.floor,2) + '층  ' + pad(g(h.score),14) +
              ' / ' + padR(g(h.target),14) + (h.ok ? '통과' : '실패'));
});
console.log('');
