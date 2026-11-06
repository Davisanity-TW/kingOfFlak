import { closestOutlinePoint, firstContact } from "./collision.ts";

export type Point = { x: number; y: number };
export type Bullet = Point & { vx: number; vy: number };
export type Game = {
  mobile: boolean;
  phase: "ready" | "countdown" | "playing" | "paused" | "over";
  player: Point;
  startPosition: Point;
  bullets: Bullet[];
  keys: Set<string>;
  axis: Point;
  elapsed: number;
  nextTick: number;
  bulletSpeed: number;
  countdown: number;
  contact: Point | null;
};

export const WIDTH = 800;
export const HEIGHT = 600;
export const BULLET_RADIUS = 2;
export const PLANE_HALF_SIZE = 8;
const HOMING_START = 5;
const originalPlane: readonly Point[] = [
  { x: 0, y: -10 },
  { x: 3.33, y: -2.5 },
  { x: 10, y: 4.17 },
  { x: 10, y: 6.67 },
  { x: 2.5, y: 4.17 },
  { x: 2.5, y: 10 },
  { x: -2.5, y: 10 },
  { x: -2.5, y: 4.17 },
  { x: -10, y: 6.67 },
  { x: -10, y: 4.17 },
  { x: -3.33, y: -2.5 },
];

export const PLANE = originalPlane.map(({ x, y }) => ({
  x: x * 0.8,
  y: y * 0.8,
}));

export function createGame(mobile = false): Game {
  return {
    mobile,
    phase: "ready",
    player: { x: WIDTH / 2, y: HEIGHT / 2 },
    startPosition: { x: WIDTH / 2, y: HEIGHT / 2 },
    bullets: [],
    keys: new Set(),
    axis: { x: 0, y: 0 },
    elapsed: 0,
    nextTick: 1,
    bulletSpeed: 40,
    countdown: 0,
    contact: null,
  };
}

function spawnBullets(
  game: Game,
  count: number,
  random: () => number,
  fromEdges = false,
): void {
  if (game.bullets.length >= 160) return;
  for (let i = 0; i < count && game.bullets.length < 160; i++) {
    let x = 0;
    let y = 0;
    if (fromEdges) {
      const edge = Math.floor(random() * 4);
      const offset = random();
      switch (edge) {
        case 0:
          x = BULLET_RADIUS + offset * (WIDTH - 2 * BULLET_RADIUS);
          y = BULLET_RADIUS;
          break;
        case 1:
          x = WIDTH - BULLET_RADIUS;
          y = BULLET_RADIUS + offset * (HEIGHT - 2 * BULLET_RADIUS);
          break;
        case 2:
          x = BULLET_RADIUS + offset * (WIDTH - 2 * BULLET_RADIUS);
          y = HEIGHT - BULLET_RADIUS;
          break;
        default:
          x = BULLET_RADIUS;
          y = BULLET_RADIUS + offset * (HEIGHT - 2 * BULLET_RADIUS);
      }
    } else {
      for (let attempt = 0; attempt < 32; attempt++) {
        x = BULLET_RADIUS + random() * (WIDTH - 2 * BULLET_RADIUS);
        y = BULLET_RADIUS + random() * (HEIGHT - 2 * BULLET_RADIUS);
        if (
          Math.hypot(x - game.startPosition.x, y - game.startPosition.y) >= 80
        )
          break;
      }
      if (Math.hypot(x - game.startPosition.x, y - game.startPosition.y) < 80) {
        x = random() < 0.5 ? BULLET_RADIUS : WIDTH - BULLET_RADIUS;
        y = random() < 0.5 ? BULLET_RADIUS : HEIGHT - BULLET_RADIUS;
      }
    }
    const scale =
      game.bulletSpeed /
      Math.hypot(game.startPosition.x - x, game.startPosition.y - y);
    game.bullets.push({
      x,
      y,
      vx: (game.startPosition.x - x) * scale,
      vy: (game.startPosition.y - y) * scale,
    });
  }
}

export function startGame(
  game: Game,
  bullets?: Bullet[],
  random: () => number = Math.random,
): void {
  Object.assign(game, createGame(game.mobile), {
    phase: "playing",
    bullets: bullets?.map((bullet) => ({ ...bullet })) ?? [],
  });
  if (bullets === undefined) spawnBullets(game, 40, random);
}

export function beginCountdown(
  game: Game,
  random: () => number = Math.random,
): void {
  if (game.phase !== "ready" && game.phase !== "over") return;
  Object.assign(game, createGame(game.mobile), {
    phase: "countdown",
    countdown: 3,
  });
  spawnBullets(game, 40, random);
}

export function pauseGame(game: Game): void {
  if (game.phase !== "playing" && game.phase !== "countdown") return;
  game.phase = "paused";
  game.countdown = 0;
  game.keys.clear();
  game.axis = { x: 0, y: 0 };
}

export function resumeGame(game: Game): void {
  if (game.phase !== "paused") return;
  game.keys.clear();
  game.axis = { x: 0, y: 0 };
  game.countdown = 3;
  game.phase = "countdown";
}

export function setKey(game: Game, key: string, pressed: boolean): void {
  if (game.phase !== "playing") return;
  if (pressed) game.keys.add(key);
  else game.keys.delete(key);
}

export function advance(
  game: Game,
  seconds: number,
  random: () => number = Math.random,
): void {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("Elapsed time must be finite and nonnegative");
  }
  if (game.phase === "countdown") {
    if (seconds < game.countdown - 1e-10) {
      game.countdown -= seconds;
      return;
    }
    seconds = Math.max(0, seconds - game.countdown);
    game.countdown = 0;
    game.phase = "playing";
  }
  if (game.phase !== "playing") return;
  const keyX =
    Number(game.keys.has("ArrowRight")) - Number(game.keys.has("ArrowLeft"));
  const keyY =
    Number(game.keys.has("ArrowDown")) - Number(game.keys.has("ArrowUp"));
  const x = keyX || game.axis.x;
  const y = keyY || game.axis.y;
  const scale = 240 / Math.max(1, Math.hypot(x, y));
  let remaining = seconds;
  while (remaining > 0 && game.phase === "playing") {
    const vx = blocked(
      game.player.x,
      x * scale,
      PLANE_HALF_SIZE,
      WIDTH - PLANE_HALF_SIZE,
    )
      ? 0
      : x * scale;
    const vy = blocked(
      game.player.y,
      y * scale,
      PLANE_HALF_SIZE,
      HEIGHT - PLANE_HALF_SIZE,
    )
      ? 0
      : y * scale;
    let step = Math.min(
      remaining,
      game.nextTick / 120 - game.elapsed,
      wallTime(game.player.x, vx, PLANE_HALF_SIZE, WIDTH - PLANE_HALF_SIZE),
      wallTime(game.player.y, vy, PLANE_HALF_SIZE, HEIGHT - PLANE_HALF_SIZE),
    );
    for (const bullet of game.bullets) {
      reflect(bullet);
      step = Math.min(
        step,
        wallTime(bullet.x, bullet.vx, BULLET_RADIUS, WIDTH - BULLET_RADIUS),
        wallTime(bullet.y, bullet.vy, BULLET_RADIUS, HEIGHT - BULLET_RADIUS),
      );
    }
    moveSegment(game, step, vx * step, vy * step);
    remaining -= step;
    for (const bullet of game.bullets) reflect(bullet);
    if (
      game.phase === "playing" &&
      game.elapsed >= game.nextTick / 120 - 1e-10
    ) {
      game.elapsed = game.nextTick / 120;
      if (game.elapsed >= HOMING_START) steer(game);
      if (game.nextTick % 600 === 0) {
        if (game.nextTick >= 600) {
          game.bulletSpeed = Math.min(240, game.bulletSpeed + 10);
          for (const bullet of game.bullets) {
            const angle = Math.atan2(bullet.vy, bullet.vx);
            bullet.vx = Math.cos(angle) * game.bulletSpeed;
            bullet.vy = Math.sin(angle) * game.bulletSpeed;
          }
        }
        spawnBullets(game, game.mobile ? 10 : 20, random, true);
      }
      game.nextTick++;
    }
  }
}

// Steering follows simulation time, independently of rendering or wall-event splits.
function steer(game: Game): void {
  const limit = (12 * Math.PI) / 180 / 120;
  for (const bullet of game.bullets) {
    const speed = Math.hypot(bullet.vx, bullet.vy);
    if (speed === 0) continue;
    const angle = Math.atan2(bullet.vy, bullet.vx);
    const target = Math.atan2(
      game.player.y - bullet.y,
      game.player.x - bullet.x,
    );
    const difference = Math.atan2(
      Math.sin(target - angle),
      Math.cos(target - angle),
    );
    const heading = angle + Math.max(-limit, Math.min(limit, difference));
    bullet.vx = Math.cos(heading) * speed;
    bullet.vy = Math.sin(heading) * speed;
  }
}

function reflect(bullet: Bullet): void {
  if (blocked(bullet.x, bullet.vx, BULLET_RADIUS, WIDTH - BULLET_RADIUS))
    bullet.vx *= -1;
  if (blocked(bullet.y, bullet.vy, BULLET_RADIUS, HEIGHT - BULLET_RADIUS))
    bullet.vy *= -1;
}

function blocked(
  position: number,
  speed: number,
  min: number,
  max: number,
): boolean {
  return (
    (position <= min + 1e-9 && speed < 0) ||
    (position >= max - 1e-9 && speed > 0)
  );
}

function wallTime(
  position: number,
  speed: number,
  min: number,
  max: number,
): number {
  if (speed === 0) return Infinity;
  return ((speed > 0 ? max : min) - position) / speed;
}

// Split at wall events so relative sweeps follow both objects' actual piecewise paths.
function moveSegment(
  game: Game,
  seconds: number,
  dx: number,
  dy: number,
): void {
  let fraction = 1;
  let fatal: Bullet | undefined;
  for (const bullet of game.bullets) {
    const contact = firstContact(
      { x: bullet.x - game.player.x, y: bullet.y - game.player.y },
      {
        x: bullet.vx * seconds - dx,
        y: bullet.vy * seconds - dy,
      },
      BULLET_RADIUS,
    );
    if (contact !== null && contact <= fraction) {
      fraction = contact;
      fatal = bullet;
    }
  }
  game.player.x = Math.max(
    PLANE_HALF_SIZE,
    Math.min(WIDTH - PLANE_HALF_SIZE, game.player.x + dx * fraction),
  );
  game.player.y = Math.max(
    PLANE_HALF_SIZE,
    Math.min(HEIGHT - PLANE_HALF_SIZE, game.player.y + dy * fraction),
  );
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * seconds * fraction;
    bullet.y += bullet.vy * seconds * fraction;
  }
  game.elapsed += seconds * fraction;
  if (fatal) {
    const contact = closestOutlinePoint({
      x: fatal.x - game.player.x,
      y: fatal.y - game.player.y,
    });
    game.contact = {
      x: game.player.x + contact.x,
      y: game.player.y + contact.y,
    };
    game.phase = "over";
    game.keys.clear();
  }
}
