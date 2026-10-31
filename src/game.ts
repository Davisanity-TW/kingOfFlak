import { closestOutlinePoint, firstContact } from "./collision.ts";

export type Point = { x: number; y: number };
export type Bullet = Point & { vx: number; vy: number };
export type Game = {
  phase: "ready" | "playing" | "over";
  player: Point;
  bullets: Bullet[];
  keys: Set<string>;
  elapsed: number;
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
    contact: null,
  };
}

// shortcut: six deterministic non-homing bullets; replace the scenario in ticket 02.
function developmentBullets(): Bullet[] {
  return [
    { x: 400, y: 4 },
    { x: 796, y: 300 },
    { x: 400, y: 596 },
    { x: 4, y: 300 },
    { x: 200, y: 4 },
    { x: 600, y: 596 },
  ].map((point) => {
    const dx = WIDTH / 2 - point.x;
    const dy = HEIGHT / 2 - point.y;
    const scale = 120 / Math.hypot(dx, dy);
    return { ...point, vx: dx * scale, vy: dy * scale };
  });
}

export function startGame(
  game: Game,
  bullets: Bullet[] = developmentBullets(),
): void {
  Object.assign(game, createGame(), {
    phase: "playing",
    bullets: bullets.map((bullet) => ({ ...bullet })),
  });
}

export function setKey(game: Game, key: string, pressed: boolean): void {
  if (game.phase !== "playing") return;
  if (pressed) game.keys.add(key);
  else game.keys.delete(key);
}

export function advance(game: Game, seconds: number): void {
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
      wallTime(game.player.x, vx, 12, WIDTH - 12),
      wallTime(game.player.y, vy, 12, HEIGHT - 12),
    );
    for (const bullet of game.bullets) {
      if (blocked(bullet.x, bullet.vx, BULLET_RADIUS, WIDTH - BULLET_RADIUS))
        bullet.vx *= -1;
      if (blocked(bullet.y, bullet.vy, BULLET_RADIUS, HEIGHT - BULLET_RADIUS))
        bullet.vy *= -1;
      step = Math.min(
        step,
        wallTime(bullet.x, bullet.vx, BULLET_RADIUS, WIDTH - BULLET_RADIUS),
        wallTime(bullet.y, bullet.vy, BULLET_RADIUS, HEIGHT - BULLET_RADIUS),
      );
    }
    moveSegment(game, step, vx * step, vy * step);
    remaining -= step;
  }
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
