import { closestOutlinePoint, firstContact } from "./collision.ts";

export type Point = { x: number; y: number };
export type Bullet = Point & { vx: number; vy: number };
export type Game = {
  phase: "ready" | "playing" | "over";
  player: Point;
  bullets: Bullet[];
  keys: Set<string>;
  elapsed: number;
  nextTick: number;
  bulletSpeed: number;
  contact: Point | null;
};

export const WIDTH = 800;
export const HEIGHT = 600;
export const BULLET_RADIUS = 4;
export const PLANE: readonly Point[] = [
  { x: 0, y: -12 },
  { x: 4, y: -3 },
  { x: 12, y: 5 },
  { x: 12, y: 8 },
  { x: 3, y: 5 },
  { x: 3, y: 12 },
  { x: -3, y: 12 },
  { x: -3, y: 5 },
  { x: -12, y: 8 },
  { x: -12, y: 5 },
  { x: -4, y: -3 },
];

export function createGame(): Game {
  return {
    phase: "ready",
    player: { x: WIDTH / 2, y: HEIGHT / 2 },
    bullets: [],
    keys: new Set(),
    elapsed: 0,
    nextTick: 1,
    bulletSpeed: 120,
    contact: null,
  };
}

function spawnBullets(game: Game, count: number, random: () => number): void {
  if (game.bullets.length >= 300) return;
  const min = BULLET_RADIUS;
  const right = WIDTH - BULLET_RADIUS;
  const bottom = HEIGHT - BULLET_RADIUS;
  const edges = [
    { x: min, y: min, dx: right - min, dy: 0 },
    { x: right, y: min, dx: 0, dy: bottom - min },
    { x: min, y: bottom, dx: right - min, dy: 0 },
    { x: min, y: min, dx: 0, dy: bottom - min },
  ]
    .map((edge) => {
      const start = { x: edge.x - game.player.x, y: edge.y - game.player.y };
      const delta = { x: edge.dx, y: edge.dy };
      const entry = firstContact(start, delta, 80 + BULLET_RADIUS);
      const ranges: [number, number][] = [];
      if (entry === null) ranges.push([0, 1]);
      else {
        const reverse = firstContact(
          { x: start.x + edge.dx, y: start.y + edge.dy },
          { x: -edge.dx, y: -edge.dy },
          80 + BULLET_RADIUS,
        )!;
        // The 84-unit safety expansion connects the outline's edge capsules.
        if (entry > 0) ranges.push([0, entry]);
        if (reverse > 0) ranges.push([1 - reverse, 1]);
      }
      return {
        ...edge,
        ranges,
        length: ranges.reduce((sum, [a, b]) => sum + b - a, 0),
      };
    })
    .filter((edge) => edge.length > 0);
  if (edges.length === 0) return;
  for (let i = 0; i < count && game.bullets.length < 300; i++) {
    const edge = edges[Math.floor(random() * edges.length)];
    let offset = random() * edge.length;
    let fraction = 0;
    for (const [a, b] of edge.ranges) {
      if (offset <= b - a) {
        fraction = a + offset;
        break;
      }
      offset -= b - a;
    }
    const x = edge.x + edge.dx * fraction;
    const y = edge.y + edge.dy * fraction;
    const scale =
      game.bulletSpeed / Math.hypot(game.player.x - x, game.player.y - y);
    game.bullets.push({
      x,
      y,
      vx: (game.player.x - x) * scale,
      vy: (game.player.y - y) * scale,
    });
  }
}

export function startGame(
  game: Game,
  bullets?: Bullet[],
  random: () => number = Math.random,
): void {
  Object.assign(game, createGame(), {
    phase: "playing",
    bullets: bullets?.map((bullet) => ({ ...bullet })) ?? [],
  });
  if (bullets === undefined) spawnBullets(game, 100, random);
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
  if (game.phase !== "playing") return;
  const x =
    Number(game.keys.has("ArrowRight")) - Number(game.keys.has("ArrowLeft"));
  const y =
    Number(game.keys.has("ArrowDown")) - Number(game.keys.has("ArrowUp"));
  const scale = 240 / (Math.hypot(x, y) || 1);
  let remaining = seconds;
  while (remaining > 0 && game.phase === "playing") {
    const vx = blocked(game.player.x, x * scale, 12, WIDTH - 12)
      ? 0
      : x * scale;
    const vy = blocked(game.player.y, y * scale, 12, HEIGHT - 12)
      ? 0
      : y * scale;
    let step = Math.min(
      remaining,
      game.nextTick / 120 - game.elapsed,
      wallTime(game.player.x, vx, 12, WIDTH - 12),
      wallTime(game.player.y, vy, 12, HEIGHT - 12),
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
    for (const bullet of game.bullets) {
      reflect(bullet);
    }
    if (
      game.phase === "playing" &&
      game.elapsed >= game.nextTick / 120 - 1e-10
    ) {
      game.elapsed = game.nextTick / 120;
      steer(game);
      if (game.nextTick % 600 === 0) {
        if (game.nextTick >= 1200) {
          game.bulletSpeed = Math.min(300, game.bulletSpeed + 20);
          for (const bullet of game.bullets) {
            const angle = Math.atan2(bullet.vy, bullet.vx);
            bullet.vx = Math.cos(angle) * game.bulletSpeed;
            bullet.vy = Math.sin(angle) * game.bulletSpeed;
          }
        }
        spawnBullets(game, 40, random);
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
      { x: bullet.vx * seconds - dx, y: bullet.vy * seconds - dy },
      BULLET_RADIUS,
    );
    if (contact !== null && contact <= fraction) {
      fraction = contact;
      fatal = bullet;
    }
  }
  game.player.x = Math.max(
    12,
    Math.min(WIDTH - 12, game.player.x + dx * fraction),
  );
  game.player.y = Math.max(
    12,
    Math.min(HEIGHT - 12, game.player.y + dy * fraction),
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
