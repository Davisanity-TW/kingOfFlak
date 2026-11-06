import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRoundIdentity,
  parseNickname,
  readSavedNickname,
} from "../src/nickname.ts";

test("nicknames trim outer whitespace and count Unicode code points", () => {
  for (const name of [
    "A",
    "玩家_09",
    "Ace_pc",
    "Ace_mb",
    "𠮷",
    "A".repeat(12),
    "𠮷".repeat(12),
  ]) {
    assert.equal(parseNickname(`  ${name}\n`), name);
  }
  for (const value of [
    "",
    "  ",
    "A".repeat(13),
    "𠮷".repeat(13),
    "A B",
    "A\tB",
    "A\nB",
    "😀",
    "é",
    "Ａ",
    "Ace-pc",
    "<script>",
    123,
    null,
    undefined,
  ]) {
    assert.equal(parseNickname(value), null);
  }
});

test("each immutable round identity retains its original name and mode", () => {
  const first = createRoundIdentity(" Ace_pc ", false)!;
  assert.deepEqual(first, {
    nickname: "Ace_pc",
    mobile: false,
    displayName: "Ace_pc",
  });
  const second = createRoundIdentity("玩家_mb", true)!;
  assert.equal(second.displayName, "玩家_mb");
  assert.equal(first.displayName, "Ace_pc");
  assert.ok(Object.isFrozen(first));
  assert.throws(() => Object.assign(first, { nickname: "Other" }), TypeError);
  assert.equal(createRoundIdentity(" ", false), null);
});

test("saved nicknames reject corrupt, obsolete and invalid values without guessing suffixes", () => {
  assert.equal(
    readSavedNickname(JSON.stringify({ version: 1, nickname: " Ace_pc " })),
    "Ace_pc",
  );
  for (const raw of [
    null,
    "",
    "broken",
    "null",
    "42",
    '"Ace"',
    "[]",
    '{"version":2,"nickname":"Ace"}',
    '{"version":1}',
    '{"version":1,"nickname":false}',
    '{"version":1,"nickname":"Bad Name"}',
  ]) {
    assert.equal(readSavedNickname(raw), "");
  }
});
