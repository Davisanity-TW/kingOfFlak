import "./style.css";
import { toScoreTenths } from "./leaderboard.ts";
import { resultBoard } from "./result-board.ts";
import { joystickAxis } from "./joystick.ts";
import {
  createRoundIdentity,
  NICKNAME_STORAGE_KEY,
  readSavedNickname,
} from "./nickname.ts";
import {
  advance,
  beginCountdown,
  BULLET_RADIUS,
  createGame,
  HEIGHT,
  PLANE,
  pauseGame,
  resumeGame,
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
const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button")!;
const resumeButton =
  document.querySelector<HTMLButtonElement>("#resume-button")!;
const pauseOverlay = document.querySelector<HTMLElement>("#pause-overlay")!;
const portrait = matchMedia("(pointer: coarse) and (orientation: portrait)");
const game = createGame(matchMedia("(pointer: coarse)").matches);
const nicknameInput = document.querySelector<HTMLInputElement>("#nickname")!;
const nicknameError = document.querySelector<HTMLElement>("#nickname-error")!;
const nicknamePreview =
  document.querySelector<HTMLElement>("#nickname-preview")!;
const storageNote = document.querySelector<HTMLElement>("#storage-note")!;
const roundPilot = document.querySelector<HTMLElement>("#round-pilot")!;
const editButton = document.querySelector<HTMLButtonElement>("#edit-nickname")!;
const cancelEdit = document.querySelector<HTMLButtonElement>("#cancel-edit")!;
let roundId = "";
const leaderboardUrl = import.meta.env.VITE_LEADERBOARD_URL as
  string | undefined;
const board = resultBoard(leaderboardUrl);
let roundIdentity: ReturnType<typeof createRoundIdentity> = null;
try {
  nicknameInput.value = readSavedNickname(
    localStorage.getItem(NICKNAME_STORAGE_KEY),
  );
} catch {
  storageNote.textContent = "無法記住暱稱，仍可正常遊玩。";
  storageNote.hidden = false;
}
function previewNickname(): void {
  const identity = createRoundIdentity(nicknameInput.value, game.mobile);
  nicknamePreview.textContent = `顯示名稱：${identity?.displayName ?? "尚未輸入有效暱稱"}`;
  nicknameError.hidden = true;
  nicknameInput.removeAttribute("aria-invalid");
}
nicknameInput.addEventListener("input", previewNickname);
previewNickname();
function fitEntry(): void {
  startOverlay.style.setProperty(
    "--entry-height",
    `${visualViewport?.height ?? innerHeight}px`,
  );
}
nicknameInput.addEventListener("focus", () => {
  startOverlay.classList.add("editing-name");
  fitEntry();
});
visualViewport?.addEventListener("resize", fitEntry);
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
  time.textContent = (toScoreTenths(game.elapsed) / 10).toFixed(1);
  count.textContent = String(game.bullets.length);
  pauseOverlay.hidden = game.phase !== "paused";
  pauseButton.hidden = game.phase !== "playing" && game.phase !== "countdown";
}

function tick(now: number): void {
  frame = undefined;
  if (!["playing", "countdown"].includes(game.phase)) return;
  advance(game, Math.max(0, now - lastTime) / 1000);
  lastTime = Math.max(lastTime, now);
  draw();
  if (game.phase === "over") {
    if (roundIdentity) {
      const score = Object.freeze({
        roundId,
        nickname: roundIdentity.nickname,
        mode: roundIdentity.mobile ? ("mb" as const) : ("pc" as const),
        scoreTenths: toScoreTenths(game.elapsed),
      });
      board.finish(score);
    }
    resetStick();
    phaseTitle.textContent = "飛行結束";
    note.textContent = "圓圈標示致命接觸位置。準備好再挑戰了嗎？";
    restartButton.hidden = false;
    editButton.hidden = false;
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
  if (
    portrait.matches ||
    document.hidden ||
    (game.phase !== "ready" && game.phase !== "over")
  )
    return;
  const identity = createRoundIdentity(nicknameInput.value, game.mobile);
  if (!identity) {
    startOverlay.hidden = false;
    nicknameError.textContent =
      "請輸入 1–12 個字，只能使用漢字、英文字、數字或底線。";
    nicknameError.hidden = false;
    nicknameInput.setAttribute("aria-invalid", "true");
    nicknameInput.focus({ preventScroll: true });
    return;
  }
  board.clear();
  roundIdentity = identity;
  roundId = crypto.randomUUID();
  nicknameInput.value = identity.nickname;
  try {
    localStorage.setItem(
      NICKNAME_STORAGE_KEY,
      JSON.stringify({ version: 1, nickname: identity.nickname }),
    );
    storageNote.hidden = true;
  } catch {
    storageNote.textContent = "無法記住暱稱，仍可正常遊玩。";
    storageNote.hidden = false;
  }
  roundPilot.textContent = roundIdentity.displayName;
  roundPilot.hidden = false;
  resetStick();
  if (frame !== undefined) cancelAnimationFrame(frame);
  beginCountdown(game);
  startOverlay.hidden = true;
  startOverlay.classList.remove("editing-name");
  restartButton.hidden = true;
  editButton.hidden = true;
  phaseTitle.textContent = "倒數 3";
  note.textContent = "倒數結束後開始閃避。";
  canvas.focus({ preventScroll: true });
  lastTime = performance.now();
  draw();
  frame = requestAnimationFrame(tick);
  if (game.mobile)
    document.documentElement.requestFullscreen?.().catch(() => {});
}

function pause(): void {
  if (game.phase !== "playing" && game.phase !== "countdown") return;
  pauseGame(game);
  resetStick();
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = undefined;
  phaseTitle.textContent = "已暫停";
  note.textContent = "飛行已凍結，按繼續後倒數 3 秒恢復。";
  draw();
  if (!document.hidden && !portrait.matches)
    resumeButton.focus({ preventScroll: true });
}

resumeButton.addEventListener("click", () => {
  if (game.phase !== "paused" || portrait.matches || document.hidden) return;
  resetStick();
  resumeGame(game);
  phaseTitle.textContent = "倒數 3";
  note.textContent = "倒數結束後繼續閃避。";
  canvas.focus({ preventScroll: true });
  lastTime = performance.now();
  draw();
  frame = requestAnimationFrame(tick);
});
pauseButton.addEventListener("click", pause);
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
portrait.addEventListener("change", () => {
  if (portrait.matches) pause();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.repeat) pause();
});

document
  .querySelector<HTMLFormElement>("#pilot-form")!
  .addEventListener("submit", (event) => {
    event.preventDefault();
    begin();
  });
restartButton.addEventListener("click", begin);
editButton.addEventListener("click", () => {
  if (game.phase !== "over") return;
  board.clear();
  startOverlay.hidden = false;
  startButton.textContent = "確認並起飛";
  cancelEdit.hidden = false;
  previewNickname();
  nicknameInput.focus({ preventScroll: true });
});
cancelEdit.addEventListener("click", () => {
  if (game.phase !== "over" || !roundIdentity) return;
  nicknameInput.value = roundIdentity.nickname;
  previewNickname();
  startOverlay.hidden = true;
  startOverlay.classList.remove("editing-name");
  restartButton.focus({ preventScroll: true });
});
for (const eventType of ["keydown", "keyup"] as const) {
  window.addEventListener(eventType, (event) => {
    if (event.target instanceof HTMLInputElement) return;
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
  game.axis = joystickAxis(dx, dy, radius);
  stick.style.transform = `translate(${length ? (dx / length) * radius * distance : 0}px, ${length ? (dy / length) * radius * distance : 0}px)`;
}
joystick.addEventListener("pointerdown", (event) => {
  if (activePointer !== undefined || !event.isPrimary) return;
  event.preventDefault();
  if (game.phase === "ready") begin();
  if (game.phase !== "playing") return;
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
if (!matchMedia("(pointer: coarse)").matches)
  document.querySelector(".mobile-controls")?.remove();
