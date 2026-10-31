import "./style.css";
import {
  advance,
  BULLET_RADIUS,
  createGame,
  HEIGHT,
  PLANE,
  setKey,
  startGame,
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
const game = createGame();
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
  time.textContent = game.elapsed.toFixed(1);
  count.textContent = String(game.bullets.length);
}

function tick(now: number): void {
  advance(game, (now - lastTime) / 1000);
  lastTime = now;
  draw();
  if (game.phase === "over") {
    phaseTitle.textContent = "飛行結束";
    note.textContent = "圓圈標示致命接觸位置。準備好再挑戰了嗎？";
    restartButton.hidden = false;
    restartButton.focus({ preventScroll: true });
    frame = undefined;
  } else {
    frame = requestAnimationFrame(tick);
  }
}

function begin(): void {
  if (frame !== undefined) cancelAnimationFrame(frame);
  startGame(game);
  startOverlay.hidden = true;
  restartButton.hidden = true;
  phaseTitle.textContent = "飛行中";
  note.textContent = "保持移動，留意四周的彈道。";
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
