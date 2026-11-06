import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatTaipei,
  parseScore,
  readLeaderboard,
  ServiceError,
  toScoreTenths,
} from "../src/leaderboard.ts";

const valid = {
  roundId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nickname: " Ace_pc ",
  mode: "pc",
  scoreTenths: 201,
};
test("scores use rounded tenths with no arbitrary duration ceiling", () => {
  for (const [seconds, tenths] of [
    [0, 0],
    [1.24, 12],
    [1.25, 13],
    [20.05, 201],
    [1000000000, 10000000000],
  ])
    assert.equal(toScoreTenths(seconds), tenths);
  for (const invalid of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    assert.throws(() => toScoreTenths(invalid), RangeError);
});
test("the server contract validates originals, UUIDs, modes and exact safe integer scores", () => {
  assert.deepEqual(parseScore(valid), { ...valid, nickname: "Ace_pc" });
  for (const change of [
    { roundId: "invalid" },
    { nickname: "Bad Name" },
    { mode: "tablet" },
    { scoreTenths: -1 },
    { scoreTenths: 1.1 },
    { scoreTenths: NaN },
    { scoreTenths: Infinity },
    { scoreTenths: Number.MAX_SAFE_INTEGER + 1 },
    { receivedAt: "2020-01-01" },
    { rank: 1 },
  ])
    assert.equal(parseScore({ ...valid, ...change }), null);
  for (const value of [null, [], 1, "text"])
    assert.equal(parseScore(value), null);
  assert.equal(
    parseScore({ ...valid, scoreTenths: Number.MAX_SAFE_INTEGER })?.scoreTenths,
    Number.MAX_SAFE_INTEGER,
  );
});

test("dates cross midnight in Taipei regardless of viewer timezone", () => {
  assert.equal(formatTaipei("2026-01-01T16:01:00.000Z"), "2026/01/02 00:01");
});

test("legacy scores split into independent databases without changing originals, IDs or dates", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readFileSync } = await import("node:fs");
  const { splitScoreSql } = await import("../server/migrate-scores.ts");
  const records = [
    {
      ...valid,
      nickname: "Ace_pc",
      id: "desktop",
      receivedAt: "2026-01-01T16:01:00.000Z",
    },
    {
      ...valid,
      roundId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      nickname: "原名_mb",
      mode: "mb",
      id: "mobile",
      receivedAt: "2026-01-01T16:02:00.000Z",
    },
  ];
  const sql = splitScoreSql(records);
  for (const [index, mode] of (["pc", "mb"] as const).entries()) {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync("server/migrations/0001_scores.sql", "utf8"));
    db.exec(sql[mode]);
    db.exec(sql[mode]);
    const rows = db
      .prepare(
        "SELECT round_id AS roundId,id,nickname,mode,score_tenths AS scoreTenths,received_at AS receivedAt FROM scores",
      )
      .all();
    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0] }, records[index]);
    db.close();
  }
  assert.throws(() => splitScoreSql([{ ...records[0], mode: "unknown" }]));
  assert.throws(() => splitScoreSql([{ ...records[0], nickname: "<script>" }]));
});

test("reading a board rejects records from another mode", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json([
      {
        ...valid,
        nickname: "Ace_pc",
        id: "desktop",
        receivedAt: "2026-01-01T16:01:00.000Z",
      },
    ]),
  );
  assert.equal((await readLeaderboard("https://scores.test", "pc")).length, 1);
  await assert.rejects(
    readLeaderboard("https://scores.test", "mb"),
    ServiceError,
  );
});
