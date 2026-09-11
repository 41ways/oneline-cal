"use strict";
/* ══════════════════════════════════════════════════════════════════
   목표 곡선을 분포에서 뽑아내기
   ─ 지수에 상한이 없으면 카드 한 장이 점수를 제곱시킨다. 그래서
     "층마다 x8" 같은 기하급수 목표로는 절대 못 따라간다 —
     ^2 를 한 장 집는 순간 남은 층이 전부 공짜가 되거나, 반대로 못 집으면
     영원히 못 넘는다. 비율을 손으로 찍는 대신 실제 도달 가능한 점수
     분포에서 분위수를 뽑는다
   ─ 자기참조라 반복해서 수렴시킨다. 목표가 올라가면 약한 판이 먼저 죽고,
     남은 판의 점수 분포가 위로 밀리고, 그러면 목표가 또 올라간다.
     그 되먹임이 멎는 지점이 우리가 원하는 곡선
   실행: node sim/fit-curve.js [판수] [분위수]
   ══════════════════════════════════════════════════════════════════ */
var E = require('../engine.js');

var RUNS = parseInt(process.argv[2] || '250', 10);
var Q    = parseFloat(process.argv[3] || '0.16');   // 층별 탈락률 목표
var DEEP = 14;                                       // 여기까지 곡선을 뽑는다
var ITER = 6;
var EARLY = [20, 40, 130];   // sim/early.js가 잡아둔 값. 데일리 공정성이 걸려 고정

var execRnd = E.execRnd;
var curFloor = 1;
function bestSlot(line, id, evalR){
  var b = 0, bv = -Infinity;
  for (var i=0;i<line.length;i++){
    var k = line[i]; line[i] = { id:id };
    var v = E.expectedV(line, evalR, 5, curFloor).L;
    line[i] = k;
    if (v > bv){ bv = v; b = i; }
  }
  return b;
}
function play(seed){
  var offer = E.mulberry32(seed), ev = E.mulberry32((seed*31+17) >>> 0);
  var line = new Array(E.SLOTS_START).fill(null);
  for (var h=0; h<E.START_HAND.length; h++) line[bestSlot(line, E.START_HAND[h], ev)] = { id:E.START_HAND[h] };
  var f = 1, scores = [];
  while (f <= DEEP){
    curFloor = f;
    var rv = E.run(line, execRnd(seed, f), f).v, sc = rv.L;   // 자릿수
    scores.push(sc);
    if (!E.passes(rv, f)) break;
    if (E.SLOT_GAIN_ON.indexOf(f) >= 0 && line.length < E.SLOTS_MAX) line.push(null);
    var cs = E.rollChoices(f+1, offer, E.CHOICES), w = null, wv = -Infinity;
    for (var j=0;j<cs.length;j++){
      var i2 = bestSlot(line, cs[j], ev), k = line[i2];
      line[i2] = { id:cs[j] };
      var v = E.expectedV(line, ev, 5, curFloor).L;
      line[i2] = k;
      if (v > wv){ wv = v; w = cs[j]; }
    }
    line[bestSlot(line, w, ev)] = { id:w };
    f++;
  }
  return scores;
}

/* 유효숫자 세 자리로 자른다. 화면에 뜨는 값이라 122,847,392 보다
   123,000,000 이 낫고, 곡선의 뜻도 세 자리면 충분히 담긴다 */
function round3(x){
  if (x < 1000) return Math.max(1, Math.round(x));
  var e = Math.floor(Math.log10(x)) - 2;
  return Math.round(x / Math.pow(10,e)) * Math.pow(10,e);
}
function fmtE(x){
  if (x < 1e9) return Math.round(x).toLocaleString('en-US');
  return x.toExponential(2);
}

var targets = E.TARGETS.slice();
for (var it=0; it<ITER; it++){
  var buckets = [];
  for (var d=0; d<DEEP; d++) buckets.push([]);
  E.setTargets(targets, 8.0);
  for (var r=0; r<RUNS; r++){
    var sc = play((r*2654435761 + 12345) >>> 0);
    for (var i=0;i<sc.length;i++) buckets[i].push(sc[i]);
  }
  var next = [];
  for (var f=0; f<DEEP; f++){
    var b = buckets[f];
    if (b.length < 20){ next.push(targets[f] || round3((next[f-1]||1) * 8)); continue; }
    b.sort(function(a,c){ return a-c; });
    next.push(round3(Math.pow(10, b[Math.floor(b.length * Q)])));
  }
  for (var e2=0; e2<EARLY.length; e2++) next[e2] = EARLY[e2];
  // 단조증가 보정 — 표본이 얇은 층에서 곡선이 주저앉는 걸 막는다
  for (var f2=1; f2<next.length; f2++) if (next[f2] <= next[f2-1]) next[f2] = round3(next[f2-1] * 3);
  targets = next;
  console.log('반복 ' + (it+1) + ': ' + targets.slice(0,10).map(fmtE).join('  '));
}

E.setTargets(targets, 8.0);
var clear = 0, sum = 0, reach = new Array(DEEP+1).fill(0), ok = new Array(DEEP+1).fill(0);
for (var r2=0; r2<RUNS; r2++){
  var sc2 = play((r2*2654435761 + 12345) >>> 0);
  var reached = 0;
  for (var i2=0;i2<sc2.length;i2++){
    reach[i2+1]++;
    if (sc2[i2] >= E.targetV(i2+1).L){ ok[i2+1]++; reached = i2+1; }
  }
  sum += reached;
  if (reached >= 8) clear++;
}
console.log('\n결과 — 탐욕 8층 클리어 ' + (clear/RUNS*100).toFixed(0) + '% · 평균 ' + (sum/RUNS).toFixed(1) + '층');
var row = '층별 통과율  ';
for (var f3=1; f3<=12; f3++) row += (reach[f3] ? Math.round(ok[f3]/reach[f3]*100) : '-') + '  ';
console.log(row);
console.log('\nengine.js 에 넣을 값');
console.log('var TARGETS = [' + targets.slice(0,8).map(function(x){ return x.toExponential(2); }).join(', ') + '];');
var ratio = targets[7] / targets[6];
console.log('var ENDLESS_MUL = ' + ratio.toFixed(1) + ';   // 8층 직전 비율을 그대로 이음');
console.log('');
