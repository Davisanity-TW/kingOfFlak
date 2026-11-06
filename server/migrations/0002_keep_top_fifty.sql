DELETE FROM scores WHERE round_id NOT IN (
  SELECT round_id FROM scores
  ORDER BY score_tenths DESC, received_at ASC, id ASC LIMIT 50
);
