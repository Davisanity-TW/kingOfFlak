import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginCountdown,
  pauseGame,
  resumeGame,
  createGame,
  startGame,
  setKey,
  advance,
} from "../src/game.ts";

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

test("the opening countdown shows a frozen starting volley before gameplay time begins", () => {
  const game = createGame();
  beginCountdown(game, () => 0.5);
  assert.equal(game.phase, "countdown");
  assert.equal(game.countdown, 3);
  assert.equal(game.elapsed, 0);
  assert.equal(game.bullets.length, 40);
  const positions = game.bullets.map(({ x, y }) => ({ x, y }));
  advance(game, 2.999);
  assert.equal(game.phase, "countdown");
  assert.equal(game.elapsed, 0);
  assert.deepEqual(
    game.bullets.map(({ x, y }) => ({ x, y })),
    positions,
  );
  advance(game, 0.002);
  assert.equal(game.phase, "playing");
  assert.ok(game.elapsed > 0);
  advance(game, 0.1);
  assert.equal(game.phase, "playing");
  assert.ok(game.elapsed > 0);
  assert.notDeepEqual(
    game.bullets.map(({ x, y }) => ({ x, y })),
    positions,
  );
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
  startGame(game, [{ x: 797.5, y: 100, vx: 120, vy: 0 }]);
  game.elapsed = 3;
  game.nextTick = 361;
  advance(game, 0.005);
  assert.ok(Math.abs(game.bullets[0].x - 797.9) < 1e-8);
  assert.equal(game.bullets[0].vx, -120);
});

test("bullets touch the visible body and wings, but transparent corners remain safe", () => {
  for (const position of [
    { x: 409, y: 304 },
    { x: 400, y: 310 },
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
  game.elapsed = 3;
  game.nextTick = 361;
  advance(game, 1);
  assert.equal(game.phase, "over");
  assert.ok(Math.abs(game.elapsed - 3.19) < 1e-8);
  assert.deepEqual(game.contact, { x: 400, y: 292 });
  assert.ok(Math.abs(game.bullets[1].x - 119) < 1e-8);
});

test("the full plane stays inside every wall and slides along a wall", () => {
  const game = createGame();
  startGame(game, []);
  setKey(game, "ArrowRight", true);
  advance(game, 2);
  assert.deepEqual(game.player, { x: 792, y: 300 });
  setKey(game, "ArrowUp", true);
  advance(game, 0.5);
  assert.equal(game.player.x, 792);
  assert.ok(Math.abs(game.player.y - 215.1471862576143) < 1e-8);
  advance(game, 2);
  assert.deepEqual(game.player, { x: 792, y: 8 });
  startGame(game, []);
  game.player = { x: 792, y: 8 };
  setKey(game, "ArrowRight", false);
  setKey(game, "ArrowUp", false);
  setKey(game, "ArrowLeft", true);
  setKey(game, "ArrowDown", true);
  advance(game, 4.7);
  assert.ok(Math.abs(game.player.x - 8) < 1e-8);
  assert.ok(Math.abs(game.player.y - 592) < 1e-8);
});

test("simultaneous hits freeze one result, include fatal bullets, and restart resets every state", () => {
  const game = createGame();
  startGame(game, undefined, () => 0.25);
  const original = structuredClone(game.bullets);
  assert.equal(original.length, 40);
  setKey(game, "ArrowRight", true);
  startGame(game, undefined, () => 0.25);
  game.bullets[0] = { x: 400, y: 282, vx: 0, vy: 120 };
  assert.equal(game.keys.size, 0);
  advance(game, 4);
  assert.equal(game.phase, "over");
  assert.equal(game.bullets.length, 40);
  assert.ok(game.elapsed > 0 && game.elapsed < 4);
  const result = structuredClone(game);
  advance(game, 100);
  setKey(game, "ArrowLeft", true);
  assert.deepEqual(game, result);
  startGame(game, undefined, () => 0.25);
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

test("a new round spawns bullets across the map outside the starting safety radius", () => {
  const game = createGame();
  const draws = [0.1, 0.1, 0.9, 0.1, 0.1, 0.9, 0.9, 0.9];
  let draw = 0;
  startGame(game, undefined, () => draws[draw++ % draws.length]);
  assert.equal(game.bullets.length, 40);
  const quadrants = new Set<string>();
  for (const bullet of game.bullets) {
    assert.ok(bullet.x >= 2 && bullet.x <= 798);
    assert.ok(bullet.y >= 2 && bullet.y <= 598);
    assert.ok(Math.hypot(bullet.x - 400, bullet.y - 300) >= 80 - 1e-7);
    quadrants.add(
      `${bullet.x < 400 ? "left" : "right"}-${bullet.y < 300 ? "top" : "bottom"}`,
    );
    assert.ok(Math.abs(Math.hypot(bullet.vx, bullet.vy) - 40) < 1e-8);
    assert.ok(
      Math.abs((400 - bullet.x) * bullet.vy - (300 - bullet.y) * bullet.vx) <
        1e-7,
    );
  }
  assert.equal(quadrants.size, 4);
});

test("homing turns by at most 12 degrees per second after five seconds", () => {
  const game = createGame();
  startGame(game, [{ x: 100, y: 100, vx: 60, vy: 0 }]);
  game.player = { x: 400, y: 300 };
  advance(game, 4.99);
  assert.equal(game.bullets[0].vx, 60);
  assert.equal(game.bullets[0].vy, 0);
  advance(game, 0.02);
  const bullet = game.bullets[0];
  const turned = Math.atan2(bullet.vy, bullet.vx);
  assert.ok(turned > 0 && turned <= ((12 * Math.PI) / 180 / 120) * 3 + 1e-8);
  assert.ok(Math.abs(Math.hypot(bullet.vx, bullet.vy) - 50) < 1e-8);
});

test("bullets start at speed 40 and accelerate to 50 at five seconds", () => {
  const game = createGame();
  startGame(game, [{ x: 100, y: 100, vx: 60, vy: 0 }]);
  advance(game, 4.99);
  assert.ok(Math.abs(game.bullets[0].x - 399.4) < 1e-8);
  assert.equal(game.bullets[0].vx, 60);
  advance(game, 0.02);
  assert.ok(Math.abs(game.bullets[0].x - 400.5) < 1e-4);
  assert.ok(
    Math.abs(Math.hypot(game.bullets[0].vx, game.bullets[0].vy) - 50) < 1e-8,
  );
  assert.ok(game.bullets[0].y > 100);
});

test("scheduled volleys and speed increases match the specification and reset on restart", () => {
  const game = createGame();
  startGame(game);
  const milestones = new Map([
    [5, [60, 50]],
    [10, [80, 60]],
    [15, [100, 70]],
    [25, [140, 90]],
    [30, [160, 100]],
    [50, [160, 140]],
    [60, [160, 160]],
    [65, [160, 170]],
  ]);
  for (let second = 1; second <= 65; second++) {
    // Park the public fixture state between updates to observe long rounds without deaths.
    for (const bullet of game.bullets)
      Object.assign(bullet, { x: 4, y: 4, vx: 0, vy: 0 });
    advance(game, 1);
    assert.equal(game.phase, "playing");
    const expected = milestones.get(second);
    if (expected) {
      assert.equal(game.bullets.length, expected[0]);
      assert.equal(game.bulletSpeed, expected[1]);
      if (second >= 5)
        for (const bullet of game.bullets) {
          assert.ok(
            Math.abs(Math.hypot(bullet.vx, bullet.vy) - expected[1]) < 1e-8,
          );
        }
    }
  }
  startGame(game);
  assert.equal(game.elapsed, 0);
  assert.equal(game.bullets.length, 40);
  assert.equal(game.bulletSpeed, 40);
});

test("later volleys spawn from an edge even after the plane moves", () => {
  const game = createGame();
  startGame(game, []);
  setKey(game, "ArrowRight", true);
  advance(game, 2);
  advance(game, 3, () => 0.375);
  assert.equal(game.bullets.length, 20);
  for (const bullet of game.bullets) {
    assert.ok(Math.abs(bullet.x - 798) < 1e-8);
    assert.ok(bullet.y >= 2 && bullet.y <= 598);
  }
});

test("later volleys choose random positions along all four map edges", () => {
  const game = createGame();
  startGame(game, []);
  const draws = [0.01, 0.5, 0.26, 0.25, 0.51, 0.5, 0.76, 0.75];
  let draw = 0;
  advance(game, 5, () => draws[draw++ % draws.length]);
  assert.equal(game.bullets.length, 20);
  const edges = new Set<string>();
  for (const bullet of game.bullets) {
    assert.ok(bullet.x >= 2 && bullet.x <= 798);
    assert.ok(bullet.y >= 2 && bullet.y <= 598);
    if (bullet.y === 2) edges.add("top");
    if (bullet.x === 798) edges.add("right");
    if (bullet.y === 598) edges.add("bottom");
    if (bullet.x === 2) edges.add("left");
  }
  assert.equal(edges.size, 4);
});

test("a corner reflection reverses both components and highest-speed sweeps still hit", () => {
  const game = createGame();
  startGame(game, [{ x: 797.5, y: 597.5, vx: 120, vy: 120 }]);
  game.elapsed = 3;
  game.nextTick = 361;
  advance(game, 0.005);
  assert.equal(game.bullets[0].vx, -120);
  assert.equal(game.bullets[0].vy, -120);
  startGame(game, [{ x: 400, y: 283, vx: 0, vy: 300 }]);
  game.elapsed = 3;
  game.nextTick = 361;
  advance(game, 0.1);
  assert.equal(game.phase, "over");
  assert.ok(Math.abs(game.elapsed - 3.0233333333333334) < 1e-8);
});

test("one long update and different frame rates agree across multiple volleys and acceleration", () => {
  function run(frame: number) {
    const game = createGame();
    startGame(game, []);
    game.player = { x: 792, y: 590 };
    for (let time = 0; time < 12 - 1e-9; time += frame)
      advance(game, Math.min(frame, 12 - time), () => 0);
    return game;
  }
  const large = run(12);
  assert.equal(large.phase, "playing");
  assert.equal(large.bullets.length, 40);
  assert.equal(large.bulletSpeed, 60);
  for (const frame of [1 / 30, 1 / 144]) {
    const small = run(frame);
    assert.equal(small.bullets.length, large.bullets.length);
    assert.equal(small.bulletSpeed, 60);
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
    assert.ok(b.x >= 2 && b.x <= 798 && b.y >= 2 && b.y <= 598);
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
    Array.from({ length: 150 }, () => ({ x: 4, y: 4, vx: 0, vy: 0 })),
  );
  advance(game, 5);
  assert.equal(game.bullets.length, 160);
  game.bullets[0] = { ...game.player, vx: 0, vy: 0 };
  advance(game, 1);
  assert.equal(game.phase, "over");
  const frozen = structuredClone(game);
  advance(game, 100);
  assert.deepEqual(game, frozen);
});

test("mobile and desktop schedules cap counts and speeds independently and preserve mode on restart", () => {
  for (const mobile of [false, true]) {
    const game = createGame(mobile);
    beginCountdown(game, () => 0);
    assert.equal(game.bullets.length, 40);
    assert.equal(game.bulletSpeed, 40);
    advance(game, 3);
    for (let second = 1; second <= 105; second++) {
      for (const bullet of game.bullets)
        Object.assign(bullet, { x: 2, y: 2, vx: 0, vy: 0 });
      advance(game, 1, () => 0);
      assert.equal(
        game.bullets.length,
        Math.min(160, 40 + Math.floor(second / 5) * (mobile ? 10 : 20)),
      );
      assert.equal(
        game.bulletSpeed,
        Math.min(240, 40 + Math.floor(second / 5) * 10),
      );
    }
    pauseGame(game);
    const full = structuredClone(game);
    advance(game, 600);
    assert.deepEqual(game, full);
    resumeGame(game);
    advance(game, 3);
    assert.equal(game.bullets.length, 160);
    assert.equal(game.bulletSpeed, 240);
    assert.equal(game.elapsed, 105);
    startGame(game);
    assert.equal(game.bullets.length, 40);
  }
});

test("joystick leaves the dead zone at keyboard speed and stops immediately at center", async () => {
  const { joystickAxis } = await import("../src/joystick.ts");
  const game = createGame(true);
  startGame(game, []);
  assert.deepEqual(joystickAxis(15, 0, 100), { x: 0, y: 0 });
  game.axis = joystickAxis(16, 0, 100);
  advance(game, 0.25);
  assert.equal(game.player.x, 460);
  game.axis = joystickAxis(100, 0, 100);
  advance(game, 0.25);
  assert.equal(game.player.x, 520);
  game.axis = joystickAxis(0, 0, 100);
  advance(game, 0.25);
  assert.equal(game.player.x, 520);
  assert.ok(
    Math.abs(Math.hypot(...Object.values(joystickAxis(30, 30, 100))) - 1) <
      1e-10,
  );
});

test("pausing freezes the full simulation and clears both input sources", () => {
  for (const mobile of [false, true]) {
    const game = createGame(mobile);
    beginCountdown(game, () => 0);
    advance(game, 3.5);
    setKey(game, "ArrowRight", true);
    game.axis = { x: 1, y: 1 };
    pauseGame(game);
    assert.equal(game.phase, "paused");
    assert.equal(game.keys.size, 0);
    assert.deepEqual(game.axis, { x: 0, y: 0 });
    const frozen = structuredClone(game);
    advance(game, 600);
    setKey(game, "ArrowRight", true);
    assert.deepEqual(game, frozen);
    resumeGame(game);
    const position = { ...game.player };
    const bullets = structuredClone(game.bullets);
    advance(game, 2.999);
    assert.equal(game.elapsed, frozen.elapsed);
    assert.deepEqual(game.bullets, bullets);
    pauseGame(game);
    resumeGame(game);
    assert.equal(game.countdown, 3);
    advance(game, 3);
    assert.equal(game.phase, "playing");
    assert.deepEqual(game.player, position);
    assert.equal(game.elapsed, frozen.elapsed);
    advance(game, 0.1);
    assert.deepEqual(game.player, position);
  }
});

test("pause and resume preserve scheduled boundaries exactly once in both modes", () => {
  for (const mobile of [false, true]) {
    const game = createGame(mobile);
    beginCountdown(game, () => 0);
    advance(game, 3);
    for (const boundary of [5, 10]) {
      for (const bullet of game.bullets)
        Object.assign(bullet, { x: 2, y: 2, vx: 0, vy: 0 });
      advance(game, boundary - game.elapsed - 0.01, () => 0);
      const count = game.bullets.length;
      const speed = game.bulletSpeed;
      pauseGame(game);
      advance(game, 60);
      resumeGame(game);
      advance(game, 3);
      assert.equal(game.bullets.length, count);
      assert.equal(game.bulletSpeed, speed);
      advance(game, 0.01, () => 0);
      assert.equal(game.bullets.length, count + (mobile ? 10 : 20));
      assert.equal(game.bulletSpeed, speed + 10);
      pauseGame(game);
      resumeGame(game);
      advance(game, 3);
      advance(game, 0.01, () => 0);
      assert.equal(game.bullets.length, count + (mobile ? 10 : 20));
      assert.equal(game.bulletSpeed, speed + 10);
    }
  }
});

test("invalid transitions cannot reset an active round or revive a finished round", () => {
  const game = createGame();
  const ready = structuredClone(game);
  pauseGame(game);
  resumeGame(game);
  assert.deepEqual(game, ready);
  beginCountdown(game, () => 0);
  advance(game, 1);
  const opening = structuredClone(game);
  beginCountdown(game);
  resumeGame(game);
  assert.deepEqual(game, opening);
  pauseGame(game);
  resumeGame(game);
  advance(game, 3);
  game.bullets[0] = { ...game.player, vx: 0, vy: 0 };
  advance(game, 0.1);
  assert.equal(game.phase, "over");
  const over = structuredClone(game);
  pauseGame(game);
  resumeGame(game);
  advance(game, 100);
  assert.deepEqual(game, over);
  beginCountdown(game, () => 0);
  assert.equal(game.phase, "countdown");
  assert.equal(game.countdown, 3);
  assert.equal(game.elapsed, 0);
  assert.equal(game.nextTick, 1);
  assert.equal(game.bulletSpeed, 40);
  assert.equal(game.bullets.length, 40);
  assert.equal(game.contact, null);
});
