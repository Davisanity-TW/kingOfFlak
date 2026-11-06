import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTaipei, parseScore, toScoreTenths } from "../src/leaderboard.ts";

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
