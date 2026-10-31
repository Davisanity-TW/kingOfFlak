export function joystickAxis(dx: number, dy: number, radius: number) {
  const length = Math.hypot(dx, dy);
  if (length <= radius * 0.15) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}
