import { test, expect } from "@playwright/test";
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 640, height: 360 },
});
test("mobile map and controls occupy separate areas and pointer release resets the stick", async ({
  page,
}) => {
  await page.goto("/");
  const control = page.locator("#joystick");
  await expect(control).toBeVisible();
  const map = (await page.locator("canvas").boundingBox())!;
  const box = (await control.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(map.x);
  expect(map.width / map.height).toBeCloseTo(4 / 3, 2);
  expect(map.y + map.height).toBeLessThanOrEqual(360);
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
