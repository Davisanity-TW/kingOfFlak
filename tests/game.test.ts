import assert from "node:assert/strict";
import { test } from "node:test";
import { closestOutlinePoint } from "../src/collision.ts";
import { createGame, startGame, setKey, advance } from "../src/game.ts";

test("direction keys move at 240 units per second, normalize diagonals, cancel opposites and stop on release", () => {
  const game = createGame();
  startGame(game, []);
  setKey(game, "ArrowRight", true);
  advance(game, 0.5);
  assert.ok(Math.abs(game.player.x - 520) < 1e-8);
  assert.equal(game.player.y, 300);
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
  startGame(game, [{ x: 795.5, y: 100, vx: 120, vy: 0 }]);
  advance(game, 0.005);
  assert.ok(Math.abs(game.bullets[0].x - 795.9) < 1e-8);
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
    { x: 100, y: 300, vx: 100, vy: 0 },
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
  advance(game, 2);
  assert.deepEqual(game.player, { x: 788, y: 300 });
  setKey(game, "ArrowUp", true);
  advance(game, 0.5);
  assert.equal(game.player.x, 788);
  assert.ok(Math.abs(game.player.y - 215.1471862576143) < 1e-8);
  advance(game, 2);
  assert.deepEqual(game.player, { x: 788, y: 12 });
  startGame(game, []);
  game.player = { x: 788, y: 12 };
  setKey(game, "ArrowRight", false);
  setKey(game, "ArrowUp", false);
  setKey(game, "ArrowLeft", true);
  setKey(game, "ArrowDown", true);
  advance(game, 4.6);
  assert.ok(Math.abs(game.player.x - 12) < 1e-8);
  assert.ok(Math.abs(game.player.y - 588) < 1e-8);
});

test("simultaneous hits freeze one result, include fatal bullets, and restart resets every state", () => {
  const game = createGame();
  startGame(game, undefined, () => 0.5);
  const original = structuredClone(game.bullets);
  assert.equal(original.length, 100);
  setKey(game, "ArrowRight", true);
  startGame(game, undefined, () => 0.5);
  assert.equal(game.keys.size, 0);
  advance(game, 4);
  assert.equal(game.phase, "over");
  assert.equal(game.bullets.length, 100);
  assert.ok(game.elapsed > 2 && game.elapsed < 3);
  const result = structuredClone(game);
  advance(game, 100);
  setKey(game, "ArrowLeft", true);
  assert.deepEqual(game, result);
  startGame(game, undefined, () => 0.5);
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

test("a new round spawns 100 circular bullets on all four walls aimed at the plane", () => {
  const game = createGame();
  let draw = 0;
  startGame(game, undefined, () => (++draw % 8) / 8);
  assert.equal(game.bullets.length, 100);
  const sides = new Set<string>();
  for (const bullet of game.bullets) {
    assert.ok(bullet.x >= 4 && bullet.x <= 796);
    assert.ok(bullet.y >= 4 && bullet.y <= 596);
    if (bullet.x === 4) sides.add("left");
    else if (bullet.x === 796) sides.add("right");
    else if (bullet.y === 4) sides.add("top");
    else if (bullet.y === 596) sides.add("bottom");
    else assert.fail("bullet must touch a wall");
    assert.ok(Math.abs(Math.hypot(bullet.vx, bullet.vy) - 120) < 1e-8);
    assert.ok(
      Math.abs((400 - bullet.x) * bullet.vy - (300 - bullet.y) * bullet.vx) <
        1e-7,
    );
  }
  assert.equal(sides.size, 4);
});

test("homing turns by at most 12 degrees per second without changing speed", () => {
  const game = createGame();
  startGame(game, [{ x: 100, y: 100, vx: 120, vy: 0 }]);
  advance(game, 1);
  const bullet = game.bullets[0];
  assert.ok(Math.abs(Math.atan2(bullet.vy, bullet.vx) - Math.PI / 15) < 1e-8);
  assert.ok(Math.abs(Math.hypot(bullet.vx, bullet.vy) - 120) < 1e-8);
});

test("scheduled volleys and speed increases match the specification and reset on restart", () => {
  const game = createGame();
  startGame(game);
  const milestones = new Map([
    [5, [140, 120]],
    [10, [180, 140]],
    [15, [220, 160]],
    [25, [300, 200]],
    [30, [300, 220]],
    [50, [300, 300]],
    [55, [300, 300]],
  ]);
  for (let second = 1; second <= 55; second++) {
    // Park the public fixture state between updates to observe long rounds without deaths.
    for (const bullet of game.bullets)
      Object.assign(bullet, { x: 4, y: 4, vx: 0, vy: 0 });
    advance(game, 1);
    assert.equal(game.phase, "playing");
    const expected = milestones.get(second);
    if (expected) {
      assert.equal(game.bullets.length, expected[0]);
      assert.equal(game.bulletSpeed, expected[1]);
      if (second >= 10)
        for (const bullet of game.bullets) {
          assert.ok(
            Math.abs(Math.hypot(bullet.vx, bullet.vy) - expected[1]) < 1e-8,
          );
        }
    }
  }
  startGame(game);
  assert.equal(game.elapsed, 0);
  assert.equal(game.bullets.length, 100);
  assert.equal(game.bulletSpeed, 120);
});

test("wall volleys keep an 80-unit gap from the full outline even beside walls and corners", () => {
  for (const player of [
    { x: 12, y: 300 },
    { x: 788, y: 300 },
    { x: 400, y: 12 },
    { x: 400, y: 588 },
    { x: 12, y: 12 },
  ]) {
    for (const sample of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const game = createGame();
      startGame(game, []);
      game.player = player;
      let draw = 0;
      advance(game, 5, () => (draw++ % 2 === 0 ? (draw % 8) / 8 : sample));
      assert.equal(game.bullets.length, 40);
      for (const bullet of game.bullets) {
        const relative = { x: bullet.x - player.x, y: bullet.y - player.y };
        const nearest = closestOutlinePoint(relative);
        assert.ok(
          Math.hypot(relative.x - nearest.x, relative.y - nearest.y) >=
            84 - 1e-7,
        );
      }
    }
  }
});

test("a corner reflection reverses both components and highest-speed sweeps still hit", () => {
  const game = createGame();
  startGame(game, [{ x: 795.5, y: 595.5, vx: 120, vy: 120 }]);
  advance(game, 0.005);
  assert.equal(game.bullets[0].vx, -120);
  assert.equal(game.bullets[0].vy, -120);
  startGame(game, [{ x: 400, y: 283, vx: 0, vy: 300 }]);
  advance(game, 0.1);
  assert.equal(game.phase, "over");
  assert.ok(Math.abs(game.elapsed - 1 / 300) < 1e-8);
});

test("one long update and different frame rates agree across multiple volleys and acceleration", () => {
  function run(frame: number) {
    const game = createGame();
    startGame(game, []);
    game.player = { x: 788, y: 588 };
    for (let time = 0; time < 12 - 1e-9; time += frame)
      advance(game, Math.min(frame, 12 - time), () => 0);
    return game;
  }
  const large = run(12);
  assert.equal(large.phase, "playing");
  assert.equal(large.bullets.length, 80);
  assert.equal(large.bulletSpeed, 140);
  for (const frame of [1 / 30, 1 / 144]) {
    const small = run(frame);
    assert.equal(small.bullets.length, large.bullets.length);
    assert.equal(small.bulletSpeed, 140);
    for (let i = 0; i < large.bullets.length; i++)
      for (const key of ["x", "y", "vx", "vy"] as const) {
        assert.ok(
          Math.abs(small.bullets[i][key] - large.bullets[i][key]) < 1e-7,
        );
      }
  }
});

test("reflection and homing agree across frame rates without escape or speed drift", () => {
  const large = createGame();
  const small = createGame();
  for (const game of [large, small]) {
    startGame(game, [{ x: 795, y: 100, vx: 300, vy: 0 }]);
    game.player = { x: 400, y: 580 };
  }
  advance(large, 4);
  for (let i = 0; i < 576; i++) advance(small, 1 / 144);
  assert.equal(large.phase, "playing");
  for (const game of [large, small]) {
    const b = game.bullets[0];
    assert.ok(b.x >= 4 && b.x <= 796 && b.y >= 4 && b.y <= 596);
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 300) < 1e-8);
  }
  for (const key of ["x", "y", "vx", "vy"] as const) {
    assert.ok(Math.abs(large.bullets[0][key] - small.bullets[0][key]) < 1e-7);
  }
});

test("volley size is capped and over-state updates never generate or accelerate", () => {
  const game = createGame();
  startGame(
    game,
    Array.from({ length: 290 }, () => ({ x: 4, y: 4, vx: 0, vy: 0 })),
  );
  advance(game, 5);
  assert.equal(game.bullets.length, 300);
  game.bullets[0] = { ...game.player, vx: 0, vy: 0 };
  advance(game, 1);
  assert.equal(game.phase, "over");
  const frozen = structuredClone(game);
  advance(game, 100);
  assert.deepEqual(game, frozen);
});
