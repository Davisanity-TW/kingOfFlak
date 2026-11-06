CREATE TABLE scores (
  round_id TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('pc', 'mb')),
  score_tenths INTEGER NOT NULL CHECK (score_tenths >= 0 AND score_tenths <= 9007199254740991),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX scores_ranking ON scores(score_tenths DESC, received_at ASC, id ASC);
CREATE TABLE submission_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX submission_limits_expiry ON submission_limits(expires);
