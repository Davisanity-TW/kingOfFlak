import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

const api = "https://scores.test/scores*";
const row = {
  roundId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  id: "record",
  nickname: "玩家",
  mode: "pc",
  scoreTenths: 123,
  receivedAt: "2026-01-01T16:01:00.000Z",
};
async function ready(
  page: Page,
  handler: (route: Route) => Promise<void>,
  configured = true,
  start = true,
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
  if (!start) return;
  await page.getByLabel("飛行暱稱", { exact: true }).fill("測試");
  await page.getByRole("button", { name: "開始飛行", exact: true }).click();
}
async function finish(page: Page, open = true) {
  for (let i = 0; i < 300; i++) {
    await page.clock.runFor(500);
    if ((await page.locator("#phase-title").textContent()) === "飛行結束")
      break;
  }
  await expect(page.locator("#phase-title")).toHaveText("飛行結束");
  await expect(page.locator("#leaderboard")).not.toBeVisible();
  if (open) await page.locator("#result-board").click();
}
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

test("result submits once then displays at most fifty records in Taipei time", async ({
  page,
}) => {
  const methods: string[] = [];
  await ready(page, async (route) => {
    methods.push(route.request().method());
    await json(
      route,
      route.request().method() === "POST"
        ? row
        : Array.from({ length: 51 }, () => row),
    );
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toContainText("本局曾收錄");
  await expect(page.locator("#board-rows tr")).toHaveCount(50);
  await expect(page.locator("#board-rows tr").first()).toContainText("玩家");
  await expect(page.locator("#board-rows tr").first()).toContainText(
    "2026/01/02 00:01",
  );
  expect(methods[0]).toBe("POST");
  expect(methods.filter((m) => m === "POST")).toHaveLength(1);
  await page.screenshot({
    path: "test-results/leaderboard-desktop.png",
    fullPage: true,
  });
  const time = await page.locator("#survival-time").textContent();
  await page.clock.runFor(10000);
  await expect(page.locator("#survival-time")).toHaveText(time!);
  expect(methods[0]).toBe("POST");
  expect(methods.filter((m) => m === "POST")).toHaveLength(1);
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
  expect(methods.filter((m) => m === "POST")).toHaveLength(1);
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
  await finish(page, false);
  await expect(page.locator("#board-status")).toHaveText(
    "離線，無法抓取排行榜",
  );
  await page.locator("#result-board").click();
  await expect(page.getByRole("button", { name: "重新讀榜" })).toBeDisabled();
  expect(gets).toBe(2);
  release!();
  await expect(page.locator("#board-status")).toHaveText("排行榜暫時無法使用");
  await expect(page.locator("#replay-board")).toBeVisible();
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
  expect(gets).toBeGreaterThanOrEqual(1);
  await page.locator("#replay-board").click();
  await expect(page.locator("#leaderboard")).toBeHidden();
  await json(delayed!, row).catch(() => {});
  await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  await expect(page.locator("#leaderboard")).toBeHidden();
});

test("pending read cannot update a restarted round", async ({ page }) => {
  let pending: Route | undefined;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") await json(route, row);
    else pending = route;
  });
  await finish(page);
  await expect(page.locator("#board-status")).toHaveText("讀取排行榜中…");
  await page.locator("#replay-board").click();
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
    await page.locator("#replay-board").scrollIntoViewIfNeeded();
    await page.locator("#replay-board").click();
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
  await expect(page.locator("#replay-board")).toBeVisible();
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
  await page.locator("#replay-board").click();
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
  test("fifty rows scroll inside the popup and replay remains reachable", async ({
    page,
  }) => {
    await ready(page, async (route) =>
      json(
        route,
        route.request().method() === "POST"
          ? row
          : Array.from({ length: 50 }, () => ({ ...row, mode: "mb" })),
      ),
    );
    await finish(page);
    await expect(page.locator("#board-rows tr")).toHaveCount(50);
    const scroll = page.locator(".board-scroll");
    expect(
      await scroll.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await scroll.scrollIntoViewIfNeeded();
    await page.locator("#leaderboard").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: "test-results/leaderboard-mobile.png" });
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.locator("#replay-board").scrollIntoViewIfNeeded();
    await page.locator("#replay-board").click();
    await expect(page.locator("#phase-title")).toHaveText("倒數 3");
  });
});

test("before flight opens read-only modal and all return paths preserve the draft", async ({
  page,
}) => {
  let posts = 0;
  let gets = 0;
  await ready(
    page,
    async (route) => {
      if (route.request().method() === "POST") posts++;
      else gets++;
      await json(route, []);
    },
    true,
    false,
  );
  await page.locator("#nickname").fill("草稿");
  for (const exit of ["back", "escape", "background"]) {
    await page.locator("#entry-board").click();
    await expect(page.locator("#board-status")).toHaveText("尚無紀錄");
    await expect(page.locator("#round-summary")).toBeHidden();
    await expect(page.locator("#replay-board")).toBeHidden();
    await page.locator("#leaderboard-title").click();
    await expect(page.locator("#leaderboard")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    if (exit === "back") await page.locator("#back-board").click();
    if (exit === "escape") await page.keyboard.press("Escape");
    if (exit === "background") await page.mouse.click(2, 2);
    await expect(page.locator("#leaderboard")).not.toBeVisible();
    await expect(page.locator("#entry-board")).toBeFocused();
    await expect(page.locator("#nickname")).toHaveValue("草稿");
    await expect(page.locator("#phase-title")).toHaveText("等待起飛");
  }
  expect(posts).toBe(0);
  expect(gets).toBe(3);
});

test("exact round confirms a lost upload, highlights only this run and loses badge when displaced", async ({
  page,
}) => {
  let saved: Record<string, unknown> = {};
  let displaced = false;
  let posts = 0;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      saved = route.request().postDataJSON();
      return route.abort();
    }
    await json(
      route,
      displaced
        ? [row]
        : [
            { ...row, ...saved, roundId: row.roundId },
            { ...row, ...saved },
          ],
    );
  });
  await finish(page, false);
  await expect(page.locator("#result-board")).toContainText("新入榜");
  await expect(page.locator("#new-record")).toBeVisible();
  await expect(page.locator("#new-record")).toHaveText("New Record");
  await expect(page.locator("#new-record")).toHaveCSS(
    "color",
    "rgb(255, 107, 107)",
  );
  await expect(page.locator("#new-record")).toHaveCSS(
    "animation-name",
    "record-blink",
  );
  await page.screenshot({ path: "test-results/new-record.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#new-record")).toHaveCSS("animation-name", "none");
  await page.locator("#result-board").click();
  await expect(page.locator("#upload-status")).toHaveText(
    "本局成績已收錄 · 新入榜",
  );
  await expect(page.locator("tr.current-round")).toHaveCount(1);
  await expect(page.locator("#round-summary")).toContainText("測試");
  await page.locator("#back-board").click();
  await page.locator("#edit-nickname").click();
  await page.locator("#nickname").fill("下一局");
  displaced = true;
  await page.locator("#entry-board").click();
  await expect(page.locator("#upload-status")).toHaveText(
    "本局曾收錄 · 目前未入前 50 名",
  );
  await expect(page.locator("#round-summary")).toContainText("測試");
  await expect(page.locator("tr.current-round")).toHaveCount(0);
  await expect(page.locator("#entry-board")).not.toContainText("新入榜");
  await expect(page.locator("#new-record")).toBeHidden();
  await page.locator("#replay-board").click();
  await expect(page.locator("#leaderboard")).not.toBeVisible();
  await expect(page.locator("#round-summary")).toHaveText("");
  await expect(page.locator("#round-pilot")).toHaveText("下一局");
  expect(posts).toBe(1);
});

test("closing during upload waits for the same submission and never reopens the popup", async ({
  page,
}) => {
  let pending: Route | undefined;
  let posts = 0;
  let gets = 0;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      pending = route;
    } else {
      gets++;
      await json(route, []);
    }
  });
  await finish(page);
  await expect(page.locator("#reload-board")).toBeDisabled();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("#leaderboard"),
      ),
    ).toBe(true);
  }
  await page.locator("#back-board").click();
  await json(pending!, row);
  await expect(page.locator("#board-status")).toHaveText("尚無紀錄");
  await expect(page.locator("#leaderboard")).not.toBeVisible();
  expect(posts).toBe(1);
  expect(gets).toBe(1);
  await page.locator("#result-board").click();
  await expect(page.locator("#board-status")).toHaveText("尚無紀錄");
  expect(gets).toBe(2);
  expect(posts).toBe(1);
});

test("a processed score outside the top fifty is explicitly not stored", async ({
  page,
}) => {
  let posts = 0;
  await ready(page, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return json(route, { stored: false });
    }
    await json(route, [row]);
  });
  await finish(page);
  await expect(page.locator("#upload-status")).toHaveText(
    "本局未入前 50 名，未收錄。",
  );
  await expect(page.locator("#round-summary")).toContainText("測試");
  await expect(page.locator("#new-record")).toBeHidden();
  await expect(page.locator("tr.current-round")).toHaveCount(0);
  await page.locator("#reload-board").click();
  await expect(page.locator("#upload-status")).toHaveText(
    "本局未入前 50 名，未收錄。",
  );
  expect(posts).toBe(1);
});

test("mode buttons isolate rows and ignore a late reply from the other board", async ({
  page,
}) => {
  let desktop: Route | undefined;
  let posts = 0;
  await ready(
    page,
    async (route) => {
      if (route.request().method() === "POST") {
        posts++;
        return json(route, row);
      }
      const mode = new URL(route.request().url()).searchParams.get("mode");
      if (mode === "pc") desktop = route;
      else await json(route, [{ ...row, mode: "mb", nickname: "手機玩家" }]);
    },
    true,
    false,
  );
  await page.locator("#entry-board").click();
  await expect(page.locator("#board-pc")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#board-mb").click();
  await expect(page.locator("#board-rows")).toContainText("手機玩家");
  await json(desktop!, [{ ...row, nickname: "電腦玩家" }]);
  await expect(page.locator("#board-rows")).not.toContainText("電腦玩家");
  await expect(page.locator("#board-mb")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(posts).toBe(0);
});

test("viewing another mode preserves this round's rank and does not append nickname suffixes", async ({
  page,
}) => {
  let saved: Record<string, unknown> = {};
  await ready(page, async (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return json(route, { ...row, ...saved });
    }
    const mode = new URL(route.request().url()).searchParams.get("mode");
    await json(
      route,
      mode === "pc"
        ? [{ ...row, ...saved }]
        : [{ ...row, mode: "mb", nickname: "同名玩家" }],
    );
  });
  await finish(page);
  await expect(page.locator("tr.current-round")).toHaveCount(1);
  await page.locator("#board-mb").click();
  await expect(page.locator("#board-rows")).toContainText("同名玩家");
  await expect(page.locator("#board-rows")).not.toContainText("同名玩家_mb");
  await expect(page.locator("tr.current-round")).toHaveCount(0);
  await expect(page.locator("#new-record")).toBeVisible();
  await expect(page.locator("#upload-status")).toContainText("新入榜");
  await expect(page.locator("#round-summary")).toContainText(
    "本局（電腦）：測試",
  );
  await page.locator("#board-pc").click();
  await expect(page.locator("tr.current-round")).toHaveCount(1);
});
