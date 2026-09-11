"use strict";
/* ══════════════════════════════════════════════════════════════════
   목표 곡선·루프 예산 맞추기
   ─ balance.js가 "지금 수치가 어떤가"를 재는 자라면, 이건 "어떤 수치여야
     하는가"를 찾는 자. 후보 조합을 전부 돌려보고 목표치에 제일 가까운 걸 고른다
   ─ 기준: 완벽하게 두는 플레이어(탐욕)가
       8층 클리어  25~35%   ← 사람이 잡으면 15% 안팎이 됨
       평균 도달층  6~7층
       본편(8층 이내) 천장 도달률 3% 미만
   ─ 천장은 반드시 "본편 안에서"만 센다. 무한 모드는 언젠가 천장에 닿는 게
     정상이고(목표가 배로 오르니 곧 죽는다), 그걸 같이 세면 곡선을 아무리
     올려도 지표가 안 떨어져서 엉뚱한 곳을 조이게 된다 —
     실제로 한 번 그렇게 헤맸다. 게임을 망치는 건 5층에서 터지는 것뿐이다
   실행: node sim/fit-targets.js [판수]
   ══════════════════════════════════════════════════════════════════ */
var E = require('../engine.js');

var execRnd = E.execRnd;
var curFloor = 1;
function bestSlot(line, id, evalR){
  var best=0, bestV=-Infinity;
  for (var i=0;i<line.length;i++){
    var keep=line[i]; line[i]={id:id};
    var v=E.expectedV(line, evalR, 5, curFloor).L;
    line[i]=keep;
    if (v>bestV){ bestV=v; best=i; }
  }
  return best;
}
function play(seed, targets, endless, loops, powcap){
  E.setTargets(targets, endless); E.setLoopBudget(loops);
  var offer=E.mulberry32(seed), evalR=E.mulberry32((seed*31+17)>>>0);
  var line=new Array(E.SLOTS_START).fill(null);
  for (var h=0;h<E.START_HAND.length;h++) line[bestSlot(line,E.START_HAND[h],evalR)]={id:E.START_HAND[h]};
  var floor=1, capped=false;
  while (floor<=30){
    curFloor = floor;
    var res=E.run(line, execRnd(seed,floor), floor);
    if (res.v.L >= 300 && floor<=8) capped=true;   // 본편 안에서 자릿수 300 을 넘으면 폭발로 본다
    if (!E.passes(res.v, floor)) break;
    if (E.SLOT_GAIN_ON.indexOf(floor)>=0 && line.length<E.SLOTS_MAX) line.push(null);
    var cs=E.rollChoices(floor+1, offer, E.CHOICES), win=null, winV=-Infinity;
    for (var j=0;j<cs.length;j++){
      var i2=bestSlot(line,cs[j],evalR), keep=line[i2];
      line[i2]={id:cs[j]}; var v=E.expectedV(line,evalR,5,curFloor).L; line[i2]=keep;
      if (v>winV){ winV=v; win=cs[j]; }
    }
    line[bestSlot(line,win,evalR)]={id:win};
    floor++;
  }
  return { reached:floor-1, capped:capped };
}

var RUNS = parseInt(process.argv[2]||'150',10);
/* 앞 세 층(20/40/130)은 고정이다 — sim/early.js가 잡아둔 값이고,
   데일리 공정성이 걸려 있어 난이도 조절 손잡이로 쓰면 안 된다.
   4층부터만 흔든다 */
var CURVES = {
  C: [20, 40, 130, 2000, 15000, 130000,  1300000,  14000000],
  D: [20, 40, 140, 2800, 24000, 240000,  2800000,  35000000],
  E: [20, 40, 150, 4000, 42000, 500000,  7000000, 110000000],
};
var ENDLESS = [6.0, 8.0, 10.0];
var LOOPS = [1];
/* 제곱 배수 상한도 손잡이로 쓴다. 지수를 두 번 쓸 수 있게 열어준 이상
   목표 곡선만으로는 값 천장 도달률이 안 잡힌다 — 아무리 목표를 올려도
   폭발하는 판은 그냥 폭발하고, 그 판은 5층 이후 아무 결정이 없다 */
var POWCAPS = [1e4, 3e3];

console.log('\n목표 곡선 맞추기 — 탐욕 ' + RUNS + '판씩\n');
console.log('곡선 무한  제곱상한   8층   평균층  본편천장');
var rows=[];
Object.keys(CURVES).forEach(function(c){
  ENDLESS.forEach(function(e){
    POWCAPS.forEach(function(pc){
      var l = LOOPS[0];
      var clear=0, sum=0, cap=0;
      for (var r=0;r<RUNS;r++){
        var out=play((r*2654435761+12345)>>>0, CURVES[c], e, l, pc);
        if (out.reached>=8) clear++;
        sum+=out.reached; if (out.capped) cap++;
      }
      var row={ c:c, e:e, l:l, pc:pc, clear:clear/RUNS, avg:sum/RUNS, cap:cap/RUNS };
      row.err = Math.abs(row.clear-0.30)*3 + Math.abs(row.avg-6.5)/6.5 + Math.max(0,row.cap-0.03)*6;
      rows.push(row);
      console.log('  '+c+'  '+e.toFixed(1).padStart(4)+'   '+String(pc).padStart(6)+'   '+
        (row.clear*100).toFixed(0).padStart(3)+'%   '+row.avg.toFixed(1).padStart(4)+'   '+
        (row.cap*100).toFixed(0).padStart(3)+'%');
    });
  });
});
rows.sort(function(a,b){ return a.err-b.err; });
console.log('\n제일 가까운 셋');
rows.slice(0,3).forEach(function(r){
  console.log('  곡선 '+r.c+' / 무한 x'+r.e+' / 제곱상한 '+r.pc+
    '   8층 '+(r.clear*100).toFixed(0)+'% · 평균 '+r.avg.toFixed(1)+'층 · 천장 '+(r.cap*100).toFixed(0)+'%');
});
console.log('');
