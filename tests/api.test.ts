import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import type { RankedScore } from "../src/leaderboard.ts";

const cli = join(process.cwd(), "node_modules/wrangler/bin/wrangler.js");
const remote = process.env.FLAK_TEST_API_URL;
if (remote && !new URL(remote).hostname.startsWith("king-of-flak-scores-test."))
  throw new Error("Use only the isolated test Worker");
const base = remote ?? "http://127.0.0.1:8790";
const origin = "http://127.0.0.1:5174";
const headers = { Origin: origin, "Content-Type": "application/json" };
const score = (changes: Record<string, unknown> = {}) => ({
  roundId: crypto.randomUUID(),
  nickname: "同名",
  mode: "pc",
  scoreTenths: 100,
  ...changes,
});
const post = (body: unknown, ip = crypto.randomUUID()) =>
  fetch(`${base}/scores`, {
    method: "POST",
    headers: remote ? headers : { ...headers, "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
const list = async (): Promise<RankedScore[]> =>
  (await fetch(`${base}/scores`, { headers })).json();

test("D1 schema resolves equal score and full timestamp ties by stable ID", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("server/migrations/0001_scores.sql", "utf8"));
  const insert = db.prepare("INSERT INTO scores VALUES (?,?,?,?,?,?)");
  for (const [id, at] of [
    ["b", "2026-01-01T00:00:00.002Z"],
    ["c", "2026-01-01T00:00:00.001Z"],
    ["a", "2026-01-01T00:00:00.001Z"],
  ])
    insert.run(id, id, "Same", "pc", 100, at);
  assert.deepEqual(
    db
      .prepare(
        "SELECT id FROM scores ORDER BY score_tenths DESC,received_at ASC,id ASC LIMIT 20",
      )
      .all()
      .map((row) => row.id),
    ["a", "c", "b"],
  );
  db.close();
});

test(
  "real Worker and persistent D1 implement the shared leaderboard API",
  { timeout: 180000 },
  async (t) => {
    const state = mkdtempSync(join(tmpdir(), "flak-d1-"));
    const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
    let worker: ReturnType<typeof spawn> | undefined;
    let log = "";
    const start = async () => {
      if (remote) return;
      worker = spawn(
        process.execPath,
        [
          cli,
          "dev",
          "--env",
          "local",
          "--ip",
          "127.0.0.1",
          "--port",
          "8790",
          "--var",
          "ALLOWED_ORIGINS:http://127.0.0.1:5174,http://127.0.0.1:8791",
          "--persist-to",
          state,
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      worker.stdout?.on("data", (v) => {
        log += v;
      });
      worker.stderr?.on("data", (v) => {
        log += v;
      });
      for (let i = 0; i < 200; i++) {
        if (worker.exitCode !== null) throw new Error(log);
        try {
          if ((await fetch(`${base}/scores`, { headers })).ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(log);
    };
    const stop = async () => {
      if (worker && worker.exitCode === null) {
        worker.kill("SIGTERM");
        await once(worker, "exit");
      }
    };
    try {
      if (!remote)
        execFileSync(
          process.execPath,
          [
            cli,
            "d1",
            "migrations",
            "apply",
            "king-of-flak-scores-local",
            "--local",
            "--env",
            "local",
            "--persist-to",
            state,
          ],
          { env, stdio: "pipe" },
        );
      await start();
      await t.test(
        "empty board, CORS, mutation protection and bounded payload",
        async () => {
          assert.deepEqual(await list(), []);
          assert.equal((await fetch(`${base}/scores`)).status, 200);
          assert.equal(
            (
              await fetch(`${base}/scores`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(score()),
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await fetch(`${base}/scores`, {
                headers: { Origin: "https://evil.example" },
              })
            ).status,
            403,
          );
          assert.equal(
            (await fetch(`${base}/scores`, { method: "DELETE", headers }))
              .status,
            405,
          );
          const cors = await fetch(`${base}/scores`, {
            method: "OPTIONS",
            headers,
          });
          assert.equal(cors.status, 204);
          assert.equal(cors.headers.get("Access-Control-Allow-Origin"), origin);
          assert.equal(
            (
              await fetch(`${base}/scores`, {
                method: "POST",
                headers,
                body: "x".repeat(1025),
              })
            ).status,
            413,
          );
          assert.equal(
            (
              await fetch(`${base}/scores`, {
                method: "POST",
                headers,
                body: "broken",
              })
            ).status,
            400,
          );
          assert.equal((await post(score({ scoreTenths: 0.5 }))).status, 400);
          assert.equal((await post(score({ receivedAt: "fake" }))).status, 400);
          assert.equal((await post(score({ nickname: "😀" }))).status, 400);
        },
      );
      await t.test(
        "concurrent same-round retries are idempotent and conflicting content is rejected",
        async () => {
          const body = score();
          const responses = await Promise.all(
            Array.from({ length: 5 }, () => post(body)),
          );
          assert.equal(responses.filter((r) => r.status === 201).length, 1);
          const saved = await Promise.all(responses.map((r) => r.json()));
          for (const row of saved) assert.deepEqual(row, saved[0]);
          assert.equal((await post({ ...body, mode: "mb" })).status, 409);
          const retry = await post(body);
          assert.deepEqual(await retry.json(), saved[0]);
          assert.equal((await list()).length, 1);
          assert.equal(
            (await post({ ...body, roundId: crypto.randomUUID() })).status,
            201,
          );
          assert.equal((await list()).length, 2);
        },
      );
      await t.test(
        "same-origin independent desktop and mobile browser contexts share D1 rows",
        async () => {
          const gameUrl = "http://127.0.0.1:8791";
          const frontend = spawn(
            process.execPath,
            [
              "node_modules/vite/bin/vite.js",
              "--host",
              "127.0.0.1",
              "--port",
              "8791",
              "--strictPort",
            ],
            {
              env: { ...process.env, VITE_LEADERBOARD_URL: base },
              stdio: "ignore",
            },
          );
          for (let i = 0; i < 100; i++) {
            try {
              if ((await fetch(gameUrl)).ok) break;
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          const browser = await chromium.launch({ channel: "chrome" });
          try {
            const desktop = await browser.newContext();
            const mobile = await browser.newContext({
              hasTouch: true,
              isMobile: true,
              viewport: { width: 640, height: 360 },
            });
            for (const [context, mode] of [
              [desktop, "pc"],
              [mobile, "mb"],
            ] as const) {
              const page = await context.newPage();
              const errors: string[] = [];
              page.on("console", (m) => {
                if (m.type() === "error") errors.push(m.text());
              });
              await page.addInitScript(() => {
                Math.random = () => 0;
              });
              await page.clock.install();
              await page.goto(gameUrl);
              await page.getByLabel("飛行暱稱", { exact: true }).fill("雙裝置");
              await page
                .getByRole("button", { name: "開始飛行", exact: true })
                .click();
              assert.equal(
                await page.locator("#round-pilot").textContent(),
                `雙裝置_${mode}`,
              );
              assert.equal(
                (await list()).filter((row) => row.nickname === "雙裝置")
                  .length,
                mode === "pc" ? 0 : 1,
              );
              const submission = page.waitForResponse(
                (r) =>
                  r.url() === `${base}/scores` &&
                  r.request().method() === "POST",
              );
              for (let i = 0; i < 300; i++) {
                await page.clock.runFor(500);
                if (
                  (await page.locator("#phase-title").textContent()) ===
                  "飛行結束"
                )
                  break;
              }
              assert.equal((await submission).status(), 201, errors.join("\n"));
              const record = (await list()).find(
                (row) => row.nickname === "雙裝置" && row.mode === mode,
              )!;
              assert.equal(
                record.scoreTenths / 10,
                Number(await page.locator("#survival-time").textContent()),
              );
            }
            const boards = [];
            for (const context of [desktop, mobile])
              boards.push(
                await context
                  .pages()[0]
                  .evaluate(
                    async (base) => (await fetch(`${base}/scores`)).json(),
                    base,
                  ),
              );
            assert.deepEqual(boards[0], boards[1]);
            assert.equal(
              boards[0].filter((row: RankedScore) => row.nickname === "雙裝置")
                .length,
              2,
            );
          } finally {
            await browser.close();
            frontend.kill("SIGTERM");
            await once(frontend, "exit");
          }
        },
      );
      await t.test(
        "ranking returns exactly twenty independent rows ordered by tenths then server time and ID",
        { skip: Boolean(remote) },
        async () => {
          for (let i = 0; i < 22; i++)
            assert.equal(
              (await post(score({ scoreTenths: 1000 + i }))).status,
              201,
            );
          const board = await list();
          assert.equal(board.length, 20);
          assert.deepEqual(
            board.map((r) => r.scoreTenths),
            Array.from({ length: 20 }, (_, i) => 1021 - i),
          );
          assert.ok(
            board.every(
              (r) => r.receivedAt.endsWith("Z") && r.id !== r.roundId,
            ),
          );
          assert.equal(
            (await post(score({ scoreTenths: Number.MAX_SAFE_INTEGER })))
              .status,
            201,
          );
          assert.equal((await list())[0].scoreTenths, Number.MAX_SAFE_INTEGER);
        },
      );
      await t.test(
        "twenty new submissions per IP minute, then 429; old retries retain their result",
        { skip: Boolean(remote) },
        async () => {
          const ip = crypto.randomUUID();
          const original = score();
          assert.equal((await post(original, ip)).status, 201);
          for (let i = 1; i < 20; i++)
            assert.equal((await post(score(), ip)).status, 201);
          const rejected = await post(score(), ip);
          assert.equal(rejected.status, 429);
          assert.ok(Number(rejected.headers.get("Retry-After")) > 0);
          assert.equal((await post(original, ip)).status, 200);
        },
      );
      await t.test(
        "restarting the Worker retains the same sorted records and server timestamps",
        { skip: Boolean(remote) },
        async () => {
          const before = await list();
          await stop();
          await start();
          assert.deepEqual(await list(), before);
        },
      );
    } finally {
      await stop();
      rmSync(state, { recursive: true, force: true });
    }
  },
);
