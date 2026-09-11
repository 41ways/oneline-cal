"use strict";
/* ══════════════════════════════════════════════════════════════════
   한 줄 — 규칙 엔진
   ─ 카드 테이블과 파이프라인 실행기만 들어있음. DOM을 하나도 안 씀.
     브라우저(index.html)와 밸런스 시뮬레이터(sim/balance.js)가 같이 씀 —
     둘이 다른 규칙으로 도는 걸 막으려고 파일을 하나로 유지함
   핵심
     값 하나가 줄의 왼쪽에서 오른쪽으로 흐르며 카드를 통과한다.
     끝에 남은 값이 그 층의 점수. 같은 카드도 어느 칸에 있느냐로 값이 갈린다.
   ══════════════════════════════════════════════════════════════════ */

// ══════════════════════════════════ 판 크기
var SLOTS_START = 5;      // 시작 칸 수
var SLOTS_MAX   = 10;     // 칸 수 상한 (이 이상은 보상으로도 안 늘어남)
/* 되감기는 한 판에 딱 한 번. sim/fit-targets.js로 1·2·3을 재봤는데,
   2 이상이면 새로 집은 카드가 루프 안에서 서너 번 먹혀서 줄의 성장률이
   층 목표 증가율을 압도한다 — 5층쯤 값 천장에 붙고 그 뒤 배치가 무의미해짐.
   1이면 되감기 카드가 "아껴 쓰는 한 방"이 되어 어디에 박느냐가 더 중요해진다 */
var LOOP_BUDGET = 1;
/* 무한 모드(9층~)에 들어서면 되감기가 늘어난다 — 9층에 +1, 그 뒤 LOOP_STEP 층마다 +1.
   한 줄 점수의 상한은 "한 판에 제곱이 몇 번 걸리나"가 정하고, 그건 되감기 바퀴 수다
   (제곱 1장 + 바로 뒤 복제 1장 = 한 바퀴에 2번). 되감기가 1번뿐이던 때는 잘 두는 판이
   전부 10^200~10^375, 23~27층 한 구간에 몰려 멈췄다 — "다 상한에 닿는다"는 말이 나온 이유.
   되감기 한 번이 자릿수 ×4 라, 깊이 갈수록 늘려주면 상한도 같이 올라간다.
   본편(1~8층)은 그대로 1번이다. 여길 건드리면 데일리 초반 전멸률이 다 흔들린다.

   되감기만 늘리면 줄이 목표보다 빨리 커져 판이 안 끝난다(8층마다 +1 로 해도
   잘 두는 판 다섯에 하나가 150층까지 살아 있었다). 그래서 되감기가 늘 때마다
   목표 자릿수도 ENDLESS_JUMP 배 뛴다 — 늘어난 되감기를 제곱에 걸어 쓰는 줄만
   따라가고, 못 쓰는 줄은 거기서 떨어진다.
   9층의 첫 +1 은 도약 없이 공짜로 준다. 거기서부터 뛰게 했더니 8층을 넘긴
   판의 9층 통과율이 92% → 74% 로 떨어져, 본편 끝이 절벽이 됐다.
   잘 두는 사람 기준(sim, 100판)으로
     되감기 고정        9층 92% · 상위10% 25층 · 최고 28층 · 총점 최고 10^365
     3층마다 · ×3.3     9층 92% · 상위10% 43층 · 최고 46층 · 총점 최고 10^(2×10^10) */
var LOOP_STEP = 3;
var ENDLESS_JUMP = 3.3;
function loopBudgetFor(floor){
  floor = floor || 1;
  if (floor <= TARGETS.length || !LOOP_STEP) return LOOP_BUDGET;     // LOOP_STEP 0 이면 안 늘어남
  return LOOP_BUDGET + 1 + Math.floor((floor - TARGETS.length - 1) / LOOP_STEP);
}
var START_VALUE = 1;      // 줄에 들어가는 최초의 값
var STEP_CAP    = 3000;   // 무한루프 방지용 실행 상한 (무한 모드 깊은 층의 되감기까지 넉넉히)
var REPAIR_ON   = [3,6,9,12];  // 정비 단계가 붙는 층 (두 칸 맞바꾸기 1회)
/* 칸은 보상으로 고르는 게 아니라 정해진 층에서 그냥 늘어난다.
   "카드 받을래 칸 받을래"를 물으면 답이 뻔해서(칸은 당장 점수가 0) 선택이 안 됨.
   이 게임에서 고민할 값어치가 있는 건 배치 하나뿐이라, 나머지는 고정으로 뺐다 */
var SLOT_GAIN_ON = [2,4,6,8,10];

/* 층 목표. 앞 세 층(20/40/130)은 sim/early.js 기준 — 완벽하게 둬도 못 넘는 날을 최소로.
   데일리는 모두가 같은 시드로 도니까 초반 실패율이 그대로
   "오늘은 전원 전멸하는 날"의 비율이 된다.

   4층부터는 실측 분포(sim으로 죽지 않고 굴렸을 때의 층별 점수)의
   하위 25% 지점에서 땄다. 비율을 손으로 찍지 않는 이유는, 지수가 걸린 판과
   안 걸린 판의 점수가 같은 층에서도 자릿수째로 갈리기 때문 —
   "같은 카드는 앞의 것만" 규칙을 넣고서야 8층 분포 폭이
   88자릿수에서 14자릿수로 내려와 선 하나로 자를 만해졌다 */
var TARGETS = [20, 40, 130, 1300, 4500, 22000, 140000, 800000];
/* 무한 모드는 배수가 아니라 거듭제곱으로 올린다 — 자릿수가 층마다 22%씩 는다.
   잘 자란 줄은 층당 자릿수가 3씩 늘어서(실측 75% 지점) 어떤 고정 배수로도
   못 따라잡는다. 줄이 내는 점수는 한 번 짜이면 층마다 거의 같으니,
   어느 줄이든 결국 자릿수가 22%씩 크는 목표에 따라잡혀 끝난다 */
var ENDLESS_POW = 1.22;

var RARITY = { common:'보통', uncommon:'희귀', rare:'상급', legend:'전설' };

// ══════════════════════════════════ 수 — 자릿수로 들고 다니기
/* 값은 { n, L } 한 쌍이다.
     n 이 유한하면   정확한 정수 n (0 ≤ n < 1e15), L = log10(n)
     n 이 Infinity면  n 은 버리고 L 이 곧 값 (값 = 10^L, L ≥ 15)

   예전엔 그냥 자바스크립트 수에 1e300 천장을 씌웠다. 제보가 들어왔다 —
   "얻은 숫자랑 표기되는 숫자가 다르다". 복제가 3.66e152 를 제곱해 1.3e305 를
   만들면 천장이 그걸 1e300 으로 잘랐고, 뒤에 붙은 층×25(×700)는 분명히 일을
   했는데 천장에 다시 잘려 「그대로」로 찍혔다. 28층 목표는 수의 한계를 넘어
   ∞ 가 됐고 "∞배 모자랍니다"가 떴다. 자바스크립트 수는 1.8e308 에서 끝나서
   천장을 거기까지 올려도 한 층도 안 늘어난다.

   자릿수(L)를 부동소수로 들면 한계가 10^(1.8e308) 이 된다. 곱하기는 L 에
   더하기, 제곱은 L 두 배라 계산도 가볍다.
   1e15 밑은 정수 그대로 둔다 — 짝·홀, <100, ≥1000, 올림처럼 끝자리가
   중요한 판정은 전부 작은 값에서만 뜻이 있고, 그 구간을 정확하게 두면
   예전 규칙과 한 끝도 안 달라진다 */
var EXACT     = 1e15;
var LOG_EXACT = 15;
var L_CAP     = 1e308;      // 자릿수 자체의 상한. 이 게임에서 닿을 일은 없다

function V(n){ return vSet({ n:0, L:-Infinity }, n === undefined ? 0 : n); }
function vSet(x, n){
  if (!(n > 0)){ x.n = 0; x.L = -Infinity; return x; }       // 0, 음수, NaN
  if (n < EXACT){
    x.n = Math.floor(n);
    x.L = x.n > 0 ? Math.log10(x.n) : -Infinity;
    return x;
  }
  x.n = Infinity; x.L = Math.min(Math.log10(n), L_CAP);
  return x;
}
function vSetL(x, L){
  if (!(L > -Infinity)){ x.n = 0; x.L = -Infinity; return x; }
  /* 큰 쪽에서 작은 쪽으로 내려올 때(나누기) 10^log10(1000) 이 999.9999… 로
     나와 버림하면 999 가 된다. 이 경로의 값은 원래 끝자리가 없으니 반올림 */
  if (L < LOG_EXACT) return vSet(x, Math.round(Math.pow(10, L)));
  x.n = Infinity; x.L = Math.min(L, L_CAP);
  return x;
}
function vBig(x){ return x.n === Infinity; }
function vCopy(x){ return { n:x.n, L:x.L }; }
function vEq(a, b){ return a.n === b.n && (a.n !== Infinity || a.L === b.L); }
function vCmp(a, b){
  if (!vBig(a) && !vBig(b)) return a.n < b.n ? -1 : (a.n > b.n ? 1 : 0);
  return a.L < b.L ? -1 : (a.L > b.L ? 1 : 0);
}
function vAddN(x, k){
  if (!vBig(x)) return vSet(x, x.n + k);
  if (!(k > 0)) return x;
  return vSetL(x, x.L + Math.log10(1 + Math.pow(10, Math.log10(k) - x.L)));
}
function vAddV(x, y){
  if (!vBig(x) && !vBig(y)) return vSet(x, x.n + y.n);
  if (y.L === -Infinity) return x;
  if (x.L === -Infinity){ x.n = y.n; x.L = y.L; return x; }
  var a = Math.max(x.L, y.L), b = Math.min(x.L, y.L);
  return vSetL(x, a + Math.log10(1 + Math.pow(10, b - a)));
}
function vMulN(x, k){
  if (!(k > 0)) return vSet(x, 0);
  if (!vBig(x)) return vSet(x, x.n * k);
  return vSetL(x, x.L + Math.log10(k));
}
function vDivN(x, k){                 // 버림 나눗셈
  if (!vBig(x)) return vSet(x, x.n / k);
  return vSetL(x, x.L - Math.log10(k));
}
function vSq(x){
  if (!vBig(x)) return vSet(x, x.n * x.n);
  return vSetL(x, x.L * 2);
}
function vLtN(x, k){ return !vBig(x) && x.n < k; }
function vGeN(x, k){ return vBig(x) || x.n >= k; }
/* 1e15 이상은 끝자리가 없으니 짝수로 친다. 예전 부동소수 규칙에서도
   2^53 을 넘는 수는 전부 짝수였다 */
function vEven(x){ return vBig(x) || x.n % 2 === 0; }

/* 저장소·네트워크로 보낼 때. JSON 은 Infinity 를 null 로 바꿔 버린다 */
function vPack(x){ return { n: vBig(x) ? null : x.n, L: x.L === -Infinity ? null : x.L }; }
function vUnpack(o){
  if (o == null) return V(0);
  if (typeof o === 'number') return V(o);                   // 예전 기록(그냥 수)
  if (o.n != null) return V(o.n);
  if (o.L != null) return vSetL({ n:0, L:0 }, o.L);
  return V(0);
}

function targetV(floor){               // floor는 1부터
  if (floor <= TARGETS.length) return V(TARGETS[floor-1]);
  var L = Math.log10(TARGETS[TARGETS.length-1]);
  for (var i=TARGETS.length; i<floor; i++) L = L * ENDLESS_POW;
  L = L * Math.pow(ENDLESS_JUMP, Math.max(0, loopBudgetFor(floor) - LOOP_BUDGET - 1));   // 첫 +1 은 공짜
  return vSetL({ n:0, L:0 }, L);
}
function passes(v, floor){ return vCmp(v, targetV(floor)) >= 0; }

// ══════════════════════════════════ 값 조작 헬퍼
/* 역전(invert)이 켜져 있으면 더하기와 곱하기가 서로 뒤바뀐다.
   그래서 모든 카드는 값을 직접 만지지 않고 이 둘을 거친다.
   S.acted 는 "이 카드가 실제로 뭔가 했나" — 조건이 안 맞았거나 되감기
   예산이 없어 헛돈 칸만 화면에 「그대로」로 찍으려고 둔다. 값이 그대로인지로
   판정하면, 1e20 에 +30 처럼 일은 했는데 표기 자릿수에 안 잡히는 경우까지
   「그대로」가 되어 제보와 같은 오해가 다시 생긴다 */
function ADD(S,k){ S.acted = true; if (S.inv) vMulN(S.v, k); else vAddN(S.v, k); }
function MUL(S,k){ S.acted = true; if (S.inv) vAddN(S.v, k); else vMulN(S.v, k); }

// ══════════════════════════════════ 카드
/* n 이름 / g 칸에 찍히는 짧은 글자 / r 등급 / d 설명 / fx 효과
   fx(S)에서 쓸 수 있는 것
     S.v      지금 흐르는 값 — { n, L } 쌍. 직접 만지지 말고 ADD·MUL·v* 함수를 거친다
     S.i      이 카드가 놓인 칸 번호 (0부터) — 자리에 반응하는 카드가 씀
     S.line   줄 전체
     S.mem    기억해둔 값
     S.loops  남은 되감기 횟수
     S.skip   true로 두면 다음 칸을 건너뜀
     S.jump   0 이상으로 두면 그 칸으로 점프 (되감기)
     S.last   직전에 실행된 칸 번호
     S.rnd()  난수 */
var CARDS = {
  // ── 기본 산술
  add3:   { n:'셋',      g:'+3',     r:'common',   d:'값에 3을 더한다',
            fx:function(S){ ADD(S,3); } },
  add7:   { n:'일곱',    g:'+7',     r:'common',   d:'값에 7을 더한다',
            fx:function(S){ ADD(S,7); } },
  add12:  { n:'열둘',    g:'+12',    r:'common',   d:'값에 12를 더한다',
            fx:function(S){ ADD(S,12); } },
  add30:  { n:'서른',    g:'+30',    r:'uncommon', d:'값에 30을 더한다',
            fx:function(S){ ADD(S,30); } },
  mul2:   { k:'mul', n:'곱절',    g:'×2',     r:'common',   d:'값을 2배로',
            fx:function(S){ MUL(S,2); } },
  mul3:   { k:'mul', n:'세 곱절', g:'×3',     r:'uncommon', d:'값을 3배로',
            fx:function(S){ MUL(S,3); } },
  mul5:   { k:'mul', n:'다섯 곱절',g:'×5',    r:'rare',     d:'값을 5배로',
            fx:function(S){ MUL(S,5); } },
  square: { n:'제곱',    g:'^2',     r:'uncommon', k:'mul',
            d:'값을 자기 자신과 곱한다. 100이면 10,000. 값이 1이면 그대로라 앞쪽에 두면 손해다',
            fx:function(S){ S.acted = true; vSq(S.v); } },
  /* 원래는 「자릿수 Σ」— 값을 자릿수의 합으로 바꾸는 카드였다. 하는 일은 같지만
     (값을 확 줄인다) 무엇에 쓰는 물건인지 이름에도 표기에도 안 적혀 있어서
     처음 보는 사람이 알아볼 수가 없었다. 결과를 100으로 못박아 바꿨다 */
  reset:  { n:'되돌림',  g:'→100',   r:'uncommon',
            d:'값을 100으로 되돌린다. 「모자람」이나 「올림」처럼 값이 작을 때만 터지는 카드를 다시 살릴 때 쓴다',
            fx:function(S){ S.acted = true; vSet(S.v, 100); } },

  // ── 조건 — 순서의 단순한 법칙(덧셈 먼저, 곱셈 나중)을 깨뜨리는 것들
  even3:  { k:'mul', n:'짝',      g:'짝×3',   r:'common',   d:'지금 값이 짝수면 3배. 홀짝은 앞칸들이 정한다',
            fx:function(S){ if (vEven(S.v)) MUL(S,3); } },
  odd15:  { n:'홀',      g:'홀+15',  r:'common',   d:'지금 값이 홀수면 15를 더한다. 홀짝은 앞칸들이 정한다',
            fx:function(S){ if (!vEven(S.v)) ADD(S,15); } },
  under:  { n:'모자람',  g:'<100+60',r:'common',   d:'값이 100보다 작으면 60을 더한다. 앞칸용',
            fx:function(S){ if (vLtN(S.v, 100)) ADD(S,60); } },
  over:   { k:'mul', n:'넘침',    g:'≥1k×2',  r:'uncommon', d:'값이 1000 이상이면 2배. 뒷칸용',
            fx:function(S){ if (vGeN(S.v, 1000)) MUL(S,2); } },

  // ── 자리 — 이 게임의 주제를 카드로 직접 말하는 것들
  pos:    { n:'자리값',  g:'자리×6', r:'common',   d:'놓인 칸 번호 곱하기 6을 더한다. 뒤에 놓을수록 크다',
            fx:function(S){ ADD(S, (S.i+1) * 6); } },
  edge:   { k:'mul', n:'끝자락',  g:'끝×3',   r:'uncommon', d:'줄의 마지막 칸에 있으면 3배',
            fx:function(S){ if (S.i === S.line.length-1) MUL(S,3); } },
  dense:  { k:'mul', n:'빽빽함',  g:'빽×4',   r:'rare',     d:'이 칸 왼쪽이 하나도 빠짐없이 차 있으면 4배',
            fx:function(S){ for (var k=0;k<S.i;k++) if (!S.line[k]) return; MUL(S,4); } },

  // ── 운
  coin:   { k:'mul', n:'동전',    g:'50%×6',  r:'uncommon', d:'절반의 확률로 6배, 아니면 아무 일도 없다',
            fx:function(S){ if (S.rnd() < 0.5) MUL(S,6); } },
  jackpot:{ k:'mul', n:'한탕',    g:'25%×20', r:'legend',   d:'4분의 1로 20배, 빗나가면 값이 3분의 1로 줄어든다',
            fx:function(S){ if (S.rnd() < 0.25) MUL(S,20); else { S.acted = true; vDivN(S.v, 3); } } },

  // ── 흐름 제어 — 콤보가 터지는 자리
  skip:   { n:'건너뜀',  g:'건너',      r:'uncommon', d:'바로 다음 칸을 통째로 건너뛴다. 잘못 박아놓은 칸을 죽일 때 쓴다',
            fx:function(S){ S.acted = true; S.skip = true; } },
  /* 무효 규칙에서 빠지는 유일한 카드. 제곱까지 같은 카드 취급이 되면서
     한 카드를 두 번 거는 수단이 이것뿐이 되었다. 그 하나까지 막으면
     지수 콤보가 아예 성립하지 않는다 */
  dup:    { n:'복제',    g:'복제',   r:'rare', stack:true,
            d:'바로 앞 칸의 카드를 한 번 더 실행한다. 앞 칸이 비어 있거나 또 다른 복제면 아무 일도 안 한다',
            fx:function(S){
              /* 「바로 앞 칸」이지 「직전에 실행된 카드」가 아니다.
                 예전엔 복제가 아닌 카드를 찾을 때까지 왼쪽으로 거슬러 올라갔는데,
                 그러면 복제를 여섯 장 이어 깔아 제곱을 일곱 번 거는 줄이 나왔다.
                 실제로 그게 유일한 승리 전략이 되어서, 총점 중앙값 1만점 대비
                 상위 10%가 1e181 — "복제를 몇 장 뽑았나" 게임이 됐다.

                 앞 칸만 보게 하면 복제를 이어 깔아도 두 번째부터는 복제를
                 복제하는 셈이라 저절로 죽는다. 여러 장 쓰려면 복제 사이사이에
                 다른 카드를 끼워야 하고, 그게 이 게임이 원래 묻는 질문이다 */
              var j = S.i - 1;
              if (j < 0) return;
              var c = S.line[j];
              if (!c || c.id === 'dup') return;
              if (mutedAt(S.line, j)) return;      // 무효인 칸은 복제해도 무효
              var keep = S.i;
              S.i = j;                             // 자리에 반응하는 카드는 원래 자기 칸으로
              CARDS[c.id].fx(S);                   // 안쪽 카드가 일을 했으면 S.acted 가 켜진다
              S.i = keep;
            } },
  rew2:   { n:'되감기 2',g:'↩2',     r:'rare',     d:'두 칸 왼쪽으로 돌아가 그 구간을 한 번 더 흐른다. 남은 되감기가 0이면 아무 일도 안 한다',
            fx:function(S){ if (S.loops > 0){ S.acted = true; S.loops--; S.loopUse++; S.jump = Math.max(0, S.i-2); } } },
  rew4:   { n:'되감기 4',g:'↩4',     r:'legend',   d:'네 칸 왼쪽으로 돌아가 그 구간을 한 번 더 흐른다. 남은 되감기가 0이면 아무 일도 안 한다',
            fx:function(S){ if (S.loops > 0){ S.acted = true; S.loops--; S.loopUse++; S.jump = Math.max(0, S.i-4); } } },
  mem:    { n:'저장',    g:'저장',   r:'uncommon', d:'지금 값을 저장해둔다. 그 자체로는 값이 안 바뀐다 — 뒤에 「불러오기」를 놔야 쓸모가 생긴다',
            fx:function(S){ S.acted = true; S.mem = vCopy(S.v); } },
  // ── 자리를 더 세게 묻는 것들 (2차 추가)
  front:  { n:'선봉',    g:'앞3×4',  r:'uncommon', k:'mul', d:'1·2·3번 칸에 있으면 4배. 그 밖에서는 아무 일도 없다',
            fx:function(S){ if (S.i < 3) MUL(S,4); } },
  mid:    { n:'한가운데',g:'중앙×6', r:'rare',     k:'mul', d:'줄의 한가운데 칸이면 6배. 칸이 늘어나면 가운데가 옮겨간다',
            fx:function(S){ if (S.i === Math.floor((S.line.length-1)/2)) MUL(S,6); } },
  gap:    { n:'틈새',    g:'빈칸×2', r:'rare',     k:'mul', d:'이 칸 왼쪽의 빈 칸 하나당 2배 (최대 세 칸까지)',
            fx:function(S){ var g=0; for (var k=0;k<S.i;k++) if (!S.line[k]) g++;
                            g = Math.min(g,3); if (g) MUL(S, Math.pow(2,g)); } },
  census: { n:'인구',    g:'장수×12',r:'common',   d:'줄에 놓여 있는 카드 장수 × 12 를 더한다. 빈 칸이 적을수록 커진다',
            fx:function(S){ var n=0; for (var k=0;k<S.line.length;k++) if (S.line[k]) n++; ADD(S, n*12); } },
  veteran:{ n:'고참',    g:'층×25',  r:'uncommon', d:'지금 층 번호 × 25 를 더한다. 1층에서는 25, 8층에서는 200',
            fx:function(S){ ADD(S, S.floor * 25); } },
  ceil:   { n:'올림',    g:'↑100',   r:'common',   d:'값을 그 위의 100 단위로 올린다. 7이면 100, 130이면 200. 값이 작을수록 이득이 크다',
            fx:function(S){ if (vBig(S.v)) return;                     // 1e15 위에서는 올려도 그대로
                            S.acted = true; vSet(S.v, Math.ceil(Math.max(S.v.n,1)/100) * 100); } },
  chain:  { n:'연쇄',    g:'곱뒤×3', r:'uncommon', k:'mul', d:'바로 앞에서 실행된 카드가 곱하기 계열(×2, 제곱, 짝×3 …)이었으면 3배',
            fx:function(S){ var p = S.last >= 0 && S.line[S.last];
                            if (p && CARDS[p.id].k === 'mul') MUL(S,3); } },
  twin:   { n:'짝패',    g:'쌍×3',   r:'rare',     k:'mul', d:'줄 어딘가에 자기와 같은 카드가 또 있으면 3배. 뒤쪽 같은 카드는 무효가 되지만 이 배수는 살아 있다',
            fx:function(S){ var id=S.line[S.i].id;
                            for (var k=0;k<S.line.length;k++)
                              if (k!==S.i && S.line[k] && S.line[k].id===id){ MUL(S,3); return; } } },
  add50:  { n:'쉰',      g:'+50',    r:'rare',     d:'값에 50을 더한다. 역전을 만나면 50배가 된다',
            fx:function(S){ ADD(S,50); } },
  bank:   { n:'반만 저장',g:'저장½',  r:'uncommon', d:'지금 값의 절반을 저장해둔다. 값 자체는 안 바뀐다',
            fx:function(S){ S.acted = true; S.mem = vDivN(vCopy(S.v), 2); } },
  swap:   { n:'맞바꿈',  g:'저장⇄',  r:'rare',     d:'지금 값과 저장해둔 값을 서로 맞바꾼다',
            fx:function(S){ S.acted = true; var t=S.v; S.v=S.mem; S.mem=t; } },
  /* 이 카드만 재실행 잠금이 따로 있다. 무효 규칙은 "같은 카드 두 장"을 막을 뿐
     "같은 칸 두 번"은 막지 않는데, 되감기 안에 이게 들어가면 매 패스마다
     되감기가 복구되어 영원히 돈다 */
  breath: { n:'숨돌리기',g:'½↩',   r:'rare',     d:'값이 절반으로 줄어드는 대신 되감기를 1 돌려준다. 한 판에 한 번만',
            fx:function(S){ if (S.breathed) return; S.breathed = true; S.acted = true;
                            vDivN(S.v, 2); S.loops++; } },

  /* 불러오기만 ADD를 안 거치고 값을 직접 만진다. 역전 아래에서 곱셈이 되면
     v × mem 이 되는데 mem이 곧 v라 제곱과 같아진다 */
  recall: { n:'불러오기',g:'불러',   r:'uncommon',
            d:'앞에서 「저장」해둔 값을 지금 값에 더한다. 저장 카드가 앞에 없으면 아무 일도 없다',
            fx:function(S){ S.acted = true; vAddV(S.v, S.mem); } },
  /* 켜기만 한다(토글이 아니라). 되감기로 이 칸을 다시 지나도 상태가 그대로여야
     같은 칸이 패스마다 다른 뜻이 되는 걸 막을 수 있다 */
  invert: { n:'역전',    g:'역전',      r:'rare',
            d:'이 칸보다 뒤에 있는 카드들의 더하기와 곱하기가 서로 뒤바뀐다. +30 은 ×30 이 되고, ×2 는 +2 가 된다',
            fx:function(S){ S.acted = true; S.inv = true; } },
};

var CARD_IDS = Object.keys(CARDS);

/* ══════ 한 줄의 단 하나뿐인 제한 ══════
   같은 카드는 줄에서 **가장 앞선 한 칸만** 효과가 있다. 뒤의 것은 무효.

   이 규칙 하나가 예전에 있던 온갖 임시방편(제곱 배수 상한, 지수 사용 횟수,
   자물쇠 표)을 전부 대신한다. 그것들은 카드 설명과 화면의 숫자를 어긋나게
   만들었다 — "값을 제곱한다"고 적힌 카드가 제곱을 안 하면 그건 그냥 버그로 보인다.
   이제 제곱은 언제나 진짜 제곱이고, 대신 두 장을 겹쳐 쌓을 수 없다.

   되감기로 같은 칸을 다시 지나는 건 막지 않는다. 이 규칙은 "같은 칸을 두 번"이
   아니라 "같은 카드를 두 장"에 대한 것이라서.

   예외는 「복제」 하나뿐이다 — CARDS 쪽에 stack:true 로 표시해뒀다.
   제곱까지 이 규칙에 들어오면서, 같은 카드를 두 번 거는 수단은 복제밖에
   남지 않았다. 그 하나까지 막으면 지수 콤보가 아예 성립하지 않는다 */
function mutedAt(line, i){
  var c = line[i];
  if (!c || CARDS[c.id].stack) return false;
  for (var k=0;k<i;k++) if (line[k] && line[k].id === c.id) return true;
  return false;
}
/* 되감기 계열이 줄에 몇 장인지 / 이 판에서 몇 번이나 쓸 수 있는지.
   카드가 예산보다 많으면 뒤쪽 되감기는 돌긴 도는데 아무 일도 안 한다 —
   화면만 봐서는 그냥 안 먹는 카드로 보여서 미리 알려줘야 한다 */
function loopAudit(line, floor){
  var cards = 0, budget = loopBudgetFor(floor);
  for (var k=0;k<line.length;k++){
    var c = line[k];
    if (!c || mutedAt(line, k)) continue;
    if (c.id === 'rew2' || c.id === 'rew4') cards++;
    if (c.id === 'breath') budget++;
  }
  return { cards:cards, budget:budget, over:(cards > budget) };
}

/* 줄에 이 카드가 이미 있나 — 보상 후보에 경고를 띄우려고 화면이 쓴다 */
function haveIn(line, id){
  for (var k=0;k<line.length;k++) if (line[k] && line[k].id === id) return k;
  return -1;
}

// ══════════════════════════════════ 시작 손패
/* 세 장으로 1층(20)을 넘기려면 +3 +7 을 앞에, ×2 를 뒤에 둬야 한다.
   첫 판부터 "순서가 전부"라는 걸 손으로 알게 하려고 이렇게 골랐다 */
var START_HAND = ['add3','add7','mul2'];

// ══════════════════════════════════ 실행기
/* 이 게임의 심장. 순수 함수라 시뮬레이터가 그대로 수천 번 돌린다.
   line: 칸 배열 (빈 칸은 null, 채운 칸은 {id:...})
   반환: score 최종 값 / trace 칸마다 값이 어떻게 변했나 / loopsUsed */
function run(line, rnd, floor){
  var S = {
    floor: floor || 1,
    v: V(START_VALUE), i: 0, mem: V(0), loops: loopBudgetFor(floor),
    inv: false, skip: false, jump: -1, last: -1, breathed: false, acted: false,
    line: line, rnd: rnd || Math.random, trace: [], loopUse: 0
  };
  /* 같은 카드가 여러 칸에 있으면 가장 앞선 칸만 살린다.
     굴리기 전에 한 번 훑어두면 되감기로 몇 번을 지나든 판정이 흔들리지 않는다 */
  var firstAt = {};
  for (var q=0;q<line.length;q++){
    var cc = line[q];
    if (cc && !CARDS[cc.id].stack && firstAt[cc.id] === undefined) firstAt[cc.id] = q;
  }

  var steps = 0;
  while (S.i >= 0 && S.i < line.length && steps++ < STEP_CAP){
    var c = line[S.i];
    if (!c){ S.i++; continue; }                       // 빈 칸은 그냥 지나감
    if (firstAt[c.id] !== undefined && firstAt[c.id] !== S.i){   // 같은 카드가 앞칸에 있다 — 무효
      S.trace.push({ i:S.i, id:c.id, from:vCopy(S.v), to:vCopy(S.v), muted:true });
      S.i++; continue;                                // S.last 는 건드리지 않는다
    }
    if (S.skip){                                      // 앞칸의 건너뜀에 걸린 칸
      S.skip = false;
      S.trace.push({ i:S.i, id:c.id, from:vCopy(S.v), to:vCopy(S.v), skipped:true });
      S.i++; continue;
    }
    S.jump = -1;
    S.acted = false;
    var before = vCopy(S.v);
    CARDS[c.id].fx(S);
    /* idle — 실행은 됐는데 카드가 아무것도 안 한 칸. 조건이 안 맞았거나(짝×3인데
       홀수), 쓸 자원이 없거나(되감기 예산 0), 이미 한 번 쓴 카드(숨돌리기)다.
       무효와는 다르다 — 이건 카드가 돌긴 돌았는데 걸릴 데가 없었던 것 */
    S.trace.push({ i:S.i, id:c.id, from:before, to:vCopy(S.v), inv:S.inv,
                   loopsLeft:S.loops, idle:!S.acted });
    S.last = S.i;
    if (S.jump >= 0) S.i = S.jump; else S.i++;
  }
  return { v:S.v, L:S.v.L, score:vNum(S.v), trace:S.trace, loopsUsed: S.loopUse, loopsLeft: S.loops };
}

/* 운 카드가 섞인 줄은 한 번 돌려선 실력을 알 수 없다.
   배치를 고를 때(사람이든 시뮬레이터든)는 이 기댓값을 본다 */
function expectedV(line, rnd, samples, floor){
  samples = samples || 7;
  var hasLuck = false;
  for (var k=0;k<line.length;k++){
    var c = line[k];
    if (c && (c.id === 'coin' || c.id === 'jackpot')) hasLuck = true;
  }
  if (!hasLuck) return run(line, rnd, floor).v;
  /* 평균을 자릿수 공간에서 낸다. 1e300 짜리 표본 몇 개를 그냥 더하면 넘친다 */
  var Ls = [], small = true, sum = 0;
  for (var s=0;s<samples;s++){
    var v = run(line, rnd, floor).v;
    Ls.push(v.L);
    if (vBig(v)) small = false; else sum += v.n;
  }
  if (small) return V(sum / samples);
  var m = -Infinity;
  for (var q=0;q<Ls.length;q++) if (Ls[q] > m) m = Ls[q];
  var acc = 0;
  for (var r=0;r<Ls.length;r++) acc += Math.pow(10, Ls[r] - m);
  return vSetL({ n:0, L:0 }, m + Math.log10(acc / samples));
}

/* ── 예전 이름들. 새 코드는 쓰지 않는다.
   GitHub Pages 가 파일을 10분까지 캐시해서, 배포 직후엔 예전 index.html 이
   새 engine.js 를 부를 수 있다. 그 몇 분 동안 게임이 깨지지 않게 예전처럼
   그냥 수를 돌려준다(1.8e308 을 넘으면 Infinity) */
function vNum(x){ return vBig(x) ? Math.pow(10, x.L) : x.n; }
function expected(line, rnd, samples, floor){ return vNum(expectedV(line, rnd, samples, floor)); }
function targetFor(floor){ return vNum(targetV(floor)); }

/* 층을 실제로 굴릴 때 쓰는 난수. 층마다 독립 — 미리보기를 몇 번 눌렀는지가
   결과를 바꾸면 데일리 비교가 깨진다. 게임·시뮬레이터·순위 서버의 재생이
   전부 이 함수를 쓴다 */
function execRnd(seed, floor){ return mulberry32((seed ^ (floor * 7919)) >>> 0); }

// ══════════════════════════════════ 뽑기
/* 층이 깊어질수록 상급·전설이 나오고 보통은 줄어든다.
   등급 곡선을 표로 둔 건 시뮬레이터로 한 줄씩 만져가며 맞추려고 */
var WEIGHT = {
  common:   [100, 88, 74, 58, 44, 32, 24, 18],
  uncommon: [ 20, 34, 46, 54, 58, 58, 54, 48],
  rare:     [  2,  7, 15, 25, 34, 42, 48, 52],
  legend:   [  0,  1,  3,  7, 12, 18, 24, 30]
};
function weightFor(r, floor){
  var a = WEIGHT[r];
  var i = Math.min(Math.max(floor,1), a.length) - 1;
  return a[i];
}
/* 앞 세 층에서는 후보 한 자리를 무조건 "값을 반드시 올리는" 카드로 채운다.
   목표를 아무리 낮춰도 5%의 날은 뽑기가 Σ자릿수·건너뜀·기억처럼
   그 자체로는 점수를 못 올리는 카드로만 채워져서 손쓸 방법이 없었다.
   난이도가 아니라 뽑기의 문제였음 */
var CHOICES = 4;      // 층 보상으로 보여주는 후보 장수
var EARLY_GUARD = 3;
var SAFE = ['add3','add7','add12','add30','mul2','mul3','mul5','square','under','pos'];

function rollChoices(floor, rnd, n){
  n = n || CHOICES;
  var out0 = [];
  if (floor <= EARLY_GUARD) out0.push(SAFE[Math.floor(rnd()*SAFE.length)]);
  var pool = [];
  for (var k=0;k<CARD_IDS.length;k++){
    var id = CARD_IDS[k];
    var w = weightFor(CARDS[id].r, floor);
    for (var i=0;i<w;i++) pool.push(id);
  }
  var out = out0, guard = 0;
  while (out.length < n && pool.length && guard++ < 800){
    var pick = pool[Math.floor(rnd()*pool.length)];
    if (out.indexOf(pick) < 0) out.push(pick);
  }
  return out;
}

// ══════════════════════════════════ 난수 (시드 고정)
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 오늘 날짜를 시드로. 같은 날 접속한 사람은 전부 같은 카드가 같은 순서로 나온다 —
   이게 있어야 "운이 좋았네"가 빠지고 배치 판단만 남아서 점수 비교가 성립함 */
function dayNumber(d){
  d = d || new Date();
  var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(utc / 86400000);
}
/* 날짜 번호 → 시드. 순위 서버가 제출된 판을 다시 돌릴 때도 이걸 쓴다 */
function seedForDay(n){ return (n * 2654435761) >>> 0; }
function dailySeed(d){ return seedForDay(dayNumber(d)); }

/* 규칙 판 번호. 점수가 달라지는 규칙을 바꾸면 올린다.
   순위 서버는 번호가 다른 제출을 받지 않는다 — 옛 규칙으로 둔 판을 새 규칙으로
   재생하면 점수가 달라져서, 화면에서 본 것과 다른 기록이 남기 때문.
     1  첫 순위 서버 (2026-09-11 오후)
     2  무한 모드 되감기 증가 + 목표 도약, 총점에 마지막 층 점수 포함 */
var RULES = 2;

// ══════════════════════════════════ 내보내기
var ENGINE = {
  RULES:RULES, LOOP_STEP:LOOP_STEP, ENDLESS_JUMP:ENDLESS_JUMP,
  SLOTS_START:SLOTS_START, SLOTS_MAX:SLOTS_MAX, LOOP_BUDGET:LOOP_BUDGET,
  START_VALUE:START_VALUE, TARGETS:TARGETS, L_CAP:L_CAP,
  ENDLESS_POW:ENDLESS_POW, REPAIR_ON:REPAIR_ON, SLOT_GAIN_ON:SLOT_GAIN_ON,
  RARITY:RARITY, CARDS:CARDS, CARD_IDS:CARD_IDS, START_HAND:START_HAND, CHOICES:CHOICES,
  run:run, loopBudgetFor:loopBudgetFor, expectedV:expectedV, execRnd:execRnd, expected:expected, targetFor:targetFor, mutedAt:mutedAt, haveIn:haveIn, loopAudit:loopAudit,
  targetV:targetV, passes:passes,
  V:V, vFromL:function(L){ return vSetL({ n:0, L:0 }, L); }, vAdd:vAddV, vCmp:vCmp, vEq:vEq, vBig:vBig, vCopy:vCopy, vPack:vPack, vUnpack:vUnpack,
  rollChoices:rollChoices, weightFor:weightFor,
  mulberry32:mulberry32, dailySeed:dailySeed, dayNumber:dayNumber, seedForDay:seedForDay,
  /* 시뮬레이터가 수치를 바꿔가며 재보려고 열어둔 손잡이.
     게임(index.html)은 절대 안 부른다 — 부르는 순간 데일리가 사람마다 달라짐 */
  setTargets:function(t,e){ TARGETS = t; if (e) ENDLESS_POW = e; },
  setLoopBudget:function(n){ LOOP_BUDGET = n; },
  setLoopStep:function(n){ LOOP_STEP = n; },
  /* 내보내기 객체는 값을 복사해 간다. 안쪽 변수만 바꾸면 ENGINE.SLOTS_MAX 를
     읽는 쪽은 예전 값을 계속 본다 — 한 번 이걸로 시뮬레이터가 네 설정을
     전부 같은 결과로 뱉었다. 둘 다 맞춰준다 */
  setSlots:function(max, gainOn){
    SLOTS_MAX = ENGINE.SLOTS_MAX = max;
    SLOT_GAIN_ON = ENGINE.SLOT_GAIN_ON = gainOn;
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
