import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

const api = "https://scores.test/scores";
const row = {
  roundId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  id: "record",
  nickname: "玩家",
  mode: "mb",
  scoreTenths: 123,
  receivedAt: "2026-01-01T16:01:00.000Z",
};
async function ready(
  page: Page,
  handler: (route: Route) => Promise<void>,
  configured = true,
) {
  await page.route("**/src/main.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replaceAll(
        "import.meta.env.VITE_LEADERBOARD_URL",
        configured ? '"https://scores.test"' : "undefined",
      ),
    });
  });
  await page.route(api, handler);
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByLabel("飛行暱稱", { exact: true }).fill("測試");
  await page.getByRole("button", { name: "開始飛行", exact: true }).click();
}
async function finish(page: Page) {
  for (let i = 0; i < 300; i++) {
    await page.clock.runFor(500);
    if ((await page.locator("#phase-title").textContent()) === "飛行結束")
      break;
  }
  await expect(page.locator("#phase-title")).toHaveText("飛行結束");
}
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

test("result submits once then displays at most twenty records in Taipei time", async ({
  page,
}) => {
  const methods: string[] = [];
  await ready(page, async (route) => {
    methods.push(route.request().method());
    await json(
      route,
      route.request().method() === "POST"
        ? row
        : Array.from({ length: 21 }, () => row),
    );
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toHaveText("本局成績已上傳。");
  await expect(page.locator("#board-rows tr")).toHaveCount(20);
  await expect(page.locator("#board-rows tr").first()).toContainText("玩家_mb");
  await expect(page.locator("#board-rows tr").first()).toContainText(
    "2026/01/02 00:01",
  );
  expect(methods).toEqual(["POST", "GET"]);
  await page.screenshot({
    path: "test-results/leaderboard-desktop.png",
    fullPage: true,
  });
  const time = await page.locator("#survival-time").textContent();
  await page.clock.runFor(10000);
  await expect(page.locator("#survival-time")).toHaveText(time!);
  expect(methods).toEqual(["POST", "GET"]);
});

test("a rejected upload can read an empty board and retry never submits again", async ({
  page,
}) => {
  const methods: string[] = [];
  await ready(page, async (route) => {
    methods.push(route.request().method());
    await json(
      route,
      route.request().method() === "POST" ? { error: "rate_limited" } : [],
      route.request().method() === "POST" ? 429 : 200,
    );
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toContainText("未上傳");
  await expect(page.locator("#board-status")).toHaveText("尚無紀錄");
  await page.getByRole("button", { name: "重新讀榜" }).click();
  await expect(page.locator("#board-status")).toHaveText("尚無紀錄");
  expect(methods).toEqual(["POST", "GET", "GET"]);
});

test("lost submission response stays uncertain even when reading succeeds", async ({
  page,
}) => {
  await ready(page, async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await json(route, [row]);
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toHaveText("成績上傳狀態未確認");
  await expect(page.locator("#board-rows tr")).toHaveCount(1);
});

test("offline and service failures are distinct and retries cannot overlap", async ({
  page,
}) => {
  let gets = 0;
  let release: (() => void) | undefined;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") return json(route, row);
    gets++;
    if (gets === 1) return route.abort();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await json(route, { error: "down" }, 503);
  });
  await finish(page);
  await expect(page.locator("#board-status")).toHaveText(
    "離線，無法抓取排行榜",
  );
  await page.getByRole("button", { name: "重新讀榜" }).click();
  await expect(page.getByRole("button", { name: "重新讀榜" })).toBeDisabled();
  expect(gets).toBe(2);
  release!();
  await expect(page.locator("#board-status")).toHaveText("排行榜暫時無法使用");
  await expect(page.getByRole("button", { name: "再飛一次" })).toBeVisible();
});

test("five-second upload timeout still reads and late response cannot overwrite a replay", async ({
  page,
}) => {
  let delayed: Route | undefined;
  let gets = 0;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") {
      delayed = route;
      return;
    }
    gets++;
    await json(route, [row]);
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toHaveText("上傳本局成績中…");
  await page.clock.runFor(5100);
  await expect(page.locator("#upload-status")).toHaveText("成績上傳狀態未確認");
  await expect(page.locator("#board-rows tr")).toHaveCount(1);
  expect(gets).toBe(1);
  await page.getByRole("button", { name: "再飛一次" }).click();
  await expect(page.locator("#leaderboard")).toBeHidden();
  await json(delayed!, row).catch(() => {});
  await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  await expect(page.locator("#leaderboard")).toBeHidden();
});

test("pending read cannot update an edited or restarted round", async ({
  page,
}) => {
  let pending: Route | undefined;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") await json(route, row);
    else pending = route;
  });
  await finish(page);
  await expect(page.locator("#board-status")).toHaveText("讀取排行榜中…");
  await page.getByRole("button", { name: "修改暱稱" }).click();
  await json(pending!, [row]);
  await expect(page.locator("#leaderboard")).toBeHidden();
  await expect(page.locator("#board-rows tr")).toHaveCount(0);
});

test.describe("touch result", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 640, height: 360 },
  });
  test("scrolling the board leaves replay reachable and remote markup is rejected", async ({
    page,
  }) => {
    await ready(page, async (route) =>
      json(
        route,
        route.request().method() === "POST"
          ? row
          : [{ ...row, nickname: "<img src=x onerror=alert(1)>" }],
      ),
    );
    await finish(page);
    await expect(page.locator("#board-status")).toHaveText(
      "排行榜暫時無法使用",
    );
    await expect(page.locator("#board-rows img")).toHaveCount(0);
    await page
      .getByRole("button", { name: "再飛一次" })
      .scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "再飛一次" }).click();
    await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  });
});

test("reading times out after five seconds and keeps replay available", async ({
  page,
}) => {
  await ready(page, async (route) => {
    if (route.request().method() === "POST") await json(route, row);
  });
  await finish(page);
  await expect(page.locator("#board-status")).toHaveText("讀取排行榜中…");
  await page.clock.runFor(5100);
  await expect(page.locator("#board-status")).toHaveText(
    "離線，無法抓取排行榜",
    { timeout: 7000 },
  );
  await expect(page.getByRole("button", { name: "重新讀榜" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "再飛一次" })).toBeVisible();
});

test("a late successful upload cannot reopen the board or start a read after replay", async ({
  page,
}) => {
  let pending: Route | undefined;
  let gets = 0;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") pending = route;
    else {
      gets++;
      await json(route, []);
    }
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toHaveText("上傳本局成績中…");
  await page.getByRole("button", { name: "再飛一次" }).click();
  await json(pending!, row);
  await expect(page.locator("#leaderboard")).toBeHidden();
  await expect(page.locator("#upload-status")).toHaveText("");
  expect(gets).toBe(0);
});

test("missing service configuration is explicit instead of silently skipping upload", async ({
  page,
}) => {
  await ready(
    page,
    async () => {
      throw new Error("Unexpected request");
    },
    false,
  );
  await finish(page);
  await expect(page.locator("#upload-status")).toHaveText(
    "未設定成績服務，本局未上傳。",
  );
  await expect(page.getByRole("button", { name: "重新讀榜" })).toBeDisabled();
});

test.describe("mobile full board", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 640, height: 360 },
  });
  test("twenty rows scroll inside the sidebar and replay remains reachable", async ({
    page,
  }) => {
    await ready(page, async (route) =>
      json(
        route,
        route.request().method() === "POST"
          ? row
          : Array.from({ length: 20 }, () => row),
      ),
    );
    await finish(page);
    await expect(page.locator("#board-rows tr")).toHaveCount(20);
    const scroll = page.locator(".board-scroll");
    expect(
      await scroll.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await scroll.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/leaderboard-mobile.png" });
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page
      .getByRole("button", { name: "再飛一次" })
      .scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "再飛一次" }).click();
    await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  });
});
