import { parseScore } from "../src/leaderboard.ts";

export function splitScoreSql(records: unknown): Record<"pc" | "mb", string> {
  if (!Array.isArray(records)) throw new Error("Expected legacy score rows");
  const statements: Record<"pc" | "mb", string[]> = { pc: [], mb: [] };
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  for (const row of records) {
    if (!row || typeof row !== "object") throw new Error("Invalid legacy row");
    const score = parseScore({
      roundId: row.roundId,
      nickname: row.nickname,
      mode: row.mode,
      scoreTenths: row.scoreTenths,
    });
    if (
      !score ||
      typeof row.id !== "string" ||
      !row.id ||
      typeof row.receivedAt !== "string" ||
      !Number.isFinite(Date.parse(row.receivedAt))
    )
      throw new Error("Invalid legacy score");
    statements[score.mode].push(
      `INSERT INTO scores(round_id,id,nickname,mode,score_tenths,received_at) VALUES (${quote(score.roundId)},${quote(row.id)},${quote(score.nickname)},${quote(score.mode)},${score.scoreTenths},${quote(row.receivedAt)}) ON CONFLICT(round_id) DO NOTHING;`,
    );
  }
  const trim =
    "DELETE FROM scores WHERE round_id NOT IN (SELECT round_id FROM scores ORDER BY score_tenths DESC, received_at ASC, id ASC LIMIT 50);";
  return {
    pc: [...statements.pc, trim].join("\n"),
    mb: [...statements.mb, trim].join("\n"),
  };
}
