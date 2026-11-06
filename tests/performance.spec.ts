import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { platform, release, cpus } from "node:os";
import type { Game } from "../src/game.ts";

test("160 bullets at maximum speed remain responsive for ten real minutes", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(660_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/game.ts*", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    expect(body).toContain("bulletSpeed: 40");
    expect(body).toContain("spawnBullets(game, 40, random)");
    expect(body).toContain(
      "export function advance(game, seconds, random = Math.random) {",
    );
    body = body
      .replace("bulletSpeed: 40", "bulletSpeed: 240")
      .replaceAll(
        "spawnBullets(game, 40, random)",
        "spawnBullets(game, 160, random)",
      )
      .replace(
        "export function advance(game, seconds, random = Math.random) {",
        "export function advance(game, seconds, random = Math.random) { globalThis.__flakGame = game;",
      );
    await route.fulfill({ response, body });
  });
  await page.route("**/src/collision.ts*", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    expect(body).toContain("export function firstContact(");
    // Keep collision computation in the workload; suppress death only in this intercepted test module.
    body = body.replace(
      "export function firstContact(",
      "function measuredFirstContact(",
    );
    body +=
      "\nexport function firstContact(...args) { measuredFirstContact(...args); return null; }\n";
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "開始飛行" }).click();
  await expect(page.locator("#phase-title")).toHaveText("飛行中", {
    timeout: 10_000,
  });
  await expect(page.locator("#bullet-count")).toHaveText("160");
  const samples = await page.evaluate(
    () =>
      new Promise<{
        durationMs: number;
        frames: number;
        averageFps: number;
        p95FrameMs: number;
        maxFrameMs: number;
        framesOver50ms: number;
        violations: number;
        elapsed: number;
      }>((resolve) => {
        const start = performance.now();
        let previous = start;
        const intervals: number[] = [];
        let violations = 0;
        function sample(now: number) {
          intervals.push(now - previous);
          previous = now;
          const game = (globalThis as unknown as { __flakGame: Game })
            .__flakGame;
          if (
            game.phase !== "playing" ||
            game.bullets.length !== 160 ||
            game.bulletSpeed !== 240 ||
            game.bullets.some(
              (b) =>
                b.x < 2 - 1e-6 ||
                b.x > 798 + 1e-6 ||
                b.y < 2 - 1e-6 ||
                b.y > 598 + 1e-6,
            )
          )
            violations++;
          if (now - start < 600_000) {
            requestAnimationFrame(sample);
            return;
          }
          intervals.sort((a, b) => a - b);
          resolve({
            durationMs: now - start,
            frames: intervals.length,
            averageFps: (intervals.length * 1000) / (now - start),
            p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
            maxFrameMs: intervals[intervals.length - 1],
            framesOver50ms: intervals.filter((ms) => ms > 50).length,
            violations,
            elapsed: game.elapsed,
          });
        }
        requestAnimationFrame(sample);
      }),
  );
  const before = await page.evaluate(
    () => (globalThis as unknown as { __flakGame: Game }).__flakGame.player.x,
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.up("ArrowRight");
  const after = await page.evaluate(
    () => (globalThis as unknown as { __flakGame: Game }).__flakGame.player.x,
  );
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    engine: testInfo.project.name,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model,
    viewport: page.viewportSize(),
    mode: "headless desktop; test-only death suppression with collision computation retained",
    ...samples,
    inputMoved: after > before,
    runtimeErrors: errors,
  };
  await writeFile(
    testInfo.outputPath("performance.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  await page.screenshot({ path: testInfo.outputPath("performance.png") });
  expect(samples.durationMs).toBeGreaterThanOrEqual(600_000);
  expect(samples.violations).toBe(0);
  expect(errors).toEqual([]);
  expect(after).toBeGreaterThan(before);
});
