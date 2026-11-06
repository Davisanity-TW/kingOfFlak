import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { NICKNAME_STORAGE_KEY } from "../src/nickname.ts";

async function finishRound(page: Page) {
  await page.clock.runFor(3100);
  for (let i = 0; i < 240; i++) {
    await page.clock.runFor(500);
    if ((await page.locator("#phase-title").textContent()) === "飛行結束")
      break;
  }
  await expect(page.locator("#phase-title")).toHaveText("飛行結束");
}

test("entry validates, previews the suffix and remembers only a valid original nickname", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const input = page.getByLabel("飛行暱稱", { exact: true });
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#phase-title")).toHaveText("等待起飛");
  for (const invalid of ["Bad Name", "A".repeat(13), "😀", "<img>"]) {
    await input.fill(invalid);
    await input.press("Enter");
    await expect(page.locator("#nickname-error")).toBeVisible();
  }
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      NICKNAME_STORAGE_KEY,
    ),
  ).toBeNull();
  await input.fill(" Ace_pc ");
  await expect(page.locator("#nickname-preview")).toHaveText(
    "顯示名稱：Ace_pc_pc",
  );
  await input.press("ArrowLeft");
  await expect(page.locator("#phase-title")).toHaveText("等待起飛");
  await input.press("Enter");
  await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  await expect(page.locator("#round-pilot")).toHaveText("Ace_pc_pc");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      NICKNAME_STORAGE_KEY,
    ),
  ).toEqual({ version: 1, nickname: "Ace_pc" });
  await page.reload();
  await expect(input).toHaveValue("Ace_pc");
  await expect(page.locator("#phase-title")).toHaveText("等待起飛");
});

test("editing for a new round keeps the previous name fixed and cancel restores it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByLabel("飛行暱稱", { exact: true }).fill("First");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await finishRound(page);
  await page.getByRole("button", { name: "修改暱稱" }).click();
  await page.getByLabel("飛行暱稱", { exact: true }).fill("Second");
  await expect(page.locator("#nickname-preview")).toHaveText(
    "顯示名稱：Second_pc",
  );
  await expect(page.locator("#round-pilot")).toHaveText("First_pc");
  await page.getByRole("button", { name: "返回結算" }).click();
  await page.getByRole("button", { name: "再飛一次" }).click();
  await expect(page.locator("#round-pilot")).toHaveText("First_pc");
  await finishRound(page);
  await page.getByRole("button", { name: "修改暱稱" }).click();
  await page.getByLabel("飛行暱稱", { exact: true }).fill("新名字_mb");
  await page.getByRole("button", { name: "確認並起飛" }).click();
  await expect(page.locator("#round-pilot")).toHaveText("新名字_mb_pc");
  await expect(page.locator("#survival-time")).toHaveText("0.0");
  await page.keyboard.press("Escape");
  await expect(page.locator("#round-pilot")).toHaveText("新名字_mb_pc");
});

test("corrupt and obsolete local data is ignored without starting a round", async ({
  page,
}) => {
  await page.goto("/");
  for (const raw of [
    "broken",
    '{"version":2,"nickname":"Ace"}',
    '{"version":1,"nickname":"Bad Name"}',
  ]) {
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: NICKNAME_STORAGE_KEY,
      raw,
    });
    await page.reload();
    await expect(page.getByLabel("飛行暱稱", { exact: true })).toHaveValue("");
    await expect(page.locator("#phase-title")).toHaveText("等待起飛");
  }
});

test("blocked storage still allows a valid round and reports the memory failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#storage-note")).toBeVisible();
  await page.getByLabel("飛行暱稱", { exact: true }).fill("訪客");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await expect(page.locator("#round-pilot")).toHaveText("訪客_pc");
  await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  await expect(page.locator("#storage-note")).toHaveText(
    "無法記住暱稱，仍可正常遊玩。",
  );
  expect(errors).toEqual([]);
});

test.describe("mobile nickname entry", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 640, height: 360 },
  });

  test("joystick validates the name and saved names retain mobile mode across rotation", async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/");
    const box = (await page.locator("#joystick").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("#nickname-error")).toBeVisible();
    await expect(page.locator("#phase-title")).toHaveText("等待起飛");
    await page.getByLabel("飛行暱稱", { exact: true }).fill("Ace_mb");
    await page.getByRole("button", { name: "開始飛行" }).click();
    await expect(page.locator("#round-pilot")).toHaveText("Ace_mb_mb");
    await page.reload();
    await expect(page.getByLabel("飛行暱稱", { exact: true })).toHaveValue(
      "Ace_mb",
    );
    const control = page.locator("#joystick");
    const savedBox = (await control.boundingBox())!;
    await page.mouse.click(
      savedBox.x + savedBox.width / 2,
      savedBox.y + savedBox.height / 2,
    );
    await expect(page.locator("#phase-title")).toHaveText("倒數 3");
    await page.setViewportSize({ width: 360, height: 640 });
    await expect(page.locator("#phase-title")).toHaveText("已暫停");
    await expect(page.locator("#round-pilot")).toHaveText("Ace_mb_mb");
    await page.setViewportSize({ width: 640, height: 360 });
    await page.getByRole("button", { name: "繼續飛行" }).click();
    await expect(page.locator("#round-pilot")).toHaveText("Ace_mb_mb");
  });

  test("a reduced viewport can scroll the focused entry form to its start button", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("飛行暱稱", { exact: true }).fill("玩家");
    await page.setViewportSize({ width: 640, height: 200 });
    const action = page.getByRole("button", { name: "開始飛行" });
    await action.scrollIntoViewIfNeeded();
    const box = (await action.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(200);
    await action.click();
    await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  });
});

test("a write quota failure keeps the remembered name and does not block a new one", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "king-of-flak.nickname",
      JSON.stringify({ version: 1, nickname: "Saved" }),
    );
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await expect(page.getByLabel("飛行暱稱", { exact: true })).toHaveValue(
    "Saved",
  );
  await expect(page.locator("#storage-note")).toBeHidden();
  await page.getByLabel("飛行暱稱", { exact: true }).fill("New");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await expect(page.locator("#round-pilot")).toHaveText("New_pc");
  await expect(page.locator("#storage-note")).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).nickname,
      NICKNAME_STORAGE_KEY,
    ),
  ).toBe("Saved");
});
