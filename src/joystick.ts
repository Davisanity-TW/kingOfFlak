export function joystickAxis(dx: number, dy: number, radius: number) {
  const length = Math.hypot(dx, dy);
  if (length <= radius * 0.15) return { x: 0, y: 0 };
  const strength = Math.min(1, (length / radius - 0.15) / 0.85);
  return { x: (dx / length) * strength, y: (dy / length) * strength };
}
