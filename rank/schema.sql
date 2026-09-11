-- 한 줄 데일리 순위. 한 사람(pid)은 하루에 한 줄 — 그날 첫 판만 남는다.
-- 날짜가 바뀌어도 지우지 않는다. 역대 순위는 이 표 전체에서 뽑는다.
CREATE TABLE IF NOT EXISTS runs (
  day    INTEGER NOT NULL,   -- 날짜 번호 (engine.dayNumber)
  pid    TEXT    NOT NULL,   -- 브라우저가 만든 무작위 아이디. 이름은 아니다
  name   TEXT    NOT NULL,
  floor  INTEGER NOT NULL,   -- 통과한 층 수
  L      REAL    NOT NULL,   -- 총점의 자릿수 log10 (0점이면 -1)
  n      REAL,               -- 총점이 1e15 미만이면 정확한 값, 아니면 NULL
  line   TEXT    NOT NULL,   -- 마지막 줄의 카드 id, 쉼표로
  at     INTEGER NOT NULL,   -- 올린 시각 (ms)
  rules  INTEGER NOT NULL DEFAULT 2,   -- engine.RULES. 규칙이 다른 판끼리는 점수를 견줄 수 없다
  PRIMARY KEY (day, pid)
);
CREATE INDEX IF NOT EXISTS runs_rank ON runs (day, L DESC, at ASC);
CREATE INDEX IF NOT EXISTS runs_best ON runs (rules, L DESC, at ASC);
