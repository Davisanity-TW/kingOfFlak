import assert from "node:assert/strict";
import { test } from "node:test";
import { createGame, startGame, setKey, advance } from "../src/game.ts";

test("direction keys move at 240 units per second, normalize diagonals, cancel opposites and stop on release", () => {
  const game = createGame();
  startGame(game, []);
  setKey(game, "ArrowRight", true);
  advance(game, 0.5);
  assert.deepEqual(game.player, { x: 520, y: 300 });
  setKey(game, "ArrowUp", true);
  advance(game, 0.5);
  assert.ok(Math.abs(game.player.x - 604.8528137423857) < 1e-8);
  assert.ok(Math.abs(game.player.y - 215.1471862576143) < 1e-8);
  setKey(game, "ArrowLeft", true);
  setKey(game, "ArrowDown", true);
  const stopped = { ...game.player };
  advance(game, 0.5);
  assert.deepEqual(game.player, stopped);
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    setKey(game, key, false);
  }
  advance(game, 0.5);
  assert.deepEqual(game.player, stopped);
});

test("large updates follow the real wall-slide path and match short updates", () => {
  const large = createGame();
  const small = createGame();
  for (const game of [large, small]) {
    startGame(game, [{ x: 750, y: 12, vx: 0, vy: 0 }]);
    setKey(game, "ArrowRight", true);
    setKey(game, "ArrowUp", true);
  }
  advance(large, 5);
  for (let i = 0; i < 500; i++) advance(small, 0.01);
  assert.equal(large.phase, "over");
  assert.ok(large.elapsed > 1.9 && large.elapsed < 2.1);
  assert.ok(Math.abs(large.elapsed - small.elapsed) < 1e-8);
  assert.ok(Math.abs(large.player.x - small.player.x) < 1e-8);
});

test("test bullets remain in the map and preserve their speed on reflection", () => {
  const game = createGame();
  startGame(game, [{ x: 790, y: 10, vx: 120, vy: 0 }]);
  advance(game, 1);
  assert.equal(game.bullets[0].x, 682);
  assert.equal(game.bullets[0].vx, -120);
});

test("bullets touch the visible body and wings, but transparent corners remain safe", () => {
  for (const position of [
    { x: 416, y: 306 },
    { x: 400, y: 316 },
    { x: 400, y: 300 },
  ]) {
    const game = createGame();
    startGame(game, [{ ...position, vx: 0, vy: 0 }]);
    advance(game, 0.01);
    assert.equal(game.phase, "over");
    assert.equal(game.elapsed, 0);
    assert.ok(game.contact);
  }
  const game = createGame();
  startGame(game, [{ x: 411, y: 289, vx: 0, vy: 0 }]);
  advance(game, 0.01);
  assert.equal(game.phase, "playing");
});

test("a fast bullet stops the whole world at first contact instead of tunneling through", () => {
  const game = createGame();
  startGame(game, [
    { x: 400, y: 100, vx: 0, vy: 1000 },
    { x: 100, y: 100, vx: 100, vy: 0 },
  ]);
  advance(game, 1);
  assert.equal(game.phase, "over");
  assert.ok(Math.abs(game.elapsed - 0.184) < 1e-8);
  assert.deepEqual(game.contact, { x: 400, y: 288 });
  assert.ok(Math.abs(game.bullets[1].x - 118.4) < 1e-8);
});

test("the full plane stays inside every wall and slides along a wall", () => {
  const game = createGame();
  startGame(game, []);
  setKey(game, "ArrowRight", true);
  advance(game, 10);
  assert.deepEqual(game.player, { x: 788, y: 300 });
  setKey(game, "ArrowUp", true);
  advance(game, 0.5);
  assert.equal(game.player.x, 788);
  assert.ok(Math.abs(game.player.y - 215.1471862576143) < 1e-8);
  advance(game, 10);
  assert.deepEqual(game.player, { x: 788, y: 12 });
  setKey(game, "ArrowRight", false);
  setKey(game, "ArrowUp", false);
  setKey(game, "ArrowLeft", true);
  setKey(game, "ArrowDown", true);
  advance(game, 10);
  assert.ok(Math.abs(game.player.x - 12) < 1e-8);
  assert.ok(Math.abs(game.player.y - 588) < 1e-8);
});

test("simultaneous hits freeze one result, include fatal bullets, and restart resets every state", () => {
  const game = createGame();
  startGame(game);
  const original = structuredClone(game.bullets);
  assert.equal(original.length, 6);
  setKey(game, "ArrowRight", true);
  startGame(game);
  assert.equal(game.keys.size, 0);
  advance(game, 4);
  assert.equal(game.phase, "over");
  assert.equal(game.bullets.length, 6);
  assert.ok(game.elapsed > 2 && game.elapsed < 3);
  const result = structuredClone(game);
  advance(game, 100);
  setKey(game, "ArrowLeft", true);
  assert.deepEqual(game, result);
  startGame(game);
  assert.equal(game.phase, "playing");
  assert.deepEqual(game.player, { x: 400, y: 300 });
  assert.equal(game.elapsed, 0);
  assert.equal(game.contact, null);
  assert.equal(game.keys.size, 0);
  assert.deepEqual(game.bullets, original);
});

test("invalid elapsed time cannot corrupt the game state", () => {
  const game = createGame();
  startGame(game);
  const original = structuredClone(game);
  for (const seconds of [-1, NaN, Infinity]) {
    assert.throws(() => advance(game, seconds), RangeError);
    assert.deepEqual(game, original);
  }
});
