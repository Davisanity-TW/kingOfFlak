import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "king-of-flak.nickname",
      JSON.stringify({ version: 1, nickname: "Ace" }),
    );
  });
});
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 640, height: 360 },
});
test("mobile map and controls occupy separate areas and pointer release resets the stick", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const control = page.locator("#joystick");
  await expect(control).toBeVisible();
  const map = (await page.locator("canvas").boundingBox())!;
  const box = (await control.boundingBox())!;
  expect(map.x + map.width).toBeLessThanOrEqual(box.x);
  const status = (await page.locator(".telemetry").boundingBox())!;
  expect(status.x + status.width).toBeLessThanOrEqual(map.x);
  expect(box.x + box.width).toBeLessThanOrEqual(640);
  expect(map.width / map.height).toBeCloseTo(4 / 3, 2);
  expect(map.y + map.height).toBeLessThanOrEqual(360);
  await page.getByRole("button", { name: "開始飛行" }).click();
  await page.clock.runFor(3100);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 20, box.y + box.height / 2);
  await expect(control.locator("span")).not.toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await page.mouse.up();
  await expect(control.locator("span")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await page.screenshot({ path: "test-results/mobile-landscape.png" });
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator(".portrait-prompt")).toBeVisible();
});

test("rotation and touch pause release a held stick and require a fresh resume countdown", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await page.clock.runFor(3200);
  const stick = page.locator("#joystick");
  const box = (await stick.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(100);
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator("#phase-title")).toHaveText("已暫停");
  await expect(stick.locator("span")).toHaveAttribute(
    "style",
    "transform: translate(0px, 0px);",
  );
  await page.mouse.up();
  const elapsed = await page.locator("#survival-time").textContent();
  await page.clock.runFor(10000);
  await page.setViewportSize({ width: 640, height: 360 });
  await expect(page.locator("#phase-title")).toHaveText("已暫停");
  await page.getByRole("button", { name: "繼續飛行" }).click();
  await page.clock.runFor(1000);
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator("#phase-title")).toHaveText("已暫停");
  await page.setViewportSize({ width: 640, height: 360 });
  await page.getByRole("button", { name: "繼續飛行" }).click();
  await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  await page.clock.runFor(2000);
  await expect(page.locator("#survival-time")).toHaveText(elapsed!);
  await page.clock.runFor(1100);
  await page.getByRole("button", { name: "暫停飛行" }).click();
  await expect(page.locator("#phase-title")).toHaveText("已暫停");
  await page.screenshot({ path: "test-results/mobile-paused.png" });
  const resume = (await page.locator("#resume-button").boundingBox())!;
  const arena = (await page.locator(".arena").boundingBox())!;
  expect(resume.y + resume.height).toBeLessThanOrEqual(arena.y + arena.height);
});

test("touch controls can finish and restart a resumed round", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await page.clock.runFor(3100);
  await page.getByRole("button", { name: "暫停飛行" }).click();
  await page.getByRole("button", { name: "繼續飛行" }).click();
  await page.clock.runFor(3100);
  const box = (await page.locator("#joystick").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(100);
  await page.mouse.up();
  for (let i = 0; i < 240; i++) {
    await page.clock.runFor(500);
    if ((await page.locator("#phase-title").textContent()) === "飛行結束")
      break;
  }
  await expect(page.locator("#phase-title")).toHaveText("飛行結束");
  const result = await page.locator("#survival-time").textContent();
  await page.clock.runFor(10000);
  await expect(page.locator("#survival-time")).toHaveText(result!);
  await expect(page.locator("#resume-button")).toBeHidden();
  await page.getByRole("button", { name: "再飛一次" }).click();
  await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  await expect(page.locator("#survival-time")).toHaveText("0.0");
  await expect(page.locator("#bullet-count")).toHaveText("40");
});

test("fullscreen rejection and pointer cancellation preserve playable mobile controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    Element.prototype.requestFullscreen = async () => {
      throw new Error("Fullscreen unavailable");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await page.clock.runFor(3100);
  await expect(page.locator("#phase-title")).toHaveText("飛行中");
  const stick = page.locator("#joystick");
  await stick.evaluate((button) =>
    button.addEventListener(
      "pointerdown",
      (event) => {
        button.dataset.pointer = String((event as PointerEvent).pointerId);
      },
      { once: true },
    ),
  );
  const box = (await stick.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await expect(stick.locator("span")).not.toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await stick.evaluate((button) =>
    button.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: Number(button.dataset.pointer),
        bubbles: true,
      }),
    ),
  );
  await page.mouse.up();
  await expect(stick.locator("span")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  expect(errors).toEqual([]);
});

test("the idle joystick knob is visually centered", async ({ page }) => {
  await page.goto("/");
  const base = (await page.locator("#joystick").boundingBox())!;
  const knob = (await page.locator("#joystick span").boundingBox())!;
  expect(
    Math.abs(knob.x + knob.width / 2 - (base.x + base.width / 2)),
  ).toBeLessThan(1);
  expect(
    Math.abs(knob.y + knob.height / 2 - (base.y + base.height / 2)),
  ).toBeLessThan(1);
});

test("short drags move slowly, full drags reach full speed, and centering stops immediately", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await page.clock.runFor(3100);
  const planeX = () =>
    page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext("2d")!.getImageData(0, 0, 800, 600);
      let left = 800;
      let right = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 237 && data[i + 1] === 243 && data[i + 2] === 239) {
          const x = (i / 4) % 800;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      return (left + right) / 2;
    });
  const control = page.locator("#joystick");
  const box = (await control.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = box.width * 0.38;
  const start = await planeX();
  await page.mouse.move(cx + radius * 0.5, cy);
  await page.mouse.down();
  await page.clock.runFor(250);
  const slow = await planeX();
  expect(slow - start).toBeGreaterThan(20);
  expect(slow - start).toBeLessThan(30);
  await page.mouse.move(cx + radius, cy);
  await page.clock.runFor(250);
  const full = await planeX();
  expect(full - slow).toBeGreaterThan(55);
  expect(full - slow).toBeLessThan(65);
  await page.mouse.move(cx, cy);
  await page.clock.runFor(250);
  expect(Math.abs((await planeX()) - full)).toBeLessThanOrEqual(1);
  await page.mouse.up();
  await page.clock.runFor(250);
  expect(Math.abs((await planeX()) - full)).toBeLessThanOrEqual(1);
  const knob = (await control.locator("span").boundingBox())!;
  expect(Math.abs(knob.x + knob.width / 2 - cx)).toBeLessThan(1);
  expect(Math.abs(knob.y + knob.height / 2 - cy)).toBeLessThan(1);
  await page.screenshot({ path: "test-results/joystick-centered.png" });
});
