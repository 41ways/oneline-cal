/* ══════════════════════════════════════════════════════════════════
   앞 세 층 점검 — "완벽하게 둬도 못 넘는 날"이 몇 %인가
   ─ 데일리는 접속한 모두가 같은 시드로 돈다. 그래서 초반 실패율은
     "실력 없으면 죽는 비율"이 아니라 "오늘은 전원 전멸하는 날의 비율"이다.
     싱글 로그라이크면 20%도 괜찮은 수치지만 여기선 그대로 못 쓴다
   실행: node sim/early.js
   ══════════════════════════════════════════════════════════════════ */
var E = require('../engine.js');
var execRnd = E.execRnd;
var curF = 1;
function bestSlot(line,id,r){ var b=0,bv=-Infinity;
  for(var i=0;i<line.length;i++){ var k=line[i]; line[i]={id:id};
    var v=E.expectedV(line,r,5,curF).L; line[i]=k; if(v>bv){bv=v;b=i;} } return b; }
function earlyFail(seed){
  var offer=E.mulberry32(seed), ev=E.mulberry32((seed*31+17)>>>0);
  var line=new Array(E.SLOTS_START).fill(null);
  E.START_HAND.forEach(function(id){ line[bestSlot(line,id,ev)]={id:id}; });
  for (var f=1; f<=3; f++){
    curF = f;
    if (!E.passes(E.run(line, execRnd(seed,f), f).v, f)) return f;
    if (E.SLOT_GAIN_ON.indexOf(f)>=0 && line.length<E.SLOTS_MAX) line.push(null);
    var cs=E.rollChoices(f+1,offer,E.CHOICES), w=null, wv=-Infinity;
    for (var j=0;j<cs.length;j++){ var i2=bestSlot(line,cs[j],ev), k=line[i2];
      line[i2]={id:cs[j]}; var v=E.expectedV(line,ev,5,curF).L; line[i2]=k;
      if(v>wv){wv=v;w=cs[j];} }
    line[bestSlot(line,w,ev)]={id:w};
  }
  return 0;
}
var CANDS = {
  '처음 20/50/170':[20,50,170,900,5000,34000,260000,2000000],
  '지금 20/40/130':[20,40,130,900,5000,34000,260000,2000000],
  '더 완화 20/38/110':[20,38,110,900,5000,34000,260000,2000000],
  '더 완화 20/35/100':[20,35,100,900,5000,34000,260000,2000000],
};
console.log('\n앞 세 층에서 죽는 비율 (완벽하게 둬도 못 넘는 날의 비율)\n');
console.log('곡선                1층    2층    3층   3층까지 생존');
Object.keys(CANDS).forEach(function(name){
  E.setTargets(CANDS[name]);
  var f=[0,0,0,0];
  var N=600;
  for (var r=0;r<N;r++) f[earlyFail((r*2654435761+999)>>>0)]++;
  console.log(name.padEnd(18) +
    (f[1]/N*100).toFixed(1).padStart(5)+'% ' +
    (f[2]/N*100).toFixed(1).padStart(6)+'% ' +
    (f[3]/N*100).toFixed(1).padStart(6)+'% ' +
    (f[0]/N*100).toFixed(1).padStart(9)+'%');
});
console.log('');
