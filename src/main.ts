import "./style.css";
import {
  advance,
  beginCountdown,
  BULLET_RADIUS,
  createGame,
  HEIGHT,
  PLANE,
  setKey,
  WIDTH,
} from "./game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D is unavailable");
const ctx = context;
const startOverlay = document.querySelector<HTMLElement>("#start-overlay")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;
const restartButton =
  document.querySelector<HTMLButtonElement>("#restart-button")!;
const phaseTitle = document.querySelector<HTMLElement>("#phase-title")!;
const time = document.querySelector<HTMLElement>("#survival-time")!;
const count = document.querySelector<HTMLElement>("#bullet-count")!;
const note = document.querySelector<HTMLElement>("#flight-note")!;
const game = createGame(matchMedia("(pointer: coarse)").matches);
let lastTime = performance.now();
let frame: number | undefined;

function draw(): void {
  ctx.fillStyle = "#111e1b";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "#1c2b26";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < WIDTH; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
  }
  for (let y = 40; y < HEIGHT; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "#293b32";
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2, 80, 0, Math.PI * 2);
  ctx.moveTo(380, 300);
  ctx.lineTo(420, 300);
  ctx.moveTo(400, 280);
  ctx.lineTo(400, 320);
  ctx.stroke();
  ctx.fillStyle = "#edf3ef";
  ctx.beginPath();
  PLANE.forEach((point, index) => {
    if (index === 0)
      ctx.moveTo(game.player.x + point.x, game.player.y + point.y);
    else ctx.lineTo(game.player.x + point.x, game.player.y + point.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff995f";
  for (const bullet of game.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.contact) {
    const { x, y } = game.contact;
    ctx.strokeStyle = "#ffccad";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
  }
  if (game.phase === "countdown") {
    ctx.fillStyle = "#edf3ef";
    ctx.font = "700 112px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.ceil(game.countdown)), WIDTH / 2, HEIGHT / 2);
  }
  time.textContent = game.elapsed.toFixed(1);
  count.textContent = String(game.bullets.length);
}

function tick(now: number): void {
  advance(game, Math.max(0, now - lastTime) / 1000);
  lastTime = Math.max(lastTime, now);
  draw();
  if (game.phase === "over") {
    phaseTitle.textContent = "飛行結束";
    note.textContent = "圓圈標示致命接觸位置。準備好再挑戰了嗎？";
    restartButton.hidden = false;
    restartButton.focus({ preventScroll: true });
    frame = undefined;
  } else if (game.phase === "countdown") {
    phaseTitle.textContent = `倒數 ${Math.ceil(game.countdown)}`;
    note.textContent = "倒數結束後開始閃避。";
    frame = requestAnimationFrame(tick);
  } else {
    phaseTitle.textContent = "飛行中";
    note.textContent = "保持移動，留意四周的彈道。";
    frame = requestAnimationFrame(tick);
  }
}

function begin(): void {
  if (matchMedia("(pointer: coarse) and (orientation: portrait)").matches)
    return;
  resetStick();
  if (frame !== undefined) cancelAnimationFrame(frame);
  beginCountdown(game);
  startOverlay.hidden = true;
  restartButton.hidden = true;
  phaseTitle.textContent = "倒數 3";
  note.textContent = "倒數結束後開始閃避。";
  canvas.focus({ preventScroll: true });
  lastTime = performance.now();
  draw();
  frame = requestAnimationFrame(tick);
}

startButton.addEventListener("click", begin);
restartButton.addEventListener("click", begin);
for (const eventType of ["keydown", "keyup"] as const) {
  window.addEventListener(eventType, (event) => {
    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    if (game.phase === "playing") event.preventDefault();
    setKey(game, event.key, eventType === "keydown");
  });
}
window.addEventListener("blur", () => game.keys.clear());
draw();

const joystick = document.querySelector<HTMLButtonElement>("#joystick")!;
const stick = joystick.querySelector<HTMLElement>("span")!;
let activePointer: number | undefined;
function resetStick(): void {
  if (activePointer !== undefined && joystick.hasPointerCapture(activePointer))
    joystick.releasePointerCapture(activePointer);
  activePointer = undefined;
  game.axis = { x: 0, y: 0 };
  stick.style.transform = "translate(0, 0)";
}
function updateStick(event: PointerEvent): void {
  const rect = joystick.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2;
  const dy = event.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(dx, dy);
  const radius = rect.width * 0.38;
  const distance = Math.min(1, length / radius);
  const strength = distance <= 0.15 ? 0 : (distance - 0.15) / 0.85;
  game.axis =
    length && strength
      ? { x: (dx / length) * strength, y: (dy / length) * strength }
      : { x: 0, y: 0 };
  stick.style.transform = `translate(${length ? (dx / length) * radius * distance : 0}px, ${length ? (dy / length) * radius * distance : 0}px)`;
}
joystick.addEventListener("pointerdown", (event) => {
  if (activePointer !== undefined || !event.isPrimary) return;
  event.preventDefault();
  if (game.phase === "ready") begin();
  activePointer = event.pointerId;
  joystick.setPointerCapture(activePointer);
  updateStick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId === activePointer) updateStick(event);
});
for (const name of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const)
  joystick.addEventListener(name, (event) => {
    if (event.pointerId === activePointer) resetStick();
  });
window.addEventListener("blur", resetStick);
for (const button of [startButton, restartButton])
  button.addEventListener("click", () => {
    if (matchMedia("(pointer: coarse) and (orientation: landscape)").matches)
      document.documentElement.requestFullscreen?.().catch(() => {});
  });
if (!matchMedia("(pointer: coarse)").matches)
  document.querySelector(".mobile-controls")?.remove();
