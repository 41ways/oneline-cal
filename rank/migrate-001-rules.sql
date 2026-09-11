-- 2026-09-11 역대 순위를 붙이며 규칙 번호 칸을 더했다. 이미 만든 D1 에 한 번만 돌린다.
-- (새로 만드는 곳은 schema.sql 에 이미 들어 있으니 필요 없다)
ALTER TABLE runs ADD COLUMN rules INTEGER NOT NULL DEFAULT 2;
CREATE INDEX IF NOT EXISTS runs_best ON runs (rules, L DESC, at ASC);
