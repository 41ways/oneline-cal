/* ══════════════════════════════════════════════════════════════════
   한 줄 — 데일리 순위 서버

   GET  /api/top?day=20707&me=<pid>   그날 순위 (위 20명 + 내 자리)
   POST /api/submit                    { day, pid, name, moves }

   점수를 믿지 않는다. 브라우저가 보내는 건 "한 판 동안 둔 수"뿐이고,
   서버가 게임과 똑같은 engine.js 로 그 수순을 처음부터 다시 돌려 점수를
   직접 계산한다. 데일리는 날짜로 시드가 정해지니 카드가 뭐가 나왔는지도
   서버가 안다 — 그래서 "안 나온 카드를 놨다"거나 "못 넘은 층을 넘었다"는
   제출은 재생 중에 걸러진다. 조작된 점수를 올릴 길이 애초에 없다.

   한 사람(pid)은 하루에 한 줄. 게임 쪽 규칙("오늘 기록은 첫 판만")과 같다.
   ══════════════════════════════════════════════════════════════════ */
import E from '../../engine.js';

const MAX_BODY  = 16 * 1024;   // 수순은 층당 수십 바이트라 넉넉하다
const MAX_NAME  = 12;
const TOP_N     = 20;

// ══════════════════════════════════ 출처
function allowed(origin, env) {
  if (!origin) return false;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return String(env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).includes(origin);
}
function headers(origin, env, method) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  // 보기는 어디서든, 올리기는 허락한 페이지에서만
  if (method === 'GET') h['Access-Control-Allow-Origin'] = '*';
  else if (allowed(origin, env)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: h });

// ══════════════════════════════════ 재생
/* index.html 의 진행과 한 줄 한 줄 같아야 한다.
     층 실행 → 못 넘으면 끝 → 총점에 더함 → (2·4·6·8·10층) 칸 +1
     → (3·6·9·12층) 정비 맞바꾸기 → 층 +1 → 후보 4장 뽑기 → 하나 골라 놓기
   후보를 뽑는 난수(offer)는 판 전체에서 하나로 이어지므로 순서가 한 칸만
   어긋나도 그 뒤 후보가 전부 달라진다 — 그러면 고른 카드가 후보에 없어
   재생이 거절된다. 게임과 서버의 규칙이 어긋났다는 신호이기도 하다 */
function replay(day, moves) {
  if (!moves || !Array.isArray(moves.start) || !Array.isArray(moves.floors)) throw new Error('수순 형식');
  if (moves.start.length !== E.START_HAND.length) throw new Error('시작 손패 수');
  if (moves.floors.length > 500) throw new Error('수순이 너무 김');

  const seed  = E.seedForDay(day);
  const offer = E.mulberry32(seed);
  const line  = new Array(E.SLOTS_START).fill(null);
  const slotOk = i => Number.isInteger(i) && i >= 0 && i < line.length;

  E.START_HAND.forEach((id, h) => {
    const i = moves.start[h];
    if (!slotOk(i)) throw new Error('시작 손패 칸');
    line[i] = { id };
  });

  const total = E.V(0);
  let floor = 1, cleared = 0;
  for (;;) {
    const res = E.run(line, E.execRnd(seed, floor), floor);
    if (!E.passes(res.v, floor)) break;
    E.vAdd(total, res.v);
    cleared = floor;

    const step = moves.floors[floor - 1];
    if (!step) break;                                  // 여기서 그만둔 판

    if (E.SLOT_GAIN_ON.indexOf(floor) >= 0 && line.length < E.SLOTS_MAX) line.push(null);
    if (step.swap != null) {
      if (E.REPAIR_ON.indexOf(floor) < 0) throw new Error(floor + '층은 정비가 없는 층');
      const [a, b] = step.swap;
      if (!slotOk(a) || !slotOk(b) || a === b) throw new Error(floor + '층 정비 칸');
      const t = line[a]; line[a] = line[b]; line[b] = t;
    }
    floor++;
    const choices = E.rollChoices(floor, offer, E.CHOICES);
    if (choices.indexOf(step.pick) < 0) throw new Error(floor + '층 후보에 없는 카드');
    if (!slotOk(step.slot)) throw new Error(floor + '층 놓은 칸');
    line[step.slot] = { id: step.pick };
  }
  /* 서버는 못 넘었다는데 브라우저는 다음 수를 뒀다 — 규칙이 서로 다르다 */
  if (moves.floors.length > cleared) throw new Error((cleared + 1) + '층을 못 넘었는데 다음 수가 있음');
  return { cleared, total, line };
}

// ══════════════════════════════════ 이름
function cleanName(s) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  const cut = Array.from(t).slice(0, MAX_NAME).join('');
  return cut || '이름없음';
}
const pidOk = p => typeof p === 'string' && /^[a-z0-9]{8,32}$/.test(p);
function dayOk(day) {
  // 게임은 "보는 사람 동네의 날짜"로 시드를 정한다. 한국은 UTC 보다 하루 앞설 때가 있다
  const today = Math.floor(Date.now() / 86400000);
  return Number.isInteger(day) && day >= today - 1 && day <= today + 1;
}

// ══════════════════════════════════ 순위
const rowOut = (r, rank, me) => ({
  rank, name: r.name, floor: r.floor,
  total: { n: r.n, L: r.L < 0 ? null : r.L },
  line: r.line ? r.line.split(',') : [],
  me: !!me,
});
async function rankOf(env, day, L, at) {
  const r = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM runs WHERE day = ?1 AND (L > ?2 OR (L = ?2 AND at < ?3))'
  ).bind(day, L, at).first();
  return (r ? r.c : 0) + 1;
}
async function board(env, day, me) {
  const [list, cnt] = await env.DB.batch([
    env.DB.prepare('SELECT pid, name, floor, L, n, line, at FROM runs WHERE day = ?1 ORDER BY L DESC, at ASC LIMIT ?2').bind(day, TOP_N),
    env.DB.prepare('SELECT COUNT(*) AS c FROM runs WHERE day = ?1').bind(day),
  ]);
  const rows = list.results.map((r, i) => rowOut(r, i + 1, me && r.pid === me));
  let mine = rows.find(r => r.me) || null;
  if (!mine && me) {
    const r = await env.DB.prepare('SELECT pid, name, floor, L, n, line, at FROM runs WHERE day = ?1 AND pid = ?2').bind(day, me).first();
    if (r) mine = rowOut(r, await rankOf(env, day, r.L, r.at), true);
  }
  return { day, count: cnt.results[0].c, rows, mine };
}

// ══════════════════════════════════ 요청
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const h = headers(origin, env, req.method === 'GET' ? 'GET' : 'POST');

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    try {
      if (url.pathname === '/api/top' && req.method === 'GET') {
        const day = parseInt(url.searchParams.get('day'), 10);
        if (!Number.isInteger(day)) return json({ error: 'day' }, 400, h);
        const me = url.searchParams.get('me');
        return json(await board(env, day, pidOk(me) ? me : null), 200, h);
      }

      if (url.pathname === '/api/submit' && req.method === 'POST') {
        if (!allowed(origin, env)) return json({ error: '허락되지 않은 페이지' }, 403, h);
        const raw = await req.text();
        if (raw.length > MAX_BODY) return json({ error: '너무 큼' }, 413, h);
        let body;
        try { body = JSON.parse(raw); } catch (e) { return json({ error: 'JSON' }, 400, h); }

        const { day, pid, moves } = body || {};
        if (!dayOk(day)) return json({ error: '오늘 판이 아님' }, 400, h);
        if (!pidOk(pid)) return json({ error: 'pid' }, 400, h);
        const name = cleanName(body.name);

        let out;
        try { out = replay(day, moves); }
        catch (e) { return json({ error: '재생 실패 — ' + e.message }, 422, h); }

        const L = out.total.L === -Infinity ? -1 : out.total.L;
        const n = E.vBig(out.total) ? null : out.total.n;
        const ids = out.line.map(c => (c ? c.id : '')).join(',');
        const at = Date.now();
        const ins = await env.DB.prepare(
          'INSERT OR IGNORE INTO runs (day, pid, name, floor, L, n, line, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
        ).bind(day, pid, name, out.cleared, L, n, ids, at).run();

        const b = await board(env, day, pid);
        return json({
          recorded: ins.meta.changes === 1,        // false 면 오늘 이미 올린 판이 있다
          floor: out.cleared,
          total: { n, L: L < 0 ? null : L },
          ...b,
        }, 200, h);
      }

      if (url.pathname === '/') return new Response('oneline-rank', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return json({ error: '없는 길' }, 404, h);
    } catch (e) {
      return json({ error: '서버 오류' }, 500, h);
    }
  },
};

// 테스트가 재생만 따로 부를 수 있게
export { replay, cleanName };
