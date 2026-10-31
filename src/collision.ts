import { PLANE } from "./game.ts";
import type { Point } from "./game.ts";

const EPSILON = 1e-9;

export function closestOutlinePoint(point: Point): Point {
  let nearest = PLANE[0];
  let distance = Infinity;
  for (let i = 0; i < PLANE.length; i++) {
    const a = PLANE[i];
    const b = PLANE[(i + 1) % PLANE.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy),
      ),
    );
    const candidate = { x: a.x + dx * t, y: a.y + dy * t };
    const squared = (point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2;
    if (squared < distance) {
      distance = squared;
      nearest = candidate;
    }
  }
  return nearest;
}

// Sweep against edge capsules so tangencies and fast crossings use the visible outline.
export function firstContact(
  start: Point,
  delta: Point,
  radius: number,
): number | null {
  const nearest = closestOutlinePoint(start);
  if (Math.hypot(start.x - nearest.x, start.y - nearest.y) <= radius + EPSILON)
    return 0;
  let inside = false;
  for (let i = 0, j = PLANE.length - 1; i < PLANE.length; j = i++) {
    const a = PLANE[i];
    const b = PLANE[j];
    if (
      a.y > start.y !== b.y > start.y &&
      start.x < ((b.x - a.x) * (start.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  if (inside) return 0;
  const speedSquared = delta.x ** 2 + delta.y ** 2;
  if (speedSquared === 0) return null;
  let earliest = Infinity;
  const consider = (t: number) => {
    if (t >= -EPSILON && t <= 1 + EPSILON)
      earliest = Math.min(earliest, Math.max(0, Math.min(1, t)));
  };
  for (let i = 0; i < PLANE.length; i++) {
    const a = PLANE[i];
    const b = PLANE[(i + 1) % PLANE.length];
    const ox = start.x - a.x;
    const oy = start.y - a.y;
    const projection = ox * delta.x + oy * delta.y;
    const discriminant =
      projection ** 2 - speedSquared * (ox ** 2 + oy ** 2 - radius ** 2);
    if (discriminant >= -EPSILON) {
      consider(
        (-projection - Math.sqrt(Math.max(0, discriminant))) / speedSquared,
      );
    }
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    const distance = (ox * -ey + oy * ex) / length;
    const velocity = (delta.x * -ey + delta.y * ex) / length;
    if (Math.abs(velocity) < EPSILON) continue;
    for (const side of [-radius, radius]) {
      const t = (side - distance) / velocity;
      const along =
        ((ox + delta.x * t) * ex + (oy + delta.y * t) * ey) / length ** 2;
      if (along >= 0 && along <= 1) consider(t);
    }
  }
  return Number.isFinite(earliest) ? earliest : null;
}
