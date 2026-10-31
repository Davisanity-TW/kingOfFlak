import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function renderedPlane(page: Page) {
  return page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, 800, 600);
    const points = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 237 && data[i + 1] === 243 && data[i + 2] === 239) {
        points.push({ x: (i / 4) % 800, y: Math.floor(i / 4 / 800) });
      }
    }
    return {
      x:
        (Math.min(...points.map((p) => p.x)) +
          Math.max(...points.map((p) => p.x))) /
        2,
      y:
        (Math.min(...points.map((p) => p.y)) +
          Math.max(...points.map((p) => p.y))) /
        2,
    };
  });
}

test("keyboard starts a round, collision freezes the result and restart clears the round", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByText("工單 01・開發情境")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "開始飛行" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.clock.runFor(3000);
  await expect(page.getByRole("heading", { name: "飛行結束" })).toBeVisible();
  await expect(page.locator("#bullet-count")).toHaveText("6");
  await expect(page.locator("#survival-time")).toHaveText("2.3");
  await expect(page.getByRole("button", { name: "再飛一次" })).toBeFocused();
  const frozen = await page.locator("canvas").screenshot();
  await page.clock.runFor(3000);
  expect(await page.locator("canvas").screenshot()).toEqual(frozen);
  await expect(page.locator("#survival-time")).toHaveText("2.3");
  await page.screenshot({ path: "test-results/desktop-result.png" });
  await page.keyboard.press("Enter");
  await expect(page.locator("#survival-time")).toHaveText("0.0");
  await expect(page.locator("#bullet-count")).toHaveText("6");
  await expect(page.getByRole("heading", { name: "飛行中" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("arrow keys move the rendered plane, release stops it and the map stays proportional", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "開始飛行" }).click();
  const initial = await renderedPlane(page);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowUp");
  await page.clock.runFor(500);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowUp");
  const moved = await renderedPlane(page);
  expect(moved.x - initial.x).toBeGreaterThan(80);
  expect(moved.x - initial.x).toBeLessThan(90);
  expect(initial.y - moved.y).toBeGreaterThan(80);
  await page.clock.runFor(250);
  const stopped = await renderedPlane(page);
  expect(Math.abs(stopped.x - moved.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(stopped.y - moved.y)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/desktop-playing.png" });
  for (const width of [1440, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const map = await page.locator("canvas").boundingBox();
    expect(map!.width / map!.height).toBeCloseTo(4 / 3, 2);
    expect(map!.x).toBeGreaterThanOrEqual(0);
    expect(map!.x + map!.width).toBeLessThanOrEqual(width);
  }
});
